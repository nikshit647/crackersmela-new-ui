import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

// Local-only UI/CMS compatibility checks. No order submission or real mail.
const fixture = JSON.parse(await readFile(process.env.CM_CATEGORY_FIXTURE || 'audit-evidence/category-fixture-active.json', 'utf8'));
const base = fixture.publicUrl;
for (const value of [base, fixture.baseUrl]) assert.ok(['localhost', '127.0.0.1'].includes(new URL(value).hostname));
const health = await (await fetch(base + '/__fixture-health')).json();
assert.equal(health.isolated, true); assert.equal(health.mail, 'disabled');
assert.equal(path.dirname(path.resolve(fixture.fixture)), path.resolve('audit-evidence'));
assert.ok(path.basename(fixture.fixture).startsWith('cms-fixture-'));
const binary = path.join(process.env.APPDATA, 'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const session = process.env.CM_CATEGORY_SESSION || 'category-ui-13d9fd6ea971';
const output = path.resolve('audit-evidence/category-browser-' + Date.now());
await mkdir(output, {recursive:true});
const checks = [];
const run = (...args) => {
  const response = JSON.parse(execFileSync(binary, ['--session', session, ...args, '--json'], {encoding:'utf8', windowsHide:true, timeout:45000, maxBuffer:8*1024*1024}));
  assert.equal(response.success, true, response.error); return response.data;
};
const evaluate = code => run('eval', '-b', Buffer.from(code).toString('base64')).result;
const wait = code => run('wait', '--fn', code);
const check = (name, condition, detail = {}) => { checks.push({name, status:condition?'PASS':'FAIL', ...detail}); assert.ok(condition, name); console.log('PASS: ' + name); };
const openHome = () => { run('open', base + '/'); wait('window.CMCms?.baseline()?.sections.some(s=>s.id==="home:shop-categories")'); };
const settle = () => wait('[...document.querySelectorAll(".home-category-card")].every(e=>e.getAnimations({subtree:true}).every(a=>a.playState!=="running"))');
const scrollSection = () => { evaluate('document.querySelector("#shop-categories").scrollIntoView({block:"start",behavior:"instant"})'); settle(); };
const currentCategory = () => evaluate('window.CMCms.baseline().sections.find(s=>s.id==="home:shop-categories")');
const categoryApp = path.join(fixture.documentRoot, 'js/app.js');
const currentApp = await readFile(categoryApp, 'utf8');
let sourceRestored = true;
try {
  await new Promise((resolve, reject) => { const child = spawn(binary, ['--session', session, 'open', base + '/'], {stdio:'ignore', windowsHide:true}); child.once('error', reject); child.once('exit', code => code===0 ? resolve() : reject(new Error('Browser launch failed'))); });
  run('wait', '--load', 'networkidle'); run('set', 'media', 'light'); run('set', 'viewport', '1280', '1000');
  if (evaluate('[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="Decline")')) run('find', 'role', 'button', 'click', '--name', 'Decline');
  openHome();
  const categories = evaluate('[...document.querySelectorAll(".home-category-card")].map(a=>({href:a.getAttribute("href"),id:a.querySelector("img").dataset.imageCategory,name:a.querySelector("h3").textContent,count:parseInt(a.querySelector(".home-category-card__count").textContent,10)}))');
  check('All 11 original category identities are rendered', categories.length===11);
  const current = currentCategory();

  // Re-render just the prior category block in this private fixture to compare
  // real CMS element identities. Restore candidate source even after a failure.
  const priorApp = await readFile('review/public/js/app.js', 'utf8');
  const block = source => { const start=source.indexOf('  const CATEGORY_ART_'); const end=source.indexOf('  const countdown =', start); assert.ok(start>0&&end>start); return {start,end,text:source.slice(start,end)}; };
  const a = block(currentApp), b = block(priorApp);
  await writeFile(categoryApp, currentApp.slice(0,a.start)+b.text+currentApp.slice(a.end)); sourceRestored=false;
  openHome(); const prior = currentCategory();
  await writeFile(categoryApp,currentApp); sourceRestored=true; openHome();
  check('Existing CMS section and every editable element ID remain identical', JSON.stringify(current)===JSON.stringify(prior), {sectionId:current.id, elementCount:Object.keys(current.elements).length});

  for (const [width,height] of [[360,800],[375,812],[390,844],[412,915],[425,904],[768,1024],[1024,900],[1280,1000]]) {
    run('set','viewport',String(width),String(height)); scrollSection();
    wait('[...document.querySelectorAll(".home-category-card img")].every(i=>i.complete&&i.naturalWidth>0)');
    const layout = evaluate(`(()=>{const grid=document.querySelector('.home-category-grid'); const cards=[...grid.children];return {viewport:innerWidth,columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,overflow:document.documentElement.scrollWidth>innerWidth+1,cards:cards.map(e=>{const r=e.getBoundingClientRect(),title=e.querySelector('h3'),image=e.querySelector('img'),cta=e.querySelector('.home-category-card__arrow').getBoundingClientRect();return {width:r.width,height:r.height,inside:r.left>=0&&r.right<=innerWidth,titleFits:title.scrollWidth<=title.clientWidth+1&&title.scrollHeight<=title.clientHeight+1,imageLoaded:image.complete&&image.naturalWidth>0,artWidth:image.getBoundingClientRect().width,ctaWidth:cta.width,ctaHeight:cta.height,oneTarget:e.matches('a')&&!e.querySelector('a,button')};})};})()`);
    const expected=width<=680?1:width<=1100?2:3;
    check('Category layout at '+width+'px', !layout.overflow&&layout.columns===expected&&layout.cards.every(c=>c.inside&&c.titleFits&&c.imageLoaded&&c.ctaWidth>=44&&c.ctaHeight>=44&&c.oneTarget), layout);
    run('screenshot',path.join(output,'categories-'+width+'.png'));
  }
  run('set','viewport','1280','1000'); scrollSection();
  run('hover','.home-category-card'); settle();
  const hover = evaluate('(()=>{const c=document.querySelector(".home-category-card"),a=c.querySelector(".home-category-card__arrow");return {transform:getComputedStyle(c).transform,duration:getComputedStyle(c).transitionDuration,arrowBg:getComputedStyle(a).backgroundColor,arrowColor:getComputedStyle(a).color};})()');
  check('Hover provides restrained 200ms movement and a clear arrow state', hover.transform==='matrix(1, 0, 0, 1, 0, -2)'&&hover.duration.split(',').every(x=>x.trim()==='0.2s')&&hover.arrowColor==='rgb(255, 255, 255)', hover);
  run('focus','.home-category-card'); run('press','Tab'); settle();
  const focus=evaluate('({category:document.activeElement.matches(".home-category-card"),visible:document.activeElement.matches(":focus-visible"),outline:getComputedStyle(document.activeElement).outlineWidth,offset:getComputedStyle(document.activeElement).outlineOffset})');
  check('Keyboard focus has an unambiguous visible outline',focus.category&&focus.visible&&focus.outline==='3px'&&focus.offset==='3px',focus);
  run('screenshot',path.join(output,'category-keyboard-focus.png'));
  run('press','Enter'); wait('location.hash.includes("cat=kids-special")&&document.querySelectorAll(".shop-main .prod-card").length>0');
  check('Keyboard activation opens the intended category',evaluate('location.hash')==='#/products?cat=kids-special');
  openHome();run('set','media','light','reduced-motion');scrollSection();run('hover','.home-category-card');settle();
  const reduced=evaluate('(()=>{const e=document.querySelector(".home-category-card"),a=e.querySelector(".home-category-card__arrow"),s=a.querySelector("svg");return {matches:matchMedia("(prefers-reduced-motion:reduce)").matches,durations:[e,a,s].map(x=>getComputedStyle(x).transitionDuration),transforms:[e,s].map(x=>getComputedStyle(x).transform)};})()');
  // The global reduced-motion reset uses 0.01ms !important for all elements;
  // treat that established effectively-instant duration as motion disabled.
  check('Reduced motion removes visible category transitions and hover movement',reduced.matches&&reduced.durations.every(x=>parseFloat(x)<=0.00001)&&reduced.transforms.every(x=>x==='none'),reduced);
  run('set','media','light');run('set','device','iPhone 12');
  for(const category of categories){
    openHome();const selector='.home-category-card[href="'+category.href+'"]';run('scrollintoview',selector);settle();run('tap',selector);
    wait('document.querySelectorAll(".shop-main .prod-card").length>0');
    const listing=evaluate('({hash:location.hash,count:document.querySelectorAll(".shop-main .prod-card").length,ids:[...document.querySelectorAll(".shop-main .prod-card")].map(e=>e.dataset.id)})');
    check('Mobile tap/filter: '+category.name,listing.hash===category.href&&listing.count===category.count,{category:category.id,count:listing.count});
  }
  openHome(); scrollSection();
  const hit=evaluate('(()=>{const e=document.querySelector(".home-category-card"),r=e.getBoundingClientRect();return {x:r.left+8,y:r.top+8};})()');
  run('mouse','move',String(Math.round(hit.x)),String(Math.round(hit.y)));run('mouse','down');run('mouse','up');
  wait('location.hash.includes("cat=gift-boxes")');check('Card whitespace is part of the link target',true);
  const errors=run('errors').errors||[];check('Category browser run has no uncaught exceptions',errors.length===0,{errors});
  await writeFile('audit/category-browser-results.json',JSON.stringify({status:'PASS',checks,output,scope:'Private local fixture only; no orders submitted'},null,2));
  console.log('PASS: '+checks.length+' checks. '+output);
} catch(error) {
  try {run('screenshot',path.join(output,'failure.png'));}catch{}
  await writeFile('audit/category-browser-results.json',JSON.stringify({status:'FAIL',checks,output,error:error.stack},null,2));throw error;
} finally {
  if(!sourceRestored) await writeFile(categoryApp,currentApp);
  try{run('close');}catch{}
}
