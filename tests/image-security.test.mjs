import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../review/public/js/app.js', import.meta.url), 'utf8');
const start = source.indexOf('  /* Product image rendering keeps URLs as data');
const end = source.indexOf('  const slugOf', start);
assert.ok(start > 0 && end > start, 'Image rendering helpers must be present');

function harness() {
  const listeners = [];
  const context = {
    URL,
    location: { href: 'http://localhost:4173/', origin: 'http://localhost:4173' },
    CAT_MAP: { sparklers: { id: 'sparklers' } },
    catLabel: () => ({ id: 'sparklers' }),
    catIcon: () => '<svg aria-hidden="true"></svg>',
    document: {
      addEventListener: (...args) => listeners.push(args),
      createElement: tagName => ({ tagName, attributes: {}, setAttribute(k, v) { this.attributes[k] = v; } }),
    },
  };
  vm.runInNewContext([
    source.match(/^  const esc =.*$/m)[0],
    source.match(/^  const clamp =.*$/m)[0],
    source.slice(start, end),
    'globalThis.api = { safeImageSrc, imgOf, productImageMarkup, handleProductImageError };',
  ].join('\n'), context);
  return { ...context.api, listeners };
}

test('product images reject executable schemes, credentials, control characters, and mixed content', () => {
  const { safeImageSrc } = harness();
  for (const value of ['javascript:alert(1)', 'data:image/svg+xml,<svg/>', 'file:///secret', 'blob:https://example.com/id', 'https://user:pass@example.com/image.png', 'java\tscript:alert(1)', 'http://other.example/image.png']) {
    assert.equal(safeImageSrc(value), '', value);
  }
  for (const value of ['images/products/example.png', '/uploads/product.webp', 'https://cdn.example/image.png', 'http://localhost:4173/images/logo.png']) {
    assert.equal(safeImageSrc(value), value, value);
  }
});

test('the former inline-handler payload is encoded as inert URL data on storefront and admin images', () => {
  const { productImageMarkup } = harness();
  const image = "images/products/audit.png';globalThis.__imageAudit=true;//\" data-audit=\"x";
  for (const kind of ['product', 'thumb']) {
    const markup = productImageMarkup({ image, shortName: '<Audit>', id: 1 }, 400, kind);
    assert.doesNotMatch(markup, /\son[a-z]+\s*=/i);
    assert.ok(markup.includes('data-fallback-src="'));
    assert.ok(markup.includes('&#39;'));
    assert.ok(markup.includes('&quot;'));
    assert.ok(!markup.includes(' data-audit="x"'));
    assert.ok(!markup.includes('<Audit>'));
  }
});

test('image loading tries the original exactly once, then displays the existing category placeholder', () => {
  const { handleProductImageError, listeners } = harness();
  assert.equal(listeners.filter(([type]) => type === 'error').length, 1);
  assert.equal(listeners[0][2], true, 'Image errors require a capture listener');
  let replacement;
  const img = {
    tagName: 'IMG', alt: 'Synthetic product',
    dataset: { cmImage: 'product', imageCategory: 'sparklers', fallbackSrc: 'images/products/original.png' },
    hasAttribute: name => name === 'data-cm-image',
    replaceWith: value => { replacement = value; },
  };
  handleProductImageError({ target: img });
  assert.equal(img.src, 'images/products/original.png');
  assert.equal(img.dataset.fallbackSrc, undefined);
  assert.equal(replacement, undefined);
  handleProductImageError({ target: img });
  assert.equal(replacement.className, 'prod-img-fallback');
  assert.equal(replacement.attributes['aria-label'], 'Synthetic product');
  assert.ok(replacement.innerHTML.startsWith('<svg'));
});

test('unrelated image failures are ignored and invalid fallback schemes are never assigned', () => {
  const { handleProductImageError } = harness();
  assert.doesNotThrow(() => handleProductImageError({ target: {} }));
  let replacement;
  const img = {
    tagName: 'IMG', alt: '',
    dataset: { cmImage: 'thumb', imageCategory: 'sparklers', fallbackSrc: 'javascript:alert(1)' },
    hasAttribute: () => true,
    replaceWith: value => { replacement = value; },
  };
  handleProductImageError({ target: img });
  assert.equal(img.src, undefined);
  assert.equal(replacement.tagName, 'span');
  assert.equal(replacement.className, 'th-fb');
});

test('all storefront and admin product images are free of inline JavaScript error handlers', () => {
  assert.doesNotMatch(source, /onerror\s*=\s*["']/i);
  assert.match(source, /const thumb = p => productImageMarkup\(p, undefined, 'thumb'\)/);
  assert.match(source, /const posThumb = p => productImageMarkup\(p, undefined, 'thumb'\)/);
});

function uploadHarness({ response, error, preview = null } = {}) {
  const observed = { blobs: 0, requests: 0, processing: 0, revoked: [], images: [] };
  const context = {
    URL: {
      createObjectURL: () => { observed.blobs++; return 'blob:isolated-upload-test'; },
      revokeObjectURL: value => { observed.revoked.push(value); },
    },
    Image: class { constructor() { observed.images.push(this); } },
    FormData: class { append() {} },
    PREVIEW: preview,
    safeImageSrc: harness().safeImageSrc,
    fetch: async () => {
      observed.requests++;
      if (error) throw error;
      return response ?? { ok: true, status: 200, json: async () => ({ ok: true, url: '/uploads/test.webp' }) };
    },
    removeBackground: () => { observed.processing++; throw new Error('Unexpected processing'); },
  };
  const start = source.indexOf("  const UPLOAD_API =");
  const end = source.indexOf('  const dataURLtoBlob =', start);
  vm.runInNewContext(source.slice(start, end) + '\nglobalThis.api = { uploadFile, uploadWithBackgroundRemoval };', context);
  return { ...context.api, observed };
}

test('unsupported, empty, and oversized original files are rejected before decoding or upload', async () => {
  const { uploadFile, uploadWithBackgroundRemoval, observed } = uploadHarness();
  for (const file of [null, { type: 'image/svg+xml', size: 100 }, { type: 'image/png', size: 0 }, { type: 'image/png', size: 5242881 }]) {
    await assert.rejects(uploadFile(file));
    await assert.rejects(uploadWithBackgroundRemoval(file));
  }
  assert.equal(observed.blobs, 0);
  assert.equal(observed.images.length, 0);
  assert.equal(observed.requests, 0);
  assert.equal(observed.processing, 0);
});

test('pathological image dimensions are rejected before allocating the processing canvas', async () => {
  const { uploadWithBackgroundRemoval, observed } = uploadHarness();
  const result = uploadWithBackgroundRemoval({ type: 'image/png', size: 100 });
  assert.equal(observed.images.length, 1);
  Object.assign(observed.images[0], { naturalWidth: 1, naturalHeight: 1000000 });
  observed.images[0].onload();
  await assert.rejects(result, /dimensions are too large/);
  assert.equal(observed.processing, 0);
  assert.equal(observed.requests, 0);
  assert.equal(observed.revoked.length, 1);
});

test('upload HTTP failures reject before trusting a body that claims success', async () => {
  let reads = 0;
  const { uploadFile, observed } = uploadHarness({ response: {
    ok: false, status: 500,
    json: async () => { reads++; return { ok: true, url: '/uploads/test.webp' }; },
  } });
  await assert.rejects(uploadFile({ type: 'image/png', size: 100 }), /The image could not be uploaded\. Please try again\./);
  assert.equal(reads, 0);
  assert.equal(observed.requests, 1);
});

test('upload errors keep private server, parser, and network details out of user messages', async () => {
  const privateDetail = 'SYNTHETIC_PRIVATE_DATABASE_PATH';
  for (const options of [
    { response: { ok: true, status: 200, json: async () => ({ ok: false, error: privateDetail }) } },
    { response: { ok: true, status: 200, json: async () => { throw new Error(privateDetail); } } },
    { error: new Error(privateDetail) },
  ]) {
    const { uploadFile } = uploadHarness(options);
    await assert.rejects(uploadFile({ type: 'image/png', size: 100 }), err => {
      assert.doesNotMatch(err.message, new RegExp(privateDetail));
      assert.match(err.message, /try again/);
      return true;
    });
  }
});

test('upload status messages give a useful next step and identify preview restrictions', async () => {
  for (const [status, expected, preview] of [
    [401, /Sign in again/, null],
    [403, /account cannot upload/, null],
    [413, /max 5 MB/, null],
    [415, /JPG, PNG or WebP/, null],
    [429, /Wait a moment/, null],
    [503, /temporarily unavailable/, null],
    [503, /unavailable in this local preview/, { isolated: true }],
  ]) {
    const { uploadFile } = uploadHarness({ response: { ok: false, status }, preview });
    await assert.rejects(uploadFile({ type: 'image/png', size: 100 }), expected);
  }
});

test('successful uploads return only a safe URL and a strict background-removal flag', async () => {
  for (const url of ['/uploads/test.webp', 'https://cdn.example/test.webp']) {
    const { uploadFile } = uploadHarness({ response: {
      ok: true, status: 200,
      json: async () => ({ ok: true, url, bgRemoved: true, internalPath: 'SYNTHETIC_PRIVATE_PATH' }),
    } });
    const result = await uploadFile({ type: 'image/png', size: 100 });
    assert.deepEqual({ ...result }, { url, bgRemoved: true });
  }
  const defaultResult = await uploadHarness().uploadFile({ type: 'image/png', size: 100 });
  assert.equal(defaultResult.bgRemoved, false);
  const { uploadFile } = uploadHarness({ response: {
    ok: true, status: 200, json: async () => ({ ok: true, url: 'javascript:alert(1)' }),
  } });
  await assert.rejects(uploadFile({ type: 'image/png', size: 100 }), /uploaded image could not be loaded/);
});

test('save-time URL validation blocks invalid typed values and permits a corrected URL', () => {
  const { safeImageSrc } = harness();
  const input = {
    value: 'javascript:alert(1)', message: '', reported: false, focused: false,
    setCustomValidity(message) { this.message = message; },
    checkValidity() { return !this.message; },
    reportValidity() { this.reported = true; },
    focus() { this.focused = true; },
  };
  const start = source.indexOf('  const validateImageInput =');
  const end = source.indexOf('  const PRODUCT_FIELDS =', start);
  const context = { safeImageSrc, $: () => input };
  vm.runInNewContext(source.slice(start, end) + '\nglobalThis.validateImageInput = validateImageInput;', context);
  assert.equal(context.validateImageInput('ep'), false);
  assert.equal(input.reported, true);
  assert.equal(input.focused, true);
  input.value = 'https://images.example/product.png';
  assert.equal(context.validateImageInput('ep'), true);
  assert.equal(input.message, '');
  assert.match(source, /saveBtn\.onclick = \(\) => \{\s+if \(!validateImageInput\('ep'\)\) return;/);
  assert.match(source, /saveBtn\.onclick = \(\) => \{\s+if \(!validateImageInput\('ap'\)\) return;/);
});
