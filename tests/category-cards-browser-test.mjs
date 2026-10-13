/* global window, document, getComputedStyle, requestAnimationFrame */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Public read-only verification. Optional --preview authenticates only to the
// isolated loopback fixture; it never saves a draft, publication or catalog.
// node tests/category-cards-browser-test.mjs [http://localhost:4317/] [--preview]
const require = createRequire(import.meta.url);
const runtime = process.env.CM_PLAYWRIGHT_PATH || path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { chromium } = require(existsSync(runtime) ? runtime : 'playwright');
const baseUrl = new URL(process.argv.slice(2).find(arg => !arg.startsWith('--')) || process.env.BASE_URL || 'http://localhost:4317/').href;
assert.ok(['http:', 'https:'].includes(new URL(baseUrl).protocol));
assert.notEqual(new URL(baseUrl).hostname, 'admin.crackersmela.com', 'Use the public storefront URL');
const output = path.resolve(process.env.CM_CATEGORY_OUTPUT || 'audit-evidence/category-cards-20261013/browser-' + Date.now());
const chrome = process.env.CM_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(25000);
const checks = [], observations = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
const check = (name, pass, detail) => {
  checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}`);
};
const sectionSelector = '#shop-categories';
const cardsSelector = sectionSelector + ' .home-category-card';
const section = page.locator(sectionSelector), cards = page.locator(cardsSelector);
const identity = rows => rows.map(({ id, name, count, art, href, route }) => ({ id, name, count, art, href, route }));
const screenshot = async (target, name) => {
  const clip = await target.evaluate(() => {
    const section = document.querySelector('#shop-categories');
    window.scrollTo(0, Math.max(0, section.getBoundingClientRect().top + window.scrollY - 120));
    const r = section.getBoundingClientRect(), x = Math.max(0, r.left + window.scrollX - 10), y = Math.max(0, r.top + window.scrollY - 10);
    return { x, y, width: Math.min(document.documentElement.scrollWidth - x, r.width + 20), height: Math.min(document.documentElement.scrollHeight - y, r.height + 20) };
  });
  // Fixed page chrome (navigation/help/back-to-top) is unrelated to this section
  // and can cover cards in a tall capture. Hide it only during the screenshot.
  await target.evaluate(() => {
    const section = document.querySelector('#shop-categories');
    for (const node of document.querySelectorAll('body *')) if (!section.contains(node) && !node.contains(section) && getComputedStyle(node).position === 'fixed' && (node.matches('a,button,input') || node.querySelector('a,button,input'))) node.setAttribute('data-category-screenshot-chrome', '');
  });
  try {
    await target.screenshot({ path: path.join(output, name), fullPage: true, clip, style: '[data-category-screenshot-chrome] { opacity: 0 !important; }' });
  } finally {
    await target.evaluate(() => document.querySelectorAll('[data-category-screenshot-chrome]').forEach(node => node.removeAttribute('data-category-screenshot-chrome')));
  }
};
const ready = async target => {
  await target.locator(cardsSelector).first().waitFor({ state: 'visible' });
  await target.waitForFunction(() => !!window.CMCms && !!document.querySelector('#cm-published-styles'));
  await target.evaluate(() => document.fonts.ready);
  await target.locator(sectionSelector).scrollIntoViewIfNeeded();
  await target.waitForFunction(() => [...document.querySelectorAll('#shop-categories .home-category-card__art img')].every(img => img.complete));
};
const snapshot = target => target.evaluate(() => {
  const root = document.querySelector('#shop-categories');
  const rect = node => {
    const r = node.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
  };
  const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1;
  const rows = [...root.querySelectorAll('.home-category-card')].map(card => {
    const art = card.querySelector('.home-category-card__art'), copy = card.querySelector('.home-category-card__copy'), arrow = card.querySelector('.home-category-card__arrow');
    const image = art.querySelector('img'), svg = arrow.querySelector('svg');
    const bounds = rect(card), parts = [art, copy, arrow].map(rect);
    const arrowStyle = getComputedStyle(arrow);
    return {
      id: card.dataset.categoryId, name: copy.querySelector('h3')?.textContent.trim(), count: copy.querySelector('.home-category-card__count')?.textContent.trim(),
      art: image?.getAttribute('src') || art.textContent.trim(), href: card.getAttribute('href'), route: card.dataset.spaRoute,
      imageLoaded: !image || image.complete && image.naturalWidth > 0, bounds, parts,
      arrowBackground: arrowStyle.backgroundColor, arrowColor: arrowStyle.color, iconStroke: svg && getComputedStyle(svg).stroke,
      overlap: parts.some((part, i) => parts.slice(i + 1).some(other => overlap(part, other))),
      contained: parts.every(r => r.x >= bounds.x - 1 && r.right <= bounds.right + 1 && r.y >= bounds.y - 1 && r.bottom <= bounds.bottom + 1),
      overflow: [card, copy, ...copy.children].some(node => node.scrollWidth > node.clientWidth + 1),
    };
  });
  const effects = [];
  for (const node of [root, ...root.querySelectorAll('*')]) for (const pseudo of [null, '::before', '::after']) {
    const style = getComputedStyle(node, pseudo);
    if (pseudo && ['none', 'normal'].includes(style.content)) continue;
    if (/gradient\(/i.test(style.backgroundImage) || style.textShadow !== 'none' || /drop-shadow/.test(style.filter)) effects.push({ tag: node.tagName, class: node.getAttribute('class'), pseudo, image: style.backgroundImage, textShadow: style.textShadow, filter: style.filter });
  }
  const label = root.querySelector('.home-categories__eyebrow');
  const labelStyle = node => {
    const s = getComputedStyle(node), r = node.getBoundingClientRect();
    return { background: s.backgroundColor, image: s.backgroundImage, color: s.color, fontSize: parseFloat(s.fontSize), fontWeight: Number(s.fontWeight), spacing: parseFloat(s.letterSpacing), casing: s.textTransform, animation: s.animationName, width: r.width, height: r.height };
  };
  const eyebrow = label ? {
    text: label.textContent.trim().toUpperCase(),
    textStyles: [label, ...label.querySelectorAll('span:not([aria-hidden="true"])')].map(labelStyle),
    separators: [...label.querySelectorAll('span[aria-hidden="true"]')].map(labelStyle),
  } : null;
  return { rows, effects, eyebrow, heading: root.querySelector('h2')?.textContent.trim(), subtitle: root.querySelector('.home-categories__head p')?.textContent.trim(), viewport: window.innerWidth, documentWidth: document.documentElement.scrollWidth };
});
const checkEyebrow = (data, label) => {
  const eyebrow = data.eyebrow;
  check(`${label} EXPLORE text and CMS wrapper are transparent dark blue`, eyebrow?.text === 'EXPLORE' && eyebrow.textStyles.every(s => s.background === 'rgba(0, 0, 0, 0)' && s.image === 'none' && s.color === 'rgb(13, 71, 161)' && s.animation === 'none'), eyebrow);
  check(`${label} EXPLORE uses small uppercase medium text and blue-grey separators`, eyebrow?.textStyles.every(s => s.fontSize >= 10 && s.fontSize <= 12 && s.fontWeight >= 500 && s.fontWeight <= 600 && s.spacing >= 1 && s.spacing <= 2 && s.casing === 'uppercase') && eyebrow.separators.length === 2 && eyebrow.separators.every(s => s.background === 'rgb(185, 203, 223)' && s.image === 'none' && s.animation === 'none' && s.height <= 1.1), eyebrow);
  check(`${label} category heading and subtitle remain unchanged`, data.heading === 'Shop by Categories' && data.subtitle === 'Handpicked ranges for every celebration', { heading: data.heading, subtitle: data.subtitle });
};
const motion = async (target, action) => {
  const capture = target.evaluate(() => new Promise(resolve => {
    const card = document.querySelector('#shop-categories .home-category-card');
    const nodes = [card, ...card.querySelectorAll('*')];
    const read = () => nodes.map(node => {
      const r = node.getBoundingClientRect(), s = getComputedStyle(node);
      return [r.x, r.y, r.width, r.height, s.transform, s.translate, s.scale, s.rotate];
    });
    const first = read(); let samples = 0, changed = false, began;
    const tick = time => {
      began ??= time; samples++;
      const current = read();
      changed ||= current.some((row, i) => row.some((value, j) => j < 4 ? Math.abs(value - first[i][j]) > .5 : value !== first[i][j]));
      if (time - began < 350) requestAnimationFrame(tick); else resolve({ changed, samples });
    };
    requestAnimationFrame(tick);
  }));
  await action();
  return capture;
};
const focusFirst = async target => {
  const first = target.locator(cardsSelector).first();
  await first.focus(); await target.keyboard.press('Tab'); await target.keyboard.press('Shift+Tab');
  return first.evaluate(card => {
    const s = getComputedStyle(card);
    return { onAnchor: document.activeElement === card, visible: card.matches(':focus-visible'), style: s.outlineStyle, width: parseFloat(s.outlineWidth), offset: parseFloat(s.outlineOffset), color: s.outlineColor };
  });
};
let failure, baseline;
try {
  const response = await page.goto(baseUrl, { waitUntil: 'load' });
  check('Public homepage responds successfully', response?.ok(), { status: response?.status() });
  await ready(page);
  // Decline only this temporary browser context's optional analytics banner so
  // it does not obscure the requested full-section screenshots.
  const decline = page.locator('[data-analytics-reject]');
  if (await decline.isVisible()) await decline.click();
  for (const [width, columns] of [[1440, 3], [768, 2], [390, 1], [320, 1]]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.mouse.move(0, 0); await section.scrollIntoViewIfNeeded();
    const data = await snapshot(page); observations.push({ label: 'public-' + width, ...data });
    baseline ??= identity(data.rows);
    const firstTop = data.rows[0]?.bounds.y;
    const firstRow = data.rows.filter(row => Math.abs(row.bounds.y - firstTop) < 2);
    check(`${width}px uses ${columns} columns`, firstRow.length === columns, { actual: firstRow.length });
    check(`${width}px preserves names, counts, illustrations and links`, JSON.stringify(identity(data.rows)) === JSON.stringify(baseline));
    check(`${width}px has solid blue arrows and white icons`, data.rows.every(row => row.arrowBackground === 'rgb(23, 105, 210)' && row.arrowColor === 'rgb(255, 255, 255)' && row.iconStroke === 'rgb(255, 255, 255)'));
    check(`${width}px has no gradients or glow effects`, data.effects.length === 0, data.effects);
    checkEyebrow(data, `${width}px`);
    check(`${width}px has no copy/art/arrow overlap or overflow`, data.rows.every(row => !row.overlap && row.contained && !row.overflow) && data.documentWidth <= width + 1);
    check(`${width}px has loaded illustrations and 44px arrow targets`, data.rows.every(row => row.imageLoaded && row.parts[2].width >= 44 && row.parts[2].height >= 44));
    const heights = data.rows.map(row => row.bounds.height);
    check(`${width}px cards have consistent heights`, Math.max(...heights) - Math.min(...heights) <= 1, { min: Math.min(...heights), max: Math.max(...heights) });
    if ([1440, 390, 320].includes(width)) await screenshot(page, `categories-${width}.png`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await section.scrollIntoViewIfNeeded(); await page.mouse.move(0, 0);
  const first = cards.first();
  const hover = await motion(page, () => first.hover());
  check('Hover changes arrow to #1256B0 without movement', !hover.changed && await first.locator('.home-category-card__arrow').evaluate(node => getComputedStyle(node).backgroundColor) === 'rgb(18, 86, 176)', hover);
  const pressed = await motion(page, () => page.mouse.down());
  check('Pressed card, artwork and arrow do not move', !pressed.changed, pressed);
  await page.mouse.move(0, 0); await page.mouse.up();
  const focus = await focusFirst(page);
  check('Keyboard focus ring surrounds the complete anchor', focus.onAnchor && focus.visible && focus.style !== 'none' && focus.width >= 2 && focus.offset >= 0, focus);
  await screenshot(page, 'categories-focus.png');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await first.evaluate(node => node.blur()); await page.mouse.move(0, 0);
  const reduced = await motion(page, () => first.hover());
  check('Reduced motion hover preserves card, artwork and arrow geometry', !reduced.changed, reduced);
  const reducedPressed = await motion(page, () => page.mouse.down());
  check('Reduced motion pressed state preserves geometry', !reducedPressed.changed, reducedPressed);
  await page.mouse.move(0, 0); await page.mouse.up(); await page.emulateMedia({ reducedMotion: 'no-preference' });

  for (const row of baseline) {
    const url = new URL(row.href, baseUrl);
    assert.equal(url.origin, new URL(baseUrl).origin, 'Category links must remain on the storefront');
    const result = await context.request.get(url.href);
    check(`Category ${row.id} HTTP link succeeds`, result.ok(), { status: result.status(), path: url.pathname });
  }
  await focusFirst(page); await page.keyboard.press('Enter');
  await page.waitForFunction(id => [...document.querySelectorAll('[data-fcat]')].some(input => input.value === id && input.checked), baseline[0].id);
  const listing = await page.evaluate(id => {
    const products = [...document.querySelectorAll('#view .prod-card')];
    return { selected: [...document.querySelectorAll('[data-fcat]:checked')].map(input => input.value), count: products.length, filtered: products.every(product => (product.dataset.keys || '').split(/\s+/).includes(id)) };
  }, baseline[0].id);
  check('Enter opens the category listing with the category filter applied', listing.selected.length === 1 && listing.selected[0] === baseline[0].id && listing.filtered && (Number.parseInt(baseline[0].count) === 0 || listing.count > 0), listing);

  if (process.argv.includes('--preview')) {
    const fixture = JSON.parse(await readFile(process.env.CM_HERO_FIXTURE || 'audit-evidence/home-showcase-20261013/fixture.json', 'utf8'));
    for (const url of [baseUrl, fixture.baseUrl, fixture.publicUrl]) assert.ok(['localhost', '127.0.0.1'].includes(new URL(url).hostname), 'Preview authentication is limited to the isolated loopback fixture');
    const health = await context.request.get(fixture.baseUrl + '/__fixture-health');
    assert.equal((await health.json()).isolated, true);
    const previewContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    try {
      const session = await previewContext.request.get(fixture.baseUrl + '/staff-auth.php?a=session');
      const sessionData = await session.json();
      const login = await previewContext.request.post(fixture.baseUrl + '/staff-auth.php?a=login', { headers: { Origin: fixture.baseUrl, 'X-CSRF-Token': sessionData.csrfToken }, data: { email: fixture.email, password: fixture.password } });
      assert.equal((await login.json()).authenticated, true, 'Synthetic fixture authentication failed');
      const publication = await (await context.request.get(new URL('/cms-api.php?a=published&page=home', baseUrl).href)).json();
      const preview = await previewContext.newPage();
      preview.on('pageerror', error => errors.push(error.message));
      await preview.goto(fixture.baseUrl + '/visual-preview.php?page=home');
      await preview.waitForFunction(() => !!window.CMCms?.baseline());
      await preview.evaluate(document => window.CMCms.apply(document), publication.published);
      await ready(preview);
      let previewBaseline;
      for (const width of [1440, 390]) {
        await preview.setViewportSize({ width, height: 1000 }); await preview.locator(sectionSelector).scrollIntoViewIfNeeded();
        const data = await snapshot(preview); observations.push({ label: 'preview-' + width, ...data });
        previewBaseline ??= identity(data.rows);
        // Direct preview starts from its existing catalog snapshot. Check the
        // stylesheet preserves that snapshot rather than forcing a data refresh.
        const disabled = await preview.evaluate(() => {
          const stylesheet = document.querySelector('link[href*="/css/category-cards.css"]');
          if (!stylesheet) return false;
          stylesheet.disabled = true; return true;
        });
        assert.ok(disabled, 'The preview must load the shared category stylesheet');
        const withoutStyle = await snapshot(preview);
        await preview.evaluate(() => { document.querySelector('link[href*="/css/category-cards.css"]').disabled = false; });
        check(`Local preview ${width}px stylesheet preserves its names, counts, illustrations and links`, JSON.stringify(identity(data.rows)) === JSON.stringify(identity(withoutStyle.rows)) && JSON.stringify(identity(data.rows)) === JSON.stringify(previewBaseline));
        const excludeCount = rows => rows.map(({ count: _count, ...row }) => row);
        check(`Local preview ${width}px matches public identity and solid appearance`, JSON.stringify(excludeCount(identity(data.rows))) === JSON.stringify(excludeCount(baseline)) && data.effects.length === 0 && data.rows.every(row => row.arrowBackground === 'rgb(23, 105, 210)' && !row.overlap && row.contained));
        checkEyebrow(data, `Local preview ${width}px`);
        observations.push({ label: 'preview-count-baseline-' + width, differences: data.rows.flatMap((row, i) => row.count === baseline[i].count ? [] : [{ id: row.id, public: baseline[i].count, preview: row.count }]) });
        await screenshot(preview, `categories-preview-${width}.png`);
      }
    } finally { await previewContext.close(); }
  }
  check('No uncaught browser errors', errors.length === 0, errors);
} catch (error) {
  failure = error.message;
  console.error(failure);
  try { await page.screenshot({ path: path.join(output, 'failure.png') }); } catch {}
} finally {
  await browser.close();
  const passed = !failure && checks.every(item => item.pass);
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ passed, baseUrl, scope: 'Read-only public checks. Optional synthetic local session only; no content or catalog writes.', checks, observations, errors, ...(failure ? { failure } : {}) }, null, 2));
  console.log(`Evidence: ${output}`);
  if (!passed) process.exitCode = 1;
}
