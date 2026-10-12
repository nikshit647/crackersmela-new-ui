import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({ window: {}, document: { head: { querySelector: () => null } } });
for (const file of ['seo-runtime.js', 'seo-manager.js']) vm.runInContext(readFileSync('audit-evidence/product-experience-20261010/source/js/' + file, 'utf8'), context);
const manager = context.window.CMSeoManager;
const fallback = { title: 'Fallback title', seoDesc: 'Search description', description: 'Visible long product description', canonical: 'https://crackersmela.com/about' };
test('search description never takes the longer visible product description', () => {
  assert.equal(manager.mergeSeo(fallback).description, 'Search description');
});
test('social fields follow the selected target and explicit social overrides', () => {
  const seo = manager.mergeSeo(fallback, { title: 'Page title', description: 'Page description', ogTitle: '', ogDescription: '' });
  assert.equal(seo.ogTitle, 'Page title'); assert.equal(seo.ogDescription, 'Page description');
  assert.equal(manager.mergeSeo(fallback, { ogTitle: 'Share this' }).ogTitle, 'Share this');
});
test('canonical remains owned by its route and unsafe images never reach metadata', () => {
  const seo = manager.mergeSeo(fallback, { canonical: 'https://crackersmela.com/contact', ogImage: 'javascript:alert(1)', keywords: '' });
  assert.equal(seo.canonical, fallback.canonical); assert.equal(seo.ogImage, 'https://crackersmela.com/images/logo.png');
  assert.equal(seo.keywords, '');
});
test('page schema uses its matching type and URL without duplicating site entities', () => {
  const seo = manager.mergeSeo(fallback);
  const schema = manager.pageSchema({ id: 'about' }, seo);
  assert.equal(schema['@type'], 'AboutPage'); assert.equal(schema.url, seo.canonical);
  assert.equal(schema.isPartOf['@id'], 'https://crackersmela.com/#website');
});
test('FAQ schema requires real visible published questions', () => {
  const seo = manager.mergeSeo(fallback, { schemaType: 'FAQPage' });
  assert.equal(manager.pageSchema({ id: 'faq' }, seo)['@type'], 'WebPage');
  const doc = { sections: [{ type: 'faq', hidden: true, content: { items: [{ question: 'Hidden?', answer: 'Yes' }] } }, { type: 'faq', content: { items: [{ question: 'Delivery?', answer: 'Contact the store.' }] } }] };
  const schema = manager.pageSchema({ id: 'faq' }, seo, doc);
  assert.equal(schema['@type'], 'FAQPage'); assert.equal(schema.mainEntity.length, 1); assert.equal(schema.mainEntity[0].name, 'Delivery?');
});
test('price list schema contains only supplied current catalog records', () => {
  const seo = manager.mergeSeo(fallback);
  const schema = manager.pageSchema({ id: 'price-list', products: [{ id: 7, slug: 'current-product', name: 'Current product' }] }, seo);
  assert.equal(schema['@type'], 'CollectionPage'); assert.equal(schema.mainEntity.numberOfItems, 1);
  assert.equal(schema.mainEntity.itemListElement[0].url, 'https://crackersmela.com/product/current-product');
});
