import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync('audit-evidence/production-release/js/app.js', 'utf8');
function harness(status = 'placed') {
  const start = source.indexOf('  const orderEditorHTML =') >= 0 ? source.indexOf('  const orderEditorHTML =') : source.indexOf('  const orderEditRow =');
  const end = source.indexOf('  const clearAdmPicked =', start);
  const fields = Object.fromEntries(Object.entries({eoName:'Fixture Customer',eoPhone:'9999999999',eoEmail:'fixture@example.test',eoAddr:'123 Fixture Road',eoArea:'Fixture',eoCity:'Hyderabad',eoPin:'500001',eoCouponMode:'keep',eoCouponCode:'',eoNote:'',eoIntNote:'Staff private note',eoTrackingNumber:'',eoCourierName:'',eoTrackingUrl:'',eoCancellationReason:'',eoRefundAmount:'',eoStatus:status}).map(([key,value]) => [key,{value,disabled:false,setAttribute(){},removeAttribute(){}}]));
  fields.eoOverride = {checked:false};
  const order={id:'fixture-order',code:'CM-FIXTURE',status,placedAt:'2026-10-09T00:00:00Z',payment:'COD',customer:{name:'Fixture Customer',phone:'9999999999',email:'fixture@example.test',address:'123 Fixture Road',area:'Fixture',city:'Hyderabad',pincode:'500001'},items:[{id:26,name:'Fixture product',price:1000,qty:3}],totals:{subtotal:3000,total:3000,couponAmt:0},internalNote:'Staff private note'};
  const calls=[];
  const context=vm.createContext({console,URL,JSON,Math,Date,Set,crypto:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'},setTimeout,clearTimeout,window:{addEventListener(){},removeEventListener(){}},document:{querySelector:()=>null},orders:[order],hasPermission:()=>true,$:s=>fields[s.replace(/^#/,'')]||null,$$:()=>[],esc:v=>String(v??''),money:v=>'₹'+Number(v).toFixed(2),fmtDate:v=>v,STATUSES:[{key:'placed',label:'Order Placed'},{key:'shipped',label:'Shipped'}],STATUS_PILL:{},I2:{},mergedProducts:()=>[],toast(){},apiJSON:async(url,payload)=>{calls.push(payload);return new Promise(()=>{});}});
  vm.runInContext(source.slice(start,end),context);
  vm.runInContext('editOrderObj=orders[0]; eoItems=orders[0].items.map(item=>({...item}));',context);
  return {context,fields,calls,order};
}

test('saving twice while the first request is pending sends one logical save',()=>{
  const h=harness();
  // The legacy save was callable repeatedly, producing duplicate writes/emails.
  vm.runInContext('if(typeof eoState!=="undefined") {eoState={dialog:{setAttribute(){},querySelectorAll(){return[];}},reviewed:JSON.stringify(eoPayload()),requestId:"fixture-request-123",busy:false};} doEoSave(); doEoSave();',h.context);
  assert.equal(h.calls.filter(call=>call.a==='edit').length,1);
});

test('shipped contact edits omit fields forbidden by the real edit endpoint',()=>{
  const h=harness('shipped');
  vm.runInContext('if(typeof eoState!=="undefined") {eoState={dialog:{setAttribute(){},querySelectorAll(){return[];}},reviewed:JSON.stringify(eoPayload()),requestId:"fixture-request-123",busy:false};} doEoSave();',h.context);
  const payload=h.calls.find(call=>call.a==='edit');
  assert.ok(payload);
  assert.equal('items' in payload,false);
  assert.equal('shipping' in payload,false);
  assert.equal(payload.coupon,'keep');
  assert.equal(payload.internalNote,'Staff private note');
});

test('an invalid tracking URL is rejected before any request',()=>{
  const h=harness();h.fields.eoTrackingUrl.value='javascript:alert(1)';
  vm.runInContext('if(typeof eoState!=="undefined") {eoState={dialog:{setAttribute(){},querySelectorAll(){return[];}},reviewed:JSON.stringify(eoPayload()),requestId:"fixture-request-123",busy:false};} doEoSave();',h.context);
  assert.equal(h.calls.length,0);
});

function pricingHarness(totals) {
  const h=harness();
  h.order.totals=totals;
  for (const id of ['eoTotals','eoFooterSubtotal','eoFooterTotal','eoFooterTotalLabel','eoPricingHelp']) h.fields[id]={innerHTML:'',textContent:''};
  vm.runInContext('eoState={preview:null,originalPricing:JSON.stringify({items:eoItems.map(it=>({id:it.id,qty:Number(it.qty)})),coupon:eoValue("eoCouponMode"),code:eoValue("eoCouponCode")})};',h.context);
  return h;
}

test('opening or editing a note preserves the saved total and discount breakdown',()=>{
  const h=pricingHarness({subtotal:3000,couponAmt:100,festiveAmt:150,festivePct:5,posDiscount:200,delivery:100,tax:50,total:2700});
  vm.runInContext('updateEoTotals();',h.context);
  assert.equal(h.fields.eoFooterTotal.textContent,'₹2700.00');
  assert.match(h.fields.eoTotals.innerHTML,/Festive discount.*₹150\.00/);
  assert.match(h.fields.eoTotals.innerHTML,/POS discount.*₹200\.00/);
  assert.match(h.fields.eoTotals.innerHTML,/Tax.*₹50\.00/);
  h.fields.eoNote.value='New customer note';
  vm.runInContext('eoChanged();',h.context);
  assert.equal(h.fields.eoFooterTotal.textContent,'₹2700.00');
  assert.equal(h.order.totals.total,2700);
});

test('quantity changes show a new subtotal and require server review for adjustments',()=>{
  const h=pricingHarness({subtotal:3000,couponAmt:0,festiveAmt:150,festivePct:5,delivery:100,total:2950});
  vm.runInContext('eoItems[0].qty=4;updateEoTotals();',h.context);
  assert.equal(h.fields.eoFooterSubtotal.textContent,'₹4000.00');
  assert.equal(h.fields.eoFooterTotal.textContent,'Review to confirm');
  assert.match(h.fields.eoTotals.innerHTML,/Festive discount<\/span><b>Pending review/);
});

test('reviewed pricing displays the exact server total and festive discount',()=>{
  const h=pricingHarness({subtotal:3000,couponAmt:0,festiveAmt:150,delivery:100,total:2950});
  vm.runInContext('eoItems[0].qty=4;eoState.preview={totals:{subtotal:4000,couponAmt:100,festiveAmt:200,delivery:100,tax:25,total:3825}};updateEoTotals();',h.context);
  assert.equal(h.fields.eoFooterTotal.textContent,'₹3825.00');
  assert.equal(h.fields.eoFooterTotalLabel.textContent,'Confirmed total');
  assert.match(h.fields.eoTotals.innerHTML,/Festive discount.*₹200\.00/);
  assert.match(h.fields.eoTotals.innerHTML,/Tax.*₹25\.00/);
});
