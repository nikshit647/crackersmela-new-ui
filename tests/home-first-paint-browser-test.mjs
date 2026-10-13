/* global window, document, performance, getComputedStyle, NodeFilter,
          requestAnimationFrame, MutationObserver */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Read-only public-page regression. No login, catalog edit, or publish request.
// Run: node tests/home-first-paint-browser-test.mjs https://crackersmela.com/
// BASE_URL, CM_PAINT_OUTPUT, CM_PLAYWRIGHT_PATH, CM_CHROME_PATH are optional.
const require = createRequire(import.meta.url);
const playwrightPath = process.env.CM_PLAYWRIGHT_PATH || path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { chromium } = require(existsSync(playwrightPath) ? playwrightPath : 'playwright');
const baseUrl = new URL(process.argv[2] || process.env.BASE_URL || 'http://127.0.0.1:4314/').href;
const output = path.resolve(process.env.CM_PAINT_OUTPUT || 'audit-evidence/home-showcase-20261013/browser/' + Date.now());
const chrome = process.env.CM_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
const results = [], errors = [];

// This runs before the HTML parser: a post-load screenshot alone cannot prove
// that an earlier visible frame did not show the default/storefront template.
function observeHomePaint() {
  const state = window.__homePaint = { frames: [], changes: [], applied: [], firstContentfulPaint: null };
  const normalized = value => (value || '').replace(/\s+/g, ' ').trim();
  const visible = element => {
    if (!element || !element.isConnected) return false;
    for (let node = element; node?.nodeType === 1; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const visibleText = root => {
    if (!visible(root)) return '';
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), parts = [];
    while (walker.nextNode()) {
      if (visible(walker.currentNode.parentElement)) {
        const text = normalized(walker.currentNode.textContent);
        if (text) parts.push(text);
      }
    }
    return parts.join(' ');
  };
  const rect = node => {
    if (!node) return null;
    const box = node.getBoundingClientRect();
    return Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, Math.round(box[key] * 10) / 10]));
  };
  const styles = (node, names) => {
    if (!node) return null;
    const style = getComputedStyle(node);
    return Object.fromEntries(names.map(name => [name, style[name]]));
  };
  const snapshot = reason => {
    const hero = document.querySelector('.hero'), heading = document.querySelector('.hero-copy h1'), promo = document.querySelector('#promoBar');
    const snapshot = {
      time: Math.round(performance.now() * 10) / 10, reason, ready: document.readyState,
      cms: !!document.querySelector('#cm-published-styles'), cmsApplied: state.applied.length,
      heroVisible: visible(hero), heroRect: rect(hero), heading: visibleText(heading),
      eyebrow: visibleText(document.querySelector('.hero-eyebrow')),
      lede: visibleText(document.querySelector('.hero-lede')),
      promoVisible: visible(promo), promoText: visibleText(promo), promoRect: rect(promo),
      heroStyles: styles(hero, ['backgroundColor', 'backgroundImage', 'borderRadius', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']),
      headingStyles: styles(heading, ['fontSize', 'fontFamily', 'lineHeight', 'color']),
      headingParts: heading ? [...heading.children].map(node => ({ text: normalized(node.textContent), visible: visible(node), style: styles(node, ['display', 'fontSize', 'color']) })) : [],
      bodyVisibility: styles(document.body, ['visibility', 'opacity', 'display']),
    };
    const signature = JSON.stringify({ ...snapshot, time: 0, reason: '', ready: '', cmsApplied: 0 });
    if (signature !== state.lastSignature) { state.changes.push(snapshot); state.lastSignature = signature; }
    return snapshot;
  };
  document.addEventListener('cm:cms-applied', event => {
    state.applied.push({ time: performance.now(), page: event.detail?.page });
    snapshot('cms-applied');
  });
  new MutationObserver(() => snapshot('mutation')).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  const frame = () => {
    if (state.done) return;
    const paint = performance.getEntriesByType('paint').find(entry => entry.name === 'first-contentful-paint');
    if (paint) state.firstContentfulPaint = paint.startTime;
    state.frames.push(snapshot('animation-frame'));
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function differences(actual, expected) {
  const changed = ['heading', 'eyebrow', 'lede', 'promoVisible', 'promoText', 'heroStyles', 'headingStyles']
    .filter(key => JSON.stringify(actual[key]) !== JSON.stringify(expected[key]));
  if (JSON.stringify(actual.headingParts.filter(part => part.visible)) !== JSON.stringify(expected.headingParts.filter(part => part.visible))) changed.push('visibleHeadingParts');
  for (const key of ['heroRect', 'promoRect']) {
    if (!actual[key] || !expected[key]) {
      if (actual[key] !== expected[key]) changed.push(key);
    } else if (['x', 'y', 'width', 'height'].some(axis => Math.abs(actual[key][axis] - expected[key][axis]) > 2)) changed.push(key);
  }
  return changed;
}

try {
  for (const [device, viewport, mobile] of [['desktop', { width: 1440, height: 1000 }, false], ['mobile', { width: 390, height: 844 }, true]]) {
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, reducedMotion: process.env.CM_MOTION || 'reduce' });
    await context.addInitScript(observeHomePaint);
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    page.on('pageerror', error => errors.push({ device, error: error.message }));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Page.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.setBypassServiceWorker', { bypass: true });
    for (const visit of ['fresh', 'refresh-1', 'refresh-2']) {
      const runId = `${device}-${visit}`, directory = path.join(output, runId);
      await mkdir(directory, { recursive: true });
      const filmstrip = [], writes = [];
      const onFrame = frame => {
        void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
        if (filmstrip.length >= 50) return;
        const name = `frame-${String(filmstrip.length).padStart(3, '0')}.jpg`;
        filmstrip.push({ file: name, ...frame.metadata });
        writes.push(writeFile(path.join(directory, name), Buffer.from(frame.data, 'base64')));
      };
      cdp.on('Page.screencastFrame', onFrame);
      await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 75, maxWidth: viewport.width, maxHeight: viewport.height, everyNthFrame: 1 });
      const response = visit === 'fresh' ? await page.goto(baseUrl, { waitUntil: 'domcontentloaded' }) : await page.reload({ waitUntil: 'domcontentloaded' });
      assert.equal(response.status(), 200, `${runId}: homepage HTTP status`);
      await writeFile(path.join(directory, 'response.html'), await response.text());
      // Settling establishes the expected published result; assertions below
      // still examine every earlier frame, including frames before CMS loads.
      await page.waitForFunction(() => window.__homePaint.applied.length > 0 && document.readyState === 'complete');
      await page.waitForFunction(() => performance.now() - window.__homePaint.applied.at(-1).time > 750);
      await page.evaluate(() => document.fonts.ready);
      const paint = await page.evaluate(() => { window.__homePaint.done = true; return window.__homePaint; });
      const final = paint.frames.at(-1);
      // A requestAnimationFrame callback runs before its frame is painted.
      // Include the callback immediately before FCP, rather than accidentally
      // discarding the exact state the browser used for its first paint.
      const firstPaintFrame = paint.frames.findLastIndex(frame => frame.time <= paint.firstContentfulPaint);
      const visibleFrames = paint.frames.slice(Math.max(0, firstPaintFrame)).filter(frame => frame.heroVisible);
      const mismatch = visibleFrames.map(frame => ({ time: frame.time, cms: frame.cms, keys: differences(frame, final), heading: frame.heading, promoVisible: frame.promoVisible, heroRect: frame.heroRect }))
        .filter(frame => frame.keys.length);
      const checks = [
        { name: 'Captured visible frames from navigation, not only the final state', pass: visibleFrames.length > 1 && !!paint.firstContentfulPaint },
        { name: 'First visible frame uses the published hero and shared promotion', pass: visibleFrames.length > 0 && differences(visibleFrames[0], final).length === 0 },
        { name: 'No intermediate frame shows old hero text, styling, or promotion', pass: mismatch.length === 0 },
        { name: 'Homepage remains visible after publication applies', pass: !!final?.heroVisible && !!final?.heading },
      ];
      await page.screenshot({ path: path.join(directory, 'final.png') });
      await cdp.send('Page.stopScreencast');
      cdp.off('Page.screencastFrame', onFrame);
      await Promise.all(writes);
      const result = { runId, checks, firstContentfulPaint: paint.firstContentfulPaint, firstVisible: visibleFrames[0], final, mismatch, filmstrip };
      results.push(result);
      await writeFile(path.join(directory, 'timeline.json'), JSON.stringify(paint, null, 2));
      await writeFile(path.join(directory, 'result.json'), JSON.stringify(result, null, 2));
      console.log(`${checks.every(check => check.pass) ? 'PASS' : 'FAIL'} ${runId}: ${visibleFrames.length} visible frames, ${mismatch.length} mismatched frames; first ${Math.round(paint.firstContentfulPaint)}ms, CMS ${Math.round(paint.applied[0]?.time)}ms`);
    }
    await context.close();
  }
} catch (error) {
  errors.push({ error: error.stack || error.message });
  console.error(error.message);
} finally {
  await browser.close();
  const passed = results.length === 6 && results.every(result => result.checks.every(check => check.pass)) && !errors.length;
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ baseUrl, passed, results, errors }, null, 2));
  console.log(`Evidence: ${output}`);
  if (!passed) process.exitCode = 1;
}
