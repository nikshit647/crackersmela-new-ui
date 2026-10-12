import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('visual-editor/js/visual-editor.js', 'utf8');
/* Extract a real block by balanced braces, or a brace-free arrow up to its
   semicolon, so line endings cannot truncate it. */
function blockOf(name) {
  const at = source.search(new RegExp('^(?:async )?(?:function|const) ' + name + '(?:\\s*\\(|=)', 'm'));
  assert.ok(at > 0, name + ' must be part of the shipped editor');
  const brace = source.indexOf('{', at), semi = source.indexOf(';', at);
  if (brace < 0 || semi < brace) return source.slice(at, semi + 1);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(at, i + 1);
  }
  throw new Error('Unbalanced block for ' + name);
}
function editor({preview=false,active=true}={}){
  const sec={id:'home:shop-categories',type:'native',source:'home:shop-categories',content:{heading:'Shop by Categories'},elements:{card:{kind:'button',href:'#/products?cat=gifts'}}};
  const doc={id:'home',sections:[sec],productOrders:{'section:home:featured':[4,3]}};
  const state={doc,page:{id:'home'},preview,sectionId:sec.id,categories:['gifts','kids','sparklers'].map(id=>({id})),history:{past:[],future:[]},categoryReorder:active?{sectionId:sec.id,ids:['gifts','kids','sparklers'],startIds:['gifts','kids','sparklers']}:null};
  const changes=[],messages=[];
  const context=vm.createContext({state,isHomePage:()=>true,isCategoryReorderSection:s=>s?.type==='native'&&s?.source==='home:shop-categories',message:(type,extra)=>{messages.push({type,...extra});},toast:text=>{messages.push({type:'toast',message:text});},clone:v=>JSON.parse(JSON.stringify(v)),changed:(_,edit)=>{changes.push(structuredClone(doc));edit(doc);messages.push({type:'undo',undo:changes.length>0});}});
  // One script, so the extracted declarations share a single lexical scope.
vm.runInContext(['sameOrder','savedCategoryOrder','validCategoryOrder','applyCategoryReorder','resetCategoryOrder'].map(blockOf).join('\n'),context);
  const read=()=>vm.runInContext('savedCategoryOrder()',context);
  return {state,doc,sec,changes,messages,context,read,apply:ids=>context.applyCategoryReorder({sectionId:sec.id,ids}),reset:()=>context.resetCategoryOrder()};
}

test('category drag writes the global root order and leaves the section content alone',()=>{
  const e=editor(),before=structuredClone(e.doc);
  e.apply(['sparklers','gifts','kids']);
  assert.equal(e.changes.length,1);
  assert.deepEqual(e.changes[0],before);
  assert.deepEqual(Array.from(e.doc.categoryOrder),['sparklers','gifts','kids']);
  assert.deepEqual(e.sec.content,{heading:'Shop by Categories'},'the section no longer stores the order');
  assert.deepEqual(e.doc.sections,e.changes[0].sections,'sections are untouched');
  assert.deepEqual(e.doc.productOrders,{'section:home:featured':[4,3]},'product ordering is untouched');
});

test('category Save publishes only the order and keeps the controls open on failure', async()=>{
  const e=editor(), calls=[];
  Object.assign(e.state,{pages:[{id:'home'}],version:7,saved:'',ready:true});
  Object.assign(e.state.categoryReorder,{target:'grid',version:7});
  Object.assign(e.context,{
    api:async(action,payload)=>{calls.push({action,payload});throw new Error('Offline');},
    saveDraft:async()=>false,renderInspector:()=>{},status:()=>{},clearError:()=>{},showError:error=>e.messages.push({error:error.message}),
    fingerprint:value=>JSON.stringify(value),clearTimeout:()=>{},autosaveTimer:null,
    endCategoryReorder:()=>{e.state.categoryReorder=null;},
  });
  vm.runInContext(blockOf('saveCategoryOrder'),e.context);
  await e.context.saveCategoryOrder();
  assert.equal(calls[0]?.action,'category-order','Save uses the narrow order update, never publishes the Home draft');
  assert.deepEqual(Array.from(calls[0].payload.categoryOrder),['gifts','kids','sparklers']);
  assert.equal(calls[0].payload.document,undefined);
  assert.ok(e.state.categoryReorder,'retry and Cancel remain available after a failed request');
});

test('dragging a sidebar category does not write to the server before Save',()=>{
  const e=editor();e.state.page.id='products';e.state.categoryReorder.target='filter';
  const writes=[];e.context.queueHomeCategoryOrder=ids=>writes.push(ids);
  e.apply(['sparklers','gifts','kids']);
  assert.deepEqual(Array.from(e.state.categoryReorder.ids),['sparklers','gifts','kids']);
  assert.equal(e.doc.categoryOrder,undefined,'Products has no private category order');
  assert.equal(writes.length,0,'Drag must not autosave');
});

test('rapidly opening Reorder Categories starts only one preparation',async()=>{
  const e=editor({active:false});e.state.ready=true;let calls=0,finish;
  const pending=new Promise(resolve=>{finish=resolve;});
  Object.assign(e.context,{categoryTarget:value=>value,endProductReorder:()=>{},endProductBlocks:()=>{},saveDraft:()=>{calls++;return pending;}});
  vm.runInContext(blockOf('startCategoryReorder'),e.context);
  const first=e.context.startCategoryReorder(e.sec.id,'grid');
  const second=e.context.startCategoryReorder(e.sec.id,'grid');
  assert.equal(calls,1,'double clicks must not run competing loads or reset history twice');
  finish(false);await Promise.all([first,second]);
});

test('page navigation waits while category Save is pending',async()=>{
  const e=editor();e.state.categoryReorder.saving=true;e.state.pages=[];let transitions=0;
  Object.assign(e.context,{endReordering:()=>transitions++,dirty:()=>false});
  vm.runInContext(blockOf('loadPage'),e.context);
  await e.context.loadPage('about');assert.equal(transitions,0,'the save keeps its page/document until the response arrives');
});

test('category operations require the same complete set that entered reorder mode',()=>{
  for(const ids of [['kids','kids','gifts'],['sparklers','gifts'],['sparklers','gifts','unknown'],[1,'kids','gifts'],null,{},['all','kids','gifts']]){
    const e=editor();e.apply(ids);assert.equal(e.changes.length,0,JSON.stringify(ids));
  }
  const e=editor();e.context.applyCategoryReorder({sectionId:'home:featured',ids:['sparklers','gifts','kids']});assert.equal(e.changes.length,0);
});

test('normal editing and visitor preview reject category reorder operations',()=>{
  for(const options of [{active:false},{preview:true}]){
    const e=editor(options);e.apply(['sparklers','gifts','kids']);assert.equal(e.changes.length,0);
  }
});

test('category order cannot be applied after its section changes',()=>{
  const e=editor();e.sec.source='home:featured';e.apply(['sparklers','gifts','kids']);assert.equal(e.changes.length,0);
});

test('the editor reads the root order and only falls back to a legacy section value',()=>{
  const e=editor(),legacy=editor();
  assert.equal(e.read(),undefined,'no saved order yet');
  e.doc.categoryOrder=['kids','gifts','sparklers'];
  e.sec.content.categoryOrder=['gifts','kids','sparklers'];
  assert.deepEqual(e.read(),['kids','gifts','sparklers'],'the root wins');
  legacy.sec.content.categoryOrder=['gifts','kids','sparklers'];
  assert.deepEqual(legacy.read(),['gifts','kids','sparklers'],'an older draft still resolves');
});

test('reset returns the catalog order through the same undoable changed() path',()=>{
  const e=editor(),before=structuredClone(e.doc);
  e.apply(['sparklers','gifts','kids']);
  assert.deepEqual(Array.from(e.doc.categoryOrder),['sparklers','gifts','kids']);
  e.reset();
  assert.equal(e.changes.length,2,'reset is its own undoable edit');
  assert.deepEqual(e.changes[1].categoryOrder,['sparklers','gifts','kids'],'undo can step back to the drag');
  assert.deepEqual(Array.from(e.doc.categoryOrder),['gifts','kids','sparklers'],'the catalog order is restored');
  assert.deepEqual(Array.from(e.state.categoryReorder.ids),['gifts','kids','sparklers'],'the open mode follows the reset');
  assert.equal(before.categoryOrder,undefined);
  const repeat=editor();repeat.doc.categoryOrder=['gifts','kids','sparklers'];repeat.reset();
  assert.equal(repeat.changes.length,0,'resetting an already canonical order changes nothing');
});

test('reset refuses a catalog list that no longer matches the open mode',()=>{
  const e=editor();
  e.state.categories=[{id:'gifts'},{id:'kids'}];
  e.reset();
  assert.equal(e.changes.length,0);
  assert.equal(e.doc.categoryOrder,undefined);
  assert.ok(e.messages.some(m=>m.type==='toast'&&/Reopen Reorder Categories/.test(m.message)));
});
