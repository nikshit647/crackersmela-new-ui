import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';

const fixture=JSON.parse(await readFile('audit-evidence/cms-fixture-active.json','utf8'));
const base=fixture.baseUrl, root=path.resolve(fixture.fixture);
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
assert.equal(path.dirname(root),path.resolve('audit-evidence'));
const health=await (await fetch(base+'/__fixture-health')).json();
assert.equal(health.isolated,true);assert.equal(health.mail,'disabled');
const orderId='modal-ui-'+Date.now(), file=path.join(root,'data/orders.json');
const customer={name:'Modal QA Customer',phone:'9999999999',email:'modal-qa@example.test',address:'123 Fixture Road',area:'Test area',city:'Hyderabad',pincode:'500001'};
const order={id:orderId,code:'CM-MODAL-QA',placedAt:'2026-10-09T10:00:00Z',status:'placed',payment:'COD',customer,email:customer.email,shipping:{address:customer.address,area:customer.area,city:customer.city,pincode:customer.pincode},items:[{id:26,name:'Fixture Celebration Box — a deliberately long product name for responsive layout verification',price:1000,compareAt:1200,qty:3,cats:[]}],totals:{subtotal:3000,total:3000,couponAmt:0,couponCode:'',delivery:0,saving:600},note:'Leave with reception',_internalNote:'Staff-only QA instruction',trackingNumber:'QA-TRACK-1',courierName:'Fixture Courier',trackingUrl:'https://example.test/track',log:[]};
const binary=path.join(process.env.APPDATA,'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const session='order-modal-ui-20261009';
const output=path.resolve('audit-evidence/order-modal-browser-'+Date.now());await mkdir(output,{recursive:true});
const checks=[];
const run=(...args)=>{let result;try{result=JSON.parse(execFileSync(binary,['--session',session,...args,'--json'],{encoding:'utf8',windowsHide:true,timeout:45000,maxBuffer:4*1024*1024}));}catch{throw new Error('Browser action failed: '+args[0]);}assert.equal(result.success,true,result.error);return result.data;};
const evaluate=code=>run('eval','-b',Buffer.from(code).toString('base64')).result;
const wait=code=>run('wait','--fn',code);
const check=(name,value,detail)=>{checks.push({name,status:value?'PASS':'FAIL',...(detail?{detail}:{})});assert.ok(value,name);console.log('PASS: '+name);};
const openEditor=()=>{run('click',`[data-edit-order="${orderId}"]`);wait('!!document.querySelector(".order-editor[open]")');};
const section=name=>run('click',`[data-eo-section="${name}"]`);
let failure;
try {
  const store=JSON.parse(await readFile(file,'utf8'));store.orders.push(order);await writeFile(file,JSON.stringify(store));
  await new Promise((resolve,reject)=>{const child=spawn(binary,['--session',session,'open',base+'/?watch=0#/staff'],{stdio:'ignore',windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Browser launch failed')));});
  run('wait','--load','networkidle');
  wait('!!document.querySelector("#goAuthStaff") || !!document.querySelector("#adminShell")');
  evaluate(`(()=>{const native=window.fetch.bind(window);window.__loginAudit=[];window.fetch=async(...args)=>{const response=await native(...args);if(String(args[0]).includes('auth.php')){const data=await response.clone().json();window.__loginAudit.push({path:String(args[0]),status:response.status,authenticated:data.authenticated,role:data.role,permissions:data.permissions?.length,error:data.error});}return response;};})()`);
  if(evaluate('!!document.querySelector("#goAuthStaff")')) {run('click','#goAuthStaff');wait('[...document.querySelector("#authModal").getAnimations({subtree:true})].every(a=>a.playState==="finished")');run('fill','#auEmail',fixture.email);run('fill','#auPass',fixture.password);run('focus','#auSubmit');run('press','Enter');wait('!!document.querySelector("#adminShell")');}
  run('click','[data-stab="orders"]');wait(`!!document.querySelector('[data-edit-order="${orderId}"]')`);
  run('set','viewport','1440','1000');openEditor();
  check('Edit opens a modal and does not add an inline editor row',evaluate('!!document.querySelector(".order-editor:modal") && !document.querySelector("#staffPanel #eoForm")'));
  check('Actual selected order data and every editable field are loaded',evaluate(`document.querySelector('#eoName').value==='Modal QA Customer' && document.querySelector('#eoNote').value==='Leave with reception' && document.querySelector('#eoTrackingNumber').value==='QA-TRACK-1' && ['eoPhone','eoEmail','eoAddr','eoArea','eoCity','eoPin','eoIntNote','eoCouponMode','eoTrackingUrl','eoCourierName','eoCancellationReason','eoRefundAmount','eoStatus'].every(id=>document.getElementById(id))`));
  check('Background scrolling is locked',evaluate('getComputedStyle(document.body).overflow==="hidden" && getComputedStyle(document.documentElement).overflow==="hidden"'));
  run('press','Escape');wait('!document.querySelector(".order-editor")');
  check('Clean Escape closes the popup and restores focus',evaluate(`document.activeElement.dataset.editOrder==='${orderId}' && !document.body.classList.contains('order-editor-open')`));
  openEditor();section('customer');run('fill','#eoName','Modal QA Updated');run('press','Escape');
  check('Escape asks before discarding changed values',evaluate('!document.querySelector("#eoDiscard").hidden && document.querySelector("#eoName").value==="Modal QA Updated"'));
  run('click','#eoKeepEditing');run('focus','#eoReview');run('press','Tab');
  check('Tab remains within the modal',evaluate('document.querySelector(".order-editor").contains(document.activeElement)'));
  for(const width of [360,390,768,1440]) {
    run('set','viewport',String(width),'900');section('items');
    const layout=evaluate(`(()=>{const d=document.querySelector('.order-editor'),f=document.querySelector('.eo-footer'),c=document.querySelector('.eo-content'),r=d.getBoundingClientRect(),fr=f.getBoundingClientRect();return {width:innerWidth,left:r.left,right:r.right,bottom:r.bottom,footerBottom:fr.bottom,scrollWidth:c.scrollWidth,clientWidth:c.clientWidth,bodyWidth:document.body.scrollWidth};})()`);
    check('Modal and persistent actions fit at '+width+'px',layout.left>=0&&layout.right<=width+1&&layout.bottom<=900&&layout.footerBottom<=900&&layout.scrollWidth<=layout.clientWidth+1,layout);
    run('screenshot',path.join(output,'order-items-'+width+'.png'));
  }
  run('set','viewport','1440','1000');section('items');run('fill','.eo-qty','4');
  check('Quantity edits immediately update line totals and subtotal',evaluate('document.querySelector(".eo-line-total").textContent.includes("4,000") && document.querySelector("#eoFooterSubtotal").textContent.includes("4,000")'));
  run('fill','.eo-qty','3');run('click','#eoProductToggle');run('fill','#eoProdSearch','zzzz-no-match');
  check('Product search reports no matches and disables Add',evaluate('document.querySelector("#eoAddSel").options.length===0 && document.querySelector("#eoAdd").disabled'));
  run('fill','#eoProdSearch','');run('select','#eoAddSel',evaluate('[...document.querySelector("#eoAddSel").options].find(o=>o.value!=="26").value'));run('scrollintoview','#eoAdd');run('click','#eoAdd');
  check('Adding a selected catalog product creates an editable line',evaluate('document.querySelectorAll(".eo-line").length===2'));
  evaluate('document.querySelectorAll("[data-eo-rm]")[1].click()');
  check('Removing a product restores the remaining order items',evaluate('document.querySelectorAll(".eo-line").length===1'));
  section('status');run('select','#eoStatus','cancelled');section('cancellation');
  check('Cancellation fields appear for a cancellation status',evaluate('!document.querySelector("#eoCancellationFields").hidden'));
  section('status');run('select','#eoStatus','placed');section('delivery');run('fill','#eoTrackingUrl','javascript:alert(1)');run('click','#eoReview');
  check('Invalid tracking URLs are rejected while entered values remain',evaluate('!document.querySelector("#eoError").hidden && document.querySelector("#eoTrackingUrl").value==="javascript:alert(1)"'));
  run('fill','#eoTrackingUrl','https://example.test/updated');
  // Real endpoint supplies preview; only the forced failure below is injected.
  evaluate(`(()=>{const native=window.fetch.bind(window);window.__modalRequests=[];window.__modalFail=true;window.fetch=async(...args)=>{let body={};try{body=JSON.parse(args[1]?.body||'{}')}catch{}if(String(args[0]).includes('orders-api.php')&&['preview','edit'].includes(body.a)){window.__modalRequests.push({action:body.a,requestId:body.requestId,status:body.status});if(body.a==='edit'&&window.__modalFail){await new Promise(resolve=>setTimeout(resolve,700));return new Response(JSON.stringify({ok:false,error:'Fixture save failure; please retry.'}),{status:503,headers:{'Content-Type':'application/json'}})}}return native(...args);};})()`);
  run('click','#eoReview');wait('!document.querySelector("#eoConfirm").hidden || !document.querySelector("#eoError").hidden');
  check('Read-only review confirms authoritative backend totals',evaluate('!document.querySelector("#eoConfirm").hidden && !document.querySelector("#eoSave").disabled'));
  check('Staff internal note loads without falling back to an empty value',evaluate('document.querySelector("#eoIntNote").value==="Staff-only QA instruction"'));
  evaluate('document.querySelector("#eoForm").requestSubmit();document.querySelector("#eoForm").requestSubmit()');
  wait('!document.querySelector(".order-editor").matches("[aria-busy=true]")');
  check('Failed save preserves values and duplicate submissions send one request',evaluate('document.querySelector("#eoName").value==="Modal QA Updated" && document.querySelector("#eoError").textContent.includes("Fixture save failure") && window.__modalRequests.filter(r=>r.action==="edit").length===1'));
  evaluate('window.__modalFail=false');run('click','#eoSave');wait('!document.querySelector(".order-editor")');
  check('Successful save refreshes the order list without reloading',evaluate(`document.querySelector('[data-edit-order="${orderId}"]').closest('tr').textContent.includes('Modal QA Updated')`));
  const saved=JSON.parse(await readFile(file,'utf8')).orders.find(item=>item.id===orderId);
  check('Saved contact, tracking and private note match the reviewed values',saved.customer.name==='Modal QA Updated'&&saved.trackingUrl==='https://example.test/updated'&&saved._internalNote==='Staff-only QA instruction');
  const errors=run('errors').errors||[];check('No uncaught browser errors',errors.length===0,errors);
} catch(error) {failure=error.stack;try{console.log(JSON.stringify(evaluate('({url:location.href,preview:!!window.CM_EDITOR_PREVIEW,requests:window.__loginAudit,error:document.querySelector("#eoError")?.textContent})')));run('screenshot',path.join(output,'failure.png'));}catch{}throw error;}
finally {
  const store=JSON.parse(await readFile(file,'utf8'));store.orders=store.orders.filter(item=>item.id!==orderId);await writeFile(file,JSON.stringify(store));
  await writeFile('audit/order-modal-browser-results.json',JSON.stringify({status:failure?'FAIL':'PASS',checks,output,failure,scope:'Private localhost fixture; synthetic order only; mail disabled; test order removed by ID.'},null,2));
  try{run('close');}catch{}
}
