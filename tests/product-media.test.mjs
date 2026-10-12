import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const file = path.resolve('audit-evidence/product-experience-20261010/source/js/product-media.js');
const context = vm.createContext({ URL, location: { href: 'https://crackersmela.com/', origin: 'https://crackersmela.com' } });
if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
const create = (product, options = {}) => { assert.ok(context.CMProductMedia, 'Product media manager exists'); return context.CMProductMedia.createState(product, options); };
const value = state => JSON.parse(JSON.stringify(state.value()));
const image = name => ({ name, type: 'image/png', size: 20, lastModified: 1 });

test('legacy primary becomes a gallery without changing its URL', () => {
  const state = create({ image: 'uploads/old.png' });
  assert.deepEqual(value(state), { image: 'uploads/old.png', images: ['uploads/old.png'] });
});
test('ordering is independent of primary and removing primary chooses next remaining image', () => {
  const state = create({ image: 'uploads/a.png', images: ['uploads/a.png', 'uploads/b.png', 'uploads/c.png'] });
  state.setPrimary(state.items[1].id);
  state.move(state.items[2].id, 0);
  assert.deepEqual(value(state), { image: 'uploads/b.png', images: ['uploads/c.png', 'uploads/a.png', 'uploads/b.png'] });
  state.remove(state.items[2].id);
  assert.equal(state.value().image, 'uploads/c.png');
  for (const item of [...state.items]) state.remove(item.id);
  assert.deepEqual(value(state), { image: '', images: [] });
});
test('multiple uploads preserve existing images and deduplicate repeated file selections', async () => {
  let calls = 0;
  const state = create({ image: 'uploads/old.png' }, { upload: async file => { calls++; return { url: 'uploads/' + file.name }; } });
  await state.addFiles([image('b.png'), image('c.png'), image('b.png')]);
  assert.equal(calls, 2);
  assert.deepEqual(value(state), { image: 'uploads/old.png', images: ['uploads/old.png', 'uploads/b.png', 'uploads/c.png'] });
  await state.addFiles([image('b.png')]);
  assert.equal(calls, 2);
});
test('pending uploads prevent save, failed replacement preserves the prior URL', async () => {
  let reject;
  const state = create({ image: 'uploads/old.png' }, { upload: () => new Promise((_, fail) => { reject = fail; }) });
  const pending = state.replaceFile(state.items[0].id, image('b.png'));
  assert.equal(state.pending, 1);
  assert.throws(() => state.value(), /upload/i);
  reject(new Error('Connection lost'));
  await pending;
  assert.equal(state.pending, 0);
  assert.equal(state.value().image, 'uploads/old.png');
  assert.ok(state.errors.some(error => error.includes('Connection lost')));
});
test('removed upload cannot reappear when its asynchronous response arrives', async () => {
  let finish;
  const state = create({}, { upload: () => new Promise(resolve => { finish = resolve; }) });
  const pending = state.addFiles([image('b.png')]);
  state.remove(state.items[0].id);
  finish({ url: 'uploads/b.png' });
  await pending;
  assert.deepEqual(value(state), { image: '', images: [] });
});
test('unsafe temporary URLs and invalid files cannot become persisted images', async () => {
  const state = create({ image: 'uploads/old.png' }, { upload: async () => { throw new Error('must not upload'); } });
  assert.throws(() => state.addUrl('blob:temporary'), /HTTPS|image/i);
  assert.throws(() => state.addUrl('javascript:alert(1)'), /HTTPS|image/i);
  assert.throws(() => state.addUrl('/not-an-upload.png'), /HTTPS|image/i);
  assert.throws(() => state.addUrl('http://crackersmela.com/images/a.png'), /HTTPS|image/i);
  await state.addFiles([{ ...image('big.png'), size: 6 * 1024 * 1024 }, { ...image('bad.txt'), type: 'text/plain' }]);
  assert.equal(state.items.length, 1);
  assert.equal(state.errors.length, 2);
});
test('replacing a file updates duplicate detection without losing the prior file on failure', async () => {
  const state = create({}, { upload: async file => ({ url: 'uploads/' + file.name }) });
  await state.addFiles([image('a.png')]);
  await state.replaceFile(state.items[0].id, image('b.png'));
  await state.addFiles([image('a.png'), image('b.png')]);
  assert.deepEqual(value(state), { image: 'uploads/b.png', images: ['uploads/b.png', 'uploads/a.png'] });
});
test('rapid replacement attempts cannot start overlapping uploads for the same image', async () => {
  let finish, calls = 0;
  const state = create({ image: 'uploads/original.png' }, { upload: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  const id = state.items[0].id;
  const first = state.replaceFile(id, image('first.png'));
  void state.replaceFile(id, image('second.png'));
  assert.equal(calls, 1);
  assert.equal(state.pending, 1);
  finish({ url: 'uploads/first.png' });
  await first;
  assert.equal(state.pending, 0);
  assert.deepEqual(value(state), { image: 'uploads/first.png', images: ['uploads/first.png'] });
});

test('a queued image cannot be replaced before its original upload begins', async () => {
  const uploads = [];
  const state = create({}, { upload: file => new Promise(resolve => uploads.push({ name: file.name, resolve })) });
  const pending = state.addFiles([image('first.png'), image('queued.png')]);
  const queued = state.items[1];
  void state.replaceFile(queued.id, image('replacement.png'));
  assert.equal(uploads.length, 1);
  assert.equal(queued.busy, true); assert.equal(queued.queued, true);
  uploads[0].resolve({ url: 'uploads/first.png' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(uploads[1].name, 'queued.png'); assert.equal(queued.queued, false);
  uploads[1].resolve({ url: 'uploads/queued.png' });
  await pending;
  assert.equal(queued.busy, false);
  assert.deepEqual(value(state).images, ['uploads/first.png', 'uploads/queued.png']);
});

test('removing a queued image skips its upload and releases its duplicate fingerprint', async () => {
  const uploads = [];
  const state = create({}, { upload: file => new Promise(resolve => uploads.push({ name: file.name, resolve })) });
  const pending = state.addFiles([image('first.png'), image('queued.png')]);
  state.remove(state.items[1].id);
  uploads[0].resolve({ url: 'uploads/first.png' }); await pending;
  assert.equal(uploads.length, 1);
  const retry = state.addFiles([image('queued.png')]);
  assert.equal(uploads.length, 2);
  uploads[1].resolve({ url: 'uploads/queued.png' }); await retry;
  assert.deepEqual(value(state).images, ['uploads/first.png', 'uploads/queued.png']);
});
