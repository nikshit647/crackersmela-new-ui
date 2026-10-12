import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

// Run only against the copied PHP fixture. This suite never submits an order,
// writes CMS content, contacts a mail transport, or uses a shared browser session.
const fixturePath = process.env.CM_CATEGORY_FIXTURE || 'audit-evidence/category-navigation-fixture.json';
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
const base = fixture.publicUrl;
for (const value of [base, fixture.baseUrl]) assert.ok(['localhost', '127.0.0.1'].includes(new URL(value).hostname));
assert.equal(path.dirname(path.resolve(fixture.fixture)), path.resolve('audit-evidence'));
assert.ok(path.basename(fixture.fixture).startsWith('cms-fixture-'));
const health = await (await fetch(base + '/__fixture-health')).json();
assert.equal(health.isolated, true); assert.equal(health.mail, 'disabled');
const productData = JSON.parse(await readFile(path.join(fixture.fixture, 'data/products.json'), 'utf8'));
const binary = path.join(process.env.APPDATA, 'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const session = process.env.CM_CATEGORY_SESSION || 'mobile-category-nav-01a11104';
const output = path.resolve('audit-evidence/mobile-category-navigation-' + Date.now());
await mkdir(output, {recursive:true});
await mkdir('audit', {recursive:true});
const checks = [];
const limitations = ['Chromium at the requested mobile viewports; native horizontal mouse-wheel input was tested through agent-browser streaming. Physical iOS/Android finger gestures were not tested.'];
let inputSocket;
const run = (...args) => {
  const response = JSON.parse(execFileSync(binary, ['--session', session, ...args, '--json'], {encoding:'utf8', windowsHide:true, timeout:45000, maxBuffer:8*1024*1024}));
  assert.equal(response.success, true, response.error); return response.data;
};
const evaluate = code => run('eval', '-b', Buffer.from(code).toString('base64')).result;
const wait = code => run('wait', '--fn', code);
const check = (name, condition = true, detail = {}) => { checks.push({name, status:condition?'PASS':'FAIL', ...detail}); assert.ok(condition, name); console.log('PASS: ' + name); };
const click = selector => {
  if (selector.startsWith('.shop-main ') || selector.startsWith('.prod-card[')) {
    run('scrollintoview', selector);
    wait(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e?.getBoundingClientRect();return !!r&&r.top>=0&&r.bottom<=innerHeight&&e.closest('.prod-card').getAnimations({subtree:true}).every(a=>a.playState!=='running');})()`);
  }
  if (selector.startsWith('#cartDrawer ') || selector.includes('Close cart') || selector === '#cartViewBtn') {
    wait('(()=>{const p=document.querySelector("#cartDrawer .drawer__panel"),r=p.getBoundingClientRect();return r.right<=innerWidth+1&&p.getAnimations({subtree:true}).every(a=>a.playState!=="running");})()');
  }
  run('scrollintoview', selector);
  let prior = null, stable = 0, point = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const probe = evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);return {x,y,inside:r.top>=0&&r.bottom<=innerHeight,hit:!!hit&&(hit===e||e.contains(hit)),disabled:!!e.disabled};})()`);
    stable = prior && Math.abs(prior.x-probe.x)<0.1 && Math.abs(prior.y-probe.y)<0.1 && probe.inside && probe.hit && !probe.disabled ? stable+1 : 0;
    if (stable >= 3) { point=probe; break; }
    prior=probe; run('wait','100');
  }
  assert.ok(point,'Stable clickable target: '+selector);
  run('mouse','move',String(Math.round(point.x)),String(Math.round(point.y)));
  run('mouse','down'); return run('mouse','up');
};
const cart = () => evaluate('JSON.parse(localStorage.getItem("cm2.cart")||"[]")');
const openProducts = (suffix = '') => {
  run('open', base + '/#/products' + suffix);
  wait('document.querySelectorAll(".shop-main .prod-card").length>0&&document.querySelector("#catRail [data-cat]")');
  run('wait', '--load', 'networkidle');
};
const ids = () => evaluate('[...document.querySelectorAll(".shop-main .prod-card")].map(e=>Number(e.dataset.id)).sort((a,b)=>a-b)');
const showRail = () => {
  run('scrollintoview', '#catRail');
  wait('(()=>{const r=document.querySelector("#catRail").getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})()');
};
const wheelRail = async (dx) => {
  showRail();
  const point = evaluate('(()=>{const r=document.querySelector("#catRail").getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()');
  // Separate CLI mouse commands dispatch wheels at (0,0), even after mouse
  // move. The documented stream keeps the coordinates with native input.
  inputSocket.send(JSON.stringify({type:'input_mouse',eventType:'mouseMoved',x:point.x,y:point.y}));
  inputSocket.send(JSON.stringify({type:'input_mouse',eventType:'mouseWheel',x:point.x,y:point.y,deltaX:dx,deltaY:0}));
  await new Promise(resolve=>setTimeout(resolve,50));
};
const activeVisible = () => evaluate('(()=>{const r=document.querySelector("#catRail").getBoundingClientRect(),p=document.querySelector("#catRail [data-cat].active")?.getBoundingClientRect();return !!p&&p.left>=r.left-1&&p.right<=r.right+1;})()');
const waitActiveVisible = () => wait('(()=>{const r=document.querySelector("#catRail").getBoundingClientRect(),p=document.querySelector("#catRail [data-cat].active")?.getBoundingClientRect();return !!p&&p.left>=r.left-1&&p.right<=r.right+1;})()');
const frameWait = code => wait(`(()=>{const win=document.querySelector('#siteFrame')?.contentWindow,doc=win?.document;return !!doc&&(${code});})()`);
const frameRead = code => evaluate(`(()=>{const win=document.querySelector('#siteFrame').contentWindow,doc=win.document;return (${code});})()`);

try {
  await new Promise((resolve, reject) => { const child = spawn(binary, ['--session', session, 'open', base + '/#/products'], {stdio:'ignore', windowsHide:true}); child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error('Browser launch failed'))); });
  run('set', 'device', 'iPhone 12');
  run('set', 'viewport', '390', '844');
  openProducts();
  const stream = run('stream', 'status');
  inputSocket = new WebSocket('ws://127.0.0.1:' + stream.port + '/?pacing=ack&maxFps=1');
  await new Promise((resolve,reject)=>{inputSocket.addEventListener('open',resolve,{once:true});inputSocket.addEventListener('error',reject,{once:true});});
  if (evaluate('[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="Decline")')) run('find', 'role', 'button', 'click', '--name', 'Decline');
  check('Category rail has a dedicated mobile wrapper', evaluate('!!document.querySelector(".cat-rail-shell > #catRail")'));
  const data = evaluate('({categories:CM_DATA.categories,products:CM_DATA.products})');
  const products = data.products.concat(productData.extraProducts || []).map(p => ({...p, ...productData.productOverrides?.[p.id]})).filter(p => !p.disabled);
  const expectedIds = (category = 'all') => products.filter(p => category === 'all' || p.cats.includes(category)).map(p=>p.id).sort((a,b)=>a-b);
  const categories = data.categories.map(c => ({id:c.id, name:c.name, count:expectedIds(c.id).length}));
  check('Fixture retains all 11 category identities and the full selling catalogue', categories.length === 11 && JSON.stringify(ids()) === JSON.stringify(expectedIds()), {total:products.length});
  const last = categories.at(-1);

  for (const [width, height] of [[360,800],[375,812],[390,844],[412,915],[425,904]]) {
    run('set', 'viewport', String(width), String(height)); openProducts(); showRail();
    wait('document.querySelector(".cat-rail-shell").classList.contains("can-scroll-end")');
    const layout = evaluate(`(()=>{const shell=document.querySelector('.cat-rail-shell'),rail=document.querySelector('#catRail'),r=rail.getBoundingClientRect(),pills=[...rail.querySelectorAll('.cat-pill')],active=rail.querySelector('.active'),style=getComputedStyle(active);return {viewport:[innerWidth,innerHeight],pageWidth:document.documentElement.scrollWidth,railHeight:r.height,railWidth:r.width,overflowX:getComputedStyle(rail).overflowX,columns:getComputedStyle(document.querySelector('.shop-main .prod-grid')).gridTemplateColumns.split(' ').length,visiblePills:pills.filter(p=>{const b=p.getBoundingClientRect();return b.left>=r.left-1&&b.right<=r.right+1}).length,oneRow:pills.every(p=>Math.abs(p.getBoundingClientRect().top-pills[0].getBoundingClientRect().top)<1),minTarget:Math.min(...pills.map(p=>p.getBoundingClientRect().height)),start:shell.classList.contains('can-scroll-start'),end:shell.classList.contains('can-scroll-end'),selected:{background:style.backgroundColor,color:style.color,radius:style.borderRadius,current:active.getAttribute('aria-current')},counts:[...rail.querySelectorAll('[data-cat]')].map(p=>({id:p.dataset.cat,count:Number(p.querySelector('.cp-n').textContent)}))};})()`);
    check('Compact rail and two-column products at ' + width + '×' + height,
      layout.viewport[0] === width && layout.viewport[1] === height && layout.pageWidth <= width + 1 && layout.columns === 2 && layout.oneRow && layout.visiblePills >= 2 && layout.minTarget >= 44 && ['auto','scroll'].includes(layout.overflowX) && !layout.start && layout.end && layout.selected.color === 'rgb(255, 255, 255)' && layout.selected.current === 'true', layout);
    const expectedCounts = [{id:'all',count:products.length}, ...categories.map(({id,count})=>({id,count}))];
    check('Category counts match the live catalogue at ' + width + 'px', layout.counts.length === expectedCounts.length && layout.counts.every((actual,index)=>actual.id===expectedCounts[index].id&&actual.count===expectedCounts[index].count));
    run('screenshot', path.join(output, 'products-' + width + '.png'));

    await wheelRail(240); wait('document.querySelector("#catRail").scrollLeft>10&&document.querySelector(".cat-rail-shell").classList.contains("can-scroll-start")');
    const right = evaluate('document.querySelector("#catRail").scrollLeft');
    await wheelRail(-120); wait('document.querySelector("#catRail").scrollLeft<' + (right - 10));
    check('Native horizontal wheel moves both ways at ' + width + 'px', true, {forwardOffset:right,backOffset:evaluate('document.querySelector("#catRail").scrollLeft')});
    await wheelRail(20000); wait('(()=>{const r=document.querySelector("#catRail");return r.scrollLeft>=r.scrollWidth-r.clientWidth-2&&!document.querySelector(".cat-rail-shell").classList.contains("can-scroll-end");})()');
    check('End indicator clears at the actual scroll boundary at ' + width + 'px', evaluate('document.querySelector(".cat-rail-shell").classList.contains("can-scroll-start")'));
    click('#catRail [data-cat="' + last.id + '"]');
    wait('location.hash==="#/products?cat=' + last.id + '"&&document.querySelectorAll(".shop-main .prod-card").length===' + last.count);
    waitActiveVisible();
    check('Last category selection stays visible and filters exact products at ' + width + 'px', activeVisible() && JSON.stringify(ids()) === JSON.stringify(expectedIds(last.id)), {category:last.id,count:last.count});
    run('screenshot', path.join(output, 'last-category-' + width + '.png'));
    await wheelRail(-20000); wait('document.querySelector("#catRail").scrollLeft<=2&&!document.querySelector(".cat-rail-shell").classList.contains("can-scroll-start")');
    click('#catRail [data-cat="all"]'); wait('location.hash==="#/products"&&document.querySelectorAll(".shop-main .prod-card").length===' + products.length); waitActiveVisible();
    check('All Categories restores the full catalogue at ' + width + 'px', JSON.stringify(ids()) === JSON.stringify(expectedIds()));

    const id = evaluate('document.querySelector(".shop-main [data-add]:not([disabled])").dataset.add');
    click('.shop-main [data-add="' + id + '"]'); wait('!document.querySelector("#cartCount").classList.contains("hidden")&&Number(document.querySelector("#cartCount").textContent)===1');
    const foot = '.shop-main .prod-card[data-id="' + id + '"]';
    wait(`document.querySelector(${JSON.stringify(foot + ' .qty-num')})?.textContent==='1'`);
    check('Add updates card state and cart counter at ' + width + 'px', evaluate(`!!document.querySelector(${JSON.stringify(foot + ' .prod-card__foot--cart')})&&document.querySelector(${JSON.stringify(foot + ' .qty-num')}).textContent==='1'`) && cart().some(p=>String(p.id)===id&&p.qty===1));
    click(foot + ' [data-d="1"]'); wait('Number(document.querySelector("#cartCount").textContent)===2');
    wait(`document.querySelector(${JSON.stringify(foot + ' .qty-num')})?.textContent==='2'`);
    click(foot + ' [data-d="-1"]'); wait('Number(document.querySelector("#cartCount").textContent)===1');
    click('#cartBtn'); wait('document.querySelector("#cartDrawer").classList.contains("open")');
    check('Cart drawer retains the selected item at ' + width + 'px', evaluate('!!document.querySelector("#cartDrawer [data-del=\\"' + id + '\\"]")&&document.documentElement.scrollWidth<=innerWidth+1'));
    click('#cartDrawer [data-del="' + id + '"]'); wait('document.querySelector("#cartCount").classList.contains("hidden")');
    click('[aria-label="Close cart"]'); wait('!document.querySelector("#cartDrawer").classList.contains("open")');
    wait('!!document.querySelector(' + JSON.stringify(foot + ' [data-add="' + id + '"]') + ')');
    check('Removing from drawer restores Add on the product card at ' + width + 'px', cart().length === 0 && evaluate('!!document.querySelector(' + JSON.stringify(foot + ' [data-add="' + id + '"]') + ')'));
  }

  run('set', 'viewport', '390', '844'); openProducts();
  for (const category of categories) {
    run('scrollintoview', '#catRail [data-cat="' + category.id + '"]');
    click('#catRail [data-cat="' + category.id + '"]');
    wait('location.hash==="#/products?cat=' + category.id + '"&&document.querySelectorAll(".shop-main .prod-card").length===' + category.count);
    waitActiveVisible();
    check('Category button maps to exact IDs: ' + category.name, JSON.stringify(ids()) === JSON.stringify(expectedIds(category.id)));
  }
  // A real direct link is a cold document load. Reload the deep link so focus
  // retained by the clicks above cannot mask a focus steal; a fresh load must
  // reveal the selected pill without moving focus onto a rail button.
  openProducts('?cat=' + last.id); run('reload');
  wait('document.querySelectorAll(".shop-main .prod-card").length>0&&document.querySelector("#catRail [data-cat]")');
  run('wait', '--load', 'networkidle');
  waitActiveVisible();
  check('Direct link reveals the selected category without stealing focus', activeVisible() && !evaluate('document.activeElement.matches("#catRail button")'));
  run('focus', '#catRail [data-cat="' + last.id + '"]'); run('press', 'Enter'); waitActiveVisible();
  check('Keyboard activation retains focus on the category', evaluate('document.activeElement?.dataset.cat') === last.id);
  run('press', 'Tab');
  check('Category controls retain a visible keyboard focus indicator', evaluate('document.activeElement.matches("#catRail button:focus-visible")&&parseFloat(getComputedStyle(document.activeElement).outlineWidth)>=2'));

  openProducts(); click('#navSearchOpenBtn'); run('fill', '#navSearchInput', 'sparklers'); run('press', 'Enter');
  wait('location.hash.includes("q=sparklers")&&document.querySelectorAll(".shop-main .prod-card").length>0');
  check('Mobile search still opens matching product results', evaluate('document.querySelector(".page-head h1").textContent.includes("sparklers")'));
  const wishId = evaluate('document.querySelector(".shop-main [data-wish]").dataset.wish');
  click('.shop-main [data-wish="' + wishId + '"]'); wait('document.querySelector("#wishCount").textContent==="1"');
  // On mobile the navbar hides #wishBtn; Favourites move into the hamburger drawer.
  click('#mobileToggle'); wait('document.querySelector("#mobileDrawer").classList.contains("open")');
  click('#mobileDrawer a[href="#/wishlist"]'); wait('location.hash==="#/wishlist"&&!!document.querySelector(".prod-card[data-id=\\"' + wishId + '\\"]")');
  check('Wishlist retains the chosen product after category and search navigation', evaluate('document.querySelectorAll("#view .prod-card").length') === 1);
  click('#view [data-wish="' + wishId + '"]'); wait('document.querySelector("#wishCount").classList.contains("hidden")');
  openProducts('?sort=price-desc');
  const product = evaluate('[...document.querySelectorAll(".shop-main .prod-card")].filter(e=>e.querySelector("[data-add]:not([disabled])")).map(e=>({id:e.dataset.id,price:Number(e.querySelector(".price-now").textContent.replace(/[^0-9.]/g,"")),href:e.querySelector("h3 a").getAttribute("href")})).find(p=>p.price>=2500)');
  assert.ok(product, 'Fixture needs an in-stock product above the existing minimum order');
  const productLink = '.prod-card[data-id="' + product.id + '"] h3 a';
  wait(`scrollY===0&&document.querySelector(${JSON.stringify(productLink)}).closest('.prod-card').getAnimations().every(a=>a.playState!=='running')`);
  click(productLink); wait('location.hash===' + JSON.stringify(product.href)); run('wait', '#pdAdd');
  check('Product detail opens with quantity controls', evaluate('!!document.querySelector("#pdQty")&&!!document.querySelector("#pdPlus")'));
  click('#pdAdd'); wait('!document.querySelector("#cartCount").classList.contains("hidden")&&Number(document.querySelector("#cartCount").textContent)===1');
  click('#cartBtn'); wait('document.querySelector("#cartDrawer").classList.contains("open")'); click('#cartViewBtn'); run('wait', '#goCheckout');
  check('Full cart retains product and permits checkout above the minimum', cart().some(p=>String(p.id)===product.id) && !evaluate('document.querySelector("#goCheckout").disabled'));
  click('#goCheckout'); run('wait', '#ck_name');
  check('Checkout customer and delivery form loads with no horizontal overflow', evaluate('!!document.querySelector("#ck_phone")&&!!document.querySelector("#ck_address")&&document.documentElement.scrollWidth<=innerWidth+1'));
  run('screenshot', path.join(output, 'checkout-smoke.png'));
  run('open', base + '/#/cart'); run('wait', '#clearCart'); click('#clearCart'); wait('document.querySelector("#cartCount").classList.contains("hidden")');
  check('Synthetic cart and wishlist are empty after smoke checks', cart().length === 0 && evaluate('JSON.parse(localStorage.getItem("cm2.wish")||"[]").length') === 0);

  for (const width of [1024, 1280]) {
    run('set', 'viewport', String(width), '1000'); openProducts();
    check('Desktop keeps the rail hidden without reserving space at ' + width + 'px', evaluate('document.querySelector(".cat-rail-shell").getBoundingClientRect().height===0&&getComputedStyle(document.querySelector("#catRail")).display==="none"&&document.documentElement.scrollWidth<=innerWidth+1'));
  }

  // The editor runs the same storefront in a real 390px iframe. Read only:
  // opening mobile preview must not alter draft content or publication state.
  run('set', 'viewport', '1600', '1000'); run('open', fixture.baseUrl + '/#/staff'); run('wait', '#goAuthStaff'); click('#goAuthStaff');
  run('wait', '#auEmail'); run('fill', '#auEmail', fixture.email); run('fill', '#auPass', fixture.password); click('#auSubmit'); run('wait', '#staffPanel');
  run('open', fixture.editorUrl + '?page=products'); wait('document.querySelector("#loading").hidden&&document.querySelector("#siteFrame").contentWindow.CMCms?.page()==="products"');
  click('[data-device="mobile"]'); frameWait('win.innerWidth===390&&!!doc.querySelector(".cat-rail-shell")');
  const editorLayout = frameRead('({width:win.innerWidth,overflow:doc.documentElement.scrollWidth>win.innerWidth+1,columns:win.getComputedStyle(doc.querySelector(".shop-main .prod-grid")).gridTemplateColumns.split(" ").length,rail:win.getComputedStyle(doc.querySelector("#catRail")).display,count:doc.querySelectorAll("#catRail [data-cat]").length})');
  check('Visual editor mobile iframe renders the same category rail and two-column grid', editorLayout.width === 390 && !editorLayout.overflow && editorLayout.columns === 2 && editorLayout.rail !== 'none' && editorLayout.count === 12, editorLayout);
  run('screenshot', path.join(output, 'editor-mobile-products.png'));
  const errors = run('errors').errors || [];
  const consoleOutput = run('console');
  const consoleErrors = (consoleOutput.messages || consoleOutput.logs || []).filter(x => ['error', 'assert'].includes(x.level || x.type));
  check('Mobile navigation and commerce smoke produce no uncaught exceptions', errors.length === 0, {errors});
  check('Browser console contains no errors', consoleErrors.length === 0, {consoleErrors});
  await writeFile('audit/mobile-category-navigation-results.json', JSON.stringify({status:'PASS',checks,output,limitations,scope:'Private local fixture; read-only CMS preview; no order or payment submitted, no mail sent'}, null, 2));
  console.log('PASS: ' + checks.length + ' checks. ' + output);
} catch (error) {
  try { run('screenshot', path.join(output, 'failure.png')); } catch {}
  await writeFile('audit/mobile-category-navigation-results.json', JSON.stringify({status:'FAIL',checks,output,limitations,error:error.stack}, null, 2));
  throw error;
} finally { inputSocket?.close(); try { run('close'); } catch {} }
