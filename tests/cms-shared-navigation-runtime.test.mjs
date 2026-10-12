import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../visual-editor/js/cms-runtime.js', import.meta.url), 'utf8');
const section = (id, text = id) => ({ id, source: id, type: 'native', region: id === 'global:header' ? 'header' : 'main', elements: { link: { text } } });
const shared = section('global:header', 'One shared navigation');
const start = source.indexOf('  /* CM_SHARED_NAVIGATION */');
const end = source.indexOf("  if (typeof window !== 'undefined'", source.indexOf('  async function afterRoute('));

async function fixture(page, saved, sharedOnly = false, globals, nativeChrome = []) {
  assert.ok(start > 0 && end > start, 'Shared navigation integration must be in the shipped runtime');
  const baseline = { schemaVersion: 1, id: page, sections: [section('global:header', 'Original header'), section(page + ':body'), ...nativeChrome] };
  const applied = [], orders = [], requests = [];
  const context = vm.createContext({
    state: { page, request: 0, published: new Map(), sharedOnly },
    window: { CMStorefront: { ready: async () => {} } },
    clone: value => structuredClone(value),
    capture: () => baseline,
    flushCategoryOrder: () => {},
    forwardCategoryOrder: value => orders.push(value.categoryOrder),
    apply: value => applied.push(value),
    fetch: async url => { requests.push(url); return { ok: true, json: async () => ({ published: saved, globals: globals || { header: shared, categoryOrder: ['sparklers', 'gift-boxes'] } }) }; },
  });
  vm.runInContext(source.slice(start, end), context);
  await vm.runInContext(`afterRoute({name:${JSON.stringify(page)}})`, context);
  return { applied, orders, requests, baseline };
}

test('fresh Products route loads the shared Home order and header without a Home visit', async () => {
  const result = await fixture('products', null);
  assert.equal(result.requests.length, 1, 'One backend response provides the page and shared settings');
  assert.equal(result.applied[0].sections[0].elements.link.text, 'One shared navigation');
  assert.equal(result.applied[0].sections[1].source, 'products:body', 'Unsaved native page content stays intact');
  assert.deepEqual(Array.from(result.orders[0]), ['sparklers', 'gift-boxes']);
});

test('shared header replaces stale per-page snapshots and preserves the page document', async () => {
  const saved = { schemaVersion: 1, id: 'about', sections: [section('global:header', 'Stale about header'), section('about:body', 'Saved body')], seo: { title: 'About title' } };
  const result = await fixture('about', saved);
  assert.equal(result.applied[0].sections[0].elements.link.text, 'One shared navigation');
  assert.equal(result.applied[0].sections[1].elements.link.text, 'Saved body');
  assert.equal(result.applied[0].seo.title, 'About title');
  assert.equal(saved.sections[0].elements.link.text, 'Stale about header', 'Response objects are not mutated');
});

test('Home globals replace its older document category order', async () => {
  const result = await fixture('home', { schemaVersion: 1, id: 'home', sections: [section('home:body')], categoryOrder: ['gift-boxes', 'sparklers'] });
  assert.deepEqual(Array.from(result.applied[0].categoryOrder), ['sparklers', 'gift-boxes']);
  assert.equal(result.applied[0].sections.find(item => item.source === 'global:header').elements.link.text, 'One shared navigation');
});

test('commerce routes receive shared navigation without Home content or metadata', async () => {
  const result = await fixture('shared', { schemaVersion: 1, id: 'home', sections: [section('home:hero')], seo: { title: 'Home metadata' } }, true);
  assert.equal(result.requests[0], '/cms-api.php?a=published&page=home');
  assert.equal(result.applied[0].id, 'shared');
  assert.equal(result.applied[0].sections[0].elements.link.text, 'One shared navigation');
  assert.equal(result.applied[0].sections.some(item => item.source === 'home:hero'), false);
  assert.equal(result.applied[0].seo, undefined);
});

test('all three global components replace duplicate page snapshots without changing page content', async () => {
  const globals = Object.fromEntries(['promo', 'header', 'footer'].map(role => [role, section('global:' + role, 'Shared ' + role)]));
  const saved = { schemaVersion: 1, id: 'products', sections: [section('global:footer', 'Old footer'), section('products:body'), section('global:promo', 'Old promo'), section('global:header', 'Old header'), {...section('global:footer', 'Duplicate footer'), id:'duplicate'}], seo: {title:'Products only'}, design:{primary:'#112233'} };
  const before = structuredClone(saved);
  const result = await fixture('products', saved, false, globals);
  assert.deepEqual(Array.from(result.applied[0].sections, row => row.source), ['global:promo','global:header','products:body','global:footer']);
  for (const role of ['promo','header','footer']) assert.equal(result.applied[0].sections.find(row => row.source === 'global:' + role).elements.link.text, 'Shared ' + role);
  assert.equal(result.applied[0].seo.title, 'Products only');
  assert.equal(result.applied[0].design.primary, '#112233');
  assert.deepEqual(saved, before);
});

test('an unconfigured global component uses the native shell rather than a stale page copy', async () => {
  const result = await fixture('about', {schemaVersion:1,id:'about',sections:[section('about:body'),section('global:promo','Stale promo'),section('global:footer','Stale footer')]}, false, {header:shared,promo:null,footer:null}, [section('global:promo','Native promo'),section('global:footer','Native footer')]);
  assert.equal(result.applied[0].sections.find(row => row.source === 'global:promo').elements.link.text, 'Native promo');
  assert.equal(result.applied[0].sections.find(row => row.source === 'global:footer').elements.link.text, 'Native footer');
});

test('commerce and future routes receive the same global shell without replacing their content', async () => {
  const globals = Object.fromEntries(['promo', 'header', 'footer'].map(role => [role, section('global:' + role, 'Shared ' + role)]));
  for (const route of ['cart','checkout','categories','future-route']) {
    const result = await fixture(route, {schemaVersion:1,id:'home',sections:[section('home:hero')],seo:{title:'Wrong page'}}, true, globals);
    assert.deepEqual(Array.from(result.applied[0].sections, row => row.source), ['global:promo','global:header',route+':body','global:footer']);
    assert.equal(result.applied[0].id, route);
    assert.equal(result.applied[0].seo, undefined);
  }
});
