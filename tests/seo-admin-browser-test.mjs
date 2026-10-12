import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const fixture=JSON.parse(await readFile('audit-evidence/seo-editor-fixture-20261007.json','utf8'));
const plan=JSON.parse(await readFile('audit-artifacts/seo-editor-20261007/product-seo-plan.json','utf8'));
const base=fixture.baseUrl,publicBase=fixture.publicUrl;
assert.ok(new URL(base).hostname==='127.0.0.1');
const health=await(await fetch(base+'/__fixture-health')).json();assert.equal(health.isolated,true);assert.equal(health.mail,'disabled');
const binary=path.join(process.env.APPDATA,'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const session='cm-seo-admin-all';
const output=path.resolve('audit-artifacts/seo-editor-20261007/admin-browser');await mkdir(output,{recursive:true});
const run=(...args)=>{const r=JSON.parse(execFileSync(binary,['--session',session,...args,'--json'],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024,timeout:45000}));assert.ok(r.success,r.error);return r.data;};
const evaluate=code=>run('eval','-b',Buffer.from(code).toString('base64')).result;
const wait=code=>run('wait','--fn',code);
const checks=[];
try{
  await new Promise((resolve,reject)=>{const p=spawn(binary,['--session',session,'open',base],{stdio:'ignore',windowsHide:true});p.once('exit',code=>code?reject(new Error('browser start')):resolve());p.once('error',reject);});
  run('set','viewport','1600','1000');run('set','media','light','reduced-motion');
  run('open',base+'/#/staff');wait("!!document.querySelector('#goAuthStaff')");run('click','#goAuthStaff');
  wait("document.querySelector('#authModal').getAnimations({subtree:true}).every(a=>a.playState!=='running')");
  run('fill','#auEmail',fixture.email);run('fill','#auPass',fixture.password);
  assert.equal(evaluate("document.querySelector('#auEmail').value"),fixture.email,'Synthetic email entered');
  assert.equal(evaluate("document.querySelector('#auPass').value=== "+JSON.stringify(fixture.password)),true,'Synthetic password entered');
  run('click','#auSubmit');
  wait("!!document.querySelector('[data-panel=products]')");run('click','[data-panel=products]');wait("!!document.querySelector('#admPq')");
  for(const row of plan.changes){
    const product={...row.expectedProduct,...row.changes};
    run('fill','#admPq',product.name);
    wait(`document.querySelectorAll('[data-edit-prod]').length<5&&!!document.querySelector('[data-edit-prod="${row.id}"]')`);
    run('click',`[data-edit-prod="${row.id}"]`);wait("!!document.querySelector('#epSeoDesc')");
    const values=evaluate("Object.fromEntries(['Title','Desc','Keywords','Slug','Tags'].map(k=>['seo'+k,document.querySelector('#epSeo'+k).value]))");
    for(const key of ['seoTitle','seoDesc','seoKeywords','seoSlug','seoTags'])assert.equal(values[key],product[key],'Admin saved field '+row.id+' '+key);
    checks.push({id:row.id,status:'PASS',fields:5});
    if(row.id===26){run('scrollintoview','#epSeoTitle');run('screenshot',path.join(output,'product-26-seo-fields.png'));}
    run('click','.ep-actions [data-close-edit]');wait("!document.querySelector('[data-edit-modal]')");
    if(checks.length%20===0)console.log('PASS admin fields '+checks.length+'/'+plan.total);
  }
  run('reload');wait("!!document.querySelector('[data-panel=products]')");run('click','[data-panel=products]');wait("!!document.querySelector('#admPq')");run('fill','#admPq',plan.changes[0].expectedProduct.name);wait("document.querySelectorAll('[data-edit-prod]').length<5");run('click','[data-edit-prod="26"]');wait("!!document.querySelector('#epSeoDesc')");assert.equal(evaluate("document.querySelector('#epSeoDesc').value"),{...plan.changes[0].expectedProduct,...plan.changes[0].changes}.seoDesc);run('click','.ep-actions [data-close-edit]');
  // Generic CMS layout metadata must never replace a specific product/category.
  for(const row of [plan.changes[0],plan.changes.find(x=>x.id===47),plan.changes.at(-1)]){
    const p={...row.expectedProduct,...row.changes};run('open',publicBase+'/product/'+p.slug);run('wait','--load','networkidle');wait("!!document.querySelector('.prod-detail h1')");
    const facts=evaluate("({title:document.title,canonical:document.querySelector('link[rel=canonical]').href,description:document.querySelector('.desc-note').textContent,h1:document.querySelector('.prod-detail h1').textContent,schema:JSON.parse(document.querySelector('#cm-dynamic-schema').textContent)})");
    assert.equal(facts.title,p.seoTitle);assert.equal(facts.canonical,'https://crackersmela.com/product/'+p.slug);assert.equal(facts.h1,p.name);assert.ok(!JSON.stringify(facts.schema).includes('aggregateRating'));
  }
  run('open',publicBase+'/category/chakkars');run('wait','--load','networkidle');assert.equal(evaluate("document.querySelector('link[rel=canonical]').href"),'https://crackersmela.com/category/chakkars');assert.match(evaluate('document.title'),/Chakkars/);
  const errors=run('errors'),logs=run('console');assert.equal(errors.errors?.length||0,0);
  await writeFile(path.join(output,'results.json'),JSON.stringify({status:'PASS',products:checks.length,adminFields:checks.length*5,refresh:true,publicSamples:3,category:true,checks,errors,logs},null,2));
  console.log('PASS all '+checks.length+' products: '+checks.length*5+' persisted admin fields, refresh, public product/category metadata; no JS errors');
}catch(error){try{run('screenshot',path.join(output,'failure.png'));}catch{}await writeFile(path.join(output,'results.json'),JSON.stringify({status:'FAIL',checks,error:error.message},null,2));throw error;}
finally{run('close');}
