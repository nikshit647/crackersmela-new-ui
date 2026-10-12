import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const fixture=JSON.parse(await readFile(process.env.CM_EDITOR_FIXTURE||'audit-evidence/product-experience-20261010/engine-fixture.json','utf8')),base=fixture.baseUrl;
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));assert.equal((await(await fetch(base+'/__fixture-health')).json()).isolated,true);
let cookie='',csrf='';async function api(action,body,endpoint='cms-api.php'){const r=await fetch(`${base}/${endpoint}?a=${action}`,{method:body?'POST':'GET',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json','X-CSRF-Token':csrf},body:body?JSON.stringify(body):undefined});const c=r.headers.getSetCookie().find(v=>v.startsWith('cm_staff='));if(c)cookie=c.split(';')[0];const data=await r.json();if(data.csrfToken)csrf=data.csrfToken;return {status:r.status,...data};}
await api('session',null,'staff-auth.php');assert.equal((await api('login',{email:fixture.email,password:fixture.password},'staff-auth.php')).authenticated,true);
const created=await api('page-create',{name:'Button tree QA',slug:'button-tree-'+Date.now()});assert.equal(created.status,201);
const doc=created.draft,sec=doc.sections.find(s=>s.type==='text');sec.elements={
 'a-link':{kind:'button',name:'Image link',added:true,flow:true,parentId:'eroot',href:'/about'},
 'a-image':{kind:'image',name:'Link picture',added:true,flow:true,parentId:'a-link',src:'/images/logo.png'},
 'a-caption':{kind:'text',name:'Link caption',added:true,flow:true,parentId:'a-link',text:'Linked picture caption'}
};
const request={page:created.page,expectedVersion:created.version,expectedGlobalVersion:created.globals.version,document:doc};const saved=await api('save',request);assert.equal(saved.status,200,saved.error);
assert.deepEqual(saved.draft.sections.find(s=>s.id===sec.id).elements,sec.elements);assert.equal(saved.published,null);console.log('PASS: Image-link descendants save/load as a private normal-flow tree');
for(const mutation of ['image-parent','cycle','nested-link']){const bad=structuredClone(doc),s=bad.sections.find(s=>s.id===sec.id);if(mutation==='image-parent')s.elements['a-caption'].parentId='a-image';if(mutation==='cycle')s.elements['a-link'].parentId='a-link';if(mutation==='nested-link')s.elements['a-caption'].kind='button';assert.equal((await api('save',{...request,expectedVersion:saved.version,document:bad})).status,422,mutation);}
const current=await api('load&page='+created.page);assert.equal(current.version,saved.version);assert.deepEqual(current.draft,saved.draft);console.log('PASS: Image parents, cycles and nested links are rejected atomically');
