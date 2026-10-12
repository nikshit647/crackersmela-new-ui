import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('audit-evidence/product-experience-20261010/source/js/seo-manager.js', 'utf8');
function fixture(raw) {
  const nodes = [], requests = [];
  const query = selector => nodes.filter(node => {
    if (selector === 'title') return node.tag === 'title';
    if (selector.startsWith('script#')) return node.tag === 'script' && node.id === selector.slice(7);
    const match = selector.match(/^(\w+)\[(\w+)="([^"]+)"\]$/);
    return !!match && node.tag === match[1] && (node.attrs[match[2]] ?? node[match[2]]) === match[3];
  });
  const head = { querySelector: () => raw === undefined ? null : { content: raw }, querySelectorAll: query, appendChild(node) { node.isConnected = true; nodes.push(node); } };
  const document = { title: '', head, querySelectorAll: query, getElementById: id => nodes.find(node => node.id === id), createElement: tag => ({ tag, attrs: {}, setAttribute(key, value) { this.attrs[key] = value; }, remove() { nodes.splice(nodes.indexOf(this), 1); } }) };
  const fetch = (...args) => new Promise(resolve => requests.push({ args, resolve }));
  const context = vm.createContext({ document, window: { CM_SEO_RUNTIME: { absoluteImage: value => value } }, fetch });
  vm.runInContext(source, context);
  return { manager: context.window.CMSeoManager, document, requests, meta: key => query(`meta[name="${key}"]`)[0]?.content, schema: () => JSON.parse(nodes.find(node => node.id === 'cm-dynamic-schema').textContent) };
}
const route = (id, scope = 'page', extra = {}) => ({ scope, id, fallback: { title: `Fallback ${id}`, description: `Description ${id}`, canonical: `https://crackersmela.com/${id}` }, ...extra });
const drain = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

for (const raw of ['{broken', 'null', '[]', '{}']) test(`unusable bootstrap ${raw} requests public metadata without breaking navigation`, () => {
  const f = fixture(raw); f.manager.setRoute(route('about'));
  assert.equal(f.document.title, 'Fallback about'); assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].args[1].credentials, 'omit');
});
test('matching freshly published document immediately refreshes metadata', () => {
  const f = fixture(JSON.stringify({ pages: { about: { title: 'Old bootstrap title' } }, categories: {} }));
  f.manager.setRoute(route('about'));
  f.manager.applyPublishedDocument({ id: 'about', seo: { title: 'New published title', description: 'New copy' }, sections: [] });
  assert.equal(f.document.title, 'New published title'); assert.equal(f.meta('description'), 'New copy');
});
test('a metadata request started before a newer document cannot revert its title', async () => {
  const f = fixture('{}'); f.manager.setRoute(route('about'));
  f.manager.applyPublishedDocument({ id: 'about', seo: { title: 'New published title', description: 'New copy' }, sections: [] });
  f.requests[0].resolve({ ok: true, json: async () => ({ ok: true, pages: { about: { title: 'Earlier response title' } }, categories: {} }) });
  await drain();
  assert.equal(f.document.title, 'New published title');
});
test('late public response applies current category while product-template documents stay isolated', async () => {
  const f = fixture('{}'); f.manager.setRoute(route('about'));
  f.manager.setRoute(route('sparklers', 'category', { schema: { '@type': 'CollectionPage', description: 'Visible category intro' } }));
  f.manager.applyPublishedDocument({ id: 'products', seo: { title: 'Shared Products title' } });
  f.requests[0].resolve({ ok: true, json: async () => ({ ok: true, pages: { about: { title: 'About title' }, products: { title: 'Products title' } }, categories: { sparklers: { title: 'Category title', description: 'Category metadata' } } }) });
  await drain();
  assert.equal(f.document.title, 'Category title'); assert.equal(f.schema()['@graph'][0].description, 'Visible category intro');
});
test('late metadata refresh cannot index a private route or replace product metadata', async () => {
  const f = fixture('{}'); f.manager.setRoute(route('901', 'product', { privateRoute: true, schema: { '@type': 'Product', name: 'Current product' } }));
  f.requests[0].resolve({ ok: true, json: async () => ({ ok: true, pages: { product: { title: 'Template title' } }, categories: {} }) });
  await drain();
  assert.equal(f.document.title, 'Fallback 901'); assert.equal(f.meta('robots'), 'noindex, nofollow, noarchive'); assert.equal(f.schema()['@graph'].length, 0);
});
