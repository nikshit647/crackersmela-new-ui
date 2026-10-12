import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const task = path.resolve('audit-evidence/product-experience-20261010');
const fixture = JSON.parse(await readFile(path.join(task, process.env.CMS_FIXTURE_FILE || 'fixture.json'), 'utf8'));
assert.ok(['localhost', '127.0.0.1'].includes(new URL(fixture.baseUrl).hostname));
const health = await (await fetch(fixture.baseUrl + '/__fixture-health')).json();
assert.equal(health.isolated, true); assert.equal(health.mail, 'disabled');
let cookie = '', csrf = '';
const checks = [];
async function api(action, body, authenticated = true) {
  const response = await fetch(fixture.baseUrl + '/cms-api.php?a=' + action, {
    method: body ? 'POST' : 'GET',
    headers: { Cookie: authenticated ? cookie : '', Origin: fixture.baseUrl, 'Content-Type': 'application/json', 'X-CSRF-Token': authenticated ? csrf : '' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return { status: response.status, ...await response.json() };
}
function check(name, condition) { checks.push({ name, pass: !!condition }); assert.ok(condition, name); console.log('PASS ' + name); }
async function login() {
  const session = await fetch(fixture.baseUrl + '/staff-auth.php?a=session');
  cookie = session.headers.getSetCookie().find(value => value.startsWith('cm_staff='))?.split(';')[0] || '';
  csrf = (await session.json()).csrfToken;
  const response = await fetch(fixture.baseUrl + '/staff-auth.php?a=login', { method: 'POST', headers: { Cookie: cookie, Origin: fixture.baseUrl, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ email: fixture.email, password: fixture.password }) });
  cookie = response.headers.getSetCookie().find(value => value.startsWith('cm_staff='))?.split(';')[0] || '';
  const result = await response.json(); assert.equal(result.ok, true, result.error); csrf = result.csrfToken || '';
  const pages = await api('pages'); csrf = pages.csrfToken;
  return pages;
}
const out = path.join(task, 'page-trash-api'); await mkdir(out, { recursive: true });
try {
  const pages = await login();
  check('Deleted-page list is explicit and authenticated', Array.isArray(pages.deletedPages) && (await api('pages', undefined, false)).status === 401);
  let result = await api('page-create', { name: 'Page recovery QA', slug: 'page-recovery-' + Date.now() });
  assert.equal(result.status, 201, result.error); const id = result.page;
  const content = structuredClone(result.draft);
  result = await api('publish', { page: id, expectedVersion: result.version, expectedGlobalVersion: result.globals.version }); assert.equal(result.ok, true, result.error);
  const published = structuredClone(result.published);
  const publishedAt = result.publishedAt;
  content.seo = { ...content.seo, title: 'Unpublished newer draft must remain private' };
  result = await api('save', { page: id, expectedVersion: result.version, expectedGlobalVersion: result.globals.version, document: content }); assert.equal(result.ok, true, result.error);
  const draft = structuredClone(result.draft);
  const deleted = await api('page-delete', { page: id, expectedVersion: result.version }); assert.equal(deleted.ok, true, deleted.error);
  const listing = await api('pages');
  check('Delete removes page from active list and retains a versioned restore entry', !listing.pages.some(p => p.id === id) && listing.deletedPages.some(p => p.id === id && p.version === deleted.version));
  check('Deleted content is unavailable publicly', (await api('published&page=' + id)).status === 404);
  check('Stale restore is rejected', (await api('page-restore', { page: id, expectedVersion: result.version })).status === 409);
  check('Unauthenticated restore is rejected', (await api('page-restore', { page: id, expectedVersion: deleted.version }, false)).status === 401);
  const restored = await api('page-restore', { page: id, expectedVersion: deleted.version }); assert.equal(restored.ok, true, restored.error);
  check('Restore keeps both draft and published content unchanged', JSON.stringify(restored.draft) === JSON.stringify(draft) && JSON.stringify(restored.published) === JSON.stringify(published) && restored.publishedAt === publishedAt);
  check('Restore reinstates prior publication without publishing newer draft', restored.pageInfo.status === 'published' && (await api('published&page=' + id)).published.seo.title !== content.seo.title);
  check('Repeated restore does not alter the page', (await api('page-restore', { page: id, expectedVersion: restored.version })).status === 409);
  const home = (await api('pages')).pages.find(p => p.id === 'home');
  check('Essential store page deletion remains protected', (await api('page-delete', { page: 'home', expectedVersion: home.version })).code === 'protected_page');
  let privatePage = await api('page-create', { name: 'Private recovery QA', slug: 'private-recovery-' + Date.now() });
  privatePage = await api('page-delete', { page: privatePage.page, expectedVersion: privatePage.version });
  privatePage = await api('page-restore', { page: privatePage.page, expectedVersion: privatePage.version });
  check('Restoring an unpublished new page leaves it private', privatePage.pageInfo.status === 'draft' && (await api('published&page=' + privatePage.page)).status === 404);
  // Keep synthetic records in the recoverable list, never erase user data.
  await api('page-delete', { page: id, expectedVersion: restored.version });
  await api('page-delete', { page: privatePage.page, expectedVersion: privatePage.version });
} finally {
  await writeFile(path.join(out, 'results.json'), JSON.stringify({ checks, passed: checks.filter(c => c.pass).length, total: checks.length }, null, 2));
}
