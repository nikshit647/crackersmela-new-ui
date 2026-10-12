import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const fixture=JSON.parse(readFileSync('audit-evidence/cms-fixture-active.json','utf8'));
const binary=path.join(process.env.APPDATA,'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const session=process.env.CM_BROWSER_SESSION||'email-regression-1009';
const run=(...args)=>{const r=JSON.parse(execFileSync(binary,['--session',session,...args,'--json'],{encoding:'utf8',windowsHide:true,timeout:45000,maxBuffer:2e6}));assert.ok(r.success,r.error);return r.data;};
const evaluate=code=>run('eval','-b',Buffer.from(code).toString('base64')).result;
const activate=selector=>{run('focus',selector);run('press','Enter');};
const checks=[];
try{
 await new Promise((resolve,reject)=>{const process=spawn(binary,['--session',session,'open','about:blank'],{stdio:'ignore',windowsHide:true});process.once('error',reject);process.once('exit',code=>code===0?resolve():reject(new Error('Browser launch failed')));});
 run('open',fixture.baseUrl+'/?watch=0#/staff');run('wait','--fn','!!document.querySelector("#goAuthStaff") || !!document.querySelector("#adminShell")');run('wait','--load','networkidle');
 run('set','viewport','1600','1000');
 evaluate(`window.__qaRequests=[];const originalFetch=window.fetch;window.fetch=async(...args)=>{const r=await originalFetch(...args);const body=await r.clone().json().catch(()=>({}));window.__qaRequests.push({url:String(args[0]),status:r.status,ok:body.ok,authenticated:body.authenticated,code:body.code,role:body.role});return r;};`);
 if(evaluate('!!document.querySelector("#goAuthStaff")')){run('click','#goAuthStaff');run('wait','--fn',`document.querySelector('#authModal').getAnimations({subtree:true}).every(a=>a.playState==='finished')`);run('fill','#auEmail',fixture.email);run('fill','#auPass',fixture.password);run('focus','#auSubmit');run('press','Enter');run('wait','--text','Dashboard');}run('click','[data-panel="email-automation"]');
 run('wait','[data-ce-tab="templates"]');activate('[data-ce-tab="templates"]');run('wait','--text','Preview up to date');
 const events=evaluate('[...document.querySelectorAll("[data-ce-pick]")].map(e=>e.dataset.cePick)');assert.equal(events.length,8);
 for(const event of events){
  activate(`[data-ce-pick="${event}"]`);run('wait','--text','Preview up to date');
  const fields=evaluate('[...document.querySelectorAll("[data-ce-field]")].map(e=>({key:e.dataset.ceField,value:e.value}))');
  assert.ok(fields.find(x=>x.key==='subject').value,event+' subject');assert.ok(fields.find(x=>x.key==='body').value,event+' body');
  assert.ok(evaluate('document.querySelector("iframe.cm-email__preview").srcdoc.length')>3000,event+' real HTML preview');checks.push({event,pass:true});
 }
 run('fill','#ce-tpl-heading','Preview heading check');run('wait','--fn','document.querySelector("iframe.cm-email__preview").srcdoc.includes("Preview heading check")');
 assert.match(evaluate('document.querySelector("[data-ce-dirty]").textContent'),/Unsaved/);checks.push({name:'Typing updates shared HTML preview and dirty state',pass:true});
 run('click','[data-ce-pick="ORDER_PLACED"]');run('dialog','dismiss');assert.equal(evaluate('document.querySelector("#ce-tpl-heading").value'),'Preview heading check');
 run('click','[data-ce-pick="ORDER_PLACED"]');run('dialog','accept');run('wait','--fn','document.querySelector("#ce-tpl-heading").value!=="Preview heading check"');run('wait','--text','Preview up to date');checks.push({name:'Discard confirmation preserves then discards only draft',pass:true});
 // Exercise UI persistence only when this fixture event has no saved customization.
 const saved=evaluate(`(async()=>{const r=await fetch('email-api.php?a=templates');return (await r.json()).templates.ORDER_UPDATED||null;})()`);
 if(!saved){
  activate('[data-ce-pick="ORDER_UPDATED"]');run('wait','--text','Preview up to date');
  const originalHeading=evaluate('document.querySelector("#ce-tpl-heading").value');
  run('fill','#ce-tpl-heading','Local preview persistence check');activate('[data-ce-save-template]');
  run('wait','--fn','document.querySelector("[data-ce-dirty]").textContent.includes("Saved")');
  activate('[data-ce-reload-templates]');run('wait','--text','Preview up to date');
  assert.equal(evaluate('document.querySelector("#ce-tpl-heading").value'),'Local preview persistence check');
  checks.push({name:'Template saves through UI and persists after reload',pass:true});
  run('click','[data-ce-reset-template]');run('dialog','dismiss');assert.equal(evaluate('document.querySelector("#ce-tpl-heading").value'),'Local preview persistence check');
  run('click','[data-ce-reset-template]');run('dialog','accept');run('wait','--fn',`document.querySelector('#ce-tpl-heading').value===${JSON.stringify(originalHeading)}`);
  assert.equal(evaluate(`(async()=>{const r=await fetch('email-api.php?a=templates');return !!(await r.json()).templates.ORDER_UPDATED;})()`),false);
  checks.push({name:'Reset requires confirmation and restores original message',pass:true});
 }
 run('set','viewport','390','844');
 run('wait','--fn',`document.querySelector('#adminShell').getAnimations({subtree:true}).filter(a=>a.effect.getTiming().iterations!==Infinity).every(a=>a.playState==='finished')`);
 evaluate('window.scrollTo(0,0)');
 const width=evaluate('({page:document.documentElement.scrollWidth,viewport:innerWidth})');assert.ok(width.page<=width.viewport+1,JSON.stringify(width));checks.push({name:'390px layout has no page overflow',pass:true});
 run('screenshot','audit-evidence/email-editor-mobile.png');
 assert.equal((run('errors').errors||[]).length,0);checks.push({name:'No browser exceptions',pass:true});
}catch(error){console.error(error);try{console.log(JSON.stringify(run('snapshot','-i')));console.log(JSON.stringify(run('errors')));}catch{}throw error;}
finally{writeFileSync('audit/email-template-browser-results.json',JSON.stringify({checks},null,2));if(!process.env.CM_BROWSER_SESSION)try{run('close');}catch{}}
console.log(JSON.stringify({passed:checks.length,total:checks.length}));
