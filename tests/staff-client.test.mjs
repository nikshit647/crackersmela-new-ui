import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync('audit-evidence/production-release/js/app.js', 'utf8');
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, start);
  return source.slice(a, b);
}
const json = value => JSON.parse(JSON.stringify(value));
function dialogHarness() {
  const document = {activeElement:null};
  const element = () => ({isConnected:true,focus(){document.activeElement=this;},setAttribute(){},removeAttribute(){}});
  const trigger=element(),replacement=element(),submit=element(),cancel=element(),errorBox=element(),role=element();
  role.value='billing';
  const form={elements:{namedItem:name=>name==='role'?role:null},querySelector:selector=>selector==='[type="submit"]'?submit:selector==='[data-user-cancel]'?cancel:errorBox,querySelectorAll:()=>[],setAttribute(){},removeAttribute(){}};
  const listeners={};
  const dialog={html:'',set innerHTML(value){this.html=value;},querySelector:selector=>selector==='form'?form:{textContent:''},setAttribute(){},addEventListener(type,handler){listeners[type]=handler;},showModal(){},remove(){},close(){listeners.close?.();}};
  const panel={set innerHTML(value){void value;trigger.isConnected=false;if(document.activeElement===trigger)document.activeElement=null;}};
  document.createElement=()=>dialog;
  const context=vm.createContext({document,console,CSS:{escape:value=>value},$:selector=>selector==='#adminShell'?{appendChild(){}}:selector==='#staffPanel'?panel:replacement,hasPermission:()=>true,esc:value=>String(value??''),staffRoleOptions:[{id:'billing',label:'Billing'}],panelCustomers:()=>'',wireAdmin(){},loadUserDirectory:async()=>{},apiJSON:async()=>({user:{id:'staff_other'}}),currentUser:()=>({id:'staff_owner'}),toast(){},adminPanel:'customers',refreshSession:async()=>{},route(){}});
  vm.runInContext(section('  const staffAccountPayload =','  const orderDetailRow ='),context);
  context.fixtureTrigger=trigger;
  return{context,document,trigger,replacement,dialog,form};
}
function harness(role = 'inventory_manager', permissions = ['dashboard.read', 'products.manage', 'media.manage']) {
  const calls = [];
  const account = { authenticated: true, id: 'staff_inventory', name: 'Fixture Inventory', email: 'inventory@example.test', role, permissions };
  const context = vm.createContext({ Promise, console, TextEncoder, URLSearchParams, fetch: async (url, options = {}) => {
    calls.push({ url, body: options.body ? JSON.parse(options.body) : null });
    if (url.startsWith('staff-auth.php')) return { ok: true, status: 200, json: async () => ({ ok: true, csrfToken: 'fixture', ...account }) };
    if (url.startsWith('customer-auth.php')) return { ok: false, status: 403, json: async () => ({ ok: false, code: 'permission_denied' }) };
    return { ok: true, status: 200, json: async () => ({ ok: true, orders: [], rev: 1 }) };
  } });
  context.window = context;
  vm.runInContext(fs.readFileSync('audit-evidence/production-release/js/coupons.js', 'utf8'), context);
  vm.runInContext(`const IS_ADMIN_HOST=true, ORDERS_API='orders-api.php'; let privateDataRevision=0,orders=[],users={},activity=[],heldBills=[],posCart=[]; const clearPrivateCaches=()=>{};`, context);
  vm.runInContext(section('  const STAFF_ROLES =', '  /* Analytics adapter:'), context);
  vm.runInContext(section('  const authError =', '  const FIREBASE_CONFIG ='), context);
  vm.runInContext(section('  let orderPullPending =', '  const CATALOG_API ='), context);
  vm.runInContext('csrfToken="fixture";', context);
  return { context, calls, account };
}

test('Inventory session retains server identity/grants without requesting orders or customer records', async () => {
  const { context, calls, account } = harness();
  await vm.runInContext('refreshSession()', context);
  const user = vm.runInContext('currentUser()', context);
  assert.ok(user, 'A valid restricted staff session must remain signed in');
  assert.equal(user.id, account.id);
  assert.deepEqual(json(user.permissions), account.permissions);
  assert.deepEqual(calls.map(call => call.url), ['staff-auth.php?a=session']);
});

test('saving a Users dialog restores focus to a connected control after directory repaint',async()=>{
  const fixture=dialogHarness();
  vm.runInContext("openStaffAccountDialog({id:'staff_other',name:'Other Staff',email:'other@example.test',active:true,version:1},fixtureTrigger,true)",fixture.context);
  await fixture.form.onsubmit({preventDefault(){}});
  assert.equal(fixture.document.activeElement,fixture.replacement);
  assert.equal(fixture.document.activeElement.isConnected,true);
});

test('Users role selector exposes its access explanation as its accessible description',()=>{
  const fixture=dialogHarness();
  vm.runInContext('openStaffAccountDialog(null,fixtureTrigger)',fixture.context);
  assert.match(fixture.dialog.html,/<select\b[^>]*id="staffUserRole"[^>]*aria-describedby="staffRoleHelp"/);
  assert.match(fixture.dialog.html,/id="staffRoleHelp"/);
});

test('Billing hydrates allowed orders and remains signed in without a forbidden customer request', async () => {
  const { context, calls } = harness('billing', ['dashboard.read', 'orders.read', 'orders.payment', 'pos.create', 'invoices.read']);
  await vm.runInContext('refreshSession()', context);
  assert.equal(vm.runInContext('currentUser()?.role', context), 'billing');
  assert.deepEqual(calls.map(call => call.url), ['staff-auth.php?a=session', 'orders-api.php?a=pull']);
});

test('Inventory product saves omit the settings field entirely', async () => {
  const { context, calls, account } = harness();
  context.fixtureAccount = account;
  vm.runInContext(`authenticatedUser=fixtureAccount; const PRODUCTS_API='products-api.php', productOverrides={},extraProducts=[],cmSettings={maintenance:true};const ls={get:()=>-1,set:()=>{}};`, context);
  vm.runInContext(section('  const canSyncPush =', '  const syncProductsPull ='), context);
  const saved = await vm.runInContext('syncProductsPush()', context);
  assert.ok(saved, 'Inventory can save products');
  assert.equal(calls.length, 1);
  assert.equal(Object.hasOwn(calls[0].body, 'settings'), false, 'An unchanged forbidden settings field still causes server rejection');
});

test('Order Manager status updates send no payment field', async () => {
  const { context, calls, account } = harness('order_manager', ['orders.read', 'orders.status']);
  context.fixtureAccount = account;
  vm.runInContext('authenticatedUser=fixtureAccount;', context);
  vm.runInContext(section('  const syncUpdateStatus =', '  let orderPullPending ='), context);
  await vm.runInContext("syncUpdateStatus({id:'fixture-order',status:'packed',payment:'UPI'})", context);
  assert.deepEqual(calls[0].body, { a: 'update', id: 'fixture-order', status: 'packed' });
});

test('Inventory navigation hides Users, Settings, Billing and Orders while retaining Products', () => {
  const { context, account } = harness();
  context.fixtureAccount = account;
  vm.runInContext(`authenticatedUser=fixtureAccount;const I2=new Proxy({}, {get:()=>''}),admPrefs={theme:'light'},PUBLIC_ENTRY='/',PUBLIC_ROUTE='/';const esc=s=>String(s),publicRoute=s=>s,bellUnread=()=>0,adminGravatar=()=>'',panelOf=()=>'';let adminPanel='products';`, context);
  vm.runInContext(section('  const ADMIN_NAV =', '  let adminPanel ='), context);
  vm.runInContext(section('  const adminShell =', '  const panelOf ='), context);
  const html = vm.runInContext('adminShell(currentUser())', context);
  assert.match(html, /data-stab="products"/);
  for (const panel of ['customers', 'settings', 'pos', 'orders', 'analytics', 'visual-editor']) assert.doesNotMatch(html, new RegExp('data-stab="' + panel + '"'));
});

test('role landing pages follow the server-granted workspaces', () => {
  const { context } = harness();
  assert.equal(vm.runInContext('typeof defaultAdminPanel', context), 'function');
  for (const [role, permissions, expected] of [
    ['inventory_manager', ['dashboard.read', 'products.manage'], 'products'],
    ['billing', ['dashboard.read', 'pos.create'], 'pos'],
    ['order_manager', ['dashboard.read', 'orders.read'], 'orders'],
    ['super_admin', ['dashboard.read', 'users.manage'], 'dashboard'],
  ]) {
    context.fixture = { role, permissions };
    assert.equal(vm.runInContext('defaultAdminPanel(fixture)', context), expected);
  }
});

test('Users combines staff and customer rows, escapes names, and keeps protected owner actions absent', () => {
  const { context } = harness('super_admin', ['users.manage', 'customers.read', 'orders.read']);
  vm.runInContext(`authenticatedUser={role:'super_admin',permissions:['users.manage','customers.read','orders.read']};let admQ='';const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const I2={search:''},I={users:''},money=n=>'INR '+n,fmtDate=s=>s;users={'customer@example.test':{id:'customer_fixture',name:'Customer Fixture',role:'customer',email:'customer@example.test'}};`, context);
  vm.runInContext(`staffDirectory=[{id:'staff_owner',name:'Protected Owner',email:'owner@example.test',role:'super_admin',active:true,protected:true,version:1},{id:'staff_billing',name:'<Billing Fixture>',email:'billing@example.test',role:'billing',active:false,protected:false,version:2}];`, context);
  vm.runInContext(section('  const adminPageHead =', '  const orderDetailRow ='), context);
  const html = vm.runInContext('panelCustomers()', context);
  assert.match(html, /Protected Owner/);
  assert.match(html, /&lt;Billing Fixture&gt;/);
  assert.match(html, /Customer Fixture/);
  assert.match(html, /data-edit-user="staff_billing"/);
  assert.doesNotMatch(html, /data-(?:edit|activate)-user="staff_owner"/);
  assert.match(html, /Inactive/);
});

test('staff edit payload omits blank passwords and validates creation before transport', () => {
  const { context } = harness();
  vm.runInContext(section('  const adminPageHead =', '  const orderDetailRow ='), context);
  assert.equal(vm.runInContext('typeof staffAccountPayload', context), 'function');
  context.values = { name: ' Fixture User ', email: ' USER@example.test ', role: 'billing', password: '', active: true };
  context.account = { id: 'staff_fixture', version: 3 };
  const payload = vm.runInContext('staffAccountPayload(values,account)', context);
  assert.deepEqual(json(payload), { id: 'staff_fixture', expectedVersion: 3, name: 'Fixture User', email: 'user@example.test', role: 'billing' });
  assert.throws(() => vm.runInContext('staffAccountPayload(values,null)', context), /15.*128/);
  context.values.password = 'Fixture password 123';
  assert.equal(vm.runInContext('staffAccountPayload(values,null).active', context), true);
});

test('a failed permitted customer read shows a retryable error without signing out Admin', async () => {
  const { context } = harness('admin', ['customers.read', 'orders.read']);
  await vm.runInContext('refreshSession()', context);
  assert.equal(vm.runInContext('currentUser().role', context), 'admin');
  assert.match(vm.runInContext('userDirectoryState.error', context), /Refresh/);
  assert.equal(vm.runInContext('userDirectoryState.loading', context), false);
});

test('a stale Users response cannot restore another session account list', async () => {
  const { context, account } = harness('admin', ['customers.read']);
  let deliver, started;
  const responseStarted = new Promise(resolve => { started = resolve; });
  context.fetch = async () => ({ ok: true, status: 200, json: () => new Promise(resolve => { deliver = resolve; started(); }) });
  context.fixtureAccount = account;
  vm.runInContext('authenticatedUser=fixtureAccount;', context);
  const pending = vm.runInContext('loadUserDirectory()', context);
  await responseStarted;
  vm.runInContext('setIdentity(null)', context);
  deliver({ ok: true, users: [{ id: 'stale', email: 'stale@example.test' }] });
  await pending;
  assert.equal(vm.runInContext('Object.keys(users).length', context), 0);
});

test('Billing and Order Manager receive only their editable order controls', () => {
  for (const [role, permission, allowed, denied] of [
    ['billing', 'orders.payment', 'data-order-payment', 'data-status'],
    ['order_manager', 'orders.status', 'data-status', 'data-order-payment'],
  ]) {
    const { context, account } = harness(role, ['orders.read', permission]);
    context.fixtureAccount = account;
    vm.runInContext(`authenticatedUser=fixtureAccount;const esc=String,money=String,fmtDate=String,STATUS_PILL={},STATUSES=[{key:'placed',label:'Placed'}],I2=new Proxy({}, {get:()=>''}),I=new Proxy({}, {get:()=>''}),PUBLIC_ENTRY='https://crackersmela.com/#/',routePart=String;`, context);
    vm.runInContext(section('  /* ===== WHATSAPP ORDER UPDATE (start) =====', '  /* ===== WHATSAPP ORDER UPDATE (end) ===== */'), context);
    vm.runInContext(section('  /* Order WhatsApp contact.', '  const thumb ='), context);
    const html = vm.runInContext("orderRow({id:'fixture',code:'CM-FIXTURE',customer:{name:'Fixture',phone:''},totals:{total:2500},payment:'COD',status:'placed',placedAt:'2026-10-05'})", context);
    assert.ok(html.includes(allowed));
    assert.ok(!html.includes(denied));
    assert.ok(html.includes('wa-order-open'), 'Every order row offers the WhatsApp contact action');
    assert.ok(html.includes('Customer phone number is unavailable'), 'An order without a usable mobile explains itself instead of linking');
  }
});

test('Billing payment writes carry no order-status mutation', async () => {
  const { context, calls, account } = harness('billing', ['orders.read', 'orders.payment']);
  context.fixtureAccount = account;
  vm.runInContext('authenticatedUser=fixtureAccount;', context);
  vm.runInContext(section('  const syncUpdateStatus =', '  let orderPullPending ='), context);
  await vm.runInContext("syncUpdateStatus({id:'fixture-order',status:'packed',payment:'UPI'},'payment')", context);
  assert.deepEqual(calls[0].body, { a: 'update', id: 'fixture-order', payment: 'UPI' });
});
