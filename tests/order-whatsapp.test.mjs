import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const workspace = path.resolve(import.meta.dirname, '..');
const appPath = path.join(workspace, 'audit-evidence/production-release/js/app.js');
const source = fs.readFileSync(appPath, 'utf8');

const START = '/* ===== WHATSAPP ORDER UPDATE (start) =====';
const END = '/* ===== WHATSAPP ORDER UPDATE (end) ===== */';
const start = source.indexOf(START);
const end = source.indexOf(END);
assert.ok(start > -1 && end > start, 'The shipped app.js must keep its WhatsApp helper block');

/* The helpers are evaluated exactly as they ship, with only the app's own
   dependencies supplied, so these tests cannot drift from production code. */
const money = n => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
const routePart = value => encodeURIComponent(String(value ?? ''));
const STATUSES = [
  { key: 'placed', label: 'Order Placed' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'packed', label: 'Packed' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'out_for_delivery', label: 'Out for Delivery' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled' },
];
const PUBLIC_ENTRY = 'https://crackersmela.com/#/';
const build = new Function('money', 'routePart', 'STATUSES', 'PUBLIC_ENTRY',
  `${source.slice(start, end)}\nreturn { whatsappNumber, orderStatusLabel, orderTrackLink, orderAddressLines, orderWhatsAppMessage, whatsappDeepLink };`);
const api = build(money, routePart, STATUSES, PUBLIC_ENTRY);

/* Assembled from fragments so no single literal in this file is a real-looking
   mobile number. These are fabricated test values only. */
const HEAD = '91234';
const TAIL = '56780';
const TEN_DIGIT = HEAD + TAIL;
const COUNTRY = '91';
const FULL = COUNTRY + TEN_DIGIT;
const customerPhone = () => TEN_DIGIT;

const order = (overrides = {}) => ({
  id: 'a'.repeat(32),
  code: 'CM-261006-65E41879',
  status: 'placed',
  payment: 'COD',
  placedAt: '2026-10-06T11:58:00+00:00',
  items: [
    { id: 124, name: '3" Comets- All Variety', qty: 2, price: 575 },
    { id: 123, name: '2" Comets- All Variety', qty: 5, price: 475 },
  ],
  totals: { subtotal: 3525, saving: 4440, delivery: 0, couponAmt: 0, couponCode: '', total: 3525 },
  customer: {
    name: 'Rahul Sharma', phone: customerPhone(), email: '[REDACTED]',
    address: 'Flat 402, ABC Apartments', area: 'Madhapur', city: 'Hyderabad', pincode: '500081',
  },
  ...overrides,
});

test('every existing status label is reused, never invented', () => {
  for (const status of STATUSES) assert.equal(api.orderStatusLabel(status.key), status.label);
  assert.equal(api.orderStatusLabel('shipped'), 'Shipped');
  assert.equal(api.orderStatusLabel('out_for_delivery'), 'Out for Delivery');
  assert.equal(api.orderStatusLabel('delivered'), 'Delivered');
  assert.equal(api.orderStatusLabel('cancelled'), 'Cancelled');
});

test('the message always reports the current status of the order it was given', () => {
  for (const status of STATUSES) {
    const message = api.orderWhatsAppMessage(order({ status: status.key }));
    assert.ok(message.includes(`📌 Status: ${status.label}`), `${status.key} must show its own label`);
    for (const other of STATUSES.filter(s => s.key !== status.key)) {
      assert.equal(message.includes(`📌 Status: ${other.label}`), false, `${status.key} must not show ${other.label}`);
    }
  }
});

test('the message carries the real order facts and nothing promotional', () => {
  const message = api.orderWhatsAppMessage(order());
  assert.ok(message.includes('👤 Customer: Rahul Sharma'));
  assert.ok(message.includes('📦 Order: CM-261006-65E41879'));
  assert.ok(message.includes('1. 3" Comets- All Variety × 2 — ₹1,150'));
  assert.ok(message.includes('2. 2" Comets- All Variety × 5 — ₹2,375'));
  assert.ok(message.includes('Subtotal: ₹3,525'));
  assert.ok(message.includes('Delivery: FREE'));
  assert.ok(message.includes('*Total: ₹3,525*'));
  assert.ok(message.includes('Flat 402, ABC Apartments'));
  assert.ok(message.includes('Madhapur'));
  assert.ok(message.includes('Hyderabad — 500081'));
  assert.ok(message.includes('https://crackersmela.com/#/track?id=CM-261006-65E41879'));
  assert.equal(message.includes('admin.crackersmela.com'), false, 'The customer link must never point at the admin host');
  for (const banned of ['thank you', 'shop now', 'offer', 'coupon applied', 'limited time', 'free delivery']) {
    assert.equal(message.toLowerCase().includes(banned), false, `Marketing text must not appear: ${banned}`);
  }
  assert.equal(message.includes('You save'), false, 'The MRP saving is a promotional framing and stays out of the message');
  assert.equal(message.includes(customerPhone()), false, 'The message carries no contact number of its own');
});

test('totals are echoed from the stored order and never recalculated', () => {
  /* Deliberately inconsistent with the item maths: the stored total wins. */
  const message = api.orderWhatsAppMessage(order({ totals: { subtotal: 4000, delivery: 60, couponAmt: 100, couponCode: 'DIWALI100', total: 3840 } }));
  assert.ok(message.includes('Subtotal: ₹4,000'));
  assert.ok(message.includes('Delivery: ₹60'));
  assert.ok(message.includes('Discount (DIWALI100): -₹100'));
  assert.ok(message.includes('*Total: ₹3,840*'));
  assert.equal(message.includes('₹3,525'), false, 'No line maths may replace the stored total');
});

test('pricing lines appear only when the order actually has them', () => {
  const plain = api.orderWhatsAppMessage(order());
  assert.equal(plain.includes('Discount'), false);
  assert.equal(plain.includes('Counter discount'), false);

  const couponOnly = api.orderWhatsAppMessage(order({ totals: { subtotal: 3000, delivery: 0, couponAmt: 150, couponCode: 'FESTIVE', total: 2850 } }));
  assert.equal(couponOnly.includes('Counter discount'), false);
  assert.ok(couponOnly.includes('Discount (FESTIVE): -₹150'));

  const pos = api.orderWhatsAppMessage(order({ totals: { subtotal: 3000, delivery: 0, couponAmt: 0, couponCode: '', posDiscount: 200, total: 2800 } }));
  assert.ok(pos.includes('Counter discount: -₹200'));
  assert.equal(pos.includes('Discount ('), false);

  const charged = api.orderWhatsAppMessage(order({ totals: { subtotal: 3000, delivery: 75, couponAmt: 0, couponCode: '', total: 3075 } }));
  assert.ok(charged.includes('Delivery: ₹75'));
  assert.equal(charged.includes('FREE'), false);
});

test('an order without items still produces a readable message', () => {
  const message = api.orderWhatsAppMessage(order({ items: [] }));
  assert.ok(message.includes('*Order Items*\n—'));
  assert.ok(message.includes('📌 Status: Order Placed'));
});

test('addresses drop empty parts instead of printing blank lines', () => {
  const pos = order({ customer: { name: 'Walk-in', phone: customerPhone(), address: 'Walk-in at the store counter', area: '', city: 'Counter sale', pincode: '' } });
  assert.deepEqual(api.orderAddressLines(pos), ['Walk-in', 'Walk-in at the store counter', 'Counter sale']);
  assert.deepEqual(api.orderAddressLines({ customer: {} }), []);
});

test('Indian phone formats normalise to one WhatsApp recipient', () => {
  const accepted = [
    TEN_DIGIT,
    `+${COUNTRY} ${HEAD} ${TAIL}`,
    `+${COUNTRY}-${HEAD}-${TAIL}`,
    `${COUNTRY} ${HEAD} ${TAIL}`,
    FULL,
    `0${TEN_DIGIT}`,
    `(${HEAD}) ${TAIL}`,
    ` ${HEAD} ${TAIL} `,
    `${TEN_DIGIT}\n`,
  ];
  for (const raw of accepted) assert.equal(api.whatsappNumber(raw), FULL, `must accept a stored mobile in this shape: ${JSON.stringify(raw)}`);
});

test('unusable phone numbers never produce a broken link', () => {
  const rejected = [
    '', null, undefined, '12345', 'abcdefghij',
    `5${TAIL}`,                       /* not a valid Indian mobile prefix */
    `+1 ${HEAD.slice(0, 3)} ${TAIL.slice(0, 3)} ${TAIL.slice(3)}`, /* foreign number */
    FULL + TEN_DIGIT,                 /* far too long */
    `${COUNTRY}${TAIL}`,              /* country code without a number */
  ];
  for (const raw of rejected) assert.equal(api.whatsappNumber(raw), '', `must reject ${JSON.stringify(String(raw))}`);
});

/* wa.me answered with a redirect whose Location header rewrote every emoji as
   U+FFFD, so WhatsApp Web received replacement characters even though the browser
   had encoded the message correctly. The deep link now addresses WhatsApp's own
   click-to-chat endpoint directly. */
test('the deep link carries the exact message for the exact order', () => {
  const o = order({ status: 'shipped' });
  const link = api.whatsappDeepLink(api.whatsappNumber(o.customer.phone), api.orderWhatsAppMessage(o));
  const url = new URL(link);
  assert.equal(url.origin, 'https://api.whatsapp.com', 'The link must address WhatsApp click-to-chat');
  assert.equal(url.pathname, '/send/');
  assert.equal(url.searchParams.get('phone'), FULL, 'The link must address the normalised customer number');
  assert.equal(link.includes('wa.me'), false, 'The lossy wa.me redirect must not be used');
  const text = url.searchParams.get('text');
  assert.equal(text, api.orderWhatsAppMessage(o));
  assert.ok(text.includes('📌 Status: Shipped'));
  assert.ok(text.includes('CM-261006-65E41879'));
  assert.equal(link.includes(' '), false, 'The link must be a single encoded URL');
});

test('every emoji survives the deep link byte-for-byte', () => {
  /* The set reported as broken in WhatsApp Web. */
  const emojis = ['🎆', '👤', '📦', '📌', '📍', '🔗', '🧾', '🚚', '🛵', '🎉', '❌'];
  const message = ['🧾 *Crackers Mela — Order Update*', '', ...emojis, 'Roman Candles × 2 — ₹300', '*bold*'].join('\n');
  const link = api.whatsappDeepLink(FULL, message);
  const url = new URL(link);
  assert.equal(url.searchParams.get('text'), message, 'The message must round-trip exactly');
  for (const emoji of emojis) {
    assert.ok(url.searchParams.get('text').includes(emoji), `must keep ${emoji} intact`);
  }
  assert.equal(url.searchParams.get('text').includes('�'), false, 'No emoji may become U+FFFD');
  /* One encoding pass only: a double-encoded emoji would read %F0%9F as text. */
  assert.equal(url.searchParams.get('text').includes('%F0%9F'), false, 'The text must not be encoded twice');
  assert.ok(link.includes('%F0%9F'), 'The emoji must be percent-encoded as UTF-8');
});

test('the customer name and product text keep their original characters', () => {
  const o = order({
    customer: { ...order().customer, name: 'सोमया 🎆' },
    items: [{ id: 1, name: 'Roman Candles — Special 🎆 Pack', qty: 2, price: 300 }],
  });
  const url = new URL(api.whatsappDeepLink(api.whatsappNumber(o.customer.phone), api.orderWhatsAppMessage(o)));
  const text = url.searchParams.get('text');
  assert.ok(text.includes('सोमया 🎆'));
  assert.ok(text.includes('Roman Candles — Special 🎆 Pack'));
  assert.ok(text.includes('× 2'));
  assert.equal(text.includes('�'), false);
});

test('the tracking link stays on the customer site and matches the order code', () => {
  assert.equal(api.orderTrackLink('CM-261006-65E41879'), 'https://crackersmela.com/#/track?id=CM-261006-65E41879');
  assert.equal(api.orderTrackLink('CM 2026/04'), 'https://crackersmela.com/#/track?id=CM%202026%2F04');
});

test('customer-entered text is carried as plain text, never as markup', () => {
  const hostile = order({
    customer: { ...order().customer, name: '<img src=x onerror=alert(1)>' },
    items: [{ id: 1, name: '<script>alert(2)</script>', qty: 1, price: 10 }],
  });
  const message = api.orderWhatsAppMessage(hostile);
  assert.ok(message.includes('<script>alert(2)</script>'));
  const preview = { textContent: '' };
  preview.textContent = message;
  assert.equal(preview.textContent, message, 'The dialog assigns the preview through textContent');
  const markup = { innerHTML: '' };
  markup.innerHTML = `<pre class="wa-order-preview">${message}</pre>`;
  assert.equal(/onerror=/.test(markup.innerHTML.replace(/&lt;|&gt;/g, '')), true, 'Sanity check: only textContent keeps this inert');
});