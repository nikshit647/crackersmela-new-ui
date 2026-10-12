import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,mkdirSync,copyFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const php=path.resolve('audit-evidence/tools/php-8.3.35/php.exe');
const release=path.resolve('audit-evidence/production-release');
const seed=JSON.parse(readFileSync(path.join(release,'js/products-data.js'),'utf8').match(/window\.CM_DATA\s*=\s*(\{[^]*\})\s*;?\s*$/)[1]);
const ids=seed.categories.map(category=>category.id);
test('CMS validates category ordering without changing category or product data',{skip:!existsSync(php)},async t=>{
  const fixture=mkdtempSync(path.join(tmpdir(),'cms-category-schema-'));
  mkdirSync(path.join(fixture,'js'));
  copyFileSync('visual-editor/cm-cms.php',path.join(fixture,'cm-cms.php'));
  for(const file of ['cm-commerce.php','cm-security.php','js/products-data.js'])copyFileSync(path.join(release,file),path.join(fixture,file));
  // `page` defaults to Home, the canonical owner of the global category order.
  const validate=(content,change={},root,page='home')=>{
    const section={id:'home:shop-categories',source:'home:shop-categories',type:'native',region:'main',name:'Shop by Categories',content,elements:{},...change};
    const doc={schemaVersion:1,id:page,sections:[section]};
    if(root!==undefined)doc.categoryOrder=root;
    const script=`require 'cm-cms.php'; $input=json_decode(stream_get_contents(STDIN),true); echo json_encode(['ok'=>true,'document'=>cmCmsDocument($input,${JSON.stringify(page)})]);`;
    const result=spawnSync(php,['-r',script],{cwd:fixture,input:JSON.stringify(doc),encoding:'utf8',windowsHide:true});
    assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
  };
  try{
    await t.test('accepts the existing category IDs in a new order and preserves content',()=>{
      const order=[...ids].reverse(),result=validate({heading:'Shop by Categories',categoryOrder:order});
      assert.equal(result.ok,true,result.error);assert.deepEqual(result.document.sections[0].content,{heading:'Shop by Categories',categoryOrder:order});
    });
    await t.test('retains legacy documents, partial orders and an explicit reset',()=>{
      assert.equal(validate({heading:'Original'}).ok,true);
      assert.equal(validate({categoryOrder:ids.slice(0,2)}).ok,true);
      const result=validate({categoryOrder:[]});assert.equal(result.ok,true,result.error);assert.deepEqual(result.document.sections[0].content.categoryOrder,[]);
    });
    await t.test('rejects duplicate, unknown, non-string or malformed order entries',()=>{
      for(const order of [[ids[0],ids[0]],['missing-category'],[1],null,{'0':ids[0],'2':ids[1]}])assert.equal(validate({categoryOrder:order}).ok,false,JSON.stringify(order));
    });
    await t.test('rejects category metadata outside the home category section',()=>{
      for(const change of [{id:'home:featured',source:'home:featured'},{type:'productGrid'},{overrides:{mobile:{content:{categoryOrder:[ids[0]]}}}}])assert.equal(validate({categoryOrder:[ids[0]]},change).ok,false);
    });
    await t.test('the global root field stores the order and keeps every other guarantee',()=>{
      const order=[...ids].reverse(),result=validate({heading:'Shop by Categories'},{},order);
      assert.equal(result.ok,true,result.error);
      assert.deepEqual(result.document.categoryOrder,order);
      // The root is the one canonical place; the section no longer carries it.
      assert.equal('categoryOrder' in result.document.sections[0].content,false);
    });
    await t.test('an explicit empty root order is a valid reset to canonical',()=>{
      const result=validate({},{},[]);
      assert.equal(result.ok,true,result.error);
      assert.deepEqual(result.document.categoryOrder,[],'reset must persist as [] and not be dropped');
    });
    await t.test('the root field rejects unknown, duplicate, non-string and malformed entries',()=>{
      for(const order of [[ids[0],ids[0]],['missing-category'],[1],null,{'0':ids[0],'2':ids[1]},'all'])assert.equal(validate({},{},order).ok,false,JSON.stringify(order));
    });
    await t.test('the root field is rejected on any non-owner page',()=>{
      for(const page of ['products','about','price-list'])assert.equal(validate({},{},[ids[0]],page).ok,false,page);
      // A custom page on the Home template is still a different page document.
      assert.equal(validate({},{},[ids[0]],'custom-'+'a'.repeat(32)).ok,false);
    });
    await t.test('the root order does not disturb product ordering or sections',()=>{
      const result=validate({heading:'Shop by Categories',columns:3},{overrides:{mobile:{content:{columns:2}}}},[...ids].reverse());
      assert.equal(result.ok,true,result.error);
      assert.deepEqual(result.document.categoryOrder,[...ids].reverse());
      assert.deepEqual(result.document.sections[0].content,{heading:'Shop by Categories',columns:3});
      assert.deepEqual(result.document.sections[0].overrides.mobile.content,{columns:2});
      assert.equal(result.document.productOrders,undefined,'the root order adds no product ordering');
    });
    await t.test('applying saved order preserves empty and populated content maps in both PHP representations',()=>{
      const script=`require 'cm-cms.php'; $results=[]; foreach ([[],['heading'=>'Keep me','categoryOrder'=>['gift-boxes']],(object)[],(object)['heading'=>'Keep me','categoryOrder'=>['gift-boxes']]] as $content) { $doc=['id'=>'home','sections'=>[['source'=>'home:shop-categories','content'=>$content]]]; $before=json_encode($doc); $next=cmCmsSetCategoryOrder($doc,['sparklers','gift-boxes']); $results[]=['document'=>$next,'type'=>gettype($next['sections'][0]['content']),'originalUnchanged'=>json_encode($doc)===$before]; } echo json_encode($results);`;
      const result=spawnSync(php,['-r',script],{cwd:fixture,encoding:'utf8',windowsHide:true});
      assert.equal(result.status,0,result.stderr);
      const rows=JSON.parse(result.stdout);
      assert.deepEqual(rows.map(row=>row.type),['array','array','object','object']);
      assert.deepEqual(rows.map(row=>row.document.sections[0].content),[[],{heading:'Keep me'},{},{heading:'Keep me'}]);
      assert.ok(rows.every(row=>row.originalUnchanged));
      assert.ok(rows.every(row=>JSON.stringify(row.document.categoryOrder)===JSON.stringify(['sparklers','gift-boxes'])));
    });
    await t.test('validation leaves the original category and product seed byte-for-byte intact',()=>{
      assert.equal(readFileSync(path.join(fixture,'js/products-data.js'),'utf8'),readFileSync(path.join(release,'js/products-data.js'),'utf8'));
    });
  }finally{
    assert.equal(path.dirname(path.resolve(fixture)),path.resolve(tmpdir()));
    assert.ok(path.basename(fixture).startsWith('cms-category-schema-'));
    rmSync(fixture,{recursive:true,force:true});
  }
});
