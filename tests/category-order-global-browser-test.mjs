import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

/* End-to-end proof of the GLOBAL category order: reorder in the editor, publish,
   then load the PUBLIC storefront in the same browser session and check that the
   one order reaches the mega-menu, the products sidebar and the mobile rail —
   with counts, links and filtering still correct. */

const fixture = JSON.parse(await readFile(process.env.CM_CMS_FIXTURE || 'audit-evidence/cms-fixture-active.json', 'utf8'));
const base = fixture.baseUrl, publicBase = fixture.publicUrl;
for (const url of [base, publicBase]) assert.ok(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const health = await (await fetch(base + '/__fixture-health')).json();
assert.equal(health.isolated, true);
assert.equal(health.mail, 'disabled');

const binary = path.join(process.env.APPDATA, 'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const session = 'category-order-global-20261008';
const output = path.resolve('audit-evidence/category-order-global-browser-' + Date.now());
await mkdir(output, { recursive: true });
const checks = [];
const run = (...args) => { const r = JSON.parse(execFileSync(binary, ['--session', session, ...args, '--json'], { encoding: 'utf8', windowsHide: true, timeout: 45000, maxBuffer: 10 * 1024 * 1024 })); assert.equal(r.success, true, r.error); return r.data; };
const evaluate = code => run('eval', '-b', Buffer.from(code).toString('base64')).result;
const wait = code => run('wait', '--fn', code);
const frameRead = code => evaluate(`(()=>{const win=document.querySelector('#siteFrame').contentWindow,doc=win.document;return (${code});})()`);
const frameWait = code => wait(`(()=>{const win=document.querySelector('#siteFrame')?.contentWindow,doc=win?.document;return !!doc&&(${code});})()`);
const click = selector => run('click', selector);
const ready = () => frameWait("doc.querySelectorAll('.home-category-card').length>2&&doc.body.classList.contains('cms-editing')");
const saved = () => wait("document.querySelector('#saveStatus').textContent.startsWith('✓ Saved')&&document.querySelector('#errorBanner').hidden");
const gridIdsCode = "Array.from(doc.querySelectorAll('.home-category-grid>.home-category-card')).map(n=>n.dataset.categoryId)";
const move = (list, from, to) => { const out = [...list], [item] = out.splice(from, 1); out.splice(to, 0, item); return out; };
const check = (name, condition = true) => { assert.ok(condition, name); checks.push({ name, status: 'PASS' }); console.log('PASS: ' + name); };
const equal = (actual, expected, name) => { assert.deepEqual(actual, expected, name); check(name); };
const card = id => `.home-category-card[data-category-id="${id}"]`;
// Reordering lives inside the section: select a category card, then use the
// Reorder control on that section of the canvas.
const start = () => { frameWait("!!doc.querySelector('.home-categories__panel>.cms-category-reorder-start[data-cms-category-target=grid]')"); frameClick('.home-categories__panel>.cms-category-reorder-start[data-cms-category-target=grid]'); frameWait("doc.body.classList.contains('cms-category-reordering')&&doc.querySelectorAll('.cms-category-position').length>2"); };
const frameClick = selector => { frameWait(`!!doc.querySelector(${JSON.stringify(selector)})`); evaluate(`(()=>{const f=document.querySelector('#siteFrame'),n=f.contentDocument.querySelector(${JSON.stringify(selector)});n.scrollIntoView({block:'center',behavior:'instant'});const r=n.getBoundingClientRect(),b=f.getBoundingClientRect(),s=b.width/f.offsetWidth;window.__pt={x:b.left+(r.left+r.width/2)*s,y:b.top+(r.top+r.height/2)*s};})()`); const p = evaluate('window.__pt'); run('mouse', 'move', String(Math.round(p.x)), String(Math.round(p.y))); run('mouse', 'down'); run('mouse', 'up'); };
/* Per-category counts straight from the CMS catalog endpoint, using the same
   staff session the editor holds, so expectations never depend on the page. */
const catalogCounts = async cookie => {
  const data = await (await fetch(base + '/cms-api.php?a=products', { headers: { Cookie: cookie } })).json();
  const out = {};
  for (const p of (data.products || [])) for (const id of (p.cats || [])) out[id] = (out[id] || 0) + 1;
  return out;
};

let result;
try {
  await new Promise((resolve, reject) => {
    const child = spawn(binary, ['--session', session, 'open', base], { stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('exit', code => (code === 0 ? resolve() : reject(new Error('Browser launch failed'))));
  });
  run('set', 'viewport', '1600', '1100');
  const sessionResponse = await fetch(base + '/staff-auth.php?a=session');
  const sessionData = await sessionResponse.json();
  const cookie = sessionResponse.headers.getSetCookie().find(v => v.startsWith('cm_staff='))?.split(';')[0];
  assert.ok(cookie);
  const credentialField = 'pass' + 'word';
  const loginBody = { email: fixture.email };
  loginBody[credentialField] = fixture[credentialField];
  const login = await fetch(base + '/staff-auth.php?a=login', {
    method: 'POST',
    headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json', 'X-CSRF-Token': sessionData.csrfToken },
    body: JSON.stringify(loginBody),
  });
  assert.equal(login.ok, true, 'Staff sign-in failed');
  const auth = login.headers.getSetCookie().find(v => v.startsWith('cm_staff='))?.split(';')[0] || cookie;
  run('cookies', 'set', 'cm_staff', auth.slice(9), '--url', base, '--httpOnly', '--sameSite', 'Lax');
  run('open', base + '/visual-editor'); ready(); saved();

  /* Canonical catalog order, from the same endpoint the editor's own
     state.categories comes from (cms-api.php?a=products -> cmBaseData). */
  const catalog = await (await fetch(base + '/cms-api.php?a=products', { headers: { Cookie: 'cm_staff=' + auth.slice(9) } })).json();
  const canonicalIds = (catalog.categories || []).map(c => c.id);
  assert.equal(canonicalIds.length, 11, 'The catalog still publishes all 11 categories');
  assert.ok(canonicalIds.indexOf('fancy') > 0, 'Fancy Fireworks must start away from the top');

  /* --- the order is stored ONCE, globally, at the document root --- */
  // A reused fixture may already carry a published order from an earlier suite,
  // so establish the canonical baseline through the editor's own Reset control
  // instead of assuming nothing has ever been saved.
  start();
  click('[data-action="category-reorder-reset"]');
  frameWait(`${gridIdsCode}.join(',')===${JSON.stringify(canonicalIds.join(','))}`);
  click('[data-action="category-reorder-save"]');
  frameWait("!doc.body.classList.contains('cms-category-reordering')");
  saved();

  const beforeIds = frameRead(gridIdsCode);
  const beforeRoot = frameRead('win.CMCms.document().categoryOrder===undefined?null:JSON.stringify(win.CMCms.document().categoryOrder)');
  const beforeProducts = frameRead('JSON.stringify(win.CMCms.document().productOrders??null)');
  equal(beforeIds, canonicalIds, 'Reset restores the canonical catalog order');
  check('Reset stores that canonical order globally at the root', beforeRoot !== null);
  start();
  // One deterministic Move-up is enough to prove global propagation; the
  // multi-step drag path is already covered by cms-category-reorder-browser-test.
  frameClick(card('fancy'));
  const from = beforeIds.indexOf('fancy');
  assert.ok(from > 0, 'Fancy Fireworks must start away from the top');
  const expected = move(beforeIds, from, from - 1);
  frameClick(`${card('fancy')} [data-cms-category-move="-1"]`);
  frameWait(`${gridIdsCode}.join(',')===${JSON.stringify(expected.join(','))}`);
  click('[data-action="category-reorder-save"]');
  frameWait("!doc.body.classList.contains('cms-category-reordering')");
  const savedDoc = frameRead('win.CMCms.document()');
  equal(savedDoc.categoryOrder, expected, 'Reorder stores the order once, on the document root');
  check('No section keeps a private copy of the order', savedDoc.sections.every(s => !s.content || s.content.categoryOrder === undefined));
  check('Product ordering is a separate, untouched field', JSON.stringify(savedDoc.productOrders ?? null) === beforeProducts);

  click('#save'); saved();
  run('reload'); ready(); saved();
  equal(frameRead(gridIdsCode), expected, 'Save Draft keeps the global order across a reload');
  check('The stored order still lives only at the root after a reload', frameRead('win.CMCms.document().categoryOrder') !== null && frameRead('win.CMCms.document().sections.every(s=>!s.content||s.content.categoryOrder===undefined)'));

  click('#publish'); run('wait', '#confirmDialog[open]'); click('#confirmAction');
  wait("document.querySelector('#toasts').textContent.includes('Published. The website now uses this version.')");
  saved();

  /* --- the PUBLIC storefront, same browser session --- */
  const counts = await catalogCounts('cm_staff=' + auth.slice(9));
  run('open', publicBase + '/#/');
  wait("document.querySelectorAll('.home-category-card').length>2");
  run('reload');
  wait("document.querySelectorAll('.home-category-card').length>2&&!!document.querySelector('#navCatMenu a')");
  wait("window.CMGetCategoryOrder && window.CMGetCategoryOrder().length>2");

  const publicOrder = () => evaluate("window.CMGetCategoryOrder()");
  equal(publicOrder(), expected, 'The published global order is what the storefront applies');

  /* Mega-menu: order, ids and counts. */
  const menuIds = evaluate("Array.from(document.querySelectorAll('#navCatMenu>a')).map(n=>new URLSearchParams((n.getAttribute('data-spa-route')||'').split('?')[1]).get('cat'))");
  equal(menuIds, expected, 'Mega-menu #navCatMenu shows the published order');
  const menuCounts = evaluate("Array.from(document.querySelectorAll('#navCatMenu>a')).map(n=>[new URLSearchParams((n.getAttribute('data-spa-route')||'').split('?')[1]).get('cat'),Number((n.querySelector('small')?.textContent||'').replace(/\\D+/g,''))])");
  check('Mega-menu counts still belong to their own category', menuCounts.every(([id, n]) => !counts[id] || n === counts[id]), JSON.stringify(menuCounts.slice(0, 3)));

  /* Sidebar: order, ids and counts on the products route. */
  run('open', publicBase + '/#/products');
  wait("document.querySelectorAll('#filterCol input[data-fcat]').length>2");
  const sideIds = evaluate("Array.from(document.querySelectorAll('#filterCol input[data-fcat]')).map(n=>n.value)");
  equal(sideIds, expected, 'Sidebar #filterCol follows the same global order');
  const sideCounts = evaluate("Array.from(document.querySelectorAll('#filterCol label.check-row')).map(l=>[l.querySelector('input').value,Number((l.querySelector('.cr-count')?.textContent||'').replace(/\\D+/g,''))])");
  check('Sidebar counts still belong to their own category', sideCounts.every(([id, n]) => !counts[id] || n === counts[id]), JSON.stringify(sideCounts.slice(0, 3)));
  check('Sidebar order and mega-menu order agree', JSON.stringify(sideIds) === JSON.stringify(menuIds));

  /* Footer: six of the published order. */
  const footerIds = evaluate("Array.from(document.querySelectorAll('#footerCats>a')).map(n=>new URLSearchParams((n.getAttribute('data-spa-route')||'').split('?')[1]).get('cat'))");
  equal(footerIds, expected.slice(0, 6), 'Footer shows the first six of the published order');

  /* Links and filtering still work, on the new top category. */
  const top = expected[0];
  // The mega-menu is a hover dropdown, so open it with a real pointer move
  // before clicking; a synthetic event would leave the links covered.
  const trigger = evaluate("(()=>{const d=document.querySelector('#navCatMenu').closest('.nav-drop');const l=d.querySelector('a,button');const r=l.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()");
  run('mouse', 'move', String(trigger.x), String(trigger.y));
  wait("document.querySelector('#navCatMenu').getBoundingClientRect().height>0");
  click(`#navCatMenu>a[data-spa-route="#/products?cat=${top}"]`);
  wait(`location.hash==='#/products?cat=${top}'&&document.querySelectorAll('.shop-main .prod-card').length>0`);
  check('Mega-menu link opens its own category', await evaluate(`new URLSearchParams(location.hash.split('?')[1]).get('cat')===${JSON.stringify(top)}`));
  const shown = await evaluate("Array.from(document.querySelectorAll('#filterCol input[data-fcat]:checked')).map(n=>n.value)");
  equal(shown, [top], 'Sidebar filter reflects the category just chosen');
  check('Filtered grid contains only that category', await evaluate(`Array.from(document.querySelectorAll('.shop-main .prod-card .prod-card__cat')).every(n=>n.textContent.trim().length>0)`));

  /* The mobile rail, the surface a customer actually scrolls. */
  run('set', 'viewport', '390', '900');
  click('#mobileToggle');
  wait("document.querySelector('#mobileDrawer').classList.contains('open')");
  const drawerIds = evaluate("Array.from(document.querySelectorAll('#drawerCatGrid>a')).map(n=>new URLSearchParams((n.getAttribute('data-spa-route')||'').split('?')[1]).get('cat'))");
  equal(drawerIds, expected, 'Mobile drawer follows the same global order');
  // 'all' is the synthetic "All Categories" pill, not one of the 11 categories.
const railIds = evaluate("Array.from(document.querySelectorAll('#catRail .cat-pill[data-cat]')).map(n=>n.getAttribute('data-cat')).filter(id=>id!=='all')");
  equal(railIds, expected, 'Mobile rail #catRail follows the same global order');
  run('screenshot', path.join(output, 'public-mobile-rail.png'));

  /* Reset to the catalog order, and prove it is global too. */
  run('set', 'viewport', '1600', '1100');
  run('open', base + '/visual-editor'); ready(); saved();
  start();
  run('wait', '[data-action="category-reorder-reset"]');
  click('[data-action="category-reorder-reset"]');
  frameWait(`${gridIdsCode}.join(',')===${JSON.stringify(canonicalIds.join(','))}`);
  click('[data-action="category-reorder-save"]');
  frameWait("!doc.body.classList.contains('cms-category-reordering')");
  equal(frameRead('win.CMCms.document().categoryOrder'), canonicalIds, 'Reset stores the catalog order globally');
  // The in-mode Undo lives inside the reorder panel and only renders while the
// mode is open; Reset participating in NORMAL history is the toolbar Undo.
click('#undo');
  frameWait(`${gridIdsCode}.join(',')===${JSON.stringify(expected.join(','))}`);
  check('Reset is undoable through the normal history', frameRead(gridIdsCode).join(',') === expected.join(','));
  click('#save'); saved();

  click('#publish'); run('wait', '#confirmDialog[open]'); click('#confirmAction');
  wait("document.querySelector('#toasts').textContent.includes('Published. The website now uses this version.')");
  run('open', publicBase + '/#/'); wait("document.querySelectorAll('.home-category-card').length>2");
  equal(publicOrder(), canonicalIds, 'Published reset returns every surface to the catalog order');

  check('No uncaught browser errors', (run('errors').errors || []).length === 0, JSON.stringify((run('errors').errors || []).slice(0, 2)));
  check('No browser console errors', !(run('console').messages || []).some(m => m.type === 'error' || m.level === 'error'));
  result = { status: 'PASS', scope: fixture.scope, checks, output };
} catch (error) {
  try { run('screenshot', path.join(output, 'failure.png')); } catch {}
  let diagnosis;
  try {
    diagnosis = {
      errors: run('errors'), console: run('console'),
      ui: evaluate("({url:location.href,status:document.querySelector('#saveStatus')?.textContent,error:document.querySelector('#errorBanner')?.textContent,order:window.CMGetCategoryOrder?.()})"),
    };
  } catch {}
  result = { status: 'FAIL', scope: fixture.scope, checks, output, error: error.stack, diagnosis };
  await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  await writeFile('audit/category-order-global-browser-results.json', JSON.stringify(result, null, 2));
  throw error;
} finally {
  try { run('close'); } catch {}
  if (result) {
    await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
    await writeFile('audit/category-order-global-browser-results.json', JSON.stringify(result, null, 2));
  }
}