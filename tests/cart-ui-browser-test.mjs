import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

const fixture=JSON.parse(await readFile('audit-evidence/cart-ui-fixture-20261008.json','utf8'));
assert.equal(fixture.publicUrl,'http://localhost:4317');
assert.equal((await(await fetch(fixture.baseUrl+'/__fixture-health')).json()).isolated,true);
const binary=path.join(process.env.APPDATA,'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const common=['--pin-tab','--namespace','cm-cart-ui','--session','cm-cart-ui-20261008'];
const output=path.resolve('audit/cart-ui-browser-20261008');await mkdir(output,{recursive:true});
const run=(...args)=>{const result=JSON.parse(execFileSync(binary,[...common,...args,'--json'],{encoding:'utf8',windowsHide:true,maxBuffer:6*1024*1024,timeout:45000}));assert.ok(result.success,result.error);return result.data;};
const evaluate=code=>run('eval','-b',Buffer.from(code).toString('base64')).result;
const wait=code=>run('wait','--fn',code);
const checks=[],layouts=[];
const check=(name,value,detail)=>{checks.push({name,pass:!!value,...(detail?{detail}:{})});assert.ok(value,name+': '+JSON.stringify(detail));};
const money=value=>Number(String(value).replace(/[^\d.]/g,''));
const amount=selector=>money(evaluate(`document.querySelector(${JSON.stringify(selector)}).textContent`));
const screenshot=name=>run('screenshot',path.join(output,name+'.png'));
const ready=(scope='#cartDrawer')=>wait(`(()=>{const total=document.querySelector(${JSON.stringify(scope+' [data-coupon-total]')});return total&&/^₹/.test(total.textContent)&&!document.querySelector(${JSON.stringify(scope+' .cm-coupons[aria-busy="true"]')})})()`);
const cart=()=>evaluate("JSON.parse(localStorage.getItem('cm2.cart')||'[]')");
const setCart=items=>{
  run('open',fixture.publicUrl+'/products');wait("document.querySelectorAll('.prod-card').length>0");
  evaluate(`localStorage.setItem('cm2.cart',JSON.stringify(${JSON.stringify(items)}));localStorage.removeItem('cm2.couponCodes');localStorage.removeItem('cm2.excludedAutomaticCodes')`);
  run('reload');wait("document.querySelectorAll('.prod-card').length>0");
  if(evaluate("!!document.querySelector('[data-analytics-reject]')"))run('click','[data-analytics-reject]');
  run('click','#cartBtn');
  wait("document.querySelector('#cartDrawer').classList.contains('open')&&document.querySelector('#cartDrawer').getAnimations({subtree:true}).every(a=>a.playState!=='running')");
  if(items.length)ready();
};
const expandOffers=scope=>{const selector=scope+' [data-coupon-details]';if(evaluate(`!!document.querySelector(${JSON.stringify(selector)})&&!document.querySelector(${JSON.stringify(selector)}).open`)){run('scrollintoview',selector+' summary');run('click',selector+' summary');}};
const apply=async(code,scope='#cartDrawer',manual=false)=>{
  if(manual){run('fill',scope+' [data-coupon-input]',code);run('click',scope+' [data-coupon-form] button');}
  else{expandOffers(scope);run('scrollintoview',scope+` [data-coupon-apply="${code}"]`);run('click',scope+` [data-coupon-apply="${code}"]`);}
  ready(scope);
};
const geometry=()=>evaluate(`(()=>{
 const rect=selector=>{const element=document.querySelector(selector);if(!element)return null;const r=element.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,scrollHeight:element.scrollHeight,clientHeight:element.clientHeight};};
 const selectors={panel:'#cartDrawer .drawer__panel',body:'#cartDrawerBody',coupons:'#cartDrawerCoupons',couponHeading:'#cartDrawerCoupons .cm-coupons__heading',couponEntry:'#cartDrawerCoupons .cm-coupon-entry',couponToggle:'#cartDrawerCoupons [data-coupon-details] summary',offers:'#cartDrawerCoupons .cm-coupon-offers__list',total:'#cartDrawerSummary .sum-row.total',checkout:'#cartCheckoutBtn',fullCart:'#cartViewBtn',heading:'#cartDrawer .drawer__head h3',badge:'#cartDrawerCount'};
 return {width:innerWidth,height:innerHeight,pageOverflow:document.documentElement.scrollWidth>innerWidth,boxes:Object.fromEntries(Object.entries(selectors).map(([key,value])=>[key,rect(value)]))};
})()`);
const inside=(box,g)=>!!box&&box.x>=-1&&box.right<=g.width+1&&box.y>=-1&&box.bottom<=g.height+1&&box.height>0;
const checkLayout=label=>{
 const g=geometry();layouts.push({label,...g});
 check(label+' has no horizontal page overflow',!g.pageOverflow,g);
 check(label+' checkout and full-cart actions stay visible',inside(g.boxes.checkout,g)&&inside(g.boxes.fullCart,g),g);
 check(label+' total stays visible',inside(g.boxes.total,g),g);
 check(label+' coupon heading or controls stay visible',inside(g.boxes.couponHeading,g)||inside(g.boxes.couponEntry,g)||inside(g.boxes.couponToggle,g),g);
 check(label+' count stays aligned',g.boxes.badge.y>=g.boxes.heading.y-1&&g.boxes.badge.bottom<=g.boxes.heading.bottom+1,g.boxes);
 screenshot(label);return g;
};
const expectedQuote=async(items,codes=[])=>{
 const response=await fetch(fixture.publicUrl+'/coupons-api.php?a=quote',{method:'POST',headers:{'Content-Type':'application/json',Origin:fixture.publicUrl},body:JSON.stringify({items,codes,excludedAutomaticCodes:[]})});
 assert.equal(response.ok,true);return response.json();
};
try{
 await new Promise((resolve,reject)=>{const child=spawn(binary,[...common,'open',fixture.publicUrl],{windowsHide:true,stdio:'ignore'});child.once('exit',code=>code?reject(new Error('Browser startup '+code)):resolve());child.once('error',reject);});
 run('set','media','light','reduced-motion');
 for(const [width,height] of [[1440,900],[820,1024],[390,844],[390,568]]){
  run('set','viewport',String(width),String(height));setCart([{id:26,qty:1}]);
  checkLayout('one-item-'+width+'x'+height);
  expandOffers('#cartDrawer');checkLayout('offers-open-'+width+'x'+height);
  if(height>640)check('Expanded offers keep one complete product control row '+width+'x'+height,evaluate("(()=>{const body=document.querySelector('#cartDrawerBody').getBoundingClientRect(),foot=document.querySelector('#cartDrawerBody .cart-line__foot').getBoundingClientRect();return foot.top>=body.top&&foot.bottom<=body.bottom})()"));
  run('scrollintoview','#cartDrawerCoupons [data-coupon-input]');
  check('Coupon input is reachable '+width+'x'+height,evaluate("(()=>{const e=document.querySelector('#cartDrawerCoupons [data-coupon-input]'),r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e})()"));
  if(height===568)screenshot('coupon-entry-reached-'+width+'x'+height);
 }
 await writeFile(path.join(output,'layout-results.json'),JSON.stringify({status:'PASS',checks,layouts},null,2));
 if(process.argv.includes('--layout'))console.log(JSON.stringify({status:'PASS',phase:'layout',checks:checks.length,screenshots:layouts.map(row=>row.label)}));
 else{
  run('set','viewport','1440','900');setCart([]);
  check('Empty drawer keeps zero count and disabled checkout',evaluate("document.querySelector('#cartDrawerCount').textContent==='0'&&document.querySelector('#cartCheckoutBtn').disabled&&document.querySelector('#cartDrawerCoupons').hidden"));
  run('click','#cartDrawer [data-shop-more]');wait("!document.querySelector('#cartDrawer').classList.contains('open')");
  run('click','[data-add="26"]');wait("JSON.parse(localStorage.getItem('cm2.cart')).find(row=>row.id===26)?.qty===1");run('click','#cartBtn');ready();
  check('Add updates both badges dynamically',evaluate("document.querySelector('#cartCount').textContent==='1'&&document.querySelector('#cartDrawerCount').textContent==='1'"));
  check('Below minimum shows correct remainder and keeps checkout disabled',evaluate("document.querySelector('#cartDrawerSummary').textContent.includes('₹1,850')&&document.querySelector('#cartCheckoutBtn').disabled"));
  check('One product subtotal and comparison saving stay unchanged',amount('#cartDrawerSummary .sum-row b')===650&&amount('#cartDrawerSummary .sum-row:last-child .save')===1079);
  run('click','#cartDrawer [data-qty="26"][data-d="1"]');ready();
  check('Quantity increase updates count and total',cart()[0].qty===2&&amount('#cartDrawerSummary [data-coupon-total]')===1300&&evaluate("document.querySelector('#cartDrawerCount').textContent==='2'"));
  run('reload');wait("document.querySelectorAll('.prod-card').length>0");run('click','#cartBtn');ready();check('Cart quantity persists through refresh',cart()[0].qty===2);
  run('click','#cartDrawer [data-qty="26"][data-d="-1"]');ready();check('Quantity decrease recalculates total',amount('#cartDrawerSummary [data-coupon-total]')===650);
  run('click','#cartDrawer [data-del="26"]');check('Remove last item restores empty state',cart().length===0&&evaluate("document.querySelector('#cartDrawerCount').textContent==='0'"));
  setCart([{id:28,qty:3}]);run('click','#cartDrawer [data-qty="28"][data-d="1"]');check('Stock limit caps quantity at three',cart()[0].qty===3);
  setCart([{id:26,qty:50},{id:27,qty:50},{id:28,qty:1}]);
  check('101 items show 99+ but retain exact accessible quantity',evaluate("document.querySelector('#cartDrawerCount').textContent==='99+'&&document.querySelector('#cartDrawerCount').getAttribute('aria-label')==='101 items in cart'&&document.querySelector('#cartCount').textContent==='99+'&&document.querySelector('#cartCount').getAttribute('aria-label')==='101 items in cart'"));screenshot('badge-101');
  const many=[26,27,28,30,31,32,33,34,35,36,37,38].map(id=>({id,qty:1}));
  for(const [width,height] of [[1440,900],[820,1024],[390,844],[390,568]]){
   run('set','viewport',String(width),String(height));setCart(many);const before=checkLayout('many-items-'+width+'x'+height);
   check('Many products use an internal scroller '+width+'x'+height,before.boxes.body.scrollHeight>before.boxes.body.clientHeight);
   evaluate("document.querySelector('#cartDrawerBody').scrollTop=99999");const after=geometry();check('Item scroll does not move coupon heading or actions '+width+'x'+height,Math.abs(after.boxes.couponHeading.y-before.boxes.couponHeading.y)<1&&Math.abs(after.boxes.checkout.y-before.boxes.checkout.y)<1);
   expandOffers('#cartDrawer');screenshot('many-offers-open-'+width+'x'+height);
  }
  if(!process.argv.includes('--core')){
  run('set','viewport','1440','900');setCart([{id:27,qty:2}]);
  check('Exactly ₹2500 meets pre-coupon minimum',!evaluate("document.querySelector('#cartCheckoutBtn').disabled")&&!evaluate("!!document.querySelector('#cartDrawer .min-order-card')"));
  expandOffers('#cartDrawer');
  check('Only eligible public coupon records are offered',evaluate("!document.querySelector('#cartDrawer [data-coupon-offer=QAEXPIRED]')&&!document.querySelector('#cartDrawer [data-coupon-offer=QAINACTIVE]')&&!document.querySelector('#cartDrawer [data-coupon-offer=QAHIDDEN]')"));
  check('Below-minimum offer has Shop action and server progress',evaluate("!document.querySelector('#cartDrawer [data-coupon-apply=QA500]')&&!!document.querySelector('#cartDrawer [data-coupon-offer=QA500] [data-shop-more]')&&document.querySelector('#cartDrawer [data-coupon-offer=QA500]').textContent.includes('₹2,500 / ₹5,000')&&document.querySelector('#cartDrawer [data-coupon-offer=QA500] progress').value===50"));
  await apply('WRONG','#cartDrawer',true);check('Invalid manual coupon reports error without discount',evaluate("document.querySelector('#cartDrawer .cm-coupon-message').textContent.includes(\"isn't valid\")")&&amount('#cartDrawer [data-coupon-total]')===2500);
  await apply('QA10');
  const quote=await expectedQuote([{id:27,qty:2}],['QA10']);
  check('Applied percentage coupon uses exact backend total',amount('#cartDrawer [data-coupon-total]')===quote.total&&quote.total===2250);
  check('Savings add coupon discount exactly once',amount('#cartDrawerSummary .sum-row:last-child .save')===1750);
  check('Coupon reducing total below ₹2500 does not disable checkout',!evaluate("document.querySelector('#cartCheckoutBtn').disabled"));
  check('Second incompatible coupon is disabled with stacking reason',evaluate("document.querySelector('#cartDrawer [data-coupon-apply=QASTACKA]').disabled&&document.querySelector('#cartDrawer [data-coupon-offer=QASTACKA]').textContent.includes('cannot be combined')"));
  check('Delivery Free row removed from shared drawer summary',!evaluate("Array.from(document.querySelectorAll('#cartDrawerSummary .sum-row')).some(row=>row.textContent.includes('Delivery'))"));
  run('reload');wait("document.querySelectorAll('.prod-card').length>0");run('click','#cartBtn');ready();check('Accepted coupon revalidates and persists after refresh',amount('#cartDrawer [data-coupon-total]')===2250&&evaluate("!!document.querySelector('#cartDrawer [data-coupon-applied=QA10]')"));
  run('click','#cartDrawer [data-coupon-remove=QA10]');ready();check('Removing coupon restores subtotal payable',amount('#cartDrawer [data-coupon-total]')===2500);
  await apply('QASTACKA');await apply('QASTACKB');check('Compatible stacked coupons use backend total',amount('#cartDrawer [data-coupon-total]')===(await expectedQuote([{id:27,qty:2}],['QASTACKA','QASTACKB'])).total);
  run('click','#cartViewBtn');wait("!!document.querySelector('#goCheckout')");ready('.cart-order-panel');
  check('Full-cart summary shares coupon totals and has no delivery row',amount('.cart-order-panel [data-coupon-total]')===2200&&!evaluate("document.querySelector('.cart-order-panel [data-cm-coupon-summary]').textContent.includes('Delivery')"));screenshot('full-cart-desktop');
  run('click','#goCheckout');wait("!!document.querySelector('#ck_name')");ready('.cart-order-panel');
  const form={name:'Synthetic Cart QA',phone:'9876500991',email:'cart-qa@example.invalid',address:'12 Synthetic Test Street',area:'Fixture',city:'Hyderabad',pincode:'500001'};
  for(const [key,value] of Object.entries(form))run('fill','#ck_'+key,value);
  ready('.cart-order-panel');run('click','.cart-order-panel [data-coupon-remove=QASTACKA]');ready('.cart-order-panel');
  check('Coupon repaint preserves checkout form typing',Object.entries(form).every(([key,value])=>evaluate(`document.querySelector('#ck_${key}').value`)===value));
  check('Checkout subtotal total and savings match shared logic',amount('.cart-order-panel [data-coupon-total]')===2300&&amount('.cart-order-panel [data-cm-coupon-summary] .sum-row:last-child .save')===1700);
  for(const [width,height] of [[1440,900],[390,844]]){run('set','viewport',String(width),String(height));run('scrollintoview','.cart-order-panel');screenshot('checkout-details-'+width);check('Checkout page has no horizontal overflow '+width,evaluate("document.documentElement.scrollWidth<=innerWidth"));}
  run('set','viewport','1440','900');run('click','#ckNext1');wait("!!document.querySelector('#ckNext2')");ready('.cart-order-panel');check('Payment step keeps shared summary',amount('.cart-order-panel [data-coupon-total]')===2300);
  run('click','#ckNext2');wait("!!document.querySelector('#ckPlace')");ready('.cart-order-panel');check('Review step is ready with unchanged total',amount('.cart-order-panel [data-coupon-total]')===2300&&!evaluate("document.querySelector('#ckPlace').disabled"));screenshot('checkout-review-desktop');
  run('set','viewport','390','844');run('scrollintoview','.cart-order-panel');screenshot('checkout-review-mobile');check('Mobile review has no horizontal overflow',evaluate("document.documentElement.scrollWidth<=innerWidth"));
  }
  const errors=run('errors');check('No browser JavaScript errors',(errors.errors||[]).length===0,errors);
  await writeFile(path.join(output,'results.json'),JSON.stringify({status:'PASS',checks,layouts,errors,orderSubmitted:false,liveWrites:false},null,2));console.log(JSON.stringify({status:'PASS',checks:checks.length,orderSubmitted:false,liveWrites:false}));
 }
}catch(error){try{screenshot('failure');}catch{}await writeFile(path.join(output,'results.json'),JSON.stringify({status:'FAIL',checks,layouts,error:error.message},null,2));throw error;}
finally{run('close');}
