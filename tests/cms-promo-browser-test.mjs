import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';

const fixture=JSON.parse(await readFile('audit-evidence/cms-responsive-fixture.json','utf8'));
const base=fixture.baseUrl;
for(const url of [base,fixture.publicUrl])assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname));
const health=await(await fetch(base+'/__fixture-health')).json();assert.equal(health.isolated,true);assert.equal(health.mail,'disabled');
// This suite owns its isolated fixture only. Never refresh the shared preview.
for(const file of ['js/app.js','index.html','js/cms-runtime.js','js/cms-preview.js','js/visual-editor.js','css/cms-content.css','css/visual-editor.css','cm-cms.php'])await copyFile(path.join('audit-evidence/production-release',file),path.join(fixture.documentRoot,file));
const binary=path.join(process.env.APPDATA,'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe'),session='cms-promo-20261005';
const output=path.resolve('audit-evidence/cms-promo-browser-'+Date.now());await mkdir(output,{recursive:true});
const run=(...args)=>{const value=JSON.parse(execFileSync(binary,['--session',session,...args,'--json'],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024}));assert.equal(value.success,true,value.error);return value.data;};
const evaluate=code=>run('eval','-b',Buffer.from(code).toString('base64')).result;
const wait=code=>run('wait','--fn',code),click=selector=>run('click',selector);
const frameRead=code=>evaluate(`(()=>{const win=document.querySelector('#siteFrame').contentWindow,doc=win.document;return (${code});})()`);
const frameWait=code=>wait(`(()=>{const win=document.querySelector('#siteFrame')?.contentWindow,doc=win?.document;return !!doc&&(${code});})()`);
const fill=(selector,value)=>{if(selector.includes('data-simple-style')){evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`);click(selector);assert.ok(evaluate(`document.activeElement.matches(${JSON.stringify(selector)})`),'Number input receives focus');run('press','Control+a');run('keyboard','inserttext',String(value));}else run('fill',selector,String(value));};
const formValue=(selector,value)=>evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});input.value=${JSON.stringify(String(value))};input.dispatchEvent(new Event('input',{bubbles:true}));return input.value;})()`);
const choose=(selector,value)=>run('select',selector,value);
const setDevice=device=>{click(`[data-device="${device}"]`);frameWait(`win.innerWidth===${{desktop:1280,tablet:768,mobile:390}[device]}`);wait(`document.querySelector('#inspector .editing-scope').textContent.includes(${JSON.stringify(device[0].toUpperCase()+device.slice(1))})`);evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');};
const openPanel=index=>{const selector=`#inspector .promo-design details:nth-of-type(${index})`;evaluate(`document.querySelector(${JSON.stringify(selector+' > summary')}).focus()`);run('press','Enter');wait(`document.querySelector(${JSON.stringify(selector)}).open`);};
const messages=()=>frameRead("win.CMCms.document().sections.find(s=>s.source==='global:promo').content.promoMessages");
const stats=()=>frameRead("(()=>{const b=doc.querySelector('#promoBar'),g=b.querySelector('.promo-bar__group'),i=b.querySelector('[data-promo-message]'),s=win.getComputedStyle(b),t=win.getComputedStyle(i),p=win.getComputedStyle(g);return {font:t.fontSize,padding:p.paddingLeft,top:p.paddingTop,height:s.minHeight,background:s.backgroundImage,opacity:s.opacity,icons:!!i.querySelector('.promo-bar__message-icon')&&win.getComputedStyle(i.querySelector('.promo-bar__message-icon')).display!=='none'};})()");
const saved=()=>wait("document.querySelector('#saveStatus').textContent.startsWith('✓ Saved')&&document.querySelector('#errorBanner').hidden");
const checks=[],check=(name,condition)=>{assert.ok(condition,name);checks.push({name,status:'PASS'});console.log('PASS: '+name);};
const sr=await fetch(base+'/staff-auth.php?a=session',{headers:{Connection:'close'},signal:AbortSignal.timeout(15000)}),sd=await sr.json();
let cookie=sr.headers.getSetCookie().find(value=>value.startsWith('cm_staff='))?.split(';')[0];assert.ok(cookie);
const login=await fetch(base+'/staff-auth.php?a=login',{method:'POST',headers:{Connection:'close',Cookie:cookie,Origin:base,'Content-Type':'application/json','X-CSRF-Token':sd.csrfToken},body:JSON.stringify({email:fixture.email,password:fixture.password})});assert.equal(login.status,200);
cookie=login.headers.getSetCookie().find(value=>value.startsWith('cm_staff='))?.split(';')[0]||cookie;const auth=await login.json();
const api=async(action,body)=>{const response=await fetch(base+'/cms-api.php?a='+action+(body?'':'&page=home'),{signal:AbortSignal.timeout(15000),method:body?'POST':'GET',headers:{Connection:'close',Cookie:cookie,Origin:base,'Content-Type':'application/json','X-CSRF-Token':auth.csrfToken},...(body?{body:JSON.stringify(body)}:{})});const value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value;};
let previous;
try{
  previous=await api('load');
  await new Promise((resolve,reject)=>{const child=spawn(binary,['--session',session,'open',base+'/visual-editor?page=home'],{stdio:'ignore',windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Browser launch failed')));});
  run('cookies','set','cm_staff',cookie.slice(9),'--url',base,'--httpOnly','--sameSite','Lax');run('set','viewport','1600','1100');run('open',base+'/visual-editor?page=home');
  wait("document.querySelector('#loading').hidden&&document.querySelector('#siteFrame').contentWindow.CMCms?.page()==='home'");
  const point=frameRead(`(()=>{const n=doc.querySelector('#promoBar'),r=n.getBoundingClientRect(),f=parent.document.querySelector('#siteFrame'),b=f.getBoundingClientRect(),s=b.width/f.offsetWidth;return{x:b.left+(r.left+r.width/2)*s,y:b.top+(r.top+r.height/2)*s};})()`);
  run('mouse','move',String(Math.round(point.x)),String(Math.round(point.y)));run('mouse','down');run('mouse','up');
  wait("document.querySelector('#inspector h2').textContent==='PROMO BAR'");
  check('Clicking real top bar opens PROMO BAR inspector',evaluate("document.querySelector('#inspector h2').textContent")==='PROMO BAR');
  check('Selection outlines the real bar and pauses only the editing marquee',frameRead("doc.querySelector('#promoBar').classList.contains('cms-selected')&&!doc.querySelector('.cms-selection-box').hidden&&win.getComputedStyle(doc.querySelector('#promoTrack')).animationPlayState==='paused'"));
  const initial=evaluate("document.querySelectorAll('[data-promo-card]').length");check('Original logical messages load once',initial===4);
  fill('[data-scope="promo:0"][data-field="text"]','Festival savings & sparkle ₹299');
  frameWait("doc.querySelector('#promoBar [data-promo-message] > span:last-child').textContent==='Festival savings & sparkle ₹299'");
  check('Message text updates immediately and remains plain text',frameRead("!doc.querySelector('#promoBar safe')"));
  fill('[data-scope="promo:0"][data-field="text"]','₹'.repeat(101));
  check('Long Unicode message shows a local error and cannot enter the draft',evaluate("document.querySelector('[data-scope=\"promo:0\"][data-field=\"text\"]').getAttribute('aria-invalid')==='true'")&&new TextEncoder().encode(messages()[0].text).length<=300);
  fill('[data-scope="promo:0"][data-field="text"]','<sale>');check('Markup is rejected before draft mutation',messages()[0].text!=='<sale>');
  fill('[data-scope="promo:0"][data-field="text"]','Festival savings & sparkle ₹299');
  choose('[data-scope="promo:0"][data-field="icon"]','none');frameWait("!doc.querySelector('#promoBar [data-promo-message]').querySelector('.promo-bar__message-icon')");
  choose('[data-scope="promo:0"][data-field="icon"]','truck');frameWait("!!doc.querySelector('#promoBar [data-promo-message]').querySelector('.promo-bar__message-icon svg')");
  click('[data-scope="promo:0"][data-field="enabled"]');frameWait("!doc.querySelector('#promoTrack').textContent.includes('Festival savings')");
  click('[data-scope="promo:0"][data-field="enabled"]');frameWait("doc.querySelector('#promoTrack').textContent.includes('Festival savings')");
  check('Message icons and enable state update the existing marquee',true);
  click('[data-promo-action="duplicate"][data-promo-index="0"]');
  check('Duplicating keeps content and creates an independent message ID',messages().length===initial+1&&messages()[0].text===messages()[1].text&&messages()[0].id!==messages()[1].id);
  click('[data-promo-action="delete"][data-promo-index="1"]');check('Delete removes only its message',messages().length===initial);
  click('[data-promo-action="add"]');fill(`[data-scope="promo:${initial}"][data-field="text"]`,'Delivery updates for your celebration');
  click(`[data-promo-action="up"][data-promo-index="${initial}"]`);
  check('Add and Move up change the shared message list',messages()[initial-1].text==='Delivery updates for your celebration');
  click(`[data-promo-action="down"][data-promo-index="${initial-1}"]`);
  check('Move down matches the visible message order',messages()[initial].text==='Delivery updates for your celebration');
  const expectedMessages=messages();
  evaluate("document.querySelector('#inspector').scrollTop=0");
  run('screenshot',path.join(output,'promo-message-editor.png'));
  const original={};for(const device of ['desktop','tablet','mobile']){setDevice(device);original[device]=stats();}
  setDevice('desktop');openPanel(2);fill('[data-simple-style="fontSize"]','18');frameWait("win.getComputedStyle(doc.querySelector('#promoBar [data-promo-message]')).fontSize==='18px'");openPanel(3);fill('[data-simple-style="paddingLeft"]','26');fill('[data-simple-style="paddingTop"]','14');fill('[data-simple-style="minHeight"]','60');
  openPanel(1);formValue('[data-field="backgroundColor"][data-scope="style"]','#263b75');
  frameWait("win.getComputedStyle(doc.querySelector('#promoBar')).backgroundImage==='none'");
  formValue('[data-simple-opacity]','90');
  for(const device of ['tablet','mobile']){setDevice(device);assert.deepEqual(stats(),original[device]);}
  check('Desktop typography spacing height background and opacity preserve Tablet and Mobile',true);
  setDevice('tablet');openPanel(2);fill('[data-simple-style="fontSize"]','16');openPanel(3);fill('[data-simple-style="paddingLeft"]','20');fill('[data-simple-style="minHeight"]','48');
  setDevice('mobile');assert.deepEqual(stats(),original.mobile);openPanel(2);fill('[data-simple-style="fontSize"]','14');openPanel(3);fill('[data-simple-style="paddingLeft"]','12');fill('[data-simple-style="paddingTop"]','8');fill('[data-simple-style="minHeight"]','40');
  click('[data-field="showPromoIcons"]');frameWait("win.getComputedStyle(doc.querySelector('#promoBar .promo-bar__message-icon')).display==='none'");
  click('#undo');frameWait("win.getComputedStyle(doc.querySelector('#promoBar .promo-bar__message-icon')).display!=='none'");click('#redo');frameWait("win.getComputedStyle(doc.querySelector('#promoBar .promo-bar__message-icon')).display==='none'");
  for(const [device,font,padding,height]of [['desktop','18px','26px','60px'],['tablet','16px','20px','48px'],['mobile','14px','12px','40px']]){setDevice(device);const value=stats();assert.equal(value.font,font);assert.equal(value.padding,padding);assert.equal(value.height,height);assert.equal(value.icons,device!=='mobile');}
  check('Three devices retain independent styles and icon visibility through Undo and Redo',true);
  setDevice('mobile');click('[data-reset-device]');assert.deepEqual(stats(),original.mobile);assert.deepEqual(messages(),expectedMessages);openPanel(2);fill('[data-simple-style="fontSize"]','14');openPanel(3);fill('[data-simple-style="paddingLeft"]','12');fill('[data-simple-style="minHeight"]','40');click('[data-field="showPromoIcons"]');
  check('Reset styling preserves all shared messages',true);
  setDevice('desktop');openPanel(1);click('[data-scope="effect-gradient"][data-field="enabled"]');formValue('[data-field="start"]','#123456');formValue('[data-field="end"]','#456789');
  frameWait("win.getComputedStyle(doc.querySelector('#promoBar')).backgroundImage.includes('18, 52, 86')");
  check('Native background supports solid color and custom gradient',true);
  click('#preview');frameWait("win.CM_EDITOR_INTERACTIVE&&win.getComputedStyle(doc.querySelector('#promoTrack')).animationPlayState==='running'");
  check('Visitor preview resumes the marquee',true);click('#modeEdit');saved();
  run('open',base+'/visual-editor?page=home');wait("document.querySelector('#loading').hidden&&document.querySelector('#siteFrame').contentWindow.CMCms?.page()==='home'");
  assert.deepEqual(messages(),expectedMessages);check('Saved messages reload through the existing draft API',true);
  click('[data-nav="sections"]');click('[data-select-section="global:promo"]');setDevice('mobile');assert.equal(stats().font,'14px');assert.equal(stats().icons,false);
  check('Saved device settings reload independently',true);
  click('#publish');run('wait','#confirmDialog[open]');click('#confirmAction');wait("document.querySelector('#toasts').textContent.includes('Published. The website now uses this version.')");saved();
  const publication=await api('load');assert.deepEqual(publication.published.sections.find(s=>s.source==='global:promo').content.promoMessages,expectedMessages);
  check('Publish uses the saved Home page document',true);
  for(const width of [360,375,390,412,425]){
    run('set','viewport',String(width),'900');run('open',fixture.publicUrl+'/');wait("window.CMCms?.document()?.sections?.find(s=>s.source==='global:promo')?.content?.promoMessages?.[0]?.text==='Festival savings & sparkle ₹299'");
    const measure=evaluate("(()=>{const b=document.querySelector('#promoBar'),g=[...b.querySelectorAll('.promo-bar__group')],t=b.querySelector('#promoTrack'),i=b.querySelector('[data-promo-message]');return {overflow:document.documentElement.scrollWidth>innerWidth,font:getComputedStyle(i).fontSize,groups:g.map(n=>n.getBoundingClientRect().width),animation:getComputedStyle(t).animationPlayState,accessible:g.filter(n=>n.getAttribute('aria-hidden')!=='true').length,navbar:!!document.querySelector('#navbar'),editor:!!document.querySelector('.cms-canvas-chrome')};})()");
    check('Fresh public '+width+'px load is readable and has no horizontal overflow',!measure.overflow&&measure.font==='14px'&&measure.accessible===1&&measure.navbar&&!measure.editor&&measure.animation==='running'&&Math.abs(measure.groups[0]-measure.groups[1])<.1);
    if(width===360)run('screenshot',path.join(output,'promo-public-mobile.png'));
  }
  const before=evaluate("getComputedStyle(document.querySelector('#promoTrack')).transform");await new Promise(resolve=>setTimeout(resolve,250));const after=evaluate("getComputedStyle(document.querySelector('#promoTrack')).transform");check('Public marquee advances continuously',before!==after);
  click('#mobileToggle');check('Mobile navigation still opens',evaluate("document.querySelector('#mobileDrawer').classList.contains('open')"));
  run('open',fixture.publicUrl+'/products');wait("window.CMCms?.page()==='products'");
  check('Other pages retain their own original announcement content',evaluate("!document.querySelector('#promoTrack').textContent.includes('Festival savings')"));
  await mkdir('audit-artifacts',{recursive:true});
  for(const file of ['promo-message-editor.png','promo-public-mobile.png'])await copyFile(path.join(output,file),path.join('audit-artifacts',file));
  await writeFile('audit/cms-promo-browser-results.json',JSON.stringify({status:'PASS',checks,output},null,2));
}catch(error){try{run('screenshot',path.join(output,'failure.png'));await writeFile(path.join(output,'failure-promo.json'),JSON.stringify(frameRead("win.CMCms.document().sections.find(s=>s.source==='global:promo')"),null,2));}catch{}await writeFile('audit/cms-promo-browser-results.json',JSON.stringify({status:'FAIL',checks,error:error.stack,output},null,2));throw error;}
finally{
  if(previous?.published){const current=await api('load'),saved=await api('save',{page:'home',expectedVersion:current.version,document:previous.published});await api('publish',{page:'home',expectedVersion:saved.version});}
  if(previous?.draft){const current=await api('load');await api('save',{page:'home',expectedVersion:current.version,document:previous.draft});}
  run('close');
}
