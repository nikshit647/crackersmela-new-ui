import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';

// Production verification deliberately creates only a temporary editorial page.
// The server-issued session is revoked by the deployment operator after QA.
const origin='https://admin.crackersmela.com';
const publicOrigin='https://crackersmela.com';
const credential=JSON.parse(await readFile('audit-evidence/live-editor-session.json','utf8'));
const binary=path.join(process.env.APPDATA,'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const session='cm-editor-live-check';
const output=path.resolve('audit-artifacts/visual-editor');await mkdir(output,{recursive:true});
const checks=[];let customId;
const run=(...args)=>{const result=JSON.parse(execFileSync(binary,['--session',session,...args,'--json'],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024}));assert.ok(result.success,result.error);return result.data;};
const evaluate=code=>run('eval','-b',Buffer.from(code).toString('base64')).result;
const wait=code=>run('wait','--fn',code);
const check=(name,condition=true)=>{assert.ok(condition,name);checks.push({name,status:'PASS'});console.log('PASS: '+name);};
const click=selector=>run('click',selector);
const fill=(selector,value)=>run('fill',selector,value);
const save=()=>wait("document.querySelector('#saveStatus').textContent.startsWith('✓ Saved')&&document.querySelector('#errorBanner').hidden");
const frameRead=code=>evaluate(`(()=>{const win=document.querySelector('#siteFrame').contentWindow,doc=win.document;return (${code});})()`);
const frameWait=code=>wait(`(()=>{const win=document.querySelector('#siteFrame')?.contentWindow,doc=win?.document;return !!doc&&(${code});})()`);
const point=selector=>evaluate(`(()=>{const frame=document.querySelector('#siteFrame'),doc=frame.contentDocument,e=doc.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getClientRects()[0],f=frame.getBoundingClientRect(),scale=f.width/frame.offsetWidth;return{x:f.left+(r.left+r.width/2)*scale,y:f.top+(r.top+r.height/2)*scale};})()`);
const frameClick=selector=>{const p=point(selector);run('mouse','move',String(p.x),String(p.y));run('mouse','down');run('mouse','up');};
const confirm=()=>{run('wait','#confirmDialog[open]');click('#confirmAction');};
try{
  await new Promise((resolve,reject)=>{const p=spawn(binary,['--session',session,'open',origin+'/visual-editor'],{stdio:'ignore',windowsHide:true});p.once('error',reject);p.once('exit',code=>code===0?resolve():reject(new Error('Browser launch failed')));});
  run('set','viewport','1600','1000');
  run('cookies','set','cm_staff',credential.cookie,'--url',origin,'--httpOnly','--secure','--sameSite','Strict');
  run('open',origin+'/visual-editor');wait("document.querySelector('#loading')?.hidden&&document.querySelector('#siteFrame').contentWindow.CMCms?.page()==='home'");save();
  check('Live authenticated editor loads the actual Home storefront',frameRead('doc.querySelectorAll(".prod-card").length>0'));
  run('screenshot',path.join(output,'live-editor-home.png'));
  click('[data-nav="pages"]');click('[data-page-create]');fill('#newPageName','Editor workflow check');fill('#newPageSlug','editor-workflow-check-20261004');click('#pageFormSubmit');
  wait("!document.querySelector('#pageDialog').open&&document.querySelector('#pageTitle').textContent==='Editor workflow check'&&document.querySelector('#loading').hidden");save();
  customId=frameRead('win.CMCms.page()');check('A real new page is created in the existing website',customId.startsWith('custom-'));
  const heading='[data-cms-element="content-heading"]';frameClick(heading);click('[data-edit-text]');frameWait(`doc.querySelector('${heading}').isContentEditable`);run('keyboard','inserttext','Visual editing is live');run('press','Tab');frameWait(`doc.querySelector('${heading}').textContent==='Visual editing is live'`);
  run('select','[data-field="fontFamily"][data-scope="style"]','Sora');fill('[data-simple-style="fontSize"]','42');
  evaluate("(()=>{const i=document.querySelector('[data-field=color][data-scope=style]');i.value='#1565c0';i.dispatchEvent(new Event('input',{bubbles:true}));return true;})()");save();
  check('Live inline text, font, size and color save successfully',frameRead(`win.getComputedStyle(doc.querySelector('${heading}')).fontSize==='42px'`));
  click('#preview');check('Preview shows the saved page without editing controls',evaluate("document.querySelector('#editor').classList.contains('preview-mode')"));click('#preview');
  click('#publish');confirm();wait("document.querySelector('#toasts').textContent.includes('Published. The website now uses this version.')");save();
  const url=publicOrigin+'/editor-workflow-check-20261004';
  run('open',url);wait("document.querySelector('[data-cms-element=content-heading]')?.textContent==='Visual editing is live'");
  const publicStyle=evaluate("(()=>{const e=document.querySelector('[data-cms-element=content-heading]'),s=getComputedStyle(e);return{text:e.textContent,font:s.fontFamily,size:s.fontSize,color:s.color,editorChrome:!!document.querySelector('[data-cms-chrome]')};})()");
  check('Published changes are visible on the real public domain',publicStyle.text==='Visual editing is live'&&publicStyle.size==='42px'&&publicStyle.color==='rgb(21, 101, 192)'&&!publicStyle.editorChrome);
  run('screenshot',path.join(output,'live-published-verification.png'));
  run('reload');wait("document.querySelector('[data-cms-element=content-heading]')?.textContent==='Visual editing is live'");check('Live published changes survive reload');
  run('open',origin+'/visual-editor?page='+customId);wait("document.querySelector('#loading')?.hidden&&document.querySelector('#pageTitle').textContent==='Editor workflow check'");click('[data-nav="pages"]');click('.simple-page.active .page-options > summary');click('[data-page-action="unpublish"]');confirm();wait("document.querySelector('#toasts').textContent.includes('Page unpublished.')");
  check('The temporary verification page is withdrawn after the test',(await fetch(url,{cache:'no-store'})).status===404);
  run('open',origin+'/visual-editor');wait("document.querySelector('#loading')?.hidden&&document.querySelector('#siteFrame').contentWindow.CMCms?.page()==='home'");save();run('screenshot',path.join(output,'live-editor-home.png'));
  await writeFile('audit/live-editor-verification.json',JSON.stringify({status:'PASS',at:new Date().toISOString(),publicUrl:url,temporaryPage:customId,temporaryPageStatus:'unpublished',checks,publicStyle,output},null,2));
}catch(error){try{run('screenshot',path.join(output,'live-verification-failure.png'));}catch{}await writeFile('audit/live-editor-verification.json',JSON.stringify({status:'FAIL',at:new Date().toISOString(),temporaryPage:customId,checks,error:error.message,output},null,2));throw error;}
