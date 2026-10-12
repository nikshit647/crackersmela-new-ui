import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import path from 'node:path';

const fixture=JSON.parse(await readFile(process.env.CM_CMS_FIXTURE||'audit-evidence/cms-fixture-active.json','utf8'));
const base=fixture.baseUrl,publicBase=fixture.publicUrl;
assert.equal(new URL(base).port,'4314','Only our isolated editor fixture may be used');
for(const url of [base,publicBase])assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname));
assert.equal((await(await fetch(base+'/__fixture-health')).json()).isolated,true);
const binary=path.join(process.env.APPDATA,'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const session='global-editor-'+Date.now(),namespace='cms-global-editor-qa';
const output=path.resolve('audit-evidence/global-editor-browser-'+Date.now());await mkdir(output,{recursive:true});
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
const dataRoot=path.resolve(fixture.fixture,'data');
const originals=new Map();
for(const name of ['cms-pages/home.json','cms-pages/products.json','cms-global-header.json','cms-global-components.json']) {
  const file=path.join(dataRoot,name);originals.set(file,await readFile(file).catch(error=>{if(error.code==='ENOENT')return null;throw error;}));
}
let result;
try {
  await launch();run('set','viewport','1560','1080');
  const sessionResponse=await fetch(base+'/staff-auth.php?a=session'),sessionData=await sessionResponse.json();
  const cookie=sessionResponse.headers.getSetCookie().find(value=>value.startsWith('cm_staff='))?.split(';')[0];assert.ok(cookie);
  const login=await fetch(base+'/staff-auth.php?a=login',{method:'POST',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json','X-CSRF-Token':sessionData.csrfToken},body:JSON.stringify({email:fixture.email,password:fixture.password})});assert.equal(login.ok,true);
  const auth=login.headers.getSetCookie().find(value=>value.startsWith('cm_staff='))?.split(';')[0]||cookie;
  run('cookies','set','cm_staff',auth.slice(9),'--url',base,'--httpOnly','--sameSite','Lax');
  openEditor('products');run('console','--clear');run('errors','--clear');run('click','[data-nav="sections"]');
  check('Global tree lists exactly Promo Bar, Header / Navigation and Footer',evaluate("JSON.stringify(Array.from(document.querySelectorAll('.global-layer-group [data-select-section]')).map(n=>n.textContent.trim().replace(/All pages$/, '').trim()))")===JSON.stringify(['Promo Bar','Header / Navigation','Footer']));
  check('Page tree excludes all global components',evaluate("document.querySelectorAll('.page-layer-group [data-global-component]').length===0&&document.querySelectorAll('.page-layer-group [data-section-row]').length>0"));
  check('Global rows have no drag handles or copy/delete/move controls',evaluate("Array.from(document.querySelectorAll('.global-layer-group [data-section-row]')).every(n=>!n.draggable&&!n.querySelector('[data-section-action=duplicate],[data-section-action=copy],[data-section-action=delete],[data-section-action=up],[data-section-action=down]'))"));
  const documentBefore=frameRead('win.CMCms.document()');
  for(const role of ['promo','header','footer']) {
    run('click',`[data-select-section="global:${role}"]`);
    wait(`document.querySelector('#inspector [data-global-scope="${role}"]')?.textContent.includes('Changes apply to all pages')`);
    check(role+' selection clearly indicates Global Component');
    check(role+' remains hideable',evaluate("!!document.querySelector('#inspector [data-scope=visibility],#inspector [data-section-action=visibility]')"));
    check(role+' cannot be structurally duplicated or deleted',evaluate("Array.from(document.querySelectorAll('#inspector [data-section-action=duplicate],#inspector [data-section-action=delete],#inspector [data-section-action=up],#inspector [data-section-action=down]')).every(n=>n.disabled)"));
  }
  check('Selecting and inspecting globals preserves every page section',JSON.stringify(frameRead('win.CMCms.document()'))===JSON.stringify(documentBefore));
  frameClick('#navbar .nav-link[data-nav="/"]');
  wait("document.querySelector('#inspector [data-global-scope=header]')&&document.querySelector('#inspector [data-edit-text]')");
  check('Nested navigation text retains the global scope indicator');
  run('scrollintoview','[data-advanced]');
  run('click','[data-advanced]');
  check('Advanced nested navigation controls retain the global scope indicator',evaluate("!!document.querySelector('#inspector [data-global-scope=header]')&&!!document.querySelector('[data-field=text][data-scope=element]')"));
  run('screenshot',path.join(output,'desktop-header-global.png'));
  frameClick('.footer-brand p');
  check('Nested footer text retains the global scope indicator',evaluate("!!document.querySelector('#inspector [data-global-scope=footer]')"));
  run('click','[data-nav="sections"]');run('click','[data-select-section="global:promo"]');
  check('Promo panel describes whole-website publishing',evaluate("document.querySelector('#inspector').textContent.includes('Publish to update your entire website.')&&!document.querySelector('#inspector').textContent.includes('on this page')"));
  run('click','#publish');wait("document.querySelector('#confirmDialog').open");
  check('Publish confirmation covers both current page and shared components',evaluate("document.querySelector('#confirmMessage').textContent.includes('apply to all pages')&&document.querySelector('#confirmAction').textContent.includes('globals')"));
  run('click','#confirmDialog button[value=cancel]');
  run('set','viewport','390','900');openEditor('products');run('click','[data-device=mobile]');frameWait('win.innerWidth===390');
  run('click','#toggleLibrary');wait("document.querySelector('.library').getAnimations().every(a=>a.playState!=='running')");run('click','[data-nav=sections]');
  wait("!!document.querySelector('.global-layer-group')");
  check('Mobile global tree contains all three readable rows without horizontal scrolling',evaluate("(()=>{const g=document.querySelector('.global-layer-group'),rows=[...g.querySelectorAll('[data-section-row]')];return rows.length===3&&g.scrollWidth<=g.clientWidth+1&&rows.every(n=>n.getBoundingClientRect().width<=g.clientWidth+1);})()"));
  run('screenshot',path.join(output,'mobile-global-tree.png'));
  run('click','[data-select-section="global:promo"]');
  wait("document.querySelector('#editor').classList.contains('show-inspector')");
  wait("document.querySelector('#inspector').getAnimations().every(a=>a.playState!=='running')");
  check('Selecting a global component on mobile opens its editing controls');
  check('Mobile scope indicator is visible inside the viewport',evaluate("(()=>{const r=document.querySelector('[data-global-scope=promo]').getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth+1;})()"));
  run('screenshot',path.join(output,'mobile-promo-global.png'));
  check('No uncaught browser errors',(run('errors').errors||[]).length===0);
  check('No browser console errors',!(run('console').messages||[]).some(message=>message.type==='error'||message.level==='error'));
  result={status:'PASS',checks,output,liveWrites:false};
} catch(error) {try{run('screenshot',path.join(output,'failure.png'));}catch{}result={status:'FAIL',error:error.stack,checks,output,liveWrites:false};throw error;}
finally {
  try{run('close');}catch{}
  for(const [file,bytes] of originals) {if(bytes===null)await unlink(file).catch(error=>{if(error.code!=='ENOENT')throw error;});else await writeFile(file,bytes);}
  await writeFile('audit/cms-global-editor-browser-results.json',JSON.stringify(result,null,2)+'\n');
}
