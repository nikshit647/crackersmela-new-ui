import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const source = fs.readFileSync('audit-evidence/production-release/js/app.js', 'utf8');
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, start);
  return source.slice(a, b);
}
function orderHarness() {
  const state = { calls: [], fail: true, cartSaved: 0 };
  const canonical = { id: 'server-order', code: 'CM-SERVER', status: 'placed', totals: { total: 3000 }, items: [], customer: {}, shipping: {}, log: [] };
  const c = vm.createContext({ crypto: webcrypto, console, state, canonical, Promise });
  vm.runInContext(`
    const ORDERS_API='orders-api.php', EMAIL_API='email-api.php';
    let cart=[{id:1,qty:2}],orders=[], checkoutCoupon={code:null};
    const prodById=id=>id===1?{stock:4,inStock:true}:null;
    const stockOf=p=>p.stock, inStockOf=p=>p.inStock;
    const toast=()=>{},save=()=>state.cartSaved++,cartUI=()=>{},trackPurchaseOnce=()=>{};
    const apiJSON=async(url,payload)=>{state.calls.push({url,payload});if(state.fail)throw new Error('Synthetic transport failure');return {ok:true,order:canonical};};
  `, c);
  vm.runInContext(section('  let orderAttempt =', '  const syncUpdateStatus ='), c);
  return { c, state, canonical };
}
test('failed checkout preserves cart, success displays the server order', async () => {
  const { c, state } = orderHarness();
  assert.equal(await vm.runInContext("placeOrder({name:'Fixture'}, {}, 'COD')", c), null);
  assert.equal(vm.runInContext('cart.length', c), 1);
  assert.equal(vm.runInContext('orders.length', c), 0);
  state.fail = false;
  const order = await vm.runInContext("placeOrder({name:'Fixture'}, {}, 'COD')", c);
  assert.equal(order.id, 'server-order');
  assert.equal(order.totals.total, 3000);
  assert.equal(vm.runInContext('cart.length', c), 0);
  assert.equal(state.calls[0].payload.requestId, state.calls[1].payload.requestId, 'A transport retry retains its idempotency key');
  assert.deepEqual(Array.from(state.calls[1].payload.order.items, x => Object.keys(x).sort()), [['id', 'qty']]);
});
test('a changed cart gets a different request identifier after failure', async () => {
  const { c, state } = orderHarness();
  await vm.runInContext("placeOrder({}, {}, 'COD')", c);
  vm.runInContext('cart[0].qty=3', c);
  await vm.runInContext("placeOrder({}, {}, 'COD')", c);
  assert.notEqual(state.calls[0].payload.requestId, state.calls[1].payload.requestId);
});
test('missing products and excessive quantity are rejected before transport', async () => {
  const { c, state } = orderHarness();
  vm.runInContext('cart=[{id:999,qty:1}]', c);
  assert.equal(await vm.runInContext("placeOrder({}, {}, 'COD')", c), null);
  vm.runInContext('cart=[{id:1,qty:9}]', c);
  assert.equal(await vm.runInContext("placeOrder({}, {}, 'COD')", c), null);
  assert.equal(state.calls.length, 0);
});
test('forged browser users do not authenticate the production client', () => {
  const c = vm.createContext({});
  vm.runInContext(`const users={owner:{role:'admin',tok:'forged'}},session={email:'owner',tok:'forged'};let authenticatedUser=null;`, c);
  vm.runInContext(source.match(/^  const currentUser =.*$/m)[0], c);
  assert.equal(vm.runInContext('currentUser()', c), null);
  assert.doesNotMatch(source, /CM_SYNC_KEY|authUnavailable|const DEMO|OWNER_EMAIL|window\.CM_PREVIEW/);
});
test('order reads replace the prior cache and perform no write reconciliation', async () => {
  const c = vm.createContext({ Promise });
  vm.runInContext(`const IS_ADMIN_HOST=false;let privateDataRevision=0,orders=[{id:'untrusted-local'}];const ORDERS_API='orders';let calls=0;const apiJSON=async()=>{calls++;return {ok:true,orders:[]};};`, c);
  vm.runInContext(section('  let orderPullPending =', '  const CATALOG_API ='), c);
  await vm.runInContext('Promise.all([syncPull(),syncPull()])', c);
  assert.equal(vm.runInContext('calls', c), 1);
  assert.equal(vm.runInContext('orders.length', c), 0);
});
test('a response from a signed-out identity cannot restore private orders', async () => {
  let resolve;
  const pending = new Promise(r => { resolve = r; });
  const c = vm.createContext({ pending, Promise });
  vm.runInContext(`const IS_ADMIN_HOST=false;let privateDataRevision=0,orders=[];const ORDERS_API='orders';const apiJSON=()=>pending;`, c);
  vm.runInContext(section('  let orderPullPending =', '  const CATALOG_API ='), c);
  const request = vm.runInContext('syncPull()', c);
  vm.runInContext('privateDataRevision++', c);
  resolve({ ok: true, orders: [{ id: 'stale', customer: {}, shipping: {}, items: [], totals: {}, log: [] }] });
  await request;
  assert.equal(vm.runInContext('orders.length', c), 0);
});
test('HTTP errors cannot be interpreted as saved changes', async () => {
  const c = vm.createContext({ fetch: async () => ({ ok: false, status: 500, json: async () => ({ ok: true }) }) });
  vm.runInContext(`const IS_ADMIN_HOST=false;let privateDataRevision=0,csrfToken='synthetic',csrfPending=null;`, c);
  vm.runInContext(section('  const authError =', '  const setIdentity ='), c);
  await assert.rejects(vm.runInContext("apiJSON('orders',{a:'create'})", c), /could not be completed/);
});
test('protected requests send the session cookie and CSRF header', async () => {
  let captured;
  const c = vm.createContext({ fetch: async (_url, options) => { captured = options; return { ok: true, status: 200, json: async () => ({ ok: true }) }; } });
  vm.runInContext(`const IS_ADMIN_HOST=false;let privateDataRevision=0,csrfToken='synthetic-csrf',csrfPending=null;`, c);
  vm.runInContext(section('  const authError =', '  const setIdentity ='), c);
  await vm.runInContext("apiJSON('products',{a:'push'})", c);
  assert.equal(captured.credentials, 'same-origin');
  assert.equal(captured.headers['X-CSRF-Token'], 'synthetic-csrf');
});
test('rendered image URLs stay data and product routes encode attribute delimiters', () => {
  const c = vm.createContext({ URL, location: { href: 'https://crackersmela.com/', origin: 'https://crackersmela.com' }, document: { addEventListener() {} }, CAT_MAP: {}, catLabel: () => ({ id: 'fancy' }), catIcon: () => '<svg></svg>' });
  vm.runInContext([source.match(/^  const esc =.*$/m)[0],source.match(/^  const clamp =.*$/m)[0], section('  /* Product image rendering keeps', '  const slugOf =')].join('\n'), c);
  const markup = vm.runInContext(`imgOf({image:'images/products/x\" onerror=\"x',shortName:'<Fixture>'})`, c);
  assert.doesNotMatch(markup, /\sonerror="/);
  assert.match(markup, /&quot;/);
  assert.match(source, /prodUrl = p => publicRoute\('#\/product\/' \+ routePart\(slugOf\(p\)\)\)/);
});
