import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../review/public/js/app.js', import.meta.url), 'utf8');
function section(start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `Missing source section: ${start}`);
  return source.slice(a, b);
}
function cartContext() {
  const context = vm.createContext({ console, Number, Math, Date, Promise });
  vm.runInContext(`
    const product = { id: 1, sku: 'QA', shortName: 'Local fixture', image: '', price: 1500, compareAt: 1600, stock: 3, inStock: true };
    let cart = [], orders = [], checkoutCoupon = { code: null, discount: 0 };
    const messages = [];
    const prodById = id => Number(id) === 1 ? product : null;
    const inStockOf = p => p.inStock && p.stock > 0;
    const stockOf = p => p.stock;
    const priceOf = p => p.price;
    const clamp = (n,a,b) => Math.min(b, Math.max(a,n));
    const money = n => String(n);
    const toast = msg => messages.push(msg);
    const save = () => {};
    const cartUI = () => {};
    const bumpBadge = () => {};
    const $ = () => null;
    const trackEcommerce = () => {};
    const syncCartFoot = () => {};
    const renderCartPageIfVisible = () => {};
    const STORE = { minOrder: 2500 };
    const uid = () => 'QA-ORDER';
    const orderCode = () => 'QA-CODE';
    const trackPurchaseOnce = () => {};
    const ORDERS_API = 'orders-api.php';
    const CM_SYNC_KEY = '';
    let response = { ok: false, json: async () => ({ ok: true }) };
    let requests = 0;
    const fetch = async () => { requests++; return response; };
  `, context);
  vm.runInContext(section('  const cartTotals =', '  const removeLine ='), context);
  vm.runInContext(section('  const placeOrder =', '  const syncUpdateStatus ='), context);
  return context;
}
test('cart enforces actual stock and rejects fractional quantities', () => {
  const c = cartContext();
  vm.runInContext('addToCart(1, 2); addToCart(1, 10); addToCart(1, 0.5)', c);
  assert.equal(vm.runInContext('cart[0].qty', c), 3);
  vm.runInContext('setQty(1, 8)', c);
  assert.equal(vm.runInContext('cart[0].qty', c), 3);
  vm.runInContext('product.stock = 0; setQty(1, 1)', c);
  assert.equal(vm.runInContext('cart.length', c), 0);
});
test('cart reports whether an addition succeeded so a rejected add cannot show success', () => {
  const c = cartContext();
  assert.equal(vm.runInContext('addToCart(1, 3)', c), true);
  assert.equal(vm.runInContext('addToCart(1, 1)', c), false);
  assert.equal(vm.runInContext('addToCart(1, 0.5)', c), false);
  assert.equal(vm.runInContext('addToCart(999, 1)', c), false);
});
test('checkout returns to cart before rendering a product removed from the catalog', () => {
  const c = vm.createContext({});
  vm.runInContext(`const views = {}; const cart = [{id:999,qty:1}]; const messages = []; const prodById = () => null; const toast = message => messages.push(message);`, c);
  vm.runInContext(section('  views.checkout =', '  const checkoutStepHTML ='), c);
  assert.equal(vm.runInContext('views.checkout()', c), 'location.#/cart');
  assert.match(vm.runInContext('messages[0]', c), /no longer available/);
});
test('failed HTTP order response never clears cart or creates a success record', async () => {
  const c = cartContext();
  vm.runInContext('addToCart(1, 2)', c);
  assert.equal(await vm.runInContext("placeOrder({email:'qa@example.test'}, {}, 'cod')", c), null);
  assert.equal(vm.runInContext('cart[0].qty', c), 2);
  assert.equal(vm.runInContext('orders.length', c), 0);
  assert.match(vm.runInContext('messages.at(-1)', c), /cart is saved/);
});
test('network failure preserves cart, and acknowledged order has no invented shipping events', async () => {
  const c = cartContext();
  vm.runInContext('addToCart(1, 2); response = { ok: true, json: async () => { throw new Error("invalid response"); } }', c);
  assert.equal(await vm.runInContext('placeOrder({}, {}, "cod")', c), null);
  assert.equal(vm.runInContext('cart.length', c), 1);
  vm.runInContext('response = { ok: true, json: async () => ({ ok: true }) }', c);
  const order = await vm.runInContext('placeOrder({}, {}, "cod")', c);
  assert.equal(order.status, 'placed');
  assert.deepEqual(Array.from(order.log, event => event.status), ['placed']);
  assert.equal(vm.runInContext('cart.length', c), 0);
});
test('checkout refuses removed or insufficient-stock products before network I/O', async () => {
  const c = cartContext();
  vm.runInContext('cart = [{id:999,qty:2}]', c);
  assert.equal(await vm.runInContext('placeOrder({}, {}, "cod")', c), null);
  assert.equal(vm.runInContext('requests', c), 0);
  vm.runInContext('cart = [{id:1,qty:4}]', c);
  assert.equal(await vm.runInContext('placeOrder({}, {}, "cod")', c), null);
  assert.equal(vm.runInContext('requests', c), 0);
});
test('forged browser roles cannot authenticate the recovered client', () => {
  const c = vm.createContext({});
  vm.runInContext(`const PREVIEW = null; const session = {email:'owner',tok:'forged'}; const users = {owner:{role:'admin',tok:'forged'}};`, c);
  vm.runInContext(section('  const currentUser =', '  /* Analytics adapter:'), c);
  assert.equal(vm.runInContext('currentUser()', c), null);
});
test('registration and login fail honestly while the authentication backend is missing', async () => {
  const c = vm.createContext({});
  vm.runInContext(section('  const authUnavailable =', '  const logout ='), c);
  const login = await vm.runInContext('login("qa@example.test", "local-only")', c);
  const register = await vm.runInContext('register("QA", "qa@example.test", "local-only")', c);
  assert.equal(login.ok, false);
  assert.equal(register.ok, false);
  assert.match(login.error, /server has not been connected/);
});
test('checkout email is required: empty/blank blocked, malformed rejected, valid accepted', () => {
  const c = vm.createContext({});
  vm.runInContext('const cart = [{id:1,qty:1}]; const views = {};', c);
  vm.runInContext(section('  const checkoutValidate =', '  views.checkout ='), c);
  vm.runInContext("const state = {step:1,touched:{},data:{name:'Local Test',phone:'9000000000',email:'',address:'Local test address',city:'Hyderabad',pincode:'500001'}}", c);
  assert.deepEqual(Array.from(vm.runInContext('checkoutValidate(state)', c)), ['Email is required']);
  vm.runInContext("state.data.email = '   '", c);
  assert.deepEqual(Array.from(vm.runInContext('checkoutValidate(state)', c)), ['Email is required']);
  for (const bad of ['invalid', 'a@b', '@x.com', 'a b@x.com']) {
    vm.runInContext(`state.data.email = ${JSON.stringify(bad)}`, c);
    assert.deepEqual(Array.from(vm.runInContext('checkoutValidate(state)', c)), ['Please enter a valid email address'], bad);
  }
  vm.runInContext("state.data.email = 'customer@example.com'", c);
  assert.equal(vm.runInContext('checkoutValidate(state).length', c), 0);
});
test('checkout email field is labelled required and no longer optional', () => {
  assert.match(source, /<label for="ck_email">Email <span class="req">\*<\/span><\/label>/);
  assert.doesNotMatch(source, /Your email \(optional\)/);
});
