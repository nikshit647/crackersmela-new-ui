import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const fixture=JSON.parse(await readFile(process.env.CM_EDITOR_FIXTURE||'audit-evidence/product-experience-20261010/engine-fixture.json','utf8'));
const base=fixture.baseUrl;
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
assert.equal((await(await fetch(base+'/__fixture-health')).json()).isolated,true);
const output=path.resolve('audit-evidence/cms-pointer-keyboard-'+Date.now());await mkdir(output,{recursive:true});
const binary=path.join(process.env.APPDATA,'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe'),session='cms-pointer-keyboard';
const run=(...args)=>{const result=JSON.parse(execFileSync(binary,['--session',session,...args,'--json'],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024}));assert.equal(result.success,true,result.error);return result.data;};
const evaluate=code=>run('eval','-b',Buffer.from(code).toString('base64')).result;
const wait=code=>run('wait','--fn',code);
const frame=code=>evaluate(`(()=>{const f=document.querySelector('#siteFrame'),win=f.contentWindow,doc=win.document;return (${code});})()`);
const checks=[];
const check=(name,pass,detail)=>{checks.push({name,status:pass?'PASS':'FAIL',detail});console.log(`${pass?'PASS':'FAIL'}: ${name}`);};
let cookie='',csrf='';
async function api(action,body,endpoint='cms-api.php'){
 const response=await fetch(`${base}/${endpoint}?a=${action}`,{method:body?'POST':'GET',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json','X-CSRF-Token':csrf},body:body?JSON.stringify(body):undefined});
 const c=response.headers.getSetCookie().find(v=>v.startsWith('cm_staff='));if(c)cookie=c.split(';')[0];const data=await response.json();if(data.csrfToken)csrf=data.csrfToken;return {status:response.status,...data};
}
await api('session',null,'staff-auth.php');assert.equal((await api('login',{email:fixture.email,password:fixture.password},'staff-auth.php')).authenticated,true);
const created=await api('page-create',{name:'Pointer keyboard QA',slug:'pointer-qa-'+Date.now()});assert.equal(created.status,201);
const document=created.draft,section=document.sections.find(s=>s.type==='text');section.type='container';section.content={};section.styles={desktop:{height:'1500px',minHeight:'1500px'}};
section.elements={
 'a-stage':{kind:'container',name:'Scaled stage',added:true,parentId:'eroot',styles:{desktop:{width:'800px',height:'1000px',backgroundColor:'#eeeeee'}},effects:{desktop:{position:{x:120,y:120,scale:0.75}}}},
 'a-image':{kind:'image',name:'Pointer image',added:true,parentId:'a-stage',src:'/images/logo.png',styles:{desktop:{width:'120px',height:'80px'}},effects:{desktop:{position:{x:160,y:240,scale:1.25}}}},
 'a-text':{kind:'text',name:'Keyboard text',added:true,parentId:'a-stage',text:'Original keyboard text',styles:{desktop:{width:'300px',fontSize:'28px'}},effects:{desktop:{position:{x:120,y:760,scale:1}}}}
};
const saved=await api('save',{page:created.page,expectedVersion:created.version,expectedGlobalVersion:created.globals.version,document});assert.equal(saved.status,200,saved.error);
const selector=id=>`[data-cms-section="${section.id}"] [data-cms-element="${id}"]`;
const image=selector('a-image'),text=selector('a-text');
const geometry=()=>frame(`(()=>{const n=doc.querySelector(${JSON.stringify(image)}),r=n.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,scrollX:win.scrollX,scrollY:win.scrollY,css:n.getAttribute('style'),pointer:win.__qaPointer,document:win.CMCms.document()};})()`);
const point=(sel,scroll=true)=>frame(`(()=>{const n=doc.querySelector(${JSON.stringify(sel)});${scroll?"n.scrollIntoView({block:'center',behavior:'instant'});":''}const r=n.getBoundingClientRect(),o=f.getBoundingClientRect(),scale=o.width/f.offsetWidth;return{x:o.left+(r.left+r.width/2)*scale,y:o.top+(r.top+r.height/2)*scale,scale};})()`);
const mouse=(x,y)=>run('mouse','move',String(Math.round(x)),String(Math.round(y)));
const clickFrame=sel=>{const p=point(sel);mouse(p.x,p.y);run('mouse','down');run('mouse','up');};
const ready=()=>wait(`document.querySelector('#loading').hidden && document.querySelector('#siteFrame').contentWindow.CMCms?.page()===${JSON.stringify(created.page)}`);
const flush=()=>wait("document.querySelector('#saveStatus').textContent.startsWith('✓ Saved') && document.querySelector('#errorBanner').hidden");
const approx=(a,b,tolerance=2.5)=>Math.abs(a-b)<=tolerance;
try{
 await new Promise((resolve,reject)=>{const child=spawn(binary,['--session',session,'open',base+'/'],{stdio:'ignore',windowsHide:true});child.once('error',reject);child.once('exit',c=>c===0?resolve():reject(Error('Browser launch failed')));});
 run('set','viewport','1450','1000');run('cookies','set','cm_staff',cookie.slice('cm_staff='.length),'--url',base,'--httpOnly','--sameSite','Lax');run('open',base+'/visual-editor');
 wait("document.querySelector('#loading').hidden && document.querySelector('#siteFrame').contentWindow.CMCms?.page()==='home'");
 run('click',`[data-page="${created.page}"]`);ready();flush();
 frame("(()=>{win.addEventListener('pointerdown',e=>{win.__qaPointer={startX:e.clientX,startY:e.clientY,target:e.target.outerHTML.slice(0,250)};},true);win.addEventListener('pointermove',e=>{if(win.__qaPointer)Object.assign(win.__qaPointer,{x:e.clientX,y:e.clientY});},true);return true;})()");
 clickFrame(image);let p=point(image),before=geometry();check('Canvas, ancestor and image each have independent scaling',p.scale<0.95&&approx(before.width,112.5,0.1),{canvasScale:p.scale,imageWidth:before.width});
 // Physical mouse input, mapped through the editor iframe scale. Alt disables alignment snapping.
 run('keydown','Alt');mouse(p.x,p.y);run('mouse','down');mouse(p.x+37*p.scale,p.y+23*p.scale);const moving=geometry();run('mouse','up');run('keyup','Alt');flush();const moved=geometry();
 const expectedX=(Math.round(p.x+37*p.scale)-Math.round(p.x))/p.scale,expectedY=(Math.round(p.y+23*p.scale)-Math.round(p.y))/p.scale;
 check('Dragging follows the cursor through canvas and ancestor scaling',approx(moving.left-before.left,expectedX)&&approx(moving.top-before.top,expectedY)&&approx(moved.left-before.left,expectedX)&&approx(moved.top-before.top,expectedY),{expectedX,expectedY,before,moving,moved});
 clickFrame(image);p=point(image);before=geometry();run('keydown','Alt');mouse(p.x,p.y);run('mouse','down');mouse(p.x+10*p.scale,p.y+8*p.scale);frame("win.scrollBy({top:65,behavior:'instant'})");mouse(p.x+28*p.scale,p.y+18*p.scale);const scrolled=geometry();run('mouse','up');run('keyup','Alt');flush();
 check('Scrolling during a drag keeps the image under the cursor',scrolled.scrollY-before.scrollY>60&&approx(scrolled.left-before.left,scrolled.pointer.x-scrolled.pointer.startX)&&approx(scrolled.top-before.top,scrolled.pointer.y-scrolled.pointer.startY),{before,scrolled});
 // Exercise actual resize handle anchoring in the same scaled container.
 clickFrame(image);p=point('[data-cms-resize="se"]',false);before=geometry();run('keydown','Shift');mouse(p.x,p.y);run('mouse','down');mouse(p.x+30*p.scale,p.y+20*p.scale);const resized=geometry();run('mouse','up');run('keyup','Shift');flush();
 check('Resizing follows the handle and retains the opposite corner under scaling',approx(resized.width-before.width,30)&&approx(resized.height-before.height,20)&&approx(resized.left,before.left)&&approx(resized.top,before.top),{before,resized});
 clickFrame(image);p=point('[data-cms-resize="nw"]',false);before=geometry();run('keydown','Shift');mouse(p.x,p.y);run('mouse','down');mouse(p.x-22*p.scale,p.y-15*p.scale);const northwest=geometry();run('mouse','up');run('keyup','Shift');flush();
 check('Top-left resizing keeps the bottom-right corner anchored',approx(northwest.width-before.width,22)&&approx(northwest.height-before.height,15)&&approx(northwest.right,before.right)&&approx(northwest.bottom,before.bottom),{before,northwest});
 clickFrame(image);p=point(image);before=geometry();mouse(p.x,p.y);run('mouse','down');mouse(p.x+45*p.scale,p.y+25*p.scale);
 // Browser pointer cancellation is an event path; do not imitate it with mouseup.
 frame("doc.dispatchEvent(new win.PointerEvent('pointercancel',{bubbles:true,pointerId:1}))");run('mouse','up');const cancelled=geometry();
 check('Pointer cancellation restores geometry, styles and the document',approx(cancelled.left,before.left,0.1)&&approx(cancelled.top,before.top,0.1)&&cancelled.css===before.css&&JSON.stringify(cancelled.document)===JSON.stringify(before.document),{before,cancelled});
 // Native typing undo must stay inside contenteditable and avoid editor history.
 clickFrame(text);run('wait','[data-edit-text]');run('click','[data-edit-text]');wait(`document.querySelector('#siteFrame').contentWindow.document.querySelector(${JSON.stringify(text)}).isContentEditable`);run('keyboard','inserttext','Changed inline text');run('press','Control+z');
 const inline=frame(`(()=>{const n=doc.querySelector(${JSON.stringify(text)});return{editing:n.isContentEditable,text:n.textContent};})()`);
 check('Ctrl+Z while typing uses native undo and stays in inline editing',inline.editing&&inline.text==='Original keyboard text',inline);run('press','Escape');
 // Focus a real unrelated form input without changing the selected editable node.
 clickFrame(image);const untouched=geometry().document;
 const input=frame("(()=>{const n=doc.querySelector('#search')||doc.querySelector('input[type=search]')||doc.querySelector('input[type=text]');if(!n)return null;n.focus();return{tag:n.tagName,type:n.type};})()");assert.ok(input,'Existing storefront text field');
 run('keyboard','inserttext','native input');run('press','ArrowLeft');run('press','Backspace');run('press','Control+z');
 check('Input arrows, deletion and undo do not mutate the editor selection',JSON.stringify(geometry().document)===JSON.stringify(untouched),input);
 flush();const current=await api('load&page='+created.page);assert.equal(current.status,200);
 const lockedDoc=structuredClone(current.draft),lockedSection=lockedDoc.sections.find(s=>s.id===section.id);lockedSection.elements['a-stage'].locked=true;
 lockedDoc.sections.splice(lockedDoc.sections.length-1,0,{id:'s-locked-qa',type:'container',name:'Locked section',region:'main',hidden:false,locked:true,content:{},elements:{'a-locked-child':{kind:'text',name:'Locked section child',added:true,parentId:'eroot',text:'Section lock protects me'}},styles:{desktop:{height:'200px'}}});
 const lockedSave=await api('save',{page:created.page,expectedVersion:current.version,expectedGlobalVersion:current.globals.version,document:lockedDoc});assert.equal(lockedSave.status,200,lockedSave.error);
 run('open',base+'/visual-editor');wait("document.querySelector('#loading').hidden && document.querySelector('#siteFrame').contentWindow.CMCms?.page()==='home'");run('click',`[data-page="${created.page}"]`);ready();flush();
 const lockState=frame(`({image:win.CMCms.selectionInfo(${JSON.stringify(section.id)},'a-image'),text:win.CMCms.selectionInfo(${JSON.stringify(section.id)},'a-text'),section:win.CMCms.selectionInfo('s-locked-qa','a-locked-child')})`);
 check('Container and section locks propagate to their descendants',lockState.image.locked&&lockState.image.lockOwnerId==='a-stage'&&lockState.text.locked&&lockState.section.locked&&lockState.section.lockOwnerId===null,lockState);
 clickFrame(image);p=point(image);before=geometry();mouse(p.x,p.y);run('mouse','down');mouse(p.x+45*p.scale,p.y+30*p.scale);run('mouse','up');run('press','ArrowRight');run('press','Delete');run('press','Control+x');run('press','Control+d');
 const guarded=geometry();check('Locked selection blocks drag, nudge, delete, cut and duplicate',JSON.stringify(guarded.document)===JSON.stringify(before.document)&&approx(guarded.left,before.left,0.1)&&approx(guarded.top,before.top,0.1),{before,guarded});
 check('Locked selection hides resize handles and remains selectable',frame(`doc.querySelector(${JSON.stringify(image)}).classList.contains('cms-selected') && [...doc.querySelectorAll('[data-cms-resize]')].every(n=>n.hidden) && doc.querySelector('.cms-selection-label').textContent.startsWith('Locked · ')`));
 clickFrame(text);run('press','Enter');run('keyboard','inserttext','cannot edit');check('Locked text does not enter inline editing',frame(`!doc.querySelector(${JSON.stringify(text)}).isContentEditable && doc.querySelector(${JSON.stringify(text)}).textContent==='Original keyboard text'`));
 const preVisibility=geometry().document;
 // Exercise the same authenticated parent-to-preview bridge as the Layers panel.
 evaluate(`document.querySelector('#siteFrame').contentWindow.postMessage({channel:'cm-editor',type:'editor-visibility',sectionId:${JSON.stringify(section.id)},elementId:'a-image',hidden:true},location.origin)`);
 wait(`getComputedStyle(document.querySelector('#siteFrame').contentWindow.document.querySelector(${JSON.stringify(image)})).display==='none'`);
 check('Temporary editor hiding leaves the saved document unchanged',JSON.stringify(geometry().document)===JSON.stringify(preVisibility));
 evaluate(`document.querySelector('#siteFrame').contentWindow.postMessage({channel:'cm-editor',type:'editor-visibility',sectionId:${JSON.stringify(section.id)},elementId:'a-image',hidden:false},location.origin)`);
 wait(`getComputedStyle(document.querySelector('#siteFrame').contentWindow.document.querySelector(${JSON.stringify(image)})).display!=='none'`);
 check('Temporary visibility can be restored for a locked element',JSON.stringify(geometry().document)===JSON.stringify(preVisibility));
 run('screenshot',path.join(output,'pointer-keyboard.png'));
 await writeFile(path.join(output,'results.json'),JSON.stringify({page:created.page,checks},null,2));
 assert.ok(checks.every(c=>c.status==='PASS'),checks.filter(c=>c.status==='FAIL').map(c=>c.name).join('; '));
 console.log(`${checks.length}/${checks.length} checks passed. Evidence: ${output}`);
}finally{await writeFile(path.join(output,'results.json'),JSON.stringify({page:created.page,checks},null,2));try{run('close');}catch{}}
