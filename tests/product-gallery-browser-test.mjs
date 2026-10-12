import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Only synthetic products in the isolated PHP fixture are changed. No live host,
// orders, mail, production credentials or other agents' product IDs are used.
const task = path.resolve('audit-evidence/product-experience-20261010');
const fixture = JSON.parse(fs.readFileSync(path.join(task, 'fixture.json'), 'utf8'));
for (const url of [fixture.baseUrl, fixture.publicUrl]) assert.ok(['127.0.0.1', 'localhost'].includes(new URL(url).hostname));
const binary = path.join(process.env.APPDATA, 'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const session = 'gallery-13d9fd6ea971';
const out = path.join(task, 'browser');
fs.mkdirSync(out, { recursive: true });
const checks = [];
const check = (name, value, details = {}) => { checks.push({ name, pass: !!value, ...details }); assert.ok(value, name); console.log('PASS ' + name); };
const run = (...args) => {
  const result = JSON.parse(execFileSync(binary, ['--session', session, ...args, '--json'], { encoding: 'utf8', windowsHide: true, timeout: 45000, maxBuffer: 6 * 1024 * 1024 }));
  assert.ok(result.success, result.error); return result.data;
};
const evaluate = code => JSON.parse(run('eval', '-b', Buffer.from('JSON.stringify(' + code + ')').toString('base64')).result);
const wait = code => run('wait', '--fn', code);
const readState = () => evaluate(`({index:Number(document.querySelector('[data-product-gallery]')?.dataset.galleryIndex),count:document.querySelector('[data-gallery-count]')?.textContent,src:document.querySelector('[data-gallery-main]')?.getAttribute('src'),qty:document.querySelector('#pdQty')?.textContent,cart:localStorage.getItem('cm2.cart'),scrollY})`);
const openProduct = id => { run('open', `${fixture.publicUrl}/#/product/p-${id}`); run('reload'); wait(`document.querySelector('[data-product-gallery]')?.dataset.galleryProduct==='${id}'`); wait(`document.querySelector('[data-gallery-main]')?.complete`); wait(`Number(getComputedStyle(document.querySelector('[data-product-gallery]')).opacity)>.99`); };
const position = selector => evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height};})()`);
const top = () => {
  wait(`(()=>{const now=performance.now();if(!window.__galleryScroll||Math.abs(window.__galleryScroll.y-scrollY)>1)window.__galleryScroll={y:scrollY,at:now};return now-window.__galleryScroll.at>200;})()`);
  evaluate('window.scrollTo({top:0,behavior:"instant"})'); wait('scrollY<1');
};
let cookie = '', csrf = '';
async function api(url, body) {
  const response = await fetch(fixture.baseUrl + url, { method: body ? 'POST' : 'GET', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: body ? JSON.stringify(body) : undefined });
  const setCookie = response.headers.get('set-cookie'); if (setCookie) cookie = setCookie.split(';')[0];
  const json = await response.json(); if (json.csrfToken) csrf = json.csrfToken;
  return { status: response.status, ...json };
}
async function mutateCatalog(change) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await api('/products-api.php?a=pull');
    const response = await api('/products-api.php', { a: 'push', rev: current.rev, ...change(current) });
    if (response.ok) return response;
    if (response.status !== 409) throw new Error(response.error || 'Fixture catalog save failed');
  }
  throw new Error('Concurrent fixture edits prevented catalog update');
}
const override = patch => mutateCatalog(current => ({ productOverrides: { ...current.productOverrides, 910027: { ...current.productOverrides['910027'], ...patch } } }));

// Native CDP touch input complements the ordinary agent-browser mouse/keyboard
// controls, allowing vertical scrolling to be verified rather than simulated.
async function connectInput() {
  const socket = new WebSocket(run('get', 'cdp-url').cdpUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (pending.has(message.id)) { const { resolve, reject } = pending.get(message.id); pending.delete(message.id); message.error ? reject(new Error(message.error.message)) : resolve(message.result); } });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); socket.send(JSON.stringify({ id: next, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const targets = await send('Target.getTargets');
  const target = targets.targetInfos.find(value => value.type === 'page' && value.url.startsWith(fixture.publicUrl));
  assert.ok(target, 'Gallery browser tab available for touch verification');
  const attached = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const page = (method, params) => send(method, params, attached.sessionId);
  return { close: () => socket.close(), enableTouch: () => page('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 }),
    async wheel(selector, deltaY) { const { x, y } = position(selector); await page('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaY, deltaX: 0 }); },
    async swipe(from, to) {
    const point = (x, y) => [{ x, y, id: 1, radiusX: 2, radiusY: 2, force: 1 }];
    await page('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from.x, from.y) });
    for (let step = 1; step <= 6; step++) { await page('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(from.x + (to.x - from.x) * step / 6, from.y + (to.y - from.y) * step / 6) }); await new Promise(resolve => setTimeout(resolve, 30)); }
    await page('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } };
}

let input;
try {
  await api('/staff-auth.php?a=session');
  assert.equal((await api('/staff-auth.php?a=login', { email: fixture.email, password: fixture.password })).authenticated, true, 'Synthetic fixture staff authenticates');
  const paths = ['images/products/p27.webp', 'images/products/p28.webp', 'images/products/p160.webp'];
  const basic = { price: 100, compareAt: 150, stock: 50, inStock: true, cats: ['chakkars'], primary: 'chakkars', brand: 'Standard', note: 'Gallery QA short note', desc: 'Gallery QA full description remains saved independently.', rating: 4.9, showDescription: true, featured: false };
  const products = [{ ...basic, id: 910027, name: 'QA Product Gallery', shortName: 'QA Product Gallery', slug: 'qa-product-gallery', image: paths[0], images: paths }, { ...basic, id: 910028, name: 'QA Legacy Image', shortName: 'QA Legacy Image', slug: 'qa-legacy-image', image: paths[0] }];
  await mutateCatalog(current => {
    const overrides = { ...current.productOverrides }; delete overrides['910027']; delete overrides['910028'];
    return { extraProducts: current.extraProducts.filter(p => !products.some(product => product.id === p.id)).concat(products), productOverrides: overrides };
  });
  await new Promise((resolve, reject) => { const child = spawn(binary, ['--session', session, 'open', fixture.publicUrl], { stdio: 'ignore', windowsHide: true }); child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error('Gallery browser launch failed'))); });
  run('set', 'viewport', '1280', '1000'); openProduct(910027); input = await connectInput();
  if (evaluate(`!!document.querySelector('[data-analytics-reject]')`)) run('click', '[data-analytics-reject]');
  check('three persisted images render with primary selected', readState().count === '1 / 3' && evaluate(`document.querySelectorAll('[data-gallery-select]').length`) === 3);
  run('click', '#pdPlus'); run('click', '#pdAdd'); wait(`JSON.parse(localStorage.getItem('cm2.cart')||'[]').some(p=>p.id===910027)`); run('click', '#pdPlus');
  const shopping = readState();
  run('click', '[data-gallery-next]'); wait(`document.querySelector('[data-gallery-count]').textContent==='2 / 3'`);
  run('click', '[data-gallery-select="2"]'); wait(`document.querySelector('[data-gallery-count]').textContent==='3 / 3'`);
  check('buttons and thumbnails select the corresponding full image', readState().src.includes('p160.webp') && evaluate(`document.querySelector('[data-gallery-select="2"]').getAttribute('aria-pressed')==='true'`));
  run('focus', '[data-gallery-stage]'); run('press', 'Home'); wait(`document.querySelector('[data-gallery-count]').textContent==='1 / 3'`);
  top(); await input.wheel('[data-gallery-stage]', 100); wait(`document.querySelector('[data-gallery-count]').textContent==='2 / 3'`);
  await input.wheel('[data-gallery-stage]', -100); wait(`document.querySelector('[data-gallery-count]').textContent==='1 / 3'`);
  check('native wheel down and up switch gallery images', readState().index === 0);
  const stateAfter = readState(); check('image navigation preserves selected quantity and cart', stateAfter.qty === shopping.qty && stateAfter.cart === shopping.cart);
  evaluate(`(()=>{const stage=document.querySelector('[data-gallery-stage]');for(let i=0;i<8;i++)stage.dispatchEvent(new WheelEvent('wheel',{deltaY:30,bubbles:true,cancelable:true}));return true;})()`);
  check('trackpad momentum burst changes only one image', readState().count === '2 / 3');
  run('click', '[data-gallery-select="2"]'); top();
  const boundaryBefore = readState().scrollY; await input.wheel('[data-gallery-stage]', 260); wait(`scrollY>${boundaryBefore}+10`);
  check('native wheel at final image scrolls the page', readState().count === '3 / 3' && readState().scrollY > boundaryBefore);
  top(); const outsideBefore = readState().scrollY;
  await input.wheel('.prod-detail__info h1', 300); wait(`scrollY>${outsideBefore}+10`); check('native wheel outside gallery scrolls the page', readState().scrollY > outsideBefore);
  top(); run('screenshot', path.join(out, 'gallery-desktop.png'));
  const desktop = evaluate(`(()=>{const stage=document.querySelector('[data-gallery-stage]').getBoundingClientRect();const image=document.querySelector('[data-gallery-main]');return {width:stage.width,height:stage.height,fit:getComputedStyle(image).objectFit,overflow:document.documentElement.scrollWidth>innerWidth+1,broken:[...document.querySelectorAll('[data-gallery-image]')].filter(i=>i.complete&&!i.naturalWidth).length};})()`);
  check('desktop image is square, contained and unbroken', Math.abs(desktop.width - desktop.height) < 2 && desktop.fit === 'contain' && !desktop.overflow && desktop.broken === 0, desktop);
  const brandGeometry = () => evaluate(`(()=>{const stage=document.querySelector('[data-gallery-stage]'),pill=stage.querySelector('.product-brand-pill');if(!pill)return {inside:false};const s=stage.getBoundingClientRect(),p=pill.getBoundingClientRect(),i=stage.querySelector('[data-gallery-main]').getBoundingClientRect();return {inside:true,left:p.left-s.left,bottom:s.bottom-p.bottom,imageClear:i.bottom<=p.top,fontSize:parseFloat(getComputedStyle(pill).fontSize),width:p.width,height:p.height};})()`);
  const desktopBrand = brandGeometry();
  check('brand pill is readable inside bottom-left without covering the image', desktopBrand.inside && desktopBrand.left >= 8 && desktopBrand.left <= 18 && desktopBrand.bottom >= 8 && desktopBrand.bottom <= 18 && desktopBrand.fontSize >= 12 && desktopBrand.imageClear, desktopBrand);
  const accessibility = run('a11y', '--selector', '[data-product-gallery]');
  check('gallery has no automated accessibility violations', accessibility.counts?.violations === 0 && !accessibility.incomplete?.some(item => item.id === 'aria-prohibited-attr'), { violations: accessibility.violations || [], manualChecks: accessibility.incomplete?.map(item => item.id) || [] });

  run('set', 'viewport', '390', '844'); openProduct(910027); input.close(); input = await connectInput(); await input.enableTouch();
  const mobile = position('[data-gallery-stage]');
  await input.swipe({ x: mobile.x + 85, y: mobile.y }, { x: mobile.x - 85, y: mobile.y + 3 });
  wait(`document.querySelector('[data-gallery-count]').textContent==='2 / 3'`); check('native mobile swipe left advances image', readState().index === 1);
  await input.swipe({ x: mobile.x - 85, y: mobile.y }, { x: mobile.x + 85, y: mobile.y + 2 });
  wait(`document.querySelector('[data-gallery-count]').textContent==='1 / 3'`); check('native mobile swipe right returns image', readState().index === 0);
  const verticalBefore = readState().scrollY;
  await input.swipe({ x: mobile.x, y: mobile.y + 85 }, { x: mobile.x + 2, y: mobile.y - 85 });
  wait(`scrollY>${verticalBefore}+20`); check('vertical touch gesture scrolls page without changing image', readState().scrollY > verticalBefore && readState().index === 0);
  top(); run('screenshot', path.join(out, 'gallery-mobile.png'));
  const geometry = evaluate(`({overflow:document.documentElement.scrollWidth>innerWidth+1,buttonSizes:[...document.querySelectorAll('.prod-gallery button')].map(b=>{const r=b.getBoundingClientRect();return [r.width,r.height]}),thumbOverflow:getComputedStyle(document.querySelector('.prod-gallery__thumbs')).overflowX,touch:getComputedStyle(document.querySelector('[data-gallery-stage]')).touchAction})`);
  check('mobile controls fit page and remain touch friendly', !geometry.overflow && geometry.buttonSizes.every(([w, h]) => w >= 44 && h >= 44) && geometry.thumbOverflow === 'auto' && geometry.touch.includes('pan-y'), geometry);
  const mobileBrand = brandGeometry();
  check('mobile brand pill stays visible inside the image with readable text', mobileBrand.inside && mobileBrand.left >= 8 && mobileBrand.bottom >= 8 && mobileBrand.fontSize >= 12 && mobileBrand.imageClear, mobileBrand);

  await override({ showDescription: false }); openProduct(910027); wait(`!document.querySelector('.product-description')`);
  check('hidden description leaves short note and product controls visible', evaluate(`!!document.querySelector('.product-short-note')&&!!document.querySelector('#pdAdd')&&!document.querySelector('.product-description')`));
  const hidden = await api('/products-api.php?a=pull'); check('hidden description content stays saved', hidden.extraProducts.find(p => p.id === 910027).desc === basic.desc && hidden.productOverrides['910027'].showDescription === false);
  await override({ showDescription: true, image: paths[1], images: paths }); openProduct(910027); wait(`document.querySelector('[data-gallery-count]')?.textContent==='2 / 3'&&!!document.querySelector('.product-description')`);
  check('description and independently selected primary persist after reload', readState().src.includes('p28.webp') && evaluate(`document.querySelector('.product-description').textContent`) === basic.desc);
  run('open', `${fixture.publicUrl}/#/products?q=QA%20Product%20Gallery`); wait(`!!document.querySelector('.prod-card[data-id="910027"] img')`);
  check('product listing uses selected primary image', evaluate(`document.querySelector('.prod-card[data-id="910027"] img').getAttribute('src').includes('p28.webp')`));
  openProduct(910028); check('single-image product has no gallery navigation and keeps description default', evaluate(`!document.querySelector('[data-gallery-next]')&&!!document.querySelector('[data-gallery-main]')&&!!document.querySelector('.product-description')`));
  input.close(); input = await connectInput(); top(); const singleBefore = readState().scrollY; await input.wheel('[data-gallery-stage]', 200); wait(`scrollY>${singleBefore}+10`); check('single-image product leaves native wheel scrolling intact', readState().scrollY > singleBefore);
  const errors = run('errors'); check('gallery browser run has no uncaught page errors', !errors.errors?.length, { errors: errors.errors || [] });
} finally {
  if (input) input.close();
  fs.writeFileSync(path.join(out, 'gallery-results.json'), JSON.stringify({ date: new Date().toISOString(), checks }, null, 2));
  try { run('close'); } catch { /* Preserve original test failure if browser already stopped. */ }
}
