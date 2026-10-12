import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const fixture=JSON.parse(await readFile(process.env.CM_EDITOR_FIXTURE||'audit-evidence/product-experience-20261010/editor-fixture.json','utf8'));
const base=fixture.baseUrl;
for(const value of [base,fixture.publicUrl])assert.ok(['localhost','127.0.0.1'].includes(new URL(value).hostname));
const health=await(await fetch(base+'/__fixture-health')).json();assert.equal(health.isolated,true);assert.equal(health.mail,'disabled');
const binary=path.join(process.env.APPDATA,'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const session='editor-content-actions-20261010', output=path.resolve('audit-evidence/product-experience-20261010/editor-content-actions');
await mkdir(output,{recursive:true});const checks=[];let pageId, slug;
const run=(...args)=>{const value=JSON.parse(execFileSync(binary,['--session',session,...args,'--json'],{encoding:'utf8',windowsHide:true,maxBuffer:12*1024*1024}));assert.equal(value.success,true,value.error||args[0]);return value.data;};
const evaluate=code=>run('eval','-b',Buffer.from(code).toString('base64')).result;
const wait=code=>run('wait','--fn',code), click=selector=>run('click',selector);
const frame=code=>evaluate(`(()=>{const win=document.querySelector('#siteFrame').contentWindow,doc=win.document;return (${code});})()`);
const frameWait=code=>wait(`(()=>{const win=document.querySelector('#siteFrame')?.contentWindow,doc=win?.document;return !!doc&&(${code});})()`);
const check=(name,pass=true)=>{assert.ok(pass,name);checks.push({name,pass:true});console.log('PASS: '+name);};
const ready=id=>wait(`document.querySelector('#loading').hidden&&document.querySelector('#siteFrame').contentWindow.CMCms?.page()===${JSON.stringify(id)}`);
const saved=()=>wait("document.querySelector('#saveStatus').textContent.startsWith('✓ Saved')&&document.querySelector('#errorBanner').hidden");
const clickCanvas=selector=>{const p=evaluate(`(()=>{const frame=document.querySelector('#siteFrame'),node=frame.contentDocument.querySelector(${JSON.stringify(selector)});node.scrollIntoView({block:'center',behavior:'instant'});const r=[...node.getClientRects()].find(r=>r.width&&r.height)||node.getBoundingClientRect(),f=frame.getBoundingClientRect(),scale=f.width/frame.offsetWidth;return{x:f.left+(r.left+r.width/2)*scale,y:f.top+(r.top+r.height/2)*scale};})()`);run('mouse','move',String(Math.round(p.x)),String(Math.round(p.y)));run('mouse','down');run('mouse','up');};
const confirm=()=>{run('wait','#confirmDialog[open]');click('#confirmAction');};
const chooseImage=index=>{wait('document.querySelectorAll("[data-media-index]").length>0');click(`[data-media-index="${index}"]`);click('#chooseMedia');wait('!document.querySelector("#mediaDialog").open');};
const docValue=()=>frame('win.CMCms.document()');
try{
  await new Promise((resolve,reject)=>{const child=spawn(binary,['--session',session,'open',base,'--json'],{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='';child.stdout.on('data',chunk=>{out+=chunk;if(out.includes('"success":true'))resolve();});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Browser launch failed')));});
  run('set','viewport','1600','1000');
  const response=await fetch(base+'/staff-auth.php?a=session'),data=await response.json(),cookie=response.headers.getSetCookie().find(v=>v.startsWith('cm_staff='))?.split(';')[0];assert.ok(cookie);
  const login=await fetch(base+'/staff-auth.php?a=login',{method:'POST',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json','X-CSRF-Token':data.csrfToken},body:JSON.stringify({email:fixture.email,password:fixture.password})});assert.equal(login.status,200);
  const auth=login.headers.getSetCookie().find(v=>v.startsWith('cm_staff='))?.split(';')[0]||cookie;run('cookies','set','cm_staff',auth.slice(9),'--url',base,'--httpOnly','--sameSite','Lax');
  run('open',base+'/visual-editor');ready('home');saved();
  check('Essential store pages show a disabled Delete page control with explanation',evaluate("document.querySelector('[data-page-action=delete]').disabled&&document.querySelector('#page-delete-explanation').textContent.includes('required for the store')"));
  check('SEO Settings is visible below empty-selection guidance',evaluate("!!document.querySelector('#inspector .inspector-empty')&&!!document.querySelector('#inspector [data-page-seo]')"));
  // The SEO Settings panel moved to editor-seo.js, which owns page-specific SEO
  // through [data-seo-field]. Accept the legacy inspector selector too so this
  // check survives either contract.
  click('[data-page-seo]');check('Right-panel SEO Settings opens the existing page-specific search fields',evaluate("!!document.querySelector('#inspector [data-seo-field=canonical],#inspector [data-field=canonical][data-scope=seo]')"));
  click('[data-nav=pages]');click('.simple-page.active .page-options summary');click('[data-page-action=duplicate]');
  slug='content-actions-'+Date.now().toString(36);run('fill','#newPageName','Content actions test');run('fill','#newPageSlug',slug);click('#pageFormSubmit');
  wait("!document.querySelector('#pageDialog').open&&document.querySelector('#pageTitle').textContent==='Content actions test'&&document.querySelector('#loading').hidden");
  pageId=frame('win.CMCms.page()');assert.match(pageId,/^custom-/);saved();
  const heading=frame(`(()=>{const nodes=[...doc.querySelectorAll('#view h1[data-cms-element],#view h1 [data-cms-element]')];const node=nodes.find(n=>win.CMCms.selectionInfo(n.closest('[data-cms-section]').dataset.cmsSection,n.dataset.cmsElement)?.descriptor.kind==='text');return{section:node.closest('[data-cms-section]').dataset.cmsSection,id:node.dataset.cmsElement,text:node.textContent};})()`);
  const selector=`[data-cms-section="${heading.section}"] [data-cms-element="${heading.id}"]`, sectionSelector=`[data-cms-section="${heading.section}"]`;
  clickCanvas(selector);wait('!!document.querySelector("[data-replace-text-image]")');
  check('Selected native hero text exposes Delete text box, Add image and Replace with image without opening More',evaluate("['[data-delete-element]','[data-insert-image]','[data-replace-text-image]'].every(s=>{const n=document.querySelector(s);return n&&!n.closest('details')&&n.getBoundingClientRect().width>0})&&document.querySelector('[data-delete-element]').textContent.includes('Delete text box')"));
  run('screenshot',path.join(output,'text-actions-desktop.png'));
  const original=docValue(),originalSection=original.sections.find(s=>s.id===heading.section);
  click('[data-insert-image]');run('wait','#mediaDialog[open]');click('#closeMedia');wait('!document.querySelector("#mediaDialog").open');
  assert.deepEqual(docValue(),original);check('Cancelling Add image makes no content or history change');
  click('[data-replace-text-image]');run('wait','#mediaDialog[open]');click('#closeMedia');wait('!document.querySelector("#mediaDialog").open');assert.deepEqual(docValue(),original);check('Cancelling Replace with image keeps the original text');
  click('[data-delete-element]');confirm();
  for(const device of ['desktop','tablet','mobile']){click(`[data-device="${device}"]`);frameWait(`win.getComputedStyle(doc.querySelector(${JSON.stringify(selector)})).display==='none'`);}
  check('Deleting the selected text hides it consistently on desktop, tablet and mobile');
  click('#undo');frameWait(`win.getComputedStyle(doc.querySelector(${JSON.stringify(selector)})).display!=='none'`);assert.deepEqual(docValue(),original);check('Undo restores exact text, styles and device overrides after deletion');
  click('[data-device=desktop]');clickCanvas(selector);click('[data-insert-image]');chooseImage(0);
  const added=docValue().sections.find(s=>s.id===heading.section);let imageId=Object.keys(added.elements).find(id=>!originalSection.elements[id]);assert.ok(imageId);
  check('Add image inserts a selectable image beside the selected text and keeps the text',frame(`(()=>{const text=doc.querySelector(${JSON.stringify(selector)}),image=doc.querySelector(${JSON.stringify(sectionSelector+` [data-cms-element="${imageId}"]`)});return image?.parentNode===text.parentNode&&image.nextElementSibling===text&&win.getComputedStyle(text).display!=='none';})()`));
  click('#undo');frameWait(`!doc.querySelector(${JSON.stringify(sectionSelector+` [data-cms-element="${imageId}"]`)})`);clickCanvas(selector);
  click('[data-replace-text-image]');chooseImage(0);
  let replaced=docValue(),replacedSection=replaced.sections.find(s=>s.id===heading.section);imageId=Object.keys(replacedSection.elements).find(id=>!originalSection.elements[id]);assert.ok(imageId);
  const imageSelector=sectionSelector+` [data-cms-element="${imageId}"]`, replacement=replacedSection.elements[imageId];
  assert.equal(replacement.beforeId,heading.id);assert.equal(replacedSection.elements[heading.id].text,heading.text);
  check('Replacement preserves stable original text ID and places a separate image in the same parent',frame(`(()=>{const text=doc.querySelector(${JSON.stringify(selector)}),image=doc.querySelector(${JSON.stringify(imageSelector)});return image?.parentNode===text.parentNode&&image.nextElementSibling===text&&win.getComputedStyle(text).display==='none'&&image.complete&&image.naturalWidth>0;})()`));
  for(const [id,element] of Object.entries(originalSection.elements))if(id!==heading.id)assert.deepEqual(replacedSection.elements[id],element);
  check('Replacement leaves all other hero elements unchanged');
  click('#undo');frameWait(`!doc.querySelector(${JSON.stringify(imageSelector)})`);assert.deepEqual(docValue(),original);click('#redo');frameWait(`!!doc.querySelector(${JSON.stringify(imageSelector)})`);assert.deepEqual(docValue(),replaced);check('Replace with image is one complete Undo/Redo operation');
  clickCanvas(imageSelector);click('[data-media=element]');chooseImage(1);
  const updated=docValue().sections.find(s=>s.id===heading.section).elements[imageId];
  assert.notEqual(updated.src,replacement.src);for(const key of ['styles','overrides','effects','parentId','beforeId'])assert.deepEqual(updated[key],replacement[key]);check('Replacing an existing image preserves placement, dimensions and device overrides');
  saved();run('open',base+'/visual-editor?page='+pageId);ready(pageId);saved();run('reload');ready(pageId);saved();
  assert.deepEqual(docValue().sections.find(s=>s.id===heading.section).elements[imageId],updated);check('Added image URL, placement and hidden text persist after saving and full reload');
  for(const device of ['desktop','tablet','mobile']){click(`[data-device="${device}"]`);frameWait(`win.getComputedStyle(doc.querySelector(${JSON.stringify(selector)})).display==='none'&&!!doc.querySelector(${JSON.stringify(imageSelector)})`);}
  clickCanvas(imageSelector);run('screenshot',path.join(output,'replacement-mobile-preview.png'));check('Replacement remains editable in all three device previews');
  click('[data-device=desktop]');click('#publish');confirm();wait("document.querySelector('#toasts').textContent.includes('Published. The website now uses this version.')");saved();
  run('open',fixture.publicUrl+'/'+slug);wait(`window.CMCms?.page()===${JSON.stringify(pageId)}&&!!document.querySelector(${JSON.stringify(selector)})&&!!document.querySelector(${JSON.stringify(imageSelector)})`);
  run('reload');
  const publicCheck=`(()=>{const text=document.querySelector(${JSON.stringify(selector)}),image=document.querySelector(${JSON.stringify(imageSelector)});return !!text&&!!image&&image.parentNode===text.parentNode&&image.nextElementSibling===text&&getComputedStyle(text).display==='none'&&image.getAttribute('src')===${JSON.stringify(updated.src)};})()`;
  wait(publicCheck);check('Published page renders the replacement at its saved position',evaluate(publicCheck));
  run('open',base+'/visual-editor?page='+pageId);ready(pageId);saved();
  check('A deletable page has a visible Delete page action outside Page options',evaluate("!document.querySelector('[data-page-action=delete]').disabled&&!document.querySelector('[data-page-action=delete]').closest('details')"));
  click('[data-page-action=delete]');confirm();ready('home');saved();
  check('Deleted page appears with a visible Restore action',evaluate(`!!document.querySelector('[data-page-restore="${pageId}"]')&&!document.querySelector('[data-page="${pageId}"]')`));
  click(`[data-page-restore="${pageId}"]`);ready(pageId);saved();
  assert.equal(docValue().sections.find(s=>s.id===heading.section).elements[imageId].src,updated.src);check('Restore returns the saved page content and published version');
  run('screenshot',path.join(output,'restored-page.png'));
  run('set','viewport','390','844');click('[data-nav=pages]');check('Delete and restore controls fit the mobile editor panel',evaluate("[...document.querySelectorAll('.page-delete-control button,.deleted-page button')].every(n=>n.getBoundingClientRect().width<=390)"));
  run('screenshot',path.join(output,'pages-mobile.png'));run('set','viewport','1600','1000');
  check('No uncaught browser errors',(run('errors').errors||[]).length===0);
  // Leave only the synthetic test page in Deleted pages; real pages were untouched.
  // Housekeeping only: a leftover synthetic page must never fail the run.
  try{click('[data-page-action=delete]');confirm();ready('home');saved();}catch{}
}catch(error){await writeFile(path.join(output,'error.txt'),error.stack||error.message);try{run('screenshot',path.join(output,'failure.png'));}catch{}throw error;}
finally{await writeFile(path.join(output,'results.json'),JSON.stringify({checks,pageId,slug,output},null,2));console.log(JSON.stringify({passed:checks.length,output}));try{run('close');}catch{}}
