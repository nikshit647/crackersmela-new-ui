import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = 'audit-evidence/production-release/';
const app = fs.readFileSync(root + 'js/app.js', 'utf8');
const runtime = fs.readFileSync(root + 'js/seo-runtime.js', 'utf8');
const start = app.indexOf('  const updateSeo = ');
const end = app.indexOf('  const navActive = ', start);
function harness({admin = false, query = ''} = {}) {
  const nodes = [];
  const match = (node, selector) => {
    if (selector.startsWith('#')) return node.id === selector.slice(1);
    const m = selector.match(/^(\w+)\[(\w+)="([^"]+)"\]$/);
    return m && node.tag === m[1] && (node[m[2]] || node.attrs[m[2]]) === m[3];
  };
  const document = {title: '', createElement(tag) {return {tag,attrs:{},setAttribute(k,v){this.attrs[k]=String(v);this[k]=String(v);},remove(){nodes.splice(nodes.indexOf(this),1);}};},getElementById(id){return nodes.find(n=>n.id===id);},querySelectorAll(s){return nodes.filter(n=>match(n,s));}};
  document.head = {querySelector:s=>nodes.find(n=>match(n,s)),appendChild:n=>nodes.push(n)};
  const p = {id:26,name:'Zamin Chakkar Big 1 Box - 10 Pcs',shortName:'Zamin Chakkar',slug:'stable-original-slug',seoSlug:'edited-seo-slug',seoTitle:'Zamin Chakkar Big – 10 Pcs | Crackers Mela',seoDesc:'A box of ten Zamin Chakkar Big pieces.',desc:'One box contains 10 pieces.',image:'images/products/26.png',sku:'CM-0026',primary:'chakkars',cats:['chakkars'],price:100,stock:100,inStock:true,rating:4.8,reviews:99};
  const cats = [{id:'chakkars',name:'Chakkars'}];
  const context = {window:{},document,URL,URLSearchParams,IS_ADMIN_HOST:admin,CATS:cats,CAT_MAP:{chakkars:cats[0]},currentRoute:{query},allProducts:()=>[p],prodBySlug:s=>s===p.slug?p:null,priceOf:()=>125,stockOf:()=>0,inStockOf:()=>false,safeImageSrc:x=>x,$$:s=>document.querySelectorAll(s),cmSeoEntry:()=>null};
  vm.createContext(context);vm.runInContext(runtime,context);vm.runInContext(app.slice(start,end)+'globalThis.runSeo=updateSeo;',context);
  return {context,p,nodes,document,meta:s=>document.head.querySelector(s),schema:()=>JSON.parse(document.getElementById('cm-dynamic-schema').textContent)};
}
test('product route has one brand suffix, stable canonical and separate factual schema entities',()=>{
  const h=harness();h.context.runSeo({name:'product'},[h.p.slug]);
  assert.equal(h.document.title,h.p.seoTitle);
  assert.equal(h.meta('link[rel="canonical"]').href,'https://crackersmela.com/product/'+h.p.slug);
  const graph=h.schema()['@graph'];assert.ok(Array.isArray(graph));
  const product=graph.find(n=>n['@type']==='Product');
  assert.equal(product.offers.price,125);assert.equal(product.offers.availability,'https://schema.org/OutOfStock');
  assert.equal(product.description,h.p.desc);assert.equal(product.aggregateRating,undefined);
  const crumbs=graph.find(n=>n['@type']==='BreadcrumbList');assert.equal(crumbs.itemListElement[1].name,'Chakkars');
  h.context.runSeo({name:'home'});assert.equal(JSON.stringify(h.schema()).includes('"@type":"Product"'),false);
});
test('admin host stays noindex even on home route',()=>{
  const h=harness({admin:true});h.context.runSeo({name:'home'});assert.match(h.meta('meta[name="robots"]').content,/noindex/);
});
test('search/filtered listing is noindex, single category is indexable',()=>{
  const h=harness({query:'cat=chakkars&q=big'});h.context.runSeo({name:'products'});assert.match(h.meta('meta[name="robots"]').content,/noindex/);
  h.context.currentRoute.query='cat=chakkars';h.context.runSeo({name:'products'});assert.equal(h.meta('meta[name="robots"]').content,'index, follow, max-image-preview:large');
  assert.equal(h.schema()['@type'],'CollectionPage');
});
test('missing product is noindex and does not emit Product schema',()=>{
  const h=harness();h.context.runSeo({name:'product'},['missing']);assert.match(h.meta('meta[name="robots"]').content,/noindex/);assert.equal(JSON.stringify(h.schema()).includes('"@type":"Product"'),false);
});
test('CMS template SEO cannot replace a product or filtered-category canonical',()=>{
  const source=fs.readFileSync('visual-editor/js/cms-runtime.js','utf8');
  const a=source.indexOf('  function applySeo('),b=source.indexOf('  // Return references',a);
  const doc={title:'Specific product | Crackers Mela',head:{querySelector:()=>null,appendChild:()=>{}},querySelector:()=>null,createElement:()=>({setAttribute(){}})};
  const context={state:{routeSeo:true},document:doc,safeUrl:x=>x};
  vm.createContext(context);vm.runInContext(source.slice(a,b)+'globalThis.run=applySeo;',context);
  context.run({title:'Template product',canonical:'https://crackersmela.com/product/p-26'});
  assert.equal(doc.title,'Specific product | Crackers Mela');
  context.state.routeSeo=false;context.run({title:'Custom editorial page'});assert.equal(doc.title,'Custom editorial page');
});
