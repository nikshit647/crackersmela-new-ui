import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';

const fixture=JSON.parse(await readFile('audit-evidence/category-fixture-active.json','utf8'));
const base=fixture.baseUrl, publicBase=fixture.publicUrl;
for(const value of [base,publicBase])assert.ok(['127.0.0.1','localhost'].includes(new URL(value).hostname));
const health=await(await fetch(base+'/__fixture-health')).json();assert.equal(health.isolated,true);assert.equal(health.mail,'disabled');
const binary=path.join(process.env.APPDATA,'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const session='category-editor-13d9fd6e';
const output=path.resolve('audit-evidence/category-editor-'+Date.now());await mkdir(output,{recursive:true});
const checks=[];
const run=(...args)=>{const r=JSON.parse(execFileSync(binary,['--session',session,...args,'--json'],{encoding:'utf8',windowsHide:true,timeout:45000,maxBuffer:8*1024*1024}));assert.ok(r.success,r.error);return r.data;};
const evaluate=code=>run('eval','-b',Buffer.from(code).toString('base64')).result;
const wait=code=>run('wait','--fn',code);
const click=selector=>{if(selector.startsWith('#cartDrawer ')||selector.includes('Close cart')||selector==='#cartViewBtn')wait('(()=>{const p=document.querySelector("#cartDrawer .drawer__panel"),r=p.getBoundingClientRect();return r.right<=innerWidth+1&&p.getAnimations({subtree:true}).every(a=>a.playState!=="running");})()');return run('click',selector);};
const check=(name,condition=true,detail={})=>{checks.push({name,status:condition?'PASS':'FAIL',...detail});assert.ok(condition,name);console.log('PASS: '+name);};
const frameRead=code=>evaluate(`(()=>{const win=document.querySelector('#siteFrame').contentWindow,doc=win.document;return (${code});})()`);
const frameWait=code=>wait(`(()=>{const win=document.querySelector('#siteFrame')?.contentWindow,doc=win?.document;return !!doc&&(${code});})()`);
const frameClick=selector=>{const point=evaluate(`(()=>{const f=document.querySelector('#siteFrame'),e=f.contentDocument.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect(),b=f.getBoundingClientRect(),s=b.width/f.offsetWidth;return {x:b.left+(r.left+r.width/2)*s,y:b.top+(r.top+r.height/2)*s};})()`);run('mouse','move',String(Math.round(point.x)),String(Math.round(point.y)));run('mouse','down');run('mouse','up');};
const saved=()=>wait('document.querySelector("#saveStatus").textContent.includes("Saved")&&document.querySelector("#errorBanner").hidden');
const confirm=()=>{run('wait','#confirmDialog[open]');click('#confirmAction');};
let cookie='',csrf='',baseline;
const api=async(action,body)=>{const r=await fetch(base+'/cms-api.php?a='+action+(body?'':'&page=home'),{method:body?'POST':'GET',headers:{Connection:'close',Cookie:cookie,Origin:base,'Content-Type':'application/json','X-CSRF-Token':csrf},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,d.error);return d;};
const restore=async()=>{if(!baseline)return;const a=await api('load'),b=await api('save',{page:'home',expectedVersion:a.version,document:baseline});await api('publish',{page:'home',expectedVersion:b.version});};
try{
  const sr=await fetch(base+'/staff-auth.php?a=session',{headers:{Connection:'close'}}),sd=await sr.json();cookie=sr.headers.getSetCookie().find(c=>c.startsWith('cm_staff='))?.split(';')[0];
  const lr=await fetch(base+'/staff-auth.php?a=login',{method:'POST',headers:{Connection:'close',Cookie:cookie,Origin:base,'Content-Type':'application/json','X-CSRF-Token':sd.csrfToken},body:JSON.stringify({email:fixture.email,password:fixture.password})});assert.equal(lr.status,200);cookie=lr.headers.getSetCookie().find(c=>c.startsWith('cm_staff='))?.split(';')[0]||cookie;csrf=(await lr.json()).csrfToken;
  await new Promise((resolve,reject)=>{const c=spawn(binary,['--session',session,'open',base+'/#/staff'],{stdio:'ignore',windowsHide:true});c.once('error',reject);c.once('exit',n=>n===0?resolve():reject(Error('Browser launch failed')));});
  run('set','viewport','1600','1000');run('wait','#goAuthStaff');click('#goAuthStaff');run('wait','#auEmail');run('fill','#auEmail',fixture.email);run('fill','#auPass',fixture.password);click('#auSubmit');run('wait','#staffPanel');
  run('open',base+'/visual-editor');wait('document.querySelector("#loading").hidden&&document.querySelector("#siteFrame").contentWindow.CMCms?.page()==="home"');saved();
  baseline=frameRead('win.CMCms.baseline()');const category=baseline.sections.find(s=>s.id==='home:shop-categories');click('[data-nav="sections"]');
  check('Category section remains selectable in the existing editor',!!category&&evaluate('!!document.querySelector("[data-select-section=\\"home:shop-categories\\"]")'));
  const countId=frameRead('doc.querySelector(".home-category-card img[data-image-category=rockets]").closest("a").querySelector(".home-category-card__count").dataset.cmsElement');
  const countSelector='[data-cms-section="'+category.id+'"] [data-cms-element="'+countId+'"]';frameClick(countSelector);run('wait','[data-simple-style="fontSize"]');
  check('Automatic category count explains its source and keeps simple style controls',evaluate('document.querySelector("#inspector").textContent.includes("automatically")&&!document.querySelector("[data-edit-text]")&&!!document.querySelector("[data-simple-style=fontSize]")'));
  run('press','F2');check('Automatic count cannot enter inline text editing',frameRead('!doc.querySelector(".cms-inline-editing")'));
  click('[data-advanced]');
  check('Advanced count inspector omits the editable text field',!evaluate('!!document.querySelector("[data-field=text][data-scope=element]")'));
  click('[data-tab="style"]');check('Advanced count typography controls remain available',evaluate('!!document.querySelector("[data-field=fontSize][data-scope=style]")'));click('[data-basic]');
  const entry=Object.entries(category.elements).find(([,e])=>e.kind==='text'&&e.text==='Shop by Categories');assert.ok(entry);const [headingId,heading]=entry;
  const selector='[data-cms-section="'+category.id+'"] [data-cms-element="'+headingId+'"]';
  frameClick(selector);run('wait','[data-edit-text]');click('[data-advanced]');click('[data-tab="content"]');run('wait','[data-field="text"][data-scope="element"]');
  check('Clicking category heading opens its existing text property',evaluate('document.querySelector("[data-field=text][data-scope=element]").value')===heading.text);
  const edited='Explore every celebration';run('fill','[data-field="text"][data-scope="element"]',edited);frameWait(`doc.querySelector(${JSON.stringify(selector)}).textContent===${JSON.stringify(edited)}`);
  click('#undo');frameWait(`doc.querySelector(${JSON.stringify(selector)}).textContent===${JSON.stringify(heading.text)}`);click('#redo');frameWait(`doc.querySelector(${JSON.stringify(selector)}).textContent===${JSON.stringify(edited)}`);
  check('Category text edits, undo and redo update the canvas');
  click('[data-basic]');run('wait','[data-simple-style="fontSize"]');run('fill','[data-simple-style="fontSize"]','34');click('[data-device="mobile"]');frameWait('win.innerWidth===390');frameClick(selector);run('wait','[data-simple-style="fontSize"]');run('fill','[data-simple-style="fontSize"]','25');frameWait(`win.innerWidth===390&&win.getComputedStyle(doc.querySelector(${JSON.stringify(selector)})).fontSize==='25px'`);
  click('[data-device="desktop"]');frameWait(`win.innerWidth===1280&&win.getComputedStyle(doc.querySelector(${JSON.stringify(selector)})).fontSize==='34px'`);
  check('Category mobile styles remain independent of desktop styles');saved();
  const before=(await api('published')).published;const draft=await api('load');
  check('Category draft persists through the real CMS API',draft.draft.sections.find(s=>s.id===category.id).elements[headingId].text===edited);
  check('Saved draft does not change the public version',!before?.sections?.find(s=>s.id===category.id)?.elements?.[headingId]?.text||before.sections.find(s=>s.id===category.id).elements[headingId].text===heading.text);
  click('#preview');check('Visitor preview keeps the SVG family and all category links',frameRead('win.CM_EDITOR_INTERACTIVE===true&&doc.querySelectorAll(".home-category-card img[src$=\\".svg\\"]").length===11&&doc.querySelectorAll(".home-category-card[href*=products]").length===11'));click('#preview');
  click('#publish');confirm();wait('document.querySelector("#toasts").textContent.includes("Published.")');
  check('Category publication exposes the saved text', (await api('published')).published.sections.find(s=>s.id===category.id).elements[headingId].text===edited);
  run('screenshot',path.join(output,'editor-category.png'));
  run('open',publicBase+'/');wait(`document.querySelector(${JSON.stringify(selector)})?.textContent===${JSON.stringify(edited)}`);
  check('Fresh storefront renders the published category edit and artwork',evaluate('document.querySelectorAll(".home-category-card img[src$=\\".svg\\"]").length')===11);
  await restore();run('open',publicBase+'/');wait(`document.querySelector(${JSON.stringify(selector)})?.textContent===${JSON.stringify(heading.text)}`);baseline=undefined;
  check('Original category content and styles restored in the private fixture');

  // Direct browser clicks avoid the old broad suite's manual-pointer navbar
  // race after a responsive scroll. No customer fields or orders are submitted.
  if(evaluate('[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="Decline")'))run('find','role','button','click','--name','Decline');
  const cart=()=>evaluate('JSON.parse(localStorage.getItem("cm2.cart")||"[]")');
  for(const width of [360,375,390,412,425,768,1024,1280]){
    run('set','viewport',String(width),'900');run('open',publicBase+'/#/products');wait('document.querySelectorAll(".shop-main .prod-card").length>0');
    const id=evaluate('document.querySelector(".shop-main [data-add]:not([disabled])").dataset.add');click('.shop-main [data-add="'+id+'"]');wait('Number(document.querySelector("#cartCount").textContent)===1');
    click('#cartBtn');wait('document.querySelector("#cartDrawer").classList.contains("open")');
    check('Add/cart drawer at '+width+'px',cart().some(x=>String(x.id)===id)&&evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    click('#cartDrawer [data-del="'+id+'"]');wait('document.querySelector("#cartCount").classList.contains("hidden")');click('[aria-label="Close cart"]');wait('!document.querySelector("#cartDrawer").classList.contains("open")');
  }
  run('open',publicBase+'/#/products?sort=price-desc');wait('document.querySelectorAll(".shop-main .prod-card").length>0');
  const p=evaluate('[...document.querySelectorAll(".shop-main .prod-card")].filter(e=>e.querySelector("[data-add]:not([disabled])")).map(e=>({id:e.dataset.id,price:Number(e.querySelector(".price-now").textContent.replace(/[^0-9.]/g,"")),href:e.querySelector("h3 a").getAttribute("href")})).find(p=>p.price>=2500)');assert.ok(p);
  // Hash navigation starts a smooth scroll-to-top and the card reveal animation.
  // Wait for both before asking the browser to target this moving link.
  const productLink='.prod-card[data-id="'+p.id+'"] h3 a';
  wait(`scrollY===0&&document.querySelector(${JSON.stringify(productLink)}).closest('.prod-card').getAnimations().every(a=>a.playState!=='running')`);
  click(productLink);wait(`location.hash===${JSON.stringify(p.href)}`);run('wait','#pdAdd');
  check('Product detail remains functional after category navigation',evaluate('!!document.querySelector("#pdQty")&&!!document.querySelector("#pdPlus")'));
  click('#pdAdd');wait('Number(document.querySelector("#cartCount").textContent)===1');check('Product detail add preserves the selected product',cart().some(item=>String(item.id)===p.id));
  click('#cartBtn');wait('document.querySelector("#cartDrawer").classList.contains("open")');click('#cartViewBtn');run('wait','#goCheckout');check('Full cart permits checkout above the existing minimum',!evaluate('document.querySelector("#goCheckout").disabled'));
  click('#goCheckout');run('wait','#ck_name');check('Checkout customer and delivery form loads',evaluate('!!document.querySelector("#ck_phone")&&!!document.querySelector("#ck_address")'));
  run('screenshot',path.join(output,'checkout-smoke.png'));run('open',publicBase+'/#/cart');run('wait','#clearCart');click('#clearCart');wait('document.querySelector("#cartCount").classList.contains("hidden")');check('Synthetic cart cleared through normal UI',cart().length===0);
  check('Editor and commerce smoke have no uncaught exceptions',(run('errors').errors||[]).length===0);
  await writeFile('audit/category-editor-results.json',JSON.stringify({status:'PASS',checks,output,scope:'Private fixture only; original category document restored; no order or mail sent'},null,2));
}catch(error){try{run('screenshot',path.join(output,'failure.png'));}catch{}await writeFile('audit/category-editor-results.json',JSON.stringify({status:'FAIL',checks,output,error:error.stack},null,2));throw error;}
finally{await restore();try{run('close');}catch{}}
