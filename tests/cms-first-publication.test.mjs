import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(process.env.CM_RUNTIME_FILE || 'visual-editor/js/cms-runtime.js', 'utf8');
const published = { schemaVersion: 1, id: 'home', sections: [], design: { primary: '#123456' }, seo: {} };
function fixture(bootstrap = null) {
  const applied = [], requests = [];
  const view = { children: [], firstElementChild: null };
  const document = {
    title: 'Test',
    head: { querySelector: () => null, appendChild: () => {} },
    getElementById: id => id === 'cm-cms-bootstrap' && bootstrap ? { textContent: JSON.stringify(bootstrap) } : null,
    querySelector: selector => selector === '#view' ? view : null,
    querySelectorAll: () => [],
    createElement: () => ({ textContent: '' }),
    dispatchEvent: event => { if (event.type === 'cm:cms-applied') applied.push(event.detail.page); },
  };
  const window = { CMStorefront: { ready: () => new Promise(() => {}) } };
  vm.runInNewContext(source, { window, document, URL, console,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    fetch: url => new Promise(resolve => requests.push({ url, resolve })),
  });
  return { api: window.CMCms, applied, requests };
}

test('published HTTP bootstrap applies synchronously without waiting for staff session or network', () => {
  const f = fixture({ page: 'home', published, globals: {} });
  f.api.afterRoute({ name: 'home' });
  assert.deepEqual(f.applied, ['home']);
  assert.equal(f.api.document().design.primary, '#123456');
});

test('home navigation prepares the published document before a new view is rendered', async () => {
  const f = fixture();
  assert.equal(typeof f.api.prepareRoute, 'function');
  const ready = f.api.prepareRoute({ name: 'home' });
  assert.equal(f.requests.length, 1);
  assert.match(f.requests[0].url, /a=published&page=home/);
  assert.equal(f.applied.length, 0);
  f.requests[0].resolve({ ok: true, json: async () => ({ ok: true, page: 'home', published, globals: {} }) });
  await ready;
  assert.equal(f.api.prepareRoute({ name: 'home' }), null);
  f.api.afterRoute({ name: 'home' });
  assert.deepEqual(f.applied, ['home']);
});

test('parallel navigation reads share a request and a failed read can retry', async () => {
  const f = fixture();
  assert.equal(typeof f.api.prepareRoute, 'function');
  const first = f.api.prepareRoute({ name: 'home' });
  const second = f.api.prepareRoute({ name: 'home' });
  assert.equal(first, second);
  assert.equal(f.requests.length, 1);
  f.requests[0].resolve({ ok: false, json: async () => ({ error: 'unavailable' }) });
  await assert.rejects(first);
  const retry = f.api.prepareRoute({ name: 'home' });
  assert.equal(f.requests.length, 2);
  f.requests[1].resolve({ ok: true, json: async () => ({ published, globals: {} }) });
  await retry;
});

test('a refreshed empty publication clears the previous saved layout', async () => {
  const f = fixture({ page: 'home', published, globals: {} });
  const pending = f.api.afterRoute({ name: 'home' });
  assert.deepEqual(f.applied, ['home']);
  assert.equal(f.requests.length, 1);
  f.requests[0].resolve({ ok: true, json: async () => ({ ok: true, published: null, globals: {} }) });
  await pending;
  assert.equal(f.api.document().design.primary, undefined);
});
