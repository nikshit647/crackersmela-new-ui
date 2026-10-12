/* Isolated source proofs. No browser, network, production API, or customer data. */
'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const path = require('node:path');
const lines = fs.readFileSync(path.join(__dirname, 'live-app.js'), 'utf8').split(/\r?\n/);
const excerpt = (first, last) => lines.slice(first - 1, last).join('\n');
const results = [];
const run = (src, context = {}) => vm.runInNewContext(src, context, { timeout: 1000 });
const record = (id, detail) => results.push({ id, result: 'CONFIRMED', detail });

(async () => {
  const forged = run(`${excerpt(155, 156)}\n${excerpt(161, 162)}\n${excerpt(947, 947)}\n({role:currentUser().role, canWrite:canSyncPush()})`, {
    users: { 'audit@example.invalid': { role: 'admin', tok: 'synthetic-local-token', name: 'Audit' } },
    session: { email: 'audit@example.invalid', tok: 'synthetic-local-token' },
  });
  assert.equal(forged.role, 'admin');
  assert.equal(forged.canWrite, true);
  record('SEC-01', 'Arbitrary matching client-side account and session values pass the staff write guard.');

  const registration = await run(`${excerpt(609, 626)}\n${excerpt(161, 161)}\n${excerpt(706, 719)}\nregister('Synthetic audit account', OWNER_EMAIL, 'isolated-test-only-123')`, {
    crypto: webcrypto, TextEncoder, users: {}, ls: { set() {} }, save() {},
  });
  assert.equal(registration.ok, true);
  assert.equal(registration.role, 'admin');
  record('SEC-02', 'Registration assigns admin to the owner email without any email-verification or server call. No registration was sent anywhere.');

  const sourceContext = {
    catIcon: () => '*', catLabel: () => ({}),
    product: { image: "images/products/synthetic-missing.png';globalThis.__auditMarker=true;//", shortName: 'Synthetic audit image' },
  };
  const imageSource = `${excerpt(28, 28)}\n${excerpt(56, 65)}\n${excerpt(2389, 2394)}\n({card:imgOf(product), thumbnail:thumb(product)})`;
  const rendered = run(imageSource, sourceContext);
  const decodeEntities = str => str.replace(/&(amp|lt|gt|quot|#39);/g, (_, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[entity]));
  for (const [kind, html] of Object.entries(rendered)) {
    const handler = decodeEntities(html.match(/onerror="([^"]*)"/)[1]);
    const context = { __auditMarker: false };
    run(handler, context);
    assert.equal(context.__auditMarker, true);
    record(`SEC-03-${kind}`, 'An admin-entered image URL breaks out of the inline image error handler. Verified using a local boolean marker only.');
  }

  const row = run(`${excerpt(27, 28)}\n${excerpt(2380, 2387)}\norderRow(order)`, {
    order: { id: 'synthetic" data-audit-injected="yes', code: 'AUDIT', customer: {name:'Synthetic',phone:'0000000000'}, totals: {total:0}, payment:'COD', status:'placed', placedAt:'2026-01-01T00:00:00Z' },
    STATUS_PILL: {}, STATUSES: [], fmtDate: () => '',
  });
  assert.match(row, /data-audit-injected="yes/);
  record('VERIFY-03', 'Order ID renders as raw attribute markup. Cross-user exploitability depends on server-side order schema enforcement, which was not tested.');

  const customerRoles = ['customer', 'packer', 'billing', 'sales', 'mod', 'staff', 'admin'];
  const parity = run(`${excerpt(155, 156)}\nroles.map(role=>({role,staff:isStaffRole(role)}))`, {roles:customerRoles});
  assert.equal(parity.find(x=>x.role==='customer').staff, false);
  for (const role of customerRoles.slice(1)) assert.equal(parity.find(x=>x.role===role).staff, true);
  record('VERIFY-04', 'All six staff role labels share the same client authorization guard; ordinary customer is rejected only before changing editable local state.');

  const pushed = [];
  await run(`${excerpt(898, 916)}\nsyncPull()`, {
    ORDERS_API: 'disabled-test-api',
    orders: [{ id: 'SYNTHETIC-LOCAL-ONLY', placedAt:'2026-01-01T00:00:00Z' }],
    fetch: async () => ({ json: async () => ({ok:true,orders:[]}) }),
    syncPushOrders: list => { pushed.push(...list); }, save() {},
  });
  assert.equal(pushed.length, 1);
  record('BUG-SYNC-01', 'A pull with an empty server list automatically attempts to push a local-only order; the proof uses a stub fetch and synthetic ID.');

  const data = {source:'downloaded live-app.js', execution:'isolated Node VM; zero network requests', results};
  fs.writeFileSync(path.join(__dirname, 'audit-security-proof-results.json'), JSON.stringify(data, null, 2) + '\n');
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
})().catch(error => { process.stderr.write(`${error.name}: ${error.message}\n`); process.exitCode = 1; });
