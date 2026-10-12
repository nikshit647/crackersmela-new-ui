import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';

const fixture=JSON.parse(await readFile(process.env.CM_CMS_FIXTURE||'audit-evidence/cms-shared-navigation-fixture.json','utf8'));
const base=fixture.baseUrl,publicBase=fixture.publicUrl;
for(const url of [base,publicBase])assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname));
assert.equal((await(await fetch(base+'/__fixture-health')).json()).isolated,true);
const binary=path.join(process.env.APPDATA,'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const session='shared-navigation-'+Date.now(),namespace='cms-shared-navigation-qa';
const output=path.resolve('audit-evidence/shared-navigation-browser-'+Date.now());await mkdir(output,{recursive:true});
const checks=[];
const run=(...args)=>{const response=JSON.parse(execFileSync(binary,['--pin-tab','--namespace',namespace,'--session',session,...args,'--json'],{encoding:'utf8',windowsHide:true,timeout:45000,maxBuffer:10*1024*1024}));assert.equal(response.success,true,response.error);return response.data;};
const evaluate=code=>run('eval','-b',Buffer.from(code).toString('base64')).result;
const wait=code=>run('wait','--fn',code);
const frameRead=code=>evaluate(`(()=>{const win=document.querySelector('#siteFrame').contentWindow,doc=win.document;return (${code});})()`);
const frameWait=code=>wait(`(()=>{const win=document.querySelector('#siteFrame')?.contentWindow,doc=win?.document;return !!doc&&(${code});})()`);
const point=selector=>evaluate(`(()=>{const frame=document.querySelector('#siteFrame'),node=frame.contentDocument.querySelector(${JSON.stringify(selector)});node.scrollIntoView({block:'center',behavior:'instant'});const a=node.getBoundingClientRect(),b=frame.getBoundingClientRect(),scale=b.width/frame.offsetWidth;return{x:b.left+(a.left+a.width/2)*scale,y:b.top+(a.top+a.height/2)*scale};})()`);
const frameClick=selector=>{const p=point(selector);run('mouse','move',String(Math.round(p.x)),String(Math.round(p.y)));run('mouse','down');run('mouse','up');};
const check=(name,pass=true)=>{assert.ok(pass,name);checks.push({name,status:'PASS'});console.log('PASS: '+name);};
const saved=()=>wait("document.querySelector('#saveStatus').textContent.startsWith('✓ Saved')&&document.querySelector('#errorBanner').hidden");
const openEditor=page=>{run('open',base+'/visual-editor?page='+page);frameWait(`win.CMCms?.page()===${JSON.stringify(page)}&&doc.body.classList.contains('cms-editing')`);wait("document.querySelector('#loading').hidden");saved();};
const publish=()=>{run('click','#publish');wait("document.querySelector('#confirmDialog').open");run('click','#confirmAction');wait("!document.querySelector('#confirmDialog').open&&!document.querySelector('#publish').disabled&&document.querySelector('#errorBanner').hidden");};
const launch=()=>new Promise((resolve,reject)=>{
  const child=spawn(binary,['--pin-tab','--namespace',namespace,'--session',session,'open',base,'--json'],{windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='',settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);child.stdout.destroy();child.stderr.destroy();child.unref();error?reject(error):resolve(value);};
  const timer=setTimeout(()=>finish(new Error('Browser launch timeout: '+stderr)),45000);
  child.stdout.on('data',chunk=>{stdout+=chunk;try{const response=JSON.parse(stdout);finish(response.success?null:new Error(response.error),response.data);}catch{}});
  child.stderr.on('data',chunk=>{stderr+=chunk;});child.on('error',error=>finish(error));child.on('exit',code=>{if(!settled)finish(new Error('Browser launch exited '+code+': '+stdout+stderr));});
});
const label='Shop crackers',label2='Crackers store';
let result;
try{
  await launch();run('set','viewport','1560','1080');
  const sessionResponse=await fetch(base+'/staff-auth.php?a=session'),sessionData=await sessionResponse.json();
  const cookie=sessionResponse.headers.getSetCookie().find(value=>value.startsWith('cm_staff='))?.split(';')[0];assert.ok(cookie);
  const login=await fetch(base+'/staff-auth.php?a=login',{method:'POST',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json','X-CSRF-Token':sessionData.csrfToken},body:JSON.stringify({email:fixture.email,password:fixture.password})});assert.equal(login.ok,true);
  const auth=login.headers.getSetCookie().find(value=>value.startsWith('cm_staff='))?.split(';')[0]||cookie;
  run('cookies','set','cm_staff',auth.slice(9),'--url',base,'--httpOnly','--sameSite','Lax');
  openEditor('home');
  frameClick('#navbar .nav-link[data-nav="/"]');run('click','[data-advanced]');
  run('fill','[data-field="text"][data-scope="element"]',label);run('fill','[data-field="href"][data-scope="element"]','#/products');run('press','Tab');saved();
  frameWait(`doc.querySelector('#navbar .nav-link[data-nav="/"]').textContent.trim()===${JSON.stringify(label)}`);
  check('header text and link edit through actual visual editor controls');
  openEditor('products');check('Products editor loads the same saved shared draft',frameRead("doc.querySelector('#navbar .nav-link[data-nav="+JSON.stringify('/')+"]').textContent.trim()")===label);
  publish();check('shared header publishes from another page');
  openEditor('about');frameClick('#navbar .nav-link[data-nav="/"]');run('click','[data-advanced]');run('fill','[data-field="text"][data-scope="element"]',label2);run('press','Tab');saved();publish();
  check('header edited from About saves and publishes globally');
  openEditor('home');check('Home editor refresh shows About header edit',frameRead("doc.querySelector('#navbar .nav-link[data-nav="+JSON.stringify('/')+"]').textContent.trim()")===label2);
  publish();check('publishing clean Home retains the newer shared navigation');
  run('console','--clear');run('errors','--clear');
  for(const route of ['/','/products','/category/sparklers','/about','/contact','/#/cart','/#/wishlist','/#/track']){
    run('open',publicBase+route);run('wait','--load','networkidle');wait(`document.querySelector('#navbar .nav-link[data-nav="/"]')?.textContent.trim()===${JSON.stringify(label2)}`);
    check('fresh desktop '+route+' uses shared header',evaluate("document.querySelector('#navbar .nav-link[data-nav="+JSON.stringify('/')+"]').getAttribute('href')")==='#/products');
    if(route==='/products')check('commerce page content survives shared header application',evaluate("document.querySelectorAll('.shop-main .prod-card').length>0"));
    if(route==='/#/cart')check('cart content stays application-owned',evaluate("document.querySelector('#view').textContent.toLowerCase().includes('cart')"));
  }
  run('open',publicBase+'/about');wait(`document.querySelector('#navbar .nav-link[data-nav="/"]')?.textContent.trim()===${JSON.stringify(label2)}`);run('click','#navbar .nav-link[data-nav="/"]');wait("document.querySelectorAll('.shop-main .prod-card').length>0");check('edited desktop navigation link still navigates to products');
  run('screenshot',path.join(output,'desktop-shared-header.png'));
  run('set','viewport','390','900');
  for(const route of ['/products','/about','/#/cart']){
    run('open',publicBase+route);run('wait','--load','networkidle');wait(`document.querySelector('#navbar .nav-link[data-nav="/"]')?.textContent.trim()===${JSON.stringify(label2)}`);run('click','#mobileToggle');wait("document.querySelector('#mobileDrawer').getAttribute('aria-hidden')==='false'");
    wait("document.querySelector('#mobileDrawer .mobile-drawer__panel').getAnimations({subtree:true}).every(animation=>animation.playState!=='running')");
    check('mobile '+route+' drawer projects the shared navigation edit',evaluate(`Array.from(document.querySelectorAll('#mobileDrawer .mobile-nav-link')).some(node=>node.textContent.trim()===${JSON.stringify(label2)}&&node.getAttribute('href')==='#/products')`));
    check('mobile '+route+' keeps additional drawer links',evaluate("Array.from(document.querySelectorAll('#mobileDrawer .mobile-nav-link')).some(node=>node.textContent.trim()==='Track Order')"));
    check('mobile '+route+' has no horizontal page overflow',evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    check('mobile '+route+' drawer settles fully inside viewport',evaluate("document.querySelector('#mobileDrawer .mobile-drawer__panel').getBoundingClientRect().left>=0"));
    run('screenshot',path.join(output,'mobile-shared-header.png'));
    run('click','#mobileDrawer .drawer-head [data-close-drawer]');wait("document.querySelector('#mobileDrawer').getAttribute('aria-hidden')==='true'");
  }
  check('no uncaught browser errors',(run('errors').errors||[]).length===0);
  check('no browser console errors',!(run('console').messages||[]).some(message=>message.type==='error'||message.level==='error'));
  result={status:'PASS',checks,output};
}catch(error){result={status:'FAIL',error:error.stack,checks,output};throw error;}
finally{await writeFile('audit/cms-shared-navigation-browser-results.json',JSON.stringify(result,null,2)+'\n');try{run('close');}catch{}}
