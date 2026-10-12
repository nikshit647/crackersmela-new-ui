import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../review/public/js/app.js', import.meta.url), 'utf8');
function section(first, last) {
  const a = source.indexOf(first), b = source.indexOf(last, a);
  assert.ok(a >= 0 && b > a, first);
  return source.slice(a, b);
}

test('admin dismissal binds once and operates on current search and popup elements after rerender', () => {
  const listeners = [];
  let elements = {};
  const context = { document: { addEventListener: (type, fn) => listeners.push({ type, fn }) }, $: key => elements[key] };
  vm.runInNewContext(section('  let adminDismissBound =', '  const wireAdmin =') + '\nglobalThis.bind = bindAdminDismiss;', context);
  for (let i = 0; i < 10; i++) context.bind();
  assert.equal(listeners.length, 1);
  assert.equal(listeners[0].type, 'click');
  const oldSearch = { innerHTML: 'old results', classList: { remove() {} } };
  elements = { '#admSearchBox': oldSearch };
  // Replace the panel before the already-bound listener runs.
  const newSearch = { innerHTML: 'new results', classList: { remove() {} } };
  const popupTarget = { closest: () => null };
  const buttonTarget = { closest: () => null };
  const popup = { hidden: false, contains: target => target === popupTarget };
  elements = { '#admSearchBox': newSearch, '#posHeldPop': popup, '#posHeld': { contains: target => target === buttonTarget } };
  listeners[0].fn({ target: popupTarget });
  assert.equal(popup.hidden, false);
  listeners[0].fn({ target: buttonTarget });
  assert.equal(popup.hidden, false);
  listeners[0].fn({ target: { closest: () => null } });
  assert.equal(popup.hidden, true);
  assert.equal(newSearch.innerHTML, '');
  assert.equal(oldSearch.innerHTML, 'old results');
  newSearch.innerHTML = 'keep while searching';
  listeners[0].fn({ target: { closest: selector => selector === '.at-search' ? {} : null } });
  assert.equal(newSearch.innerHTML, 'keep while searching');
});

test('default price filter and slider expand when a later catalog introduces a more expensive product', () => {
  const products = [{ id: 1, price: 400, cats: [], salesCount: 1 }];
  const context = {
    URLSearchParams, allProducts: () => [...products], priceOf: p => p.price,
    CAT_MAP: {}, CATS: [], I: { close: '' }, money: String, esc: String,
    featuredOf: () => false, discountOf: () => 0, inStockOf: () => true,
  };
  vm.runInNewContext(source.match(/^  const clamp =.*$/m)[0] + '\n' + section('  const PRICE_FLOOR =', '  views.products =') + '\nglobalThis.api = { shopState, filterShop, filterSidebar, shopHash };', context);
  const before = context.api.shopState({ query: '' });
  assert.equal(before.max, 500);
  products.push({ id: 2, price: 9250, cats: [], salesCount: 0 });
  const after = context.api.shopState({ query: '' });
  assert.equal(after.max, 9300);
  assert.equal(context.api.filterShop(after).length, 2);
  assert.match(context.api.filterSidebar(after, products), /id="rangeMax" min="0" max="9300"/);
  assert.equal(context.api.shopHash(after), '#/products');
  const explicit = context.api.shopState({ query: 'max=500' });
  assert.equal(explicit.max, 500);
  assert.equal(context.api.filterShop(explicit).length, 1);
  products.length = 0;
  assert.equal(context.api.shopState({ query: '' }).max, 500);
});

test('visible stock labels use the same effective stock and availability as buying controls', () => {
  const stockOverrides = { 1: 2 };
  const context = { stockOverrides };
  vm.runInNewContext(section('  const stockOf =', '  const saved =') + section('  const stockLine =', '  const stars =') + '\nglobalThis.stockLine = stockLine;', context);
  const product = { id: 1, stock: 100, inStock: true };
  assert.match(context.stockLine(product), /Only 2 left/);
  stockOverrides[1] = 0;
  assert.match(context.stockLine(product), /Out of stock/);
  stockOverrides[1] = 20;
  assert.match(context.stockLine(product), /In stock/);
  product.inStock = false;
  assert.match(context.stockLine(product), /Out of stock/);
});
