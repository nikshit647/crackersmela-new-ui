import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const source = fs.readFileSync(new URL('../review/public/js/app.js', import.meta.url), 'utf8');
function section(first, last) {
  const a = source.indexOf(first), b = source.indexOf(last, a);
  assert.ok(a >= 0 && b > a, first);
  return source.slice(a, b);
}

test('admin global search returns the same products for uppercase and lowercase queries', () => {
  const box = { innerHTML: '', classList: { add() {}, remove() {} } };
  const context = { $: () => box, allProducts: () => [{ id: 1, shortName: 'Sparklers', name: 'Sparklers', price: 100 }], orders: [], users: {}, I2: { box: '', sheet: '', user: '' }, money: String, priceOf: p => p.price };
  vm.runInNewContext(source.match(/^  const esc =.*$/m)[0] + '\n' + section('  const renderAdmSearch =', '  let analyticsRange =') + '\nglobalThis.search = renderAdmSearch;', context);
  context.search('spark');
  const lower = box.innerHTML;
  context.search('  SPARK  ');
  assert.equal(box.innerHTML, lower);
  assert.match(box.innerHTML, /Sparklers/);
});

test('analytics date ranges preserve the local calendar day in IST and across month boundaries', () => {
  const fn = section('  const analyticsRangeDates =', '  const analyticsReportFetch =');
  for (const [timezone, now, expected] of [
    ['Asia/Kolkata', '2026-09-26T12:00:00Z', { start: '2026-09-20', end: '2026-09-26' }],
    ['Asia/Kolkata', '2026-03-01T12:00:00Z', { start: '2026-02-23', end: '2026-03-01' }],
    ['America/New_York', '2026-09-26T12:00:00Z', { start: '2026-09-20', end: '2026-09-26' }],
  ]) {
    const code = `const DateBase=globalThis.Date; class FixedDate extends DateBase { constructor(...args) { super(...(args.length?args:[${JSON.stringify(now)}])); } }; const Date=FixedDate; const analyticsCustom=null, analyticsDays=7; ${fn}; process.stdout.write(JSON.stringify(analyticsRangeDates()));`;
    // A separate process isolates timezone changes from the other tests.
    const script = `const vm=require('node:vm'); vm.runInNewContext(${JSON.stringify(code)}, {Date, process});`;
    const output = execFileSync(process.execPath, ['-e', script], { encoding: 'utf8', env: { ...process.env, TZ: timezone } });
    assert.deepEqual(JSON.parse(output), expected, timezone);
  }
});

function seoHarness(image) {
  const elements = [];
  const context = {
    URL, PREVIEW: null, location: { href: 'http://localhost:4173/', origin: 'http://localhost:4173' },
    prodBySlug: () => ({ id: 1, slug: 'synthetic', name: 'Synthetic', shortName: 'Synthetic', price: 100, image }),
    priceOf: p => p.price, inStockOf: () => true,
    document: {
      head: { querySelector: () => null, appendChild: el => elements.push(el) },
      createElement: tag => ({ tag, attrs: {}, setAttribute(key, value) { this.attrs[key] = value; } }),
      getElementById: () => null,
    },
  };
  vm.runInNewContext(section('  const safeImageSrc =', '  const nobgSrc =') + section('  const updateSeo =', '  const navActive =') + '\nupdateSeo({name:"product"}, ["synthetic"]);', context);
  return {
    schema: JSON.parse(elements.find(el => el.id === 'cm-dynamic-schema').textContent),
    og: elements.find(el => el.attrs.property === 'og:image').attrs.content,
  };
}

test('product metadata preserves absolute HTTPS images and correctly resolves relative images', () => {
  for (const [image, expected] of [
    ['https://cdn.example/product.png', 'https://cdn.example/product.png'],
    ['images/products/test.png', 'https://crackersmela.com/images/products/test.png'],
    ['/uploads/test.webp', 'https://crackersmela.com/uploads/test.webp'],
  ]) {
    const result = seoHarness(image);
    assert.deepEqual(result.schema.image, [expected]);
    assert.equal(result.og, expected);
  }
  const invalid = seoHarness('javascript:alert(1)');
  assert.deepEqual(invalid.schema.image, []);
  assert.equal(invalid.og, 'https://crackersmela.com/images/logo.png');
});

function saveHarness(mode, overrides = {}) {
  const prefix = mode === 'edit' ? 'ep' : 'ap';
  const values = { Name: 'Synthetic test product', Cat: 'sparklers', Prim: 'sparklers', Online: '100', Stock: '10', Cmp: '', Disc: '', ...overrides };
  const state = { saves: 0, pushes: 0, renders: 0, messages: [] };
  const products = [], edits = {}, panel = { innerHTML: '' };
  const context = {
    $: selector => selector === '#staffPanel' ? panel : ({ value: values[selector.slice(prefix.length + 1)] ?? '', checked: selector === '#epEnabled' }),
    m: { __did: 1, __prevImage: '', querySelectorAll: () => [{ value: 'sparklers' }], querySelector: () => ({ scrollIntoView() {} }) },
    markError: (_id, bad) => !!bad,
    validateImageInput: () => true,
    productOverrides: edits, extraProducts: products, priceOverrides: {}, stockOverrides: {}, featOn: {},
    activity: [], imgGet: () => '',
    save: () => { state.saves++; },
    syncCatalogPush: () => { state.pushes++; }, syncProductsPush: () => { state.pushes++; },
    toast: message => state.messages.push(message),
    closeEditModal() {}, adminPanel: 'products',
    panelOf: () => '<div>refreshed</div>', wireAdmin: () => { state.renders++; },
    switchAdminPanel() {}, admQ: '',
  };
  let block, end;
  if (mode === 'edit') {
    block = section('  const wireEditModal =', '  const panelPriceList =');
    end = block.lastIndexOf('\n    };');
  } else {
    block = section("    } else if (adminPanel === 'add-product') {", "    } else if (adminPanel === 'pos') {");
    end = block.indexOf('\n      };');
  }
  const marker = 'if (saveBtn) saveBtn.onclick = () => {';
  const begin = block.indexOf(marker) + marker.length;
  assert.ok(begin > marker.length && end > begin);
  vm.runInNewContext(source.match(/^  const clamp =.*$/m)[0] + '\n' + section('  const parseProductNumber =', '  const PRODUCT_FIELDS =') + `\nglobalThis.saveHandler = () => { ${block.slice(begin, end)}\n};`, context);
  return { state, products, edits, panel, save: context.saveHandler };
}

test('both real product save handlers reject invalid prices and stock before changing data', () => {
  for (const mode of ['add', 'edit']) {
    for (const values of [{ Online: '-1' }, { Online: '' }, { Online: '1e999' }, { Stock: '-1' }, { Stock: '1.5' }, { Stock: '1000' }, { Stock: '' }, { Cmp: '-1' }, { Disc: '-1' }]) {
      const ctx = saveHarness(mode, values);
      ctx.save();
      assert.equal(ctx.state.saves, 0, `${mode}: ${JSON.stringify(values)}`);
      assert.equal(ctx.state.pushes, 0);
      assert.equal(ctx.products.length, 0);
      assert.deepEqual(ctx.edits, {});
      assert.equal(ctx.state.messages.length, 1);
    }
  }
});

test('valid zero prices and zero stock are preserved, and edit rerender does not reference a missing function', () => {
  for (const mode of ['add', 'edit']) {
    const ctx = saveHarness(mode, { Online: '0', Stock: '0' });
    assert.doesNotThrow(() => ctx.save());
    const product = mode === 'edit' ? ctx.edits[1] : ctx.products[0];
    assert.equal(product.price, 0);
    assert.equal(product.stock, 0);
    assert.equal(product.inStock, false);
    assert.equal(product.compareAt, 0);
    assert.equal(product.discountPrice, 0);
    assert.ok(ctx.state.saves > 0);
    if (mode === 'edit') {
      assert.equal(ctx.state.renders, 1);
      assert.equal(ctx.panel.innerHTML, '<div>refreshed</div>');
    }
  }
});

test('admin panel error state gives retry guidance without rendering private exception details', () => {
  const context = { I: { alert: '<svg></svg>' }, I2: { refresh: '<svg></svg>' } };
  vm.runInNewContext(section('  const errPanel =', '  const panelDashboard =') + '\nglobalThis.renderError = errPanel;', context);
  const html = context.renderError(new Error('SYNTHETIC_PRIVATE_DATABASE_PATH'));
  assert.doesNotMatch(html, /SYNTHETIC_PRIVATE_DATABASE_PATH/);
  assert.match(html, /This panel could not be loaded\. Please try again\./);
  assert.match(html, /data-reload-panel/);
});

function googleSignInHarness({ ready = true, error } = {}) {
  const state = { messages: [], requests: 0, button: { disabled: false } };
  const auth = () => ({ signInWithPopup: async () => {
    state.requests++;
    assert.equal(state.button.disabled, true);
    if (error) throw error;
  } });
  auth.GoogleAuthProvider = class {};
  const context = {
    $: () => ({ addEventListener: (_type, handler) => { state.click = handler; } }),
    firebaseReady: () => ready, firebase: { auth },
    authUnavailable: async () => ({ ok: false, error: 'Sign-in is unavailable in this local review.' }),
    toast: (message, kind) => state.messages.push({ message, kind }),
  };
  const block = section("    $('#authBody #googleBtn').addEventListener", "    $$('#authBody [data-pw]')");
  vm.runInNewContext(block, context);
  context.$ = () => state.button;
  return state;
}

test('unavailable Google sign-in gives the auth message without developer setup instructions', async () => {
  const state = googleSignInHarness({ ready: false });
  await state.click();
  assert.equal(state.requests, 0);
  assert.equal(state.button.disabled, false);
  assert.equal(state.messages[0].message, 'Sign-in is unavailable in this local review.');
  assert.doesNotMatch(state.messages[0].message, /app\.js|FIREBASE_CONFIG/);
});

test('Google popup failures restore the button and never show raw SDK details', async () => {
  for (const [code, expected, kind] of [
    ['auth/popup-blocked', /Allow popups/, 'err'],
    ['auth/cancelled-popup-request', /cancelled/, 'info'],
    ['auth/popup-closed-by-user', /cancelled/, 'info'],
    ['auth/internal-error', /Please try again/, 'err'],
  ]) {
    const state = googleSignInHarness({ error: { code, message: 'SYNTHETIC_PRIVATE_SDK_CONFIGURATION' } });
    await state.click();
    assert.equal(state.requests, 1);
    assert.equal(state.button.disabled, false);
    assert.match(state.messages[0].message, expected);
    assert.equal(state.messages[0].kind, kind);
    assert.doesNotMatch(state.messages[0].message, /SYNTHETIC_PRIVATE_SDK_CONFIGURATION|auth\//);
  }
  const state = googleSignInHarness();
  await state.click();
  assert.equal(state.button.disabled, false);
  assert.equal(state.messages.length, 0);
});
