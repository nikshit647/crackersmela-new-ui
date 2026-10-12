import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';

const fixture=JSON.parse(await readFile('audit-evidence/global-chrome-fixture-20261008.json','utf8'));
assert.equal(fixture.publicUrl,'http://localhost:4318');
assert.equal((await(await fetch(fixture.baseUrl+'/__fixture-health')).json()).isolated,true);
const binary=path.join(process.env.APPDATA,'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const common=['--pin-tab','--namespace','cm-global-chrome','--session','cm-global-chrome-20261008'];
const output=path.resolve('audit/global-chrome-browser-20261008');await mkdir(output,{recursive:true});
const run=(...args)=>{const r=JSON.parse(execFileSync(binary,[...common,...args,'--json'],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,timeout:45000}));assert.ok(r.success,r.error);return r.data;};
const evaluate=code=>run('eval','-b',Buffer.from(code).toString('base64')).result;
const wait=code=>run('wait','--fn',code);
const frameRead=code=>evaluate(`(()=>{const win=document.querySelector('#siteFrame').contentWindow,doc=win.document;return (${code});})()`);
const frameWait=code=>wait(`(()=>{const win=document.querySelector('#siteFrame')?.contentWindow,doc=win?.document;return !!doc&&(${code});})()`);
const check=(name,condition,detail)=>{checks.push({name,pass:!!condition,...(detail?{detail}:{})});assert.ok(condition,name+': '+JSON.stringify(detail));};
const checks=[];
const saved=()=>wait("document.querySelector('#saveStatus').textContent.startsWith('✓ Saved')&&document.querySelector('#errorBanner').hidden");
const screenshot=name=>run('screenshot',path.join(output,name+'.png'));
const frameClick=selector=>{
 frameWait(`!!doc.querySelector(${JSON.stringify(selector)})`);
 const p=evaluate(`(()=>{const f=document.querySelector('#siteFrame'),n=f.contentDocument.querySelector(${JSON.stringify(selector)});n.scrollIntoView({block:'center',behavior:'instant'});const r=n.getBoundingClientRect(),b=f.getBoundingClientRect(),s=b.width/f.offsetWidth;return {x:b.left+(r.left+r.width/2)*s,y:b.top+(r.top+r.height/2)*s};})()`);
 run('mouse','move',String(Math.round(p.x)),String(Math.round(p.y)));run('mouse','down');run('mouse','up');
};
const ready=()=>frameWait("doc.body.classList.contains('cms-editing')&&!!win.CMCms?.document()?.sections?.length");
async function login(){
 const response=await fetch(fixture.baseUrl+'/staff-auth.php?a=session'),body=await response.json();
 const cookie=response.headers.getSetCookie().find(v=>v.startsWith('cm_staff='))?.split(';')[0];assert.ok(cookie);
 const result=await fetch(fixture.baseUrl+'/staff-auth.php?a=login',{method:'POST',headers:{Cookie:cookie,Origin:fixture.baseUrl,'Content-Type':'application/json','X-CSRF-Token':body.csrfToken},body:JSON.stringify({email:fixture.email,password:fixture.password})});
 assert.equal(result.ok,true);const auth=result.headers.getSetCookie().find(v=>v.startsWith('cm_staff='))?.split(';')[0]||cookie;
 run('cookies','set','cm_staff',auth.slice(9),'--url',fixture.baseUrl,'--httpOnly','--sameSite','Lax');
 return auth;
}
await new Promise((resolve,reject)=>{const child=spawn(binary,[...common,'open',fixture.baseUrl],{stdio:'ignore',windowsHide:true});child.once('exit',c=>c?reject(new Error('Browser launch '+c)):resolve());child.once('error',reject);});
run('set','media','light','reduced-motion');run('set','viewport','1600','1100');
const auth=await login();
const routes=[['home','/'],['home-hash','/#/'],['products','/products'],['products-hash','/#/products'],['category','/category/sparklers'],['category-hash','/#/products?cat=sparklers'],['about','/about'],['about-hash','/#/about'],['contact','/contact'],['contact-hash','/#/contact'],['cart','/#/cart'],['checkout','/#/checkout'],['privacy','/privacy']];
const pageReady=()=>wait("!!document.querySelector('#view')&&document.querySelector('#view').textContent.trim().length>10&&document.querySelectorAll('#navCatMenu [data-cat-id]').length===11&&document.querySelector('#cm-published-styles')?.textContent.length>0");
const mainSignature=()=>evaluate("(()=>{const v=document.querySelector('#view');return {headings:[...v.querySelectorAll('h1,h2,h3')].map(n=>n.textContent.trim()),products:[...v.querySelectorAll('[data-add]')].map(n=>n.dataset.add),categories:[...v.querySelectorAll('.home-category-card')].map(n=>({id:n.dataset.categoryId,text:n.textContent.replace(/\\s+/g,' ').trim()})),controls:[...v.querySelectorAll('input,select,button')].map(n=>({id:n.id,type:n.type,name:n.getAttribute('aria-label')||n.name}))};})()");
const chrome=()=>evaluate("(()=>{const css=s=>{const n=document.querySelector(s);if(!n)return null;const c=getComputedStyle(n);return {font:c.fontFamily,color:c.color,maxWidth:c.maxWidth};};return {counts:['#promoBar','#navbar','footer'].map(s=>document.querySelectorAll(s).length),promo:document.querySelector('#promoBar')?.textContent,home:document.querySelector('#navbar .nav-link[data-nav=\"/\"]')?.textContent.trim(),footer:document.querySelector('footer .footer-bottom>span')?.textContent,styles:{promo:css('#promoBar'),nav:css('#navbar'),navInner:css('#navbar .nav-inner'),home:css('#navbar .nav-link'),footer:css('footer'),footerInner:css('footer .container')},overflow:document.documentElement.scrollWidth>innerWidth};})()");
const baseline={},beforeStyles={};
const dataRoot=path.join(fixture.fixture,'data');
const protectedFiles=['products.json','catalog.json','coupons.json','cms-pages/home.json'];
const protectedBefore=Object.fromEntries(await Promise.all(protectedFiles.map(async name=>[name,await readFile(path.join(dataRoot,name),'utf8')])));
const stamp=Date.now().toString().slice(-5);
const globalText={promo:'Shared announcements from Products QA '+stamp,home:'Shop Home '+stamp,footer:'Shared footer from Products QA '+stamp};
const inlineText=(selector,text)=>{frameClick(selector);run('wait','[data-edit-text]');run('click','[data-edit-text]');frameWait(`doc.querySelector(${JSON.stringify(selector)})?.isContentEditable`);run('keyboard','inserttext',text);run('press','Tab');frameWait(`doc.querySelector(${JSON.stringify(selector)})?.textContent===${JSON.stringify(text)}`);};
// Global chrome styles are captured per route: the active nav link is a route state,
// so a single Home baseline would misreport every other route as changed.
let published=false;
const globalsReady=()=>wait(`document.querySelector('#promoBar')?.textContent.includes(${JSON.stringify(globalText.promo)})&&document.querySelector('#navbar .nav-link[data-nav="/"]')?.textContent.trim()===${JSON.stringify(globalText.home)}&&document.querySelector('footer .footer-bottom>span')?.textContent===${JSON.stringify(globalText.footer)}`);
// The storefront re-renders its own chrome while the CMS is applying the shared
// globals, so one applied instant is not enough: the state must still hold after
// that render. Requiring stability makes the assertion deterministic.
const globalsStable=async()=>{await globalsReady();await new Promise(resolve=>setTimeout(resolve,450));await globalsReady();};
const publicOpen=route=>{run('open',fixture.publicUrl+route);pageReady();if(published)globalsStable();};
const publicCheck=(name,width)=>{
 const c=chrome();check(name+' has exactly one promo/header/footer at '+width,c.counts.every(n=>n===1),c.counts);
 check(name+' displays all three saved global edits at '+width,c.promo.includes(globalText.promo)&&c.home===globalText.home&&c.footer===globalText.footer,c);
 check(name+' preserves its own page content and controls at '+width,JSON.stringify(mainSignature())===JSON.stringify(baseline[name]),{actual:mainSignature(),expected:baseline[name]});
 check(name+' has no horizontal overflow at '+width,!c.overflow);
 check(name+' keeps global typography/color/container outside Products design at '+width,JSON.stringify(c.styles)===JSON.stringify(beforeStyles[width][name]),{actual:c.styles,expected:beforeStyles[width][name]});
};
try{
 run('console','--clear');run('errors','--clear');await publicOpen('/products');evaluate("localStorage.setItem('cm2.cart',JSON.stringify([{id:27,qty:2}]));localStorage.removeItem('cm2.couponCodes');localStorage.removeItem('cm2.excludedAutomaticCodes')");
 for(const [name,route] of routes){await publicOpen(route);baseline[name]=mainSignature();}
 for(const [width,height] of [[1440,1000],[390,844]]){run('set','viewport',String(width),String(height));beforeStyles[width]={};for(const [name,route] of routes){await publicOpen(route);beforeStyles[width][name]=chrome().styles;}}
 run('set','viewport','1600','1100');run('open',fixture.editorUrl+'?page=products');ready();saved();
 run('click','[data-nav="pages"]');run('click','[data-page="products"]');ready();frameWait("win.CMCms.document().id==='products'");saved();
 const mainBefore=frameRead("JSON.stringify(win.CMCms.document().sections.filter(s=>!s.source?.startsWith('global:')))");
 run('click','[data-nav="sections"]');run('click','[data-select-section="global:promo"]');
 run('fill','[data-scope="promo:0"][data-field="text"]',globalText.promo);
 frameWait(`doc.querySelector('#promoBar').textContent.includes(${JSON.stringify(globalText.promo)})`);
 inlineText('#navbar .nav-link[data-nav="/"]',globalText.home);
 inlineText('footer .footer-bottom>span',globalText.footer);
 check('Products global edits preserve every page section',frameRead("JSON.stringify(win.CMCms.document().sections.filter(s=>!s.source?.startsWith('global:')))")===mainBefore);
 run('click','[data-page-settings]');
 const designMenu=evaluate("[...document.querySelectorAll('#inspector .context-popover')].findIndex(n=>n.querySelector('summary').textContent.startsWith('Page colors'))");
 assert.ok(designMenu>=0);run('click',`#inspector .context-popover:nth-of-type(${designMenu+1})>summary`);
 for(const [field,value] of [['primary','#9d174d'],['text','#123456'],['background','#eef2ff'],['containerWidth','900px']])run('fill',`[data-scope="design"][data-field="${field}"]`,value);
 run('select','[data-scope="design"][data-field="fontFamily"]','Georgia');
 run('click','#save');saved();
 run('reload');ready();saved();
 frameWait("win.CMCms.document().id==='products'");
 check('Saved Products draft persists all three global edits after editor refresh',frameRead(`doc.querySelector('#promoBar').textContent.includes(${JSON.stringify(globalText.promo)})&&doc.querySelector('#navbar .nav-link[data-nav="/"]').textContent.trim()===${JSON.stringify(globalText.home)}&&doc.querySelector('footer .footer-bottom>span').textContent===${JSON.stringify(globalText.footer)}`));
 check('Products main sections remain unchanged after saving and refresh',frameRead("JSON.stringify(win.CMCms.document().sections.filter(s=>!s.source?.startsWith('global:')))")===mainBefore);
 screenshot('products-editor-shared-draft');
 run('click','#publish');run('wait','#confirmDialog[open]');run('click','#confirmAction');
 wait("document.querySelector('#toasts').textContent.includes('Published. The website now uses this version. Global components apply to all pages.')");saved();published=true;
 for(const [width,height] of [[1440,1000],[390,844]]){
  run('set','viewport',String(width),String(height));
  for(const [name,route] of routes){await publicOpen(route);publicCheck(name,width);run('reload');pageReady();await globalsStable();const c=chrome();check(name+' keeps saved globals after public refresh at '+width,c.counts.every(n=>n===1)&&c.promo.includes(globalText.promo)&&c.home===globalText.home&&c.footer===globalText.footer);if(['home','products','about','contact','cart','checkout'].includes(name))screenshot(name+'-'+width);}
 }
 for(const name of protectedFiles)check('Global publishing leaves '+name+' byte-for-byte unchanged',await readFile(path.join(dataRoot,name),'utf8')===protectedBefore[name]);
 await publicOpen('/products');check('Products design is applied to its page content',evaluate("getComputedStyle(document.querySelector('#view')).fontFamily.includes('Georgia')&&getComputedStyle(document.querySelector('#view')).color==='rgb(18, 52, 86)'"));
 check('Anonymous public chrome contains no staff account state',evaluate("!document.querySelector('#footerStaffSlot')?.textContent.trim()&&!document.querySelector('#navbar').textContent.includes('cms-qa')&&!document.querySelector('#navbar').textContent.includes('Staff Hub')"));
 for(const endpoint of ['cms-api.php?a=load&page=home','cms-api.php?a=history&page=home','orders-api.php?a=list','staff-auth.php?a=directory']){
  const response=await fetch(fixture.publicUrl+'/'+endpoint);
  // orders-api.php refuses every non-pull action with its method gate (Allow: POST)
  // before order data is read, so an anonymous GET is 405 rather than 401/403.
  // Only a 2xx would mean the private data was served.
  const refused=[401,403,404,405].includes(response.status);
  check('Anonymous private endpoint remains protected: '+endpoint,refused&&(response.status!==405||response.headers.get('allow')==='POST'),{status:response.status,allow:response.headers.get('allow')});
 }
 run('click','#cartBtn');wait("document.querySelector('#cartDrawer').classList.contains('open')");
 wait("document.querySelector('#cartDrawer [data-coupon-total]')?.textContent.replace(/[^0-9]/g,'')==='2500'");
 run('fill','#cartDrawer [data-coupon-input]','GLOBALQA10');run('click','#cartDrawer [data-coupon-form] button');
 wait("!!document.querySelector('#cartDrawer [data-coupon-applied=GLOBALQA10]')");
 check('Cart quantity and server coupon total survive global rendering',evaluate("document.querySelector('#cartDrawerCount').textContent==='2'&&document.querySelector('#cartDrawer [data-coupon-total]').textContent.replace(/[^0-9]/g,'')==='2250'&&!document.querySelector('#cartCheckoutBtn').disabled"));
 run('click','#cartViewBtn');wait("!!document.querySelector('#goCheckout')");run('click','#goCheckout');wait("!!document.querySelector('#ck_name')");
 // The checkout summary is rendered before its coupon quote returns, so wait for
 // the server total instead of reading the first frame.
 wait("document.querySelector('.cart-order-panel [data-coupon-total]')?.textContent.replace(/[^0-9]/g,'')==='2250'");
 check('Checkout retains shared coupon total and editable form',evaluate("!!document.querySelector('#ck_name')&&document.querySelector('.cart-order-panel [data-coupon-total]').textContent.replace(/[^0-9]/g,'')==='2250'"));
 const errors=run('errors');check('No JavaScript errors across editor and public routes',(errors.errors||[]).length===0,errors);
 const consoleErrors=(run('console').messages||[]).filter(row=>row.type==='error'||row.level==='error');check('No console errors across editor and public routes',consoleErrors.length===0,consoleErrors);
 await writeFile(path.join(output,'results.json'),JSON.stringify({status:'PASS',checks,errors,consoleErrors,globalText,orderSubmitted:false,liveWrites:false},null,2));
 console.log(JSON.stringify({status:'PASS',checks:checks.length,orderSubmitted:false,liveWrites:false}));
}catch(error){try{screenshot('failure');}catch{}await writeFile(path.join(output,'results.json'),JSON.stringify({status:'FAIL',checks,error:error.message},null,2));throw error;}
