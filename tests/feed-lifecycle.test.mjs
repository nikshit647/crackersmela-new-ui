import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../review/public/js/app.js', import.meta.url), 'utf8');
function setup() {
  const first = source.indexOf('  let feedEpoch =');
  const last = source.indexOf('  const wireStaffTables =', first);
  assert.ok(first >= 0 && last > first);
  const c = vm.createContext({});
  vm.runInContext(`
    let PREVIEW = null, authorized = true, panel = {}, feedTimer = null;
    let orders = [], activity = [], callbacks = [], cleared = [], messages = [], pulls = 0;
    let adminPanel = 'products';
    const document = { hidden: false };
    const canSyncPush = () => authorized;
    const $ = () => panel;
    const save = () => {};
    const money = String;
    const updateBellUI = () => {};
    const toast = message => messages.push(message);
    const panelOf = () => 'dashboard';
    const wireAdmin = () => startFeed();
    const setInterval = fn => { callbacks.push(fn); return callbacks.length; };
    const clearInterval = id => cleared.push(id);
    let pull = async () => {};
    const syncPull = () => { pulls++; return pull(); };
  ` + source.slice(first, last), c);
  return c;
}

test('empty admin feed starts one timer and discovers its first order', async () => {
  const c = setup();
  vm.runInContext('startFeed(); startFeed();', c);
  assert.equal(vm.runInContext('callbacks.length', c), 1);
  vm.runInContext(`pull = async () => { orders = [{id:'QA-1',code:'QA',customer:{name:'Local test'},totals:{total:100},placedAt:'2026-09-26'}]; };`, c);
  await vm.runInContext('callbacks[0]()', c);
  assert.equal(vm.runInContext('activity.length', c), 1);
  assert.equal(vm.runInContext('messages.length', c), 1);
  await vm.runInContext('callbacks[0]()', c);
  assert.equal(vm.runInContext('activity.length', c), 1);
});

test('preview and unauthorized pages do not start order polling', () => {
  const c = setup();
  vm.runInContext('PREVIEW = {}; startFeed(); PREVIEW = null; authorized = false; startFeed();', c);
  assert.equal(vm.runInContext('callbacks.length', c), 0);
});

test('feed skips hidden pages, avoids overlapping requests, and ignores stopped-session completions', async () => {
  const c = setup();
  vm.runInContext('startFeed(); document.hidden = true;', c);
  await vm.runInContext('callbacks[0]()', c);
  assert.equal(vm.runInContext('pulls', c), 0);
  vm.runInContext('document.hidden = false; let finish; pull = () => new Promise(resolve => { finish = resolve; });', c);
  const pending = vm.runInContext('callbacks[0]()', c);
  await vm.runInContext('callbacks[0]()', c);
  assert.equal(vm.runInContext('pulls', c), 1);
  vm.runInContext(`stopFeed(); orders = [{id:'QA-late',code:'QA',customer:{name:'Local test'},totals:{total:100}}]; finish();`, c);
  await pending;
  assert.equal(vm.runInContext('activity.length', c), 0);
  assert.equal(vm.runInContext('feedTimer', c), null);
});

test('leaving admin stops its polling timer', async () => {
  const c = setup();
  vm.runInContext('startFeed(); panel = null;', c);
  await vm.runInContext('callbacks[0]()', c);
  assert.equal(vm.runInContext('feedTimer', c), null);
  assert.equal(vm.runInContext('pulls', c), 0);
});
