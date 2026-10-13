/* global window, document, performance */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = process.argv[2] || 'https://crackersmela.com';
const version = process.env.CM_RELEASE_VERSION || '20261013-home-showcase3';
const runtime = process.env.CM_PLAYWRIGHT_PATH || path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { chromium } = createRequire(import.meta.url)(existsSync(runtime) ? runtime : 'playwright');
const out = 'audit-evidence/home-showcase-20261013/live-smoke-' + Date.now();
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CM_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [], checks = [], headers = [];
page.on('pageerror', error => errors.push(error.message));
const check = (name, pass, detail) => { checks.push({ name, pass: !!pass, detail }); console.log((pass ? 'PASS ' : 'FAIL ') + name); };
try {
  for (const url of [root + '/', root + '/index.html', 'https://admin.crackersmela.com/', root + '/js/hero-showcase.js?v=' + version]) {
    const response = await context.request.get(url);
    headers.push({ url, status: response.status(), cache: response.headers()['cache-control'], cloudflare: response.headers()['cf-cache-status'] });
    check('HTTP 200: ' + url, response.ok());
  }
  await page.goto(root + '/');
  await page.waitForSelector('.hero-shot[data-hero-product]');
  const expected = await page.evaluate(() => {
    const data = window.CM_DATA;
    const boot = JSON.parse(document.querySelector('#cm-product-bootstrap').textContent);
    const all = [...data.products, ...boot.extraProducts].map(p => ({ ...p, ...(boot.productOverrides[p.id] || {}) }));
    return all.filter(p => !p.disabled && (Object.hasOwn(boot.featOn, p.id) ? boot.featOn[p.id] : p.featured)).map(p => ({
      id: String(p.id), name: p.shortName || p.name,
      price: '₹' + Math.round(boot.priceOverrides[p.id] ?? p.price).toLocaleString('en-IN'),
    }));
  });
  const seen = new Set(), samples = [], expectedMap = new Map(expected.map(p => [p.id, p]));
  await page.evaluate(() => { window.__smokeHero = document.querySelector('.hero'); window.__smokeHeading = document.querySelector('.hero h1'); });
  const requestCount = await page.evaluate(() => performance.getEntriesByType('resource').filter(e => /-api\.php/.test(e.name)).length);
  for (let attempt = 0; attempt < Math.max(3, expected.length + 1); attempt++) {
    const cards = await page.locator('.hero-shot[data-hero-product]:visible').evaluateAll(nodes => nodes.map(node => ({
      id: node.dataset.heroProduct, name: node.querySelector('.hero-shot__details b')?.textContent,
      price: node.querySelector('.hero-shot__details > span')?.textContent,
      image: !!node.querySelector('img') && node.querySelector('img').complete && node.querySelector('img').naturalWidth > 0,
      fallback: !!node.querySelector('.prod-img-fallback'), href: node.getAttribute('href'),
    })));
    assert.equal(new Set(cards.map(c => c.id)).size, cards.length);
    for (const card of cards) {
      assert.ok(expectedMap.has(card.id), 'Only selected featured products may be shown');
      assert.equal(card.name, expectedMap.get(card.id).name);
      assert.equal(card.price, expectedMap.get(card.id).price);
      assert.ok(card.image || card.fallback, 'Product image or graceful fallback');
      assert.match(card.href, /\/product\//);
      seen.add(card.id);
    }
    samples.push(cards);
    if (seen.size === expected.length && samples.length >= 2) break;
    const previous = cards.map(c => c.id).join(',');
    await page.waitForFunction(previous => [...document.querySelectorAll('.hero-shot[data-hero-product]')].filter(n => !n.hidden).map(n => n.dataset.heroProduct).join(',') !== previous, previous, { timeout: 6000 });
    await page.waitForFunction(() => [...document.querySelectorAll('.hero-shot img')].every(image => image.complete), { timeout: 6000 });
  }
  check('All selected featured products rotate with distinct cards and current names/prices/images', seen.size === expected.length, { selected: expected.length, seen: seen.size });
  check('Rotation preserves hero and heading nodes', await page.evaluate(() => window.__smokeHero === document.querySelector('.hero') && window.__smokeHeading === document.querySelector('.hero h1')));
  check('No service worker controls the storefront', await page.evaluate(() => !navigator.serviceWorker?.controller));
  check('Only current versioned app/runtime bundles loaded', await page.evaluate(version => ['app.js', 'cms-runtime.js', 'hero-showcase.js'].every(name => [...document.scripts].some(s => s.src.includes('/js/' + name + '?v=' + version))), version));
  await page.screenshot({ path: out + '/live-desktop.png' });
  const productLink = await page.locator('.hero-shot[data-hero-product]').first().getAttribute('href');
  await page.goto(new URL(productLink, root).href);
  check('Featured product detail opens', await page.locator('.prod-detail').isVisible());
  await page.goto(root + '/products');
  await page.waitForSelector('.prod-card');
  check('Product listing loads', await page.locator('.prod-card').count() > 0);
  await page.locator('#navbar a[data-nav="/"]').click();
  await page.waitForSelector('.hero-shot[data-hero-product]');
  check('Return navigation shows published Home', await page.locator('.hero').isVisible());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.waitForSelector('.hero-shot[data-hero-product]');
  check('Mobile page stays within viewport', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2));
  await page.screenshot({ path: out + '/live-mobile.png', fullPage: false });
  await writeFile(out + '/samples.json', JSON.stringify({ expected, samples, initialApiRequests: requestCount }, null, 2));
  check('No browser errors', errors.length === 0, errors);
} catch (error) { checks.push({ name: 'Live smoke test', pass: false, detail: error.stack }); console.error(error.message); }
finally {
  await browser.close();
  await writeFile(out + '/results.json', JSON.stringify({ root, checks, headers, errors }, null, 2));
  console.log('Evidence: ' + out);
  if (checks.some(c => !c.pass)) process.exitCode = 1;
}
