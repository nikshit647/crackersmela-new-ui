import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../visual-editor/js/cms-runtime.js', import.meta.url), 'utf8');
const responsive = readFileSync(new URL('../visual-editor/js/cms-responsive.js', import.meta.url), 'utf8');

class Element {
  constructor(tag, attributes = {}, children = [], text = '') {
    this.tagName = tag.toUpperCase(); this.attributes = attributes; this.children = children;
    this.childNodes = []; this.dataset = {}; this.hidden = false; this.text = text;
    const classes = (attributes.class || '').split(' ');
    this.classList = Object.assign(classes, { contains: value => classes.includes(value) });
    for (const child of children) child.parentElement = this;
  }
  get id() { return this.attributes.id || ''; }
  set id(value) { this.attributes.id = value; }
  get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this.text = value; this.children = []; this.childNodes = []; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  matches(selectors) {
    return selectors.split(',').some(value => {
      const selector = value.trim(), child = /^(.+?)\s*>\s*(.+)$/.exec(selector);
      if (child) return this.matches(child[2]) && !!this.parentElement?.matches(child[1]);
      if (selector.startsWith('#')) return this.id === selector.slice(1);
      if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
      if (selector.startsWith('[')) return false;
      return this.tagName === selector.toUpperCase();
    });
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  querySelector(selector) {
    for (const child of this.children) { if (child.matches(selector)) return child; const found = child.querySelector(selector); if (found) return found; }
    return null;
  }
}

function runtime(route) {
  const view = { children: [], get firstElementChild() { return this.children[0] || null; } };
  const head = { children: [], querySelector: () => null, appendChild(node) { this.children.push(node); } };
  const document = { title: 'Route title', head, querySelector: selector => selector === '#view' ? view : null, createElement: tag => new Element(tag), dispatchEvent() {} };
  const context = vm.createContext({ window: {}, document, HTMLElement: Element, Node: { TEXT_NODE: 3 }, CSS: { escape: String }, CustomEvent: class {} });
  vm.runInContext(responsive, context);
  vm.runInContext(source.replace('Object.freeze({ beforeRoute,', 'Object.freeze({ state, capture, collectElements, rulesFor, applySeo, beforeRoute,'), context);
  const api = context.window.CMCms;
  api.capture(route);
  const heading = new Element('h1', {}, [], 'Current category or search');
  const intro = new Element('p', {}, [], 'Current route-specific introduction');
  const section = new Element('div', { class: 'page-head' }, [heading, intro]);
  const entries = api.collectElements(section), id = 'products:page-head';
  view.children.push(section);
  const descriptor = { id, source: id, type: 'native', region: 'main', content: {} };
  const instance = { node: section, elements: entries, descriptor };
  api.state.sources.set(id, instance); api.state.instances.set(id, instance);
  const saved = { schemaVersion: 1, id: api.page(), sections: [{ ...descriptor, elements: {
    e0: { kind: 'text', text: 'All Fireworks', styles: { desktop: { fontSize: '31px' }, mobile: { fontSize: '19px' } } },
    e1: { kind: 'text', text: 'Generic saved introduction', styles: { desktop: { paddingTop: '14px' } } }
  } }], seo: { title: 'Old generic products title' }, design: {} };
  return { api, document, heading, intro, section, entries, saved };
}

for (const query of ['cat=sparklers', 'q=flower', 'cats=sparklers,rockets']) {
  test('CMS preserves current listing heading/intro and styling for ' + query, () => {
    const r = runtime({ name: 'products', query });
    for (const [id, node] of [['e0', r.heading], ['e1', r.intro]]) {
      const entry = r.entries.get(id);
      assert.equal(entry.node, node, 'Existing node and element ID survive');
      assert.equal(entry.descriptor.kind, 'container', 'CMS keeps layout controls without a text replacement control');
      assert.equal(entry.descriptor.text, undefined);
      const saved = { kind: 'text', text: 'All Fireworks', styles: { desktop: { fontSize: '31px' }, mobile: { fontSize: '19px' } } };
      const css = r.api.rulesFor('[data-cms-element="' + id + '"]', saved);
      assert.match(css, /font-size:31px/);
      assert.match(css, /font-size:19px/);
    }
    assert.equal(r.api.apply(r.saved), true);
    assert.equal(r.document.title, 'Route title', 'Saved generic SEO cannot replace the current route');
    assert.equal(r.heading.textContent, 'Current category or search');
    assert.equal(r.intro.textContent, 'Current route-specific introduction');
    assert.match(r.document.head.children[0].textContent, /font-size:31px/);
    assert.match(r.document.head.children[0].textContent, /font-size:19px/);
    assert.match(r.document.head.children[0].textContent, /padding-top:14px/);
  });
}

test('unfiltered Products page retains manual heading, intro and SEO editing', () => {
  const r = runtime({ name: 'products', query: '' });
  assert.equal(r.entries.get('e0').descriptor.kind, 'text');
  assert.equal(r.entries.get('e1').descriptor.kind, 'text');
  r.saved.seo.title = 'Manual Products Title';
  assert.equal(r.api.apply(r.saved), true);
  assert.equal(r.document.title, 'Manual Products Title');
  assert.equal(r.heading.textContent, 'All Fireworks');
  assert.equal(r.intro.textContent, 'Generic saved introduction');
});

test('custom editorial pages using the Products template retain text and SEO editing', () => {
  const id = 'custom-' + 'a'.repeat(32);
  const r = runtime({ name: 'products', cmsId: id, templatePage: 'products', query: 'cat=sparklers' });
  assert.equal(r.api.page(), id);
  assert.equal(r.entries.get('e0').descriptor.kind, 'text');
  assert.equal(r.entries.get('e1').descriptor.kind, 'text');
  r.saved.seo.title = 'Manual Custom Title';
  assert.equal(r.api.apply(r.saved), true);
  assert.equal(r.document.title, 'Manual Custom Title');
  assert.equal(r.heading.textContent, 'All Fireworks');
  assert.equal(r.intro.textContent, 'Generic saved introduction');
});

test('route SEO guard ships identically in both runtime locations', () => {
  assert.equal(source, readFileSync(new URL('../audit-evidence/production-release/js/cms-runtime.js', import.meta.url), 'utf8'));
});
