import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Exercise the real application and persistent PHP CMS in a synthetic fixture.
// Refuse production URLs even if the fixture manifest is accidentally changed.
const fixture = JSON.parse(await readFile(process.env.CM_CMS_FIXTURE || 'audit-evidence/cms-fixture-active.json', 'utf8'));
const base = fixture.baseUrl;
for (const value of [base, fixture.publicUrl]) {
  const url = new URL(value);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.protocol === 'http:', 'QA target must be loopback');
}
const health = await (await fetch(base + '/__fixture-health')).json();
assert.equal(health.isolated, true);
assert.equal(health.mail, 'disabled');
const binary = process.platform === 'win32' ? path.join(process.env.APPDATA, 'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe') : 'agent-browser';
const session = process.env.CM_CMS_BROWSER_SESSION || 'cms-responsive-20261005';
const output = path.resolve('audit-evidence/cms-responsive-browser-' + Date.now());
await mkdir(output, { recursive: true });
await mkdir('audit', { recursive: true });
const checks = [];
const run = (...args) => {
  const raw = execFileSync(binary, ['--session', session, ...args, '--json'], { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  const data = JSON.parse(raw);
  assert.equal(data.success, true, data.error || args[0]);
  return data.data;
};
const evaluate = code => run('eval', '-b', Buffer.from(code).toString('base64')).result;
const wait = code => run('wait', '--fn', code);
const click = selector => run('click', selector);
const fill = (selector, value) => {
  if(selector.includes('data-simple-style')){run('focus',selector);run('press','Control+a');return run('keyboard','inserttext',String(value));}
  return run('fill', selector, String(value));
};
const choose = (selector, value) => run('select', selector, String(value));
const check = (name, condition = true, detail) => { assert.ok(condition, name); checks.push({ name, status: 'PASS', ...(detail ? { detail } : {}) }); console.log('PASS: ' + name); };
const frameRead = code => evaluate(`(() => { const win=document.querySelector('#siteFrame').contentWindow, doc=win.document; return (${code}); })()`);
const frameWait = code => wait(`(() => { const win=document.querySelector('#siteFrame')?.contentWindow, doc=win?.document; return !!doc && (${code}); })()`);
const saved = () => wait("document.querySelector('#saveStatus').textContent.startsWith('✓ Saved') && document.querySelector('#errorBanner').hidden");
const editorReady = page => wait(`document.querySelector('#loading').hidden && document.querySelector('#siteFrame').contentWindow.CMCms?.page()===${JSON.stringify(page)}`);
const confirm = () => { run('wait', '#confirmDialog[open]'); click('#confirmAction'); };
const selectorFor = (section, element) => `[data-cms-section="${section}"]${element === 'eroot' ? '' : ` [data-cms-element="${element}"]`}`;
const framePoint = (selector, scroll = true) => evaluate(`(() => {
  const frame=document.querySelector('#siteFrame'), win=frame.contentWindow, target=win.document.querySelector(${JSON.stringify(selector)});
  if(!target) throw new Error('Missing canvas target: '+${JSON.stringify(selector)});
  ${scroll ? "target.scrollIntoView({block:'center',behavior:'instant'});" : ''}
  const box=[...target.getClientRects()].find(rect=>rect.width&&rect.height)||target.getBoundingClientRect(), outer=frame.getBoundingClientRect(), scale=outer.width/frame.offsetWidth;
  return {x:outer.left+(box.left+box.width/2)*scale,y:outer.top+(box.top+box.height/2)*scale,scale};
})()`);
const frameClick = selector => { const point = framePoint(selector); run('mouse', 'move', String(Math.round(point.x)), String(Math.round(point.y))); run('mouse', 'down'); run('mouse', 'up'); };
const frameDrag = (selector, dx, dy, scroll = true) => {
  const point = framePoint(selector, scroll);
  run('mouse', 'move', String(Math.round(point.x)), String(Math.round(point.y))); run('mouse', 'down');
  for (let step = 1; step <= 8; step++) run('mouse', 'move', String(Math.round(point.x + dx * point.scale * step / 8)), String(Math.round(point.y + dy * point.scale * step / 8)));
  run('mouse', 'up');
};
const popover = name => { const index=evaluate(`Array.from(document.querySelectorAll('#inspector .context-popover')).findIndex(n=>n.querySelector('summary').textContent===${JSON.stringify(name)})`); assert.ok(index>=0,'Toolbar menu '+name); return `#inspector .context-popover:nth-of-type(${index+1}) > summary`; };
// These two native controls open operating-system UI on some platforms. Set the
// visible form value and emit its normal input event, never CMS state/messages.
const formValue = (selector, value) => evaluate(`(() => { const input=document.querySelector(${JSON.stringify(selector)}); if(!input) throw new Error('Missing form control'); input.value=${JSON.stringify(String(value))}; input.dispatchEvent(new Event('input',{bubbles:true})); return input.value; })()`);
const inlineText = (selector, text) => {
  frameClick(selector); run('wait', '[data-edit-text]'); click('[data-edit-text]');
  frameWait(`doc.querySelector(${JSON.stringify(selector)})?.isContentEditable`);
  run('keyboard', 'inserttext', text); run('press', 'Tab');
  frameWait(`doc.querySelector(${JSON.stringify(selector)})?.textContent===${JSON.stringify(text)}`);
};
const headingTarget = section => frameRead(`(() => {
  const nodes=[...doc.querySelectorAll(${JSON.stringify(section ? `[data-cms-section="${section}"] h1,[data-cms-section="${section}"] h1 [data-cms-element],[data-cms-section="${section}"] h2,[data-cms-section="${section}"] h2 [data-cms-element]` : '#view h1,#view h1 [data-cms-element],#view h2,#view h2 [data-cms-element]')})];
  const node=nodes.find(n=>n.dataset.cmsElement&&win.CMCms.selectionInfo(n.closest('[data-cms-section]').dataset.cmsSection,n.dataset.cmsElement)?.descriptor.kind==='text');
  return node?{section:node.closest('[data-cms-section]').dataset.cmsSection,element:node.dataset.cmsElement,text:node.textContent}:null;
})()`);
const docValue = (section, element) => frameRead(`win.CMCms.document().sections.find(s=>s.id===${JSON.stringify(section)}).elements[${JSON.stringify(element)}]`);
const publish = () => { click('#publish'); confirm(); wait("document.querySelector('#toasts').textContent.includes('Published. The website now uses this version.')"); saved(); };

const selectSection = id => {click('[data-nav="sections"]');click(`[data-select-section="${id}"]`);};
const snapshotStyles = selector => frameRead(`(()=>{const n=doc.querySelector(${JSON.stringify(selector)}),s=win.getComputedStyle(n);return {font:s.fontSize,padding:s.paddingTop,height:s.minHeight,width:s.width,fit:s.objectFit,position:s.translate,display:s.display};})()`);
const setDevice = device => {click(`[data-device="${device}"]`);frameWait(`win.innerWidth===${{desktop:1280,tablet:768,mobile:390}[device]}`);};
try {
  const sessionResponse=await fetch(base+'/staff-auth.php?a=session'),sessionData=await sessionResponse.json();
  const cookie=sessionResponse.headers.getSetCookie().find(v=>v.startsWith('cm_staff='))?.split(';')[0];assert.ok(cookie);
  const login=await fetch(base+'/staff-auth.php?a=login',{method:'POST',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json','X-CSRF-Token':sessionData.csrfToken},body:JSON.stringify({email:fixture.email,password:fixture.password})});assert.equal(login.status,200);
  const auth=login.headers.getSetCookie().find(v=>v.startsWith('cm_staff='))?.split(';')[0]||cookie;
  run('cookies','set','cm_staff',auth.slice(9),'--url',base,'--httpOnly','--sameSite','Lax');
  run('set','viewport','1600','1100');run('open',base+'/visual-editor?page=home');editorReady('home');saved();
  const heading=headingTarget();assert.ok(heading);const headingSelector=selectorFor(heading.section,heading.element);
  const original={};for(const device of ['desktop','tablet','mobile']){setDevice(device);original[device]=snapshotStyles(headingSelector);}
  setDevice('desktop');frameClick(headingSelector);fill('[data-simple-style="fontSize"]','57');
  frameWait(`win.getComputedStyle(doc.querySelector(${JSON.stringify(headingSelector)})).fontSize==='57px'`);
  for(const device of ['tablet','mobile']){setDevice(device);assert.equal(snapshotStyles(headingSelector).font,original[device].font);}
  check('Desktop edit preserves previously inherited native Tablet and Mobile fonts');
  setDevice('tablet');fill('[data-simple-style="fontSize"]','39');setDevice('mobile');assert.equal(snapshotStyles(headingSelector).font,original.mobile.font);fill('[data-simple-style="fontSize"]','24');
  for(const [device,font]of [['desktop','57px'],['tablet','39px'],['mobile','24px']]){setDevice(device);assert.equal(snapshotStyles(headingSelector).font,font);}
  check('All three devices keep independent font sizes');
  click('#undo');frameWait(`win.getComputedStyle(doc.querySelector(${JSON.stringify(headingSelector)})).fontSize===${JSON.stringify(original.mobile.font)}`);click('#redo');frameWait(`win.getComputedStyle(doc.querySelector(${JSON.stringify(headingSelector)})).fontSize==='24px'`);
  check('Undo and redo change only the selected device override');
  const sectionSelector=selectorFor(heading.section,'eroot');
  const sectionBase={};for(const device of ['desktop','tablet','mobile']){setDevice(device);sectionBase[device]=snapshotStyles(sectionSelector);}
  setDevice('desktop');selectSection(heading.section);click(popover('Spacing'));fill('[data-simple-style="paddingTop"]','77');click(popover('Spacing'));fill('[data-simple-style="minHeight"]','610');
  for(const device of ['tablet','mobile']){setDevice(device);const current=snapshotStyles(sectionSelector);assert.equal(current.padding,sectionBase[device].padding);assert.equal(current.height,sectionBase[device].height);}
  check('Section spacing and height edits remain on Desktop');
  click('[data-field="hidden"][data-scope="visibility"]');frameWait(`win.getComputedStyle(doc.querySelector(${JSON.stringify(sectionSelector)})).display==='none'`);
  setDevice('desktop');assert.notEqual(snapshotStyles(sectionSelector).display,'none');setDevice('tablet');assert.notEqual(snapshotStyles(sectionSelector).display,'none');setDevice('mobile');click('[data-field="hidden"][data-scope="visibility"]');
  check('Hide and show act on the active device and preserve other sizes');
  setDevice('desktop');const imageTarget=frameRead(`(()=>{const n=[...doc.querySelectorAll('#view img[data-cms-element]')].find(n=>{const r=n.getBoundingClientRect();return r.width>64&&r.height>64;});return {section:n.closest('[data-cms-section]').dataset.cmsSection,element:n.dataset.cmsElement};})()`);
  const imageSelector=selectorFor(imageTarget.section,imageTarget.element), imageBase={};for(const device of ['desktop','tablet','mobile']){setDevice(device);imageBase[device]=snapshotStyles(imageSelector);}
  setDevice('desktop');frameClick(imageSelector);click(popover('Position'));click('[data-nudge="right"]');
  assert.notEqual(snapshotStyles(imageSelector).position,imageBase.desktop.position);
  setDevice('tablet');assert.equal(snapshotStyles(imageSelector).position,imageBase.tablet.position);click(popover('Crop'));choose('[data-field="objectFit"][data-scope="style"]','contain');
  setDevice('mobile');assert.equal(snapshotStyles(imageSelector).fit,imageBase.mobile.fit);assert.equal(snapshotStyles(imageSelector).position,imageBase.mobile.position);
  check('Image movement and fit remain isolated to Desktop and Tablet');
  setDevice('desktop');
  const gridData=frameRead(`(()=>{const n=doc.querySelector('#view .prod-grid');return{section:n.closest('[data-cms-section]').dataset.cmsSection,ids:[...n.children].filter(c=>c.matches('.prod-card')).map(c=>Number(c.dataset.id))};})()`);
  const gridSelector=`[data-cms-section="${gridData.section}"] .prod-grid`;
  const columns=()=>frameRead(`win.getComputedStyle(doc.querySelector(${JSON.stringify(gridSelector)})).gridTemplateColumns.split(' ').length`);
  const gridBase={};for(const device of ['desktop','tablet','mobile']){setDevice(device);gridBase[device]=columns();}
  setDevice('desktop');selectSection(gridData.section);click(popover('Grid'));fill('[data-field="columns"][data-scope="presentation"]','3');assert.equal(columns(),3);
  setDevice('tablet');assert.equal(columns(),gridBase.tablet);setDevice('mobile');assert.equal(columns(),gridBase.mobile);
  check('Product grid column edits preserve the other two device layouts');
  setDevice('desktop');selectSection(gridData.section);
  frameRead(`win.__cmsQaCards=[...doc.querySelector(${JSON.stringify(gridSelector)}).children].filter(c=>c.matches('.prod-card'))`);
  click('[data-action="product-reorder"]');frameWait("doc.body.classList.contains('cms-product-reordering')&&doc.querySelectorAll('.cms-product-position').length>1");
  const reorderIds=()=>frameRead(`Array.from(doc.querySelectorAll(${JSON.stringify(gridSelector+'>.prod-card')}),n=>Number(n.dataset.id))`);
  const before=reorderIds();assert.ok(before.length>2);
  frameClick(gridSelector+`>.prod-card[data-id="${before[1]}"] [data-cms-product-move="-1"]`);
  const expected=[before[1],before[0],...before.slice(2)];assert.deepEqual(reorderIds(),expected);
  check('Home uses the existing numbered reorder mode and move controls');
  assert.ok(frameRead(`Array.from(doc.querySelectorAll(${JSON.stringify(gridSelector+'>.prod-card')})).every(n=>win.__cmsQaCards.includes(n))`));
  click('[data-action="product-reorder-done"]');saved();
  check('Reordering retains every native product card object');
  const draft=frameRead('win.CMCms.document()');assert.deepEqual(draft.productOrders['section:'+gridData.section],expected);
  const privateState=await (await fetch(base+'/cms-api.php?a=published&page=home')).json();assert.equal(privateState.published,null);
  check('Responsive and Home ordering changes stay in the private draft');
  run('screenshot',path.join(output,'desktop-editing.png'));
  run('open',base+'/visual-editor?page=home');editorReady('home');saved();
  for(const [device,font]of [['desktop','57px'],['tablet','39px'],['mobile','24px']]){setDevice(device);assert.equal(snapshotStyles(headingSelector).font,font);selectSection(heading.section);assert.ok(evaluate(`document.querySelector('#inspector').textContent.includes('Editing ${device[0].toUpperCase()+device.slice(1)}')`));run('screenshot',path.join(output,device+'-reloaded.png'));}
  assert.deepEqual(reorderIds(),expected);check('Save and reload preserve all three device overrides and Home order');
  publish();
  run('open',fixture.publicUrl+'/');wait("window.CMCms?.document()?.overrides!==null&&document.querySelector('#view .prod-card')");
  const publicHeading=headingSelector;for(const [width,font]of [[1280,'57px'],[768,'39px'],[390,'24px']]){run('set','viewport',String(width),'1000');wait(`getComputedStyle(document.querySelector(${JSON.stringify(publicHeading)})).fontSize===${JSON.stringify(font)}`);}
  check('Published storefront renders the saved device fonts at each breakpoint');
  assert.deepEqual(evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(gridSelector+'>.prod-card')}),n=>Number(n.dataset.id))`),expected);
  check('Published Home uses its saved section order');
  const addSelector=gridSelector+'>.prod-card:not([hidden]) [data-add]';run('click',addSelector);wait("Number(document.querySelector('#cartCount')?.textContent)>0");
  check('The original Add to cart handler still works after Home reordering');
  const report={status:'PASS',checks,output};await writeFile('audit/cms-responsive-browser-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:checks.length,output}));
} catch(error){await writeFile('audit/cms-responsive-browser-results.json',JSON.stringify({status:'FAIL',checks,error:error.stack,output},null,2));try{run('screenshot',path.join(output,'failure.png'));}catch{}throw error;}
