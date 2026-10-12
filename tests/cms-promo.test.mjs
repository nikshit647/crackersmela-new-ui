import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function rules(item){
  const context=vm.createContext({window:{},document:{},URL});
  vm.runInContext(readFileSync('visual-editor/js/cms-responsive.js','utf8'),context);
  vm.runInContext(readFileSync('visual-editor/js/cms-runtime.js','utf8').replace('window.CMCms =','window.promoTestRules = typeof promoRules === "function" ? promoRules : null; window.CMCms ='),context);
  assert.equal(typeof context.window.promoTestRules,'function','Native promo styling projects onto the real track and items');
  return context.window.promoTestRules('#promoBar',item);
}
test('promo typography and track spacing are projected only to the edited device',()=>{
  const css=rules({content:{},overrides:{mobile:{styles:{fontSize:'15px',paddingLeft:'22px',paddingTop:'11px',textAlign:'center'}}}});
  assert.match(css,/@media \(max-width:767px\)/);
  assert.match(css,/#promoBar \.promo-bar__item\{[^}]*font-size:15px!important/);
  assert.match(css,/#promoBar \.promo-bar__group\{[^}]*padding-left:22px!important/);
  assert.match(css,/justify-content:center/);
  assert.doesNotMatch(css,/min-width:1024\.01px/);
  assert.doesNotMatch(css,/min-width:767\.01px/);
});
test('solid background replaces native gradient and icon visibility is device specific',()=>{
  const css=rules({content:{},overrides:{desktop:{styles:{backgroundColor:'#123456'}},mobile:{content:{showPromoIcons:false}}}});
  assert.match(css,/@media \(min-width:1024\.01px\)\{#promoBar\{[^}]*background-image:none!important/);
  assert.match(css,/@media \(max-width:767px\)\{[^]*\.promo-bar__message-icon\{display:none!important/);
});
function renderer(){
  const source=readFileSync('audit-evidence/production-release/js/app.js','utf8');
  const block=source.match(/\/\* CM_PROMO_RENDERER \*\/([\s\S]*?)\/\* END_CM_PROMO_RENDERER \*\//)?.[1];
  assert.ok(block,'Storefront exposes its existing marquee renderer for CMS reuse');
  const track={innerHTML:''},bar={};
  const context=vm.createContext({STORE:{promo:[{text:'SALE <safe>'},{text:'Free delivery'}]},I:{tag:'<svg data-icon="tag"></svg>',truck:'<svg data-icon="truck"></svg>',shield:'shield',cash:'cash',bolt:'bolt'},esc:value=>String(value).replaceAll('<','&lt;').replaceAll('>','&gt;'),$:selector=>selector==='#promoTrack'?track:bar});
  vm.runInContext(block+';globalThis.render=renderPromo;globalThis.defaults=promoMessages;',context);
  return {context,track};
}
test('promo renderer preserves fallback messages and exposes only one accessible copy',()=>{
  const {context,track}=renderer();context.render();
  assert.equal(context.defaults().length,2);
  assert.equal((track.innerHTML.match(/promo-bar__group/g)||[]).length,2);
  assert.equal((track.innerHTML.match(/class="promo-bar__group" aria-hidden="true"/g)||[]).length,1);
  assert.match(track.innerHTML,/SALE &lt;safe&gt;/);
});
test('promo renderer honors order, enable state, icons and explicit empty content',()=>{
  const {context,track}=renderer();context.render([{id:'b',text:'Second first',enabled:true,icon:'none'},{id:'a',text:'Disabled',enabled:false,icon:'truck'},{id:'c',text:'Last',enabled:true,icon:'tag'}]);
  assert.ok(track.innerHTML.indexOf('Second first')<track.innerHTML.indexOf('Last'));
  assert.doesNotMatch(track.innerHTML,/Disabled/);assert.match(track.innerHTML,/data-icon="tag"/);
  context.render([]);assert.doesNotMatch(track.innerHTML,/promo-bar__item/);
});
test('promo editor rejects invalid plain text and matches the UTF-8 server length limit',()=>{
  const source=readFileSync('visual-editor/js/visual-editor.js','utf8');
  const block=source.match(/function promoTextError\(value\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(block,'Promo text is validated before changing the saved message');
  const context=vm.createContext({TextEncoder});vm.runInContext(block+';globalThis.validate=promoTextError;',context);
  assert.equal(context.validate('Festival savings & sparkle ₹299'),'');
  assert.equal(context.validate('₹'.repeat(100)),'');
  assert.ok(context.validate('₹'.repeat(101)));
  assert.ok(context.validate('<sale>'));
});
