import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const binary=path.join(process.env.APPDATA,'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const common=['--namespace','cm-cart-edges','--session','cm-cart-layout-edges'];
const output=path.resolve('audit/cart-ui-browser-20261008');await mkdir(output,{recursive:true});
const run=(...args)=>{const r=JSON.parse(execFileSync(binary,[...common,...args,'--json'],{encoding:'utf8',windowsHide:true,timeout:45000,maxBuffer:6*1024*1024}));assert.ok(r.success,r.error);return r.data;};
const ev=code=>run('eval','-b',Buffer.from(code).toString('base64')).result;
const wait=code=>run('wait','--fn',code);
const polish=process.argv.includes('--polish'),results=[];
try{
 await new Promise((resolve,reject)=>{const p=spawn(binary,[...common,'open','http://localhost:4317/products'],{windowsHide:true,stdio:'ignore'});p.once('exit',code=>code?reject(new Error('Browser launch '+code)):resolve());p.once('error',reject);});
 run('set','media','light','reduced-motion');wait("document.querySelectorAll('.prod-card').length>0");
 const codes=polish?['QASTACKA']:['QASTACKA','QASTACKB',...Array.from({length:8},(_,i)=>'QAMULTI'+(i+1))];
 const items=polish?[{id:26,qty:4}]:[{id:27,qty:4}];
 ev(`localStorage.setItem('cm2.cart',JSON.stringify(${JSON.stringify(items)}));localStorage.setItem('cm2.couponCodes',JSON.stringify(${JSON.stringify(codes)}));localStorage.removeItem('cm2.excludedAutomaticCodes')`);
 run('reload');wait("document.querySelectorAll('.prod-card').length>0");if(ev("!!document.querySelector('[data-analytics-reject]')"))run('click','[data-analytics-reject]');
 for(const [width,height] of (polish?[[1440,1000],[390,844],[390,568]]:[[1440,700],[390,568],[844,390]])){
  run('set','viewport',String(width),String(height));run('click','#cartBtn');wait("/^₹/.test(document.querySelector('#cartDrawer [data-coupon-total]')?.textContent||'')&&!document.querySelector('#cartDrawer .cm-coupons[aria-busy=true]')");
  assert.equal(ev("document.querySelectorAll('#cartDrawer [data-coupon-applied]').length"),codes.length);
  if(polish){run('scrollintoview','#cartDrawer [data-coupon-details] summary');if(!ev("document.querySelector('#cartDrawer [data-coupon-details]').open"))run('click','#cartDrawer [data-coupon-details] summary');run('scrollintoview','#cartDrawer [data-coupon-offer=QA500] .cm-coupon-eligibility');}
  const value=ev("(()=>{const selectors=['#cartCheckoutBtn','#cartViewBtn','#cartDrawerSummary .sum-row.total'];return{width:innerWidth,height:innerHeight,body:{clientHeight:document.querySelector('#cartDrawerBody').clientHeight,scrollHeight:document.querySelector('#cartDrawerBody').scrollHeight},boxes:Object.fromEntries(selectors.map(selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect();return[selector,{top:r.top,bottom:r.bottom,left:r.left,right:r.right,visible:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth}]})),pageOverflow:document.documentElement.scrollWidth>innerWidth}})()");
  if(polish)assert.ok(value.boxes['#cartViewBtn'].bottom-value.boxes['#cartViewBtn'].top>=44,'View Full Cart has a44px minimum tap target');
  run('screenshot',path.join(output,(polish?'polished-applied-and-progress-':'ten-coupons-')+width+'x'+height+'.png'));results.push(value);
  run('click','#cartDrawer .drawer__close');
 }
 await writeFile(path.join(output,polish?'polished-scenario.json':'ten-coupon-geometry.json'),JSON.stringify({status:results.every(row=>Object.values(row.boxes).every(box=>box.visible))?'PASS':'FAIL',scenario:polish?'One applied and one below-minimum synthetic coupon':'Ten accepted synthetic stackable coupons',results,liveWrites:false},null,2));
 assert.ok(results.every(row=>Object.values(row.boxes).every(box=>box.visible)&&!row.pageOverflow),'Total and cart actions remain within each tested viewport');
 console.log(JSON.stringify({mode:polish?'polish':'ten-coupons',results}));
}finally{run('close');}
