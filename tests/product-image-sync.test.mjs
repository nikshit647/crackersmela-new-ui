import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const workspace = path.resolve(import.meta.dirname, '..');
const appPath = path.join(workspace, 'audit-evidence/production-release/js/app.js');
const source = fs.readFileSync(appPath, 'utf8');

const section = (start, end) => {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `section not found: ${start}`);
  return source.slice(a, b);
};

/* ---------- the pending-upload guard ---------- */

/* A minimal widget harness: the shipped widget code runs against real DOM-less
   stubs, so these tests exercise the actual upload race logic. */
function widgetHarness({ resolveUpload } = {}) {
  const nodes = {};
  const node = (id, extra = {}) => (nodes[id] = { id, value: '', files: [], dataset: {}, hidden: true, innerHTML: '', setAttribute() {}, removeAttribute() {}, getAttribute() { return null; }, addEventListener() {}, focus() {}, setCustomValidity() {}, checkValidity: () => true, reportValidity() {}, ...extra });
  const fileInput = node('epFile', { files: [] });
  const urlInput = node('epUrl');
  const preview = node('epPrev');
  const loadEl = node('epLoad');
  const errEl = node('epErr');
  const fileLbl = node('epfileLbl', { innerHTML: '' });
  const toasts = [];
  const context = vm.createContext({
    console, setTimeout, clearTimeout, Promise, Math, Date,
    File: class {}, URL: { createObjectURL: () => 'blob:preview', revokeObjectURL() {} },
    $: selector => ({ epFile: fileInput, epUrl: urlInput, epPrev: preview, epLoad: loadEl, epErr: errEl, epfileLbl: fileLbl }[String(selector).replace(/^#/, '')] || null),
    esc: value => String(value ?? ''),
    safeImageSrc: value => String(value || '').trim(),
    I2: { upload: 'UP' },
    toast(message) { toasts.push(message); },
  });
  context.globalThis = context;
  context.toasts = toasts;
  /* The shipped widget code, loaded verbatim so these tests cannot drift. */
  const body = section('  const imgGetters = {};', '  const imgGet = prefix =>');
  vm.runInContext(body + '\nthis.__wire = wireImageWidget;', context);
  const uploads = [];
  context.__resolveUpload = resolveUpload;
  context.__uploads = uploads;
  /* Uploads are queued so a test can settle them out of order. */
  vm.runInContext(`
    this.__queue = [];
    const startUpload = () => new Promise((resolve, reject) => { this.__queue.push({ resolve, reject }); });
    const uploadWithBackgroundRemoval = file => startUpload(file);
    const uploadFile = file => startUpload(file);
    this.__queued = () => this.__queue.length;
    this.__settleUpload = (result) => { const entry = this.__queue.shift(); if (entry) entry.resolve(result); };
    this.__rejectUpload = (error) => { const entry = this.__queue.shift(); if (entry) entry.reject(error); };
  `, context);
  return { context, fileInput, urlInput, preview };
}

test('saving is blocked while an image upload is still in flight', async () => {
  const { context, fileInput, preview } = widgetHarness();
  context.__wire('ep');
  /* Pick a file: the upload has not resolved yet. */
  fileInput.files = [{ name: 'new.webp', type: 'image/webp', size: 100 }];
  fileInput.onchange();
  await new Promise(done => setTimeout(done, 0));
  assert.equal(vm.runInContext("imgUploadPending('ep')", context), true, 'The upload must be tracked as pending');
  assert.equal(vm.runInContext("imgWaitForUpload('ep')", context), true, 'Saving must be refused while pending');
  assert.ok(preview.innerHTML.includes('blob:preview'), 'The picked file is previewed immediately');
  context.__settleUpload({ url: 'uploads/p-new.webp', bgRemoved: false });
  await new Promise(done => setTimeout(done, 0));
  assert.equal(vm.runInContext("imgUploadPending('ep')", context), false, 'The pending upload must clear when it finishes');
  assert.equal(vm.runInContext("imgWaitForUpload('ep')", context), false, 'Saving is allowed once the upload completed');
});

test('a finished upload supplies the new URL to the next save', async () => {
  const { context, fileInput } = widgetHarness();
  context.__wire('ep');
  fileInput.files = [{ name: 'new.webp', type: 'image/webp', size: 100 }];
  fileInput.onchange();
  await new Promise(done => setTimeout(done, 0));
  context.__settleUpload({ url: 'uploads/p-new.webp', bgRemoved: false });
  await new Promise(done => setTimeout(done, 0));
  assert.equal(vm.runInContext("imgGetters['ep']()", context), 'uploads/p-new.webp');
  assert.equal(vm.runInContext("imgWaitForUpload('ep')", context), false);
});

test('a slow upload cannot overwrite a newer choice', async () => {
  const { context, fileInput } = widgetHarness();
  context.__wire('ep');
  /* First pick starts an upload. */
  fileInput.files = [{ name: 'first.webp', type: 'image/webp', size: 100 }];
  fileInput.onchange();
  await new Promise(done => setTimeout(done, 0));
  assert.equal(vm.runInContext('this.__queued()', context), 1, 'The first upload is in flight');
  /* The admin then picks a different file, which supersedes the first upload. */
  fileInput.files = [{ name: 'second.webp', type: 'image/webp', size: 100 }];
  fileInput.onchange();
  await new Promise(done => setTimeout(done, 0));
  assert.equal(vm.runInContext('this.__queued()', context), 2, 'Both uploads are in flight');
  assert.equal(vm.runInContext("imgUploadPending('ep')", context), true, 'Saving is still refused');
  /* Only the newest upload resolves into the form. */
  context.__settleUpload({ url: 'uploads/p-first.webp', bgRemoved: false });
  await new Promise(done => setTimeout(done, 0));
  context.__settleUpload({ url: 'uploads/p-second.webp', bgRemoved: false });
  await new Promise(done => setTimeout(done, 0));
  assert.equal(vm.runInContext("imgGetters['ep']()", context), 'uploads/p-second.webp', 'The newer selection must win');
  assert.equal(vm.runInContext("imgUploadPending('ep')", context), false);
});

test('a typed URL outranks a finishing upload', async () => {
  const { context, fileInput } = widgetHarness();
  context.__wire('ep');
  fileInput.files = [{ name: 'picked.webp', type: 'image/webp', size: 100 }];
  fileInput.onchange();
  await new Promise(done => setTimeout(done, 0));
  /* The admin pastes a URL while that upload is running. */
  vm.runInContext(`(() => { const input = $('epUrl'); input.value = 'https://cdn.example.com/p.png'; input.oninput(); })()`, context);
  context.__settleUpload({ url: 'uploads/p-picked.webp', bgRemoved: false });
  await new Promise(done => setTimeout(done, 0));
  assert.equal(vm.runInContext("imgGetters['ep']()", context), 'https://cdn.example.com/p.png', 'The pasted URL must be kept');
});

test('a failed upload leaves the previous image intact and allows saving', async () => {
  const { context, fileInput } = widgetHarness();
  context.__wire('ep');
  vm.runInContext(`(() => { const input = $('epUrl'); input.value = 'uploads/p-old.webp'; input.oninput(); })()`, context);
  fileInput.files = [{ name: 'broken.webp', type: 'image/webp', size: 100 }];
  fileInput.onchange();
  await new Promise(done => setTimeout(done, 0));
  context.__rejectUpload(new Error('The image could not be uploaded.'));
  await new Promise(done => setTimeout(done, 0));
  assert.equal(vm.runInContext("imgUploadPending('ep')", context), false, 'A failed upload must not stay pending forever');
  assert.equal(vm.runInContext("imgWaitForUpload('ep')", context), false);
});

/* ---------- live image swapping ---------- */

test('an already-rendered card picks up a replaced image without a reload', () => {
  const context = vm.createContext({ console });
  context.globalThis = context;
  const images = [
    { attrs: { 'data-cm-product': '26', src: 'uploads/p-old.webp', 'data-fallback-src': null }, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; }, set src(v) { this._src = v; }, get src() { return this._src === undefined ? this.attrs.src : this._src; } },
    { attrs: { 'data-cm-product': '90', src: 'images/products/p90.webp', 'data-fallback-src': null }, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; }, set src(v) { this._src = v; }, get src() { return this._src === undefined ? this.attrs.src : this._src; } },
  ];
  const products = [
    { id: 26, image: 'uploads/p-new.webp' },
    { id: 90, image: 'images/products/p90.webp' },
  ];
  context.images = images;
  context.products = products;
  const body = section('  const productImages = () =>', '  const handleProductImageError = event => {')
    .replace('prodById(img.getAttribute(\'data-cm-product\'))', "products.find(p => String(p.id) === img.getAttribute('data-cm-product'))")
    .replace('nobgSrc(src)', "''");
  vm.runInContext(`
    const $$ = selector => selector.includes('data-cm-product') ? images : [];
    const prodById = id => products.find(p => String(p.id) === String(id));
    const safeImageSrc = value => String(value || '').trim();
  ` + body + '\nthis.__refresh = refreshProductImages;', context);
  assert.equal(vm.runInContext('this.__refresh()', context), 1, 'Only the changed product is re-pointed');
  assert.equal(images[0].getAttribute('src'), 'uploads/p-new.webp', 'The replaced card shows the new file');
  assert.equal(images[1].getAttribute('src'), 'images/products/p90.webp', 'The untouched card keeps its file');
});

test('the storefront swap runs from the product pull and never on the admin console', () => {
  const sync = section('  const syncProductsPull = (cmsQuiet = false) =>', '  /* ---- background removal on a data URL');
  assert.ok(sync.includes('imagesBefore'), 'The pull must snapshot images before replacing product state');
  assert.ok(sync.includes('refreshProductImages()'), 'The pull must refresh already-rendered product images');
  assert.ok(sync.includes('!IS_ADMIN_HOST'), 'The storefront-only refresh path is preserved');
});

test('the rendered product image carries its product id so the swap can find it', () => {
  assert.ok(source.includes('data-cm-product="${esc(p.id)}"'), 'Product images must be addressable by product');
  assert.ok(section('  const productImageMarkup =', '  /* A replaced image keeps').includes('data-cm-product'));
});
