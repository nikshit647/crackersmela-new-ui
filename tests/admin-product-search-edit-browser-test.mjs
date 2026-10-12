import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const fixture = JSON.parse(await readFile(process.env.CM_CMS_FIXTURE || 'audit-evidence/product-experience-20261010/fixture.json', 'utf8'));
const base = fixture.baseUrl;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
assert.equal((await (await fetch(base + '/__fixture-health')).json()).isolated, true);
const binary = path.join(process.env.APPDATA, 'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const session = 'admin-search-edit-probe';
const output = path.resolve('audit-evidence/admin-search-edit-' + Date.now());
await mkdir(output, { recursive: true });
const run = (...args) => {
  const result = JSON.parse(execFileSync(binary, ['--session', session, ...args, '--json'], { encoding: 'utf8', windowsHide: true, timeout: 45000, maxBuffer: 8 * 1024 * 1024 }));
  assert.equal(result.success, true, result.error || args[0]); return result.data;
};
const evaluate = code => run('eval', '-b', Buffer.from(code).toString('base64')).result;
const observations = [];
try {
  const sessionResponse = await fetch(base + '/staff-auth.php?a=session');
  const sessionData = await sessionResponse.json();
  let cookie = sessionResponse.headers.getSetCookie().find(value => value.startsWith('cm_staff='))?.split(';')[0];
  const login = await fetch(base + '/staff-auth.php?a=login', { method: 'POST', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json', 'X-CSRF-Token': sessionData.csrfToken }, body: JSON.stringify({ email: fixture.email, password: fixture.password }) });
  assert.equal(login.status, 200);
  cookie = login.headers.getSetCookie().find(value => value.startsWith('cm_staff='))?.split(';')[0] || cookie;
  const catalog = await (await fetch(base + '/products-api.php?a=pull')).json();
  const product = catalog.extraProducts.find(product => product.id === 910027);
  assert.ok(product, 'Shared gallery fixture product exists');
  await new Promise((resolve, reject) => { const child = spawn(binary, ['--session', session, 'open', base], { stdio: 'ignore', windowsHide: true }); child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error('Browser did not launch'))); });
  run('cookies', 'set', 'cm_staff', cookie.slice(9), '--url', base, '--httpOnly', '--sameSite', 'Lax');
  run('open', base + '/#/staff'); run('reload');
  run('wait', '--fn', "!!document.querySelector('#adminShell [data-stab=products]')");
  run('set', 'viewport', '1440', '1000');
  run('click', '[data-stab="products"]'); run('wait', '#admPq');
  run('fill', '#admPq', product.name);
  run('wait', '--fn', `document.querySelectorAll('[data-edit-prod]').length===1&&!!document.querySelector('[data-edit-prod="${product.id}"]')`);
  const selector = `[data-edit-prod="${product.id}"]`;
  observations.push(evaluate(`(() => {const b=document.querySelector(${JSON.stringify(selector)}),r=b.getBoundingClientRect();return {filter:document.querySelector('#admPq').value,handler:typeof b.onclick,id:b.dataset.editProd,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML,bootstrapHasProduct:JSON.parse(document.querySelector('#cm-product-bootstrap')?.textContent||'null')?.extraProducts.some(p=>p.id===${product.id})};})()`));
  run('click', selector); run('wait', '#epMedia');
  const observed = evaluate(`(() => {const m=document.querySelector('[data-edit-modal]'),r=m.getBoundingClientRect();return {modalId:m.__did,name:document.querySelector('#epName')?.value,display:getComputedStyle(m).display,width:r.width,height:r.height,media:document.querySelectorAll('#epMedia [data-media-id]').length};})()`);
  observations.push(observed);
  assert.equal(observed.modalId, product.id);
  assert.equal(observed.name, product.name);
  assert.ok(observed.width > 100 && observed.height > 100 && observed.display !== 'none');
  run('screenshot', path.join(output, 'filtered-product-edit.png'));
  console.log('PASS: Filtering QA Product Gallery retains a working Edit button and visible product dialog');
  run('click', 'button[data-close-edit][aria-label="Close"]');
  run('fill', '#admPq', ''); run('wait', '--fn', 'document.querySelectorAll("[data-edit-prod]").length>1');
  run('fill', '#admPq', product.name); run('wait', '--fn', 'document.querySelectorAll("[data-edit-prod]").length===1');
  run('click', selector); run('wait', '#epMedia');
  assert.equal(evaluate('document.querySelector("[data-edit-modal]").__did'), product.id);
  run('click', 'button[data-close-edit][aria-label="Close"]');
  const after = await (await fetch(base + '/products-api.php?a=pull')).json();
  assert.deepEqual(after.extraProducts.find(item => item.id === product.id), product);
  assert.deepEqual(after.productOverrides[product.id], catalog.productOverrides[product.id]);
  console.log('PASS: Repeated filtering and closing/reopening Edit leaves catalog unchanged');
} finally {
  await writeFile(path.join(output, 'results.json'), JSON.stringify(observations, null, 2));
  console.log(output);
  try { run('close'); } catch {}
}
