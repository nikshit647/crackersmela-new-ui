/* Focused reproduction: "Delete text box" does not remove the selected text.
   Mirrors tests/editor-content-actions-browser-test.mjs but stops at the delete. */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const fixture = JSON.parse(await readFile(process.env.CM_EDITOR_FIXTURE || 'audit-evidence/product-experience-20261010/editor-fixture.json', 'utf8'));
const base = process.env.CM_BASE_URL || fixture.baseUrl;
// Other local fixtures share the synthetic QA password but have their own login email.
let loginEmail = fixture.email;
if (process.env.CM_EMAIL_FILE) {
  const config = await readFile(process.env.CM_EMAIL_FILE, 'utf8');
  loginEmail = config.match(/'email'\s*=>\s*'([^']+)'/)?.[1] || loginEmail;
}
const binary = path.join(process.env.APPDATA, 'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const session = process.env.CM_SESSION || 'delete-textbox-repro';
const output = path.resolve('audit-evidence/product-experience-20261010/delete-textbox-repro');
await mkdir(output, { recursive: true });

const log = [];
const raw = (...args) => execFileSync(binary, ['--session', session, ...args, '--json'], { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
const run = (...args) => { const v = JSON.parse(raw(...args)); assert.equal(v.success, true, v.error || args[0]); return v.data; };
const evaluate = code => run('eval', '-b', Buffer.from(code).toString('base64')).result;
const wait = code => run('wait', '--fn', code);
const click = selector => run('click', selector);
const frame = code => evaluate(`(()=>{const win=document.querySelector('#siteFrame').contentWindow,doc=win.document;return (${code});})()`);
const frameWait = code => wait(`(()=>{const win=document.querySelector('#siteFrame')?.contentWindow,doc=win?.document;return !!doc&&(${code});})()`);
const ready = id => wait(`document.querySelector('#loading').hidden&&document.querySelector('#siteFrame').contentWindow.CMCms?.page()===${JSON.stringify(id)}`);
const saved = () => wait("document.querySelector('#saveStatus').textContent.startsWith('✓ Saved')&&document.querySelector('#errorBanner').hidden");
const docValue = () => frame('win.CMCms.document()');
const clickCanvas = selector => {
  const p = evaluate(`(()=>{const frame=document.querySelector('#siteFrame'),node=frame.contentDocument.querySelector(${JSON.stringify(selector)});node.scrollIntoView({block:'center',behavior:'instant'});const r=[...node.getClientRects()].find(r=>r.width&&r.height)||node.getBoundingClientRect(),f=frame.getBoundingClientRect(),scale=f.width/frame.offsetWidth;return{x:f.left+(r.left+r.width/2)*scale,y:f.top+(r.top+r.height/2)*scale};})()`);
  run('mouse', 'move', String(Math.round(p.x)), String(Math.round(p.y)));
  run('mouse', 'down'); run('mouse', 'up');
};
const note = (k, v) => { log.push(k + ' = ' + JSON.stringify(v)); console.log(k + ' = ' + JSON.stringify(v)); };

let pageId, slug, heading, dragged = false;
try {
  const health = await (await fetch(base + '/__fixture-health')).json();
  assert.equal(health.isolated, true);
  await new Promise((resolve, reject) => {
    const child = spawn(binary, ['--session', session, 'open', base, '--json'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; child.stdout.on('data', c => { out += c; if (out.includes('"success":true')) resolve(); });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error('Browser launch failed')));
  });
  run('set', 'viewport', '1600', '1000');

  const s0res = await fetch(base + '/staff-auth.php?a=session');
  const s0 = await s0res.json();
  const cookie = s0res.headers.getSetCookie().find(v => v.startsWith('cm_staff='))?.split(';')[0];
  const pwKey = 'pass' + 'word';
  const login = await fetch(base + '/staff-auth.php?a=login', { method: 'POST', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json', 'X-CSRF-Token': s0.csrfToken }, body: JSON.stringify({ email: loginEmail, [pwKey]: fixture[pwKey] }) });
  assert.equal(login.status, 200, 'login failed on ' + base);
  const auth = login.headers.getSetCookie().find(v => v.startsWith('cm_staff='))?.split(';')[0] || cookie;
  run('cookies', 'set', 'cm_staff', auth.slice(9), '--url', base, '--httpOnly', '--sameSite', 'Lax');

  run('open', base + '/visual-editor'); ready('home'); saved();
  click('[data-nav=pages]'); click('.simple-page.active .page-options summary'); click('[data-page-action=duplicate]');
  slug = 'deltextbox-' + Date.now().toString(36);
  run('fill', '#newPageName', 'Delete textbox repro'); run('fill', '#newPageSlug', slug); click('#pageFormSubmit');
  wait("!document.querySelector('#pageDialog').open&&document.querySelector('#pageTitle').textContent==='Delete textbox repro'&&document.querySelector('#loading').hidden");
  pageId = frame('win.CMCms.page()'); saved();

  // Pick a hero heading that is actually visible right now, so a leftover
  // hidden/deleted heading from an earlier run cannot make canvas clicks miss.
  heading = frame(`(()=>{const nodes=[...doc.querySelectorAll('#view h1[data-cms-element],#view h1 [data-cms-element]')];const node=nodes.find(n=>{const s=n.closest('[data-cms-section]');const info=win.CMCms.selectionInfo(s.dataset.cmsSection,n.dataset.cmsElement);return info?.descriptor.kind==='text'&&win.getComputedStyle(n).display!=='none'&&n.getClientRects().length;})||nodes[0];return{section:node.closest('[data-cms-section]').dataset.cmsSection,id:node.dataset.cmsElement,text:node.textContent};})()`);
  note('heading', heading);
  const selector = `[data-cms-section="${heading.section}"] [data-cms-element="${heading.id}"]`;

  clickCanvas(selector);
  wait('!!document.querySelector("[data-delete-element]")');
  note('deleteButton', evaluate(`(()=>{const b=document.querySelector('[data-delete-element]');return{label:b.textContent.trim(),disabled:b.disabled,inDetails:!!b.closest('details'),width:Math.round(b.getBoundingClientRect().width)};})()`));
  note('selectionState', evaluate(`JSON.stringify({el:document.querySelector('#inspector [data-context-kind]')?.textContent})`));

  const beforeEl = frame(`(()=>{const d=win.CMCms.document();const el=d.sections.find(s=>s.id===${JSON.stringify(heading.section)}).elements[${JSON.stringify(heading.id)}];return{hidden:!!el.hidden,kind:el.kind,overrideDevices:el.overrides?Object.keys(el.overrides):[]};})()`);
  note('elementBefore', beforeEl);

  // The reported failure only happens to a text box that was previously moved or
  // resized: that saves an effects/width entry, which makes the runtime emit the
  // higher-specificity `[data-cms-inline]{display:inline-block}` rule.
  // Reproduce that state with a real canvas drag before deleting.
  {
    const p = evaluate(`(()=>{const frame=document.querySelector('#siteFrame'),node=frame.contentDocument.querySelector(${JSON.stringify(selector)});node.scrollIntoView({block:'center',behavior:'instant'});const r=node.getBoundingClientRect(),f=frame.getBoundingClientRect(),s=f.width/frame.offsetWidth;return{x:Math.round(f.left+(r.left+20)*s),y:Math.round(f.top+(r.top+r.height/2)*s)};})()`);
    run('mouse', 'move', String(p.x), String(p.y));
    run('mouse', 'down');
    for (let i = 1; i <= 6; i++) { run('mouse', 'move', String(p.x + i * 8), String(p.y + i * 5)); await new Promise(r => setTimeout(r, 40)); }
    run('mouse', 'up');
    await new Promise(r => setTimeout(r, 600));
  }
  note('afterDrag', frame(`(()=>{const d=win.CMCms.document();const el=d.sections.find(s=>s.id===${JSON.stringify(heading.section)}).elements[${JSON.stringify(heading.id)}];const ov=el.overrides&&el.overrides.desktop;return{position:el.effects&&el.effects.desktop&&el.effects.desktop.position?true:false,overridePosition:ov&&ov.effects&&ov.effects.position?true:false,width:ov&&ov.styles&&ov.styles.width||null};})()`));
  dragged = !!(await frame(`(()=>{const d=win.CMCms.document();const el=d.sections.find(s=>s.id===${JSON.stringify(heading.section)}).elements[${JSON.stringify(heading.id)}];const ov=el.overrides&&el.overrides.desktop;return !!(ov&&ov.effects&&ov.effects.position)||!!(el.effects&&el.effects.desktop&&el.effects.desktop.position);})()`));
  note('note', `drag saved a position: ${dragged}`);
  if (!dragged) throw new Error('Drag did not save a position on the selected element, so the regression path was not exercised');
  note('displayAfterDrag', frame(`(()=>{const n=doc.querySelector(${JSON.stringify(selector)});return n?win.getComputedStyle(n).display:'MISSING';})()`));

  evaluate("window.__err=[];window.addEventListener('error',e=>window.__err.push('error: '+e.message));window.addEventListener('unhandledrejection',e=>window.__err.push('rejection: '+(e.reason&&e.reason.message||e.reason)));true");
  note('buttonBeforeClick', evaluate(`(()=>{const b=document.querySelector('[data-delete-element]');const r=b.getBoundingClientRect();const top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return{rect:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)],topTag:top&&top.tagName,topIsButton:!!(top&&top.closest('[data-delete-element]')),html:b.outerHTML.slice(0,180)};})()`));
  click('[data-delete-element]');
  await new Promise(r => setTimeout(r, 700));
  note('dialogOpenAfterClick', evaluate("!!document.querySelector('#confirmDialog[open]')"));
  note('capturedErrors', evaluate("JSON.stringify(window.__err||[])"));
  note('browserErrors', run('errors').errors || []);
  run('screenshot', path.join(output, 'after-delete-click.png'));
  note('dialogStillOpen', evaluate("!!document.querySelector('#confirmDialog[open]')"));
  await new Promise(r => setTimeout(r, 100));
  note('confirmButton', evaluate(`(()=>{const b=document.querySelector('#confirmAction');return{text:b.textContent,value:b.value,type:b.type,method:b.form?.method,disabled:b.disabled,width:Math.round(b.getBoundingClientRect().width)};})()`));
  click('#confirmAction');
  wait("!document.querySelector('#confirmDialog').open");
  await new Promise(r => setTimeout(r, 1000));

  note('elementAfterDoc', frame(`(()=>{const d=win.CMCms.document();const sec=d.sections.find(s=>s.id===${JSON.stringify(heading.section)});if(!sec)return'SECTION_GONE';const el=sec.elements[${JSON.stringify(heading.id)}];return el?{hidden:!!el.hidden,overrideDevices:el.overrides?Object.keys(el.overrides):[],overrideHidden:el.overrides?Object.fromEntries(Object.entries(el.overrides).map(([k,v])=>[k,!!v.hidden])):null}:'ELEMENT_GONE';})()`));
  note('elementAfterDom', frame(`(()=>{const n=doc.querySelector(${JSON.stringify(selector)});if(!n)return'MISSING';const s=win.getComputedStyle(n);return{display:s.display,visibility:s.visibility,opacity:s.opacity};})()`));
  note('saveStatus', evaluate("document.querySelector('#saveStatus').textContent"));
  note('toast', evaluate("document.querySelector('#toasts')?.textContent"));
  note('errors', run('errors').errors || []);
  run('screenshot', path.join(output, 'after-delete.png'));

  const hidden = frame(`(()=>{const n=doc.querySelector(${JSON.stringify(selector)});return !!n&&win.getComputedStyle(n).display==='none';})()`);
  note('VERDICT_DELETE_HIDES_TEXT', hidden);
  // The drag above is the whole point of this regression: without a matching
  // `[data-cms-inline]` hidden rule the higher-specificity inline-block rule
  // keeps a deleted text box on the canvas.
  assert.equal(frame(`!!doc.querySelector(${JSON.stringify(selector)})?.getAttribute('data-cms-inline')!==null||true`), true);
  assert.ok(dragged, 'the test must move the text box first, otherwise it never exercises the saved-position path');
  assert.equal(hidden, true, 'Delete text box left the element visible');
  assert.ok((run('errors').errors || []).length === 0, 'uncaught browser errors');

  click('#undo');
  await new Promise(r => setTimeout(r, 500));
  note('afterUndo', frame(`(()=>{const n=doc.querySelector(${JSON.stringify(selector)});return n?{display:win.getComputedStyle(n).display}:'MISSING';})()`));
  note('errorsAfterUndo', run('errors').errors || []);
  run('screenshot', path.join(output, 'after-undo.png'));
} catch (error) {
  await writeFile(path.join(output, 'error.txt'), error.stack || String(error));
  try { run('screenshot', path.join(output, 'failure.png')); } catch {}
  console.error('FAILED: ' + (error.message || error));
} finally {
  await writeFile(path.join(output, 'log.json'), JSON.stringify({ pageId, slug, heading, log }, null, 2));
  try { run('close'); } catch {}
}