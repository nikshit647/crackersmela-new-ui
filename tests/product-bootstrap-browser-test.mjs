import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const task = path.resolve('audit-evidence/product-experience-20261010');
const fixture = JSON.parse(await readFile(path.join(task, 'fixture.json'), 'utf8'));
const product = JSON.parse(await readFile(path.join(task, 'admin-browser/final-product.json'), 'utf8'));
for (const url of [fixture.baseUrl, fixture.publicUrl]) assert.ok(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const health = await (await fetch(fixture.baseUrl + '/__fixture-health')).json();
assert.equal(health.isolated, true); assert.equal(health.mail, 'disabled');
const out = path.join(task, 'bootstrap-browser'); await mkdir(out, { recursive: true });
const session = 'product-bootstrap-20261010';
const binary = path.join(process.env.APPDATA, 'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const checks = [];
const check = (name, value, details) => { checks.push({ name, pass: !!value, ...(details === undefined ? {} : { details }) }); console.log(`${value ? 'PASS' : 'FAIL'}: ${name}`); assert.ok(value, name); };
const run = (...args) => {
  const response = JSON.parse(execFileSync(binary, ['--session', session, '--namespace', 'product-bootstrap', '--pin-tab', ...args, '--json'], { encoding: 'utf8', windowsHide: true, timeout: 45000, maxBuffer: 5 * 1024 * 1024 }));
  assert.ok(response.success, response.error); return response.data;
};
const evaluate = code => run('eval', '-b', Buffer.from(code).toString('base64')).result;
const wait = code => run('wait', '--fn', code);
const launch = (...args) => new Promise((resolve, reject) => {
  const child = spawn(binary, ['--session', session, '--namespace', 'product-bootstrap', '--pin-tab', ...args, '--json'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', done = false;
  const finish = (error, value) => { if (done) return; done = true; clearTimeout(timer); child.stdout.destroy(); child.stderr.destroy(); child.unref(); error ? reject(error) : resolve(value); };
  const timer = setTimeout(() => finish(new Error('Browser launch timeout: ' + stderr)), 45000);
  child.stdout.on('data', chunk => { stdout += chunk; try { const value = JSON.parse(stdout); finish(value.success ? null : new Error(value.error), value.data); } catch {} });
  child.stderr.on('data', chunk => { stderr += chunk; }); child.once('error', error => finish(error));
  child.once('exit', code => { if (!done) finish(new Error('Browser launch exited ' + code + ': ' + stderr)); });
});
let cookie = '', csrf = '', originalOverride, failure;
async function api(endpoint, body) {
  const response = await fetch(fixture.baseUrl + endpoint, { method: body ? 'POST' : 'GET', headers: { Cookie: cookie, Origin: fixture.baseUrl, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, ...(body ? { body: JSON.stringify(body) } : {}) });
  cookie = response.headers.getSetCookie().find(value => value.startsWith('cm_staff='))?.split(';')[0] || cookie;
  const data = await response.json(); if (data.csrfToken) csrf = data.csrfToken;
  return { status: response.status, ...data };
}
async function override(patch) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await api('/products-api.php?a=pull');
    const next = { ...current.productOverrides, [product.id]: { ...(current.productOverrides[product.id] || {}), ...patch } };
    const result = await api('/products-api.php', { a: 'push', rev: current.rev, productOverrides: next });
    if (result.ok) return;
    if (result.status !== 409) throw new Error(result.error || 'Fixture save failed');
  }
  throw new Error('Concurrent fixture edits prevented the test update');
}

const init = path.join(out, 'observe-first-paint.js');
await writeFile(init, `(() => {
  window.__productPaint = { descriptions: [], images: [] };
  const remember = (key, value) => { if (value && !window.__productPaint[key].includes(value)) window.__productPaint[key].push(value); };
  const inspect = node => {
    if (node.nodeType !== 1) return;
    const nodes = [node, ...node.querySelectorAll('.product-description,[data-gallery-main],.seo-product > img')];
    for (const element of nodes) {
      if (element.matches('.product-description')) remember('descriptions', element.textContent);
      if (element.matches('[data-gallery-main],.seo-product > img')) remember('images', element.getAttribute('src'));
    }
  };
  new MutationObserver(records => {
    for (const record of records) { if (record.type === 'attributes') inspect(record.target); for (const node of record.addedNodes) inspect(node); }
  }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
})();`);
const galleryReady = () => wait(`document.querySelector('[data-product-gallery]')?.dataset.galleryProduct==='${product.id}'&&document.querySelector('[data-gallery-main]')?.complete`);
const clean = () => evaluate("['productOverrides','extraProducts','priceOverrides','stockOverrides','featOn'].forEach(key=>localStorage.removeItem('cm2.'+key)); true");
const stale = () => evaluate(`(()=>{
  const old=${JSON.stringify({ ...product, showDescription: true, image: product.images[0], images: [product.images[0]] })};
  localStorage.setItem('cm2.extraProducts',JSON.stringify([old]));
  localStorage.setItem('cm2.productOverrides',JSON.stringify({[old.id]:{showDescription:true,image:old.image,images:old.images,desc:'Obsolete browser description'}}));
  localStorage.setItem('cm2.priceOverrides',JSON.stringify({[old.id]:99999}));
  localStorage.setItem('cm2.stockOverrides',JSON.stringify({[old.id]:0}));
  return true;
})()`);
const state = () => evaluate(`({description:document.querySelector('.product-description')?.textContent||'',main:document.querySelector('[data-gallery-main]')?.getAttribute('src'),count:document.querySelectorAll('[data-gallery-select]').length,paint:window.__productPaint,price:document.querySelector('.prod-price-big .big')?.textContent,canBuy:!!document.querySelector('#pdAdd')&&!document.querySelector('#pdAdd').disabled,bootstrap:JSON.parse(document.querySelector('#cm-product-bootstrap')?.textContent||'null')})`);

try {
  await api('/staff-auth.php?a=session');
  assert.equal((await api('/staff-auth.php?a=login', { email: fixture.email, password: fixture.password })).authenticated, true);
  const before = await api('/products-api.php?a=pull'); originalOverride = before.productOverrides[product.id] || {};
  assert.ok(before.extraProducts.some(p => p.id === product.id), 'Prior local admin test product exists');
  const latestPrimary = product.images[1];
  await override({ showDescription: false, image: latestPrimary, images: product.images });
  await launch('--init-script', init, 'open', fixture.publicUrl + '/');
  run('network', 'route', '**/products-api.php*', '--abort');
  run('network', 'route', '**/catalog-api.php*', '--abort');
  check('Both browser catalog API requests are actually blocked', evaluate("Promise.all(['products-api.php?a=pull','catalog-api.php?a=pull'].map(url=>fetch(url).then(()=>false,()=>true))).then(values=>values.every(Boolean))"));
  run('set', 'viewport', '1280', '960');
  for (const mode of ['fresh', 'stale']) {
    for (const route of ['clean', 'hash']) {
      mode === 'fresh' ? clean() : stale();
      const url = route === 'clean' ? `/product/p-${product.id}` : `/#/product/p-${product.id}`;
      run('open', fixture.publicUrl + url); galleryReady();
      const result = state();
      check(`${mode} ${route} navigation uses saved OFF visibility from first paint while APIs are blocked`, !result.description && result.paint.descriptions.length === 0, result.paint);
      check(`${mode} ${route} navigation uses current primary and gallery before API synchronization`, result.main.includes(latestPrimary) && result.count === product.images.length && result.paint.images.length > 0 && result.paint.images.every(url => url.includes(latestPrimary)), { main: result.main, images: result.paint.images, count: result.count });
      check(`${mode} ${route} navigation discards obsolete price and stock caches`, result.price.includes('321') && result.canBuy, { price: result.price, canBuy: result.canBuy });
      check(`${mode} ${route} payload contains only public catalog state`, Object.keys(result.bootstrap).sort().join('|') === ['productOverrides', 'extraProducts', 'priceOverrides', 'stockOverrides', 'featOn'].sort().join('|') && result.bootstrap.productOverrides[product.id].showDescription === false);
      if (mode === 'stale' && route === 'clean') run('screenshot', path.join(out, 'stale-cache-hidden-description.png'));
    }
  }
  const newDescription = 'Current server description restored after refresh.\nOriginal details remain available.';
  await override({ showDescription: true, desc: newDescription, image: product.images[0], images: [...product.images].reverse() });
  stale(); run('reload'); galleryReady();
  const restored = state();
  check('Refresh picks up current description and reordered gallery despite blocked APIs and stale cache', restored.description === newDescription && restored.main.includes(product.images[0]) && restored.count === 2 && !restored.paint.descriptions.some(value => value.includes('Obsolete browser')), { description: restored.description, main: restored.main, paint: restored.paint });
  run('network', 'unroute'); run('reload'); galleryReady();
  run('open', fixture.publicUrl + '/#/products?q=' + encodeURIComponent(product.name));
  wait(`document.querySelector('.prod-card[data-id="${product.id}"]')`);
  check('Successful API synchronization preserves one listing card for the extra product', evaluate(`document.querySelectorAll('.prod-card[data-id="${product.id}"]').length===1`));
  run('network', 'route', '**/products-api.php*', '--abort'); run('network', 'route', '**/catalog-api.php*', '--abort');
  stale(); run('open', fixture.publicUrl + `/index.html#/product/p-${product.id}`);
  wait("document.querySelector('#view [role=status]')?.textContent.includes('Product details could not be loaded')");
  check('A static entry without bootstrap never exposes cached product description when its API fails', evaluate("!document.querySelector('.product-description')&&!document.querySelector('[data-product-gallery]')&&window.__productPaint.descriptions.length===0"));
} catch (error) {
  failure = error; console.error(error.stack || error);
  try { run('screenshot', path.join(out, 'failure.png')); await writeFile(path.join(out, 'failure-state.json'), JSON.stringify(state(), null, 2)); } catch {}
} finally {
  if (originalOverride) await override(originalOverride);
  await writeFile(path.join(out, 'results.json'), JSON.stringify({ passed: !failure, checks, ...(failure ? { error: failure.message } : {}) }, null, 2));
  try { run('network', 'unroute'); run('close'); } catch {}
}
if (failure) process.exitCode = 1;
