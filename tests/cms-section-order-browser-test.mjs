import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';

// Real PHP storage + the real editor/public renderer, isolated from production.
// Catches broken Admin navigation and ordering that is lost, leaks across pages,
// mutates responsive/catalog data, or fails to reach the published storefront.
const fixture=JSON.parse(await readFile(process.env.CM_CMS_FIXTURE||'audit-evidence/seo-editor-fixture-20261007.json','utf8'));
const base=fixture.baseUrl, publicBase=fixture.publicUrl;
for(const url of [base,publicBase])assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname));
const health=await(await fetch(base+'/__fixture-health')).json();
assert.equal(health.isolated,true);assert.equal(health.mail,'disabled');
const binary=path.join(process.env.APPDATA,'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const session=process.env.CM_CMS_BROWSER_SESSION||'cms-sections-20261007';
const output=path.resolve('audit-artifacts/seo-editor-20261007/editor-browser-'+Date.now());
await mkdir(output,{recursive:true});
const checks=[];
const run=(...args)=>{const value=JSON.parse(execFileSync(binary,['--session',session,...args,'--json'],{encoding:'utf8',windowsHide:true,timeout:45000,maxBuffer:8*1024*1024}));assert.equal(value.success,true,value.error);return value.data;};
const evaluate=code=>run('eval','-b',Buffer.from(code).toString('base64')).result;
const wait=code=>run('wait','--fn',code);
const frameRead=code=>evaluate(`(()=>{const win=document.querySelector('#siteFrame').contentWindow,doc=win.document;return (${code});})()`);
const frameWait=code=>wait(`(()=>{const win=document.querySelector('#siteFrame')?.contentWindow,doc=win?.document;return !!doc&&(${code});})()`);
const click=selector=>run('click',selector);
const check=(name,value=true)=>{assert.ok(value,name);checks.push({name,status:'PASS'});console.log('PASS: '+name);};
const equal=(a,b,name)=>{assert.deepEqual(a,b,name);check(name);};
const saved=()=>wait("document.querySelector('#saveStatus').textContent.startsWith('✓ Saved')&&document.querySelector('#errorBanner').hidden");
const ready=page=>{frameWait(`win.CMCms?.page()===${JSON.stringify(page)}&&doc.body.classList.contains('cms-editing')`);wait("document.querySelector('#loading').hidden");saved();};
const openEditor=page=>{run('open',base+'/visual-editor?page='+page);ready(page);};
const documentData=()=>frameRead('win.CMCms.document()');
const mainOrder=value=>value.sections.filter(s=>(s.region||'main')==='main').map(s=>s.id);
const normalized=value=>({...value,sections:[...value.sections].sort((a,b)=>a.id.localeCompare(b.id))});
const domOrder=()=>frameRead("Array.from(doc.querySelector('#view').children).map(n=>n.dataset.cmsSection)");
const select=id=>{click('[data-nav="sections"]');click('[data-select-section='+JSON.stringify(id)+']');};
const move=(id,action)=>{select(id);click('#inspector [data-section-action='+JSON.stringify(action)+']');};
const publish=()=>{click('#publish');run('wait','#confirmDialog[open]');click('#confirmAction');wait("document.querySelector('#toasts').textContent.includes('Published. The website now uses this version.')");saved();};
let cookie='',csrf='';
async function login(){
  const response=await fetch(base+'/staff-auth.php?a=session'),data=await response.json();
  cookie=response.headers.getSetCookie().find(v=>v.startsWith('cm_staff='))?.split(';')[0];
  const auth=await fetch(base+'/staff-auth.php?a=login',{method:'POST',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json','X-CSRF-Token':data.csrfToken},body:JSON.stringify({email:fixture.email,password:fixture.password})});
  assert.equal(auth.status,200);const loggedIn=await auth.json();csrf=loggedIn.csrfToken;
  cookie=auth.headers.getSetCookie().find(v=>v.startsWith('cm_staff='))?.split(';')[0]||cookie;
  run('cookies','set','cm_staff',cookie.slice(9),'--url',base,'--httpOnly','--sameSite','Lax');
}
async function api(action,page,body){
  const response=await fetch(base+'/cms-api.php?a='+action+'&page='+page,{method:body?'POST':'GET',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json','X-CSRF-Token':csrf},...(body?{body:JSON.stringify({page,...body})}:{})});
  const value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value;
}
const records=async()=>Object.fromEntries(await Promise.all(['products','catalog'].map(async name=>[name,await(await fetch(base+'/'+name+'-api.php?a=pull')).json()])));
let report;
try{
  await new Promise((resolve,reject)=>{const child=spawn(binary,['--session',session,'open',base],{stdio:'ignore',windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Browser launch failed')));});
  run('set','viewport','1600','1000');await login();openEditor('home');
  // This assertion was run before the header fix: the editor had no visible link.
  check('Header exposes the requested Back to Admin link',evaluate("Array.from(document.querySelectorAll('header a')).some(a=>a.textContent.trim()==='← Back to Admin'&&new URL(a.href).pathname==='/'&&new URL(a.href).hash==='')"));
  for(const width of [1600,1024,768,390,360]){
    run('set','viewport',String(width),'1000');
    check('Header navigation and editing controls remain visible at '+width+'px',evaluate(`(()=>{const targets=[document.querySelector('#backToAdmin'),...document.querySelectorAll('#save,#publish,#undo,#redo,#preview,[data-device]')];return targets.every(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=0&&r.right<=innerWidth+1;})&&document.documentElement.scrollWidth<=innerWidth+1;})()`));
    if(width===1600||width===390)run('screenshot',path.join(output,'editor-'+width+'.png'));
  }
  run('set','viewport','1600','1000');click('#backToAdmin');wait("location.pathname==='/'");
  check('Back to Admin opens the same-origin admin root',evaluate("location.pathname==='/'&&location.search===''"));
  if(process.env.CM_EDITOR_NAV_ONLY==='1'){report={status:'PASS',checks,output};}
  else {
    const beforeRecords=await records(),publicBefore={home:(await api('published','home')).published,products:(await api('published','products')).published};openEditor('products');
    const productsBefore=documentData(),productsOrder=mainOrder(productsBefore);assert.ok(productsOrder.length>1);
    const productExpected=[productsOrder[1],productsOrder[0],...productsOrder.slice(2)];
    move(productsOrder[1],'up');equal(domOrder(),productExpected,'Products section Move up changes the actual canvas');
    equal(normalized(documentData()),normalized(productsBefore),'Products move retains all section contents and responsive settings');saved();
    openEditor('home');const homeOrder=mainOrder(documentData());assert.ok(homeOrder.length>2);
    // Seed deliberately distinct presentation and display-order values through
    // the real authenticated API, then verify moves preserve every one of them.
    const homeState=await api('load','home'),seed=structuredClone(homeState.draft);
    const first=seed.sections.find(s=>s.id===homeOrder[0]);
    first.overrides={desktop:{styles:{paddingTop:'43px'}},tablet:{styles:{paddingTop:'29px'}},mobile:{styles:{paddingTop:'17px'}}};
    const category=seed.sections.find(s=>s.source==='home:shop-categories');
    const categoryIds=frameRead("Array.from(doc.querySelectorAll('.home-category-card')).map(n=>n.dataset.categoryId)");
    assert.ok(category&&categoryIds.length>2);category.content.categoryOrder=[categoryIds[1],categoryIds[0],...categoryIds.slice(2)];
    const grid=frameRead("(()=>{const n=doc.querySelector('#view .prod-grid');return {section:n.closest('[data-cms-section]').dataset.cmsSection,ids:Array.from(n.querySelectorAll(':scope>.prod-card')).map(c=>Number(c.dataset.id))};})()");
    assert.ok(grid.ids.length>2);seed.productOrders={['section:'+grid.section]:[grid.ids[1],grid.ids[0],...grid.ids.slice(2)]};
    await api('save','home',{expectedVersion:homeState.version,document:seed});openEditor('home');
    const seeded=documentData(),homeExpected=[homeOrder[1],homeOrder[0],...homeOrder.slice(2)];
    frameRead("win.__sectionNodes=Array.from(doc.querySelector('#view').children)");
    move(homeOrder[1],'up');equal(domOrder(),homeExpected,'Home section Move up changes the actual canvas');
    equal(normalized(documentData()),normalized(seeded),'Home move preserves exact device overrides, category order and product order');
    check('Section moves retain original DOM nodes and their event handlers',frameRead("Array.from(doc.querySelector('#view').children).every(n=>win.__sectionNodes.includes(n))"));
    click('#undo');equal(domOrder(),homeOrder,'Undo restores the prior section sequence');click('#redo');equal(domOrder(),homeExpected,'Redo restores the edited section sequence');saved();
    equal(mainOrder((await api('load','products')).draft),productExpected,'Home changes leave the Products draft independent');
    equal({home:(await api('published','home')).published,products:(await api('published','products')).published},publicBefore,'Unpublished section changes leave the public documents unchanged');
    run('reload');ready('home');equal(domOrder(),homeExpected,'Section order persists after refresh');
    const logout=await fetch(base+'/staff-auth.php?a=logout',{method:'POST',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json','X-CSRF-Token':csrf},body:'{}'});assert.equal(logout.status,200);
    await login();openEditor('home');equal(domOrder(),homeExpected,'Section order persists after logout and a new login');
    for(const [device,padding]of [['desktop','43px'],['tablet','29px'],['mobile','17px']]){
      click('[data-device='+JSON.stringify(device)+']');
      frameWait(`getComputedStyle(doc.querySelector('[data-cms-section="${homeOrder[0]}"]')).paddingTop===${JSON.stringify(padding)}`);
      equal(domOrder(),homeExpected,'Section order and independent '+device+' presentation remain intact');
    }
    click('#preview');frameWait('win.CM_EDITOR_INTERACTIVE===true');equal(domOrder(),homeExpected,'Visitor Preview shows the same draft section order');click('#preview');publish();
    openEditor('products');equal(domOrder(),productExpected,'Products order also survives the new session');publish();
    equal(mainOrder((await api('published','home')).published),homeExpected,'Public API stores the published Home section order');
    equal(mainOrder((await api('published','products')).published),productExpected,'Public API stores the published Products section order');
    for(const [route,expected]of [['/#/',homeExpected],['/#/products',productExpected]]){
      run('open',publicBase+route);wait("window.CMCms?.document()?.sections?.length>0&&document.querySelector('#view [data-cms-section]')");
      wait(`JSON.stringify(Array.from(document.querySelector('#view').children).map(n=>n.dataset.cmsSection))===${JSON.stringify(JSON.stringify(expected))}`);
      equal(evaluate("Array.from(document.querySelector('#view').children).map(n=>n.dataset.cmsSection)"),expected,'Published storefront preserves independent order for '+route);
    }
    run('open',publicBase+'/#/');wait("window.CMCms?.document()?.id==='home'&&window.CMCms.document().productOrders");
    equal(evaluate("Array.from(document.querySelectorAll('.home-category-card')).map(n=>n.dataset.categoryId)"),category.content.categoryOrder,'Publishing sections preserves the saved category display order');
    equal(evaluate(`Array.from(document.querySelector('[data-cms-section="${grid.section}"] .prod-grid').children).filter(n=>n.matches('.prod-card')).map(n=>Number(n.dataset.id))`),seed.productOrders['section:'+grid.section],'Publishing sections preserves the saved product display order');
    run('set','viewport','1280','1000');click('.prod-card:not([hidden]) [data-add]');wait("Number(document.querySelector('#cartCount')?.textContent)>0");check('Add to Cart still works after section publication');
    equal(await records(),beforeRecords,'Section save/publish leaves all product and catalog records unchanged');
    const errors=run('errors').errors||[],consoleErrors=(run('console').messages||[]).filter(m=>m.type==='error'||m.level==='error');
    check('No uncaught JavaScript errors',errors.length===0);check('No browser console errors',consoleErrors.length===0);
    report={status:'PASS',checks,output,errors,consoleErrors};
  }
}catch(error){
  try{run('screenshot',path.join(output,'failure.png'));}catch{}
  let diagnosis;try{diagnosis={errors:run('errors'),console:run('console'),url:evaluate('location.href'),editor:evaluate("({status:document.querySelector('#saveStatus')?.textContent,error:document.querySelector('#errorBanner')?.textContent})")};}catch{}
  report={status:'FAIL',checks,output,error:error.stack,diagnosis};process.exitCode=1;
}finally{
  try{run('close');}catch{}
  if(report){await writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2));await writeFile('audit-artifacts/seo-editor-20261007/editor-browser-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,passed:checks.length,output,error:report.error}));}
}
