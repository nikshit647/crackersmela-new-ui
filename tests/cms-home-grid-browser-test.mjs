import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';

// Backward-compatibility browser case: a real legacy Home document has shared
// columns=4, while the native storefront supplies its mobile two-column layout.
const fixture=JSON.parse(await readFile(process.env.CM_CMS_FIXTURE||'audit-evidence/cms-responsive-fixture.json','utf8'));
const base=fixture.baseUrl;
for(const value of [base,fixture.publicUrl]){const url=new URL(value);assert.ok(['127.0.0.1','localhost'].includes(url.hostname)&&url.protocol==='http:');}
const health=await(await fetch(base+'/__fixture-health')).json();assert.equal(health.isolated,true);assert.equal(health.mail,'disabled');
const binary=process.platform==='win32'?path.join(process.env.APPDATA,'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe'):'agent-browser';
const session=process.env.CM_CMS_BROWSER_SESSION||'cms-home-grid-20261005';
const run=(...args)=>{const response=JSON.parse(execFileSync(binary,['--session',session,...args,'--json'],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024}));assert.equal(response.success,true,response.error);return response.data;};
const evaluate=code=>run('eval','-b',Buffer.from(code).toString('base64')).result;
const wait=code=>run('wait','--fn',code);
const output=path.resolve('audit-evidence/cms-home-grid-'+Date.now());await mkdir(output,{recursive:true});
const checks=[];const check=(name,condition)=>{assert.ok(condition,name);checks.push({name,status:'PASS'});console.log('PASS: '+name);};
const sr=await fetch(base+'/staff-auth.php?a=session',{headers:{Connection:'close'},signal:AbortSignal.timeout(15000)}),sd=await sr.json();
let cookie=sr.headers.getSetCookie().find(value=>value.startsWith('cm_staff='))?.split(';')[0];assert.ok(cookie);
const login=await fetch(base+'/staff-auth.php?a=login',{method:'POST',headers:{Connection:'close',Cookie:cookie,Origin:base,'Content-Type':'application/json','X-CSRF-Token':sd.csrfToken},body:JSON.stringify({email:fixture.email,password:fixture.password})});assert.equal(login.status,200);
cookie=login.headers.getSetCookie().find(value=>value.startsWith('cm_staff='))?.split(';')[0]||cookie;const auth=await login.json();
const api=async(action,body)=>{const response=await fetch(base+'/cms-api.php?a='+action+(body?'':'&page=home'),{signal:AbortSignal.timeout(15000),method:body?'POST':'GET',headers:{Connection:'close',Cookie:cookie,Origin:base,'Content-Type':'application/json','X-CSRF-Token':auth.csrfToken},...(body?{body:JSON.stringify(body)}:{})});const value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value;};
let previous;
try{
  await new Promise((resolve,reject)=>{const child=spawn(binary,['--session',session,'open',fixture.publicUrl+'/'],{stdio:'ignore',windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Browser launch failed')));});
  run('open',fixture.publicUrl+'/');run('set','viewport','1280','1000');wait("window.CMCms?.baseline()?.sections?.some(s=>s.source==='home:new-arrivals')");
  previous=await api('load');const legacy=evaluate('window.CMCms.baseline()');
  const section=legacy.sections.find(item=>item.source==='home:new-arrivals');assert.ok(section);section.content.columns=4;delete section.overrides;
  const selector='[data-cms-section="'+section.id+'"] .prod-grid';
  const publish=async document=>{const current=await api('load');const saved=await api('save',{page:'home',expectedVersion:current.version,document});await api('publish',{page:'home',expectedVersion:saved.version});run('open',fixture.publicUrl+'/');wait(`window.CMCms?.document()?.sections?.some(s=>s.id===${JSON.stringify(section.id)}&&s.content.columns===4)`);};
  const columns=()=>evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(selector)})).gridTemplateColumns.split(' ').length`);
  await publish(legacy);run('set','viewport','1280','1000');check('Legacy Home keeps its saved four Desktop columns',columns()===4);
  for(const width of [360,375,390,412,425]){run('set','viewport',String(width),'1000');run('open',fixture.publicUrl+'/');wait(`window.CMCms?.document()?.sections?.some(s=>s.id===${JSON.stringify(section.id)}&&s.content.columns===4)`);check('Legacy Home uses native two columns at '+width+'px',columns()===2);}
  evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start',behavior:'instant'})`);
  run('screenshot',path.join(output,'legacy-mobile-two-columns.png'));
  section.overrides={mobile:{content:{columns:3}}};await publish(legacy);run('set','viewport','390','1000');check('Explicit Mobile column override remains authoritative',columns()===3);
  run('set','viewport','1280','1000');check('Explicit Mobile column override does not change Desktop',columns()===4);
  delete section.overrides;await publish(legacy);run('set','viewport','375','1000');check('Removing Mobile override restores native two columns',columns()===2);
  await writeFile('audit/cms-home-grid-browser-results.json',JSON.stringify({status:'PASS',checks,output},null,2));
}catch(error){try{run('screenshot',path.join(output,'failure.png'));}catch{}await writeFile('audit/cms-home-grid-browser-results.json',JSON.stringify({status:'FAIL',checks,error:error.stack,output},null,2));throw error;}
finally{
  // Restore the pre-test publication and draft without ever touching catalog data.
  if(previous?.published){const current=await api('load');const restored=await api('save',{page:'home',expectedVersion:current.version,document:previous.published});await api('publish',{page:'home',expectedVersion:restored.version});}
  if(previous?.draft){const current=await api('load');await api('save',{page:'home',expectedVersion:current.version,document:previous.draft});}
  run('close');
}
