import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = 'audit-evidence/production-release';
const app = fs.readFileSync(path.join(root,'js/app.js'),'utf8');
const dataSource = fs.readFileSync(path.join(root,'js/products-data.js'),'utf8');
const data = JSON.parse(dataSource.slice(dataSource.indexOf('window.CM_DATA = ') + 'window.CM_DATA = '.length).trim().replace(/;$/, ''));
const start = app.indexOf('  const CATEGORY_ART_'), end = app.indexOf('  const countdown =', start);
assert.ok(start > 0 && end > start);
const context = vm.createContext({ category: null, catalogue: [], publicRoute: value => value, catPath: id => '/category/' + id, catHash: id => '#/products?cat=' + id, safeImageSrc: value => value, productImageMarkup: product => `<img src="${product.image}" alt="">`, esc: value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])), I: {arrow:'<svg aria-hidden="true"></svg>'} });
vm.runInContext(app.slice(start,end),context);
const card = (category,catalogue = data.products) => { context.category=category;context.catalogue=catalogue;return vm.runInContext('catCard(category,catalogue)',context); };

test('every existing category uses a dedicated lightweight local SVG illustration', () => {
  let total=0;
  for(const category of data.categories) {
    const html=card(category),file=`images/categories/${category.id}.svg`;
    assert.ok(html.includes(`src="${file}"`),`${category.id} must use its custom illustration`);
    assert.ok(fs.existsSync(path.join(root,file)),`${file} exists`);
    const svg=fs.readFileSync(path.join(root,file),'utf8');total+=Buffer.byteLength(svg);
    assert.match(svg,/<svg\b[^>]*viewBox="0 0 96 96"/);
    assert.doesNotMatch(svg,/<(?:script|foreignObject|image|filter|linearGradient|radialGradient)\b|\bhref=|\bon\w+=/i);
    assert.ok(Buffer.byteLength(svg)<5000,`${file} stays lightweight`);
  }
  assert.equal(data.categories.length,11);
  assert.ok(total<35000,'The entire icon family stays below 35 kB uncompressed');
});

test('category links and counts remain driven by the original category IDs and live catalogue membership', () => {
  for(const category of data.categories) {
    const catalogue=[{id:1,cats:[category.id]},{id:2,cats:[category.id,'other']},{id:3,cats:['other']}];
    const html=card(category,catalogue);
    /* Category cards now link to the crawlable clean URL and keep the hash route
       for in-app navigation, so crawlers can discover /category/<id>. */
    assert.match(html,new RegExp(`href="/category/${category.id}"`));
    assert.match(html,new RegExp(`data-spa-route="#/products\\?cat=${category.id}"`));
    assert.match(html,/>2 items<\/span>/);
    assert.match(card(category,catalogue.slice(0,1)),/>1 item<\/span>/);
    assert.match(card(category,[]),/>0 items<\/span>/);
    assert.deepEqual(catalogue.map(product=>product.id),[1,2,3]);
  }
});

test('category artwork retains the image-based CMS structure with reserved dimensions and a single link target', () => {
  const html=card(data.categories[0]);
  assert.equal((html.match(/<a\b/g)||[]).length,1);
  assert.doesNotMatch(html,/<button\b/);
  assert.match(html,/<span class="home-category-card__art" aria-hidden="true"><img [^>]*width="96" height="96"/);
  assert.match(html,/<img [^>]*alt=""[^>]*loading="lazy"[^>]*decoding="async"/);
  assert.match(html,/<span class="home-category-card__copy"><h3>Gift Boxes<\/h3>/);
});
