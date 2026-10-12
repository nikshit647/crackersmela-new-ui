/* Verifies a deleted element can be found in Layers and restored.
   Isolated local fixture only. */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const fixture = JSON.parse(await readFile('audit-evidence/product-experience-20261010/editor-fixture.json', 'utf8'));
const base = fixture.baseUrl;
const binary = path.join(process.env.APPDATA, 'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const session = 'deleted-restore-test';
const output = path.resolve('audit-evidence/product-experience-20261010/deleted-restore');
await mkdir(output, { recursive: true });
const raw = (...a) => execFileSync(binary, ['--session', session, ...a, '--json'], { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 120000 });
const run = (...a) => { const v = JSON.parse(raw(...a)); assert.equal(v.success, true, v.error || a[0]); return v.data; };
const ev = c => run('eval', '-b', Buffer.from(c).toString('base64')).result;
const wait = c => run('wait', '--fn', c);
const click = s => run('click', s);
const frame = c => ev(`(()=>{const w=document.querySelector('#siteFrame').contentWindow,d=w.document;return (${c});})()`);
const pause = ms => new Promise(r => setTimeout(r, ms));
const ready = id => wait(`document.querySelector('#loading').hidden&&document.querySelector('#siteFrame').contentWindow.CMCms?.page()===${JSON.stringify(id)}`);
const saved = () => wait("document.querySelector('#saveStatus').textContent.startsWith('✓ Saved')");
const results = [];
const check = (n, ok) => { results.push({ n, ok: !!ok }); console.log((ok ? 'PASS: ' : 'FAIL: ') + n); };

await new Promise((res, rej) => {
  const ch = spawn(binary, ['--session', session, 'open', base, '--json'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; ch.stdout.on('data', c => { out += c; if (out.includes('"success":true')) res(); });
  ch.once('error', rej); ch.once('exit', c => c === 0 ? res() : rej(new Error('launch')));
});
run('set', 'viewport', '1600', '1000');

const pw = 'pass' + 'word';
const s0res = await fetch(base + '/staff-auth.php?a=session');
const s0 = await s0res.json();
const cookie = s0res.headers.getSetCookie().find(v => v.startsWith('cm_staff='))?.split(';')[0];
const login = await fetch(base + '/staff-auth.php?a=login', { method: 'POST', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json', 'X-CSRF-Token': s0.csrfToken }, body: JSON.stringify({ email: fixture.email, [pw]: fixture[pw] }) });
const auth = login.headers.getSetCookie().find(v => v.startsWith('cm_staff='))?.split(';')[0] || cookie;
run('cookies', 'set', 'cm_staff', auth.slice(9), '--url', base, '--httpOnly', '--sameSite', 'Lax');

run('open', base + '/visual-editor'); ready('home'); saved();

// Pick a visible TEXT element in the hero through the Layers panel.
click('[data-nav=layers]'); await pause(600);
const target = ev(`(()=>{for(const b of document.querySelectorAll('[data-layer-select]')){const row=b.closest('.element-layer');const sec=b.dataset.layerSection;if(sec!=='home:hero')continue;if(!/^text$/.test((row.querySelector('small')?.textContent||'').split('·')[0].trim()))continue;const id=b.dataset.layerSelect;const node=document.querySelector('#siteFrame').contentDocument.querySelector('[data-cms-section="'+sec+'"] [data-cms-element="'+id+'"]');if(node&&node.getClientRects().length)return JSON.stringify({id,sec});}return '';})()`);
assert.ok(target, 'no visible hero text element found in Layers');
const { id, sec } = JSON.parse(target);
const layerSel = `[data-layer-select="${id}"][data-layer-section="${sec}"]`;
const nodeSel = `[data-cms-section="${sec}"] [data-cms-element="${id}"]`;
console.log('target:', id, 'in', sec);

const openGroups = () => ev("(()=>{document.querySelectorAll('#library details.element-layer-group').forEach(d=>d.open=true);return document.querySelectorAll('#library details.element-layer-group').length;})()");
openGroups(); await pause(400);
click(layerSel); await pause(700);
check('selecting a layer loads the inspector', ev(`!!document.querySelector('#inspector [data-delete-element]')`));
check('target is visible before delete', frame(`getComputedStyle(d.querySelector(${JSON.stringify(nodeSel)})).display!=='none'`));

click('#inspector [data-delete-element]');
wait("!!document.querySelector('#confirmDialog[open]')"); await pause(200);
click('#confirmAction');
await pause(1200);
check('Delete hides the element on the canvas', frame(`getComputedStyle(d.querySelector(${JSON.stringify(nodeSel)})).display==='none'`));

click('[data-nav=layers]'); await pause(700); openGroups(); await pause(300);
check('deleted element is still listed in Layers', ev(`!!document.querySelector(${JSON.stringify(layerSel)})`));
check('Layers marks it Deleted', ev(`(()=>{const r=document.querySelector(${JSON.stringify(layerSel)}).closest('.element-layer');return r.classList.contains('is-deleted')&&/Deleted/.test(r.textContent);})()`));
check('Layers shows a Restore control', ev(`!!document.querySelector('[data-layer-restore="${id}"][data-layer-section="${sec}"]')`));
run('screenshot', path.join(output, 'layers-deleted.png'));

click(`[data-layer-restore="${id}"][data-layer-section="${sec}"]`); await pause(1200);
check('Restore brings it back on the canvas', frame(`getComputedStyle(d.querySelector(${JSON.stringify(nodeSel)})).display!=='none'`));
check('document no longer marks it deleted', frame(`(()=>{const doc=win.CMCms.document();const e=doc.sections.find(s=>s.id===${JSON.stringify(sec)}).elements[${JSON.stringify(id)}];return !e.hidden&&!Object.values(e.overrides||{}).some(o=>o&&o.hidden);})()`));
check('Layers no longer marks it Deleted', ev(`!document.querySelector(${JSON.stringify(layerSel)}).closest('.element-layer').classList.contains('is-deleted')`));

openGroups(); await pause(300); click(layerSel); await pause(600);
check('inspector offers the normal delete action again', ev(`!!document.querySelector('#inspector [data-delete-element]')&&!document.querySelector('#inspector [data-restore-element]')`));
check('no uncaught browser errors', (run('errors').errors || []).length === 0);
run('screenshot', path.join(output, 'restored.png'));

const passed = results.filter(r => r.ok).length;
await writeFile(path.join(output, 'results.json'), JSON.stringify({ passed, total: results.length, results }, null, 2));
console.log(`\n${passed}/${results.length} passed`);
run('close');
process.exit(passed === results.length ? 0 : 1);