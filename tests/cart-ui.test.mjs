import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('audit-evidence/production-release/js/app.js','utf8');
function block(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);}
function drawer(count,subtotal){
  const nodes=new Map();
  for(const id of ['#cartDrawerBody','#cartDrawerSummary','#cartDrawerCoupons','#cartDrawerCount','#cartCheckoutBtn','#cartDrawer'])nodes.set(id,{innerHTML:'',textContent:'',style:{},hidden:false,attributes:{},setAttribute(k,v){this.attributes[k]=v;},classList:{toggle(){}}});
  const context=vm.createContext({$:id=>nodes.get(id),cart:[{id:1,qty:count}],prodById:()=>({id:1}),cartLine:()=>'<div class="cart-line">Product</div>',cartTotals:()=>({count,subtotal,saving:100,delivery:0,total:subtotal}),couponSurface:()=>'<div data-cm-coupons="drawer">Offers</div>',couponController:{summary:()=>'<div class="sum-row total">Total</div>'},money:n=>'₹'+n,I:{cart:'',alert:''},STORE:{minOrder:2500},Math});
  vm.runInContext(block('  const cartDrawerRender =','  const openCart ='),context);
  vm.runInContext('cartDrawerRender()',context);
  return nodes;
}
test('drawer keeps coupons separate from the independently scrolling product list',()=>{
  const n=drawer(2,2000);assert.match(n.get('#cartDrawerBody').innerHTML,/cart-line/);assert.doesNotMatch(n.get('#cartDrawerBody').innerHTML,/data-cm-coupons/);assert.match(n.get('#cartDrawerCoupons').innerHTML,/data-cm-coupons/);
});
test('cart heading count handles zero, singular, two digits and 99+ without changing quantity meaning',()=>{
  for(const count of [0,1,2,10,99,101]){const n=drawer(count,count*100),badge=n.get('#cartDrawerCount');assert.equal(badge.textContent,count>99?'99+':String(count));assert.equal(badge.attributes['aria-label'],`${count} ${count===1?'item':'items'} in cart`);}
});
test('empty drawer clears offers and totals and cannot check out',()=>{
  const n=drawer(0,0);assert.match(n.get('#cartDrawerBody').innerHTML,/empty/);assert.equal(n.get('#cartDrawerCoupons').innerHTML,'');assert.equal(n.get('#cartDrawerCoupons').hidden,true);assert.equal(n.get('#cartDrawerSummary').innerHTML,'');assert.equal(n.get('#cartCheckoutBtn').disabled,true);
});
test('drawer retains the exact pre-coupon minimum and remaining amount',()=>{
  for(const amount of [650,2499,2500,3000]){const n=drawer(2,amount);assert.equal(n.get('#cartCheckoutBtn').disabled,amount<2500);if(amount<2500)assert.ok(n.get('#cartDrawerSummary').innerHTML.includes('₹'+(2500-amount)));else assert.doesNotMatch(n.get('#cartDrawerSummary').innerHTML,/min-order-card/);}
});
