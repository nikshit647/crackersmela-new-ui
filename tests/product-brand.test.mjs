import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const sourceRoot = new URL('../audit-evidence/product-experience-20261010/source/', import.meta.url);
const modulePath = new URL('js/product-brand.js', sourceRoot);
const cases = [
  [{ brand: 'Standard Fireworks' }, true],
  [{ brand: '  sTaNdArD\tFiReWoRkS  ' }, true],
  [{ brand: '\u00a0STANDARD FIREWORKS\u00a0' }, true],
  [{ brand: 'Standard Crackers' }, true],
  [{ brand: ' Standard ' }, true],
  [{ brand: 'Ayyan', name: 'Standard Fireworks', desc: 'Standard product' }, false],
  [{ name: 'Standard Fireworks', desc: 'Standard Crackers', note: 'Standard' }, false],
  [{ brand: 'Standard Fireworks / Ayyan' }, false],
  [{ brand: 'Not Standard Fireworks' }, false],
  [{ brand: { name: 'Standard Fireworks' } }, false],
  [{ brand: null }, false],
  [{ brand: 1 }, false],
  [null, false],
];

function brandModule() {
  assert.ok(existsSync(modulePath), 'The reusable brand renderer must exist');
  const context = { window: {} };
  vm.runInNewContext(readFileSync(modulePath, 'utf8'), context);
  return context.window.CMProductBrand;
}

test('brand classification uses only explicit brand metadata and known catalog aliases', () => {
  const brand = brandModule();
  for (const [product, expected] of cases) assert.equal(brand.isStandard(product), expected, JSON.stringify(product));
});

test('the pill has fixed image dimensions and creates no extra focus target or untrusted HTML', () => {
  const brand = brandModule();
  const product = { brand: 'Standard', name: '<script>bad()</script>' };
  const before = JSON.stringify(product);
  const markup = brand.render(product);
  assert.match(markup, /class="product-brand-pill"/);
  assert.match(markup, />Standard Fireworks<\/span>/);
  assert.match(markup, /src="images\/brands\/standard-fireworks\.png"/);
  assert.match(markup, /width="22" height="22"/);
  assert.match(markup, /alt=""/);
  assert.doesNotMatch(markup, /<a\b|<button\b|tabindex=|<script\b|onerror=/);
  assert.equal(JSON.stringify(product), before);
  assert.equal(brand.render({ brand: 'Ayyan', desc: 'Standard Fireworks' }), '');
  assert.match(brand.render(product, { compact: true }), /product-brand-pill--compact/);
});

test('PHP first paint and browser navigation use identical brand classification and markup', () => {
  const brand = brandModule();
  const php = fileURLToPath(new URL('../audit-evidence/tools/php-8.3.35/php.exe', import.meta.url));
  const helper = fileURLToPath(new URL('cm-product-brand.php', sourceRoot)).replaceAll('\\', '/');
  assert.ok(existsSync(helper), 'The PHP brand renderer must exist');
  const code = `<?php require ${JSON.stringify(helper)}; $cases=json_decode(stream_get_contents(STDIN),true); $out=[]; foreach($cases as $p){$out[]=[cmProductIsStandard($p),cmProductBrandPill($p),cmProductBrandPill($p,true)];} echo json_encode($out);`;
  const result = spawnSync(php, ['-r', code.slice(6)], { input: JSON.stringify(cases.map(([p]) => p)), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const actual = JSON.parse(result.stdout);
  cases.forEach(([product, expected], index) => {
    assert.deepEqual(actual[index], [expected, brand.render(product), brand.render(product, { compact: true })]);
  });
});

test('the server-rendered homepage labels Standard cards and hero products without labelling other brands', () => {
  const php = fileURLToPath(new URL('../audit-evidence/tools/php-8.3.35/php.exe', import.meta.url));
  const homepage = fileURLToPath(new URL('cm-home.php', sourceRoot)).replaceAll('\\', '/');
  const fixture = [
    { id: 1, name: 'Explicit Standard product', shortName: 'Explicit Standard product', brand: 'Standard Crackers', cats: ['gift-boxes'] },
    { id: 2, name: 'Ayyan Standard name', shortName: 'Ayyan Standard name', brand: 'Ayyan', cats: ['rockets'] },
    { id: 3, name: 'Unassigned product', shortName: 'Unassigned product', desc: 'Standard Fireworks', cats: ['night-outs'] },
  ].map(p => ({ ...p, inStock: true, image: 'images/products/test.png', price: 100, compareAt: 200 }));
  const code = `require ${JSON.stringify(homepage)}; $catalog=json_decode(stream_get_contents(STDIN),true); function cmProductMap(){return $GLOBALS['catalog'];} function cmBaseData(){return ['settings'=>[]];} function cmSeoEscape($s){return htmlspecialchars((string)$s,ENT_QUOTES,'UTF-8');} function cmSeoUrl($p){return '/product/p-'.$p['id'];} echo cmHomeInitialHtml([]);`;
  const result = spawnSync(php, ['-r', code], { input: JSON.stringify(fixture), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const markup = result.stdout;
  assert.equal((markup.match(/class="product-brand-pill(?: product-brand-pill--compact)?"/g) || []).length, 2);
  for (const p of fixture) {
    const card = markup.match(new RegExp(`<article class="prod-card" data-id="${p.id}">([\\s\\S]*?)</article>`))?.[1];
    assert.ok(card, `Product ${p.id} must be present in the initial card grid`);
    assert.equal(card.includes('class="product-brand-pill"'), p.id === 1);
    if (p.id === 1) assert.ok(card.indexOf('product-brand-pill') < card.indexOf('prod-card__name'));
  }
});
