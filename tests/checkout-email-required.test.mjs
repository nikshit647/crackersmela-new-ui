import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('audit-evidence/production-release/js/app.js','utf8');
const start=source.indexOf('  const checkoutValidate =');
const end=source.indexOf('\n  views.checkout',start);
const context=vm.createContext({cart:[{id:1,qty:1}]});
vm.runInContext(source.slice(start,end)+'\nglobalThis.validate=checkoutValidate;',context);
test('checkout requires a usable email before payment',()=>{
 const state={step:1,billingSame:true,data:{name:'Local Customer',phone:'9000000000',address:'12 Local Test Street',city:'Hyderabad',pincode:'500001',email:''}};
 assert.ok(context.validate(state).some(e=>/email.*required/i.test(e)));
 state.data.email='invalid';assert.ok(context.validate(state).some(e=>/valid email/i.test(e)));
 state.data.email='customer@example.test';assert.ok(!context.validate(state).some(e=>/email/i.test(e)));
 assert.match(source,/id="ck_email"[^>]*required/);
 assert.doesNotMatch(source,/Your email \(optional\)/);
});
