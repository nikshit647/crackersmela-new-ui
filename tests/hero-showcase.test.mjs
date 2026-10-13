/* global window, document, PageTransitionEvent */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('C:/Users/Nikshit Garje/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sourcePath = 'visual-editor/js/hero-showcase.js';
const source = existsSync(sourcePath) ? readFileSync(sourcePath, 'utf8') : '';
const rows = Array.from({ length: 7 }, (_, n) => ({ id: n + 1, featured: n < 6, name: 'Firework ' + (n + 1), shortName: 'Firework ' + (n + 1), priceText: '₹' + (n + 1) + ',250', category: 'Gift Boxes', href: '/product/firework-' + (n + 1), imageMarkup: '<span class="prod-img-fallback" role="img" aria-label="Product image unavailable">✦</span>', brandMarkup: '' }));

test('hero showcase keeps real selections distinct, cycles all, and releases its timers', async t => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage();
  await page.clock.install();
  await page.setContent('<main><h1>Preserved headline</h1><div class="hero-stage"><div class="hero-chip">Preserved badge</div></div></main>');
  await page.addScriptTag({ content: source });
  try {
    assert.equal(await page.evaluate(() => typeof window.CMHeroShowcase?.render), 'function', 'The featured showcase must provide live card rendering');
    const show = async list => page.evaluate(list => {
      window.CMHeroShowcase.destroy();
      const stage = document.querySelector('.hero-stage');
      stage.querySelectorAll('.hero-shot').forEach(card => card.remove());
      stage.insertAdjacentHTML('afterbegin', window.CMHeroShowcase.render(list));
      window.CMHeroShowcase.mount(stage, list);
      window.savedHeadline = document.querySelector('h1');
      window.savedBadge = document.querySelector('.hero-chip');
      window.savedCards = [...stage.querySelectorAll('.hero-shot')];
    }, list);
    const ids = () => page.locator('.hero-shot[data-hero-product]:not([hidden])').evaluateAll(cards => cards.map(card => Number(card.dataset.heroProduct)));
    await t.test('zero selected products gets a usable catalog fallback without an image', async () => {
      await show(rows.map(row => ({ ...row, featured: false })));
      assert.deepEqual(await ids(), []);
      assert.equal(await page.locator('.hero-shot:not([hidden])').count(), 1);
      assert.equal(await page.locator('.hero-shot:not([hidden])').getAttribute('href'), '/products');
      assert.equal(await page.locator('.hero-shot:not([hidden]) img').count(), 0);
    });
    for (const count of [1, 2, 3, 6]) await t.test(count + ' selections render only distinct selected products', async () => {
      await show(rows.map((row, n) => ({ ...row, featured: n < count })));
      assert.deepEqual(await ids(), { 1: [1], 2: [1, 2], 3: [1, 2, 3], 6: [1, 2, 3] }[count]);
      await page.clock.runFor(3900);
      assert.deepEqual(await ids(), { 1: [1], 2: [2, 1], 3: [2, 3, 1], 6: [2, 3, 4] }[count]);
      assert.equal(await page.evaluate(() => window.savedHeadline === document.querySelector('h1') && window.savedBadge === document.querySelector('.hero-chip') && window.savedCards.every((card, index) => card === document.querySelectorAll('.hero-shot')[index])), true);
    });
    await t.test('all six selected products appear and seventh unselected product never appears', async () => {
      await show(rows);
      const seen = new Set(await ids());
      for (let n = 0; n < 6; n++) { await page.clock.runFor(3900); const current = await ids(); assert.equal(new Set(current).size, 3); current.forEach(id => seen.add(id)); }
      assert.deepEqual([...seen].sort(), [1, 2, 3, 4, 5, 6]);
      assert.equal(await page.locator('.hero-shot:not([hidden])').first().getAttribute('href'), '/product/firework-1');
      assert.equal(await page.locator('.hero-shot:not([hidden]) .hero-shot__category').first().textContent(), 'Gift Boxes');
      assert.match(await page.locator('.hero-shot:not([hidden]) .hero-shot__details').first().textContent(), /Firework 1.*₹1,250/);
    });
    await t.test('refresh removes deselected products immediately and updates price and name', async () => {
      await page.evaluate(list => window.CMHeroShowcase.refresh(list), rows.map(row => ({ ...row, featured: row.id === 5, shortName: row.id === 5 ? 'Edited name' : row.shortName, priceText: '₹9,999' })));
      assert.deepEqual(await ids(), [5]);
      assert.match(await page.locator('.hero-shot:not([hidden]) .hero-shot__details').textContent(), /Edited name.*₹9,999/);
      await page.clock.runFor(12000); assert.deepEqual(await ids(), [5]);
    });
    await t.test('reduced motion stops rotation and focus protects the current product link', async () => {
      await page.emulateMedia({ reducedMotion: 'reduce' }); await show(rows);
      await page.clock.runFor(12000); assert.deepEqual(await ids(), [1, 2, 3]);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.locator('.hero-shot').first().focus();
      await page.clock.runFor(12000); assert.deepEqual(await ids(), [1, 2, 3]);
      await page.locator('.hero-shot').first().evaluate(card => card.blur());
      await page.clock.runFor(3900); assert.deepEqual(await ids(), [2, 3, 4]);
    });
    await t.test('browser back restores rotation after suspending a pending fade', async () => {
      await show(rows); await page.clock.runFor(3500);
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
      const before = await ids();
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await page.clock.runFor(12000); assert.deepEqual(await ids(), before);
      assert.equal(await page.locator('.hero-shot__content.is-changing').count(), 0);
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
      await page.clock.runFor(3900); assert.deepEqual(await ids(), [2, 3, 4]);
      assert.equal(await page.evaluate(() => window.savedCards.every((card, index) => card === document.querySelectorAll('.hero-shot')[index])), true);
    });
    await t.test('restored pages retain reduced motion and focus protection', async () => {
      await page.emulateMedia({ reducedMotion: 'reduce' }); await show(rows);
      await page.evaluate(() => {
        window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      });
      await page.clock.runFor(12000); assert.deepEqual(await ids(), [1, 2, 3]);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.locator('.hero-shot').first().focus();
      await page.evaluate(() => {
        window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      });
      await page.clock.runFor(12000); assert.deepEqual(await ids(), [1, 2, 3]);
      await page.locator('.hero-shot').first().evaluate(card => card.blur());
      await page.clock.runFor(3900); assert.deepEqual(await ids(), [2, 3, 4]);
    });
    await t.test('ordinary page exit destroys rotation even if pageshow is dispatched later', async () => {
      await show(rows);
      await page.evaluate(() => {
        window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      });
      await page.clock.runFor(12000); assert.deepEqual(await ids(), [1, 2, 3]);
    });
    await t.test('destroy cancels pending fade and prevents future card mutation', async () => {
      await show(rows); await page.clock.runFor(3500);
      await page.evaluate(() => window.CMHeroShowcase.destroy());
      const before = await ids(); await page.clock.runFor(20000); assert.deepEqual(await ids(), before);
      assert.equal(await page.locator('.hero-shot__content.is-changing').count(), 0);
    });
    await t.test('loading the compatibility copy retains control of the current rotation', async () => {
      await show(rows);
      await page.addScriptTag({ content: source });
      await page.evaluate(() => window.CMHeroShowcase.destroy());
      await page.clock.runFor(3900); assert.deepEqual(await ids(), [1, 2, 3]);
    });
  } finally { await browser.close(); }
});
