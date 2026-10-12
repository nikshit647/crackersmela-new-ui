import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const helper = fileURLToPath(new URL('../audit-evidence/product-experience-20261010/source/cm-product-bootstrap.php', import.meta.url)).replaceAll('\\', '/');
const php = fileURLToPath(new URL('../audit-evidence/tools/php-8.3.35/php.exe', import.meta.url));
const execute = input => {
  assert.ok(existsSync(helper), 'Public catalog bootstrap helper must exist');
  const code = `require ${JSON.stringify(helper)}; $fixture=json_decode(stream_get_contents(STDIN),true); function cmProductState(){return $GLOBALS['fixture']['products'];} function cmCatalogState(){return $GLOBALS['fixture']['catalog'];} echo cmProductBootstrapInject('<html><head><title>Product</title></head><body></body></html>');`;
  const result = spawnSync(php, ['-r', code], { input: JSON.stringify(input), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const markup = result.stdout;
  const contents = markup.match(/<script type="application\/json" id="cm-product-bootstrap">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(contents, 'The inert bootstrap is available to the first client render');
  return { markup, contents, data: JSON.parse(contents) };
};

test('bootstrap includes current public catalog fields and excludes private settings', () => {
  const input = { products: { productOverrides: { 42: { showDescription: false, desc: 'retained', image: 'uploads/new.png', images: ['uploads/one.png', 'uploads/new.png'] } }, extraProducts: [{ id: 99, name: 'New product' }], settings: { emailAuto: 'private', orderId: 'private' }, csrfToken: 'private' }, catalog: { priceOverrides: { 42: 125 }, stockOverrides: { 42: 9 }, featOn: { 42: true }, private: 'not-public' } };
  const { data, markup } = execute(input);
  assert.deepEqual(Object.keys(data), ['productOverrides', 'extraProducts', 'priceOverrides', 'stockOverrides', 'featOn']);
  for (const key of ['productOverrides', 'extraProducts']) assert.deepEqual(data[key], input.products[key]);
  for (const key of ['priceOverrides', 'stockOverrides', 'featOn']) assert.deepEqual(data[key], input.catalog[key]);
  assert.doesNotMatch(markup, /emailAuto|orderId|csrfToken|not-public|private/);
});

test('bootstrap encodes script delimiters safely while preserving the saved description', () => {
  const dangerous = '</script><script>alert("bad & unsafe")</script>\' café';
  const { markup, contents, data } = execute({ products: { productOverrides: { 42: { desc: dangerous } }, extraProducts: [] }, catalog: {} });
  assert.equal((markup.match(/<script/g) || []).length, 1);
  assert.doesNotMatch(contents, /[<>&']/);
  assert.equal(data.productOverrides[42].desc, dangerous);
  assert.ok(markup.indexOf('cm-product-bootstrap') < markup.indexOf('</head>'));
});

test('empty server state still overrides obsolete browser maps with the correct types', () => {
  const { data } = execute({ products: {}, catalog: {} });
  assert.deepEqual(data, { productOverrides: {}, extraProducts: [], priceOverrides: {}, stockOverrides: {}, featOn: {} });
});
