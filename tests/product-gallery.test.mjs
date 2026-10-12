import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const modulePath = path.resolve(import.meta.dirname, '../audit-evidence/product-experience-20261010/source/js/product-gallery.js');

class Element {
  constructor() { this.attributes = {}; this.listeners = {}; this.dataset = {}; this.textContent = ''; this.innerHTML = ''; this.disabled = false; this.clientHeight = 600; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  hasAttribute(name) { return name in this.attributes; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, listener, options) { (this.listeners[name] ||= []).push({ listener, options }); }
  fire(name, init = {}) {
    const event = { target: this, cancelable: true, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...init };
    for (const { listener } of this.listeners[name] || []) listener(event);
    return event;
  }
}

function harness(product = { id: 27, name: 'Test product', image: 'uploads/one.webp', images: ['uploads/one.webp', 'uploads/two.webp', 'uploads/three.webp'] }) {
  let now = 1000;
  const preload = [];
  const window = {};
  const context = vm.createContext({
    window, URL, console, location: { href: 'http://localhost:4180/product/p-27', origin: 'http://localhost:4180' },
    performance: { now: () => now },
    Image: class { set src(value) { preload.push(value); } },
    document: { createElement: () => new Element() },
  });
  vm.runInContext(fs.existsSync(modulePath) ? fs.readFileSync(modulePath, 'utf8') : '', context);
  assert.ok(window.CMProductGallery, 'The product gallery module must expose its public API');
  const root = new Element();
  const stage = new Element(), viewport = new Element(), count = new Element(), prev = new Element(), next = new Element();
  const thumbs = window.CMProductGallery.imagesFor(product).map((_, i) => { const node = new Element(); node.setAttribute('data-gallery-select', i); return node; });
  root.querySelector = selector => ({ '[data-gallery-stage]': stage, '[data-gallery-viewport]': viewport, '[data-gallery-count]': count, '[data-gallery-prev]': prev, '[data-gallery-next]': next }[selector] || null);
  root.querySelectorAll = selector => selector === '[data-gallery-select]' ? thumbs : [];
  return { api: window.CMProductGallery, window, root, stage, viewport, count, prev, next, thumbs, preload, product, tick: delta => { now += delta; }, bind() { return window.CMProductGallery.bind(root, product); } };
}

test('legacy products normalize safely, preserve order and include a separately selected primary image', () => {
  const { api } = harness();
  assert.deepEqual(Array.from(api.imagesFor({ image: 'uploads/legacy.webp' })), ['uploads/legacy.webp']);
  assert.deepEqual(Array.from(api.imagesFor({ image: 'uploads/two.webp', images: ['uploads/one.webp', 'uploads/two.webp', 'uploads/one.webp', '', 'javascript:alert(1)', 'https://user:pass@example.com/a.jpg', 'http://other.test/a.jpg'] })), ['uploads/one.webp', 'uploads/two.webp']);
  assert.deepEqual(Array.from(api.imagesFor({ image: 'uploads/primary.webp', images: ['uploads/other.webp'] })), ['uploads/primary.webp', 'uploads/other.webp']);
  assert.deepEqual(Array.from(api.imagesFor({})), []);
});

test('markup escapes product data, starts on the primary image and hides navigation for a single image', () => {
  const { api } = harness();
  const html = api.render({ id: '\" onmouseover=\"bad', name: '<script>bad</script>', image: 'uploads/two.webp', images: ['uploads/one.webp', 'uploads/two.webp'] });
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /data-gallery-index="1"/);
  assert.match(html, /2 \/ 2/);
  assert.match(html, /class="prod-gallery__navigation" role="group"/);
  assert.match(html, /class="prod-gallery__thumbs" role="group"/);
  assert.match(html, /data-gallery-count role="status"/);
  const single = api.render({ image: 'images/products/p27.webp' });
  assert.ok(!single.includes('data-gallery-next'));
  assert.ok(!single.includes('tabindex="0"'));
  assert.match(single, /images\/products\/nobg\/p27.webp/);
  assert.match(single, /fetchpriority="high"/);
});

test('buttons, thumbnails and keyboard stay synchronized without mutating product data', () => {
  const h = harness();
  const before = JSON.stringify(h.product);
  h.bind();
  h.next.fire('click');
  assert.equal(h.count.textContent, '2 / 3');
  assert.equal(h.thumbs[1].getAttribute('aria-pressed'), 'true');
  assert.match(h.viewport.innerHTML, /uploads\/two.webp/);
  h.thumbs[2].fire('click');
  assert.equal(h.count.textContent, '3 / 3');
  assert.equal(h.next.disabled, true);
  h.stage.fire('keydown', { key: 'Home' });
  assert.equal(h.count.textContent, '1 / 3');
  assert.equal(h.prev.disabled, true);
  h.stage.fire('keydown', { key: 'ArrowRight' });
  h.prev.fire('click');
  assert.equal(h.count.textContent, '1 / 3');
  assert.equal(JSON.stringify(h.product), before);
});

test('brand pill belongs inside the image stage and reserves a branded image area', () => {
  const h = harness();
  h.window.CMProductBrand = { render: product => product.brand === 'Standard' ? '<span class="product-brand-pill">Standard Fireworks</span>' : '' };
  const html = h.api.render({ ...h.product, brand: 'Standard' });
  const pill = html.indexOf('<span class="product-brand-pill">');
  assert.ok(pill > html.indexOf('data-gallery-viewport'));
  assert.ok(pill < html.indexOf('prod-gallery__navigation'));
  assert.match(html, /prod-gallery__stage prod-gallery__stage--branded/);
  assert.match(html, /data-gallery-viewport[\s\S]*<\/div>\s*<span class="product-brand-pill">Standard Fireworks<\/span>\s*<\/div>/);
  assert.ok(!h.api.render(h.product).includes('product-brand-pill'));
  assert.ok(!h.api.render(h.product).includes('prod-gallery__stage--branded'));
});

test('wheel changes once per gesture and releases page scrolling at gallery boundaries', () => {
  const h = harness(); h.bind();
  const up = h.stage.fire('wheel', { deltaY: -100, deltaX: 0, deltaMode: 0 });
  assert.equal(up.defaultPrevented, false);
  const down = h.stage.fire('wheel', { deltaY: 100, deltaX: 0, deltaMode: 0 });
  assert.equal(down.defaultPrevented, true);
  assert.equal(h.count.textContent, '2 / 3');
  for (let i = 0; i < 8; i++) { h.tick(20); h.stage.fire('wheel', { deltaY: 40, deltaX: 0, deltaMode: 0 }); }
  assert.equal(h.count.textContent, '2 / 3', 'Trackpad momentum must not race through slides');
  h.tick(250); h.stage.fire('wheel', { deltaY: 2, deltaX: 0, deltaMode: 1 });
  assert.equal(h.count.textContent, '3 / 3', 'Line-mode mouse wheels must work');
  assert.equal(h.stage.fire('wheel', { deltaY: 100, deltaX: 0 }).defaultPrevented, false);
  h.stage.fire('wheel', { deltaY: -100, deltaX: 0 });
  assert.equal(h.count.textContent, '2 / 3', 'A deliberate direction reversal works immediately');
});

test('small wheel deltas accumulate while zoom and horizontal trackpad gestures stay native', () => {
  const h = harness(); h.bind();
  for (let i = 0; i < 3; i++) h.stage.fire('wheel', { deltaY: 8, deltaX: 0, deltaMode: 0 });
  assert.equal(h.count.textContent, '2 / 3');
  for (const init of [{ deltaY: 100, deltaX: 0, ctrlKey: true }, { deltaY: 100, deltaX: 0, metaKey: true }, { deltaY: 100, deltaX: 0, altKey: true }, { deltaY: 100, deltaX: 0, shiftKey: true }, { deltaY: 10, deltaX: 100 }]) {
    assert.equal(h.stage.fire('wheel', init).defaultPrevented, false);
  }
  assert.equal(h.count.textContent, '2 / 3');
});

test('horizontal touch swipes navigate while vertical and multi-touch gestures do not', () => {
  const h = harness(); h.bind();
  const touch = (x, y) => ({ clientX: x, clientY: y });
  h.stage.fire('touchstart', { touches: [touch(140, 70)] });
  const left = h.stage.fire('touchend', { changedTouches: [touch(60, 75)] });
  assert.equal(h.count.textContent, '2 / 3');
  assert.equal(left.defaultPrevented, false);
  h.stage.fire('touchstart', { touches: [touch(100, 100)] });
  h.stage.fire('touchend', { changedTouches: [touch(120, 220)] });
  assert.equal(h.count.textContent, '2 / 3');
  h.stage.fire('touchstart', { touches: [touch(100, 100)] });
  h.stage.fire('touchmove', { touches: [touch(100, 100), touch(200, 200)] });
  h.stage.fire('touchend', { changedTouches: [touch(0, 100)] });
  assert.equal(h.count.textContent, '2 / 3');
  h.stage.fire('touchstart', { touches: [touch(60, 75)] });
  h.stage.fire('touchend', { changedTouches: [touch(150, 70)] });
  assert.equal(h.count.textContent, '1 / 3');
});

test('single-image products leave wheel and touch gestures untouched', () => {
  const h = harness({ image: 'uploads/one.webp' }); h.bind();
  assert.equal(h.stage.fire('wheel', { deltaY: 100 }).defaultPrevented, false);
  assert.equal(h.stage.listeners.wheel, undefined);
  assert.equal(h.stage.listeners.touchstart, undefined);
});

test('bind preloads only the next image and does not add duplicate listeners', () => {
  const h = harness(); h.bind(); h.bind();
  assert.deepEqual(h.preload, ['uploads/two.webp']);
  h.next.fire('click');
  assert.equal(h.count.textContent, '2 / 3');
  assert.deepEqual(h.preload, ['uploads/two.webp', 'uploads/three.webp']);
  h.prev.fire('click');
  assert.equal(h.preload.length, 2);
});

test('a primary image selected independently from order opens at its saved position', () => {
  const h = harness({ name: 'Selected primary', image: 'uploads/two.webp', images: ['uploads/one.webp', 'uploads/two.webp', 'uploads/three.webp'] });
  h.bind();
  assert.equal(h.count.textContent, '2 / 3');
  assert.equal(h.thumbs[1].getAttribute('aria-pressed'), 'true');
  assert.deepEqual(h.preload, ['uploads/three.webp']);
  h.prev.fire('click');
  assert.match(h.viewport.innerHTML, /uploads\/one.webp/);
});

test('image failure tries the existing original and then displays an accessible placeholder', () => {
  const h = harness(); h.bind();
  const img = new Element(); img.tagName = 'IMG'; img.alt = 'Test image';
  img.setAttribute('data-gallery-image', ''); img.setAttribute('data-gallery-main', '');
  img.setAttribute('data-gallery-fallback', 'images/products/p27.webp');
  let replacement = null; img.replaceWith = node => { replacement = node; };
  h.root.fire('error', { target: img });
  assert.equal(img.src, 'images/products/p27.webp');
  assert.equal(img.hasAttribute('data-gallery-fallback'), false);
  h.root.fire('error', { target: img });
  assert.equal(replacement.getAttribute('role'), 'img');
  assert.match(replacement.getAttribute('aria-label'), /unavailable/i);
});
