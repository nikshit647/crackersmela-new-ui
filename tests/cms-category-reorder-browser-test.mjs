import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';

const fixture=JSON.parse(await readFile(process.env.CM_CMS_FIXTURE || 'audit-evidence/cms-fixture-active.json','utf8'));
const base=fixture.baseUrl,publicBase=fixture.publicUrl;
for(const url of [base,publicBase])assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname));
const health=await(await fetch(base+'/__fixture-health')).json();assert.equal(health.isolated,true);assert.equal(health.mail,'disabled');
const binary=path.join(process.env.APPDATA,'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
// agent-browser can drive one shared Chrome across several sessions. An unpinned
// session's `open` navigates whichever tab happens to be active, which can be a
// tab the developer is using, and this file's run('close') in the finally block
// then tears down a browser this run does not own. --pin-tab binds the session to
// its own CDP target id, so foreign tabs are never adopted and close() only ends
// this session. --profile was the wrong lever: it selects auth state, not the
// browser process, and does not stop the sharing.
// The session name is unique per run so a stale .target file from an earlier run
// cannot be adopted, which is what made a previous probe report reused:true.
const session='cms-category-reorder-'+Date.now();
const isolation=['--pin-tab','--namespace','cms-catorder-qa'];
const output=path.resolve('audit-evidence/category-reorder-browser-'+Date.now());await mkdir(output,{recursive:true});
const checks=[];
const run=(...args)=>{const r=JSON.parse(execFileSync(binary,[...isolation,'--session',session,...args,'--json'],{encoding:'utf8',windowsHide:true,timeout:45000,maxBuffer:10*1024*1024}));assert.equal(r.success,true,r.error);return r.data;};
const evaluate=code=>run('eval','-b',Buffer.from(code).toString('base64')).result;
const wait=code=>run('wait','--fn',code);
const frameRead=code=>evaluate(`(()=>{const win=document.querySelector('#siteFrame').contentWindow,doc=win.document;return (${code});})()`);
const frameWait=code=>wait(`(()=>{const win=document.querySelector('#siteFrame')?.contentWindow,doc=win?.document;return !!doc&&(${code});})()`);
const click=selector=>run('click',selector);
const mouse=point=>run('mouse','move',String(Math.round(point.x)),String(Math.round(point.y)));
const point=(selector,scroll=true)=>evaluate(`(()=>{const f=document.querySelector('#siteFrame'),n=f.contentDocument.querySelector(${JSON.stringify(selector)});if(!n)throw new Error('Canvas target missing');${scroll?"n.scrollIntoView({block:'center',behavior:'instant'});":''}const r=n.getBoundingClientRect(),b=f.getBoundingClientRect(),s=b.width/f.offsetWidth;return{x:b.left+(r.left+r.width/2)*s,y:b.top+(r.top+r.height/2)*s};})()`);
const frameClick=selector=>{
  point(selector);
  frameWait(`doc.querySelector(${JSON.stringify(selector)}).closest('.home-category-card,.prod-card')?.getAnimations({subtree:true}).every(a=>a.playState!=='running')??true`);
  mouse(point(selector,false));run('mouse','down');run('mouse','up');
};
const ready=()=>frameWait("doc.querySelectorAll('.home-category-card').length>2&&doc.body.classList.contains('cms-editing')");
const saved=()=>wait("document.querySelector('#saveStatus').textContent.startsWith('✓ Saved')&&document.querySelector('#errorBanner').hidden");
const idsCode="Array.from(doc.querySelectorAll('.home-category-grid>.home-category-card')).map(n=>n.dataset.categoryId)";
const ids=()=>frameRead(idsCode);
const badges=()=>frameRead("Array.from(doc.querySelectorAll('.cms-category-reorder-grid>.home-category-card')).every((n,i)=>Number(n.querySelector(':scope>.cms-category-position')?.textContent)===i+1)");
const card=id=>`.home-category-card[data-category-id="${id}"]`;
const check=(name,condition=true)=>{assert.ok(condition,name);checks.push({name,status:'PASS'});console.log('PASS: '+name);};
const equal=(actual,expected,name)=>{assert.deepEqual(actual,expected,name);check(name);};
const move=(list,from,to)=>{const result=[...list],[item]=result.splice(from,1);result.splice(to,0,item);return result;};
const modeOpen=()=>frameWait("doc.body.classList.contains('cms-category-reordering')&&doc.querySelectorAll('.cms-category-position').length>2");
const modeShut=()=>frameWait("!doc.body.classList.contains('cms-category-reordering')&&!doc.querySelector('.cms-category-position')");
// Reordering lives inside the section: select a category card, then use the
// Reorder control that appears on that section of the canvas.
const start=()=>{run('wait','.home-categories__panel>.cms-category-reorder-start[data-cms-category-target=grid]');frameClick('.home-categories__panel>.cms-category-reorder-start[data-cms-category-target=grid]');modeOpen();};
const done=()=>{click('[data-action="category-reorder-save"]');modeShut();};
const toolbar=code=>frameRead(`(()=>{const t=doc.querySelector('.cms-category-reorder-toolbar');if(!t)return false;return (${code});})()`);
const canvasButton=selector=>{point(selector);const slot=frameRead(`(()=>{const r=doc.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};})()`);const frame=evaluate("(()=>{const f=document.querySelector('#siteFrame'),r=f.getBoundingClientRect();return{x:r.left,y:r.top,s:r.width/f.offsetWidth};})()");mouse({x:frame.x+slot.x*frame.s,y:frame.y+slot.y*frame.s});run('mouse','down');run('mouse','up');};
const originalDoc=()=>frameRead('win.CMCms.document()');
const publicIds=()=>evaluate(idsCode.replaceAll('doc.','document.'));
const records=async()=>Object.fromEntries(await Promise.all(['products','catalog'].map(async key=>[key,await(await fetch(base+'/'+key+'-api.php?a=pull')).json()])));
async function drag(from,to,name){
  const before=ids(),startPoint=point(card(before[from]));mouse(startPoint);run('mouse','down');mouse({x:startPoint.x+14,y:startPoint.y+4});
  const endPoint=point(card(before[to]),false);
  for(let n=1;n<=9;n++)mouse({x:startPoint.x+(endPoint.x-startPoint.x)*n/9,y:startPoint.y+(endPoint.y-startPoint.y)*n/9});
  frameWait("!!doc.querySelector('.cms-product-drag-placeholder .cms-product-insertion-marker')");
  const slot=frameRead(`(()=>{const r=doc.querySelector('.cms-category-reorder-grid').children[${to}].getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  const frame=evaluate("(()=>{const f=document.querySelector('#siteFrame'),r=f.getBoundingClientRect();return{x:r.left,y:r.top,s:r.width/f.offsetWidth};})()");mouse({x:frame.x+slot.x*frame.s,y:frame.y+slot.y*frame.s});
  check('Insertion indicator and live position badges during '+name,badges());run('screenshot',path.join(output,name+'.png'));run('mouse','up');
  const expected=move(before,from,to);frameWait(`${idsCode}.join(',')===${JSON.stringify(expected.join(','))}`);equal(ids(),expected,name);return expected;
}

let result;
try{
  const beforeRecords=await records();
  await new Promise((resolve,reject)=>{const child=spawn(binary,[...isolation,'--session',session,'open',base],{stdio:'ignore',windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Browser launch failed')));});
  run('set','viewport','1600','1100');
  const sessionResponse=await fetch(base+'/staff-auth.php?a=session'),sessionData=await sessionResponse.json(),cookie=sessionResponse.headers.getSetCookie().find(v=>v.startsWith('cm_staff='))?.split(';')[0];assert.ok(cookie);
  const login=await fetch(base+'/staff-auth.php?a=login',{method:'POST',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json','X-CSRF-Token':sessionData.csrfToken},body:JSON.stringify({email:fixture.email,password:fixture.password})});assert.equal(login.status,200);
  const auth=login.headers.getSetCookie().find(v=>v.startsWith('cm_staff='))?.split(';')[0]||cookie;
  run('cookies','set','cm_staff',auth.slice(9),'--url',base,'--httpOnly','--sameSite','Lax');
  run('open',base+'/visual-editor');ready();saved();
  const beforeDoc=originalDoc(),before=ids(),details=frameRead("Array.from(doc.querySelectorAll('.home-category-grid>.home-category-card')).map(n=>({id:n.dataset.categoryId,href:n.getAttribute('href'),name:n.querySelector('h3').textContent,count:n.querySelector('.home-category-card__count').textContent})).sort((a,b)=>a.id.localeCompare(b.id))");
  check('Normal editor has no category drag controls',!frameRead("!!doc.querySelector('.cms-category-position,[data-cms-category-move]')"));
  check('Normal editor has no floating Reorder Categories entry',!frameRead("!!doc.querySelector('[data-cms-action=category-reorder]')"));
  check('The home section carries its own Reorder control',frameRead("!!doc.querySelector('.home-categories__panel>.cms-category-reorder-start[data-cms-category-target=grid]')"));
  frameClick('.home-categories__panel>.cms-category-reorder-start[data-cms-category-target=grid]');
  frameWait("doc.body.classList.contains('cms-category-reordering')");check('Canvas Reorder Categories opens numbered cards',badges());
  let expected=await drag(2,0,'01-sparklers-to-first');
  expected=await drag(6,2,'02-across-grid-rows');
  const second=[...expected];click('[data-action="category-reorder-undo"]');frameWait(`${idsCode}.join(',')===${JSON.stringify(move(before,2,0).join(','))}`);click('#redo');frameWait(`${idsCode}.join(',')===${JSON.stringify(second.join(','))}`);check('Undo and redo preserve exact category grid order');
  done();check('Done restores every normal category link',frameRead("Array.from(doc.querySelectorAll('.home-category-card')).every(n=>/^\\/category\\/[a-z0-9][a-z0-9-]*$/.test(n.getAttribute('href')||'')&&n.getAttribute('role')===null)"));
  const editedDoc=originalDoc();delete editedDoc.categoryOrder;delete beforeDoc.categoryOrder;equal(editedDoc,beforeDoc,'Drag leaves all non-order page metadata and product ordering unchanged');
  equal(frameRead("Array.from(doc.querySelectorAll('.home-category-grid>.home-category-card')).map(n=>({id:n.dataset.categoryId,href:n.getAttribute('href'),name:n.querySelector('h3').textContent,count:n.querySelector('.home-category-card__count').textContent})).sort((a,b)=>a.id.localeCompare(b.id))"),details,'Category IDs, names, counts and routes are preserved');
  click('[data-device="mobile"]');frameWait('win.innerWidth===390');start();
  const moving=expected[1];frameClick(card(moving)+' [data-cms-category-move="-1"]');expected=move(expected,1,0);frameWait(`${idsCode}.join(',')===${JSON.stringify(expected.join(','))}`);check('Mobile Move up fallback reorders the selected real category',badges());
  frameClick(card(moving)+' [data-cms-category-move="1"]');expected=move(expected,0,1);frameWait(`${idsCode}.join(',')===${JSON.stringify(expected.join(','))}`);check('Mobile Move down fallback reverses the move',badges());
  check('Mobile fallback controls have 44px touch targets',frameRead("Array.from(doc.querySelectorAll('[data-cms-category-move]')).every(n=>n.getBoundingClientRect().height>=44&&n.getBoundingClientRect().width>=44)"));
  check('Mobile category canvas has no horizontal overflow',frameRead('doc.documentElement.scrollWidth<=win.innerWidth+1'));run('screenshot',path.join(output,'03-mobile-category-reorder.png'));done();click('[data-device="desktop"]');
  start();frameClick(card(expected[1]));run('press','ArrowLeft');expected=move(expected,1,0);frameWait(`${idsCode}.join(',')===${JSON.stringify(expected.join(','))}`);check('Keyboard ArrowLeft reorders a focused category',badges());
  run('press','Escape');frameWait("!doc.body.classList.contains('cms-category-reordering')");check('Escape ends category reorder mode');
  click('#save');saved();run('reload');ready();saved();equal(ids(),expected,'Save Draft survives refreshing the editor');
  click('#preview');frameWait('win.CM_EDITOR_INTERACTIVE===true');equal(ids(),expected,'Preview displays the saved draft category order');check('Preview removes category drag decorations',!frameRead("!!doc.querySelector('.cms-category-position,[data-cms-category-move]')"));click('#preview');
  click('#publish');run('wait','#confirmDialog[open]');click('#confirmAction');wait("document.querySelector('#toasts').textContent.includes('Published. The website now uses this version.')");saved();
  run('open',publicBase+'/#/');wait("document.querySelectorAll('.home-category-card').length>2");run('reload');wait("document.querySelectorAll('.home-category-card').length>2");equal(publicIds(),expected,'Fresh public homepage shows the published category order');
  check('Public homepage contains no editor controls',!evaluate("!!document.querySelector('.cms-category-position,.cms-product-order-controls,[data-cms-action]')"));run('screenshot',path.join(output,'04-public-category-order.png'));
  click(card(expected[0]));wait("location.hash.startsWith('#/products?cat=')&&document.querySelectorAll('.shop-main .prod-card').length>0");check('Published category card still opens its products',evaluate(`new URLSearchParams(location.hash.split('?')[1]).get('cat')===${JSON.stringify(expected[0])}`));
  equal(await records(),beforeRecords,'Category publication leaves product and catalog records unchanged');
  run('open',base+'/visual-editor?page=products');wait("document.querySelector('#loading').hidden&&document.querySelector('#siteFrame').contentWindow.CMCms?.page()==='products'");saved();
  frameClick('.shop-main>.prod-grid>.prod-card');run('wait','[data-action="product-reorder"]');click('[data-action="product-reorder"]');frameWait("doc.body.classList.contains('cms-product-reordering')&&doc.querySelector('.cms-product-position')");
  check('Existing Reorder Products still activates',!frameRead("doc.body.classList.contains('cms-category-reordering')"));
  const productIds=frameRead("Array.from(doc.querySelectorAll('.shop-main>.prod-grid>.prod-card')).map(n=>n.dataset.id)");frameClick(`.prod-card[data-id="${productIds[1]}"] [data-cms-product-move="-1"]`);frameWait(`doc.querySelector('.shop-main>.prod-grid>.prod-card').dataset.id===${JSON.stringify(productIds[1])}`);click('#undo');frameWait(`doc.querySelector('.shop-main>.prod-grid>.prod-card').dataset.id===${JSON.stringify(productIds[0])}`);click('[data-action="product-reorder-done"]');check('Existing product move, undo and Done still work');
  check('No uncaught browser errors',(run('errors').errors||[]).length===0);
  check('No browser console errors',!(run('console').messages||[]).some(message=>message.type==='error'||message.level==='error'));
  result={status:'PASS',scope:fixture.scope,checks,output};
}catch(error){
  try{run('screenshot',path.join(output,'failure.png'));}catch{}
  let diagnosis;try{diagnosis={errors:run('errors'),console:run('console'),ui:evaluate("({url:location.href,status:document.querySelector('#saveStatus')?.textContent,error:document.querySelector('#errorBanner')?.textContent,inspector:document.querySelector('#inspector')?.textContent,categoryOrder:Array.from(document.querySelector('#siteFrame')?.contentDocument?.querySelectorAll('.home-category-grid>.home-category-card')||[]).map(n=>n.dataset.categoryId)})")};}catch{}
  result={status:'FAIL',scope:fixture.scope,checks,output,error:error.stack,diagnosis};throw error;
}finally{
  try{run('close');}catch{}
  if(result){await writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));await writeFile('audit/category-reorder-browser-results.json',JSON.stringify(result,null,2));}
}
