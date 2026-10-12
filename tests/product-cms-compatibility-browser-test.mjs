import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Exercise the real storefront and CMS runtime against disposable product data.
// The fixed element IDs are from product pages saved before the gallery release.
const fixture = JSON.parse(await readFile(process.env.CM_EDITOR_FIXTURE || 'audit-evidence/product-experience-20261010/editor-fixture.json', 'utf8'));
for (const url of [fixture.baseUrl, fixture.publicUrl]) assert.ok(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const health = await (await fetch(fixture.baseUrl + '/__fixture-health')).json();
assert.equal(health.isolated, true);
assert.equal(health.mail, 'disabled');
const binary = path.join(process.env.APPDATA, 'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const session = 'product-cms-compatibility-20261010';
const output = path.resolve('audit-evidence/product-cms-compatibility-' + Date.now());
await mkdir(output, { recursive: true });
const checks = [], observations = [];
const check = (name, pass) => { checks.push({ name, pass: !!pass }); console.log((pass ? 'PASS: ' : 'FAIL: ') + name); };
const run = (...args) => {
  const result = JSON.parse(execFileSync(binary, ['--session', session, ...args, '--json'], { encoding: 'utf8', windowsHide: true, timeout: 45000, maxBuffer: 8 * 1024 * 1024 }));
  assert.equal(result.success, true, result.error || args[0]);
  return result.data;
};
const evaluate = code => run('eval', '-b', Buffer.from(code).toString('base64')).result;
let cookie = '', csrf = '';
async function api(url, body) {
  const response = await fetch(fixture.baseUrl + url, { method: body ? 'POST' : 'GET', headers: { Cookie: cookie, Origin: fixture.baseUrl, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: body ? JSON.stringify(body) : undefined });
  const setCookie = response.headers.getSetCookie().find(value => value.startsWith('cm_staff='));
  if (setCookie) cookie = setCookie.split(';')[0];
  const json = await response.json();
  if (json.csrfToken) csrf = json.csrfToken;
  return { status: response.status, ...json };
}
const scenarios = [
  { id: 950101, brand: 'Standard', showDescription: true, note: 'Catalog short note' },
  { id: 950102, brand: 'Standard', showDescription: false, note: 'Catalog short note' },
  { id: 950103, brand: 'Other brand', showDescription: true, note: 'Catalog short note' },
  { id: 950104, brand: 'Other brand', showDescription: false, note: 'Catalog short note' },
  { id: 950105, brand: 'Standard', showDescription: false, note: '' },
].map(scenario => ({ price: 100, compareAt: 150, stock: 20, inStock: true, cats: ['chakkars'], primary: 'chakkars', name: 'CMS compatibility ' + scenario.id, shortName: 'CMS compatibility ' + scenario.id, slug: 'cms-compatibility-' + scenario.id, image: 'images/products/p27.webp', images: ['images/products/p27.webp', 'images/products/p28.webp'], desc: 'Catalog full description', ...scenario }));
try {
  await api('/staff-auth.php?a=session');
  assert.equal((await api('/staff-auth.php?a=login', { email: fixture.email, password: fixture.password })).authenticated, true);
  const current = await api('/products-api.php?a=pull');
  const overrides = { ...current.productOverrides };
  for (const product of scenarios) delete overrides[product.id];
  const saved = await api('/products-api.php', { a: 'push', rev: current.rev, productOverrides: overrides, extraProducts: current.extraProducts.filter(product => !scenarios.some(scenario => scenario.id === product.id)).concat(scenarios) });
  assert.equal(saved.status, 200, saved.error);
  await new Promise((resolve, reject) => {
    const child = spawn(binary, ['--session', session, 'open', fixture.publicUrl], { stdio: 'ignore', windowsHide: true });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error('Browser did not launch')));
  });
  run('set', 'viewport', '1440', '1000');
  for (const product of scenarios) {
    run('open', fixture.publicUrl + '/product/' + product.slug);
    run('wait', '--fn', `window.CMCms?.page()==='product' && document.querySelector('[data-product-gallery]')?.dataset.galleryProduct==='${product.id}' && !!document.querySelector('#cm-published-styles')`);
    const observed = evaluate(`(() => {
      const doc = window.CMCms.baseline();
      const section = doc.sections.find(item => item.source === 'product:prod-detail');
      const style = (key, values, text) => section.elements[key] = {kind:'container', styles:{desktop:values,tablet:{},mobile:{}},text};
      style('e0', {borderRadius:'23px',backgroundColor:'#edf2f9',width:'310px'});
      style('e1.1', {fontSize:'37px',color:'#112233'}, 'Stale saved product heading');
      style('e1.4', {color:'#334455',display:'block',marginBottom:'24px'}, 'Stale saved description');
      style('e1.8', {borderRadius:'19px'});
      const applied=window.CMCms.apply(doc);
      const sectionNode=document.querySelector('.prod-detail'), stage=sectionNode.querySelector('[data-gallery-stage]'), gallery=sectionNode.querySelector('[data-product-gallery]'), title=sectionNode.querySelector('.prod-detail__info>h1'), copy=sectionNode.querySelector('.desc-note'), info=sectionNode.querySelector('.prod-info-grid');
      const css=node=>getComputedStyle(node);
      return {applied,stageId:stage.dataset.cmsElement,galleryId:gallery.dataset.cmsElement||null,titleId:title.dataset.cmsElement,copyId:copy.dataset.cmsElement,infoId:info.dataset.cmsElement,stageRadius:css(stage).borderRadius,stageWidth:css(stage).width,stageBackground:css(stage).backgroundColor,titleSize:css(title).fontSize,titleColor:css(title).color,copyColor:css(copy).color,copyDisplay:css(copy).display,copyHeight:copy.getBoundingClientRect().height,infoRadius:css(info).borderRadius,title:title.textContent,note:copy.querySelector('.product-short-note')?.textContent||'',description:copy.querySelector('.product-description')?.textContent||'',copyText:copy.textContent,brand:!!gallery.querySelector('.product-brand-pill'),chromeEditable:!!gallery.querySelector('.product-brand-pill[data-cms-element],.product-brand-pill [data-cms-element],.prod-gallery__navigation[data-cms-element],.prod-gallery__navigation [data-cms-element],.prod-gallery__thumbs[data-cms-element],.prod-gallery__thumbs [data-cms-element]'),copyEditable:!!copy.querySelector('[data-cms-element]'),titleKind:window.CMCms.selectionInfo(section.id,'e1.1')?.descriptor.kind};
    })()`);
    observations.push({ product: product.id, observed });
    const label = `${product.brand}, description ${product.showDescription ? 'on' : 'off'}${product.note ? '' : ', empty note'}`;
    check(label + ': legacy media ID targets the image stage', observed.applied && observed.stageId === 'e0' && observed.galleryId === null);
    check(label + ': legacy image styles apply to the image stage', observed.stageRadius === '23px' && observed.stageWidth === '310px' && observed.stageBackground === 'rgb(237, 242, 249)');
    check(label + ': legacy heading ID and typography remain intact', observed.titleId === 'e1.1' && observed.titleSize === '37px' && observed.titleColor === 'rgb(17, 34, 51)');
    check(label + ': description and later element styles retain their IDs', observed.copyId === 'e1.4' && observed.copyColor === 'rgb(51, 68, 85)' && observed.infoId === 'e1.8' && observed.infoRadius === '19px');
    check(label + ': product copy remains catalog owned', observed.title === product.name && observed.note === product.note && observed.description === (product.showDescription ? product.desc : '') && !observed.copyText.includes('Stale saved') && !observed.copyEditable && observed.titleKind === 'container');
    check(label + ': brand and gallery navigation stay outside saved element IDs', !observed.chromeEditable && observed.brand === (product.brand === 'Standard'));
    if (!product.showDescription && !product.note) check(label + ': saved display styles cannot reveal an empty description box', observed.copyDisplay === 'none' && observed.copyHeight === 0);
  }
  run('screenshot', path.join(output, 'legacy-styles-hidden-description.png'));
  const errors = run('errors');
  check('Product compatibility run has no uncaught page errors', !errors.errors?.length);
  assert.ok(checks.every(item => item.pass), 'Existing product element identities and styles must survive gallery and description changes');
} finally {
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ checks, observations }, null, 2));
  console.log(JSON.stringify({ passed: checks.filter(item => item.pass).length, total: checks.length, output }));
  try { run('close'); } catch {}
}
