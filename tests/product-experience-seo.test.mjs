import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync('audit-evidence/product-experience-20261010/source/js/seo-runtime.js','utf8'), context);
const seo = context.window.CM_SEO_RUNTIME;
const product = { id: 1, name: 'Fixture', slug: 'fixture', price: 100, stock: 10, inStock: true, desc: 'Saved full description', note: 'Short note', image: 'uploads/b.png', images: ['uploads/a.png','uploads/b.png','uploads/c.png'], showDescription: false };
test('hidden full description does not leak into visible-product schema and SEO metadata remains', () => {
  assert.equal(seo.productSchema(product).description, 'Short note');
  assert.ok(seo.resolveProduct(product).seoDesc.length > 0);
  assert.equal('description' in seo.productSchema({ ...product, note: '' }), false);
});
test('structured gallery lists selected primary first, without changing saved image order', () => {
  assert.deepEqual(Array.from(seo.productSchema(product).image), ['https://crackersmela.com/uploads/b.png','https://crackersmela.com/uploads/a.png','https://crackersmela.com/uploads/c.png']);
  assert.deepEqual(product.images, ['uploads/a.png','uploads/b.png','uploads/c.png']);
});
