import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const runtime=readFileSync(new URL('../visual-editor/js/cms-runtime.js',import.meta.url),'utf8');
const start=runtime.indexOf('  function applyProductBlocks('),end=runtime.indexOf('  /* END_CM_PRODUCT_BLOCKS */',start);
assert.ok(start>0&&end>start);

function fixture(){
  let moves=0;
  const parent=ids=>{
    const root={children:[],get firstElementChild(){return this.children[0]||null;},insertBefore(node,before){assert.ok(this.children.includes(node),'Only original nodes may be moved');this.children.splice(this.children.indexOf(node),1);this.children.splice(before?this.children.indexOf(before):this.children.length,0,node);moves++;}};
    root.children=ids.map(id=>({id,parentElement:root,checked:id==='category',href:'/category/'+id,handler:()=>id,get nextElementSibling(){return root.children[root.children.indexOf(this)+1]||null;}}));return root;
  };
  const layout=parent(['filters','backdrop','products']),filters=parent(['drawer-head','price','category','availability','clear']),products=parent(['toolbar','results','grid']);
  const groups=[['layout',layout,['filters','products']],['filters',filters,['price','category','availability','clear']],['products',products,['toolbar','results','grid']]];
  const context=vm.createContext({state:{blockOrders:new WeakMap()},productBlockGroups:()=>groups.map(([id,parent,known])=>({id,parent,items:parent.children.filter(node=>known.includes(node.id)).map(node=>({id:node.id,node}))}))});
  vm.runInContext(runtime.slice(start,end),context);
  const apply=(blockOrders={},source='products:shop-layout')=>{context.instance={node:layout};context.section={type:'native',source,content:{blockOrders}};return vm.runInContext('applyProductBlocks(instance,section,".shop-layout")',context);};
  return {layout,filters,products,apply,moves:()=>moves,ids:root=>root.children.map(node=>node.id)};
}

test('block order moves native filter/product nodes and leaves helper slots and controls intact',()=>{
  const f=fixture(),filterNodes=[...f.filters.children],productNodes=[...f.products.children];
  const css=f.apply({layout:['products','filters'],filters:['category','availability','price','clear'],products:['grid','results','toolbar']});
  assert.deepEqual(f.ids(f.layout),['products','backdrop','filters']);
  assert.deepEqual(f.ids(f.filters),['drawer-head','category','availability','price','clear']);
  assert.deepEqual(f.ids(f.products),['grid','results','toolbar']);
  for(const node of f.filters.children){assert.ok(filterNodes.includes(node));assert.equal(node.handler(),node.id);assert.equal(node.checked,node.id==='category');}
  for(const node of f.products.children)assert.ok(productNodes.includes(node));
  assert.match(css,/@media\(min-width:981px\)/);assert.match(css,/grid-template-columns:minmax\(0,1fr\) 276px/);
  assert.doesNotMatch(css,/max-width:980px/,'Mobile drawer layout remains the storefront’s own layout');
});

test('partial order appends the remaining blocks; clearing restores native order without node churn',()=>{
  const f=fixture();f.apply({filters:['category'],products:['grid']});
  assert.deepEqual(f.ids(f.filters),['drawer-head','category','price','availability','clear']);
  const moved=f.moves();f.apply({filters:['category'],products:['grid']});assert.equal(f.moves(),moved);
  f.apply({});assert.deepEqual(f.ids(f.filters),['drawer-head','price','category','availability','clear']);assert.deepEqual(f.ids(f.products),['toolbar','results','grid']);
});

test('unexpected blocks cannot create or cross-move nodes and other native sections are ignored',()=>{
  const f=fixture();f.apply({filters:['unknown','products','category','category']});
  assert.deepEqual(f.ids(f.filters),['drawer-head','category','price','availability','clear']);
  const before=f.ids(f.filters);assert.equal(f.apply({filters:['price']},'home:shop-categories'),'');assert.deepEqual(f.ids(f.filters),before);
});
