import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const fixture = JSON.parse(await readFile(process.env.CM_CMS_FIXTURE || 'audit-evidence/product-experience-20261010/original-upload-fixture.json', 'utf8'));
const base = fixture.baseUrl;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const health = await (await fetch(base + '/__fixture-health')).json();
assert.equal(health.isolated, true); assert.equal(health.mail, 'disabled');
const stamp = Date.now();
const session = 'original-upload-qa-20261010';
const namespace = 'original-upload-admin';
const binary = path.join(process.env.APPDATA, 'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const output = path.resolve('audit-evidence/original-upload-browser-' + stamp);
await mkdir(output, { recursive: true });
const checkResults = [];
const check = (name, condition = true, detail) => {
  checkResults.push({ name, status: condition ? 'PASS' : 'FAIL', ...(detail === undefined ? {} : { detail }) });
  console.log(`${condition ? 'PASS' : 'FAIL'}: ${name}`);
  assert.ok(condition, name);
};
const run = (...args) => {
  const stdout = execFileSync(binary, ['--pin-tab', '--namespace', namespace, '--session', session, ...args, '--json'], { encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
  const response = JSON.parse(stdout); assert.equal(response.success, true, response.error); return response.data;
};
const evaluate = code => run('eval', '-b', Buffer.from(code).toString('base64')).result;
const wait = code => run('wait', '--fn', code);
const media = prefix => evaluate(`Array.from(document.querySelectorAll('#${prefix}Media [data-media-id]'), n => ({id:n.dataset.mediaId,url:n.querySelector('img')?.getAttribute('src'),primary:n.classList.contains('is-primary')}))`);
const readyMedia = (prefix, count) => wait(`document.querySelectorAll('#${prefix}Media [data-media-id]').length===${count}&&!document.querySelector('#${prefix}Media progress')&&Array.from(document.querySelectorAll('#${prefix}Media [data-media-id] img')).every(n=>n.complete&&n.naturalWidth>0)`);
const contrast = () => evaluate(`(()=>{
  const rgba=value=>{const v=value.match(/[\\d.]+/g).map(Number);return [v[0],v[1],v[2],v.length>3?v[3]:1];};
  const lum=rgb=>rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  return Array.from(document.querySelectorAll('#epMedia .product-media__buttons button:not(:disabled),#epMedia .product-media__replace'),n=>{
    const parents=[];for(let p=n;p;p=p.parentElement)parents.push(p);
    let background=[255,255,255];for(const p of parents.reverse()){const c=rgba(getComputedStyle(p).backgroundColor);background=background.map((v,i)=>c[i]*c[3]+v*(1-c[3]));}
    const color=rgba(getComputedStyle(n).color),foreground=background.map((v,i)=>color[i]*color[3]+v*(1-color[3]));
    const a=lum(foreground),b=lum(background);return {label:n.textContent.trim(),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
  });
})()`);
const mediaAction = (prefix, id, action) => run('click', `#${prefix}Media [data-media-id="${id}"] [data-media-action="${action}"]`);
const readCatalog = async () => (await (await fetch(base + '/products-api.php?a=pull')).json());
let productId, failure;

// Each file has a visible opaque background. Ordinary uploads must retain the
// exact original bytes and dimensions without running an image-editing step.
const python = process.env.CM_TEST_PYTHON || path.join(process.env.LOCALAPPDATA, 'Programs/Python/Python312/python.exe');
execFileSync(python, ['-c', `from PIL import Image,ImageDraw\nfrom pathlib import Path\np=Path(${JSON.stringify(output)})\nfor i,c in enumerate(['#1479cc','#e58b20','#7628b8','#cf345b']):\n im=Image.new('RGBA',(256,256),(246,239,220,255));d=ImageDraw.Draw(im);d.rounded_rectangle((30,25,225,230),radius=22,fill=c);d.text((110,116),str(i+1),fill='white');im.save(p/f'admin-media-{i+1}.png')\n`], { windowsHide: true });
const files = [1, 2, 3, 4].map(i => path.join(output, `admin-media-${i}.png`));
await writeFile(path.join(output, 'invalid.txt'), 'This is not an image.');
await writeFile(path.join(output, 'invalid.png'), 'This file has a PNG name but is not an image.');
const uniqueName = `QA Admin Media Lifecycle ${stamp}`;
const description = 'First line of a preserved description.\nSecond line with precise pack details.';
const openProducts = () => { run('click', '[data-stab="products"]'); run('wait', '#admPq'); };
const edit = () => { run('wait', `[data-edit-prod="${productId}"]`); run('scrollintoview', `[data-edit-prod="${productId}"]`); run('click', `[data-edit-prod="${productId}"]`); run('wait', '#epMedia'); };
const saveEdit = () => { run('click', '[data-save-edit]'); wait("!document.querySelector('[data-edit-modal]')"); };
const merged = async () => { const data = await readCatalog(); const original = data.extraProducts.find(p => p.id === productId); return { ...original, ...(data.productOverrides[productId] || {}) }; };

try {
  // Start the Windows browser client asynchronously before subsequent sync commands.
  await new Promise((resolve, reject) => {
    const launcher = spawn(binary, ['--pin-tab', '--namespace', namespace, '--session', session, 'open', base], { stdio: 'ignore', windowsHide: true });
    launcher.once('error', reject);
    launcher.once('exit', code => code === 0 ? resolve() : reject(new Error('Local upload browser did not launch')));
  });
  const sessionResponse = await fetch(base + '/staff-auth.php?a=session');
  const sessionData = await sessionResponse.json();
  let cookie = sessionResponse.headers.getSetCookie().find(value => value.startsWith('cm_staff='))?.split(';')[0];
  assert.ok(cookie);
  const loginResponse = await fetch(base + '/staff-auth.php?a=login', { method: 'POST', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json', 'X-CSRF-Token': sessionData.csrfToken }, body: JSON.stringify({ email: fixture.email, password: fixture.password }) });
  assert.equal(loginResponse.ok, true);
  cookie = loginResponse.headers.getSetCookie().find(value => value.startsWith('cm_staff='))?.split(';')[0] || cookie;
  run('open', base + '/#/staff');
  run('cookies', 'set', 'cm_staff', cookie.slice(9), '--url', base, '--httpOnly', '--sameSite', 'Lax');
  run('reload'); wait("document.querySelector('#adminShell')&&document.querySelector('[data-stab=add-product]')");
  run('set', 'viewport', '1440', '1000');
  run('click', '[data-stab="add-product"]'); run('wait', '#apMedia');
  await writeFile(path.join(output, 'add-product-snapshot.json'), JSON.stringify(run('snapshot', '-i'), null, 2));
  check('Add Product exposes multi-file picker and description visibility enabled by default', evaluate("document.querySelector('#apFile').multiple&&document.querySelector('#apShowDescription').checked"));
  for (const [selector, value] of [['#apName', uniqueName], ['#apBrand', 'Standard Crackers'], ['#apOnline', '321'], ['#apCmp', '654'], ['#apStock', '12'], ['#apSku', 'QA-MEDIA-' + stamp], ['#apDesc', description], ['#apNote', 'Retained short note']]) run('fill', selector, value);
  run('select', '#apCat', 'sparklers'); run('uncheck', '#apShowDescription');
  run('upload', '#apFile', ...files.slice(0, 3)); readyMedia('ap', 3);
  let items = media('ap'); const originalUrls = items.map(item => item.url);
  check('Three real uploads produce distinct durable URLs and preview images', originalUrls.length === 3 && new Set(originalUrls).size === 3 && originalUrls.every(url => /^uploads\//.test(url)));
  for (let index = 0; index < originalUrls.length; index++) {
    const uploaded = Buffer.from(await (await fetch(base + '/' + originalUrls[index])).arrayBuffer());
    check('Multi-upload ' + (index + 1) + ' preserves exact original bytes', uploaded.equals(await readFile(files[index])));
  }
  run('upload', '#apFile', files[1]); readyMedia('ap', 3);
  check('Repeated selection of the same file does not duplicate it in the draft', media('ap').length === 3);
  run('upload', '#apFile', path.join(output, 'invalid.txt')); wait("document.querySelector('#apMedia [data-media-errors]').textContent.includes('JPG, PNG or WebP')");
  check('Unsupported upload is rejected while all successful uploads remain', media('ap').length === 3);
  mediaAction('ap', items[1].id, 'primary');
  mediaAction('ap', items[2].id, 'earlier'); mediaAction('ap', items[2].id, 'earlier');
  items = media('ap');
  check('Primary selection remains independent when images are reordered', items.map(i => i.url).join('|') === [originalUrls[2], originalUrls[0], originalUrls[1]].join('|') && items.find(i => i.primary)?.url === originalUrls[1]);
  run('scrollintoview', '#apMedia'); run('screenshot', path.join(output, 'add-product-three-images.png'));
  run('click', '[data-save-product]'); run('wait', '#admPq');
  const added = (await readCatalog()).extraProducts.find(p => p.name === uniqueName); assert.ok(added); productId = added.id;
  check('Add Product persists gallery order, primary, and an OFF description without losing its text', added.images.join('|') === items.map(i => i.url).join('|') && added.image === originalUrls[1] && added.showDescription === false && added.desc === description);
  edit(); readyMedia('ep', 3);
  check('Edit Product restores the saved gallery and OFF toggle', !evaluate("document.querySelector('#epShowDescription').checked") && evaluate("document.querySelector('#epDesc').value") === description && media('ep').map(i => i.url).join('|') === added.images.join('|'));
  const beforeReplace = media('ep');
  run('upload', `#epMedia [data-media-id="${beforeReplace[0].id}"] [data-media-replace]`, path.join(output, 'invalid.png'));
  wait("!!document.querySelector('#epMedia [data-media-errors]').textContent&&!document.querySelector('#epMedia progress')");
  check('Invalid image bytes report failure and preserve the old image during replacement', media('ep')[0].url === beforeReplace[0].url);
  run('upload', `#epMedia [data-media-id="${beforeReplace[0].id}"] [data-media-replace]`, files[3]); readyMedia('ep', 3);
  items = media('ep');
  check('Replacement upload preserves exact original bytes', Buffer.from(await (await fetch(base + '/' + items[0].url)).arrayBuffer()).equals(await readFile(files[3])));
  check('Replacing one image preserves the other images and current primary', items[0].url !== beforeReplace[0].url && items[1].url === beforeReplace[1].url && items[2].url === beforeReplace[2].url && items.find(i => i.primary)?.url === originalUrls[1]);
  const primaryId = items.find(i => i.primary).id; mediaAction('ep', primaryId, 'remove');
  items = media('ep');
  check('Removing the primary image selects a remaining image without reusing the removed URL', items.length === 2 && items[0].primary && !items.some(i => i.url === originalUrls[1]));
  run('check', '#epShowDescription'); saveEdit();
  let saved = await merged();
  check('Edited primary, removal and description ON persist to the real local API', saved.images.join('|') === items.map(i => i.url).join('|') && saved.image === items[0].url && saved.showDescription === true && saved.desc === description);
  run('reload'); wait("!!document.querySelector('[data-stab=products]')"); openProducts(); edit(); readyMedia('ep', 2);
  check('A full browser refresh restores edited image state and retained description', media('ep').map(i => i.url).join('|') === saved.images.join('|') && evaluate("document.querySelector('#epShowDescription').checked&&document.querySelector('#epDesc').value") === description);
  for (const [width, height, label] of [[1024, 900, 'desktop'], [390, 844, 'mobile']]) {
    run('set', 'viewport', String(width), String(height)); run('scrollintoview', '#epMedia');
    const dimensions = evaluate("(()=>{const n=document.querySelector('#epMedia'),r=n.getBoundingClientRect(),card=n.closest('.edit-card');return{width:innerWidth,mediaLeft:r.left,mediaRight:r.right,mediaScroll:n.scrollWidth,mediaClient:n.clientWidth,cardScroll:card.scrollWidth,cardClient:card.clientWidth};})()");
    check(`Image manager fits the ${label} edit layout`, dimensions.mediaLeft >= -1 && dimensions.mediaRight <= width + 1 && dimensions.mediaScroll <= dimensions.mediaClient + 1 && dimensions.cardScroll <= dimensions.cardClient + 1, dimensions);
    const ratios = contrast(); check(`Enabled image actions have readable contrast in light ${label} view`, ratios.length > 0 && ratios.every(item => item.ratio >= 4.5), ratios);
    run('screenshot', path.join(output, `edit-product-${label}.png`));
  }
  run('uncheck', '#epShowDescription'); saveEdit();
  saved = await merged();
  check('Turning description OFF again preserves exactly the saved description', saved.showDescription === false && saved.desc === description);
  run('set', 'viewport', '1440', '1000'); edit(); readyMedia('ep', 2); run('check', '#epShowDescription'); saveEdit();
  saved = await merged();
  check('Turning description back ON restores the unchanged text', saved.showDescription === true && saved.desc === description);
  check('Non-media product fields are unchanged through the lifecycle', saved.price === 321 && saved.compareAt === 654 && saved.stock === 12 && saved.sku === 'QA-MEDIA-' + stamp && saved.brand === 'Standard Crackers');
  run('click', '[data-theme-btn]'); wait("document.querySelector('#adminShell').dataset.admtheme==='dark'"); edit(); readyMedia('ep', 2);
  run('scrollintoview', '#epMedia'); const darkRatios = contrast();
  check('Enabled image actions have readable contrast in dark mode', darkRatios.length > 0 && darkRatios.every(item => item.ratio >= 4.5), darkRatios);
  run('screenshot', path.join(output, 'edit-product-dark.png'));
  await writeFile(path.join(output, 'final-product.json'), JSON.stringify(saved, null, 2));
  run('click', 'button[data-close-edit][aria-label="Close"]');
  run('open', fixture.publicUrl + '/product/' + (saved.slug || 'p-' + saved.id)); run('reload');
  wait(`document.querySelector('[data-product-gallery]')?.dataset.galleryProduct==='${productId}'&&document.querySelector('[data-gallery-main]')?.complete`);
  const publicGallery = evaluate("({src:document.querySelector('[data-gallery-main]').getAttribute('src'),width:document.querySelector('[data-gallery-main]').naturalWidth,height:document.querySelector('[data-gallery-main]').naturalHeight,count:document.querySelector('[data-gallery-count]')?.textContent})");
  check('Storefront gallery uses the original saved primary and dimensions', publicGallery.src === saved.image && publicGallery.width === 256 && publicGallery.height === 256 && !publicGallery.src.includes('nobg'));
  wait("Number(getComputedStyle(document.querySelector('[data-product-gallery]')).opacity)>.99");
  run('screenshot', path.join(output, 'storefront-original-primary.png'));
  run('click', '[data-gallery-next]');
  wait(`document.querySelector('[data-gallery-main]')?.getAttribute('src')===${JSON.stringify(saved.images[1])}&&document.querySelector('[data-gallery-main]')?.complete`);
  check('Storefront gallery switches to the other original upload', evaluate("document.querySelector('[data-gallery-main]').getAttribute('src')") === saved.images[1]);
  run('reload'); wait(`document.querySelector('[data-gallery-main]')?.getAttribute('src')===${JSON.stringify(saved.image)}`);
  check('Storefront refresh restores the saved original primary', evaluate("document.querySelector('[data-gallery-main]').getAttribute('src')") === saved.image);
  run('open', fixture.editorUrl); wait("document.querySelector('#loading')?.hidden&&document.querySelector('#siteFrame')?.contentWindow.CMCms?.page()==='home'");
  run('click', '[data-nav="uploads"]'); run('wait', '[data-upload-image]');
  const library = async () => (await (await fetch(base + '/cms-media.php?a=list&pageSize=100', { headers: { Cookie: cookie } })).json()).items;
  const beforeEditorUrls = new Set((await library()).map(item => item.url));
  run('upload', '[data-upload-image]', files[0]);
  wait("!document.querySelector('[data-upload-image]')?.disabled&&document.querySelector('#toasts').textContent.includes('Image uploaded')");
  const editorUploaded = (await library()).filter(item => !beforeEditorUrls.has(item.url));
  check('Visual Editor ordinary upload creates one library original', editorUploaded.length === 1);
  const editorUrl = editorUploaded[0].url;
  check('Visual Editor upload preserves exact original bytes', Buffer.from(await (await fetch(base + '/' + editorUrl.replace(/^\//,''))).arrayBuffer()).equals(await readFile(files[0])));
  const tileIndex = evaluate(`Array.from(document.querySelectorAll('.upload-tile')).findIndex(node=>new URL(node.querySelector('img').getAttribute('src'),location.href).pathname===new URL(${JSON.stringify(editorUrl)},location.href).pathname)`);
  assert.ok(tileIndex >= 0); run('click', `[data-upload-index="${tileIndex}"]`);
  wait(`Array.from(document.querySelector('#siteFrame').contentDocument.querySelectorAll('#view img')).some(img=>new URL(img.getAttribute('src'),location.href).pathname===new URL(${JSON.stringify(editorUrl)},location.href).pathname&&img.complete&&img.naturalWidth===256)`);
  check('Visual Editor places the selected original without changing its dimensions', true);
  run('screenshot', path.join(output, 'editor-original-upload.png'));
  wait("document.querySelector('#saveStatus').textContent.startsWith('✓ Saved')&&document.querySelector('#errorBanner').hidden");
  run('reload'); wait("document.querySelector('#loading')?.hidden&&document.querySelector('#siteFrame')?.contentWindow.CMCms?.page()==='home'");
  wait(`Array.from(document.querySelector('#siteFrame').contentDocument.querySelectorAll('#view img')).some(img=>new URL(img.getAttribute('src'),location.href).pathname===new URL(${JSON.stringify(editorUrl)},location.href).pathname&&img.complete)`);
  check('Visual Editor refresh preserves the placed original image', true);
  console.log(output);
} catch (error) {
  failure = error;
  try { run('screenshot', path.join(output, 'failure.png')); await writeFile(path.join(output, 'failure-snapshot.json'), JSON.stringify(run('snapshot', '-i'), null, 2)); } catch {}
  console.error(error.stack || error);
} finally {
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ scope: 'isolated local PHP fixture', productId, checks: checkResults, passed: !failure, ...(failure ? { error: failure.message } : {}) }, null, 2));
  if (!failure) run('close');
}
if (failure) process.exitCode = 1;
