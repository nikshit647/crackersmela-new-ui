import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const app = readFileSync('audit-evidence/production-release/js/app.js', 'utf8');
const seed = JSON.parse(readFileSync('audit-evidence/production-release/js/products-data.js', 'utf8').match(/window\.CM_DATA\s*=\s*(\{[\s\S]*\})\s*;?\s*$/)[1]);
const cats = seed.categories.map(c => c.id);
const start = app.indexOf('  /* CM_CATEGORY_ORDER_RUNTIME');
const end = app.indexOf('  /* END_CM_CATEGORY_ORDER_RUNTIME */') + '  /* END_CM_CATEGORY_ORDER_RUNTIME */'.length;

// Distinct per-category counts. Any count derived from position instead of the
// category itself would drift the moment the order changes.
const counts = Object.fromEntries(cats.map((id, i) => [id, 10 + i]));
let nextId = 1;
const PRODUCTS = cats.flatMap((id, i) => Array.from({ length: 10 + i }, () => ({ id: nextId++, cats: [id] })));

const context = vm.createContext({
  // Names present, so a count or label cannot be silently undefined here.
  CATS: cats.map(id => ({ id, name: id })), CATS_CANONICAL: cats.map(id => ({ id, name: id })),
  window: {}, document: { activeElement: null }, currentRoute: null,
  $: () => null, $$: () => [],
  esc: String, catPath: id => '/category/' + id, catHash: id => '#/products?cat=' + id,
  catIcon: () => '', PRODUCTS,
});
vm.runInContext(app.slice(start, end), context);

const apply = ids => context.window.CMApplyCategoryOrder(ids);
const order = () => context.window.CMGetCategoryOrder();
const menu = () => vm.runInContext('catMenuMarkup()', context);
const footer = () => vm.runInContext('catFooterMarkup()', context);

test('mega-menu counts stay bound to their own category through a full reorder', () => {
  const parse = markup => [...markup.matchAll(/cat=([\w-]+)[\s\S]*?<small>(\d+) products<\/small>/g)].map(m => [m[1], +m[2]]);
  for (const rows of [parse(menu()), ...[cats.slice().reverse(), [...cats].sort()].map(o => { apply(o); return parse(menu()); })]) {
    assert.equal(rows.length, cats.length, 'every category appears once');
    for (const [id, n] of rows) assert.equal(n, counts[id], `${id} count must follow the category, not the position`);
  }
  apply([]);
  assert.deepEqual(order(), cats, 'reset returns the catalog order');
});

test('the footer shows six categories of the current order, with no counts of its own', () => {
  const reversed = cats.slice().reverse();
  assert.equal(apply(reversed), true);
  assert.deepEqual(order(), reversed);
  const rows = [...footer().matchAll(/cat=([\w-]+)/g)].map(m => m[1]);
  assert.deepEqual(rows, reversed.slice(0, 6), 'first six follow the new order');
  // The footer renders names only: no product count, no per-position number.
  assert.doesNotMatch(footer(), /\d/, 'the footer renders no count at all');
  apply([]);
});

test('sidebar, rail and home-grid counts are computed per category, not per index', () => {
  // Each of these counts products by membership of the category it renders.
  const perCategory = [
    /const catCount = id => allProducts\(\)\.filter\(p => p\.cats\.includes\(id\)\)\.length;/,
    /pill\(c\.id, c\.name, allProducts\(\)\.filter\(p => p\.cats\.includes\(c\.id\)\)\.length\)/,
    /PRODUCTS\.filter\(p => p\.cats\.includes\(c\.id\)\)\.length\} products/,
    /catalogue\.filter\(p => Array\.isArray\(p\.cats\) && p\.cats\.includes\(c\.id\)\)\.length/,
  ];
  for (const pattern of perCategory) assert.match(app, pattern);
  // No rendered count may be read from an array index. The only positional CATS
  // access allowed is the idempotency check inside the order hook itself.
  for (const file of ['audit-evidence/production-release/js/app.js', 'visual-editor/js/app.js']) {
    if (!existsSync(file)) continue;
    const hits = readFileSync(file, 'utf8').split('\n')
      .map((line, i) => [i + 1, line])
      .filter(([, line]) => /CATS\s*\[\s*(?:index|i|idx|n)\s*\]/.test(line))
      .filter(([, line]) => !/every\(\(c, index\) => c === CATS\[index\]\)/.test(line));
    assert.deepEqual(hits, [], file + ' must not index CATS by position outside the order hook');
  }
});