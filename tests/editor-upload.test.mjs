import test from 'node:test';
import assert from 'node:assert/strict';
import {uploadOriginalImage} from '../audit-evidence/product-experience-20261010/source/js/editor-upload.js';
let sent,request;
globalThis.FormData=class {append(...args){sent=args;}};
globalThis.XMLHttpRequest=class {constructor(){request=this;this.upload={};}open(method,url){this.method=method;this.url=url;}setRequestHeader(name,value){this.header=[name,value];}send(form){this.form=form;}};
test('valid image is sent unchanged and upload reports byte progress',async()=>{
  const file=new Blob([Uint8Array.from([1,2,3,4])],{type:'image/png'}),progress=[];
  const pending=uploadOriginalImage(file,{csrf:'test',name:'original.png',onProgress:value=>progress.push(value)});
  assert.equal(sent[1],file);assert.equal(sent[2],'original.png');assert.equal(request.timeout,120000);assert.deepEqual(request.header,['X-CSRF-Token','test']);
  request.upload.onprogress({lengthComputable:true,loaded:2,total:4});request.status=200;request.responseText=JSON.stringify({ok:true,url:'/uploads/original.png'});request.onload();
  assert.equal((await pending).url,'/uploads/original.png');assert.deepEqual(progress,[0,50,100]);
});
test('empty, infinite, too-large and unsupported image inputs are rejected before a request',async()=>{
  for(const file of [{size:0,type:'image/png'},{size:Infinity,type:'image/png'},{size:5242881,type:'image/png'},{size:4,type:'image/svg+xml'}])await assert.rejects(uploadOriginalImage(file),/Choose/);
});
test('network and malformed server responses provide actionable errors',async()=>{
  const file=new Blob(['abc'],{type:'image/webp'});
  let pending=uploadOriginalImage(file);request.onerror();await assert.rejects(pending,/Check your connection/);
  pending=uploadOriginalImage(file);request.status=500;request.responseText='not JSON';request.onload();await assert.rejects(pending,/unreadable upload response/);
});
