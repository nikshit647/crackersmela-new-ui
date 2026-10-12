import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const fixture = JSON.parse(await readFile(process.env.CM_EDITOR_FIXTURE || 'audit-evidence/product-experience-20261010/editor-fixture.json', 'utf8'));
const base = fixture.baseUrl;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
assert.equal((await (await fetch(base + '/__fixture-health')).json()).isolated, true);
let cookie = '', csrf = '';
async function api(action, body, endpoint = 'cms-api.php') {
  const response = await fetch(`${base}/${endpoint}?a=${action}`, { method: body ? 'POST' : 'GET', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: body ? JSON.stringify(body) : undefined });
  const session = response.headers.getSetCookie().find(value => value.startsWith('cm_staff='));
  if (session) cookie = session.split(';')[0];
  const result = await response.json();
  if (result.csrfToken) csrf = result.csrfToken;
  return { status: response.status, ...result };
}
await api('session', null, 'staff-auth.php');
assert.equal((await api('login', { email: fixture.email, password: fixture.password }, 'staff-auth.php')).authenticated, true);
const created = await api('page-create', { name: 'Image placement regression', slug: 'image-placement-' + Date.now() });
assert.equal(created.status, 201);
const document = created.draft;
const section = document.sections.find(section => section.type === 'text');
section.elements = {
  'content-heading': { kind: 'text', name: 'Original heading', text: 'Original content survives', overrides: { desktop: { hidden: true }, tablet: { hidden: true }, mobile: { hidden: true } } },
  'a-replacement': { kind: 'image', name: 'Replacement image', added: true, parentId: 'eroot', beforeId: 'content-heading', src: '/images/logo.png', alt: 'Replacement illustration' },
};
const request = { page: created.page, expectedVersion: created.version, expectedGlobalVersion: created.globals.version, document };
const saved = await api('save', request);
assert.equal(saved.status, 200, saved.error);
const elements = saved.draft.sections.find(value => value.id === section.id).elements;
assert.deepEqual(elements['a-replacement'], section.elements['a-replacement']);
assert.deepEqual(elements['content-heading'], section.elements['content-heading']);
assert.equal(saved.published, null);
console.log('PASS: Image placement and hidden original round-trip without publishing');
const reloaded = await api('load&page=' + encodeURIComponent(created.page));
assert.deepEqual(reloaded.draft, saved.draft);
console.log('PASS: Placement survives a separate draft load');
for (const beforeId of ['eroot', 'a-replacement', 'invalid/id', 12, null]) {
  const bad = structuredClone(document);
  bad.sections.find(value => value.id === section.id).elements['a-replacement'].beforeId = beforeId;
  const response = await api('save', { ...request, expectedVersion: saved.version, document: bad });
  assert.equal(response.status, 422, 'Invalid placement anchor must be rejected: ' + beforeId);
}
console.log('PASS: Root, self, malformed, numeric and null anchors are rejected');
const native = structuredClone(document);
native.sections.find(value => value.id === section.id).elements['content-heading'].beforeId = 'a-replacement';
assert.equal((await api('save', { ...request, expectedVersion: saved.version, document: native })).status, 422);
console.log('PASS: Native elements cannot acquire insertion-only placement');
const current = await api('load&page=' + encodeURIComponent(created.page));
assert.equal(current.version, saved.version);
assert.deepEqual(current.draft, saved.draft);
console.log('PASS: Rejected anchors preserve draft bytes and version');
