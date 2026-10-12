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
function pendingRequest(status) {
  let deliver, started;
  const dispatched = new Promise(resolve => { started = resolve; });
  const context = vm.createContext({ Promise, fetch: async () => {
    return { ok: status === 200, status, json: () => new Promise(resolve => { deliver = resolve; started(); }) };
  } });
  context.window = context;
  vm.runInContext(fs.readFileSync('audit-evidence/production-release/js/coupons.js', 'utf8'), context);
  vm.runInContext(`const IS_ADMIN_HOST=true;let privateDataRevision=0,orders=[],users={},activity=[],heldBills=[],posCart=[];let stopped=0,routed=0;const clearPrivateCaches=()=>{},stopFeed=()=>{stopped++},route=()=>{routed++};`, context);
  vm.runInContext(section('  const STAFF_ROLES =', '  /* Analytics adapter:'), context);
  vm.runInContext(section('  const authError =', '  const FIREBASE_CONFIG ='), context);
  vm.runInContext(`csrfToken='original-token';setIdentity({id:'old-staff',email:'old@example.test',role:'super_admin',permissions:['users.manage']});`, context);
  const pending = vm.runInContext("apiJSON('staff-users.php?a=list')", context);
  return { context, dispatched, pending, respond: value => deliver(value) };
}

test('a stale staff-required response cannot sign out a newly authenticated staff identity or replace its CSRF token', async () => {
  const request = pendingRequest(401);
  await request.dispatched;
  vm.runInContext(`setIdentity({id:'new-staff',email:'new@example.test',role:'billing',permissions:['pos.create']});csrfToken='new-token';`, request.context);
  request.respond({ ok: false, code: 'staff_required', csrfToken: 'stale-token' });
  await assert.rejects(request.pending, error => error.status === 401);
  assert.equal(vm.runInContext('currentUser()?.id', request.context), 'new-staff');
  assert.equal(vm.runInContext('csrfToken', request.context), 'new-token');
  assert.equal(vm.runInContext('stopped+routed', request.context), 0);
});

test('a stale successful staff-directory response cannot overwrite the new session CSRF token', async () => {
  const request = pendingRequest(200);
  await request.dispatched;
  vm.runInContext(`setIdentity({id:'new-staff',email:'new@example.test',role:'super_admin',permissions:['users.manage']});csrfToken='new-token';`, request.context);
  request.respond({ ok: true, users: [], csrfToken: 'stale-directory-token' });
  await request.pending;
  assert.equal(vm.runInContext('csrfToken', request.context), 'new-token');
});

test('a current revoked session still clears its identity', async () => {
  const request = pendingRequest(401);
  await request.dispatched;
  request.respond({ ok: false, code: 'staff_required' });
  await assert.rejects(request.pending, error => error.status === 401);
  assert.equal(vm.runInContext('currentUser()', request.context), null);
  assert.equal(vm.runInContext('stopped+routed', request.context), 2);
});

test('a current successful response still adopts its rotated CSRF token', async () => {
  const request = pendingRequest(200);
  await request.dispatched;
  request.respond({ ok: true, users: [], csrfToken: 'rotated-token' });
  await request.pending;
  assert.equal(vm.runInContext('csrfToken', request.context), 'rotated-token');
});
