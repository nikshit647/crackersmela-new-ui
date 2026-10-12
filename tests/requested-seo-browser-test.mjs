import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

const artifact=process.env.CM_REQUESTED_SEO_ARTIFACT||'audit-artifacts/seo-keywords-20261008';
const fixture=JSON.parse(await readFile(process.env.CM_REQUESTED_SEO_FIXTURE||'audit-evidence/seo-keywords-browser-fixture.json','utf8'));
const rows=JSON.parse(await readFile(path.join(artifact,'product-seo-fields.json'),'utf8'));
const site=JSON.parse(await readFile(path.join(artifact,'website-seo-plan.json'),'utf8'));
assert.equal(new URL(fixture.baseUrl).hostname,'127.0.0.1');
assert.equal((await(await fetch(fixture.baseUrl+'/__fixture-health')).json()).isolated,true);
const binary=path.join(process.env.APPDATA,'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const output=path.resolve(artifact,'browser');await mkdir(output,{recursive:true});
const session=process.env.CM_REQUESTED_SEO_SESSION||'cm-seo-keywords-20261008';
const run=(...args)=>{const r=JSON.parse(execFileSync(binary,['--session',session,...args,'--json'],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024,timeout:45000}));assert.ok(r.success,r.error);return r.data;};
const evaluate=code=>run('eval','-b',Buffer.from(code).toString('base64')).result;
const wait=code=>run('wait','--fn',code);
const checks=[];
try{
  await new Promise((resolve,reject)=>{const child=spawn(binary,['--session',session,'open',fixture.baseUrl],{stdio:'ignore',windowsHide:true});child.once('exit',code=>code?reject(new Error('Browser startup failed')):resolve());child.once('error',reject);});
  run('open',fixture.baseUrl+'/#/staff');run('wait','--load','networkidle');run('set','viewport','1440','1000');run('set','media','light','reduced-motion');
  run('snapshot','-i');wait("!!document.querySelector('#goAuthStaff')");run('click','#goAuthStaff');
  wait("!!document.querySelector('#auEmail')&&document.querySelector('#authModal').getAnimations({subtree:true}).every(a=>a.playState!=='running')");run('snapshot','-i');
  run('fill','#auEmail',fixture.email);run('fill','#auPass',fixture.password);run('click','#auSubmit');
  wait("!!document.querySelector('[data-panel=products]')");run('click','[data-panel=products]');wait("!!document.querySelector('#admPq')");
  for(const id of [26,47,215]){
    const row=rows.find(row=>row.id===id);run('fill','#admPq',row.name);wait(`document.querySelectorAll('[data-edit-prod]').length<5&&!!document.querySelector('[data-edit-prod="${id}"]')`);
    run('click',`[data-edit-prod="${id}"]`);wait("!!document.querySelector('#epSeoKeywords')");run('snapshot','-i');
    const fields=evaluate("Object.fromEntries(['Title','Desc','Keywords','Slug','Tags'].map(k=>['seo'+k,document.querySelector('#epSeo'+k).value]))");assert.deepEqual(fields,row.fields);
    if(id===26){
      run('scrollintoview','#epSeoKeywords');run('screenshot',path.join(output,'product-seo-desktop.png'));
      const changed={seoTitle:row.fields.seoTitle+' Test',seoDesc:row.fields.seoDesc+' Local preview check.',seoKeywords:row.fields.seoKeywords+', Hyderabad shopping',seoSlug:row.fields.seoSlug+'-preview-check',seoTags:row.fields.seoTags+', Preview check'};
      for(const [key,value] of Object.entries(changed))run('fill','#ep'+key[0].toUpperCase()+key.slice(1),value);
      run('click','[data-save-edit]');wait("!document.querySelector('#epSeoKeywords')");
      run('reload');wait("!!document.querySelector('[data-panel=products]')");run('click','[data-panel=products]');wait("!!document.querySelector('#admPq')");run('fill','#admPq',row.name);wait("!!document.querySelector('[data-edit-prod=\"26\"]')");run('click','[data-edit-prod="26"]');wait("!!document.querySelector('#epSeoKeywords')");
      assert.deepEqual(evaluate("Object.fromEntries(['Title','Desc','Keywords','Slug','Tags'].map(k=>['seo'+k,document.querySelector('#epSeo'+k).value]))"),changed);
      for(const [key,value] of Object.entries(row.fields))run('fill','#ep'+key[0].toUpperCase()+key.slice(1),value);
      run('click','[data-save-edit]');wait("!document.querySelector('#epSeoKeywords')");checks.push('All five product fields edit/save/refresh/restore');
    }else{run('click','.ep-actions [data-close-edit]');wait("!document.querySelector('#epSeoKeywords')");}
    checks.push('Five saved product SEO fields '+id);
  }
  run('set','viewport','390','844');
  const mobileRow=rows.find(row=>row.id===216);run('fill','#admPq',mobileRow.name);wait("!!document.querySelector('[data-edit-prod=\"216\"]')");run('click','[data-edit-prod="216"]');wait("!!document.querySelector('#epSeoKeywords')");
  assert.deepEqual(evaluate("Object.fromEntries(['Title','Desc','Keywords','Slug','Tags'].map(k=>['seo'+k,document.querySelector('#epSeo'+k).value]))"),mobileRow.fields);
  for(const key of ['Title','Desc','Keywords','Slug','Tags']){run('scrollintoview','#epSeo'+key);assert.ok(evaluate(`(()=>{const e=document.querySelector('#epSeo${key}'),r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()`));}
  run('screenshot',path.join(output,'product-seo-mobile.png'));wait("!document.querySelector('#toastWrap .toast')");run('click','.ep-actions [data-close-edit]');wait("!document.querySelector('#epSeoKeywords')");checks.push('Mobile product editor exposes all five saved fields');
  run('set','viewport','1440','1000');
  run('open',fixture.editorUrl);wait("!!document.querySelector('[data-page=home]')&&!document.querySelector('#publish').disabled");run('snapshot','-i');run('click','[data-page-settings]');run('click','#inspector .context-popover:first-of-type summary');
  wait("!!document.querySelector('#inspector [data-field=keywords][data-scope=seo]')");
  const keywordSelector='#inspector [data-field=keywords][data-scope=seo]';assert.equal(evaluate(`document.querySelector(${JSON.stringify(keywordSelector)}).value`),site.pages.home.keywords);
  run('scrollintoview',keywordSelector);run('screenshot',path.join(output,'website-seo-desktop.png'));
  run('fill',keywordSelector,site.pages.home.keywords+', Hyderabad fireworks shopping');run('click','#save');wait("document.querySelector('#saveStatus').textContent.includes('Saved')||document.querySelector('#saveState').textContent.includes('Saved')");
  run('reload');wait("!!document.querySelector('[data-page=home]')&&!document.querySelector('#publish').disabled");run('click','[data-page-settings]');run('click','#inspector .context-popover:first-of-type summary');wait("!!document.querySelector('#inspector [data-field=keywords][data-scope=seo]')");
  assert.equal(evaluate(`document.querySelector(${JSON.stringify(keywordSelector)}).value`),site.pages.home.keywords+', Hyderabad fireworks shopping');
  run('fill',keywordSelector,site.pages.home.keywords);run('click','#publish');wait("document.querySelector('#confirmDialog').open");run('snapshot','-i');run('click','#confirmAction');
  wait("!document.querySelector('#confirmDialog').open&&!document.querySelector('#publish').disabled&&document.querySelector('#save').disabled");
  checks.push('Website keywords edit/save/refresh/publish');
  const openMobileSeo=()=>{run('click','#toggleLibrary');wait("document.querySelector('#editor').classList.contains('show-library')");run('click','[data-page-settings]');wait("document.querySelector('#editor').classList.contains('show-inspector')");run('click','#inspector .context-popover:first-of-type summary');run('scrollintoview',keywordSelector);};
  run('set','viewport','390','844');openMobileSeo();
  wait(`(()=>{const e=document.querySelector(${JSON.stringify(keywordSelector)}),r=e.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e})()`);
  run('screenshot',path.join(output,'website-seo-mobile.png'));
  assert.equal(evaluate(`document.querySelector(${JSON.stringify(keywordSelector)}).value`),site.pages.home.keywords);
  run('fill',keywordSelector,site.pages.home.keywords+', Telangana fireworks shopping');run('click','#save');wait("document.querySelector('#save').disabled&&!document.querySelector('#publish').disabled");
  run('reload');wait("!!document.querySelector('[data-page=home]')&&!document.querySelector('#publish').disabled");openMobileSeo();
  assert.equal(evaluate(`document.querySelector(${JSON.stringify(keywordSelector)}).value`),site.pages.home.keywords+', Telangana fireworks shopping');
  run('fill',keywordSelector,site.pages.home.keywords);run('click','#save');wait("document.querySelector('#save').disabled&&!document.querySelector('#publish').disabled");
  checks.push('Visible mobile SEO controls: Pages & tools, edit, save and refresh');
  for(const width of [1440,390]){
    run('set','viewport',String(width),width===1440?'1000':'844');run('open',fixture.publicUrl+'/');wait("!!document.querySelector('.hero h1')");
    wait(`document.title===${JSON.stringify(site.pages.home.title)}`);
    assert.equal(evaluate("document.querySelector('meta[name=keywords]').content"),site.pages.home.keywords);
    const row=rows.find(row=>row.id===26);run('open',fixture.publicUrl+'/product/'+row.url.split('/').at(-1));wait("!!document.querySelector('.prod-detail h1')");
    assert.equal(evaluate("document.querySelector('meta[name=keywords]').content"),row.fields.seoKeywords);
    run('open',fixture.publicUrl+'/category/chakkars');wait("!!document.querySelector('.prod-card')");
    assert.equal(evaluate("document.querySelector('meta[name=keywords]').content"),'');
    checks.push('Homepage/product/category metadata and stale keyword clearing '+width);
  }
  const errors=run('errors');assert.equal(errors.errors?.length||0,0);
  await writeFile(path.join(output,'results.json'),JSON.stringify({status:'PASS',checks,errors},null,2));console.log(JSON.stringify({status:'PASS',checks}));
}catch(error){try{run('screenshot',path.join(output,'failure.png'));}catch{}await writeFile(path.join(output,'results.json'),JSON.stringify({status:'FAIL',checks,error:error.message},null,2));throw error;}
finally{run('close');}
