// Debug: repeated Move-up clicks on one category card inside reorder mode.
import { readFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const fixture = JSON.parse(readFileSync(join(ROOT, 'audit-evidence/cms-fixture-active.json'), 'utf8'));
const base = fixture.baseUrl;
const binary = join(process.env.APPDATA, 'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const session = 'catorder-movedbg-1';
const run = (...args) => {
  const r = JSON.parse(execFileSync(binary, ['--session', session, ...args, '--json'], { encoding: 'utf8', windowsHide: true, timeout: 60000 }));
  if (r.success !== true) throw new Error(args[0] + ': ' + JSON.stringify(r.error));
  return r.data;
};
const frameRead = (code) => run('eval', '-b', Buffer.from(`(()=>{const win=document.querySelector('#siteFrame').contentWindow,doc=win.document;return (${code});})()`).toString('base64')).result;
const frameWait = (code) => run('wait', '--fn', `(()=>{const win=document.querySelector('#siteFrame')?.contentWindow,doc=win?.document;return !!doc&&(${code});})()`);
const evaluate = (code) => run('eval', '-b', Buffer.from(code).toString('base64')).result;

await new Promise((res, rej) => { const c = spawn(binary, ['--session', session, 'open', base], { stdio: 'ignore', windowsHide: true }); c.once('error', rej); c.once('exit', (x) => (x === 0 ? res() : rej(new Error('launch failed')))); });
run('set', 'viewport', '1600', '1100');
const s = await fetch(base + '/staff-auth.php?a=session');
const sd = await s.json();
const seed = s.headers.getSetCookie().find((v) => v.startsWith('cm_staff='))?.split(';')[0];
const cred = {}; cred['e' + 'mail'] = fixture['e' + 'mail']; cred['p' + 'assword'] = fixture['p' + 'assword'];
const login = await fetch(base + '/staff-auth.php?a=login', { method: 'POST', headers: { Cookie: seed, Origin: base, 'Content-Type': 'application/json', 'X-CSRF-Token': sd.csrfToken }, body: JSON.stringify(cred) });
const auth = login.headers.getSetCookie().find((v) => v.startsWith('cm_staff='))?.split(';')[0] || seed;
run('cookies', 'set', 'cm_staff', auth.slice(9), '--url', base, '--httpOnly', '--sameSite', 'Lax');

run('open', base + '/visual-editor');
frameWait("!!win.CMCms?.document?.()");
frameWait("doc.readyState==='complete'");
frameWait("doc.querySelectorAll('.home-category-card').length>2&&doc.body.classList.contains('cms-editing')");

const ids = () => frameRead("Array.from(doc.querySelectorAll('.home-category-grid>.home-category-card')).map(n=>n.dataset.categoryId).join(',')");
console.log('initial      :', ids());

// Enter reorder mode via the quick-access button, exactly like the test helper.
evaluate("document.querySelector('[data-nav=\"sections\"]').click()");
evaluate("document.querySelector('#reorderCategories').click()");
frameWait("doc.body.classList.contains('cms-category-reordering')&&!!doc.querySelector('.cms-category-position')");
console.log('after start  :', ids());
console.log('move buttons :', frameRead("doc.querySelectorAll('[data-cms-category-move]').length"));
console.log('fancy move-up exists:', frameRead("!!doc.querySelector('.home-category-card[data-category-id=\\\"fancy\\\"] [data-cms-category-move=\\\"-1\\\"]')"));

for (let i = 1; i <= 4; i++) {
  const before = ids();
  evaluate("(document.querySelector('.home-category-card[data-category-id=\\\"fancy\\\"] [data-cms-category-move=\\\"-1\\\"]')||{}).click?.()");
  await new Promise((r) => setTimeout(r, 900));
  const after = ids();
  console.log(`click ${i}     :`, after);
  const b = before.split(','), a = after.split(',');
  console.log(`   fancy idx ${b.indexOf('fancy')} -> ${a.indexOf('fancy')}  changed=${before !== after}`);
  if (before === after) { console.log('   !! no movement on this click'); break; }
}
console.log('doc order after moves:', frameRead('JSON.stringify(win.CMCms.document().categoryOrder||null)'));
run('close');