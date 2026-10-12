import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function editor(){
  const source=fs.readFileSync('visual-editor/js/visual-editor.js','utf8');
  const start=source.indexOf('function moveProductBlock(');
  assert.ok(start>=0,'Products has a block-order editor');
  let depth=0,end=source.indexOf('{',start);
  for(let i=end;i<source.length;i++){if(source[i]==='{')depth++;if(source[i]==='}'&&!--depth){end=i+1;break;}}
  const doc={id:'products',sections:[{id:'shop',source:'products:shop-layout',content:{}}],productOrders:{all:[26,27]}};
  const state={doc,blockReorder:{sectionId:'shop',groups:[{id:'filters',items:[{id:'price'},{id:'category'},{id:'availability'}]},{id:'products',items:[{id:'toolbar'},{id:'results'},{id:'grid'}]}]}};
  const context=vm.createContext({state,changed:(_,change)=>change(doc),sameOrder:(a,b)=>Array.isArray(a)&&a.length===b.length&&a.every((v,i)=>v===b[i]),renderInspector:()=>{},message:()=>{}});
  vm.runInContext(source.slice(start,end),context);
  return {state,doc,move:context.moveProductBlock};
}
test('moving a filter block updates only its section display order',()=>{
  const e=editor();e.move('filters','category','price');
  assert.deepEqual(Array.from(e.doc.sections[0].content.blockOrders.filters),['category','price','availability']);
  assert.deepEqual(e.doc.productOrders,{all:[26,27]});
  assert.equal(e.doc.sections[0].content.blockOrders.products,undefined);
});
test('block moves reject cross-group and unknown identities',()=>{
  const e=editor();e.move('filters','grid','category');e.move('products','grid','category');e.move('filters','unknown','price');
  assert.deepEqual(e.doc.sections[0].content,{});
});
