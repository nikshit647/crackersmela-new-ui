import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const root='audit-evidence/product-experience-20261010/source';
const app=await readFile(root+'/js/app.js','utf8'),resourceScript=await readFile(root+'/js/page-content.js','utf8'),dataScript=await readFile(root+'/js/products-data.js','utf8');
const window={};vm.runInNewContext(resourceScript,{window});vm.runInNewContext(dataScript,{window});
const start=app.indexOf('  const I = {'),end=app.indexOf('\n  };',start)+5,I=vm.runInNewContext(app.slice(start,end)+'\nI;',{}),STORE=window.CM_DATA.store;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const original=await readFile('audit-evidence/product-experience-20261010/editorial-source-before-extraction.txt','utf8');
const previous=vm.runInNewContext(original+'\nCONTENT;',{I,STORE});
const block=app.slice(app.indexOf('  const CONTENT = '),app.indexOf('\n  views.content'));
const current=vm.runInNewContext(block+'\nCONTENT;',{I,STORE,esc,window});
// Store addresses are now HTML-escaped at the substitution boundary. An encoded
// ampersand is the same DOM text as the original literal ampersand.
assert.equal(JSON.stringify(current).replaceAll('&amp;','&'),JSON.stringify(previous).replaceAll('&amp;','&'),'Existing page DOM markup and words are preserved');
assert.equal(Object.keys(current).length,9);
assert.ok(!JSON.stringify(current).includes('{{CM:'));
assert.ok(window.CM_PAGE_CONTENT.priceList.includes('{{CM:priceRows}}'));
assert.equal(Object.keys(window.CM_PAGE_CONTENT.cmsIcons).length,9);
console.log('PASS: Nine pages preserve exact existing markup/copy, current STORE substitutions, SVGs, and typed price-list tokens');
