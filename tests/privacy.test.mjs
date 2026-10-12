import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../review/public/js/app.js', import.meta.url), 'utf8');
function section(first, last) {
  const start = source.indexOf(first), end = source.indexOf(last, start);
  assert.ok(start >= 0 && end > start, `Missing source section: ${first}`);
  return source.slice(start, end);
}
const helpers = ['esc', 'routePart', 'readRoutePart', 'money'].map(name => source.match(new RegExp(`^  const ${name} =.*$`, 'm'))[0]).join('\n');
const privateKeys = ['orders', 'activity', 'session', 'users', 'heldBills'].map(key => 'cm2.' + key);

function persistenceHarness() {
  const backing = new Map(privateKeys.map(key => [key, JSON.stringify([{ customer: 'Synthetic private fixture', password: 'not-a-real-password' }])]));
  backing.set('cm2.cart', JSON.stringify([{ id: 1, qty: 2 }]));
  const reads = [], writes = [], removes = [];
  const context = vm.createContext({
    localStorage: {
      getItem(key) { reads.push(key); return backing.get(key) ?? null; },
      setItem(key, value) { writes.push(key); backing.set(key, value); },
      removeItem(key) { removes.push(key); backing.delete(key); },
    },
  });
  vm.runInContext(section('  /* ---------------- persistence ---------------- */', '  /* Merge fine-grained'), context);
  vm.runInContext(`
    const cmSettings = {};
    let heldBills = [], posCart = [];
    const checkoutState = { step: 1, data: {}, touched: {} };
    const calls = [];
    const stopFeed = () => calls.push('stopFeed');
    const firebaseReady = () => false;
    const accountUI = () => calls.push('accountUI');
    const toast = () => {};
    const route = () => calls.push('route');
    const IS_ADMIN_HOST = true;
    const location = { hash: '#/staff' };
  `, context);
  vm.runInContext(section('  const logout =', '  const STAFF_MENU_HTML ='), context);
  return { context, backing, reads, writes, removes };
}

test('initialization discards private legacy caches without reading their records', () => {
  const h = persistenceHarness();
  for (const key of privateKeys) {
    assert.equal(h.backing.has(key), false);
    assert.equal(h.reads.includes(key), false, `${key} must not be read`);
  }
  assert.equal(vm.runInContext('orders.length + activity.length + Object.keys(users).length', h.context), 0);
  assert.equal(vm.runInContext('cart[0].qty', h.context), 2);
});

test('routine saves persist cart preferences without copying private records back to storage', () => {
  const h = persistenceHarness();
  vm.runInContext(`
    orders = [{ id: 'synthetic-order', customer: { name: 'Private fixture' } }];
    users = { 'qa@example.test': { name: 'Private fixture' } };
    activity = [{ msg: 'Private order detail' }];
    heldBills = [{ name: 'Private fixture', phone: '9000000000' }];
    save();
  `, h.context);
  for (const key of privateKeys) assert.equal(h.writes.includes(key), false, `${key} must not be persisted`);
  assert.equal(vm.runInContext('orders.length', h.context), 1, 'Orders remain usable in current page memory');
  assert.deepEqual(JSON.parse(h.backing.get('cm2.cart')), [{ id: 1, qty: 2 }]);
  assert.ok([...h.backing.values()].every(value => !value.includes('Private fixture')));
});

test('logout stops the feed and clears private caches and checkout/POS drafts while retaining the cart', () => {
  const h = persistenceHarness();
  for (const key of privateKeys) h.backing.set(key, 'synthetic stale private value');
  vm.runInContext(`
    orders = [{ id: 'private-order' }]; users = { fixture: {} }; activity = [{ msg: 'private' }];
    heldBills = [{ name: 'Private' }]; posCart = [{ id: 1, qty: 1 }];
    checkoutState.data = { name: 'Private', phone: '9000000000' };
    checkoutState.touched = { name: true }; checkoutState.step = 3;
    logout();
  `, h.context);
  assert.equal(vm.runInContext('calls[0]', h.context), 'stopFeed');
  assert.equal(vm.runInContext('orders.length + activity.length + heldBills.length + posCart.length + Object.keys(users).length + Object.keys(checkoutState.data).length + Object.keys(checkoutState.touched).length', h.context), 0);
  assert.equal(vm.runInContext('privateDataRevision', h.context), 1);
  assert.equal(vm.runInContext('checkoutState.step', h.context), 1);
  assert.ok(vm.runInContext('calls.includes("route")', h.context));
  for (const key of privateKeys) assert.equal(h.backing.has(key), false);
  assert.deepEqual(JSON.parse(h.backing.get('cm2.cart')), [{ id: 1, qty: 2 }]);
});

test('an in-flight order response cannot repopulate private memory after logout', async () => {
  const h = persistenceHarness();
  let resolveRequest;
  h.context.fetch = () => new Promise(resolve => { resolveRequest = resolve; });
  vm.runInContext(`const PREVIEW = null; const ORDERS_API = 'local-test'; const currentUser = () => ({id:'synthetic-authenticated-fixture'});`, h.context);
  vm.runInContext(section('  const syncPull =', '  const CATALOG_API ='), h.context);
  const pending = vm.runInContext('syncPull()', h.context);
  vm.runInContext('logout()', h.context);
  resolveRequest({ json: async () => ({ ok: true, orders: [{ id: 'late-order', customer: { name: 'Private' } }] }) });
  await pending;
  assert.equal(vm.runInContext('orders.length', h.context), 0);
  assert.equal(h.backing.has('cm2.orders'), false);
});

test('an accepted order response stays in memory and is not written to browser storage', async () => {
  const h = persistenceHarness();
  h.context.fetch = async () => ({ json: async () => ({ ok: true, orders: [{ id: 'received-order', placedAt: '2026-09-26', customer: { name: 'Private' } }] }) });
  vm.runInContext(`const PREVIEW = null; const ORDERS_API = 'local-test'; const currentUser = () => ({id:'synthetic-authenticated-fixture'});`, h.context);
  vm.runInContext(section('  const syncPull =', '  const CATALOG_API ='), h.context);
  await vm.runInContext('syncPull()', h.context);
  assert.equal(vm.runInContext('orders[0].id', h.context), 'received-order');
  assert.equal(h.backing.has('cm2.orders'), false);
});

const breakout = '"><svg data-qa="unexpected">';
const quantity = '<img data-qa="unexpected" src=x>';
function orderFixture() {
  return {
    id: breakout, code: 'QA&code?part=1', email: 'qa@example.test', status: 'placed', payment: 'COD', placedAt: '2026-09-26',
    customer: { name: 'Synthetic private customer', email: 'qa@example.test', phone: '9000000000', address: 'Test address', city: 'Test city', pincode: '500001' },
    shipping: { address: 'Test address', city: 'Test city', pincode: '500001', area: '' },
    items: [{ id: 1, name: 'Synthetic item', qty: quantity, price: 10 }],
    totals: { subtotal: 10, total: 10, saving: 0 },
  };
}

function outputHarness() {
  const box = { innerHTML: '', classList: { add() {}, remove() {} } };
  const context = vm.createContext({
    URLSearchParams, orders: [orderFixture()], activity: [], users: {},
    views: { notFound: () => 'not found' },
    location: { hash: '#/track' },
    currentUser: () => ({ email: 'qa@example.test' }),
    I: { check: '', copy: '', truck: '', print: '', arrow: '', search: '', searchX: '' },
    I2: { sheet: '', user: '', box: '', bell: '' },
    STATUS_PILL: {}, STATUSES: [{ key: 'placed', label: 'Placed' }],
    STORE: { name: 'Test store', address: { line1: 'Test' }, hours: '', phones: [] },
    fmtDate: () => 'Test date', timeAgo: () => 'Just now',
    allProducts: () => [], priceOf: product => product.price,
    $: () => box,
  });
  vm.runInContext(helpers, context);
  return { context, box };
}

test('invoice and order-history output encodes quantities and preserves encoded ID round trips', () => {
  const h = outputHarness();
  vm.runInContext(section('  views.orderSuccess =', '  views.track ='), h.context);
  vm.runInContext(section('  views.myOrders =', '  const CONTENT ='), h.context);
  const invoice = vm.runInContext('views.orderSuccess({params:[routePart(orders[0].id)]})', h.context);
  assert.notEqual(invoice, 'not found');
  assert.ok(!invoice.includes(quantity));
  assert.ok(invoice.includes('&lt;img data-qa=&quot;unexpected&quot; src=x&gt;'));
  assert.ok(invoice.includes('#/track?id=' + encodeURIComponent(orderFixture().code)));
  const history = vm.runInContext('views.myOrders()', h.context);
  assert.ok(history.includes('#/order/' + encodeURIComponent(breakout)));
  assert.ok(!history.includes(breakout));
  assert.ok(!history.includes(quantity));
});

test('admin order rows, detail rows and live feed cannot break attribute or quantity contexts', () => {
  const h = outputHarness();
  vm.runInContext(section('  const orderDetailRow =', '  const toggleOrderDetail ='), h.context);
  vm.runInContext(section('  const orderRow =', '  const thumb ='), h.context);
  vm.runInContext(section('  const liveFeedHTML =', '  const topSellers ='), h.context);
  vm.runInContext('activity = [{type:"order",oid:orders[0].id,at:"2026-09-26"}]', h.context);
  for (const expression of ['orderRow(orders[0], orders[0].id)', 'liveFeedHTML()']) {
    const html = vm.runInContext(expression, h.context);
    assert.ok(!html.includes(breakout));
    assert.ok(!html.includes(quantity));
    assert.ok(html.includes('&quot;&gt;&lt;svg data-qa=&quot;unexpected&quot;&gt;'));
  }
});

test('global admin search escapes order IDs and account-email attributes', () => {
  const h = outputHarness();
  const email = `qa${breakout}@example.test`;
  h.context.users = { [email]: { name: 'Synthetic private customer' } };
  vm.runInContext(section('  const renderAdmSearch =', '  let analyticsRange ='), h.context);
  vm.runInContext('renderAdmSearch("synthetic")', h.context);
  assert.ok(h.box.innerHTML.includes('data-gs="order"'));
  assert.ok(h.box.innerHTML.includes('data-gs="user"'));
  assert.ok(!h.box.innerHTML.includes(breakout));
  assert.ok(!h.box.innerHTML.includes(email));
  assert.ok(h.box.innerHTML.includes('&lt;svg'));
});

test('public tracking keeps manual lookup without exposing recent customer/order suggestions', () => {
  const h = outputHarness();
  vm.runInContext(section('  views.track =', '  const trackRender ='), h.context);
  const html = vm.runInContext('views.track()', h.context);
  assert.ok(html.includes('id="trackForm"'));
  assert.ok(html.includes('id="trackCode"'));
  assert.ok(!html.includes('Synthetic private customer'));
  assert.ok(!html.includes(orderFixture().code));
  assert.ok(!html.includes('data-demotrack'));
});
