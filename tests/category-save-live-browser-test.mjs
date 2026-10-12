import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import path from 'node:path';

// Real browser, real PHP storage, synthetic staff session. No production writes.
const fixture=JSON.parse(await readFile(process.env.CM_CMS_FIXTURE||'audit-evidence/cms-fixture-active.json','utf8'));
const base=fixture.baseUrl,publicBase=fixture.publicUrl;
for(const url of [base,publicBase])assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname));
const health=await(await fetch(base+'/__fixture-health')).json();assert.equal(health.isolated,true);assert.equal(health.mail,'disabled');
const binary=path.join(process.env.APPDATA,'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const session='category-save-live-'+Date.now(),namespace='cms-category-save-qa';
const output=path.resolve('audit-evidence/category-save-live-'+Date.now());await mkdir(output,{recursive:true});
const checks=[],baseline=process.argv.includes('--baseline'),filterGeometry=process.argv.includes('--filter-geometry'),probeComplete=Symbol('probe complete');
const run=(...args)=>{let stdout;try{stdout=execFileSync(binary,['--pin-tab','--namespace',namespace,'--session',session,...args,'--json'],{encoding:'utf8',windowsHide:true,timeout:45000,maxBuffer:10*1024*1024});}catch(error){
  // A newly launched Windows daemon can retain the inherited output pipe after
  // returning a complete response. Preserve that response instead of reporting
  // "Browser launch failed" for a browser that successfully opened the page.
  let completed;try{completed=JSON.parse(String(error.stdout||''));}catch{}
  if(completed?.success===true)return completed.data;
  throw new Error(`Browser ${args[0]} failed: ${String(error.stdout||error.stderr||error.message)}`);
}const result=JSON.parse(stdout);assert.equal(result.success,true,result.error);return result.data;};
const evaluate=code=>run('eval','-b',Buffer.from(code).toString('base64')).result;
const wait=code=>run('wait','--fn',code);
const frameRead=code=>evaluate(`(()=>{const win=document.querySelector('#siteFrame').contentWindow,doc=win.document;return (${code});})()`);
const frameWait=code=>wait(`(()=>{const win=document.querySelector('#siteFrame')?.contentWindow,doc=win?.document;return !!doc&&(${code});})()`);
const point=(selector,scroll=true)=>evaluate(`(()=>{const f=document.querySelector('#siteFrame'),n=f.contentDocument.querySelector(${JSON.stringify(selector)});if(!n)throw new Error('Missing canvas element');${scroll?"n.scrollIntoView({block:'center',behavior:'instant'});":''}const r=n.getBoundingClientRect(),b=f.getBoundingClientRect(),s=b.width/f.offsetWidth;return{x:b.left+(r.left+r.width/2)*s,y:b.top+(r.top+r.height/2)*s};})()`);
const mouse=p=>run('mouse','move',String(Math.round(p.x)),String(Math.round(p.y)));
const frameClick=selector=>{point(selector);frameWait(`doc.querySelector(${JSON.stringify(selector)}).getAnimations({subtree:true}).every(a=>a.playState!=='running')`);mouse(point(selector,false));run('mouse','down');run('mouse','up');};
const check=(name,pass=true,detail)=>{checks.push({name,status:pass?'PASS':'FAIL',...(detail===undefined?{}:{detail})});console.log(`${pass?'PASS':'FAIL'}: ${name}`);if(!pass&&!baseline)assert.fail(name);};
const equal=(actual,expected,name)=>check(name,JSON.stringify(actual)===JSON.stringify(expected),JSON.stringify(actual)===JSON.stringify(expected)?undefined:{actual,expected});
const move=(list,from,to)=>{const next=[...list],[item]=next.splice(from,1);next.splice(to,0,item);return next;};
const gridIds="Array.from(doc.querySelectorAll('.home-category-grid>.home-category-card')).map(n=>n.dataset.categoryId)";
const homeDetails="Array.from(doc.querySelectorAll('.home-category-grid>.home-category-card')).map(n=>({id:n.dataset.categoryId,href:n.getAttribute('href'),name:n.querySelector('h3')?.textContent,count:n.querySelector('.home-category-card__count')?.textContent})).sort((a,b)=>a.id.localeCompare(b.id))";
const menuIds="Array.from(doc.querySelectorAll('#navCatMenu>a[data-cat-id]')).map(n=>n.dataset.catId)";
const filterIds="Array.from(doc.querySelectorAll('#filterCol input[data-fcat]')).map(n=>n.value)";
const surfaceIds=target=>target==='grid'?gridIds:target==='menu'?menuIds:filterIds;
const item=(target,id)=>target==='grid'?`.home-category-card[data-category-id="${id}"]`:target==='menu'?`#navCatMenu>a[data-cat-id="${id}"]`:`#filterCol label[data-cat-id="${id}"]`;
const ready=page=>frameWait(`win.CMCms?.page()===${JSON.stringify(page)}&&doc.body.classList.contains('cms-editing')&&doc.querySelectorAll(${JSON.stringify(page==='home'?'.home-category-card':'#filterCol input[data-fcat]')}).length===11`);
const openEditor=page=>{run('open',base+'/visual-editor?page='+page);ready(page);wait("document.querySelector('#loading').hidden");};
const start=target=>{const selector=`.cms-category-reorder-start[data-cms-category-target=${target}]`;frameWait(`!!doc.querySelector(${JSON.stringify(selector)})`);if(target==='menu'){
  mouse(point('.nav-drop>a'));frameWait("win.getComputedStyle(doc.querySelector('#navCatMenu')).visibility==='visible'&&Number(win.getComputedStyle(doc.querySelector('#navCatMenu')).opacity)>.99");
  mouse(point(selector,false));run('mouse','down');run('mouse','up');
}else frameClick(selector);frameWait("doc.body.classList.contains('cms-category-reordering')&&doc.querySelectorAll('.cms-category-position').length===11");};
const endWait=()=>frameWait("!doc.body.classList.contains('cms-category-reordering')");
let cookie='',csrf='',result,originalSurfaceDetails;
const surfaceDetails=()=>evaluate("({menu:Array.from(document.querySelectorAll('#navCatMenu>a[data-cat-id]')).map(n=>({id:n.dataset.catId,href:n.getAttribute('href'),name:n.querySelector('b')?.textContent,count:n.querySelector('small')?.textContent})).sort((a,b)=>a.id.localeCompare(b.id)),sidebar:Array.from(document.querySelectorAll('#filterCol label.check-row:has(input[data-fcat])')).map(n=>({id:n.querySelector('input[data-fcat]')?.value,name:n.querySelector('span')?.textContent,count:n.querySelector('.cr-count')?.textContent})).sort((a,b)=>a.id.localeCompare(b.id))})");
const api=async(action,data,page='home')=>{const response=await fetch(base+`/cms-api.php?a=${action}&page=${page}`,{method:data?'POST':'GET',headers:{Cookie:cookie,...(data?{Origin:base,'Content-Type':'application/json','X-CSRF-Token':csrf}:{})},...(data?{body:JSON.stringify(data)}:{})});const value=await response.json();assert.equal(response.ok,true,value.error);return value;};
const published=async()=>((await api('published')).published||{}).categoryOrder;
const storageRoot=path.resolve(fixture.fixture,'data','cms-pages');
assert.equal(path.dirname(path.dirname(storageRoot)),path.resolve(fixture.fixture));
const originals=new Map();for(const name of ['home','products']){const file=path.join(storageRoot,name+'.json');originals.set(file,await readFile(file).catch(error=>{if(error.code==='ENOENT')return null;throw error;}));}
const headerFile=path.resolve(fixture.fixture,'data','cms-global-header.json');originals.set(headerFile,await readFile(headerFile).catch(error=>{if(error.code==='ENOENT')return null;throw error;}));
const commerce=async()=>Object.fromEntries(await Promise.all(['products','catalog'].map(async name=>[name,await readFile(path.join(fixture.fixture,'data',name+'.json'),'utf8')])));
const beforeCommerce=await commerce();
function checkFilterGeometry(label){
  const geometry=frameRead("(()=>{const card=doc.querySelector('#filterCol .filter-card:has(input[data-fcat])'),toolbar=card.querySelector('.cms-category-reorder-toolbar'),box=card.getBoundingClientRect(),rows=[...card.querySelectorAll('label[data-cat-id]')],inside=(a,b,p=1)=>a.left>=b.left-p&&a.right<=b.right+p&&a.top>=b.top-p&&a.bottom<=b.bottom+p;return{toolbarInside:[...toolbar.children].every(n=>inside(n.getBoundingClientRect(),box)),rows:rows.map(n=>{const r=n.getBoundingClientRect();return{height:r.height,inside:[...n.querySelectorAll('button,input,em,.cms-category-handle,:scope>span:not([data-cms-chrome])')].filter(c=>c.getClientRects().length).every(c=>inside(c.getBoundingClientRect(),r,2))};}),menuVisible:win.getComputedStyle(doc.querySelector('#navCatMenu')).visibility==='visible'&&Number(win.getComputedStyle(doc.querySelector('#navCatMenu')).opacity)>.9};})()");
  check(label+' sidebar toolbar children stay within filter card',geometry.toolbarInside,geometry);
  check(label+' category rows are compact with controls inside',geometry.rows.length===11&&geometry.rows.every(r=>r.height<=115&&r.inside),geometry);
  check(label+' filter reorder does not force the unrelated mega-menu open',!geometry.menuVisible,geometry);
  run('screenshot',path.join(output,label.toLowerCase().replaceAll(' ','-')+'-filter.png'));
}
function checkMenuGhost(label){
  const appearance=frameRead("(()=>{const ghost=doc.querySelector('.cms-product-drag-ghost'),s=win.getComputedStyle(ghost),name=ghost.querySelector('b'),count=ghost.querySelector('small'),icon=ghost.querySelector('.mi'),i=win.getComputedStyle(icon);return{display:s.display,background:s.backgroundColor,boxSizing:s.boxSizing,height:parseFloat(s.height),sourceHeight:parseFloat(ghost.style.height),nameAboveCount:count.getBoundingClientRect().top>=name.getBoundingClientRect().bottom-1,iconWidth:parseFloat(i.width),iconHeight:parseFloat(i.height)};})()");
  check(label+' ghost keeps a solid card with the source dimensions',appearance.display==='flex'&&appearance.background!=='rgba(0, 0, 0, 0)'&&appearance.boxSizing==='border-box'&&Math.abs(appearance.height-appearance.sourceHeight)<1,appearance);
  check(label+' ghost keeps category name and count on separate lines',appearance.nameAboveCount,appearance);
  check(label+' ghost keeps the category icon size',appearance.iconWidth===28&&appearance.iconHeight===28,appearance);
}
const launch=()=>new Promise((resolve,reject)=>{
  const child=spawn(binary,['--pin-tab','--namespace',namespace,'--session',session,'open',base,'--json'],{windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='',settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);child.stdout.destroy();child.stderr.destroy();child.unref();error?reject(error):resolve(value);};
  const timer=setTimeout(()=>finish(new Error('Browser launch did not return a response: '+stderr)),45000);
  child.stdout.on('data',chunk=>{stdout+=chunk;try{const response=JSON.parse(stdout);finish(response.success?null:new Error(response.error),response.data);}catch{}});
  child.stderr.on('data',chunk=>{stderr+=chunk;});child.on('error',error=>finish(error));child.on('exit',code=>{if(!settled)finish(new Error('Browser launch exited '+code+': '+stdout+stderr));});
});
async function drag(target,from,to){
  frameWait("doc.querySelector('.cms-category-reorder-grid').getAnimations({subtree:true}).every(a=>a.playState!=='running')");
  if(target==='menu'){
    const layout=frameRead("(()=>{const host=doc.querySelector('.cms-category-menu-editor'),nodes=[host?.querySelector('.cms-category-reorder-toolbar'),...doc.querySelectorAll('#navCatMenu>.cms-category-reorder-card')].filter(Boolean),rects=nodes.map(n=>n.getBoundingClientRect());return{count:rects.length,inside:rects.every(r=>r.left>=0&&r.right<=win.innerWidth+1&&r.top>=0&&r.bottom<=win.innerHeight+1),overlap:rects.some((a,i)=>rects.slice(i+1).some(b=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top))};})()");
    check('Mega-menu editing contains all 11 categories and toolbar within desktop viewport',layout.count===12&&layout.inside,layout);
    check('Mega-menu editing cards and toolbar do not overlap',!layout.overlap,layout);
    const hit=frameRead("(()=>{const menu=doc.querySelector('#navCatMenu'),handle=menu.querySelector('.cms-category-handle'),r=handle.getBoundingClientRect(),hit=doc.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return{pointerEvents:win.getComputedStyle(menu).pointerEvents,handleHit:hit?.closest('.cms-category-handle')===handle,hit:hit?.outerHTML.slice(0,200)};})()");
    check('Mega-menu handles receive pointer input',hit.pointerEvents==='auto'&&hit.handleHit,hit);
  }
  const before=frameRead(surfaceIds(target)),selector=item(target,before[from])+' .cms-category-handle',a=point(selector,target!=='menu');
  mouse(a);frameWait(`doc.querySelector(${JSON.stringify(item(target,before[from]))}).getAnimations({subtree:true}).every(a=>a.playState!=='running')`);mouse(point(selector,false));run('mouse','down');mouse({x:a.x+10,y:a.y+4});
  const b=point(item(target,before[to])+(target==='menu'?' .cms-category-handle':''),false);
  for(let step=1;step<=8;step++)mouse({x:a.x+(b.x-a.x)*step/8,y:a.y+(b.y-a.y)*step/8});
  frameWait("!!doc.querySelector('.cms-product-drag-placeholder .cms-product-insertion-marker')");
  check(target+' drag shows insertion marker and all 11 live positions',frameRead("doc.querySelectorAll('.cms-category-reorder-grid .cms-category-position').length===11"));
  const preview=frameRead(surfaceIds(target));check(target+' order previews before pointer release',JSON.stringify(preview)!==JSON.stringify(before));
  if(target==='menu')checkMenuGhost('Mouse menu drag');
  run('screenshot',path.join(output,target+'-drag.png'));run('mouse','up');
  const after=frameRead(surfaceIds(target));equal([...after].sort(),[...before].sort(),target+' drag retains every category exactly once');return after;
}
async function cdp(){
  const url=run('get','cdp-url').cdpUrl,socket=new WebSocket(url),pending=new Map();let id=0;
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.id&&pending.has(data.id)){const job=pending.get(data.id);pending.delete(data.id);data.error?job.reject(new Error(data.error.message)):job.resolve(data.result);}});
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const current=++id;pending.set(current,{resolve,reject});socket.send(JSON.stringify({id:current,method,params,...(sessionId?{sessionId}:{})}));});
  const targets=await send('Target.getTargets');const target=targets.targetInfos.find(t=>t.type==='page'&&t.url.startsWith(base+'/visual-editor'));assert.ok(target,'Own editor target exists');
  const attached=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  return{send:(method,params)=>send(method,params,attached.sessionId),close:()=>socket.close()};
}
async function touchDrag(target,from,to){
  const before=frameRead(surfaceIds(target)),first=point(item(target,before[from])+' .cms-category-handle',target!=='menu'),second=point(item(target,before[to])+(target==='menu'?' .cms-category-handle':''),false),touch=await cdp();
  try{
    await touch.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:first.x,y:first.y,id:1,radiusX:3,radiusY:3,force:1}]});
    for(let step=1;step<=10;step++)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:first.x+(second.x-first.x)*step/10,y:first.y+(second.y-first.y)*step/10,id:1,radiusX:3,radiusY:3,force:1}]});
    frameWait("!!doc.querySelector('.cms-product-drag-placeholder')");check(target+' touch drag shows live preview',frameRead(surfaceIds(target)).join(',')!==before.join(','));
    if(target==='menu')checkMenuGhost('Touch menu drag');
    run('screenshot',path.join(output,target+'-touch-drag.png'));
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    equal([...frameRead(surfaceIds(target))].sort(),[...before].sort(),target+' touch preserves all category identities');
  }finally{await touch.send('Emulation.setTouchEmulationEnabled',{enabled:false});touch.close();}
}
try{
  await launch();run('set','viewport',filterGeometry?'1519':'1560',filterGeometry?'930':'1080');
  const sessionResponse=await fetch(base+'/staff-auth.php?a=session'),sessionData=await sessionResponse.json();cookie=sessionResponse.headers.getSetCookie().find(v=>v.startsWith('cm_staff='))?.split(';')[0];assert.ok(cookie);
  const auth=await fetch(base+'/staff-auth.php?a=login',{method:'POST',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json','X-CSRF-Token':sessionData.csrfToken},body:JSON.stringify({email:fixture.email,password:fixture.password})});assert.equal(auth.ok,true);cookie=auth.headers.getSetCookie().find(v=>v.startsWith('cm_staff='))?.split(';')[0]||cookie;
  run('cookies','set','cm_staff',cookie.slice(9),'--url',base,'--httpOnly','--sameSite','Lax');csrf=(await api('pages')).csrfToken;
  const catalog=await api('products'),canonical=catalog.categories.map(c=>c.id);check('Catalog contains all 11 existing categories',canonical.length===11);
  if(filterGeometry){
    openEditor('products');start('filter');mouse({x:145,y:25});checkFilterGeometry('Desktop 1280 canvas');
    frameClick('[data-cms-category-cancel]');endWait();run('set','viewport','390','900');openEditor('products');run('click','[data-device="mobile"]');frameWait('win.innerWidth===390');run('click','#toggleLibrary');wait("document.querySelector('.library').getAnimations().every(a=>a.playState!=='running')");run('click','#reorderCategories');frameWait("doc.body.classList.contains('cms-category-reordering')");mouse({x:145,y:25});checkFilterGeometry('Mobile 390 canvas');
    throw probeComplete;
  }
  if(process.argv.includes('--menu-probe')){openEditor('products');start('menu');await drag('menu',2,0);await touchDrag('menu',0,1);throw probeComplete;}
  if(process.argv.includes('--empty-content-save')){
    const loaded=await api('load');
    equal(loaded.draft.sections.find(s=>s.source==='home:shop-categories').content,{},'Home category section starts with a real empty content object');
    await api('category-order',{page:'home',expectedVersion:loaded.version,categoryOrder:canonical});
    openEditor('home');wait("document.querySelector('#saveStatus').textContent.startsWith('✓ Saved')&&document.querySelector('#errorBanner').hidden");
    const before=await api('load'),hero=before.draft.sections.find(s=>s.source==='home:hero'),entry=Object.entries(hero.elements).find(([,e])=>e.kind==='button'&&e.text);
    assert.ok(entry,'Home exposes a real editable hero button');const [elementId,button]=entry,selector=`[data-cms-section="${hero.id}"] [data-cms-element="${elementId}"]`,edited='Shop fireworks · Save verification';
    frameClick(selector);run('click','[data-edit-text]');frameWait(`doc.querySelector(${JSON.stringify(selector)}).isContentEditable`);run('keyboard','inserttext',edited);run('press','Tab');frameWait(`win.CMCms.document().sections.find(s=>s.id===${JSON.stringify(hero.id)}).elements[${JSON.stringify(elementId)}].text===${JSON.stringify(edited)}`);run('click','#save');
    wait("document.querySelector('#saveStatus').textContent.startsWith('✓ Saved')&&document.querySelector('#errorBanner').hidden");
    const saved=await api('load');equal(saved.draft.sections.find(s=>s.id===hero.id).elements[elementId].text,edited,'Home Save draft succeeds with empty category content and saved global order');equal(saved.draft.categoryOrder,canonical,'Home Save draft preserves the authoritative category order');
    equal(saved.draft.sections.find(s=>s.source==='home:shop-categories').content,{},'Saving preserves empty category content as an object');
    run('click','#publish');run('wait','#confirmDialog[open]');run('click','#confirmAction');wait("document.querySelector('#toasts').textContent.includes('Published. The website now uses this version.')");
    const live=(await api('published')).published;equal(live.sections.find(s=>s.id===hero.id).elements[elementId].text,edited,'Home Publish succeeds after empty-content Save');equal(live.categoryOrder,canonical,'Home Publish preserves the authoritative category order');
    openEditor('home');equal(frameRead(`win.CMCms.document().sections.find(s=>s.id===${JSON.stringify(hero.id)}).elements[${JSON.stringify(elementId)}].text`),edited,'Home editor refresh preserves the successfully saved edit');
    run('open',publicBase+'/');wait(`document.querySelector(${JSON.stringify(selector)})?.textContent===${JSON.stringify(edited)}`);check('Fresh public Home renders the saved and published edit');equal(evaluate('window.CMGetCategoryOrder()'),canonical,'Fresh public Home keeps all canonical categories in saved order');
    equal(await commerce(),beforeCommerce,'Empty-content Save and Publish never modify commerce records');check('No uncaught browser errors after Home Save and Publish',(run('errors').errors||[]).length===0);check('No browser console errors after Home Save and Publish',!(run('console').messages||[]).some(m=>m.type==='error'||m.level==='error'));
    run('screenshot',path.join(output,'empty-content-published.png'));throw probeComplete;
  }
  openEditor('home');const captured=frameRead('win.CMCms.document()'),originalHomeDetails=frameRead(homeDetails);
  const loaded=await api('load'),seed=structuredClone(loaded.published||loaded.draft||captured);seed.categoryOrder=[...canonical].reverse();
  await api('publish',{page:'home',expectedVersion:loaded.version,document:seed});
  // A full navigation creates a new JS realm, so no earlier Home visit can mask a missing global fetch.
  for(const route of ['/products','/category/sparklers','/about']){
    run('open',publicBase+route);wait("!!window.CMCms&&!!window.CMGetCategoryOrder&&document.querySelectorAll('#navCatMenu>a[data-cat-id]').length===11");run('wait','--load','networkidle');
    equal(evaluate('window.CMGetCategoryOrder()'),seed.categoryOrder,'Fresh '+route+' reads global saved order');
    if(route!=='/about')equal(evaluate(filterIds.replaceAll('doc.','document.')),seed.categoryOrder,'Fresh '+route+' sidebar matches saved order');
    if(route==='/products')originalSurfaceDetails=surfaceDetails();
  }
  openEditor('home');start('grid');const before=frameRead(gridIds);const next=move(before,1,0);
  frameClick(item('grid',before[1])+' [data-cms-category-move="-1"]');frameWait(`${gridIds}.join(',')===${JSON.stringify(next.join(','))}`);
  run('click','[data-action="category-reorder-save"]');endWait();equal(await published(),next,'Save order updates public backend immediately without Publish');
  if(baseline){result={status:checks.some(c=>c.status==='FAIL')?'FAIL':'PASS',baseline:true,checks,output};}
  else{
    openEditor('home');equal(frameRead(gridIds),next,'Refreshing admin preserves saved category order');
    const beforeCancel=await api('load');start('grid');frameClick(item('grid',next[1])+' [data-cms-category-move="-1"]');run('click','[data-action="category-reorder-cancel"]');endWait();
    equal((await api('load')).draft.categoryOrder,beforeCancel.draft.categoryOrder,'Cancel leaves backend draft category order untouched');equal(await published(),next,'Cancel leaves published category order untouched');
    start('grid');await drag('grid',2,0);const pending=frameRead(gridIds);
    run('network','route','**/cms-api.php?a=category-order*','--abort');run('click','[data-action="category-reorder-save"]');wait("!document.querySelector('#errorBanner').hidden");
    check('Failed Save leaves reorder mode open for retry',frameRead("doc.body.classList.contains('cms-category-reordering')"));equal(frameRead(gridIds),pending,'Failed Save preserves current dragged order');
    run('network','unroute','**/cms-api.php?a=category-order*');run('click','[data-action="category-reorder-save"]');endWait();equal(await published(),pending,'Retry saves exact category order');
    // Clear the intentionally aborted request's browser network error before
    // checking the remaining real storefront and editor interactions.
    run('console','--clear');run('errors','--clear');
    openEditor('products');start('filter');const filterBefore=frameRead(filterIds);frameClick(item('filter',filterBefore[1])+' [data-cms-category-move="-1"]');const filterNext=frameRead(filterIds);run('click','[data-action="category-reorder-save"]');endWait();equal(await published(),filterNext,'Sidebar Save publishes same global order');
    start('menu');await drag('menu',2,0);await touchDrag('menu',0,1);const menuNext=frameRead(menuIds);run('click','[data-action="category-reorder-save"]');endWait();equal(await published(),menuNext,'Mega-menu Save publishes same global order');
    run('set','viewport','390','900');openEditor('home');run('click','[data-device="mobile"]');frameWait('win.innerWidth===390');start('grid');
    const mobileBefore=frameRead(gridIds),first=point(item('grid',mobileBefore[0])+' .cms-category-handle'),second=point(item('grid',mobileBefore[1]),false),touch=await cdp();
    try{
      await touch.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
      await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:first.x,y:first.y,id:1,radiusX:3,radiusY:3,force:1}]});
      for(let step=1;step<=10;step++)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:first.x+(second.x-first.x)*step/10,y:first.y+(second.y-first.y)*step/10,id:1,radiusX:3,radiusY:3,force:1}]});
      frameWait("!!doc.querySelector('.cms-product-drag-placeholder')");check('Mobile touch drag shows live preview',frameRead(gridIds).join(',')!==mobileBefore.join(','));
      await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }finally{touch.close();}
    const mobileNext=frameRead(gridIds);equal([...mobileNext].sort(),[...canonical].sort(),'Mobile touch preserves all 11 category identities');
    check('Mobile reorder canvas has no horizontal overflow',frameRead('doc.documentElement.scrollWidth<=win.innerWidth+1'));
    check('Mobile move controls have usable touch targets',frameRead("Array.from(doc.querySelectorAll('[data-cms-category-move]')).every(n=>n.getBoundingClientRect().height>=44&&n.getBoundingClientRect().width>=44)"));
    run('screenshot',path.join(output,'mobile-reorder.png'));frameClick('[data-cms-category-save]');endWait();equal(await published(),mobileNext,'Mobile Save publishes touch order');
    openEditor('products');run('click','#toggleLibrary');wait("document.querySelector('.library').getAnimations().every(a=>a.playState!=='running')&&document.querySelector('.library').getBoundingClientRect().left>=-1");run('click','#reorderCategories');frameWait("doc.body.classList.contains('cms-category-reordering')&&doc.querySelectorAll('#filterCol .cms-category-position').length===11");
    check('Mobile Reorder Categories opens all 11 Products sidebar categories',frameRead(filterIds).length===11);
    check('Mobile category editor stays visible within the canvas',frameRead("(()=>{const r=doc.querySelector('#filterCol').getBoundingClientRect();return r.left>=-1&&r.right<=win.innerWidth+1&&r.width>0;})()"));
    const mobileFilterBefore=frameRead(filterIds);frameClick(item('filter',mobileFilterBefore[1])+' [data-cms-category-move="-1"]');check('Mobile sidebar move previews its new category order',frameRead(filterIds)[0]===mobileFilterBefore[1]);frameClick('[data-cms-category-cancel]');endWait();equal(await published(),mobileNext,'Mobile sidebar Cancel leaves the published order untouched');
    for(const route of ['/products','/category/sparklers']){run('open',publicBase+route);wait("!!window.CMGetCategoryOrder&&document.querySelectorAll('#filterCol input[data-fcat]').length===11");run('wait','--load','networkidle');equal(evaluate('window.CMGetCategoryOrder()'),mobileNext,'Mobile fresh '+route+' matches saved order');}
    run('set','viewport','1560','1080');run('open',publicBase+'/products');wait("document.querySelectorAll('#filterCol input[data-fcat]').length===11");run('wait','--load','networkidle');
    equal(evaluate(menuIds.replaceAll('doc.','document.')),mobileNext,'Desktop refreshed mega-menu matches final order');equal(evaluate(filterIds.replaceAll('doc.','document.')),mobileNext,'Desktop refreshed sidebar matches final order');
    run('click','#filterCol input[data-fcat][value="sparklers"]');wait("document.querySelectorAll('.shop-main .prod-card').length>0&&document.querySelector('#filterCol input[value=sparklers]').checked");run('wait','--load','networkidle');
    const eligible=catalog.products.filter(p=>p.cats.includes('sparklers')).map(p=>String(p.id));check('Sidebar filtering still selects only products in its category',evaluate("Array.from(document.querySelectorAll('.shop-main .prod-card')).map(n=>n.dataset.id)").every(id=>eligible.includes(id)));
    const finalSurfaceDetails=surfaceDetails();check('All category links retain canonical URL and ID',finalSurfaceDetails.menu.every(n=>n.href==='/category/'+n.id),finalSurfaceDetails.menu);
    equal(finalSurfaceDetails,originalSurfaceDetails,'Category names, links and product counts remain attached to their category IDs');
    run('click','.nav-links > a[data-nav="/"]');wait("document.querySelectorAll('.home-category-card').length===11");run('wait','--load','networkidle');
    equal(evaluate(homeDetails.replaceAll('doc.','document.')),originalHomeDetails,'SPA navigation back Home preserves category names, counts and links');
    equal(evaluate(gridIds.replaceAll('doc.','document.')),mobileNext,'SPA navigation back Home preserves saved category order');
    equal(await commerce(),beforeCommerce,'Product, count source, category membership and catalog records are byte-identical');
    check('No uncaught browser errors',(run('errors').errors||[]).length===0);check('No browser console errors',!(run('console').messages||[]).some(m=>m.type==='error'||m.level==='error'));
    result={status:'PASS',checks,output,fixtureUrl:base};
  }
}catch(error){if(error===probeComplete)result={status:'PASS',checks,output,fixtureUrl:base,...(filterGeometry?{filterGeometry:true}:process.argv.includes('--empty-content-save')?{emptyContentSave:true}:{menuProbe:true})};else{try{run('screenshot',path.join(output,'failure.png'));}catch{}result={status:'FAIL',checks,output,error:error.stack};throw error;}
}finally{
  try{run('close');}catch{}
  for(const [file,bytes] of originals){if(bytes===null)await unlink(file).catch(error=>{if(error.code!=='ENOENT')throw error;});else await writeFile(file,bytes);}
  if(result){await writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));await writeFile(filterGeometry?'audit/category-filter-geometry-results.json':process.argv.includes('--menu-probe')?'audit/category-menu-drag-results.json':process.argv.includes('--empty-content-save')?'audit/category-empty-content-save-results.json':'audit/category-save-live-browser-results.json',JSON.stringify(result,null,2));}
}
if(result?.status==='FAIL')process.exitCode=1;
