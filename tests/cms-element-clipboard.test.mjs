import test from 'node:test';
import assert from 'node:assert/strict';
import { copyElementTree, pasteElementTree } from '../audit-evidence/product-experience-20261010/source/js/cms-element-clipboard.js';

const makeIds = () => { let count = 0; return () => 'a-copy-' + (++count); };
const fixture = () => ({ id: 'about:content-copy', elements: {
  eroot: { kind: 'container' }, e0: { kind: 'container', locked: true, styles: { desktop: { display: 'flex' } } },
  'e0.0': { kind: 'text', text: 'Original heading', styles: { desktop: { fontSize: '32px' }, mobile: { fontSize: '20px' } } },
  'e0.1': { kind: 'image', src: '/uploads/original.png', alt: 'Original picture' },
  'a-nested': { kind: 'container', added: true, parentId: 'e0' },
  'a-child': { kind: 'button', added: true, parentId: 'a-nested', text: 'Contact us', href: '/contact' },
  e1: { kind: 'text', text: 'Unrelated' }
} });
test('copies native and inserted descendants without changing the source', () => {
  const section = fixture(), before = structuredClone(section), clipboard = copyElementTree(section, 'e0');
  assert.deepEqual(Object.keys(clipboard.elements), ['e0', 'e0.0', 'e0.1', 'a-nested', 'a-child']);
  assert.equal(clipboard.elements['e0.0'].parentId, 'e0');
  assert.equal(clipboard.elements['e0.0'].flow, true);
  assert.deepEqual(section, before);
});
test('pastes a complete fresh tree with remapped parents and responsive styles', () => {
  const section = fixture(), clipboard = copyElementTree(section, 'e0');
  const root = pasteElementTree(section, clipboard, { parentId: 'eroot', beforeId: 'e1', device: 'mobile' }, makeIds());
  assert.equal(root, 'a-copy-1'); assert.equal(section.elements[root].locked, false);
  assert.equal(section.elements[root].beforeId, 'e1');
  assert.equal(section.elements['a-copy-2'].parentId, root);
  assert.equal(section.elements['a-copy-5'].parentId, 'a-copy-4');
  assert.equal(section.elements['a-copy-2'].styles.mobile.fontSize, '20px');
  assert.equal(section.elements['a-copy-3'].src, '/uploads/original.png');
  section.elements['a-copy-2'].styles.mobile.fontSize = '40px';
  assert.equal(clipboard.elements['e0.0'].styles.mobile.fontSize, '20px');
  assert.equal(section.elements['e0.0'].styles.mobile.fontSize, '20px');
});
test('only a selected text leaf is copied and its parent is retargeted', () => {
  const section = fixture(), clipboard = copyElementTree(section, 'e0.0');
  assert.equal(Object.keys(clipboard.elements).length, 1);
  const id = pasteElementTree(section, clipboard, { parentId: 'a-nested' }, makeIds());
  assert.equal(section.elements[id].parentId, 'a-nested');
});

test('stored heading nodes copy and paste with their responsive typography', () => {
  const section = fixture(); section.elements.e1 = { kind: 'heading', text: 'A stored heading', styles: { mobile: { fontSize: '26px' } } };
  const clipboard = copyElementTree(section, 'e1');
  const id = pasteElementTree(section, clipboard, {}, makeIds());
  assert.equal(section.elements[id].kind, 'heading');
  assert.equal(section.elements[id].text, 'A stored heading');
  assert.equal(section.elements[id].styles.mobile.fontSize, '26px');
});

test('image children paste into link containers but nested links are rejected atomically', () => {
  const section = fixture();
  section.elements['e2'] = { kind: 'button', href: '/about', text: '' };
  const id = pasteElementTree(section, copyElementTree(section, 'e0.1'), { parentId: 'e2' }, makeIds());
  assert.equal(section.elements[id].parentId, 'e2');
  const before = structuredClone(section);
  assert.equal(pasteElementTree(section, copyElementTree(section, 'a-child'), { parentId: 'e2' }, makeIds()), false);
  assert.deepEqual(section, before);
});
test('internal sibling anchors are remapped and external anchors are removed', () => {
  const section = fixture(); section.elements['a-nested'].beforeId = 'e0.1'; section.elements['a-child'].beforeId = 'e1';
  const clipboard = copyElementTree(section, 'e0');
  pasteElementTree(section, clipboard, {}, makeIds());
  assert.equal(section.elements['a-copy-4'].beforeId, 'a-copy-3');
  assert.equal(section.elements['a-copy-5'].beforeId, undefined);
});
test('a missing or non-container destination never mutates the page', () => {
  const section = fixture(), before = structuredClone(section), clipboard = copyElementTree(section, 'e0');
  assert.equal(pasteElementTree(section, clipboard, { parentId: 'e1' }, makeIds()), false);
  assert.equal(pasteElementTree(section, clipboard, { beforeId: 'missing' }, makeIds()), false);
  assert.deepEqual(section, before);
});
test('duplicate IDs and cyclic clipboard records are rejected atomically', () => {
  const section = fixture(), before = structuredClone(section), clipboard = copyElementTree(section, 'e0');
  assert.equal(pasteElementTree(section, clipboard, {}, () => 'a-nested'), false);
  clipboard.elements['a-nested'].parentId = 'a-child';
  assert.equal(pasteElementTree(section, clipboard, {}, makeIds()), false);
  assert.deepEqual(section, before);
});
test('repeated pastes allocate unique IDs while preserving existing elements', () => {
  const section = fixture(), clipboard = copyElementTree(section, 'e0.0'), ids = makeIds();
  const first = pasteElementTree(section, clipboard, {}, ids), second = pasteElementTree(section, clipboard, {}, ids);
  assert.notEqual(first, second); assert.equal(section.elements.e1.text, 'Unrelated');
});

test('pasted root is visible on every device while descendants retain visibility and locks', () => {
  const section = fixture();
  section.elements.e0.hidden = true;
  section.elements.e0.overrides = { desktop: { hidden: true, text: 'Desktop' }, tablet: { hidden: true }, mobile: { hidden: true } };
  section.elements['e0.0'].hidden = true;
  section.elements['e0.0'].locked = true;
  section.elements['e0.0'].overrides = { mobile: { hidden: true } };
  const clipboard = copyElementTree(section, 'e0');
  const root = pasteElementTree(section, clipboard, {}, makeIds());
  assert.equal(section.elements[root].hidden, false);
  for (const device of ['desktop', 'tablet', 'mobile']) assert.notEqual(section.elements[root].overrides[device].hidden, true);
  assert.equal(section.elements[root].overrides.desktop.text, 'Desktop');
  assert.equal(section.elements['a-copy-2'].hidden, true);
  assert.equal(section.elements['a-copy-2'].locked, true);
  assert.equal(section.elements['a-copy-2'].overrides.mobile.hidden, true);
  assert.equal(clipboard.elements.e0.overrides.mobile.hidden, true);
});
