import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const filename = new URL('../audit-evidence/product-experience-20261010/source/js/seo-assistant.js', import.meta.url);
const plan = JSON.parse(fs.readFileSync(new URL('../audit-artifacts/seo-management-20261010/keyword-plan.json', import.meta.url), 'utf8'));
const read = () => {
  const window = {};
  vm.runInNewContext(fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : '', { window, URL });
  assert.equal(typeof window.CMSeoAssistant?.generate, 'function', 'Generator is available without DOM, storage or network APIs');
  assert.equal(typeof window.CMSeoAssistant?.analyse, 'function');
  return window.CMSeoAssistant;
};
const plain = value => JSON.parse(JSON.stringify(value));
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const contextFor = (id = 'home') => {
  const page = plan.pages.find(row => row.id === id);
  return { target: { scope: page.scope, id, name: page.suggestedH1, path: page.path, canonical: 'https://crackersmela.com' + page.path }, seo: {}, content: { headings: [{ level: 1, text: page.suggestedH1 }], text: page.description, images: [], links: [], schemaTypes: [] }, overview: plan.pages.map(row => ({ ...row, name: row.suggestedH1, canonical: 'https://crackersmela.com' + row.path, seo: { title: row.title, description: row.description } })), catalog: { products: [], categories: [] } };
};
const check = (result, id) => { const row = result.checks.find(item => item.id === id); assert.ok(row, id + ' check exists'); return row; };

test('generation and analysis are deterministic and do not mutate frozen input', () => {
  const api = read(), context = freeze(contextFor()), before = JSON.stringify(context);
  assert.deepEqual(plain(api.generate(context)), plain(api.generate(context)));
  assert.deepEqual(plain(api.analyse(context)), plain(api.analyse(context)));
  assert.equal(JSON.stringify(context), before);
  assert.match(api.generate(context).evidence.join(' '), /deterministic|saved keyword plan/i);
});

test('all 23 existing page/category suggestions are unique and match the saved research plan', () => {
  const api = read(), rows = plan.pages.map(page => api.generate(contextFor(page.id)));
  assert.equal(new Set(rows.map(row => row.seo.title)).size, 23);
  assert.equal(new Set(rows.map(row => row.seo.description)).size, 23);
  rows.forEach((row, i) => {
    assert.equal(row.seo.title, plan.pages[i].title);
    assert.equal(row.seo.description, plan.pages[i].description);
    assert.equal(row.seo.focusKeyword, plan.pages[i].focusKeyword);
    assert.equal(row.seo.canonical, 'https://crackersmela.com' + plan.pages[i].path);
    assert.equal(row.seo.robots, 'index, follow');
    assert.equal(row.seo.ogTitle, row.seo.title);
  });
});

test('unknown pages derive copy from their own heading and text without reusing homepage claims', () => {
  const row = read().generate({ target: { scope: 'page', id: 'collection-care', name: 'Collection care', path: '/collection-care' }, content: { headings: [{ level: 1, text: 'Reading your pack instructions' }], text: 'Check the printed pack information before choosing and handling any item. Keep the instructions available for reference.' } });
  assert.match(row.seo.title, /Reading your pack instructions/);
  assert.match(row.seo.description, /printed pack information/);
  assert.doesNotMatch(row.seo.title, /Buy Crackers Online in Hyderabad/);
});

test('a matching supplied keyword plan overrides defaults without using another page row', () => {
  const c = contextFor('shipping');
  c.keywordPlan = { pages: [{ scope: 'page', id: 'home', title: 'Wrong page' }, { scope: 'page', id: 'shipping', title: 'Delivery details at CrackersMela', focusKeyword: 'delivery details', secondaryKeywords: ['order area'] }] };
  const row = read().generate(c);
  assert.equal(row.seo.title, 'Delivery details at CrackersMela');
  assert.equal(row.seo.focusKeyword, 'delivery details');
  assert.match(row.seo.description, /Hyderabad and Secunderabad/);
});

test('authored product metadata and actual brand/pack details survive generation', () => {
  const c = { target: { scope: 'product', id: 27, path: '/product/real-pack' }, seo: { title: 'Authored product title', description: 'An authored product description.', focusKeyword: 'authored focus', robots: 'noindex, follow', ogTitle: 'Authored sharing' }, catalog: { products: [{ id: 27, name: 'Zamin Chakkar Ashoka 1 Box - 10 Pcs', slug: 'real-pack', brand: 'Standard', image: 'uploads/real.webp', seoTitle: 'Older title', seoDesc: 'Older description', primary: 'chakkars' }], categories: [{ id: 'chakkars', name: 'Chakkars' }] } };
  const row = read().generate(c);
  assert.equal(row.seo.title, c.seo.title);
  assert.equal(row.seo.description, c.seo.description);
  assert.equal(row.seo.focusKeyword, 'authored focus');
  assert.equal(row.seo.robots, 'noindex, follow');
  assert.equal(row.seo.ogTitle, 'Authored sharing');
  assert.equal(row.seo.ogImage, 'https://crackersmela.com/uploads/real.webp');
  assert.equal(row.suggestedH1, 'Zamin Chakkar Ashoka 1 Box - 10 Pcs');
  assert.ok(row.internalLinks.some(link => link.href === '/category/chakkars'));
});

test('legacy product SEO is preserved and blank fields use actual name without invented claims', () => {
  const product = { id: 7, slug: 'seven-shots', name: '7 SHOTS 1 BOX', note: '1 Box', primary: 'night-outs', image: 'javascript:alert(1)', seoTitle: 'Original seven shots title', seoDesc: 'Original seven shots description' };
  const c = { target: { scope: 'product', id: 7 }, catalog: { products: [product], categories: [{ id: 'night-outs', name: 'Multicolor Shows' }] } };
  const api = read(), row = api.generate(c);
  assert.equal(row.seo.title, product.seoTitle);
  assert.equal(row.seo.description, product.seoDesc);
  assert.equal(row.seo.canonical, 'https://crackersmela.com/product/seven-shots');
  assert.doesNotMatch(row.seo.ogImage, /javascript:/);
  delete product.seoTitle; delete product.seoDesc;
  const generated = api.generate(c);
  assert.match(generated.seo.title, /7 SHOTS 1 BOX/);
  assert.doesNotMatch(JSON.stringify(generated.seo), /licensed|certified|exclusive|85%|free delivery|in stock/i);
});

test('image selection rejects unsafe sources and uses a valid actual content image', () => {
  const c = contextFor('about'); c.seo.ogImage = 'https://user:password@other.test/a.jpg';
  c.content.images = [{ src: 'javascript:alert(1)' }, { src: 'uploads/store.webp', alt: 'Store products' }];
  const row = read().generate(c);
  assert.equal(row.seo.ogImage, 'https://crackersmela.com/uploads/store.webp');
});

test('offer evidence uses exact effective prices and available stock, scoped to the category', () => {
  const c = contextFor('flower-pots');
  c.catalog.products = [
    { id: 1, name: 'Rounded only', price: 600, compareAt: 3971, stock: 5, inStock: true, cats: ['flower-pots'] },
    { id: 2, name: 'Qualifying fountain', price: 200, effectivePrice: 160, compareAt: 1153, stock: 0, effectiveStock: 3, inStock: true, cats: ['flower-pots'] },
    { id: 3, name: 'Wrong category', price: 10, compareAt: 100, stock: 1, inStock: true, cats: ['guns-rolls'] },
    { id: 4, name: 'Unavailable', price: 10, compareAt: 100, stock: 0, inStock: true, cats: ['flower-pots'] },
    { id: 5, name: 'Disabled', price: 10, compareAt: 100, stock: 2, inStock: true, disabled: true, cats: ['flower-pots'] }
  ];
  const row = read().generate(c), evidence = row.evidence.join(' ');
  assert.match(evidence, /1 .*85%/);
  assert.match(evidence, /reference prices|comparison prices/);
  assert.doesNotMatch(row.seo.description, /85%/);
  c.catalog.products[1].effectiveStock = 0;
  assert.doesNotMatch(read().generate(c).evidence.join(' '), /qualif.*85%/i);
});

test('generation provides relevant missing links and excludes existing, self and private links', () => {
  const c = contextFor('wholesale');
  c.content.links = [{ href: '/price-list', text: 'Price list' }];
  c.keywordPlan = { pages: [{ scope: 'page', id: 'wholesale', internalLinks: ['/price-list', '/wholesale', '/admin', 'https://evil.test/foo', '/category/night-outs'] }] };
  const row = read().generate(c);
  assert.deepEqual(plain(row.internalLinks.map(link => link.href)), ['/category/night-outs']);
  assert.ok(row.internalLinks.every(link => link.text && link.reason));
});

test('empty metadata produces actionable missing-field checks without a ranking score', () => {
  const row = read().analyse(contextFor());
  for (const id of ['title-presence', 'description-presence', 'focus-keyword', 'canonical', 'social']) assert.equal(check(row, id).status, 'needs-improvement');
  assert.equal(check(row, 'title-length').status, 'not-applicable');
  assert.equal('score' in row, false);
  assert.ok(row.checks.every(item => item.label && item.message));
  assert.equal(Object.values(row.summary).reduce((sum, value) => sum + value, 0), row.checks.length);
});

test('length checks count Unicode characters and explain editorial ranges', () => {
  const c = contextFor(); c.seo = { title: '🔥'.repeat(55), description: 'x'.repeat(150) };
  const row = read().analyse(c);
  assert.equal(check(row, 'title-length').status, 'passed');
  assert.equal(check(row, 'description-length').status, 'passed');
  assert.match(check(row, 'title-length').message, /55/);
  c.seo.title = 'Tiny'; c.seo.description = 'x'.repeat(220);
  assert.equal(check(read().analyse(c), 'title-length').status, 'needs-improvement');
  assert.equal(check(read().analyse(c), 'description-length').status, 'needs-improvement');
});

test('known route wins over wrong canonical, including admin host, queries and hashes', () => {
  const api = read(), c = contextFor('shipping');
  for (const value of ['/shipping', 'https://crackersmela.com:443/shipping', 'https://crackersmela.com/about', 'https://admin.crackersmela.com/shipping', 'http://crackersmela.com/shipping', 'https://crackersmela.com/shipping?x=1', 'https://crackersmela.com/#/shipping', 'javascript:alert(1)']) {
    c.seo.canonical = value;
    assert.notEqual(check(api.analyse(c), 'canonical').status, 'passed', value);
    assert.equal(api.generate(c).seo.canonical, 'https://crackersmela.com/shipping');
  }
  c.seo.canonical = 'https://crackersmela.com/shipping';
  assert.equal(check(api.analyse(c), 'canonical').status, 'passed');
});

test('unknown canonical targets are unverified and private routes never get indexing suggestions', () => {
  const api = read();
  assert.equal(check(api.analyse({ seo: { canonical: 'https://crackersmela.com/' } }), 'canonical').status, 'warning');
  const row = api.generate({ target: { scope: 'page', id: 'admin', path: '/admin' } });
  assert.equal(row.seo.canonical, '');
  assert.match(row.seo.robots, /noindex/);
});

test('heading and image checks distinguish absent data, missing markup and decorative images', () => {
  const api = read(), c = contextFor();
  c.content.headings = [];
  assert.equal(check(api.analyse(c), 'h1').status, 'needs-improvement');
  c.content.headings = [{ level: 1, text: 'One' }, { level: 1, text: 'Two' }];
  assert.equal(check(api.analyse(c), 'h1').status, 'warning');
  c.content.images = [{ src: '/one.png' }, { src: '/decorative.png', alt: '', decorative: true }];
  assert.equal(check(api.analyse(c), 'image-alt').status, 'needs-improvement');
  c.content.images = [{ src: '/decorative.png', alt: '', decorative: true }];
  assert.equal(check(api.analyse(c), 'image-alt').status, 'passed');
  c.content.images = [{ src: '/maybe.png', alt: '' }];
  assert.equal(check(api.analyse(c), 'image-alt').status, 'warning');
  assert.equal(check(api.analyse({ target: c.target }), 'h1').status, 'not-applicable');
});

test('internal links use known routes, flag hash routes and never claim to fetch link health', () => {
  const api = read(), c = contextFor();
  c.content.links = [{ href: '/shipping' }, { href: 'mailto:test@example.com' }, { href: 'https://other.test/external' }];
  assert.equal(check(api.analyse(c), 'internal-links').status, 'passed');
  assert.match(check(api.analyse(c), 'internal-links').message, /HTTP|network/);
  c.content.links.push({ href: '/missing-route' });
  assert.equal(check(api.analyse(c), 'internal-links').status, 'warning');
  c.content.links = [{ href: '/#/shipping' }];
  assert.equal(check(api.analyse(c), 'internal-links').status, 'needs-improvement');
});

test('duplicate metadata ignores the current identity but catches other scopes and normalizes whitespace', () => {
  const api = read(), c = contextFor('about');
  c.seo = { title: 'Same title', description: 'Same description' };
  c.overview = [{ scope: 'page', id: 'about', name: 'About', seo: { ...c.seo } }];
  assert.equal(check(api.analyse(c), 'duplicate-title').status, 'passed');
  c.overview.push({ scope: 'category', id: 'about', name: 'Different category', seo: { title: ' Same   TITLE ', description: 'Same description' } });
  assert.equal(check(api.analyse(c), 'duplicate-title').status, 'warning');
  assert.equal(check(api.analyse(c), 'duplicate-description').status, 'warning');
  assert.match(check(api.analyse(c), 'duplicate-title').message, /Different category/);
});

test('keyword relevance checks actual text and headings without requiring exact phrase stuffing', () => {
  const api = read(), c = contextFor('sparklers');
  c.seo = { focusKeyword: 'sparklers online Hyderabad', title: 'Sparklers to compare', description: 'See sizes and prices' };
  c.content.text = 'Browse sparklers for your order in Hyderabad.';
  assert.equal(check(api.analyse(c), 'keyword-relevance').status, 'passed');
  c.seo.focusKeyword = 'wedding venue installation';
  assert.equal(check(api.analyse(c), 'keyword-relevance').status, 'warning');
});

test('appropriate schema checks differ for products, categories, homepage and policy pages', () => {
  const api = read(), c = contextFor('sparklers');
  c.content.schemaTypes = ['CollectionPage', 'ItemList', 'BreadcrumbList'];
  assert.equal(check(api.analyse(c), 'structured-data').status, 'passed');
  const p = { target: { scope: 'product', id: 1, path: '/product/one' }, content: { schemaTypes: ['Product', 'Offer', 'BreadcrumbList'] } };
  assert.equal(check(api.analyse(p), 'structured-data').status, 'passed');
  p.content.schemaTypes = ['Product'];
  assert.equal(check(api.analyse(p), 'structured-data').status, 'needs-improvement');
  const privacy = contextFor('privacy');
  assert.equal(check(api.analyse(privacy), 'structured-data').status, 'not-applicable');
  const home = contextFor(); home.content.schemaTypes = ['WebSite', 'Organization'];
  assert.equal(check(api.analyse(home), 'structured-data').status, 'passed');
});

test('robots warns about noindex and contradictory directives while preserving deliberate generation settings', () => {
  const api = read(), c = contextFor();
  c.seo.robots = 'noindex, follow';
  assert.equal(check(api.analyse(c), 'robots').status, 'warning');
  assert.equal(api.generate(c).seo.robots, 'noindex, follow');
  c.seo.robots = 'index, noindex, follow';
  assert.equal(check(api.analyse(c), 'robots').status, 'needs-improvement');
  c.seo.robots = 'index, follow, max-image-preview:large';
  assert.equal(check(api.analyse(c), 'robots').status, 'passed');
  c.seo.robots = 'invalid';
  assert.equal(check(api.analyse(c), 'robots').status, 'needs-improvement');
});
