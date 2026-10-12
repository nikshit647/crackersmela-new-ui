import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('audit-evidence/production-release/js/app.js','utf8');
function setup(api=async()=>({order:{code:'CM-TEST'}})) {
  const nodes={};
  for(const id of ['trackForm','trackCode','trackPhone','trackResult','trackMessage']) nodes['#'+id]={value:'',textContent:'',innerHTML:'',disabled:false,isConnected:true,setAttribute(){},removeAttribute(){},focus(){this.focused=true;}};
  const button={disabled:false,innerHTML:'Track'};
  nodes['#trackForm'].querySelector=()=>button;
  const rendered=[],requests=[];
  const context=vm.createContext({$:id=>nodes[id],I:{search:''},ORDERS_API:'orders-api.php',AbortController,setTimeout,clearTimeout,apiJSON:async(...args)=>{requests.push(args);return api(...args);},trackRender:order=>rendered.push(order),location:{hash:'#/track?id=CM-TEST&invoice=1'},URLSearchParams});
  const start=source.indexOf('  const wireTracking =');
  assert.ok(start>=0,'Tracking must have an explicit verified submit flow');
  const end=source.indexOf('\n  views.reorder',start);
  vm.runInContext(source.slice(start,end)+'\nwireTracking();',context);
  return {nodes,button,rendered,requests,submit:()=>nodes['#trackForm'].onsubmit({preventDefault(){}})};
}
test('opening tracking never renders an unverified cached order',()=>{
  assert.doesNotMatch(source.slice(source.indexOf('  const postRoute ='),source.indexOf('  const postRoute =')+1400),/trackRender\(code\)/);
  assert.match(source.slice(source.indexOf('  views.track ='),source.indexOf('  const trackRender =')),/Enter your mobile number to continue/);
});
test('empty or invalid mobile stays local and gives field guidance',async()=>{
  const x=setup();x.nodes['#trackCode'].value='CM-TEST';await x.submit();
  assert.equal(x.requests.length,0);assert.match(x.nodes['#trackMessage'].textContent,/mobile number/i);
  x.nodes['#trackPhone'].value='123';await x.submit();assert.equal(x.requests.length,0);
});
test('one pending submit verifies both fields and renders only the API order',async()=>{
  let resolve;const x=setup(()=>new Promise(r=>resolve=r));x.nodes['#trackCode'].value=' CM-TEST ';x.nodes['#trackPhone'].value='9000000000';
  const pending=x.submit();assert.equal(x.button.disabled,true);await x.submit();assert.equal(x.requests.length,1);
  assert.equal(x.requests[0][1].code,'CM-TEST');assert.equal(x.requests[0][1].phone,'9000000000');
  resolve({order:{code:'CM-TEST',status:'packed'}});await pending;
  assert.equal(x.rendered[0].status,'packed');assert.equal(x.button.disabled,false);
});
test('failure removes stale private results and resets the button',async()=>{
  const x=setup(async()=>{throw Object.assign(new Error('missing'),{status:404});});x.nodes['#trackCode'].value='CM-TEST';x.nodes['#trackPhone'].value='9000000000';x.nodes['#trackResult'].innerHTML='previous order';await x.submit();
  assert.equal(x.rendered.length,0);assert.equal(x.nodes['#trackResult'].innerHTML,'');assert.match(x.nodes['#trackMessage'].textContent,/matching those details/);assert.equal(x.button.disabled,false);
});
