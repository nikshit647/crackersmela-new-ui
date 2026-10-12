import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Actual editor + PHP CMS in a disposable loopback fixture. No production writes.
const fixture = JSON.parse(await readFile(process.env.CM_EDITOR_FIXTURE || 'audit-evidence/product-experience-20261010/editor-fixture.json', 'utf8'));
const base = fixture.baseUrl;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const health = await (await fetch(base + '/__fixture-health')).json();
assert.equal(health.isolated, true);
assert.equal(health.mail, 'disabled');
const binary = path.join(process.env.APPDATA, 'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const session = 'editor-selection-box-20261010';
const output = path.resolve('audit-evidence/editor-selection-box-' + Date.now());
await mkdir(output, { recursive: true });
const checks = [];
let observed;
const run = (...args) => {
  const result = JSON.parse(execFileSync(binary, ['--session', session, ...args, '--json'], { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 }));
  assert.equal(result.success, true, result.error || args[0]);
  return result.data;
};
const evaluate = code => run('eval', '-b', Buffer.from(code).toString('base64')).result;
const frame = code => evaluate(`(() => { const win=document.querySelector('#siteFrame').contentWindow,doc=win.document; return (${code}); })()`);
const wait = code => run('wait', '--fn', code);
const frameWait = code => wait(`(() => { const win=document.querySelector('#siteFrame')?.contentWindow,doc=win?.document; return !!doc&&(${code}); })()`);
const check = (name, pass) => { checks.push({ name, pass: !!pass }); console.log((pass ? 'PASS: ' : 'FAIL: ') + name); };
const saved = () => wait("document.querySelector('#saveStatus').textContent.startsWith('✓ Saved') && document.querySelector('#errorBanner').hidden");
const clickCanvas = selector => {
  const point = evaluate(`(() => { const frame=document.querySelector('#siteFrame'), node=frame.contentDocument.querySelector(${JSON.stringify(selector)});node.scrollIntoView({block:'center',behavior:'instant'});const r=node.getBoundingClientRect(),f=frame.getBoundingClientRect(),scale=f.width/frame.offsetWidth;return {x:f.left+(r.left+r.width/2)*scale,y:f.top+(r.top+r.height/2)*scale};})()`);
  run('mouse', 'move', String(Math.round(point.x)), String(Math.round(point.y)));
  run('mouse', 'down'); run('mouse', 'up');
};
try {
  await new Promise((resolve, reject) => {
    const process = spawn(binary, ['--session', session, 'open', base], { stdio: 'ignore', windowsHide: true });
    process.once('error', reject); process.once('exit', code => code === 0 ? resolve() : reject(new Error('Browser did not launch')));
  });
  run('set', 'viewport', '1600', '1000');
  const sessionResponse = await fetch(base + '/staff-auth.php?a=session');
  const sessionData = await sessionResponse.json();
  const cookie = sessionResponse.headers.getSetCookie().find(value => value.startsWith('cm_staff='))?.split(';')[0];
  assert.ok(cookie);
  const loginResponse = await fetch(base + '/staff-auth.php?a=login', { method: 'POST', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json', 'X-CSRF-Token': sessionData.csrfToken }, body: JSON.stringify({ email: fixture.email, password: fixture.password }) });
  assert.equal(loginResponse.status, 200);
  const authenticatedCookie = loginResponse.headers.getSetCookie().find(value => value.startsWith('cm_staff='))?.split(';')[0] || cookie;
  run('cookies', 'set', 'cm_staff', authenticatedCookie.slice('cm_staff='.length), '--url', base, '--httpOnly', '--sameSite', 'Lax');
  run('open', base + '/visual-editor');
  wait("document.querySelector('#loading').hidden && document.querySelector('#siteFrame').contentWindow.CMCms?.page()==='home'");
  saved();
  const savedBeforeSelection = await readFile(path.join(fixture.fixture, 'data/cms-pages/home.json'), 'utf8');
  const heading = frame(`(() => { const nodes=[...doc.querySelectorAll('#view h1[data-cms-element],#view h1 [data-cms-element],#view h2[data-cms-element],#view h2 [data-cms-element]')];const n=nodes.find(node=>win.CMCms.selectionInfo(node.closest('[data-cms-section]').dataset.cmsSection,node.dataset.cmsElement)?.descriptor.kind==='text');return n?{section:n.closest('[data-cms-section]').dataset.cmsSection,id:n.dataset.cmsElement,text:n.textContent}:null;})()`);
  assert.ok(heading, 'Live Home heading is editable');
  const selector = `[data-cms-section="${heading.section}"] [data-cms-element="${heading.id}"]`;
  clickCanvas(selector);
  frameWait('!doc.querySelector(".cms-selection-box").hidden');
  observed = frame(`(() => { const node=doc.querySelector(${JSON.stringify(selector)}),box=doc.querySelector('.cms-selection-box'),label=doc.querySelector('.cms-selection-label'),r=node.getBoundingClientRect(),b=box.getBoundingClientRect(),l=label.getBoundingClientRect(),css=win.getComputedStyle(box),hit=doc.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {background:css.backgroundColor,pointerEvents:css.pointerEvents,borderWidth:css.borderTopWidth,targetWidth:r.width,overlayWidth:b.width,targetTop:r.top,labelBottom:l.bottom,hitIsText:hit===node||node.contains(hit),handles:[...box.querySelectorAll('[data-cms-resize]')].filter(item=>win.getComputedStyle(item).display!=='none').length};})()`);
  run('screenshot', path.join(output, 'heading-selected.png'));
  check('Selection outline is transparent and cannot cover the heading', observed.background === 'rgba(0, 0, 0, 0)');
  check('Selection outline does not intercept text clicks', observed.pointerEvents === 'none' && observed.hitIsText);
  check('Selection outline tracks the full heading width', Math.abs(observed.overlayWidth - observed.targetWidth) < 1);
  check('Small selection label is positioned above the heading', observed.labelBottom <= observed.targetTop + 1);
  check('Eight resize controls remain available', observed.handles === 8);
  check('Selecting a heading does not alter saved page content or styling', await readFile(path.join(fixture.fixture, 'data/cms-pages/home.json'), 'utf8') === savedBeforeSelection);
  assert.ok(checks.every(item => item.pass), 'Selection overlay must not obscure the heading');
  run('click', '[data-edit-text]');
  frameWait(`doc.querySelector(${JSON.stringify(selector)}).isContentEditable`);
  check('Inline text editing hides label and resize controls', frame("[...doc.querySelectorAll('.cms-selection-label,[data-cms-resize]')].every(node=>win.getComputedStyle(node).display==='none')"));
  run('keyboard', 'inserttext', 'Selection outline regression verification');
  run('press', 'Tab');
  frameWait(`doc.querySelector(${JSON.stringify(selector)}).textContent==='Selection outline regression verification'`);
  saved();
  check('Typing updates and saves the actual heading', true);
  run('click', '#undo');
  frameWait(`doc.querySelector(${JSON.stringify(selector)}).textContent===${JSON.stringify(heading.text)}`);
  check('Undo restores the original heading text', true);
  run('click', '#redo');
  frameWait(`doc.querySelector(${JSON.stringify(selector)}).textContent==='Selection outline regression verification'`);
  check('Redo restores the edited heading text', true);
  run('screenshot', path.join(output, 'heading-edited.png'));
  run('click', '#undo'); saved();
  // Escape uses the normal canvas shortcut and must hide all selection chrome.
  clickCanvas(selector); run('press', 'Escape');
  frameWait('doc.querySelector(".cms-selection-box").hidden');
  check('Clearing the selection removes its entire overlay', frame("win.getComputedStyle(doc.querySelector('.cms-selection-box')).display==='none'"));
  assert.ok(checks.every(item => item.pass));
} finally {
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ checks, observed, fixture: fixture.fixture }, null, 2));
  console.log(JSON.stringify({ passed: checks.filter(item => item.pass).length, total: checks.length, output }));
  try { run('close'); } catch {}
}
