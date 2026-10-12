import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,mkdirSync,copyFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const php=path.resolve('audit-evidence/tools/php-8.3.35/php.exe');
test('Products block ordering uses the existing validated native section content',{skip:!existsSync(php)},async t=>{
  const fixture=mkdtempSync(path.join(tmpdir(),'cm-products-blocks-'));
  mkdirSync(path.join(fixture,'js'));
  copyFileSync('visual-editor/cm-cms.php',path.join(fixture,'cm-cms.php'));
  for(const file of ['cm-commerce.php','cm-security.php','js/products-data.js'])copyFileSync(path.join('audit-evidence/production-release',file),path.join(fixture,file));
  const seed=readFileSync(path.join(fixture,'js/products-data.js'),'utf8');
  const validate=(blockOrders,{page='products',source='products:shop-layout',type='native'}={})=>{
    const document={schemaVersion:1,id:page,sections:[{id:source,source,type,region:'main',name:'Shop layout',content:{blockOrders},elements:{}}]};
    const result=spawnSync(php,['-r',`require 'cm-cms.php'; $input=json_decode(stream_get_contents(STDIN),true); echo json_encode(['ok'=>true,'document'=>cmCmsDocument($input,${JSON.stringify(page)})]);`],{cwd:fixture,input:JSON.stringify(document),encoding:'utf8',windowsHide:true});
    assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
  };
  try{
    await t.test('stores all three block groups without copying live product/filter data',()=>{
      const blockOrders={layout:['products','filters'],filters:['category','availability','price','clear'],products:['grid','toolbar','results']};
      const result=validate(blockOrders);assert.equal(result.ok,true,result.error);assert.deepEqual(result.document.sections[0].content.blockOrders,blockOrders);
      assert.equal(result.document.categoryOrder,undefined);assert.equal(result.document.productOrders,undefined);
    });
    await t.test('permits partial groups and explicit canonical resets',()=>{
      for(const value of [{filters:['category','price']},{filters:[]},{}]){const result=validate(value);assert.equal(result.ok,true,result.error);}
    });
    await t.test('rejects duplicate, unknown, cross-group and non-string block references',()=>{
      for(const value of [{filters:['category','category']},{filters:['products']},{layout:['price']},{products:['missing']},{filters:[5]},{unexpected:['price']},{filters:'price'},null])assert.equal(validate(value).ok,false,JSON.stringify(value));
    });
    await t.test('rejects block order on other page sections and section types',()=>{
      for(const option of [{source:'products:page-head'},{source:'products:benefits'},{page:'home',source:'home:shop-categories'},{type:'productGrid'}])assert.equal(validate({filters:['category']},option).ok,false,JSON.stringify(option));
    });
    await t.test('block validation never changes canonical categories or products',()=>{assert.equal(readFileSync(path.join(fixture,'js/products-data.js'),'utf8'),seed);});
  }finally{
    assert.equal(path.dirname(path.resolve(fixture)),path.resolve(tmpdir()));assert.ok(path.basename(fixture).startsWith('cm-products-blocks-'));rmSync(fixture,{recursive:true,force:true});
  }
});
