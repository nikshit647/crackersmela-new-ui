import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../review/public/js/app.js', import.meta.url), 'utf8');
const start = source.indexOf('  let cmSyncRev =');
const end = source.indexOf('  const syncProductsPull =', start);
assert.ok(start > 0 && end > start);

function harness(response, allowed = true) {
  const state = { revision: 14, requests: 0, refreshes: 0, messages: [] };
  const context = {
    PRODUCTS_API: 'disabled-local-test', CM_SYNC_KEY: '',
    productOverrides: {}, extraProducts: [], cmSettings: {},
    ls: { get: () => state.revision, set: (_key, value) => { state.revision = value; } },
    canSyncPush: () => allowed,
    fetch: async () => { state.requests++; if (response instanceof Error) throw response; return response; },
    syncProductsPull: async () => { state.refreshes++; },
    toast: (message, type) => state.messages.push({ message, type }),
  };
  vm.runInNewContext(source.slice(start, end) + '\nglobalThis.push = syncProductsPush;', context);
  return { push: context.push, state };
}

test('stale-revision errors carrying a revision are handled as conflicts, not successful writes', async () => {
  const { push, state } = harness({ ok: false, json: async () => ({ ok: false, error: 'stale-rev', rev: 99 }) });
  assert.equal(await push(), null);
  assert.equal(state.revision, 14);
  assert.equal(state.refreshes, 1);
  assert.match(state.messages[0].message, /changed elsewhere/);
});

test('failed HTTP response cannot advance revision even if its JSON claims success', async () => {
  const { push, state } = harness({ ok: false, json: async () => ({ ok: true, rev: 99 }) });
  assert.equal(await push(), null);
  assert.equal(state.revision, 14);
  assert.equal(state.messages[0].type, 'err');
});

test('acknowledged catalog save advances only a valid revision', async () => {
  const { push, state } = harness({ ok: true, json: async () => ({ ok: true, rev: 15 }) });
  const result = await push();
  assert.equal(result.ok, true);
  assert.equal(state.revision, 15);
  assert.equal(state.messages.length, 0);
  const invalid = harness({ ok: true, json: async () => ({ ok: true, rev: 1.5 }) });
  await invalid.push();
  assert.equal(invalid.state.revision, 14);
});

test('network failure and missing authorization do not advance or send unauthorized changes', async () => {
  const failure = harness(new Error('Synthetic network failure'));
  assert.equal(await failure.push(), null);
  assert.equal(failure.state.revision, 14);
  assert.match(failure.state.messages[0].message, /connection/);
  const unauthorized = harness(null, false);
  assert.equal(await unauthorized.push(), null);
  assert.equal(unauthorized.state.requests, 0);
});
