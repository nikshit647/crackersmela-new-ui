/* global window, document, localStorage, MutationObserver, getComputedStyle */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

// Synthetic local fixture only. Bulk combinations use the catalog API; the
// on/off admin checkbox is also exercised through its real browser UI.
const fixture = JSON.parse(await readFile(process.env.CM_HERO_FIXTURE || 'audit-evidence/home-showcase-20261013/fixture.json', 'utf8'));
for (const url of [fixture.baseUrl, fixture.publicUrl]) assert.ok(['localhost', '127.0.0.1'].includes(new URL(url).hostname), 'Only an isolated loopback fixture may be mutated');
assert.equal((await (await fetch(fixture.baseUrl + '/__fixture-health')).json()).isolated, true);
const dataFile = path.resolve(fixture.fixture, 'data/catalog.json');
assert.ok(dataFile.startsWith(path.resolve('audit-evidence') + path.sep), 'Fixture catalog must be inside ignored local evidence');
const originalBytes = await readFile(dataFile);
const original = JSON.parse(originalBytes);
const output = path.resolve(process.env.CM_HERO_OUTPUT || 'audit-evidence/home-showcase-20261013/browser/featured-admin-' + Date.now());
await mkdir(output, { recursive: true });
const require = createRequire(import.meta.url);
const runtime = process.env.CM_PLAYWRIGHT_PATH || path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { chromium } = require(existsSync(runtime) ? runtime : 'playwright');
const chrome = process.env.CM_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
const admin = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const publicContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const adminPage = await admin.newPage(), page = await publicContext.newPage();
page.setDefaultTimeout(25000); adminPage.setDefaultTimeout(25000);
const checks = [], errors = [], observations = [];
page.on('pageerror', error => errors.push(error.message));
adminPage.on('pageerror', error => errors.push(error.message));
const check = (name, pass, detail) => { checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) }); console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}`); };
let csrf = '', failure;
const api = async (url, body) => {
  const response = await admin.request.fetch(fixture.baseUrl + url, { method: body ? 'POST' : 'GET', headers: { Origin: fixture.baseUrl, ...(csrf ? { 'X-CSRF-Token': csrf } : {}) }, ...(body ? { data: body } : {}) });
  const data = await response.json();
  if (data.csrfToken) csrf = data.csrfToken;
  assert.ok(response.ok(), `${url.split('?')[0]} returned ${response.status()}: ${data.error || ''}`);
  return data;
};
let allProducts = [], selected = [];
const setFeatured = async products => {
  const ids = new Set(products.map(product => product.id));
  await api('/catalog-api.php', { a: 'push', featOn: Object.fromEntries(allProducts.map(product => [product.id, ids.has(product.id)])) });
};
const ready = async target => {
  await target.waitForFunction(() => !!window.CMCms?.document()?.sections.length && !!document.querySelector('#cm-published-styles') && !!window.CMHeroShowcase);
  await target.waitForLoadState('networkidle');
};
const cardData = target => target.evaluate(() => [...document.querySelectorAll('.hero-stage [data-hero-slot]')].filter(card => !card.hidden && getComputedStyle(card).display !== 'none').map(card => {
  const image = card.querySelector('img[data-cm-image="hero"]');
  return { id: card.dataset.heroProduct ? Number(card.dataset.heroProduct) : null, slot: card.dataset.heroSlot, name: card.querySelector('.hero-shot__details b')?.textContent, price: card.querySelector('.hero-shot__details > span')?.textContent, href: card.getAttribute('href'), label: card.getAttribute('aria-label'), image: image?.getAttribute('src'), imageProduct: image?.dataset.cmProduct, imageAlt: image?.alt, imageLoaded: !!image?.complete && image.naturalWidth > 0, rect: card.getBoundingClientRect().toJSON() };
}));
const reload = async () => { await page.goto(fixture.publicUrl + '/'); await ready(page); return cardData(page); };
const ids = cards => cards.filter(card => card.id !== null).map(card => card.id);
const sameSet = (left, right) => JSON.stringify([...left].sort((a, b) => a - b)) === JSON.stringify([...right].sort((a, b) => a - b));
const expectedPrice = product => '₹' + Math.round(original.priceOverrides?.[product.id] ?? product.price).toLocaleString('en-IN');
const verifyCards = (cards, label) => {
  const valid = cards.filter(card => card.id !== null).every(card => {
    const product = allProducts.find(product => product.id === card.id);
    const href = new URL(card.href, fixture.publicUrl);
    return product && card.name === (product.shortName || product.name) && card.label === (product.name || product.shortName) && card.price === expectedPrice(product) && href.pathname === '/product/' + encodeURIComponent(product.slug || 'p-' + product.id) && Number(card.imageProduct) === product.id && card.imageAlt === (product.name || product.shortName) && card.imageLoaded;
  });
  check(label + ' names, prices, image identity, and product links match the catalog', valid, cards);
};

try {
  await api('/staff-auth.php?a=session');
  assert.equal((await api('/staff-auth.php?a=login', { email: fixture.email, password: fixture.password })).authenticated, true);
  const state = await api('/products-api.php?a=pull');
  await page.goto(fixture.publicUrl + '/'); await ready(page);
  const seeds = await page.evaluate(() => window.CM_DATA.products);
  allProducts = [...seeds, ...(state.extraProducts || [])].map(product => ({ ...product, ...(state.productOverrides?.[product.id] || {}) }));
  // The isolated fixture does not contain every production upload. Select
  // actual copied product assets so a missing fixture image is not mistaken
  // for a broken showcase or accepted as a successful image test.
  selected = allProducts.filter(product => !product.disabled && product.image && existsSync(path.join(fixture.documentRoot, product.image))).slice(0, 6);
  assert.equal(selected.length, 6);

  // Establish empty state through the same persistent API used by Admin.
  await setFeatured([]);
  let cards = await reload();
  check('Zero featured products renders one collection link and no stale product', cards.length === 1 && cards[0].id === null && cards[0].href === '/products', cards);

  await adminPage.goto(fixture.baseUrl + '/#/staff');
  await adminPage.locator('#adminShell [data-stab="products"]').waitFor();
  await adminPage.locator('[data-stab="products"]').click();
  await adminPage.locator('#admPq').fill(selected[0].name);
  const checkbox = adminPage.locator(`[data-feat="${selected[0].id}"]`);
  await checkbox.waitFor();
  const saveOn = adminPage.waitForResponse(response => response.url().includes('catalog-api.php') && response.request().method() === 'POST' && response.ok());
  await checkbox.check(); await saveOn;
  check('Real Admin Products Featured checkbox persists true', (await api('/catalog-api.php?a=pull')).featOn[selected[0].id] === true);
  cards = await reload();
  check('Admin Featured ON appears on public homepage after refresh', sameSet(ids(cards), [selected[0].id]) && cards.length === 1, cards);
  verifyCards(cards, 'Single Featured card');
  const singleIds = ids(cards); await page.waitForTimeout(4000);
  check('One Featured product remains stable without duplicates', sameSet(ids(await cardData(page)), singleIds));
  const saveOff = adminPage.waitForResponse(response => response.url().includes('catalog-api.php') && response.request().method() === 'POST' && response.ok());
  await checkbox.uncheck(); await saveOff;
  check('Real Admin Products Featured checkbox persists false', (await api('/catalog-api.php?a=pull')).featOn[selected[0].id] === false);
  cards = await reload();
  check('Admin Featured OFF disappears after homepage refresh', ids(cards).length === 0);

  for (const count of [2, 3, 6]) {
    await setFeatured(selected.slice(0, count)); cards = await reload();
    check(`${count} Featured products use ${Math.min(count, 3)} distinct display cards`, cards.length === Math.min(count, 3) && new Set(ids(cards)).size === cards.length && ids(cards).every(id => selected.slice(0, count).some(product => product.id === id)), cards);
    verifyCards(cards, `${count} Featured products`);
  }

  // Record actual timed rotations without replacing timers or calling the
  // showcase directly. The observer detects an unwanted whole-page rerender.
  await page.evaluate(() => {
    const view = document.querySelector('#view'), hero = document.querySelector('.hero');
    window.__rotationProbe = { view, hero, replacement: 0, seen: [], updates: [] };
    const sample = () => {
      const ids = [...document.querySelectorAll('.hero-stage [data-hero-product]')].filter(node => !node.hidden).map(node => Number(node.dataset.heroProduct));
      window.__rotationProbe.seen = [...new Set([...window.__rotationProbe.seen, ...ids])];
      window.__rotationProbe.updates.push({ time: Date.now(), ids });
      if (document.querySelector('#view') !== view || document.querySelector('.hero') !== hero) window.__rotationProbe.replacement++;
    };
    new MutationObserver(sample).observe(view.parentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-hero-product'] });
    sample();
  });
  await page.mouse.move(1, 1);
  await page.waitForFunction(() => window.__rotationProbe.seen.length === 6, null, { timeout: 20000 });
  const rotation = await page.evaluate(() => ({ seen: window.__rotationProbe.seen, replacement: window.__rotationProbe.replacement, updates: window.__rotationProbe.updates }));
  observations.push({ rotation });
  check('All six Featured products appear through real timed rotation', sameSet(rotation.seen, selected.map(product => product.id)), rotation.seen);
  check('Rotation preserves the homepage and hero DOM nodes', rotation.replacement === 0);
  verifyCards(await cardData(page), 'Rotated cards');
  await page.waitForFunction(() => [...document.querySelectorAll('.hero-shot:not([hidden]) .hero-shot__content')].every(node => Number(getComputedStyle(node).opacity) === 1));
  await page.screenshot({ path: path.join(output, 'six-featured-desktop.png') });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  cards = await cardData(page); const reducedIds = ids(cards);
  await page.waitForTimeout(4100);
  check('Reduced motion stops automatic card rotation', sameSet(ids(await cardData(page)), reducedIds));
  await setFeatured(selected.slice(1)); cards = await reload();
  check('Removing a Featured product excludes it from the next public load', !ids(cards).includes(selected[0].id) && ids(cards).every(id => selected.slice(1).some(product => product.id === id)));

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const mobile = await mobileContext.newPage();
  await mobile.goto(fixture.publicUrl + '/'); await ready(mobile);
  const mobileCards = await cardData(mobile);
  verifyCards(mobileCards, 'Mobile Featured cards');
  check('Mobile cards remain distinct and within the viewport', new Set(ids(mobileCards)).size === 3 && mobileCards.every(card => card.rect.x >= -2 && card.rect.right <= 392), mobileCards.map(card => ({ id: card.id, rect: card.rect })));
  await mobile.screenshot({ path: path.join(output, 'featured-mobile.png'), fullPage: true });
  await mobileContext.close();

  const target = selected[1];
  await page.locator(`[data-hero-product="${target.id}"]`).click();
  await page.locator('#pdAdd').waitFor();
  check('Featured card opens the correct product page', await page.locator('[data-product-gallery]').getAttribute('data-gallery-product') === String(target.id));
  await page.goto(fixture.publicUrl + '/products');
  await page.locator(`.prod-card[data-id="${target.id}"]`).waitFor();
  check('Product listing still includes Featured products normally', await page.locator(`.prod-card[data-id="${target.id}"]`).count() === 1);
  await page.locator(`[data-add="${target.id}"]`).first().click();
  await page.waitForFunction(id => JSON.parse(localStorage.getItem('cm2.cart') || '[]').some(item => item.id === id && item.qty === 1), target.id);
  await page.locator('#cartBtn').click();
  await page.locator('#cartDrawer.open').waitFor();
  check('Normal product add and cart drawer still work', await page.locator(`#cartDrawer [data-qty="${target.id}"]`).count() > 0);
  check('No uncaught browser errors', errors.length === 0, errors);
} catch (error) {
  failure = error;
  console.error(error.message);
  try { await page.screenshot({ path: path.join(output, 'failure.png') }); } catch {}
} finally {
  await browser.close();
  // Restore the fixture's exact bytes, including absent/default Featured flags.
  await writeFile(dataFile, originalBytes);
  const restored = (await readFile(dataFile)).equals(originalBytes);
  check('Local catalog restored exactly after regression checks', restored);
  const passed = !failure && checks.every(check => check.pass);
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ passed, scope: 'Loopback isolated fixture. API bulk combinations plus real Admin Featured ON/OFF UI toggles. No production writes.', checks, errors, observations, ...(failure ? { failure: failure.stack } : {}) }, null, 2));
  console.log(`Evidence: ${output}`);
  if (!passed) process.exitCode = 1;
}
