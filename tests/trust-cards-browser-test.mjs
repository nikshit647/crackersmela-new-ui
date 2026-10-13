/* global window, document, getComputedStyle, requestAnimationFrame */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Read-only public verification. --preview uses the synthetic loopback session
// and projects the published document in memory; no content or catalog writes.
const require = createRequire(import.meta.url);
const runtime = process.env.CM_PLAYWRIGHT_PATH || path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { chromium } = require(existsSync(runtime) ? runtime : 'playwright');
const baseUrl = new URL(process.argv.slice(2).find(arg => !arg.startsWith('--')) || process.env.BASE_URL || 'http://localhost:4317/').href;
assert.ok(['http:', 'https:'].includes(new URL(baseUrl).protocol));
assert.notEqual(new URL(baseUrl).hostname, 'admin.crackersmela.com');
const output = path.resolve(process.env.CM_TRUST_OUTPUT || 'audit-evidence/trust-cards-20261013/browser-' + Date.now());
await mkdir(output, { recursive: true });
const chrome = process.env.CM_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(25000);
const checks = [], observations = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
const check = (name, pass, detail) => { checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) }); console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}`); };
// Captured from the rendered public page before this CSS-only change.
const expected = [
  { heading: '100% Original Products', body: 'Every item is sourced directly from licensed Sivakasi manufacturers and safety-tested before it reaches you.', icon: '<path d="M12 3 5 6v5c0 5 3 8.5 7 10 4-1.5 7-5 7-10V6z"></path><path d="m9.3 12 1.8 1.8 3.6-3.6"></path>' },
  { heading: 'Secure Payments', body: 'Encrypted checkout with UPI, card and cash-on-delivery — your details are never stored on our servers.', icon: '<rect x="5" y="11" width="14" height="9" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path>' },
  { heading: 'Fast Delivery', body: 'Same-day and next-day dispatch across Hyderabad & Secunderabad, free above ₹2,500.', icon: '<path d="M3 6h12v9H3z"></path><path d="M15 9h4.2L21 11.8V15h-6z"></path><circle cx="7" cy="17.5" r="1.8"></circle><circle cx="17" cy="17.5" r="1.8"></circle>' },
  { heading: 'Customer Support', body: 'Talk to a real person about sizes, safety or bulk orders — every day from 9am to 9pm.', icon: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z"></path>' },
];
const ready = async target => {
  await target.locator('#why .why-card').first().waitFor({ state: 'visible' });
  await target.waitForFunction(() => !!document.querySelector('#cm-published-styles'));
  await target.evaluate(() => document.fonts.ready);
  await target.locator('#why').scrollIntoViewIfNeeded();
};
const snapshot = target => target.evaluate(() => {
  const root = document.querySelector('#why');
  const box = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
  const rows = [...root.querySelectorAll('.why-card')].map(card => {
    const heading = card.querySelector('h3'), body = card.querySelector('p'), icon = card.querySelector('.why-card__ic'), svg = icon.querySelector('svg');
    const c = getComputedStyle(card), h = getComputedStyle(heading), p = getComputedStyle(body), i = getComputedStyle(icon), s = getComputedStyle(svg);
    const bounds = box(card), parts = [icon, heading, body].map(box);
    return {
      heading: heading.textContent.trim(), body: body.textContent.trim(), icon: svg.innerHTML,
      bounds, parts, background: c.backgroundColor, iconBackground: i.backgroundColor, iconShadow: i.boxShadow, iconColor: s.stroke,
      headingStyle: { color: h.color, font: h.fontFamily, size: parseFloat(h.fontSize), weight: Number(h.fontWeight) }, bodyStyle: { color: p.color, font: p.fontFamily, size: parseFloat(p.fontSize), lineHeight: parseFloat(p.lineHeight) },
      noninteractive: card.tagName === 'DIV' && card.tabIndex < 0 && !card.hasAttribute('role') && !card.querySelector('a,button,input,select,textarea,[tabindex]') && c.cursor !== 'pointer',
      contained: parts.every(r => r.x >= bounds.x - 1 && r.right <= bounds.right + 1 && r.y >= bounds.y - 1 && r.bottom <= bounds.bottom + 1),
      overlap: parts[0].bottom > parts[1].y + 1 || parts[1].bottom > parts[2].y + 1,
      overflow: [card, heading, body].some(node => node.scrollWidth > node.clientWidth + 1),
      crispIcon: s.filter === 'none' && s.transform === 'none' && parseFloat(s.strokeWidth) >= 1.5 && svg.getAttribute('viewBox') === '0 0 24 24',
    };
  });
  const effects = [];
  for (const node of [root, ...root.querySelectorAll('*')]) for (const pseudo of [null, '::before', '::after']) {
    const s = getComputedStyle(node, pseudo);
    if (pseudo && ['none', 'normal'].includes(s.content)) continue;
    const shadow = [...s.boxShadow.matchAll(/(-?[\d.]+)px/g)].map(match => Number(match[1]));
    const glow = s.boxShadow !== 'none' && (shadow.length > 4 || Math.abs(shadow[0]) > 2 || Math.abs(shadow[1]) > 3 || shadow[2] > 6 || shadow[3] > 0);
    if (s.backgroundImage !== 'none' || s.filter !== 'none' || s.backdropFilter !== 'none' || s.textShadow !== 'none' || glow) effects.push({ tag: node.tagName, class: node.getAttribute('class'), pseudo, image: s.backgroundImage, filter: s.filter, backdrop: s.backdropFilter, textShadow: s.textShadow, shadow: s.boxShadow });
  }
  return { rows, effects, title: root.querySelector('h2')?.textContent.trim(), subtitle: root.querySelector('.section__sub')?.textContent.trim(), viewport: window.innerWidth, documentWidth: document.documentElement.scrollWidth };
});
const rgb = color => (color.match(/[\d.]+/g) || []).map(Number);
const verify = (data, label, columns, editor = false) => {
  const rows = data.rows, firstRow = rows.filter(row => Math.abs(row.bounds.y - rows[0]?.bounds.y) < 2);
  const heights = rows.map(row => row.bounds.height);
  check(`${label} has four cards in ${columns} columns with equal heights`, rows.length === 4 && firstRow.length === columns && Math.max(...heights) - Math.min(...heights) <= 1, { heights, columns: firstRow.length });
  check(`${label} preserves the live headings, descriptions and SVG drawings`, JSON.stringify(rows.map(({ heading, body, icon }) => ({ heading, body, icon }))) === JSON.stringify(expected));
  check(`${label} preserves the section heading and subtitle`, data.title === 'Why Choose Crackers Mela?' && data.subtitle === 'A cleaner, safer and simpler way to buy fireworks — from the first click to the final sparkle.');
  check(`${label} cards have light solid backgrounds and crisp blue/white icons`, rows.every(row => rgb(row.background).slice(0, 3).every(channel => channel >= 240) && !row.background.startsWith('rgba') && row.iconBackground === 'rgb(23, 105, 210)' && row.iconShadow === 'none' && row.iconColor === 'rgb(255, 255, 255)' && row.crispIcon));
  check(`${label} has no gradients, patterns, blur or glow in section/title/pseudo-elements`, data.effects.length === 0, data.effects);
  check(`${label} text uses readable navy headings and the current muted body fonts`, rows.every(row => {
    const [red, green, blue] = rgb(row.headingStyle.color);
    return red < 70 && green < 120 && blue > green && blue < 200 && row.headingStyle.size >= 16 && row.headingStyle.weight >= 600 && /Plus Jakarta Sans/i.test(row.headingStyle.font) && row.bodyStyle.color === 'rgb(91, 107, 140)' && row.bodyStyle.size >= 13 && row.bodyStyle.lineHeight >= row.bodyStyle.size * 1.45 && /Plus Jakarta Sans/i.test(row.bodyStyle.font);
  }), rows.map(row => ({ heading: row.headingStyle, body: row.bodyStyle })));
  check(`${label} icons/headings/body align without overlaps or overflow`, rows.every(row => row.contained && !row.overlap && !row.overflow) && data.documentWidth <= data.viewport + 1 && [0, 1, 2].every(index => Math.max(...rows.map(row => row.parts[index].y - row.bounds.y)) - Math.min(...rows.map(row => row.parts[index].y - row.bounds.y)) <= 1));
  // The editor deliberately makes these same nodes selectable for editing.
  if (!editor) check(`${label} service cards remain noninteractive and outside the tab order`, rows.every(row => row.noninteractive));
};
const motion = async (target, label) => {
  const first = target.locator('#why .why-card').first();
  await first.scrollIntoViewIfNeeded(); await target.mouse.move(0, 0);
  const sampling = target.evaluate(() => new Promise(resolve => {
    const card = document.querySelector('#why .why-card'), nodes = [card, ...card.querySelectorAll('*')];
    const read = () => nodes.map(node => {
      const r = node.getBoundingClientRect(), s = getComputedStyle(node);
      return [r.x, r.y, r.width, r.height, s.transform, s.translate, s.scale, s.rotate, s.backgroundColor, s.color, s.boxShadow, s.filter, s.opacity];
    });
    const before = read(); let changed = false, began, samples = 0;
    const tick = time => {
      began ??= time; samples++;
      changed ||= read().some((row, i) => row.some((value, j) => j < 4 ? Math.abs(value - before[i][j]) > .5 : value !== before[i][j]));
      if (time - began < 350) requestAnimationFrame(tick); else resolve({ changed, samples });
    };
    requestAnimationFrame(tick);
  }));
  await first.hover();
  const result = await sampling;
  check(`${label} hover permits only border-color changes and keeps all content stationary`, !result.changed, result);
};
const screenshot = async (target, filename) => {
  const clip = await target.evaluate(() => {
    const section = document.querySelector('#why');
    window.scrollTo(0, Math.max(0, section.getBoundingClientRect().top + window.scrollY - 120));
    const r = section.getBoundingClientRect(), x = Math.max(0, r.x + window.scrollX - 8), y = Math.max(0, r.y + window.scrollY - 8);
    // Preserve all section content and background; hide unrelated interactive
    // page chrome only while capturing the complete section.
    for (const node of document.querySelectorAll('body *')) if (!section.contains(node) && !node.contains(section) && ['fixed', 'sticky'].includes(getComputedStyle(node).position) && (node.matches('a,button,input') || node.querySelector('a,button,input'))) node.setAttribute('data-trust-screenshot-chrome', '');
    return { x, y, width: Math.min(document.documentElement.scrollWidth - x, r.width + 16), height: Math.min(document.documentElement.scrollHeight - y, r.height + 16) };
  });
  try { await target.screenshot({ path: path.join(output, filename), fullPage: true, clip, style: '[data-trust-screenshot-chrome] { opacity: 0 !important; }' }); }
  finally { await target.evaluate(() => document.querySelectorAll('[data-trust-screenshot-chrome]').forEach(node => node.removeAttribute('data-trust-screenshot-chrome'))); }
};
let failure;
try {
  const response = await page.goto(baseUrl);
  check('Public homepage responds successfully', response?.ok()); await ready(page);
  const decline = page.locator('[data-analytics-reject]'); if (await decline.isVisible()) await decline.click();
  for (const [width, columns] of [[1440, 4], [768, 2], [390, 1], [320, 1]]) {
    await page.setViewportSize({ width, height: 1000 }); await page.mouse.move(0, 0); await page.locator('#why').scrollIntoViewIfNeeded();
    const data = await snapshot(page); observations.push({ label: 'public-' + width, ...data }); verify(data, `${width}px`, columns);
    if ([1440, 390, 320].includes(width)) await screenshot(page, `trust-${width}.png`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 }); await motion(page, 'Desktop');
  await page.emulateMedia({ reducedMotion: 'reduce' }); await motion(page, 'Reduced motion');
  if (process.argv.includes('--preview')) {
    const fixture = JSON.parse(await readFile(process.env.CM_HERO_FIXTURE || 'audit-evidence/home-showcase-20261013/fixture.json', 'utf8'));
    for (const url of [baseUrl, fixture.baseUrl, fixture.publicUrl]) assert.ok(['localhost', '127.0.0.1'].includes(new URL(url).hostname), 'Preview authentication is restricted to loopback');
    assert.equal((await (await context.request.get(fixture.baseUrl + '/__fixture-health')).json()).isolated, true);
    const previewContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    try {
      const session = await (await previewContext.request.get(fixture.baseUrl + '/staff-auth.php?a=session')).json();
      const login = await previewContext.request.post(fixture.baseUrl + '/staff-auth.php?a=login', { headers: { Origin: fixture.baseUrl, 'X-CSRF-Token': session.csrfToken }, data: { email: fixture.email, password: fixture.password } });
      assert.equal((await login.json()).authenticated, true, 'Synthetic fixture authentication failed');
      const publication = await (await context.request.get(new URL('/cms-api.php?a=published&page=home', baseUrl).href)).json();
      const preview = await previewContext.newPage(); preview.on('pageerror', error => errors.push(error.message));
      await preview.goto(fixture.baseUrl + '/visual-preview.php?page=home'); await preview.waitForFunction(() => !!window.CMCms?.baseline());
      await preview.evaluate(published => window.CMCms.apply(published), publication.published); await ready(preview);
      for (const [width, columns] of [[1440, 4], [390, 1]]) {
        await preview.setViewportSize({ width, height: 1000 }); await preview.locator('#why').scrollIntoViewIfNeeded();
        const data = await snapshot(preview); observations.push({ label: 'preview-' + width, ...data }); verify(data, `Local preview ${width}px`, columns, true);
        await screenshot(preview, `trust-preview-${width}.png`);
      }
    } finally { await previewContext.close(); }
  }
  check('No uncaught browser errors', errors.length === 0, errors);
} catch (error) {
  failure = error.message; console.error(failure);
  try { await page.screenshot({ path: path.join(output, 'failure.png') }); } catch {}
} finally {
  await browser.close();
  const passed = !failure && checks.every(item => item.pass);
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ passed, baseUrl, scope: 'Read-only public verification; optional synthetic local preview without saves.', checks, observations, errors, ...(failure ? { failure } : {}) }, null, 2));
  console.log(`Evidence: ${output}`); if (!passed) process.exitCode = 1;
}
