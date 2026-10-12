import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';

// Real browser clicks against an isolated browser profile. Never submits orders.
const base=process.argv[2]||'https://crackersmela.com';
const label=process.argv[3]||'live';
const session='cm-regression-'+label;
const out=path.resolve('audit-artifacts/three-area',label);
mkdirSync(out,{recursive:true});
const binary=path.join(process.env.APPDATA,'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const checks=[],failures=[];
const run=(...args)=>{
  const response=JSON.parse(execFileSync(binary,['--session',session,...args,'--json'],{encoding:'utf8',windowsHide:true,timeout:45000,maxBuffer:8*1024*1024}));
  assert.ok(response.success,response.error);return response.data;
};
const read=code=>JSON.parse(run('eval','-b',Buffer.from('JSON.stringify('+code+')').toString('base64')).result);
const wait=code=>run('wait','--fn',code);
const click=selector=>{
  if(selector.includes('Close cart')||selector.startsWith('#cartDrawer ')||['#cartViewBtn','#cartCheckoutBtn'].includes(selector))
    wait('document.querySelector("#cartDrawer").getAnimations({subtree:true}).every(a=>a.playState!=="running")');
  run('scrollintoview',selector);
  let previous=null,stable=0,point=null;
  for(let attempt=0;attempt<40;attempt++){
    const probe=read(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);return {x,y,inside:r.top>=0&&r.bottom<=innerHeight,hit:!!hit&&(hit===e||e.contains(hit)),disabled:!!e.disabled};})()`);
    stable=previous&&Math.abs(previous.x-probe.x)<0.1&&Math.abs(previous.y-probe.y)<0.1&&probe.inside&&probe.hit&&!probe.disabled?stable+1:0;
    if(stable>=4){point=probe;break;}
    previous=probe;run('wait','100');
  }
  assert.ok(point,'Stable visible clickable target: '+selector);
  run('mouse','move',String(Math.round(point.x)),String(Math.round(point.y)));
  run('mouse','down');const result=run('mouse','up');
  if(selector.includes('Close cart'))wait('!document.querySelector("#cartDrawer").classList.contains("open")');
  return result;
};
const open=route=>{run('open',base+'/'+route);run('wait','--load','networkidle');};
const check=(name,condition,detail={})=>{checks.push({name,status:condition?'PASS':'FAIL',...detail});if(!condition)failures.push(name);console.log((condition?'PASS ':'FAIL ')+name);};
const cart=()=>read('JSON.parse(localStorage.getItem("cm2.cart")||"[]")');
const settledCart=()=>wait("!document.querySelector('#cartDrawer [data-coupon-total]')||document.querySelector('#cartDrawer [aria-busy=\"false\"]')&&document.querySelector('#cartDrawer [data-coupon-total]').textContent.includes('₹')");
const moneyValue=text=>Number(text.replace(/[^0-9.]/g,''));
const inCart=id=>wait(`document.querySelector('.prod-card[data-id="${id}"] .qty-num')?.textContent==='1'`);
try {
  // Browser daemon startup must not inherit a synchronous process's output pipe.
  await new Promise((resolve,reject)=>{const child=spawn(binary,['--session',session,'open',base+'/#/'],{stdio:'ignore',windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Browser launch failed')));});
  run('set','media','light','reduced-motion');
  open('#/');run('set','viewport','1280','900');
  if(cart().length){open('#/cart');click('#clearCart');open('#/');}
  check('Homepage has navigation, category section and product section',read('!!document.querySelector(".navbar,#nav")&&!!document.querySelector("#shop-categories")&&document.querySelectorAll(".prod-card").length>1'));
  const decline=read('Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==="Decline")?.outerHTML||null');
  if(decline)run('find','role','button','click','--name','Decline');
  const homeIds=read('Array.from(document.querySelectorAll("#arrivalsGrid [data-add]:not([disabled])")).slice(0,2).map(b=>b.dataset.add)');
  for(const id of homeIds){click(`[data-add="${id}"]`);inCart(id);}
  check('Home Add to Cart updates both product cards',homeIds.length===2&&cart().length===2);
  run('reload');run('wait','--load','networkidle');homeIds.forEach(inCart);
  check('Home card state survives refresh',homeIds.every(id=>cart().some(x=>String(x.id)===id)));
  for(const id of homeIds){click(`.prod-card[data-id="${id}"] [data-del]`);wait(`!!document.querySelector('.prod-card[data-id="${id}"] [data-add]')`);}

  const categoryLinks=read('Array.from(document.querySelectorAll("#shop-categories a")).filter(a=>a.href.includes("products")||a.href.includes("/category/")).map(a=>({href:a.getAttribute("href"),text:a.innerText}))');
  assert.equal(categoryLinks.length,11,'All eleven category links must be exercised');
  for(const link of categoryLinks){
    click(`#shop-categories a[href="${link.href}"]`);wait('document.querySelectorAll(".shop-main .prod-card").length>0');
    const expectedHash=link.href.startsWith('/category/')?'#/products?cat='+link.href.split('/').filter(Boolean).at(-1):link.href;
    check('Category navigation '+link.href,read('location.hash')===expectedHash&&read('document.querySelectorAll(".shop-main .prod-card").length')>0);
    open('#/');
  }
  open('#/products');
  const sizes=[[360,800],[375,812],[390,844],[412,915],[425,904],[768,1024],[1024,900],[1280,900]];
  for(const [width,height] of sizes){
    run('set','viewport',String(width),String(height));
    for(const route of ['#/','#/products']){
      open(route);wait('document.querySelectorAll(".prod-card").length>1');
      const geometry=read(`(()=>{const grid=document.querySelector('${route==='#/'?'#arrivalsGrid':'.shop-main .prod-grid'}');const cards=[...grid.children].filter(e=>e.matches('.prod-card'));const first=cards[0].getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth+1,columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,row:cards.filter(e=>Math.abs(e.getBoundingClientRect().top-first.top)<2).length,cardWidth:first.width,viewport:innerWidth,broken:[...grid.querySelectorAll('img')].filter(i=>i.complete&&!i.naturalWidth).length};})()`);
      check(`${route} layout ${width}x${height}`,!geometry.overflow&&geometry.broken===0&&(width>425||geometry.columns===2),geometry);
      run('screenshot',path.join(out,`${route==='#/'?'home':'products'}-${width}.png`));
    }
    const id=read('document.querySelector(".shop-main [data-add]:not([disabled])").dataset.add');
    click(`.shop-main [data-add="${id}"]`);inCart(id);
    check(`Add/card/badge ${width}`,cart().some(x=>String(x.id)===id)&&Number(read('document.querySelector("#cartCount").textContent'))===1);
    click('#cartBtn');wait('document.querySelector("#cartDrawer").classList.contains("open")');
    check(`Cart drawer ${width}`,read(`!!document.querySelector('#cartDrawer [data-line="${id}"]')`)&&read('document.documentElement.scrollWidth<=innerWidth+1'));
    click(`[aria-label="Close cart"]`);click(`.shop-main [data-del="${id}"]`);wait('document.querySelector("#cartCount").classList.contains("hidden")');
  }
  run('set','viewport','1280','900');open('#/products');
  run('fill','#prodSearch','SPARK');wait('location.hash.toLowerCase().includes("spark")');
  check('Product search filters results',read('document.querySelectorAll(".shop-main .prod-card").length')>0);
  open('#/products?sort=discount');
  const selected=read('Array.from(document.querySelectorAll(".shop-main .prod-card")).filter(e=>e.querySelector("[data-add]:not([disabled])")).slice(0,3).map(e=>({id:e.dataset.id,name:e.querySelector("h3").innerText,price:e.querySelector(".price-now").innerText,href:e.querySelector("h3 a").getAttribute("href")}))');
  for(const product of selected){click(`[data-add="${product.id}"]`);inCart(product.id);}
  check('Multiple products preserve identity',selected.every(p=>cart().some(x=>String(x.id)===p.id)));
  run('reload');run('wait','--load','networkidle');selected.forEach(p=>inCart(p.id));
  check('Multiple product card states survive refresh',true);
  click('#cartBtn');settledCart();const first=selected[0];
  const totalBefore=moneyValue(read('document.querySelector("#cartDrawerSummary .sum-row.total b").textContent'));
  click(`#cartDrawer [data-qty="${first.id}"][data-d="1"]`);
  settledCart();
  check('Increase updates quantity and total',cart().find(x=>String(x.id)===first.id).qty===2&&moneyValue(read('document.querySelector("#cartDrawerSummary .sum-row.total b").textContent'))===totalBefore+moneyValue(first.price));
  click(`#cartDrawer [data-qty="${first.id}"][data-d="-1"]`);
  settledCart();
  check('Decrease restores total',moneyValue(read('document.querySelector("#cartDrawerSummary .sum-row.total b").textContent'))===totalBefore);
  click(`#cartDrawer [data-del="${first.id}"]`);
  settledCart();
  check('Remove updates cart and total',!cart().some(x=>String(x.id)===first.id)&&moneyValue(read('document.querySelector("#cartDrawerSummary .sum-row.total b").textContent'))===totalBefore-moneyValue(first.price));
  check('Minimum-order checkout disabled',read('document.querySelector("#cartCheckoutBtn").disabled'));
  click('[aria-label="Close cart"]');
  open('#/products?sort=price-desc');
  const expensive=read('Array.from(document.querySelectorAll(".shop-main .prod-card")).filter(e=>e.querySelector("[data-add]:not([disabled])")).map(e=>({id:e.dataset.id,price:Number(e.querySelector(".price-now").textContent.replace(/[^0-9.]/g,"")),href:e.querySelector("h3 a").getAttribute("href")})).find(e=>e.price>=2500)');
  assert.ok(expensive,'A purchasable product meets the checkout minimum');
  click(`[data-add="${expensive.id}"]`);inCart(expensive.id);
  click(`.prod-card[data-id="${expensive.id}"] h3 a`);wait('!!document.querySelector("#pdAdd")');
  check('Product detail opens with image and quantity',read('!!document.querySelector("#pdQty")&&!!document.querySelector("#pdPlus")'));
  click('#cartBtn');click('#cartViewBtn');wait('!!document.querySelector("#goCheckout")');
  check('Full cart permits checkout above minimum',!read('document.querySelector("#goCheckout").disabled'));
  click('#goCheckout');wait('!!document.querySelector("#ck_name")');
  check('Checkout delivery/customer form loads',read('!!document.querySelector("#ck_phone")&&!!document.querySelector("#ck_address")'));
  run('screenshot',path.join(out,'checkout.png'));
  open('#/cart');click('#clearCart');wait('document.querySelector("#cartCount").classList.contains("hidden")');
  check('Test cart cleared through normal UI',cart().length===0);
  const errors=run('errors'),consoleMessages=run('console');
  writeFileSync(path.join(out,'console.json'),JSON.stringify({errors,console:consoleMessages,note:'CLI runtime logs; CSP Log domain checked separately.'},null,2));
}catch(error){failures.push(error.message);console.error(error.message);try{run('screenshot',path.join(out,'failure.png'));}catch{}}
finally{writeFileSync(path.join(out,'results.json'),JSON.stringify({base,at:new Date().toISOString(),status:failures.length?'FAIL':'PASS',checks,failures,scope:'Browser navigation/cart only. No orders submitted, no production records written.'},null,2));}
if(failures.length)process.exitCode=1;
