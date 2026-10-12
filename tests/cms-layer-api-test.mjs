import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const fixture=JSON.parse(await readFile(process.env.CM_EDITOR_FIXTURE||'audit-evidence/product-experience-20261010/engine-fixture.json','utf8'));
const base=fixture.baseUrl;
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
assert.equal((await(await fetch(base+'/__fixture-health')).json()).isolated,true);
let cookie='',csrf='';
async function api(action,body,endpoint='cms-api.php'){
 const r=await fetch(`${base}/${endpoint}?a=${action}`,{method:body?'POST':'GET',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json','X-CSRF-Token':csrf},body:body?JSON.stringify(body):undefined});
 const c=r.headers.getSetCookie().find(v=>v.startsWith('cm_staff='));if(c)cookie=c.split(';')[0];const data=await r.json();if(data.csrfToken)csrf=data.csrfToken;return {status:r.status,...data};
}
await api('session',null,'staff-auth.php');assert.equal((await api('login',{email:fixture.email,password:fixture.password},'staff-auth.php')).authenticated,true);
const created=await api('page-create',{name:'Layer contract QA',slug:'layer-contract-'+Date.now()});assert.equal(created.status,201);
const doc=created.draft,sec=doc.sections.find(s=>s.type==='text');sec.locked=true;
sec.elements={'a-image':{kind:'image',name:'Locked image',added:true,parentId:'eroot',flow:true,locked:true,src:'/images/logo.png',styles:{desktop:{zIndex:'1000'}},overrides:{mobile:{styles:{zIndex:-1000}}}}};
const request={page:created.page,expectedVersion:created.version,expectedGlobalVersion:created.globals.version,document:doc};
const saved=await api('save',request);assert.equal(saved.status,200,saved.error);const actual=saved.draft.sections.find(s=>s.id===sec.id);
assert.equal(actual.locked,true);assert.equal(actual.elements['a-image'].locked,true);assert.equal(actual.elements['a-image'].styles.desktop.zIndex,'1000');assert.equal(actual.elements['a-image'].overrides.mobile.styles.zIndex,'-1000');assert.equal(saved.published,null);
assert.equal(actual.elements['a-image'].flow,true);
console.log('PASS: Section/element locks and responsive zIndex limits persist only in draft');
for(const value of ['true',1,null])for(const kind of ['section','element']){
 const bad=structuredClone(doc),s=bad.sections.find(s=>s.id===sec.id);(kind==='section'?s:s.elements['a-image']).locked=value;
 assert.equal((await api('save',{...request,expectedVersion:saved.version,document:bad})).status,422,kind+' lock must be Boolean');
}
console.log('PASS: Both lock fields reject strings, numbers and null');
for(const value of ['true',1,null]){
 const bad=structuredClone(doc);bad.sections.find(s=>s.id===sec.id).elements['a-image'].flow=value;
 assert.equal((await api('save',{...request,expectedVersion:saved.version,document:bad})).status,422,'Flow must be Boolean');
}
const nativeFlow=structuredClone(doc);nativeFlow.sections.find(s=>s.id===sec.id).elements['e0']={kind:'text',name:'Native',flow:true};
assert.equal((await api('save',{...request,expectedVersion:saved.version,document:nativeFlow})).status,422,'Only added elements can select flow');
console.log('PASS: Normal flow persists only on added elements and rejects non-Boolean values');
for(const value of [1001,-1001,1.5,'auto','1;position:fixed',true]){
 const bad=structuredClone(doc);bad.sections.find(s=>s.id===sec.id).elements['a-image'].styles.desktop.zIndex=value;
 assert.equal((await api('save',{...request,expectedVersion:saved.version,document:bad})).status,422,'Invalid zIndex '+value);
}
const current=await api('load&page='+created.page);assert.equal(current.version,saved.version);assert.deepEqual(current.draft,saved.draft);
console.log('PASS: Unsafe/noninteger layer values are rejected without changing draft or version');
delete sec.locked;delete sec.elements['a-image'].locked;delete sec.elements['a-image'].styles.desktop.zIndex;delete sec.elements['a-image'].overrides.mobile.styles.zIndex;
const legacy=await api('save',{...request,expectedVersion:saved.version,document:doc});assert.equal(legacy.status,200);assert.equal(Object.hasOwn(legacy.draft.sections.find(s=>s.id===sec.id),'locked'),false);
console.log('PASS: Existing documents without locks or layer fields remain valid');
