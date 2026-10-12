import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const root = process.env.CM_PRODUCT_SOURCE || 'audit-evidence/product-experience-20261010/source';
const source = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const start = source.indexOf('  const productImages = () =>');
const end = source.indexOf('  const handleProductImageError', start);
test('an open listing clears a removed primary and can show a subsequent replacement', () => {
  const attrs = new Map([['src','uploads/old.png'],['data-cm-product','1']]);
  let sibling = null;
  const img = { dataset: { cmImage: 'product' }, hidden: false,
    getAttribute: key => attrs.get(key), setAttribute: (key,value) => attrs.set(key,value),
    hasAttribute: key => attrs.has(key), removeAttribute: key => attrs.delete(key),
    after: node => { sibling = node; }, get nextElementSibling() { return sibling; } };
  const product = { id:1, image:'' };
  const document = { createElement() { const local = new Map(); return { setAttribute:(key,value)=>local.set(key,value), hasAttribute:key=>local.has(key), remove:()=>{sibling=null;} }; } };
  const context = vm.createContext({ document, $$:()=>[img], prodById:()=>product, safeImageSrc:value=>value||'', nobgSrc:()=>'', catIcon:()=>'<span>Image unavailable</span>',catLabel:()=>({}) });
  vm.runInContext(source.slice(start,end)+'\nthis.refresh = refreshProductImages;',context);
  assert.equal(context.refresh(),1);
  assert.equal(img.hidden,true);
  assert.equal(attrs.has('src'),false);
  assert.ok(sibling);
  assert.equal(context.refresh(),0);
  product.image='uploads/new.png';
  assert.equal(context.refresh(),1);
  assert.equal(attrs.get('src'),'uploads/new.png');
  assert.equal(img.hidden,false);
  assert.equal(sibling,null);
});
