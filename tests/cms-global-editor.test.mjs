import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../visual-editor/js/cms-model.js';

const global = (role, text = role, extra = {}) => ({ id: 'global:' + role, source: 'global:' + role, type: 'native', region: role === 'footer' ? 'footer' : 'header', name: role, content: {}, elements: { text: { kind: 'text', text } }, ...extra });
const page = (id = 'products') => ({ schemaVersion: 1, id, sections: [global('promo', 'Native promo'), global('header', 'Native header'), { id: id + ':body', source: id + ':body', type: 'native', region: 'main', content: { heading: 'Page content' }, elements: {} }, global('footer', 'Native footer')], seo: { title: 'Products title' } });
const text = (doc, role) => doc.sections.find(s => s.source === 'global:' + role)?.elements.text.text;
const globals = { promo: global('promo', 'Shared promo'), header: global('header', 'Shared header'), footer: global('footer', 'Shared footer'), version: 8, headerVersion: 8, categoryOrder: ['sparklers', 'gifts'] };

test('every loaded page receives one authoritative instance of each global component', () => {
  assert.equal(typeof model.applyGlobalComponents, 'function', 'The editor must compose shared components through its model');
  const stale = page();
  stale.sections.splice(2, 0, global('header', 'Duplicate', { id: 'old-copy', region: 'main' }));
  const result = model.applyGlobalComponents(stale, globals, page());
  assert.deepEqual(result.sections.map(s => s.id), ['global:promo', 'global:header', 'products:body', 'global:footer']);
  assert.equal(text(result, 'promo'), 'Shared promo');
  assert.equal(text(result, 'header'), 'Shared header');
  assert.equal(text(result, 'footer'), 'Shared footer');
  assert.equal(result.sections[2].content.heading, 'Page content');
  assert.deepEqual(result.seo, { title: 'Products title' });
  assert.equal(stale.sections.length, 5, 'Composing does not mutate the response or baseline');
});

test('an untouched global uses the native baseline rather than a stale page snapshot', () => {
  assert.equal(typeof model.applyGlobalComponents, 'function');
  const stale = page();
  stale.sections[0].elements.text.text = 'Old page-specific promo';
  const result = model.applyGlobalComponents(stale, { ...globals, promo: null, footer: null }, page());
  assert.equal(text(result, 'promo'), 'Native promo');
  assert.equal(text(result, 'footer'), 'Native footer');
  assert.equal(text(result, 'header'), 'Shared header');
});

test('a new page receives globals without copying content from another page', () => {
  assert.equal(typeof model.applyGlobalComponents, 'function');
  const result = model.applyGlobalComponents({ id: 'future-page', sections: [] }, globals, page('future-page'));
  assert.deepEqual(result.sections.map(s => s.id), ['global:promo', 'global:header', 'global:footer']);
  assert.equal(result.id, 'future-page');
  assert.equal(result.seo, undefined);
});

test('a save acknowledgement refreshes unchanged globals and preserves newer local edits', () => {
  assert.equal(typeof model.reconcileGlobalSave, 'function');
  const snapshot = page(), current = structuredClone(snapshot);
  current.sections[0].elements.text.text = 'Typed during save';
  current.sections[2].content.heading = 'Newer body edit';
  const result = model.reconcileGlobalSave(current, snapshot, page(), globals, page());
  assert.equal(text(result.document, 'promo'), 'Typed during save');
  assert.equal(text(result.document, 'header'), 'Shared header');
  assert.equal(text(result.document, 'footer'), 'Shared footer');
  assert.equal(result.document.sections[2].content.heading, 'Newer body edit');
  assert.equal(text(result.saved, 'promo'), 'Shared promo');
  assert.equal(result.saved.sections[2].content.heading, 'Page content');
  assert.notEqual(model.fingerprint(result.document), model.fingerprint(result.saved));
});

test('a completed save with no subsequent edit accepts canonical data and becomes clean', () => {
  assert.equal(typeof model.reconcileGlobalSave, 'function');
  const snapshot = page();
  const accepted = page(); accepted.seo.title = 'Normalized title';
  const result = model.reconcileGlobalSave(snapshot, snapshot, accepted, globals, page());
  assert.equal(result.document.seo.title, 'Normalized title');
  assert.equal(model.fingerprint(result.document), model.fingerprint(result.saved));
});

test('global identity prevents reordering even when a stale snapshot says main region', () => {
  const doc = { sections: [global('promo', 'Promo', { region: 'main' }), { id: 'body', region: 'main' }] };
  assert.equal(model.moveSection(doc, 'global:promo', 1), false);
  assert.deepEqual(doc.sections.map(s => s.id), ['global:promo', 'body']);
  assert.equal(model.moveSection(doc, 'body', -1), false);
});

test('page section reordering remains available between ordinary sections', () => {
  const doc = { sections: [{ id: 'first', region: 'main' }, { id: 'second', region: 'main' }] };
  assert.equal(model.moveSection(doc, 'first', 1), true);
  assert.deepEqual(doc.sections.map(s => s.id), ['second', 'first']);
});
