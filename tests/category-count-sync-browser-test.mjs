import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

// Regression for a saved native CMS snapshot becoming older than the catalogue.
// Alter only a private fixture's category membership and restore its exact bytes.
const fixture=JSON.parse(await readFile('audit-evidence/category-fixture-active.json','utf8'));
assert.equal(path.dirname(path.resolve(fixture.fixture)),path.resolve('audit-evidence'));
assert.ok(path.basename(fixture.fixture).startsWith('cms-fixture-'));
const base=fixture.publicUrl;assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
assert.equal((await(await fetch(base+'/__fixture-health')).json()).isolated,true);
const file=path.join(fixture.fixture,'data/products.json'),original=await readFile(file,'utf8');
const binary=path.join(process.env.APPDATA,'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe'),session='category-count-13d9fd6e';
const run=(...args)=>{const r=JSON.parse(execFileSync(binary,['--session',session,...args,'--json'],{encoding:'utf8',windowsHide:true,timeout:45000,maxBuffer:4*1024*1024}));assert.ok(r.success,r.error);return r.data;};
const evaluate=code=>run('eval','-b',Buffer.from(code).toString('base64')).result;
const wait=code=>run('wait','--fn',code);
const readCount=()=>evaluate('(()=>{const node=document.querySelector(".home-category-card img[data-image-category=rockets]").closest("a").querySelector(".home-category-card__count"),id=node.dataset.cmsElement,section=win=>win.sections.find(s=>s.id==="home:shop-categories");return {rendered:node.textContent,baseline:section(CMCms.baseline()).elements[id].text,saved:section(CMCms.document()).elements[id].text};})()');
const result={};
try{
  await new Promise((resolve,reject)=>{const c=spawn(binary,['--session',session,'open',base+'/'],{stdio:'ignore',windowsHide:true});c.once('error',reject);c.once('exit',n=>n===0?resolve():reject(Error('Browser launch failed')));});
  wait('window.CMCms?.baseline()?.sections.some(s=>s.id==="home:shop-categories")');
  result.before=readCount();const product=evaluate('CM_DATA.products.find(p=>!p.cats.includes("rockets"))');assert.ok(product);
  const changed=JSON.parse(original);changed.productOverrides={...changed.productOverrides,[product.id]:{...(changed.productOverrides?.[product.id]||{}),cats:[...product.cats,'rockets']}};changed.rev+=1;
  await writeFile(file,JSON.stringify(changed));run('reload');wait(`window.CMCms?.baseline()?.sections.find(s=>s.id==='home:shop-categories')&&[...document.querySelectorAll('.home-category-card')].length===11`);run('wait','--load','networkidle');
  result.after=readCount();
  result.presentation=evaluate('(()=>{const node=document.querySelector(".home-category-card img[data-image-category=rockets]").closest("a"),count=node.querySelector(".home-category-card__count"),label=node.querySelector("h3"),documentData=CMCms.document(),section=documentData.sections.find(s=>s.id==="home:shop-categories"),cid=count.dataset.cmsElement,lid=label.dataset.cmsElement;section.elements[cid].text="999 stale items";section.elements[cid].styles.desktop.fontSize="15px";section.elements[lid].text="Edited category label";CMCms.apply(documentData);return {count:count.textContent,label:label.textContent,fontSize:getComputedStyle(count).fontSize,countReadOnly:CMCms.selectionInfo(section.id,cid).readOnlyText,labelReadOnly:CMCms.selectionInfo(section.id,lid).readOnlyText};})()');
  run('open',base+'/#/products?cat=rockets');wait('document.querySelectorAll(".shop-main .prod-card").length>0');result.filteredCount=evaluate('document.querySelectorAll(".shop-main .prod-card").length');
  console.log(JSON.stringify(result,null,2));
  assert.equal(parseInt(result.after.baseline,10),parseInt(result.before.baseline,10)+1,'Fresh app capture uses changed category membership');
  assert.equal(parseInt(result.after.rendered,10),result.filteredCount,'Saved CMS documents must not freeze live category counts');
  assert.equal(parseInt(result.presentation.count,10),result.filteredCount,'Applying deliberately stale count text keeps the current catalogue total');
  assert.equal(result.presentation.label,'Edited category label','Ordinary category labels remain editable');
  assert.equal(result.presentation.fontSize,'15px','Saved count styles still apply');
  assert.equal(result.presentation.countReadOnly,true,'Editor identifies automatic count text');
  assert.equal(result.presentation.labelReadOnly,false,'Editor keeps ordinary labels editable');
  result.status='PASS';
}catch(error){result.status='FAIL';result.error=error.message;throw error;}
finally{await writeFile(file,original);await writeFile('audit/category-count-sync-results.json',JSON.stringify(result,null,2));try{run('close');}catch{}}
