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
const session = process.env.CM_CMS_BROWSER_SESSION || 'cms-canva-qa';
const output = path.resolve('audit-evidence/cms-canva-browser-' + Date.now());
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
const check = (name, condition = true, detail) => { checks.push({ name, status: condition ? 'PASS' : 'FAIL', ...(detail ? { detail } : {}) }); if (!condition && detail) console.log(JSON.stringify(detail)); assert.ok(condition, name); console.log('PASS: ' + name); };
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
const effectsValue = (section,element) => frameRead(`win.CMResponsive.resolve(win.CMCms.document().sections.find(s=>s.id===${JSON.stringify(section)}).elements[${JSON.stringify(element)}],'desktop').effects`);
const publish = () => { click('#publish'); confirm(); wait("document.querySelector('#toasts').textContent.includes('Published. The website now uses this version.')"); saved(); };
let recording = false;

try {
  check('Editor requires staff authentication', (await fetch(base + '/visual-editor')).status === 401);
  await new Promise((resolve, reject) => {
    const launcher = spawn(binary, ['--session', session, 'open', base + '/#/staff'], { stdio: 'ignore', windowsHide: true });
    launcher.once('error', reject); launcher.once('exit', code => code === 0 ? resolve() : reject(new Error('Local browser did not launch')));
  });
  run('set', 'viewport', '1600', '1000');
  // The recovered sign-in UI has a separate CSRF race. Authenticate through its
  // real endpoint, then install that actual session cookie in this test browser.
  const sessionResponse=await fetch(base+'/staff-auth.php?a=session');
  const sessionData=await sessionResponse.json();
  const cookie=sessionResponse.headers.getSetCookie().find(value=>value.startsWith('cm_staff='))?.split(';')[0];
  assert.ok(cookie,'Staff session cookie');
  const loginResponse=await fetch(base+'/staff-auth.php?a=login',{method:'POST',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json','X-CSRF-Token':sessionData.csrfToken},body:JSON.stringify({email:fixture.email,password:fixture.password})});
  const loginData=await loginResponse.json();assert.equal(loginResponse.status,200,loginData.error);assert.equal(loginData.authenticated,true);
  const authenticatedCookie=loginResponse.headers.getSetCookie().find(value=>value.startsWith('cm_staff='))?.split(';')[0]||cookie;
  run('cookies','set','cm_staff',authenticatedCookie.slice('cm_staff='.length),'--url',base,'--httpOnly','--sameSite','Lax');
  check('Existing staff authentication endpoint grants the synthetic account a real session');
  run('open', base + '/visual-editor'); editorReady('home'); saved();
  try { run('record', 'start', path.join(output, 'complete-workflow.webm')); recording = true; editorReady('home'); } catch (error) { console.log('Video unavailable: ' + error.message); }
  check('1–2. Open the visual editor and actual Home page', frameRead('win.CMCms.baseline().sections.some(s=>s.id==="home:hero") && doc.querySelectorAll(".prod-card").length>0'));
  check('Sidebar tools, properties rail and the website canvas share one window', evaluate("['Pages','Elements','Uploads','Sections','Layers'].every(name=>[...document.querySelectorAll('#nav .nav-item span')].some(n=>n.textContent===name)) && document.querySelector('#inspector').classList.contains('properties-panel') && document.querySelector('#inspector').parentElement.classList.contains('workspace') && !!document.querySelector('.canvas-area #siteFrame')"));
  run('screenshot', path.join(output, '01-editor-home.png'));

  const heading = headingTarget('home:hero'); assert.ok(heading, 'Actual Home heading must be editable');
  const headingSelector = selectorFor(heading.section, heading.element), editedHeading = 'Diwali Mega Sale · '+String(Date.now()).slice(-4);
  inlineText(headingSelector, editedHeading);
  check('3–4. Click a real heading and edit text directly on the page');
  click('#undo'); frameWait(`doc.querySelector(${JSON.stringify(headingSelector)}).textContent===${JSON.stringify(heading.text)}`);
  click('#redo'); frameWait(`doc.querySelector(${JSON.stringify(headingSelector)}).textContent===${JSON.stringify(editedHeading)}`);
  check('Undo and redo restore the inline text change');
  choose('[data-field="fontFamily"][data-scope="style"]', 'Sora');
  frameWait(`win.getComputedStyle(doc.querySelector(${JSON.stringify(headingSelector)})).fontFamily.includes('Sora')`);
  check('5. Change the heading font to Sora');
  fill('[data-simple-style="fontSize"]', '44');
  frameWait(`win.getComputedStyle(doc.querySelector(${JSON.stringify(headingSelector)})).fontSize==='44px'`);
  check('6. Change the heading size');
  if(effectsValue(heading.section,heading.element).gradient?.enabled){click(popover('Gradient'));run('uncheck','[data-field="enabled"][data-scope="effect-gradient"]');click(popover('Gradient'));}
  formValue('[data-field="color"][data-scope="style"]', '#1565c0');
  frameWait(`win.getComputedStyle(doc.querySelector(${JSON.stringify(headingSelector)})).color==='rgb(21, 101, 192)'`);
  check('7. Change text color through the color control');
  click(popover('Gradient')); run('check', '[data-field="enabled"][data-scope="effect-gradient"]');
  formValue('[data-field="start"][data-scope="effect-gradient"]', '#1565c0');
  formValue('[data-field="end"][data-scope="effect-gradient"]', '#ff6f00');
  choose('[data-field="angle"][data-scope="effect-gradient"]', '135');
  frameWait(`win.getComputedStyle(doc.querySelector(${JSON.stringify(headingSelector)})).backgroundImage.includes('linear-gradient')`);
  check('8. Apply a text gradient and its direction');
  run('screenshot', path.join(output, '02-heading-gradient.png')); click(popover('Gradient'));
  click(popover('Opacity')); formValue('[data-simple-opacity]', '82');
  frameWait(`win.getComputedStyle(doc.querySelector(${JSON.stringify(headingSelector)})).opacity==='0.82'`);
  check('9. Change text opacity'); click(popover('Opacity'));
  click('[data-device="mobile"]'); fill('[data-simple-style="fontSize"]', '29');
  frameWait(`win.innerWidth===390 && win.getComputedStyle(doc.querySelector(${JSON.stringify(headingSelector)})).fontSize==='29px'`);
  click('[data-device="tablet"]'); frameWait('win.innerWidth===768');
  click('[data-device="desktop"]'); frameWait(`win.innerWidth===1280 && win.getComputedStyle(doc.querySelector(${JSON.stringify(headingSelector)})).fontSize==='44px'`);
  check('Desktop, tablet and mobile preview work; mobile size does not change desktop');

  const imageTarget = frameRead(`(() => { const candidates=[...doc.querySelectorAll('#view img[data-cms-element]')].filter(n=>{const r=n.getBoundingClientRect();return r.width>64&&r.height>64&&win.CMCms.selectionInfo(n.closest('[data-cms-section]').dataset.cmsSection,n.dataset.cmsElement)?.descriptor.kind==='image';}); const n=candidates[0];return n?{section:n.closest('[data-cms-section]').dataset.cmsSection,element:n.dataset.cmsElement,src:n.getAttribute('src')}:null;})()`);
  assert.ok(imageTarget, 'Existing website image must be editable');
  const imageSelector = selectorFor(imageTarget.section, imageTarget.element);
  frameClick(imageSelector); run('wait', '[data-media="element"]');
  frameWait('!doc.querySelector(".cms-selection-box").hidden && doc.querySelectorAll("[data-cms-resize]").length===8');
  check('10. Select an existing image with a bounding box and eight resize handles');
  // First make room inside its container; subsequent movement remains bounded.
  const originalSize = frameRead(`({w:doc.querySelector(${JSON.stringify(imageSelector)}).offsetWidth,h:doc.querySelector(${JSON.stringify(imageSelector)}).offsetHeight})`);
  frameDrag('[data-cms-resize="se"]', -originalSize.w * .24, -originalSize.h * .24, false);
  frameWait(`doc.querySelector(${JSON.stringify(imageSelector)}).offsetWidth<${originalSize.w - 5}`);
  const moves = [];
  for (const [direction, dx, dy] of [['right',32,0],['left',-20,0],['down',0,24],['up',0,-15]]) {
    const before = effectsValue(imageTarget.section,imageTarget.element).position || {x:0,y:0};
    frameDrag(imageSelector, dx, dy);
    frameWait(`JSON.stringify(win.CMResponsive.resolve(win.CMCms.document().sections.find(s=>s.id===${JSON.stringify(imageTarget.section)}).elements[${JSON.stringify(imageTarget.element)}],'desktop').effects.position)!==${JSON.stringify(JSON.stringify(before))}`);
    const after = effectsValue(imageTarget.section,imageTarget.element).position;
    moves.push({direction,before,after});
  }
  check('11. Drag image left, right, up and down with real pointer gestures', moves.every(m=>m.before.x!==m.after.x||m.before.y!==m.after.y), moves);
  const beforeResize = frameRead(`doc.querySelector(${JSON.stringify(imageSelector)}).offsetWidth`);
  frameDrag('[data-cms-resize="se"]', 18, 12, false);
  frameWait(`doc.querySelector(${JSON.stringify(imageSelector)}).offsetWidth>${beforeResize + 2}`);
  check('12. Resize an image by dragging its actual corner handle');
  click('[data-media="element"]'); run('wait', '.media-tile');
  const replacement = evaluate(`(() => {const tiles=[...document.querySelectorAll('.media-tile')];const index=tiles.findIndex(n=>!n.querySelector('img').src.endsWith(${JSON.stringify(imageTarget.src)}));return Math.max(0,index);})()`);
  click(`.media-tile:nth-child(${replacement+1})`);
  const replacementUrl = evaluate('document.querySelector(".media-tile.active img").getAttribute("src")');
  click('#chooseMedia'); frameWait(`doc.querySelector(${JSON.stringify(imageSelector)}).src===new URL(${JSON.stringify(replacementUrl)},location.href).href`);
  check('13. Replace the image using the website media library');
  run('screenshot', path.join(output, '03-image-selected.png'));

  click('[data-nav="sections"]'); click('[data-nav="add"]'); click('[data-add-section="text"]');
  const addedSection = evaluate('document.querySelector(".section-row.active").dataset.sectionRow');
  const sectionHeading = headingTarget(addedSection); assert.ok(sectionHeading);
  inlineText(selectorFor(sectionHeading.section,sectionHeading.element), 'Festive offers, made for you');
  check('14. Add a real section and edit its heading on the canvas');
  click(`[data-select-section="${addedSection}"]`);
  const beforeOrder = frameRead('win.CMCms.document().sections.map(s=>s.id)');
  click(`#inspector [data-section-action="up"][data-id="${addedSection}"]`);
  const afterOrder = frameRead('win.CMCms.document().sections.map(s=>s.id)');
  check('15. Move the section up in the actual page', afterOrder.indexOf(addedSection)===beforeOrder.indexOf(addedSection)-1);
  saved(); publish();
  run('open', fixture.publicUrl + '/');
  run('wait', '--load', 'networkidle');
  wait(`document.querySelector(${JSON.stringify(headingSelector)})?.textContent===${JSON.stringify(editedHeading)}`);
  // Published hero text is present in server HTML before the CMS style pass.
  wait(`(()=>{const node=document.querySelector(${JSON.stringify(headingSelector)});return node&&getComputedStyle(node).fontSize==='44px'&&getComputedStyle(node).opacity==='0.82';})()`);
  const homePublished = evaluate(`(() => {const h=document.querySelector(${JSON.stringify(headingSelector)}),img=document.querySelector(${JSON.stringify(imageSelector)}),css=getComputedStyle(h);return {text:h.textContent,font:css.fontFamily,size:css.fontSize,gradient:css.backgroundImage,opacity:css.opacity,image:img.getAttribute('src'),position:getComputedStyle(img).translate};})()`);
  check('Published Home persists text, font, size, gradient, opacity and replacement image', homePublished.font.includes('Sora')&&homePublished.size==='44px'&&homePublished.gradient.includes('135deg')&&homePublished.opacity==='0.82'&&new URL(homePublished.image,fixture.publicUrl).pathname===new URL(replacementUrl,base).pathname, {...homePublished,replacementUrl});
  run('reload'); wait(`document.querySelector(${JSON.stringify(headingSelector)})?.textContent===${JSON.stringify(editedHeading)}`);
  check('Published Home survives a clean visitor reload');
  run('screenshot', path.join(output, '04-published-home.png')); run('open',base+'/visual-editor');editorReady('home');

  const slug = 'diwali-offers-' + Date.now().toString(36);
  click('[data-nav="pages"]'); click('[data-page-create]'); run('wait', '#pageDialog[open]');
  fill('#newPageName', 'Diwali Offers'); fill('#newPageSlug', slug); click('#pageFormSubmit');
  wait("!document.querySelector('#pageDialog').open && document.querySelector('#pageTitle').textContent==='Diwali Offers' && document.querySelector('#loading').hidden");
  const pageId = frameRead('win.CMCms.page()');
  check('16. Create an actual website page with a clean URL', pageId.startsWith('custom-'), {pageId,slug});
  const newHeading = headingTarget();
  assert.ok(newHeading, 'New page has an editable heading');
  const newSelector = selectorFor(newHeading.section,newHeading.element), newText='Your Diwali celebration starts here';
  inlineText(newSelector,newText);
  choose('[data-field="fontFamily"][data-scope="style"]','Sora'); fill('[data-simple-style="fontSize"]','38');
  check('17. Edit the newly created page directly');
  if(!evaluate('document.querySelector("#save").disabled'))click('#save'); saved();
  check('18. Save the page and show the saved status');
  click('#preview'); frameWait('win.CM_EDITOR_INTERACTIVE===true');
  check('19. Preview the actual page as a visitor');
  run('screenshot', path.join(output, '05-new-page-preview.png')); click('#preview');
  publish(); check('20. Publish the new page through the authenticated CMS');
  const publicPage=fixture.publicUrl+'/'+slug;
  run('open',publicPage); wait(`document.querySelector(${JSON.stringify(newSelector)})?.textContent===${JSON.stringify(newText)}`);
  check('21. Open the real clean public page URL', new URL(evaluate('location.href')).pathname==='/'+slug);
  run('reload'); wait(`document.querySelector(${JSON.stringify(newSelector)})?.textContent===${JSON.stringify(newText)}`);
  const pagePublished=evaluate(`({text:document.querySelector(${JSON.stringify(newSelector)}).textContent,font:getComputedStyle(document.querySelector(${JSON.stringify(newSelector)})).fontFamily,size:getComputedStyle(document.querySelector(${JSON.stringify(newSelector)})).fontSize,chrome:!!document.querySelector('.cms-selection-box')})`);
  check('22. Verify persisted public content and styles after reload',pagePublished.text===newText&&pagePublished.font.includes('Sora')&&pagePublished.size==='38px'&&!pagePublished.chrome,pagePublished);
  run('screenshot',path.join(output,'06-published-new-page.png'));
  click('a.logo[aria-label="CrackersMela home"]');wait("location.pathname==='/' && !!document.querySelector('[data-cms-section=\"home:hero\"]')");
  check('Public custom-page logo returns to the actual Home page');
  run('open',base+'/visual-editor?page='+encodeURIComponent(pageId));editorReady(pageId);

  click('.simple-page.active .page-options summary'); click('[data-page-action="unpublish"]'); confirm();
  wait("document.querySelector('#toasts').textContent.includes('Page unpublished.')");
  check('Unpublish withdraws the public page', (await fetch(publicPage)).status===404);
  click('.simple-page.active .page-options summary'); click('[data-page-action="delete"]'); run('wait','#confirmDialog[open]');
  check('Deleting an actual page requires confirmation',evaluate('document.querySelector("#confirmTitle").textContent.includes("Delete Diwali Offers")'));
  click('#confirmDialog .dialog-actions [value="cancel"]');
  check('Cancel preserves the page',evaluate('!!document.querySelector(".simple-page.active")'));
  click('[data-page-action="delete"]');confirm();editorReady('home');
  check('Confirmed deletion returns to Home',!evaluate(`!!document.querySelector('[data-page="${pageId}"]')`));
  run('set','viewport','390','844');
  check('Editor keeps its four tools accessible on a phone width',evaluate('document.documentElement.scrollWidth<=innerWidth&&document.querySelector("#nav").getBoundingClientRect().width<=innerWidth'));
  run('screenshot',path.join(output,'07-editor-phone.png')); run('set','viewport','1600','1000');
  const errors=run('errors').errors||[];
  check('No uncaught browser exceptions',errors.length===0,errors);
  if(recording){run('record','stop');recording=false;}
  const result={scope:fixture.scope,status:'PASS',output,checks};
  await writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));
  await writeFile('audit/cms-canva-browser-results.json',JSON.stringify(result,null,2));
  console.log(`PASS: ${checks.length} Canva workflow checks. Evidence: ${output}`);
} catch(error) {
  try{run('screenshot',path.join(output,'failure.png'));}catch{/* Preserve original failure. */}
  let diagnosis;try{diagnosis={errors:run('errors'),state:evaluate("({url:location.href,controls:document.querySelector('#inspector')?.innerHTML,status:document.querySelector('#saveStatus')?.textContent,doc:document.querySelector('#siteFrame')?.contentWindow.CMCms?.document(),selected:document.querySelector('#siteFrame')?.contentDocument.querySelector('.cms-selected')?.outerHTML,active:document.querySelector('#siteFrame')?.contentDocument.activeElement?.outerHTML})")};}catch{/* Page may have closed. */}
  if(recording){try{run('record','stop');}catch{/* Preserve original failure. */}}
  const result={scope:fixture.scope,status:'FAIL',output,checks,error:error.message,diagnosis};
  await writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));
  await writeFile('audit/cms-canva-browser-results.json',JSON.stringify(result,null,2));
  throw error;
} finally {try{run('close');}catch{/* Already stopped. */}}
