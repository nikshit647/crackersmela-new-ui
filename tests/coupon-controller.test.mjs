import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('audit-evidence/production-release/js/coupons.js', 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const quote = (total = 3000, codes = [], lines = []) => ({ ok: true, subtotal: 3000, total, totalDiscount: 3000 - total, acceptedCodes: codes, lines, cartItems: [{ id: 26, qty: 1 }] });
const eligible = (code = 'SAVE500', discount = 500, automatic = false) => ({ code, discount, state: 'eligible', automatic, discountType: 'fixed', discountAmount: discount, minimumOrderValue: 2500, qualifyingSubtotal: 3000, unlockAmount: 0, progressPercent: 100 });
function harness(options = {}) {
  const storage = options.storage || new Map();
  const context = { items: [{ id: 26, qty: 1 }], identity: 'guest', catalog: [[26, 3000, 50]], customerPhone: '' };
  const requests = [];
  const window = { localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) } };
  vm.runInNewContext(source, { window });
  const controller = window.CMCoupons.create({ context: () => context, onChange: () => {}, request: (url, data) => { requests.push({ url, data: plain(data || {}) }); return options.request ? options.request(url, data) : Promise.resolve(url.includes('a=offers') ? { offers: [] } : quote()); } });
  return { controller, context, storage, requests, exports: window.CMCoupons };
}
test('quote sends only item identity, codes and preferences; totals come from server', async () => {
  const h = harness({ request: url => Promise.resolve(url.includes('a=offers') ? { offers: [] } : quote(2475.25, ['AUTOSAVE'], [eligible('AUTOSAVE', 524.75, true)])) });
  await h.controller.sync();
  assert.equal(h.controller.ready(), true);
  assert.deepEqual(Object.keys(h.requests[0].data).sort(), ['codes', 'excludedAutomaticCodes', 'items']);
  assert.match(h.controller.summary({ subtotal: 999999, saving: 50 }), /₹2,475.25/);
  assert.match(h.controller.component('cart'), /Offer applied automatically/);
  assert.deepEqual(plain(h.controller.payload()), { couponCodes: ['AUTOSAVE'], excludedAutomaticCodes: [] });
});
test('late old-cart response cannot overwrite the new-cart quote', async () => {
  const pending = [];
  const h = harness({ request: url => url.includes('a=offers') ? Promise.resolve({ offers: [] }) : new Promise(resolve => pending.push(resolve)) });
  const first = h.controller.sync();
  h.context.items[0].qty = 2;
  const second = h.controller.sync();
  pending[1](quote(6000)); await second;
  pending[0](quote(3000)); await first;
  assert.equal(h.controller.state.quote.total, 6000);
  assert.equal(h.controller.ready(), true);
});
test('identity and product-price changes invalidate quotes immediately', async () => {
  const h = harness(); await h.controller.sync();
  h.context.identity = 'customer-2'; assert.equal(h.controller.ready(), false);
  assert.deepEqual(plain(h.controller.payload().couponCodes), []);
  await h.controller.sync(); assert.equal(h.controller.ready(), true);
  h.context.catalog[0][1] = 3500; assert.equal(h.controller.ready(), false);
});
test('failed quote hides previous discounts and disables readiness', async () => {
  let fail = false;
  const h = harness({ request: url => url.includes('a=offers') ? Promise.resolve({ offers: [] }) : fail ? Promise.reject(new Error('offline')) : Promise.resolve(quote(2500, ['SAVE500'], [eligible()])) });
  await h.controller.sync(); fail = true; await h.controller.sync(true);
  assert.equal(h.controller.ready(), false); assert.equal(h.controller.active().length, 0);
  assert.match(h.controller.component('cart'), /Your cart is saved/);
  assert.doesNotMatch(h.controller.summary({ subtotal: 3000 }), /SAVE500/);
});
test('invalid manual code stays editable but is not persisted as applied', async () => {
  const h = harness({ request: url => Promise.resolve(url.includes('a=offers') ? { offers: [] } : quote(3000, [], [{ code: 'WRONG', state: 'not_found', discount: 0 }])) });
  await h.controller.apply('wrong', 'cart');
  assert.equal(h.controller.state.drafts.cart, 'WRONG');
  assert.equal(h.controller.state.codes.length, 0);
  assert.match(h.controller.component('cart'), /isn&#39;t valid/);
  assert.deepEqual(plain(h.controller.payload().couponCodes), []);
});
test('applied manual codes survive refresh; amounts are never stored', async () => {
  const h = harness({ request: url => Promise.resolve(url.includes('a=offers') ? { offers: [] } : quote(2500, ['SAVE500'], [eligible()])) });
  await h.controller.apply('save500', 'drawer');
  assert.equal(h.controller.state.drafts.drawer, '');
  const reload = harness({ storage: h.storage });
  assert.deepEqual(plain(reload.controller.state.codes), ['SAVE500']);
  assert.equal(reload.controller.ready(), false); assert.equal(reload.controller.state.quote, null);
  assert.equal([...h.storage.values()].join('').includes('50000'), false);
});
test('automatic removal is persisted and included in subsequent quotes and orders', async () => {
  const h = harness({ request: (url, data) => Promise.resolve(url.includes('a=offers') ? { offers: [] } : data.excludedAutomaticCodes.includes('AUTO') ? quote() : quote(2700, ['AUTO'], [eligible('AUTO', 300, true)])) });
  await h.controller.sync(); await h.controller.remove('AUTO', true);
  assert.equal(h.controller.state.quote.total, 3000);
  assert.deepEqual(plain(h.controller.payload()), { couponCodes: [], excludedAutomaticCodes: ['AUTO'] });
  assert.deepEqual(plain(harness({ storage: h.storage }).controller.state.excluded), ['AUTO']);
});
test('below-minimum selected coupon keeps intent and recovers when cart qualifies', async () => {
  let enough = false;
  const h = harness({ request: url => Promise.resolve(url.includes('a=offers') ? { offers: [] } : enough ? quote(2500, ['SAVE500'], [eligible()]) : quote(3000, [], [{ code: 'SAVE500', state: 'below_minimum', minimumOrderValue: 5000, unlockAmount: 2000 }])) });
  await h.controller.apply('SAVE500', 'cart');
  assert.deepEqual(plain(h.controller.state.codes), ['SAVE500']);
  assert.deepEqual(plain(h.controller.payload().couponCodes), []);
  assert.match(h.controller.component('cart'), /Add ₹2,000 more/);
  enough = true; h.context.items[0].qty = 2; await h.controller.sync();
  assert.deepEqual(plain(h.controller.payload().couponCodes), ['SAVE500']);
});
test('provisional guest coupon is rechecked with checkout phone before any discount', async () => {
  const h = harness({ request: (url, data) => Promise.resolve(url.includes('a=offers') ? { offers: [] } : data.customerPhone ? quote(2500, ['FIRST'], [eligible('FIRST')]) : quote(3000, [], [{ code: 'FIRST', state: 'eligible_provisional', discount: 0 }])) });
  await h.controller.apply('FIRST', 'drawer');
  assert.equal(h.controller.active().length, 0); assert.deepEqual(plain(h.controller.state.codes), ['FIRST']);
  h.context.customerPhone = '9876500991'; await h.controller.sync();
  assert.deepEqual(plain(h.controller.payload().couponCodes), ['FIRST']);
  assert.equal(h.requests.filter(row => row.url.includes('a=quote')).at(-1).data.customerPhone, '9876500991');
});
test('coupon progress and unlock text use the server verdict', async () => {
  const offer = { ...eligible(), state: 'below_minimum', minimumOrderValue: 5000, qualifyingSubtotal: 4900, unlockAmount: 100, progressPercent: 98 };
  const h = harness({ request: url => Promise.resolve(url.includes('a=offers') ? { offers: [offer] } : quote()) });
  await h.controller.sync(); const html = h.controller.component('cart');
  assert.match(html, /Spend ₹5,000 on eligible products/); assert.match(html, /₹4,900 \/ ₹5,000/); assert.match(html, /progress value="98"/); assert.match(html, /Add ₹100 more to unlock this offer/);
});

test('available offers follow manual entry and use shop-more or disabled actions for ineligible coupons', async () => {
  const offers = [eligible('READY'), { ...eligible('SHORT'), state: 'below_minimum', unlockAmount: 500 }, { ...eligible('CONFLICT'), state: 'stacking_blocked' }, { ...eligible('PHONE'), state: 'eligible_provisional', discount: 0 }];
  const h = harness({ request: url => Promise.resolve(url.includes('a=offers') ? { offers } : quote()) });
  await h.controller.sync();
  const html=h.controller.component('cart');
  assert.ok(html.indexOf('View available offers')>html.indexOf('Have a coupon code?'));
  assert.match(html, /data-coupon-apply="READY"[^>]*>Apply/);
  assert.match(html, /data-coupon-offer="SHORT"[^]*?data-shop-more>Shop &amp; add more/);
  assert.doesNotMatch(html, /data-coupon-apply="SHORT"/);
  for (const code of ['CONFLICT','PHONE']) assert.match(html,new RegExp('data-coupon-apply="'+code+'"[^>]*disabled'));
  assert.match(html,/cannot be combined with your current offer/);
  assert.match(html,/Enter your delivery mobile number at checkout/);
  assert.match(h.controller.component('drawer'),/<details[^>]*data-coupon-details="drawer">/);
});

test('offer discovery receives the same item, selected code, exclusion and phone context', async () => {
  const h=harness();h.context.customerPhone='9876500991';h.controller.state.codes=['MANUAL'];h.controller.state.excluded=['AUTO'];
  await h.controller.sync();
  const request=h.requests.find(row=>row.url.includes('a=offers'));
  assert.equal(request.url,'coupons-api.php?a=offers');
  assert.deepEqual(request.data,h.requests.find(row=>row.url.includes('a=quote')).data);
});

test('rejecting a manual code refreshes offer eligibility for the retained code selection',async()=>{
  const h=harness({request:(url,data)=>Promise.resolve(url.includes('a=offers')?{offers:[{...eligible('NEXT'),state:data.codes.length>=10?'coupon_limit':'eligible'}]}:quote(3000,[],[{code:'BAD',state:'not_found',discount:0}]))});
  h.controller.state.codes=Array.from({length:9},(_,index)=>'KEEP'+index);
  await h.controller.apply('BAD','cart');
  assert.equal(h.controller.state.codes.length,9);
  assert.equal(h.controller.state.offers[0].state,'eligible');
});

test('shared summary removes the delivery display while preserving server totals and savings',async()=>{
  const h=harness();await h.controller.sync();const html=h.controller.summary({subtotal:9999,saving:79});
  assert.doesNotMatch(html,/Delivery|Free/);assert.match(html,/₹3,000/);assert.match(html,/₹79/);
});

test('ten accepted coupons keep individual cards but use one server-total discount row', async () => {
  const rows = Array.from({ length: 10 }, (_, index) => eligible('STACK' + (index + 1), index === 9 ? 100.55 : 100, index % 2 === 0));
  const codes = rows.map(row => row.code);
  const serverQuote = quote(1999.45, codes, rows);
  const h = harness({ request: url => Promise.resolve(url.includes('a=offers') ? { offers: [] } : serverQuote) });
  await h.controller.sync();
  const unchangedQuote = plain(h.controller.state.quote);
  const html = h.controller.summary({ subtotal: 999999, saving: 79 });
  assert.equal((html.match(/class="sum-row cm-coupon-discount"/g) || []).length, 1);
  assert.match(html, /<span>Discounts<\/span><span class="save">−₹1,000.55<\/span>/);
  assert.match(html, /<span>Subtotal<\/span><b>₹3,000<\/b>/);
  assert.match(html, /data-coupon-total>₹1,999.45<\/b>/);
  assert.match(html, /<span>You save<\/span><span class="save">₹1,079.55<\/span>/);
  assert.doesNotMatch(html, /STACK\d/);
  for (const surface of ['drawer', 'cart', 'checkout']) {
    const cards = h.controller.component(surface);
    assert.equal((cards.match(/data-coupon-applied=/g) || []).length, 10);
    for (const row of rows) {
      assert.match(cards, new RegExp('data-coupon-applied="' + row.code + '"[^]*?<strong>−₹' + (row.discount === 100 ? '100' : '100\\.55') + '<\\/strong>'));
      assert.match(cards, new RegExp('data-coupon-remove="' + row.code + '"'));
    }
  }
  assert.deepEqual(plain(h.controller.state.quote), unchangedQuote);
  assert.deepEqual(plain(h.controller.payload().couponCodes), codes);
});
test('offer descriptions and rejected-code reasons are escaped', async () => {
  const h = harness({ request: url => Promise.resolve(url.includes('a=offers') ? { offers: [{ ...eligible(), description: '<img src=x onerror=alert(1)>' }] } : quote()) });
  await h.controller.sync(); assert.doesNotMatch(h.controller.component('cart'), /<img/);
  assert.match(h.controller.component('cart'), /&lt;img/);
});
test('empty cart cancels a pending response and clears payable quote', async () => {
  let finish;
  const h = harness({ request: url => url.includes('a=offers') ? Promise.resolve({ offers: [] }) : new Promise(resolve => { finish = resolve; }) });
  const first = h.controller.sync(); h.context.items = []; await h.controller.sync(); finish(quote()); await first;
  assert.equal(h.controller.state.quote, null); assert.equal(h.controller.state.pending, false); assert.equal(h.controller.ready(), false);
});
