import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// End-to-end UI checks against the actual application copied by cms-fixture.py.
// Refuse every non-loopback target, including values in the fixture manifest.
const fixture = JSON.parse(await readFile('audit-evidence/cms-fixture-active.json', 'utf8'));
const base = fixture.baseUrl;
for (const value of [base, fixture.publicUrl]) {
  const url = new URL(value);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.protocol === 'http:', 'QA target must be loopback');
}
const health = await (await fetch(base + '/__fixture-health')).json();
assert.equal(health.isolated, true);
assert.equal(health.mail, 'disabled');
const binary = process.platform === 'win32'
  ? path.join(process.env.APPDATA, 'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe')
  : 'agent-browser';
const session = process.env.CM_CMS_BROWSER_SESSION || 'cms-qa';
const output = path.resolve('audit-evidence/cms-browser-' + Date.now());
await mkdir(output, { recursive: true });
const checks = [];
const run = (...args) => {
  const raw = execFileSync(binary, ['--session', session, ...args, '--json'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const data = JSON.parse(raw);
  assert.equal(data.success, true, data.error || args[0]);
  return data.data;
};
const evaluate = code => run('eval', '-b', Buffer.from(code).toString('base64')).result;
const wait = code => run('wait', '--fn', code);
const click = selector => run('click', selector);
const fill = (selector, value) => run('fill', selector, String(value));
const check = (name, condition = true) => { assert.ok(condition, name); checks.push({ name, status: 'PASS' }); console.log('PASS: ' + name); };
const frameRead = code => evaluate(`(() => { const win=document.querySelector('#siteFrame').contentWindow, doc=win.document; return (${code}); })()`);
const frameClick = selector => {
  // The canvas is CSS-scaled. CDP's iframe selector click omits that scale on
  // Windows, so use the actual parent-window screen coordinates instead.
  const point = evaluate(`(() => {
    const frame=document.querySelector('#siteFrame'), win=frame.contentWindow;
    const target=win.document.querySelector(${JSON.stringify(selector)});
    target.scrollIntoView({block:'center',behavior:'instant'});
    const box=target.getBoundingClientRect(), outer=frame.getBoundingClientRect();
    const scale=outer.width/frame.offsetWidth;
    return {x:outer.left+(box.left+box.width/2)*scale,y:outer.top+(box.top+box.height/2)*scale};
  })()`);
  run('mouse', 'move', String(Math.round(point.x)), String(Math.round(point.y)));
  run('mouse', 'down'); run('mouse', 'up');
};
const frameWait = code => wait(`(() => { const win=document.querySelector('#siteFrame')?.contentWindow, doc=win?.document; return !!doc && (${code}); })()`);
const saved = () => wait("document.querySelector('#saveStatus').textContent.startsWith('Draft saved') && document.querySelector('#errorBanner').hidden");
const confirm = () => { run('wait', '#confirmDialog[open]'); click('#confirmAction'); };
const selectorFor = (section, element) => `[data-cms-section="${section}"]${element === 'eroot' ? '' : ` [data-cms-element="${element}"]`}`;
const editorReady = page => wait(`document.querySelector('#loading').hidden && document.querySelector('#siteFrame').contentWindow.CMCms?.page()===${JSON.stringify(page)}`);

class Client {
  cookie = ''; csrf = '';
  async request(url, body, options = {}) {
    const headers = { Cookie: this.cookie, Origin: base, ...(body ? { 'Content-Type': 'application/json' } : {}) };
    if (body && options.csrf !== false) headers['X-CSRF-Token'] = this.csrf;
    const response = await fetch(base + url, { method: body ? 'POST' : 'GET', headers: { ...headers, ...options.headers }, body: body ? JSON.stringify(body) : undefined });
    for (const cookie of response.headers.getSetCookie()) if (cookie.startsWith('cm_staff=')) this.cookie = cookie.split(';')[0];
    const value = await response.json();
    if (value.csrfToken) this.csrf = value.csrfToken;
    return { status: response.status, value };
  }
  async login() {
    await this.request('/staff-auth.php?a=session');
    const result = await this.request('/staff-auth.php?a=login', { email: fixture.email, password: fixture.password });
    assert.equal(result.status, 200);
  }
}
const client = new Client();
await client.login();
const publicGet = async page => (await (await fetch(base + '/cms-api.php?a=published&page=' + page)).json()).published;

try {
  const anonymous = await fetch(base + '/visual-editor');
  check('Editor requires real staff authentication', anonymous.status === 401);
  // A fresh Windows daemon must not inherit execFileSync's output pipe.
  // Starting with ignored streams lets the CLI exit independently of Chrome.
  await new Promise((resolve, reject) => {
    const launcher = spawn(binary, ['--session', session, 'open', base + '/#/staff'], { stdio: 'ignore', windowsHide: true });
    launcher.once('error', reject);
    launcher.once('exit', code => code === 0 ? resolve() : reject(new Error('Local browser did not launch')));
  });
  run('set', 'viewport', '1600', '1000');
  run('open', base + '/#/staff');
  run('wait', '#goAuthStaff'); click('#goAuthStaff');
  run('wait', '#auEmail'); fill('#auEmail', fixture.email); fill('#auPass', fixture.password); click('#auSubmit');
  run('wait', '#staffPanel');
  check('Existing staff login UI authenticates the synthetic account');
  run('open', base + '/visual-editor'); editorReady('home'); saved();
  const baseline = frameRead('win.CMCms.baseline()');
  check('Canvas contains current website and real catalog', baseline.sections.some(s => s.id === 'home:hero') && frameRead('doc.querySelectorAll(".prod-card").length') > 0);
  const initial = (await client.request('/cms-api.php?a=load&page=home')).value;
  const initialRevision = (await client.request('/cms-api.php?a=revisions&page=home')).value.revisions[0].id;
  const publishedBefore = await publicGet('home');
  const hero = baseline.sections.find(s => s.id === 'home:hero');
  const buttonEntry = Object.entries(hero.elements).find(([, element]) => element.kind === 'button' && /shop|explore|buy/i.test(element.text || ''))
    || Object.entries(hero.elements).find(([, element]) => element.kind === 'button' && element.text);
  assert.ok(buttonEntry, 'Current hero must expose an existing call to action');
  const [buttonId, originalButton] = buttonEntry;
  const buttonSelector = selectorFor(hero.id, buttonId);
  frameClick(buttonSelector); run('wait', '[data-field="text"][data-scope="element"]');
  check('Clicking actual canvas button opens its text properties', evaluate('document.querySelector("[data-field=text]").value') === originalButton.text);
  const editedText = 'Shop festive favourites · local QA';
  fill('[data-field="text"][data-scope="element"]', editedText);
  frameWait(`doc.querySelector(${JSON.stringify(buttonSelector)}).textContent===${JSON.stringify(editedText)}`);
  check('Button text updates immediately in the actual storefront');
  click('#undo'); frameWait(`doc.querySelector(${JSON.stringify(buttonSelector)}).textContent===${JSON.stringify(originalButton.text)}`);
  click('#redo'); frameWait(`doc.querySelector(${JSON.stringify(buttonSelector)}).textContent===${JSON.stringify(editedText)}`);
  check('Undo and redo restore actual rendered text');
  click('[data-tab="style"]');
  fill('[data-field="fontSize"][data-scope="style"]', '23px');
  click('[data-device="mobile"]'); fill('[data-field="fontSize"][data-scope="style"]', '15px');
  frameWait(`win.innerWidth===390 && win.getComputedStyle(doc.querySelector(${JSON.stringify(buttonSelector)})).fontSize==='15px'`);
  click('[data-device="desktop"]');
  frameWait(`win.innerWidth===1280 && win.getComputedStyle(doc.querySelector(${JSON.stringify(buttonSelector)})).fontSize==='23px'`);
  check('Mobile font overrides remain independent of desktop values');
  click('[data-device="tablet"]');
  check('Tablet canvas uses its real 768px viewport', frameRead('win.innerWidth') === 768);
  click('[data-device="desktop"]');
  click('[data-select-section="' + hero.id + '"]');
  const orderBefore = evaluate('[...document.querySelectorAll("[data-section-row]")].map(n=>n.dataset.sectionRow)');
  click('[data-section-action="down"][data-id="' + hero.id + '"]');
  const orderAfter = evaluate('[...document.querySelectorAll("[data-section-row]")].map(n=>n.dataset.sectionRow)');
  check('Section reorder changes both structure and actual canvas', orderAfter.indexOf(hero.id) === orderBefore.indexOf(hero.id) + 1 && frameRead('[...doc.querySelector("#view").children].map(n=>n.dataset.cmsSection)')[1] === hero.id);
  click('[data-section-action="visibility"][data-id="' + hero.id + '"]');
  frameWait(`doc.querySelector('[data-cms-section="${hero.id}"]').hidden`);
  click('[data-section-action="visibility"][data-id="' + hero.id + '"]');
  check('Hide and show change actual section visibility');
  click('[data-nav="add"]'); click('[data-add-section="text"]');
  fill('[data-field="heading"][data-scope="content"]', 'A real new section');
  const addedId = evaluate('document.querySelector(".section-row.active").dataset.sectionRow');
  frameWait(`doc.querySelector('[data-cms-section="${addedId}"]')?.textContent.includes('A real new section')`);
  click('[data-section-action="duplicate"][data-id="' + addedId + '"]');
  const duplicatedId = evaluate('document.querySelector(".section-row.active").dataset.sectionRow');
  check('Duplicate creates a second structured section', duplicatedId !== addedId);
  click('[data-section-action="delete"][data-id="' + duplicatedId + '"]'); confirm();
  frameWait(`!doc.querySelector('[data-cms-section="${duplicatedId}"]')`);
  click('#undo'); frameWait(`!!doc.querySelector('[data-cms-section="${duplicatedId}"]')`);
  click('#redo'); frameWait(`!doc.querySelector('[data-cms-section="${duplicatedId}"]')`);
  check('Create, duplicate, delete, undo and redo persist structured sections');
  saved();
  const draft = (await client.request('/cms-api.php?a=load&page=home')).value;
  check('Autosave persists the changed draft through the real API', draft.draft.sections.find(s => s.id === hero.id).elements[buttonId].text === editedText);
  check('Draft edits remain invisible to public published endpoint', JSON.stringify(await publicGet('home')) === JSON.stringify(publishedBefore));
  click('#preview');
  check('Visitor preview disables edit interception', frameRead('win.CM_EDITOR_INTERACTIVE') === true);
  click('#preview');
  click('#publish'); confirm();
  wait("document.querySelector('#toasts').textContent.includes('Published.')");
  const published = await publicGet('home');
  check('Publishing exposes the saved version publicly', published.sections.find(s => s.id === hero.id).elements[buttonId].text === editedText);
  run('screenshot', path.join(output, 'editor-desktop.png'));
  run('tab', 'new', fixture.publicUrl + '/');
  wait(`document.querySelector(${JSON.stringify(buttonSelector)})?.textContent===${JSON.stringify(editedText)}`);
  check('New public visitor renders published text from persistent CMS data');
  run('screenshot', path.join(output, 'published-storefront.png'));
  run('tab', 'close');
  click('#history'); run('wait', `[data-restore="${initialRevision}"]`); click(`[data-restore="${initialRevision}"]`); confirm();
  wait("document.querySelector('#toasts').textContent.includes('Revision restored')");
  frameWait(`doc.querySelector(${JSON.stringify(buttonSelector)}).textContent===${JSON.stringify(originalButton.text)}`);
  check('Restoring a revision changes only the draft', (await publicGet('home')).sections.find(s => s.id === hero.id).elements[buttonId].text === editedText);
  click('#publish'); confirm(); wait("document.querySelector('#toasts').textContent.includes('Published.')");
  check('Restored original version can be published', (await publicGet('home')).sections.find(s => s.id === hero.id).elements[buttonId].text === originalButton.text);

  click('[data-nav="media"]'); run('wait', '.media-tile');
  const libraryCount = evaluate('document.querySelectorAll(".media-tile").length');
  check('Media library browses existing website images', libraryCount > 0);
  fill('#mediaSearch', 'p26'); wait('document.querySelectorAll(".media-tile").length>0 && [...document.querySelectorAll(".media-tile")].every(n=>n.title.includes("p26"))');
  click('.media-tile');
  check('Bundled product image cannot be deleted', !evaluate('!!document.querySelector("#deleteMedia")'));
  const pngFile = path.join(output, 'fixture-upload.png');
  const php = path.resolve('audit-evidence/tools/php-8.3.35/php.exe');
  const png = execFileSync(php, ['-d', 'extension_dir=' + path.resolve('audit-evidence/tools/php-8.3.35/ext'), '-d', 'extension=gd', '-r', '$im=imagecreatetruecolor(32,24);imagepng($im);imagedestroy($im);']);
  await writeFile(pngFile, png);
  run('upload', '#mediaUpload', pngFile); run('wait', '#deleteMedia');
  check('Image upload uses the existing authenticated upload endpoint');
  fill('#mediaAlt', 'Synthetic local QA image'); click('#saveMediaAlt');
  wait("document.querySelector('#toasts').textContent.includes('Alt text saved')");
  click('#showCrop'); click('#saveCrop');
  wait("document.querySelector('#toasts').textContent.includes('Cropped copy saved')");
  check('Crop creates a new raster image through existing storage');
  click('#deleteMedia'); confirm();
  wait("document.querySelector('#mediaDetails').textContent.includes('Image deleted')");
  check('Unused uploaded image can be deleted');
  click('#closeMedia');
  const denial = await client.request('/cms-media.php?a=delete', { url: '../data/customers.json' });
  check('Media API rejects traversal', denial.status === 422 || denial.status === 404);
  const missingCsrf = await client.request('/cms-media.php?a=update', { url: '/images/products/p26.webp', alt: 'no csrf' }, { csrf: false });
  check('Media mutations require CSRF', missingCsrf.status === 403);

  const pages = (await client.request('/cms-api.php?a=pages')).value.pages;
  for (const page of pages) {
    click('[data-nav="pages"]'); click(`[data-page="${page.id}"]`); editorReady(page.id); saved();
    check('Actual route can be edited: ' + page.name, frameRead('win.CMCms.baseline()?.sections.length') > 0);
  }
  run('tab', 'new', fixture.publicUrl + '/#/products');
  run('wait', '.prod-card'); check('Public product listing remains functional');
  click('.prod-card a'); run('wait', '#pdAdd');
  click('#pdAdd');
  check('Existing Add to cart adds the product', evaluate('JSON.parse(localStorage.getItem("cm2.cart")||"[]").length') === 1);
  run('open', fixture.publicUrl + '/#/cart');
  run('wait', '.cart-page'); check('Cart route remains functional');
  // Fill no customer information and submit no order in browser tests. The
  // isolated backend suite separately exercises orders and disabled email.
  run('open', fixture.publicUrl + '/#/checkout');
  wait('document.querySelector("#view").textContent.trim().length>0');
  check('Checkout route loads without script errors');
  const errors = run('errors').errors || [];
  check('Browser reports no uncaught exceptions', errors.length === 0);
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ scope: fixture.scope, status: 'PASS', checks }, null, 2));
  await writeFile('audit/cms-browser-results.json', JSON.stringify({ scope: fixture.scope, status: 'PASS', output, checks }, null, 2));
  console.log(`PASS: ${checks.length} browser checks. Evidence: ${output}`);
} catch (error) {
  try { run('screenshot', path.join(output, 'failure.png')); } catch { /* preserve primary failure */ }
  await writeFile('audit/cms-browser-results.json', JSON.stringify({ scope: fixture.scope, status: 'FAIL', output, checks, error: error.message }, null, 2));
  throw error;
} finally {
  try { run('close'); } catch { /* already stopped */ }
}
