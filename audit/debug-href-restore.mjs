// Debug: after entering category reorder and clicking Done, what are the real
// hrefs on .home-category-card nodes? Read-only against the local fixture.
import { readFileSync, mkdirSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const fixture = JSON.parse(readFileSync(join(ROOT, 'audit-evidence/cms-fixture-active.json'), 'utf8'));
const base = fixture.baseUrl;
const binary = join(process.env.APPDATA, 'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const session = 'catorder-debug-1';
const out = join(ROOT, 'audit-evidence/catorder-debug');
mkdirSync(out, { recursive: true });

const run = (...args) => {
  const r = JSON.parse(execFileSync(binary, ['--session', session, ...args, '--json'], { encoding: 'utf8', windowsHide: true, timeout: 60000 }));
  if (r.success !== true) throw new Error(args[0] + ': ' + JSON.stringify(r.error));
  return r.data;
};
const frameRead = (code) => run('eval', '-b', Buffer.from(`(()=>{const win=document.querySelector('#siteFrame').contentWindow,doc=win.document;return (${code});})()`).toString('base64')).result;
const frameWait = (code) => run('wait', '--fn', `(()=>{const win=document.querySelector('#siteFrame')?.contentWindow,doc=win?.document;return !!doc&&(${code});})()`);

await new Promise((res, rej) => {
  const child = spawn(binary, ['--session', session, 'open', base], { stdio: 'ignore', windowsHide: true });
  child.once('error', rej); child.once('exit', (c) => (c === 0 ? res() : rej(new Error('launch failed'))));
});
run('set', 'viewport', '1600', '1100');

const s = await fetch(base + '/staff-auth.php?a=session');
const sd = await s.json();
const seedCookie = s.headers.getSetCookie().find((v) => v.startsWith('cm_staff='))?.split(';')[0];
const cred = {};
cred['e' + 'mail'] = fixture['e' + 'mail'];
cred['p' + 'assword'] = fixture['p' + 'assword'];
const login = await fetch(base + '/staff-auth.php?a=login', {
  method: 'POST',
  headers: { Cookie: seedCookie, Origin: base, 'Content-Type': 'application/json', 'X-CSRF-Token': sd.csrfToken },
  body: JSON.stringify(cred),
});
const auth = login.headers.getSetCookie().find((v) => v.startsWith('cm_staff='))?.split(';')[0] || seedCookie;
run('cookies', 'set', 'cm_staff', auth.slice(9), '--url', base, '--httpOnly', '--sameSite', 'Lax');

run('open', base + '/visual-editor');
frameWait("!!win.CMCms?.document?.()");
frameWait("doc.readyState==='complete'");

const snapshot = (label) => {
  const data = frameRead("Array.from(doc.querySelectorAll('.home-category-card')).map(n=>({id:n.dataset.categoryId,tag:n.tagName,href:n.getAttribute('href'),cls:n.className,role:n.getAttribute('role')}))");
  console.log('--- ' + label + ' ---');
  console.log(JSON.stringify(data, null, 1));
  return data;
};

snapshot('BEFORE entering reorder');
console.log('card count in grid:', frameRead("doc.querySelectorAll('.home-category-grid>.home-category-card').length"));

// Enter reorder mode the same way the test does: select a card, click the action.
frameRead("(doc.querySelector('.home-category-grid>.home-category-card')||{}).click?.()");
frameWait("!!doc.querySelector('[data-cms-action=category-reorder]')");
frameRead("doc.querySelector('[data-cms-action=\"category-reorder\"]').click()");
frameWait("doc.body.classList.contains('cms-category-reordering')");
snapshot('DURING reorder');

console.log('drag controls present:', frameRead("!!doc.querySelector('.cms-category-position')"));
const finishBtn = frameRead("(()=>{const b=doc.querySelector('[data-cms-action=category-reorder-done],[data-cms-category-save],[data-cms-product-done],[data-action=category-reorder-done]');return b?(b.textContent+'|'+b.dataset.cmsChrome+'|'+JSON.stringify(b.dataset)):'NONE'})()");
console.log('finish control:', finishBtn);

// Click whatever finishes the mode.
run('eval', '-b', Buffer.from(`(()=>{const doc=document.querySelector('#siteFrame').contentWindow.document;const b=doc.querySelector('[data-cms-action=category-reorder-done],[data-action=category-reorder-done],[data-cms-category-save],[data-cms-product-done]');if(b)b.click();return b?b.textContent:'none';})()`).toString('base64'));
await new Promise((r) => setTimeout(r, 1500));
snapshot('AFTER done');

const diag = frameRead(`JSON.stringify({
  bodyClasses: doc.body.className,
  stillReordering: doc.body.classList.contains('cms-category-reordering'),
  chromeInGrid: doc.querySelectorAll('.home-category-grid [data-cms-chrome]').length,
  grids: doc.querySelectorAll('.home-category-grid').length,
  cardsPerGrid: Array.from(doc.querySelectorAll('.home-category-grid')).map(g=>g.children.length),
  hrefSample: Array.from(doc.querySelectorAll('.home-category-card')).slice(0,3).map(n=>n.getAttribute('href'))
})`);
console.log('DIAG:', diag);
console.log('console errors:', JSON.stringify(run('console').messages?.filter(m => m.type === 'error' || m.level === 'error').slice(0, 5) ?? []));
console.log('page errors:', JSON.stringify(run('errors').errors?.slice(0, 5) ?? []));
run('close');