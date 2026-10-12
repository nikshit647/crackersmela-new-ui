import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalIssue,createSeoEditor} from '../audit-evidence/product-experience-20261010/source/js/editor-seo.js';

test('canonical accepts the target clean production route and rejects cross-page, private and decorated URLs',()=>{
  const expected='https://crackersmela.com/about';
  for(const value of ['',expected,expected+'/'])assert.equal(canonicalIssue(value,expected),'');
  for(const value of ['https://crackersmela.com/contact','http://crackersmela.com/about','https://admin.crackersmela.com/about','https://crackersmela.com:443/about',expected+'?x=1',expected+'#x','https://other.example/about','https://user:pass@crackersmela.com/about'])assert.match(canonicalIssue(value,expected),/own clean URL/);
});

test('repeated renders share pending SEO loads and failed loads wait for an explicit retry',async()=>{
  const prior={fetch:globalThis.fetch,document:globalThis.document};
  const calls=[],listeners={},root={contains:()=>false,querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(name,fn)=>listeners[name]=fn};
  let release,renderCount=0;
  globalThis.document={activeElement:null};
  globalThis.fetch=async url=>{calls.push(url);await new Promise(resolve=>{release=resolve;setTimeout(resolve,10);});return {ok:false,status:503,json:async()=>({ok:false,error:'Temporarily unavailable'})};};
  const editor=createSeoEditor({getState:()=>({page:{id:'home',name:'Home',path:'/'},doc:{seo:{}},categories:[]}),root:()=>root,onRender:()=>renderCount++});
  try {
    for(let i=0;i<8;i++)editor.render();
    assert.equal(calls.length,2);
    await new Promise(resolve=>setTimeout(resolve,30));
    for(let i=0;i<8;i++)editor.render();
    assert.equal(calls.length,2);assert.ok(renderCount>=1);
    listeners.click({target:{closest:()=>({hasAttribute:name=>name==='data-seo-retry-overview',dataset:{}})}});
    await new Promise(resolve=>setTimeout(resolve,30));assert.equal(calls.length,3);
  }finally{globalThis.fetch=prior.fetch;globalThis.document=prior.document;release?.();}
});
