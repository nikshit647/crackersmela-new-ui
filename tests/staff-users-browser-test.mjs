import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';

const fixture = JSON.parse(await readFile(process.env.CM_CMS_FIXTURE || 'audit-evidence/cms-fixture-active.json', 'utf8'));
const base = new URL(fixture.baseUrl);
assert.ok(base.protocol === 'http:' && ['localhost','127.0.0.1'].includes(base.hostname), 'Local fixture only');
const health = await (await fetch(base + '__fixture-health')).json();
assert.equal(health.isolated, true); assert.equal(health.mail, 'disabled');
const fixtureRoot = path.resolve(fixture.fixture);
assert.equal(path.dirname(fixtureRoot), path.resolve('audit-evidence'));
assert.ok(path.basename(fixtureRoot).startsWith('cms-fixture-'));
const binary = process.platform === 'win32' ? path.join(process.env.APPDATA, 'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe') : 'agent-browser';
const session = process.env.CM_STAFF_BROWSER_SESSION || 'staff-ui-13d9fd6ea971';
const output = path.resolve('audit-evidence/staff-users-browser-' + Date.now());
await mkdir(output, { recursive: true });
const checks = [], screenshots = [], roles = ['super_admin','admin','billing','inventory_manager','order_manager'];
const stamp = Date.now(), password = 'Synthetic staff interface QA 2026!';
const accounts = Object.fromEntries(roles.map(role => [role, { name: 'UI QA ' + role, email: `staff-ui-${stamp}-${role}@example.test`, role }]));
accounts.super_admin.name = 'UI QA ' + 'x'.repeat(94);
accounts.super_admin.email = `staff-ui-${stamp}@${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(57)}.example.test`;
const run = (...args) => {
  let raw;
  try { raw = execFileSync(binary, ['--session', session, ...args, '--json'], { encoding: 'utf8', windowsHide: true, timeout: 45000, maxBuffer: 12 * 1024 * 1024 }); }
  catch (error) { let detail=String(error.stderr || '');try{detail=JSON.stringify(JSON.parse(error.stdout).error);}catch{}throw new Error('Browser command failed: ' + args[0] + '. ' + (args[0]==='fill'?'Input action failed.':detail.slice(0,1200))); }
  const result = JSON.parse(raw); assert.equal(result.success, true, result.error || args[0]); return result.data;
};
const evaluate = code => run('eval', '-b', Buffer.from(code).toString('base64')).result;
const launch = (...args) => new Promise((resolve, reject) => {
  const child = spawn(binary, ['--session', session, ...args], { stdio: 'ignore', windowsHide: true });
  child.once('error', reject);
  child.once('exit', code => code === 0 ? resolve() : reject(new Error('Browser launch failed')));
});
const wait = code => run('wait', '--fn', code);
const click = selector => run('click', selector);
const fill = (selector, value) => run('fill', selector, String(value));
const choose = (selector, value) => run('select', selector, String(value));
const check = (name, condition = true, detail) => { assert.ok(condition, name); checks.push({ name, status: 'PASS', ...(detail ? { detail } : {}) }); console.log('PASS: ' + name); };
const screenshot = name => { if(name!=='failure')wait("!document.querySelector('#toastWrap .toast')");const file = path.join(output, name + '.png'); run('screenshot', file); screenshots.push(file); };
const spy = () => evaluate(`(() => { if(window.__staffUiFetch) {window.__staffUiFetch.length=0;return;} const native=window.fetch.bind(window);window.__staffUiFetch=[];window.fetch=async(...args)=>{const url=new URL(typeof args[0]==='string'?args[0]:args[0].url,location.href),options=args[1]||{};let body={};try{body=JSON.parse(options.body||'{}')}catch{}const result=await native(...args);if(url.origin===location.origin)window.__staffUiFetch.push({path:url.pathname+url.search,method:options.method||'GET',status:result.status,bodyKeys:Object.keys(body)});return result;}; })()`);
const requests = () => evaluate('window.__staffUiFetch || []');
const snapshot = () => run('snapshot', '-i').snapshot;
const login = (email, secret) => {
  spy();
  wait("!!document.querySelector('#goAuthStaff')"); click('#goAuthStaff');
  wait("!!document.querySelector('#auEmail')"); fill('#auEmail', email); fill('#auPass', secret); click('#auSubmit');
  wait("!!document.querySelector('#adminShell') || window.__staffUiFetch.some(request=>request.path==='/staff-auth.php?a=login' && request.status>=400)");
  assert.ok(evaluate("!!document.querySelector('#adminShell')"), 'Login failed: '+JSON.stringify(requests().map(({path, status})=>({path,status}))));
};
const logout = () => { click('.admin-side [data-signout]'); wait("!!document.querySelector('#goAuthStaff')"); };
const openUsers = () => { click('[data-stab="customers"]'); wait("!!document.querySelector('.staff-users') && !document.querySelector('.staff-users[aria-busy=true]')"); };
const row = email => evaluate(`Array.from(document.querySelectorAll('.staff-users tbody tr')).find(row=>row.cells[1].textContent===${JSON.stringify(email)})?.textContent || ''`);
const saveDialog = () => { click('.staff-user-dialog [type="submit"]'); wait("!document.querySelector('.staff-user-dialog[open]')"); wait("!document.querySelector('.staff-users[aria-busy=true]')"); };
const restore = new Map();
for (const name of ['staff-users.json','orders.json','customers.json','products.json','catalog.json','.rate-staff-login.json','.rate-staff-users-write.json']) {
  const file = path.join(fixtureRoot, 'data', name);
  try { restore.set(file, await readFile(file)); } catch(error) { if(error.code!=='ENOENT') throw error; restore.set(file, null); }
}
const restoreFixture = async () => {
  for(const [file,body] of restore) {
    assert.equal(path.dirname(file),path.join(fixtureRoot,'data'));
    if(body===null) { try { await unlink(file); } catch(error) { if(error.code!=='ENOENT')throw error; } }
    else { await writeFile(file,body);assert.deepEqual(await readFile(file),body,'Fixture store restored byte-for-byte'); }
  }
};
const customerId = 'cus_' + 'b'.repeat(32), customerEmail = 'staff-ui-buyer@example.test', orderId = 'staff-ui-synthetic-order';
let failure = null, finalConsole = [], finalErrors = [];
try {
  // Repeated local QA runs have their own clean rate-limit window; original
  // isolated-fixture counters are restored with the synthetic account stores.
  for(const name of ['.rate-staff-login.json','.rate-staff-users-write.json']) await writeFile(path.join(fixtureRoot,'data',name),'{}');
  const customersFile = path.join(fixtureRoot,'data/customers.json'), ordersFile = path.join(fixtureRoot,'data/orders.json');
  const customers = restore.get(customersFile) ? JSON.parse(restore.get(customersFile)) : { version:1, accounts:{} };
  customers.accounts = { ...customers.accounts, [customerId]: { id:customerId,name:'UI QA Customer',email:customerEmail,createdAt:'2026-10-05T00:00:00Z' } };
  const orders = restore.get(ordersFile) ? JSON.parse(restore.get(ordersFile)) : { orders:[] };
  orders.orders.push({id:orderId,code:'CM-UI-QA',customerUserId:customerId,email:customerEmail,status:'placed',payment:'COD',placedAt:'2026-10-05T00:00:00Z',log:[],items:[{id:26,name:'Synthetic UI item',qty:1,price:2750}],totals:{subtotal:2750,total:2750,saving:0},customer:{name:'UI QA Customer',phone:'9999999999',email:customerEmail},shipping:{address:'123 Synthetic Fixture Road',area:'Fixture',city:'Hyderabad',pincode:'500001'}});
  await writeFile(customersFile,JSON.stringify(customers)); await writeFile(ordersFile,JSON.stringify(orders));
  // A fresh Windows daemon must not inherit execFileSync's output pipe.
  await launch('open',base.href+'#/staff');
  run('wait','--load','networkidle');run('set','viewport','1440','1000');
  wait("!!document.querySelector('#goAuthStaff')");spy();login(fixture.email,fixture.password);
  check('Configured owner signs in through the real form and lands on Dashboard',evaluate("document.querySelector('[data-stab=dashboard]').classList.contains('active') && document.querySelector('.at-av-meta small').textContent==='Super Admin'"));
  check('Owner initial hydration has no forbidden requests',requests().every(request=>request.status<400));
  openUsers();
  check('Users includes protected owner and synthetic customer order count/spend',row(customerEmail).includes('2,750') && evaluate("Array.from(document.querySelectorAll('.staff-users tr')).some(row=>row.textContent.includes('Protected owner'))"));
  screenshot('01-users-desktop');
  click('[data-add-user]');wait("!!document.querySelector('.staff-user-dialog[open]')");
  check('Native Add dialog focuses Name',evaluate("document.activeElement.id==='staffUserName'"));
  check('Role choice is associated with its access description',evaluate("document.querySelector('#staffUserRole').getAttribute('aria-describedby')==='staffRoleHelp' && document.querySelector('#staffRoleHelp').textContent.length>0"));
  screenshot('02-add-dialog-desktop');
  run('press','Tab');check('Add dialog keyboard navigation advances to Email',evaluate("document.activeElement.id==='staffUserEmail'"));
  run('press','Shift+Tab');check('Add dialog reverse keyboard navigation returns to Name',evaluate("document.activeElement.id==='staffUserName'"));
  run('press','Escape');wait("!document.querySelector('.staff-user-dialog[open]')");
  check('Escape closes Add dialog and restores its trigger focus',evaluate("document.activeElement.hasAttribute('data-add-user')"));
  click('[data-add-user]');fill('#staffUserName','Invalid Password Fixture');fill('#staffUserEmail',`invalid-${stamp}@example.test`);fill('#staffUserPassword','short');
  spy();click('.staff-user-dialog [type="submit"]');wait("!document.querySelector('[data-user-error]').hidden");
  check('Short password fails visibly before transport and focuses its field',evaluate("document.activeElement.id==='staffUserPassword' && document.querySelector('[data-user-error]').textContent.includes('15')") && !requests().some(request=>request.path.includes('staff-users.php?a=create')));
  click('[data-user-cancel]');
  for(const role of roles){const account=accounts[role];click('[data-add-user]');fill('#staffUserName',account.name);fill('#staffUserEmail',account.email);choose('#staffUserRole',role);fill('#staffUserPassword',password);saveDialog();wait(`document.querySelector('.staff-users').textContent.includes(${JSON.stringify(account.email)})`);account.id=evaluate(`Array.from(document.querySelectorAll('.staff-users tbody tr')).find(row=>row.cells[1].textContent===${JSON.stringify(account.email)}).querySelector('[data-edit-user]').dataset.editUser`);check('Users form creates '+role,row(account.email).includes(account.name));}
  check('Successful save restores focus after the Users table refreshes',evaluate("document.activeElement.hasAttribute('data-add-user')"));
  screenshot('03-all-roles-desktop');
  for(const [filter, expected] of [['admins',3],['billing',1],['inventory',1],['orders',1],['customers',1]]){click(`[data-user-filter="${filter}"]`);check(filter+' filter and visible count agree',evaluate(`document.querySelectorAll('.staff-users tbody tr').length===${expected} && document.querySelector('[data-user-filter="${filter}"] span').textContent==='${expected}'`));}
  click('[data-user-filter="all"]');fill('#admUq',accounts.billing.email);wait("document.querySelectorAll('.staff-users tbody tr').length===1");check('Search narrows by email without losing input focus',evaluate("document.activeElement.id==='admUq'") && row(accounts.billing.email).includes('Billing'));fill('#admUq','');wait("document.querySelectorAll('.staff-users tbody tr').length===7");
  click(`[data-edit-user="${accounts.admin.id}"]`);check('Edit never exposes the existing password',evaluate("document.querySelector('#staffUserPassword').value==='' && document.querySelector('#staffUserPassword').type==='password'"));fill('#staffUserName','UI QA Updated Admin');choose('#staffUserRole','billing');saveDialog();check('Edit persists name and role without password replacement',row(accounts.admin.email).includes('UI QA Updated Admin') && row(accounts.admin.email).includes('Billing'));
  click(`[data-edit-user="${accounts.admin.id}"]`);choose('#staffUserRole','admin');saveDialog();
  click('[data-add-user]');fill('#staffUserName','Duplicate Fixture');fill('#staffUserEmail',accounts.admin.email);fill('#staffUserPassword',password);click('.staff-user-dialog [type="submit"]');wait("!document.querySelector('[data-user-error]').hidden");check('Duplicate staff email produces a visible safe error',evaluate("document.querySelector('[data-user-error]').textContent.includes('already uses this email')"));click('[data-user-cancel]');
  click(`[data-activate-user="${accounts.inventory_manager.id}"]`);saveDialog();click('[data-user-filter="inactive"]');check('Deactivate persists and Inactive filter shows the account',row(accounts.inventory_manager.email).includes('Inactive') && evaluate("document.querySelectorAll('.staff-users tbody tr').length===1"));click('[data-user-filter="all"]');
  logout();click('#goAuthStaff');fill('#auEmail',accounts.inventory_manager.email);fill('#auPass',password);click('#auSubmit');wait("document.body.textContent.includes('Incorrect email or password')");check('Inactive staff cannot sign in and receives a safe login error',evaluate("!document.querySelector('#adminShell') && document.querySelector('#auSubmit').textContent==='Login'"));click('#authModal button[data-close-auth]');
  login(fixture.email,fixture.password);openUsers();click(`[data-activate-user="${accounts.inventory_manager.id}"]`);saveDialog();check('Reactivate restores Active status',row(accounts.inventory_manager.email).includes('Active') && !row(accounts.inventory_manager.email).includes('Inactive'));
  run('set','viewport','390','844');screenshot('04-users-mobile');check('Users mobile viewport has no page overflow',evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  click('[data-add-user]');screenshot('05-add-dialog-mobile');check('Mobile dialog fits the viewport',evaluate("(()=>{const r=document.querySelector('.staff-user-dialog').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})()"));run('press','Escape');wait("!document.querySelector('.staff-user-dialog')");
  click(`[data-activate-user="${accounts.super_admin.id}"]`);screenshot('04b-long-activation-mobile');check('Long account name and email wrap inside the mobile activation dialog',evaluate("(()=>{const d=document.querySelector('.staff-user-dialog'),r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&d.scrollWidth<=d.clientWidth+1;})()"));run('press','Escape');wait("!document.querySelector('.staff-user-dialog')");run('set','viewport','1440','1000');logout();
  const expected={super_admin:['dashboard',['customers','settings','visual-editor']],admin:['dashboard',['customers','settings','visual-editor']],billing:['pos',['orders','price-list']],inventory_manager:['products',['add-product','categories']],order_manager:['orders',['customers','notifications']]};
  for(const role of roles){const account=accounts[role];spy();login(account.email,password);const [landing,present]=expected[role];check(role+' UI login retains identity and opens its landing workspace',evaluate(`document.querySelector('[data-stab="${landing}"]').classList.contains('active') && document.querySelector('.at-av-meta b').textContent.includes('UI QA')`));const nav=evaluate("Array.from(document.querySelectorAll('[data-stab]')).map(node=>node.dataset.stab)");check(role+' navigation exposes permitted workspaces',present.every(panel=>nav.includes(panel)));if(!['super_admin','admin'].includes(role))check(role+' navigation hides privileged configuration',!nav.includes('settings')&&!nav.includes('visual-editor')&&!nav.includes('analytics'));check(role+' hydration makes no forbidden request',requests().every(request=>request.status<400),requests());
    if(role==='admin'){openUsers();check('Admin can read customers but has no staff management controls',evaluate("!document.querySelector('[data-add-user]')&&!document.querySelector('[data-edit-user]')") && row(customerEmail).includes('UI QA Customer'));}
    if(role==='billing'){screenshot('06-role-billing-pos');click('.pos-back');click('[data-stab="orders"]');check('Billing sees editable payment and read-only status',evaluate(`!!document.querySelector('[data-order-payment="${orderId}"]')&&!document.querySelector('[data-status]')`));spy();choose(`[data-order-payment="${orderId}"]`,'UPI');wait("document.body.textContent.includes('Payment method saved')");const write=requests().find(request=>request.method==='POST'&&request.path==='/orders-api.php');check('Billing payment UI persists only its granted field',write?.status===200&&write.bodyKeys.includes('payment')&&!write.bodyKeys.includes('status'));}
    if(role==='order_manager'){check('Order Manager sees editable status and read-only payment',evaluate(`!!document.querySelector('[data-status="${orderId}"]')&&!document.querySelector('[data-order-payment]')`));spy();choose(`[data-status="${orderId}"]`,'confirmed');wait("document.body.textContent.includes('Order status saved')");const write=requests().find(request=>request.method==='POST'&&request.path==='/orders-api.php');check('Order Manager status UI persists only its granted field',write?.status===200&&write.bodyKeys.includes('status')&&!write.bodyKeys.includes('payment'));}
    if(role==='inventory_manager'){spy();const productId=evaluate("document.querySelector('[data-edit-prod]').dataset.editProd");click(`[data-edit-prod="${productId}"]`);wait("!!document.querySelector('#epName')");click('[data-save-edit]');wait("!document.querySelector('#epName')");const write=requests().find(request=>request.method==='POST'&&request.path==='/products-api.php');check('Inventory product editor saves without sending settings',write?.status===200&&!write.bodyKeys.includes('settings'));}
    screenshot('06-role-'+role);logout();
  }
  finalErrors=run('errors').errors||[];finalConsole=(run('console').messages||[]).map(message=>({type:message.type,text:message.text}));
  check('No JavaScript page errors in integrated staff journeys',finalErrors.length===0);
} catch(error){failure=error.message;console.error('FAIL: '+failure);try{screenshot('failure');await writeFile(path.join(output,'failure-snapshot.txt'),snapshot());await writeFile(path.join(output,'failure-requests.json'),JSON.stringify(requests(),null,2));}catch{}process.exitCode=1;}
finally{
  try{run('close');}catch{}
  await restoreFixture();
  const report={generatedAt:new Date().toISOString(),scope:'Real Users UI against the isolated local fixture; synthetic accounts/order/customer; mail disabled; fixture stores restored.',session,fixture:fixtureRoot,fixtureRestored:true,checks,screenshots,console:finalConsole,errors:finalErrors,failure,passed:!failure};
  await writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2));await writeFile('audit/staff-users-browser-results.json',JSON.stringify(report,null,2));console.log('Report: '+path.join(output,'results.json'));
}
