import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../visual-editor/js/cms-runtime.js', import.meta.url), 'utf8');
const forwardStart = source.indexOf('  /* CM_CATEGORY_ORDER_FORWARD');
const forwardEnd = source.indexOf('  /* END_CM_CATEGORY_ORDER_FORWARD */', forwardStart);
const start = source.indexOf('  function categoryCardId(');
const end = source.indexOf('  function applyProductOrder(', start);
assert.ok(forwardStart > 0 && forwardEnd > forwardStart, 'Category-order forwarding is part of the shipped CMS runtime');
assert.ok(start > 0 && end > start, 'Category ordering is part of the shipped CMS runtime');

/* One resolver, two readers: the home grid and the storefront hook must both
   read the document root first and only fall back to an older section value. */
function fixture(ids = ['gift-boxes', 'kids-special', 'sparklers', 'rockets']) {
  const state = { categoryOrders: new WeakMap() }, context = vm.createContext({state, window:{}});
  vm.runInContext(source.slice(forwardStart, forwardEnd + '  /* END_CM_CATEGORY_ORDER_FORWARD */'.length), context);
  vm.runInContext(source.slice(start, end), context);
  let moves = 0;
  const grid = {
    children: [],
    get firstElementChild() { return this.children[0] || null; },
    insertBefore(card, before) {
      assert.ok(this.children.includes(card), 'Only existing category cards may move');
      this.children.splice(this.children.indexOf(card), 1);
      this.children.splice(before ? this.children.indexOf(before) : this.children.length, 0, card);
      moves++;
    },
  };
  grid.children = ids.map((id, index) => ({
    dataset: {categoryId:id}, href:'#/products?cat='+id, name:id, count:index+7,
    cmsElement:'e1.'+index, styles:{color:'category-'+id},
    matches: selector => selector === '.home-category-card',
    querySelector: () => null,
    get nextElementSibling() { return grid.children[grid.children.indexOf(this)+1] || null; },
  }));
  const instance = {node:{querySelector: selector => selector === '.home-category-grid' ? grid : null}};
  const section = {type:'native',source:'home:shop-categories',content:{}};
  /* `order` sets the canonical document root. `sectionOrder` sets the legacy
     section value only, so a stale one can be proven to lose. */
  const apply = ({order, sectionOrder, ...overrides} = {}) => {
    context.instance=instance;
    context.section={...section,...overrides};
    context.section.content=sectionOrder === undefined ? {} : {categoryOrder:sectionOrder};
    context.document=order === undefined ? {id:'home',sections:[context.section]} : {id:'home',categoryOrder:order,sections:[context.section]};
    vm.runInContext('applyCategoryOrder(instance, section, document)', context);
  };
  const forward = (order, sectionOrder) => {
    const probe={type:'native',source:'home:shop-categories',content:sectionOrder === undefined ? {} : {categoryOrder:sectionOrder}};
    context.document=order === undefined ? {id:'home',sections:[probe]} : {id:'home',categoryOrder:order,sections:[probe]};
    // Read the hook's stash directly; no storefront hook is attached in this VM.
    vm.runInContext('pendingCategoryOrder=undefined;forwardCategoryOrder(document)', context);
    return vm.runInContext('pendingCategoryOrder===undefined?undefined:pendingCategoryOrder', context);
  };
  return {grid,apply,forward,ids:()=>grid.children.map(card=>card.dataset.categoryId),moves:()=>moves};
}

test('category reorder moves the existing cards and retains links, counts, styling and CMS identities', () => {
  const f=fixture(), originals=[...f.grid.children], values=originals.map(card=>({...card}));
  f.apply({order:['sparklers','gift-boxes','rockets','kids-special']});
  assert.deepEqual(f.ids(),['sparklers','gift-boxes','rockets','kids-special']);
  for (const card of f.grid.children) {
    const index=originals.indexOf(card); assert.ok(index>=0);
    for(const key of ['href','name','count','cmsElement','styles']) assert.equal(card[key],values[index][key]);
  }
});

test('new categories append in canonical order and unknown or duplicate metadata cannot create cards', () => {
  const f=fixture();f.apply({order:['missing','sparklers','sparklers', {id:'rockets'}]});
  assert.deepEqual(f.ids(),['sparklers','gift-boxes','kids-special','rockets']);
  assert.equal(new Set(f.grid.children).size,4);
});

test('clearing category order restores the canonical grid and repeated applies do not churn nodes', () => {
  const f=fixture(), baseline=f.ids();
  const reversed=[...baseline].reverse();
  f.apply({order:reversed});
  const moved=f.moves();
  f.apply({order:reversed});assert.equal(f.moves(),moved);
  f.apply({order:[]});assert.deepEqual(f.ids(),baseline);
  f.apply({order:['rockets']});
  f.apply({});assert.deepEqual(f.ids(),baseline);
});

test('category ordering cannot affect another native section or generated content', () => {
  const f=fixture(),baseline=f.ids();
  f.apply({order:['rockets'],source:'products:shop-layout'});assert.deepEqual(f.ids(),baseline);
  f.apply({order:['rockets'],type:'productGrid'});assert.deepEqual(f.ids(),baseline);
});

test('the document root owns the order and a stale section value never wins', () => {
  const f=fixture(),baseline=f.ids();
  f.apply({order:['rockets','gift-boxes','kids-special','sparklers'],sectionOrder:['sparklers','kids-special','gift-boxes','rockets']});
  assert.deepEqual(f.ids(),['rockets','gift-boxes','kids-special','sparklers'],'the root order wins over a stale section value');
  assert.deepEqual(baseline,['gift-boxes','kids-special','sparklers','rockets']);
});

test('the forwarded order prefers the root and falls back to an older section value', () => {
  const f=fixture();
  assert.deepEqual(f.forward(['rockets','sparklers'],['sparklers','rockets']),['rockets','sparklers']);
  const legacy=fixture();
  assert.deepEqual(legacy.forward(undefined,['kids-special','sparklers']),['kids-special','sparklers']);
  const canonical=fixture();
  assert.equal(canonical.forward(undefined,undefined),undefined,'no saved order leaves the canonical order alone');
});