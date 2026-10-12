import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the shipped runtime, without a browser/server or any production IO.
// The DOM double only provides card movement; browser interaction has separate QA.
const source = readFileSync(new URL('../visual-editor/js/cms-runtime.js', import.meta.url), 'utf8');
const route = { name: 'products' };
const shop = { sort: 'featured', cats: [] };
const ids = values => Array.from(values, value => Number(value.id));
const page = orders => ({ schemaVersion: 1, id: 'products', sections: [], seo: {}, design: {}, productOrders: orders });

function runtime({ preview = false, published = null, cards = [], contextShop = shop, readPublished = null } = {}) {
  let reads = 0, moves = 0;
  const grid = {
    children: cards.map((entry, index) => ({
      dataset: { id: String(typeof entry === 'number' ? entry : entry.id) },
      hidden: typeof entry === 'number' ? false : !!entry.hidden,
      // Identity and attached handlers stand in for existing cart behavior.
      marker: 'original-card-' + index,
      cartAction() { return Number(this.dataset.id); },
      matches(selector) { return selector === '.prod-card[data-id]'; },
      get nextElementSibling() { return grid.children[grid.children.indexOf(this) + 1] || null; },
    })),
    get firstElementChild() { return this.children[0] || null; },
    insertBefore(card, before) {
      assert.ok(this.children.includes(card), 'Runtime must move an existing card, never manufacture product cards');
      this.children.splice(this.children.indexOf(card), 1);
      const at = before ? this.children.indexOf(before) : this.children.length;
      assert.ok(at >= 0);
      this.children.splice(at, 0, card); moves++;
    },
  };
  const baseIds = grid.children.map(card => Number(card.dataset.id));
  const view = { children: [], firstElementChild: null };
  const document = {
    title: 'Isolated product-order test',
    head: { querySelector: () => null, appendChild: () => {} },
    querySelector: selector => selector === '#view' ? view : null,
    querySelectorAll: selector => selector === '#view .shop-layout .shop-main .prod-grid' ? [grid] : [],
    createElement: () => ({ textContent: '' }),
    dispatchEvent: () => {},
  };
  const window = { CM_EDITOR_PREVIEW: preview, CMStorefront: {
    ready: async () => {},
    productContext: () => ({ route, shop: contextShop, ids: baseIds }),
  } };
  const helperContext = {window};
  vm.runInNewContext(readFileSync(new URL('../visual-editor/js/cms-responsive.js', import.meta.url),'utf8'), helperContext);
  vm.runInNewContext(source, {
    window, document, URL, console,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    fetch: async () => {
      const read = ++reads;
      return { ok: true, json: async () => ({ published: readPublished ? await readPublished(read) : published }) };
    },
  });
  return { api: window.CMCms, grid, reads: () => reads, moves: () => moves };
}

test('All Products ordering preserves actual product objects and unknown products append stably', () => {
  const { api } = runtime();
  const products = Object.freeze([1, 2, 3, 4, 5].map(id => Object.freeze({ id, price: id * 10, stock: 7, sku: 'CM-' + id })));
  const ordered = api.orderProducts(products, shop, route, page({ all: [9999, 3, 1] }));
  assert.deepEqual(ids(ordered), [3, 1, 2, 4, 5]);
  assert.deepEqual(ids(products), [1, 2, 3, 4, 5]);
  for (const product of ordered) assert.equal(product, products.find(original => original.id === product.id));
});

test('category orders are independent and never inherit All Products order', () => {
  const { api } = runtime(), products = [1, 2, 3].map(id => ({ id }));
  const doc = page({ all: [3, 2, 1], rockets: [2, 1, 3], sparklers: [] });
  assert.deepEqual(ids(api.orderProducts(products, { ...shop, cats: ['rockets'] }, route, doc)), [2, 1, 3]);
  assert.deepEqual(ids(api.orderProducts(products, { ...shop, cats: ['sparklers'] }, route, doc)), [1, 2, 3]);
  assert.deepEqual(ids(api.orderProducts(products, { ...shop, cats: ['fancy'] }, route, doc)), [1, 2, 3]);
  assert.deepEqual(doc.productOrders.all, [3, 2, 1]);
});

test('customer sorts, multi-category filters and non-shop pages retain their original ordering', () => {
  const { api } = runtime(), products = [1, 2, 3].map(id => ({ id })), doc = page({ all: [3, 2, 1], rockets: [3, 2, 1] });
  for (const sort of ['price-asc', 'price-desc', 'newest', 'name']) assert.equal(api.orderProducts(products, { ...shop, sort }, route, doc), products);
  assert.equal(api.orderProducts(products, { ...shop, cats: ['rockets', 'sparklers'] }, route, doc), products);
  assert.equal(api.orderProducts(products, shop, { name: 'home' }, doc), products);
  assert.equal(api.orderProducts(products, shop, { name: 'product' }, doc), products);
});

test('filtered lists retain membership and duplicate or obsolete saved references never manufacture products', () => {
  const { api } = runtime(), subset = [{ id: 2 }, { id: 5 }, { id: 3 }];
  const ordered = api.orderProducts(subset, shop, route, page({ all: [9999, 3, 3, 1, 2] }));
  assert.deepEqual(ids(ordered), [3, 2, 5]);
  assert.equal(new Set(ordered).size, subset.length);
  assert.ok(ordered.every(product => subset.includes(product)));
});

test('preview uses its loaded draft and never fetches a public order', async () => {
  const fixture = runtime({ preview: true });
  await fixture.api.afterRoute(route);
  fixture.api.apply(page({ all: [2, 1, 3] }));
  assert.deepEqual(ids(fixture.api.orderProducts([{ id: 1 }, { id: 2 }, { id: 3 }], shop, route)), [2, 1, 3]);
  assert.equal(fixture.reads(), 0);
});

test('visitor rendering uses the published document and never the editor draft cache', async () => {
  const fixture = runtime({ published: page({ all: [3, 1, 2] }) });
  await fixture.api.afterRoute(route);
  fixture.api.apply(page({ all: [2, 1, 3] }));
  assert.deepEqual(ids(fixture.api.orderProducts([{ id: 1 }, { id: 2 }, { id: 3 }], shop, route)), [3, 1, 2]);
  assert.equal(fixture.reads(), 1);
});

test('revisiting the shop revalidates its publication and clearing it restores canonical order', async () => {
  let published = page({ all: [3, 1, 2] });
  const fixture = runtime({ cards: [1, 2, 3], readPublished: () => published });
  const products = [1, 2, 3].map(id => ({ id }));
  await fixture.api.afterRoute(route);
  assert.deepEqual(ids(fixture.api.orderProducts(products, shop, route)), [3, 1, 2]);

  published = page({ all: [2, 3, 1] });
  fixture.api.beforeRoute();
  assert.deepEqual(ids(fixture.api.orderProducts(products, shop, route)), [3, 1, 2], 'The cached publication remains usable while revalidation starts');
  await fixture.api.afterRoute(route);
  assert.equal(fixture.reads(), 2);
  assert.deepEqual(ids(fixture.api.orderProducts(products, shop, route)), [2, 3, 1]);
  assert.deepEqual(fixture.grid.children.map(card => Number(card.dataset.id)), [2, 3, 1]);

  published = null;
  fixture.api.beforeRoute();
  await fixture.api.afterRoute(route);
  assert.equal(fixture.reads(), 3);
  assert.deepEqual(ids(fixture.api.orderProducts(products, shop, route)), [1, 2, 3]);
  assert.deepEqual(fixture.grid.children.map(card => Number(card.dataset.id)), [1, 2, 3]);
});

test('an initially unpublished shop picks up its first publication on revisit', async () => {
  let published = null;
  const fixture = runtime({ cards: [1, 2, 3], readPublished: () => published });
  await fixture.api.afterRoute(route);
  published = page({ all: [3, 2, 1] });
  fixture.api.beforeRoute();
  await fixture.api.afterRoute(route);
  assert.equal(fixture.reads(), 2, 'A cached null publication must be revalidated');
  assert.deepEqual(fixture.grid.children.map(card => Number(card.dataset.id)), [3, 2, 1]);
});

test('an older pending publication response cannot overwrite a newer route or its cached order', async () => {
  let releaseOld;
  const oldResponse = new Promise(resolve => { releaseOld = resolve; });
  const fixture = runtime({ cards: [1, 2, 3], readPublished: read => read === 1 ? oldResponse : page({ all: [2, 3, 1] }) });
  const products = [1, 2, 3].map(id => ({ id }));
  const olderRoute = fixture.api.afterRoute(route);
  await Promise.resolve();
  fixture.api.beforeRoute();
  await fixture.api.afterRoute(route);
  assert.equal(fixture.reads(), 2);
  assert.deepEqual(fixture.grid.children.map(card => Number(card.dataset.id)), [2, 3, 1]);

  releaseOld(page({ all: [3, 1, 2] }));
  await olderRoute;
  assert.deepEqual(ids(fixture.api.orderProducts(products, shop, route)), [2, 3, 1], 'The old response must not poison the publication cache');
  assert.deepEqual(fixture.grid.children.map(card => Number(card.dataset.id)), [2, 3, 1], 'The old response must not repaint the current grid');
});

test('applying an order moves existing DOM cards, preserves cart handlers and is idempotent', async () => {
  const fixture = runtime({ preview: true, cards: [1, 2, 3, 4] });
  const originals = new Map(fixture.grid.children.map(card => [Number(card.dataset.id), card]));
  await fixture.api.afterRoute(route);
  fixture.api.apply(page({ all: [4, 2, 1, 3] }));
  assert.deepEqual(fixture.grid.children.map(card => Number(card.dataset.id)), [4, 2, 1, 3]);
  for (const card of fixture.grid.children) {
    assert.equal(card, originals.get(Number(card.dataset.id)));
    assert.equal(card.cartAction(), Number(card.dataset.id));
  }
  const moved = fixture.moves(); fixture.api.apply(page({ all: [4, 2, 1, 3] }));
  assert.equal(fixture.moves(), moved, 'Unchanged order must not churn the product DOM');
});

test('DOM ordering retains the visible count by position when a card grid has a cutoff', async () => {
  const fixture = runtime({ published: page({ all: [4, 1, 2, 3] }), cards: [{ id: 1 }, { id: 2 }, { id: 3, hidden: true }, { id: 4, hidden: true }] });
  await fixture.api.afterRoute(route);
  assert.deepEqual(fixture.grid.children.map(card => Number(card.dataset.id)), [4, 1, 2, 3]);
  assert.deepEqual(fixture.grid.children.filter(card => !card.hidden).map(card => Number(card.dataset.id)), [4, 1]);
});

test('clearing an order returns DOM cards to the canonical filtered order', async () => {
  const fixture = runtime({ preview: true, cards: [1, 2, 3, 4] });
  await fixture.api.afterRoute(route);
  fixture.api.apply(page({ all: [4, 3, 2, 1] }));
  fixture.api.apply(page({ all: [] }));
  assert.deepEqual(fixture.grid.children.map(card => Number(card.dataset.id)), [1, 2, 3, 4]);
});


test('Home product sections reuse ordering with independent scopes and original product objects', () => {
  const {api}=runtime(), products=[1,2,3].map(id=>({id,stock:10,price:id*50}));
  const doc={schemaVersion:1,id:'home',sections:[],productOrders:{'section:home:arrivals':[3,1,2],'section:home:best':[2,3,1],all:[1,3,2]}};
  const ordered=api.orderProducts(products,{...shop,sectionId:'home:arrivals'},{name:'home'},doc);
  assert.deepEqual(ids(ordered),[3,1,2]);
  assert.equal(ordered[0],products[2]);
  assert.deepEqual(ids(api.orderProducts(products,{...shop,sectionId:'home:best'},{name:'home'},doc)),[2,3,1]);
  assert.deepEqual(ids(api.orderProducts(products,{...shop,sectionId:'home:unknown'},{name:'home'},doc)),[1,2,3]);
  assert.deepEqual(ids(api.orderProducts(products,shop,route,doc)),[1,3,2]);
});
