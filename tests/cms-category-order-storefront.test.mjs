import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* Focused unit coverage for the saved-category-order bridge:
   - the storefront hook mirrors cms-runtime's applyCategoryOrder semantics
   - repeated deliveries are idempotent and unknown data never changes order
   - cms-runtime waits for the hook when scripts load in either order. */

const appSource = readFileSync(new URL('../audit-evidence/production-release/js/app.js', import.meta.url), 'utf8');
const runtimeSource = readFileSync(new URL('../visual-editor/js/cms-runtime.js', import.meta.url), 'utf8');
const seed = JSON.parse(readFileSync(new URL('../audit-evidence/production-release/js/products-data.js', import.meta.url), 'utf8').match(/window\.CM_DATA\s*=\s*(\{[^]*\})\s*;?\s*$/)[1]);
const canonical = seed.categories.map(category => category.id);
assert.equal(canonical.length, 11);

function slice(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker), end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start > 0 && end > start, `Missing ${startMarker} block`);
  return source.slice(start, end);
}

/* ---- storefront hook (audit-evidence/production-release/js/app.js) ---- */

function storefront() {
  const cats = canonical.map(id => ({ id, name: id.toUpperCase() }));
  const context = vm.createContext({
    CATS: cats, CATS_CANONICAL: cats.slice(), CAT_MAP:Object.fromEntries(cats.map(c=>[c.id,c])),
    window: {}, document: { activeElement: null }, currentRoute: null,
    $: () => null, $$: () => [],
    esc: value => String(value),
    catPath: id => '/category/' + id, catHash: id => '#/products?cat=' + id,
    catIcon: () => '', PRODUCTS: [],
  });
  vm.runInContext(slice(appSource, '  /* CM_CATEGORY_ORDER_RUNTIME', '  /* END_CM_CATEGORY_ORDER_RUNTIME */'), context);
  vm.runInContext(slice(appSource, '  const applyCategoryCatalog =', '  const syncCatalogPush =')+'\nwindow.applyCategoryCatalog=applyCategoryCatalog;',context);
  return {
    order: () => context.window.CMGetCategoryOrder(),
    apply: ids => context.window.CMApplyCategoryOrder(ids),
    catalog: cats => context.window.applyCategoryCatalog(cats),
  };
}

test('saved order survives a category arriving after the initial feed',()=>{
  const f=storefront();
  f.apply(['new-category',canonical[2],canonical[0]]);
  f.catalog([...canonical.map(id=>({id,name:id})),{id:'new-category',name:'New category'},{id:'unranked',name:'Unranked'}]);
  assert.deepEqual(f.order().slice(0,3),['new-category',canonical[2],canonical[0]]);
  assert.equal(f.order().at(-1),'unranked');
});

test('CMApplyCategoryOrder mirrors the runtime semantics and drops unknown or duplicate ids', () => {
  const f = storefront();
  const saved = [canonical[2], canonical[0], 'missing-category', canonical[2], 7, null];
  assert.equal(f.apply(saved), true);
  const tail = canonical.filter((id, index) => index !== 0 && index !== 2);
  assert.deepEqual(f.order(), [canonical[2], canonical[0], ...tail]);
  assert.equal(f.apply(saved), false, 'reapplying the same order must not touch the DOM again');
  const partial = [canonical[5]];
  assert.equal(f.apply(partial), true);
  assert.deepEqual(f.order(), [canonical[5], ...canonical.filter((id, index) => index !== 5)]);
});

test('an explicit empty order restores the canonical order and invalid payloads are ignored', () => {
  const f = storefront();
  assert.equal(f.apply([...canonical].reverse()), true);
  assert.notDeepEqual(f.order(), canonical);
  assert.equal(f.apply([]), true, 'the saved reset is applied');
  assert.deepEqual(f.order(), canonical);
  const stable = f.order();
  for (const value of [null, undefined, 'sparklers', 42, {}, canonical.map(id => ({ id }))]) assert.equal(f.apply(value), false);
  assert.deepEqual(f.order(), stable);
});

/* ---- runtime forwarding (visual-editor/js/cms-runtime.js) ---- */

function runtimeBridge() {
  const context = vm.createContext({ window: {} });
  vm.runInContext(slice(runtimeSource, '  /* CM_CATEGORY_ORDER_FORWARD', '  /* END_CM_CATEGORY_ORDER_FORWARD */'), context);
  const calls = [];
  return {
    calls,
    attach: () => { context.window.CMApplyCategoryOrder = order => { calls.push(JSON.parse(JSON.stringify(order))); return true; }; },
    forward: documentData => context.forwardCategoryOrder(documentData),
    flush: () => context.flushCategoryOrder(),
  };
}

/* `order` is the canonical root field. `sectionOrder` only fills the old section
   slot, so a stale value there can be proven to lose. */
const homeDocument = (order, sectionOrder) => ({
  schemaVersion: 1, id: 'home',
  ...(order === undefined ? {} : { categoryOrder: order }),
  sections: [{ id: 'home:shop-categories', type: 'native', source: 'home:shop-categories', content: sectionOrder === undefined ? { heading: 'Shop by Categories' } : { heading: 'Shop by Categories', categoryOrder: sectionOrder } }],
});

test('the runtime stashes the order until the storefront hook exists, then delivers it once', () => {
  const bridge = runtimeBridge();
  bridge.forward(homeDocument(['sparklers', 'gift-boxes']));
  assert.equal(bridge.calls.length, 0, 'no hook yet');
  bridge.attach();
  bridge.flush();
  assert.deepEqual(bridge.calls, [['sparklers', 'gift-boxes']]);
  bridge.flush();
  assert.equal(bridge.calls.length, 1, 'the pending order is not redelivered');
});

test('repeated deliveries are deduplicated but a changed order is always forwarded', () => {
  const bridge = runtimeBridge(); bridge.attach();
  bridge.forward(homeDocument(['sparklers', 'gift-boxes']));
  bridge.forward(homeDocument(['sparklers', 'gift-boxes']));
  assert.equal(bridge.calls.length, 1);
  bridge.forward(homeDocument(['gift-boxes', 'sparklers']));
  assert.equal(bridge.calls.length, 2);
  assert.deepEqual(bridge.calls[1], ['gift-boxes', 'sparklers']);
});

test('missing or invalid order metadata is ignored while an explicit empty reset is forwarded', () => {
  const bridge = runtimeBridge(); bridge.attach();
  bridge.forward(homeDocument(undefined));
  bridge.forward(homeDocument(undefined, 'not-an-array'));
  bridge.forward(homeDocument('not-an-array'));
  bridge.forward(null);
  bridge.forward({ schemaVersion: 1, id: 'home' });
  assert.equal(bridge.calls.length, 0);
  bridge.forward(homeDocument([]));
  assert.deepEqual(bridge.calls, [[]]);
  // The order is global to the Home document, so an unrelated section cannot
  // veto it, and another page's document can never contribute one.
  bridge.forward({ schemaVersion: 1, id: 'home', categoryOrder: ['gift-boxes'], sections: [{ id: 'products:shop-layout', type: 'native', source: 'products:shop-layout', content: { categoryOrder: ['rockets'] } }] });
  assert.deepEqual(bridge.calls[1], ['gift-boxes']);
  const other = runtimeBridge(); other.attach();
  other.forward({ schemaVersion: 1, id: 'products', categoryOrder: ['sparklers'], sections: [] });
  other.forward({ schemaVersion: 1, id: 'about', sections: [{ id: 'about:content', type: 'native', source: 'about:content', content: { categoryOrder: ['rockets'] } }] });
  assert.equal(other.calls.length, 0, 'only the Home document owns a category order');
});

test('the forwarded order is the global root value and never a stale section value', () => {
  const bridge = runtimeBridge(); bridge.attach();
  bridge.forward(homeDocument(['gift-boxes', 'sparklers'], ['sparklers', 'gift-boxes']));
  assert.deepEqual(bridge.calls, [['gift-boxes', 'sparklers']], 'the root field wins');
  const legacy = runtimeBridge(); legacy.attach();
  legacy.forward(homeDocument(undefined, ['sparklers', 'gift-boxes']));
  assert.deepEqual(legacy.calls, [['sparklers', 'gift-boxes']], 'older drafts still resolve');
});
