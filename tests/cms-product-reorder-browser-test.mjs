import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';

// This suite must never target production. All publishing uses the mail-disabled
// fixture, and its Products CMS record is restored byte-for-byte afterwards.
const fixture=JSON.parse(await readFile(process.env.CM_CMS_FIXTURE || 'audit-evidence/cms-fixture-active.json','utf8'));
const base=fixture.baseUrl;
for(const value of [base,fixture.publicUrl]){const u=new URL(value);assert.ok(u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname),'Localhost fixture only');}
const health=await(await fetch(base+'/__fixture-health')).json();assert.equal(health.isolated,true);assert.equal(health.mail,'disabled');
const fixtureRoot=path.resolve(fixture.fixture),evidenceRoot=path.resolve('audit-evidence');
assert.equal(path.dirname(fixtureRoot),evidenceRoot);assert.ok(path.basename(fixtureRoot).startsWith('cms-fixture-'));
const recordFile=path.join(fixtureRoot,'data/cms-pages/products.json');
assert.ok(recordFile.startsWith(fixtureRoot+path.sep));
let originalRecord;try{originalRecord=await readFile(recordFile);}catch(error){if(error.code!=='ENOENT')throw error;originalRecord=null;}
const restoreOriginalRecord=async()=>{try{if(originalRecord!==null)await writeFile(recordFile,originalRecord);else await unlink(recordFile);return null;}catch(error){return error.code==='ENOENT'&&originalRecord===null?null:error.message;}};
const output=path.resolve('audit-evidence/cms-product-reorder-'+Date.now());await mkdir(output,{recursive:true});
const binary=process.platform==='win32'?path.join(process.env.APPDATA,'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe'):'agent-browser';
const session='cms-product-reorder-qa',checks=[];
const run=(...args)=>{const r=JSON.parse(execFileSync(binary,['--session',session,...args,'--json'],{encoding:'utf8',windowsHide:true,maxBuffer:12*1024*1024}));assert.equal(r.success,true,r.error);return r.data;};
const evaluate=code=>run('eval','-b',Buffer.from(code).toString('base64')).result;
const wait=code=>run('wait','--fn',code);
const click=selector=>run('click',selector);
const frameRead=code=>evaluate(`(()=>{const win=document.querySelector('#siteFrame').contentWindow,doc=win.document;return (${code});})()`);
const frameWait=code=>wait(`(()=>{const win=document.querySelector('#siteFrame')?.contentWindow,doc=win?.document;return !!doc&&(${code});})()`);
const check=(name,pass=true,detail)=>{assert.ok(pass,name);checks.push({name,status:'PASS',...(detail?{detail}:{})});console.log('PASS: '+name);};
const equal=(actual,expected,name)=>{assert.deepEqual(actual,expected,name);check(name);};
const idsCode="Array.from(doc.querySelectorAll('.shop-main>.prod-grid>.prod-card[data-id]')).filter(n=>!n.hidden).map(n=>Number(n.dataset.id))";
const gridIds=()=>frameRead(idsCode);
const publicIds=()=>evaluate(idsCode.replaceAll('doc.','document.'));
const saved=()=>wait("document.querySelector('#saveStatus').textContent.startsWith('✓ Saved')&&document.querySelector('#errorBanner').hidden");
const ready=()=>wait("document.querySelector('#loading').hidden&&document.querySelector('#siteFrame').contentWindow.CMCms?.page()==='products'");
const framePoint=(selector,scroll=true,rx=.5,ry=.5)=>evaluate(`(()=>{const f=document.querySelector('#siteFrame'),n=f.contentDocument.querySelector(${JSON.stringify(selector)});if(!n)throw new Error('Missing canvas target: '+${JSON.stringify(selector)});${scroll?"n.scrollIntoView({block:'center',behavior:'instant'});":''}const r=n.getBoundingClientRect(),o=f.getBoundingClientRect(),s=o.width/f.offsetWidth;return{x:o.left+(r.left+r.width*${rx})*s,y:o.top+(r.top+r.height*${ry})*s,scale:s};})()`);
const mouse=point=>run('mouse','move',String(Math.round(point.x)),String(Math.round(point.y)));
const frameClick=selector=>{mouse(framePoint(selector));run('mouse','down');run('mouse','up');};
const cardSelector=id=>`.shop-main>.prod-grid>.prod-card[data-id="${id}"]`;
const moved=(list,from,to)=>{const result=[...list],[id]=result.splice(from,1);result.splice(to,0,id);return result;};
const badgesValid=()=>frameRead("Array.from(doc.querySelectorAll('.cms-product-reorder-grid>.prod-card')).every((n,i)=>Number(n.querySelector(':scope>.cms-product-position')?.textContent)===i+1)");
const enter=()=>{if(frameRead("doc.body.classList.contains('cms-product-reordering')"))return;frameClick('.shop-main>.prod-grid>.prod-card');run('wait','[data-action="product-reorder"]');click('[data-action="product-reorder"]');frameWait("doc.body.classList.contains('cms-product-reordering')&&doc.querySelectorAll('.cms-product-position').length>1");};
const done=()=>{if(evaluate("!!document.querySelector('[data-action=\"product-reorder-done\"]')"))click('[data-action="product-reorder-done"]');frameWait("!doc.body.classList.contains('cms-product-reordering')&&!doc.querySelector('.cms-product-position')");};
const category=key=>{frameClick(`#catRail [data-cat="${key}"]`);ready();frameWait(`doc.querySelector('#catRail [data-cat="${key}"]')?.getAttribute('aria-current')==='true'`);};
const publicCategory=key=>{
  if(evaluate("!!document.querySelector('[data-fcat]:checked')"))click('[data-fclear="cats"]');
  if(key!=='all')click(`[data-fcat][value="${key}"]`);
  wait(`document.querySelector('#catRail [data-cat="${key}"]')?.getAttribute('aria-current')==='true'&&document.querySelector('.shop-main>.prod-grid>.prod-card')`);
};
const orderDoc=()=>frameRead('win.CMCms.document().productOrders||{}');
const readJson=async url=>{const response=await fetch(url,{cache:'no-store'});assert.ok(response.ok,url);return response.json();};
const records=async()=>({products:await readJson(base+'/products-api.php?a=pull'),catalog:await readJson(base+'/catalog-api.php?a=pull')});
const published=async()=>{const value=await readJson(base+'/cms-api.php?a=published&page=products');return{published:value.published,publishedAt:value.publishedAt,version:value.version};};
async function dragCard(from,to,{normal=false,screenshot}={}){
  const before=gridIds(),source=cardSelector(before[from]);assert.ok(before.length>Math.max(from,to));
  const start=framePoint(source);mouse(start);run('mouse','down');mouse({x:start.x+15,y:start.y+4});
  const dest=framePoint(cardSelector(before[to]));
  for(let n=1;n<=8;n++)mouse({x:start.x+(dest.x-start.x)*n/8,y:start.y+(dest.y-start.y)*n/8});
  if(!normal){
    frameWait("!!doc.querySelector('.cms-product-drag-placeholder .cms-product-insertion-marker')");
    // Finish at the requested visual slot after card animations settle.
    const slot=frameRead(`(()=>{const n=doc.querySelector('.cms-product-reorder-grid').children[${to}],r=n.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
    const outer=evaluate("(()=>{const f=document.querySelector('#siteFrame'),r=f.getBoundingClientRect();return{x:r.left,y:r.top,s:r.width/f.offsetWidth};})()");
    mouse({x:outer.x+slot.x*outer.s,y:outer.y+slot.y*outer.s});
    check('Insertion marker and live position numbers are visible while dragging',badgesValid());
    if(screenshot)run('screenshot',path.join(output,screenshot));
  }
  run('mouse','up');
  if(normal)return before;
  const expected=moved(before,from,to);
  frameWait(`${idsCode}.join(',')===${JSON.stringify(expected.join(','))}`);
  return expected;
}

// Native CDP touch input produces trusted browser pointer events; it does not
// invoke any editor operation or modify product order directly.
async function touchDrag(from,to){
  const wsValue=run('get','cdp-url');
  const findWs=value=>typeof value==='string'&&/^wss?:/.test(value)?value:value&&typeof value==='object'?Object.values(value).map(findWs).find(Boolean):null;
  const endpoint=findWs(wsValue);assert.ok(endpoint,'Browser must expose its CDP endpoint');
  const socket=new WebSocket(endpoint),pending=new Map();let serial=0;
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{const value=JSON.parse(event.data);if(value.id&&pending.has(value.id)){const p=pending.get(value.id);pending.delete(value.id);clearTimeout(p.timer);value.error?p.reject(new Error(value.error.message)):p.resolve(value.result);}});
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>reject(new Error('CDP timed out: '+method)),10000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  const marker='product-touch-'+Date.now();evaluate(`window.name=${JSON.stringify(marker)}`);
  let attached;
  try{
    for(const target of (await send('Target.getTargets')).targetInfos.filter(t=>t.type==='page'&&t.url.startsWith(base))){
      const {sessionId}=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
      const info=await send('Runtime.evaluate',{expression:'window.name',returnByValue:true},sessionId);
      if(info.result.value===marker){attached=sessionId;break;}
      await send('Target.detachFromTarget',{sessionId});
    }
    assert.ok(attached,'Active editor CDP target');
    await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1},attached);
    frameRead("(()=>{win.__productQaTouch=[];win.addEventListener('pointerdown',e=>win.__productQaTouch.push({type:e.pointerType,trusted:e.isTrusted}),{once:true,capture:true});return true;})()");
    const before=gridIds(),start=framePoint(cardSelector(before[from])),destination=framePoint(cardSelector(before[to]),false);
    const points=p=>[{x:Math.round(p.x),y:Math.round(p.y),radiusX:5,radiusY:5,force:.5,id:1}];
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(start)},attached);
    for(let n=1;n<=12;n++){await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points({x:start.x+(destination.x-start.x)*n/12,y:start.y+(destination.y-start.y)*n/12})},attached);await new Promise(resolve=>setTimeout(resolve,20));}
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]},attached);
    const expected=moved(before,from,to);frameWait(`${idsCode}.join(',')===${JSON.stringify(expected.join(','))}`);
    check('Mobile touch dragging uses trusted touch pointer events',frameRead("win.__productQaTouch.some(e=>e.type==='touch'&&e.trusted)"));
    return expected;
  }finally{if(attached){await send('Emulation.setTouchEmulationEnabled',{enabled:false},attached);await send('Target.detachFromTarget',{sessionId:attached});}socket.close();}
}

let recording=false,result;
try{
  const recordsBefore=await records(),publishedBefore=await published();
  await new Promise((resolve,reject)=>{const child=spawn(binary,['--session',session,'open',base],{stdio:'ignore',windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Browser launch failed')));});
  run('set','viewport','1600','1200');
  const sr=await fetch(base+'/staff-auth.php?a=session'),sd=await sr.json(),cookie=sr.headers.getSetCookie().find(v=>v.startsWith('cm_staff='))?.split(';')[0];assert.ok(cookie);
  const login=await fetch(base+'/staff-auth.php?a=login',{method:'POST',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json','X-CSRF-Token':sd.csrfToken},body:JSON.stringify({email:fixture.email,password:fixture.password})});assert.equal(login.status,200);
  const auth=login.headers.getSetCookie().find(v=>v.startsWith('cm_staff='))?.split(';')[0]||cookie;
  run('cookies','set','cm_staff',auth.slice(9),'--url',base,'--httpOnly','--sameSite','Lax');
  run('open',fixture.publicUrl+'/products');wait("document.querySelectorAll('.shop-main>.prod-grid>.prod-card').length>=10");
  const originalAll=publicIds();
  const categories=evaluate("Array.from(document.querySelectorAll('#catRail [data-cat]')).map(n=>({id:n.dataset.cat,name:n.childNodes[0].textContent.trim(),count:Number(n.querySelector('.cp-n')?.textContent)})).filter(c=>c.id!=='all'&&c.count>=5).slice(0,2)");assert.equal(categories.length,2,'Two real categories with five products');
  const originalCategories={};for(const cat of categories){publicCategory(cat.id);originalCategories[cat.id]=publicIds();}
  run('open',base+'/visual-editor?page=products');ready();saved();
  try{run('record','start',path.join(output,'product-reorder-workflow.webm'));recording=true;ready();}catch(error){console.log('Video unavailable: '+error.message);}
  check('Products opens inside the existing visual website editor',frameRead("!!doc.querySelector('[data-cms-section=\"products:shop-layout\"] .prod-card')"));
  const initialDraftOrders=orderDoc(),startingAll=gridIds();
  equal([...startingAll].sort((a,b)=>a-b),[...originalAll].sort((a,b)=>a-b),'Normal editor contains the exact real public product records');
  equal(startingAll,initialDraftOrders.all||originalAll,'Existing private draft ordering is preserved on editor load');
  const protectedOrder=await dragCard(9,1,{normal:true});equal(gridIds(),protectedOrder,'Normal editing cannot accidentally reorder products');
  enter();check('Reorder Products explicitly enables numbered real cards',badgesValid());run('screenshot',path.join(output,'01-numbered-products.png'));
  let allOrder=await dragCard(9,1,{screenshot:'02-across-rows-drag.png'});
  check('Product 10 moves directly to position 2 across grid rows',allOrder[1]===startingAll[9]);
  wait("document.querySelector('#saveStatus').textContent.includes('Unsaved changes')");check('Dragging shows Unsaved changes');
  equal(await published(),publishedBefore,'Dragging does not change the published CMS version');
  const beforeSecond=[...allOrder];allOrder=await dragCard(4,1,{screenshot:'03-insertion-position.png'});
  check('Product 5 inserts between products 1 and 2',allOrder[0]===beforeSecond[0]&&allOrder[1]===beforeSecond[4]&&allOrder[2]===beforeSecond[1]);
  click('#undo');frameWait(`${idsCode}.join(',')===${JSON.stringify(beforeSecond.join(','))}`);click('#redo');frameWait(`${idsCode}.join(',')===${JSON.stringify(allOrder.join(','))}`);
  check('Undo and redo restore exact grid ordering');done();check('Done Reordering removes badges and drag controls');

  const categoryOrders={};
  for(const cat of categories){
    category(cat.id);equal(gridIds(),initialDraftOrders[cat.id]||originalCategories[cat.id],cat.name+' starts with its independent original order');
    enter();categoryOrders[cat.id]=await dragCard(4,0);done();
    check(cat.name+' has its own edited order');
  }
  category('all');equal(gridIds(),allOrder,'All Products order is unaffected by category reordering');
  for(const cat of categories){category(cat.id);equal(gridIds(),categoryOrders[cat.id],cat.name+' retains its independent order');}
  category('all');click('[data-device="mobile"]');frameWait('win.innerWidth===390');enter();
  check('Mobile uses two readable product columns without horizontal overflow',frameRead("win.getComputedStyle(doc.querySelector('.shop-main>.prod-grid')).gridTemplateColumns.split(' ').length===2&&doc.documentElement.scrollWidth<=win.innerWidth+1"));
  allOrder=await touchDrag(1,0);
  const beforeFallback=[...allOrder],fallbackId=allOrder[1];frameClick(cardSelector(fallbackId)+' [data-cms-product-move="-1"]');allOrder=moved(beforeFallback,1,0);frameWait(`${idsCode}.join(',')===${JSON.stringify(allOrder.join(','))}`);
  check('Mobile Move up fallback changes the real order');frameClick(cardSelector(fallbackId)+' [data-cms-product-move="1"]');allOrder=beforeFallback;frameWait(`${idsCode}.join(',')===${JSON.stringify(allOrder.join(','))}`);
  check('Mobile Move down fallback reverses the move');run('screenshot',path.join(output,'04-mobile-reorder.png'));done();click('[data-device="desktop"]');
  const expectedOrders={...initialDraftOrders,all:allOrder,...categoryOrders};equal(orderDoc(),expectedOrders,'Draft holds separate All Products and category order lists');
  run('press','Control+s');saved();check('Save persists the product ordering draft');equal(await published(),publishedBefore,'Saved draft stays private until Publish');
  click('#preview');frameWait('win.CM_EDITOR_INTERACTIVE===true');check('Preview shows the draft ordering without reorder decorations',!frameRead("!!doc.querySelector('.cms-product-position')"));equal(gridIds(),allOrder,'Preview grid exactly matches the draft order');click('#preview');
  click('#publish');run('wait','#confirmDialog[open]');click('#confirmAction');wait("document.querySelector('#toasts').textContent.includes('Published. The website now uses this version.')");saved();
  run('open',fixture.publicUrl+'/products');wait("document.querySelectorAll('.shop-main>.prod-grid>.prod-card').length>=10");run('reload');wait("document.querySelectorAll('.shop-main>.prod-grid>.prod-card').length>=10");
  equal(publicIds(),allOrder,'Reloaded localhost /products shows the exact published All Products order');
  for(const cat of categories){publicCategory(cat.id);equal(publicIds(),categoryOrders[cat.id],'Published '+cat.name+' order matches its editor grid');}
  run('screenshot',path.join(output,'05-published-category.png'));
  equal(await records(),recordsBefore,'Product IDs, names, SKU, images, descriptions, prices and stock remain unchanged');
  check('Public cards have no reorder mode decorations',!evaluate("!!document.querySelector('.cms-product-position,.cms-product-order-controls')"));
  check('No uncaught browser errors',(run('errors').errors||[]).length===0);
  if(recording){run('record','stop');recording=false;}
  result={status:'PASS',scope:fixture.scope,output,categories,checks};
}catch(error){
  try{run('screenshot',path.join(output,'failure.png'));}catch{/* Preserve primary failure. */}
  let diagnosis;try{diagnosis={errors:run('errors'),ui:evaluate("({url:location.href,status:document.querySelector('#saveStatus')?.textContent,error:document.querySelector('#errorBanner')?.textContent,toolbar:document.querySelector('#inspector')?.innerHTML,frameHash:document.querySelector('#siteFrame')?.contentWindow.location.hash,order:document.querySelector('#siteFrame')?.contentWindow.CMCms?.document()?.productOrders})")};}catch{/* Browser unavailable. */}
  result={status:'FAIL',scope:fixture.scope,output,checks,error:error.message,diagnosis};
  throw error;
}finally{
  if(recording){try{run('record','stop');}catch{/* Preserve failure. */}}
  try{run('close');}catch{/* Already closed. */}
  const restoreError=await restoreOriginalRecord();if(restoreError){process.exitCode=1;if(result){result.status='FAIL';result.restoreError=restoreError;}}
  if(result){result.fixtureProductsRestored=!restoreError;await writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));await writeFile('audit/cms-product-reorder-browser-results.json',JSON.stringify(result,null,2));}
  if(result?.status==='PASS')console.log(`PASS: ${checks.length} product reorder checks. Evidence: ${output}`);
}
