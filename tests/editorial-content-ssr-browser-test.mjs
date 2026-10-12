import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const fixture=JSON.parse(await readFile(process.env.CM_EDITOR_FIXTURE||'audit-evidence/product-experience-20261010/engine-fixture.json','utf8')),base=fixture.baseUrl;
const publicBase=fixture.publicUrl;
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));assert.equal((await(await fetch(base+'/__fixture-health')).json()).isolated,true);
const binary=path.join(process.env.APPDATA,'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe'),session='editorial-ssr-qa',output=path.resolve('audit-evidence/editorial-ssr-'+Date.now());await mkdir(output,{recursive:true});
const run=(...args)=>{const r=JSON.parse(execFileSync(binary,['--session',session,...args,'--json'],{encoding:'utf8',windowsHide:true,maxBuffer:12*1024*1024}));assert.equal(r.success,true,r.error);return r.data;};
const evaluate=code=>run('eval','-b',Buffer.from(code).toString('base64')).result;
const wait=code=>run('wait','--fn',code);const checks=[];
const check=(name,pass,detail)=>{checks.push({name,status:pass?'PASS':'FAIL',detail});console.log(`${pass?'PASS':'FAIL'}: ${name}`);};
const compare=async(route,id)=>{
 const html=await(await fetch(publicBase+route)).text();await writeFile(path.join(output,(id.startsWith('custom-')?'custom':id)+'.html'),html);
 run('open',publicBase+route);wait(`window.CMCms?.page()===${JSON.stringify(id)} && !!window.CMCms.baseline()`);
 run('wait','--load','networkidle');
 if(id.startsWith('custom-'))wait("!!document.querySelector('[data-cms-element=\"a-ssr-image\"]') && document.querySelector('#cm-published-styles')?.textContent.includes('display:none')");
 // Product cards use different indentation in PHP and JavaScript. Compare
 // every nonempty text node without treating formatting whitespace as copy.
 const actual=evaluate(`(async()=>{const raw=new DOMParser().parseFromString(await(await fetch(${JSON.stringify(route)})).text(),'text/html');const normalize=v=>(v||'').replace(/\\s+/g,' ').trim();const productText=n=>{const walker=n.ownerDocument.createTreeWalker(n,NodeFilter.SHOW_TEXT),parts=[];while(walker.nextNode()){const text=normalize(walker.currentNode.textContent);if(text)parts.push(text);}return parts.join(' ');};const signature=doc=>[...doc.querySelectorAll('#view [data-cms-section]')].map(s=>({id:s.dataset.cmsSection,elements:[s,...s.querySelectorAll('[data-cms-element]')].filter(n=>n.dataset.cmsElement).map(n=>({id:n.dataset.cmsElement,tag:n.tagName,text:s.classList.contains('cms-section--productGrid')?productText(n):normalize(n.textContent)}))}));return {raw:signature(raw),browser:signature(document),rawRows:[...raw.querySelectorAll('#plTable tbody tr')].map(r=>[...r.children].map(c=>normalize(c.textContent))),browserRows:[...document.querySelectorAll('#plTable tbody tr')].map(r=>[...r.children].map(c=>normalize(c.textContent))),document:window.CMCms.document()||window.CMCms.baseline()};})()`);
 check(id+' initial content and native element paths match browser rendering',actual.raw.length>0&&JSON.stringify(actual.raw)===JSON.stringify(actual.browser),{raw:actual.raw,browser:actual.browser});
 if(id==='price-list')check('Every price-list item, brand, category, MRP, price, saving and stock matches the current catalog',actual.rawRows.length>0&&JSON.stringify(actual.rawRows)===JSON.stringify(actual.browserRows),{count:actual.rawRows.length,firstRaw:actual.rawRows[0],firstBrowser:actual.browserRows[0]});
 return {html,...actual};
};
let cookie='',csrf='';async function api(action,body,endpoint='cms-api.php'){const r=await fetch(`${base}/${endpoint}?a=${action}`,{method:body?'POST':'GET',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json','X-CSRF-Token':csrf},body:body?JSON.stringify(body):undefined});const c=r.headers.getSetCookie().find(v=>v.startsWith('cm_staff='));if(c)cookie=c.split(';')[0];const data=await r.json();if(data.csrfToken)csrf=data.csrfToken;return {status:r.status,...data};}
try{
 await new Promise((resolve,reject)=>{const p=spawn(binary,['--session',session,'open',base+'/'],{stdio:'ignore',windowsHide:true});p.once('error',reject);p.once('exit',c=>c===0?resolve():reject(Error('Browser launch failed')));});
 run('set','viewport','1400','1000');let about;
 for(const id of ['about','contact','faq','shipping','returns','safety','terms','privacy','wholesale','price-list']){const result=await compare('/'+id,id);if(id==='about')about=result;}
 await api('session',null,'staff-auth.php');assert.equal((await api('login',{email:fixture.email,password:fixture.password},'staff-auth.php')).authenticated,true);
 const loaded=await api('load&page=about'),slug='ssr-published-'+Date.now();
 const duplicated=await api('page-duplicate',{page:'about',expectedVersion:loaded.version,name:'Published SSR QA',slug,document:about.document});assert.equal(duplicated.status,201,duplicated.error);
 const doc=duplicated.draft,heading=doc.sections.find(s=>s.source==='about:page-head'),copy=doc.sections.find(s=>s.source==='about:content-copy');
 heading.elements.e0.text='Published SSR heading';copy.elements.e0.hidden=true;
 copy.elements['a-ssr-image']={kind:'image',name:'Published SSR image',added:true,parentId:'eroot',beforeId:'e1',flow:true,src:'/images/logo.png',alt:'Published SSR image'};
 Object.assign(copy.elements,{
  'a-ssr-link':{kind:'button',name:'Linked image tree',added:true,parentId:'eroot',flow:true,href:'/about'},
  'a-ssr-linked-image':{kind:'image',name:'Picture in link',added:true,parentId:'a-ssr-link',flow:true,src:'/images/logo.png',alt:'Picture in link'},
  'a-ssr-link-caption':{kind:'text',name:'Caption in link',added:true,parentId:'a-ssr-link',flow:true,text:'Published linked caption'}
 });
 doc.sections.splice(doc.sections.length-1,0,{id:'s-ssr-added',type:'imageText',name:'Added public story',region:'main',hidden:false,content:{heading:'Added public heading',text:'Added public text',src:'/images/logo.png',alt:'Added section picture'},elements:{},styles:{desktop:{paddingTop:'12px'}}});
 doc.sections.splice(doc.sections.length-1,0,{id:'s-ssr-icon',type:'icon',name:'Public icon',region:'main',hidden:false,content:{icon:'gift'},elements:{},styles:{}});
 doc.sections.splice(doc.sections.length-1,0,{id:'s-ssr-products',type:'productGrid',name:'Public product grid',region:'main',hidden:false,content:{heading:'Public product picks',category:'all',sort:'price-desc',limit:4,columns:3,showPrice:false,showSalePrice:false,showCart:false,showBadge:false,imageRatio:'portrait',cardStyle:'outlined'},overrides:{mobile:{content:{columns:2,showPrice:true}}},elements:{},styles:{}});
 doc.design={primary:'#123456',text:'#345678',background:'#f4f1e9',fontFamily:'Georgia',headingFont:'Sora',radius:'18px',containerWidth:'1180px'};
 doc.sections.find(s=>s.id==='s-ssr-added').effects={desktop:{backgroundImage:'/images/logo.png',gradient:{enabled:true,start:'#ffffff88',end:'#ffffffaa',angle:120}}};
 let saved=await api('save',{page:duplicated.page,expectedVersion:duplicated.version,expectedGlobalVersion:duplicated.globals.version,document:doc});assert.equal(saved.status,200,saved.error);
 check('Unpublished custom page is unavailable in raw HTML',(await fetch(base+'/'+slug)).status===404);
 let published=await api('publish',{page:duplicated.page,expectedVersion:saved.version,expectedGlobalVersion:saved.globals.version});assert.equal(published.status,200,published.error);
 let custom=await compare('/'+slug,duplicated.page);check('Published custom page includes text and images from native and added sections',custom.html.includes('Published SSR heading')&&custom.html.includes('Added public text')&&custom.html.includes('Published SSR image'));
 check('Linked image trees and icon sections render in browser and first paint',evaluate("(()=>{const a=document.querySelector('[data-cms-element=\"a-ssr-link\"]');return a?.tagName==='A'&&!!a.querySelector('[data-cms-element=\"a-ssr-linked-image\"]')&&a.textContent.includes('Published linked caption')&&!!document.querySelector('[data-cms-section=\"s-ssr-icon\"] svg path');})()")&&custom.html.includes('Published linked caption')&&custom.html.includes('data-cms-section="s-ssr-icon"'));
 const presentation=evaluate("(()=>{const grid=document.querySelector('[data-cms-section=\"s-ssr-products\"]'),story=document.querySelector('[data-cms-section=\"s-ssr-added\"]'),view=getComputedStyle(document.querySelector('#view'));return {cards:grid?.querySelectorAll('.prod-card').length,price:grid?.querySelector('.price-now')&&getComputedStyle(grid.querySelector('.price-now')).display,background:getComputedStyle(story).backgroundImage,font:view.fontFamily,color:view.color,width:view.maxWidth};})()");
 check('Published product cards and presentation options appear in initial HTML',presentation.cards===4&&presentation.price==='none'&&custom.html.includes('.price-now{display:none}')&&custom.html.includes('repeat(2,minmax(0,1fr))'),presentation);
 check('Published page design and layered background match the initial HTML',presentation.font==='Georgia'&&presentation.color==='rgb(52, 86, 120)'&&presentation.width==='1180px'&&presentation.background.includes('linear-gradient')&&presentation.background.includes('/images/logo.png')&&custom.html.includes('--font-body:Georgia;')&&custom.html.includes('background-size:cover!important;')&&custom.html.includes('url("/images/logo.png")'),presentation);
 const hidden=evaluate("(()=>{const n=document.querySelector('[data-cms-section=\"about:content-copy\"] [data-cms-element=\"e0\"]');return {display:getComputedStyle(n).display,text:n.textContent};})()");
 check('Hidden native text is hidden in both first paint and browser',hidden.display==='none'&&custom.html.includes('[data-cms-element="e0"]{display:none!important;'),hidden);
 const privateDoc=structuredClone(saved.draft);privateDoc.sections.find(s=>s.source==='about:page-head').elements.e0.text='PRIVATE DRAFT MUST NOT LEAK';
 saved=await api('save',{page:duplicated.page,expectedVersion:published.version,expectedGlobalVersion:published.globals.version,document:privateDoc});assert.equal(saved.status,200,saved.error);
 const privateRaw=await(await fetch(base+'/'+slug)).text();check('A newer private draft never appears in public raw HTML',!privateRaw.includes('PRIVATE DRAFT MUST NOT LEAK')&&privateRaw.includes('Published SSR heading'));
 const finalDoc=structuredClone(saved.draft);finalDoc.sections.find(s=>s.source==='about:page-head').elements.e0.text='Published replacement heading';finalDoc.sections.find(s=>s.source==='about:content-copy').elements['a-ssr-image'].src='/images/brands/standard-fireworks.png';
 saved=await api('save',{page:duplicated.page,expectedVersion:saved.version,expectedGlobalVersion:saved.globals.version,document:finalDoc});assert.equal(saved.status,200,saved.error);published=await api('publish',{page:duplicated.page,expectedVersion:saved.version,expectedGlobalVersion:saved.globals.version});assert.equal(published.status,200,published.error);
 custom=await compare('/'+slug,duplicated.page);const src=evaluate("document.querySelector('[data-cms-element=\"a-ssr-image\"]').getAttribute('src')");check('Published replacement image and heading agree in raw HTML and browser',src==='/images/brands/standard-fireworks.png'&&custom.html.includes('src="/images/brands/standard-fireworks.png"')&&custom.html.includes('Published replacement heading')&&!custom.html.includes('PRIVATE DRAFT MUST NOT LEAK'));
 const errors=run('errors');check('No uncaught browser errors',!(errors.errors||[]).length,errors);
 await writeFile(path.join(output,'results.json'),JSON.stringify({checks},null,2));assert.ok(checks.every(c=>c.status==='PASS'),checks.filter(c=>c.status==='FAIL').map(c=>c.name).join('; '));console.log(`${checks.length}/${checks.length} passed. Evidence: ${output}`);
}catch(error){try{console.log(JSON.stringify({errors:run('errors'),page:evaluate("({url:location.href,page:window.CMCms?.page(),title:document.title})")}));}catch{}throw error;}finally{await writeFile(path.join(output,'results.json'),JSON.stringify({checks},null,2));try{run('close');}catch{}}
