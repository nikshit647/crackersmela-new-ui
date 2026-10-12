import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

const task = path.resolve('audit-evidence/product-experience-20261010');
const fixture = JSON.parse(await readFile(path.join(task, process.env.CMS_FIXTURE_FILE || 'integration-fixture.json'), 'utf8'));
assert.ok(['localhost', '127.0.0.1'].includes(new URL(fixture.baseUrl).hostname));
const health = await (await fetch(fixture.baseUrl + '/__fixture-health')).json();
assert.equal(health.isolated, true); assert.equal(health.mail, 'disabled');
const php = path.resolve(process.env.CM_TEST_PHP || 'audit-evidence/tools/php-8.3.35/php.exe');
const out = path.join(task, 'original-upload'); await mkdir(out, { recursive: true });
const checks = [];
const check = (name, condition) => { checks.push({ name, pass: !!condition }); assert.ok(condition, name); console.log('PASS ' + name); };
const digest = value => createHash('sha256').update(value).digest('hex');
let cookie = '', csrf = '';
async function auth(action, body) {
  const response = await fetch(fixture.baseUrl + '/staff-auth.php?a=' + action, { method: body ? 'POST' : 'GET', headers: { Cookie: cookie, Origin: fixture.baseUrl, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, ...(body ? { body: JSON.stringify(body) } : {}) });
  cookie = response.headers.getSetCookie().find(value => value.startsWith('cm_staff='))?.split(';')[0] || cookie;
  const data = await response.json(); if (data.csrfToken) csrf = data.csrfToken; return data;
}
async function upload(bytes, name, type) {
  const data = new FormData(); data.append('image', new Blob([bytes], { type }), name);
  const response = await fetch(fixture.baseUrl + '/upload-api.php', { method: 'POST', headers: { Cookie: cookie, Origin: fixture.baseUrl, 'X-CSRF-Token': csrf }, body: data });
  return { status: response.status, ...await response.json() };
}
const images = [];
try {
  await auth('session'); assert.equal((await auth('login', { email: fixture.email, password: fixture.password })).authenticated, true);
  for (const [extension, mime, encode] of [['jpg', 'image/jpeg', 'imagejpeg($image,null,71);'], ['png', 'image/png', 'imagepng($image,null,1);'], ['webp', 'image/webp', 'imagewebp($image,null,73);']]) {
    const code = '$image=imagecreatetruecolor(19,13);imagealphablending($image,false);imagesavealpha($image,true);$transparent=imagecolorallocatealpha($image,11,99,174,127);imagefill($image,0,0,$transparent);$paint=imagecolorallocatealpha($image,219,31,73,42);imagefilledrectangle($image,4,3,12,10,$paint);' + encode + 'imagedestroy($image);';
    const generated = spawnSync(php, ['-d', 'extension_dir=' + path.join(path.dirname(php), 'ext'), '-d', 'extension=gd', '-r', code]);
    assert.equal(generated.status, 0, generated.stderr.toString()); const bytes = generated.stdout;
    const uploaded = await upload(bytes, 'original-' + extension + '.' + extension, mime);
    assert.equal(uploaded.ok, true, uploaded.error);
    const download = await fetch(new URL(uploaded.url, fixture.baseUrl + '/'));
    const stored = Buffer.from(await download.arrayBuffer());
    check(extension.toUpperCase() + ' bytes, colors, alpha and metadata are preserved exactly', digest(bytes) === digest(stored));
    check(extension.toUpperCase() + ' keeps original dimensions and permanent image URL', uploaded.dimensions.width === 19 && uploaded.dimensions.height === 13 && /^uploads\/p-[a-f0-9]{32}\.(jpg|png|webp)$/.test(uploaded.url));
    check(extension.toUpperCase() + ' response has no background-removal processing state', !Object.hasOwn(uploaded, 'bgRemoved') && !Object.hasOwn(uploaded, 'processed'));
    await writeFile(path.join(out, 'original.' + extension), bytes); images.push({ mime, url: uploaded.url, sha256: digest(bytes) });
  }
  const jpeg = await readFile(path.join(out, 'original.jpg'));
  const jpegNamed = await upload(jpeg, 'original.jpeg', 'image/jpeg');
  check('JPEG filename variant uploads successfully', jpegNamed.ok === true);
  check('Invalid image content is rejected', (await upload(Buffer.from('<svg><script>alert(1)</script></svg>'), 'fake.png', 'image/png')).status === 422);
  check('Empty files are rejected', (await upload(Buffer.alloc(0), 'empty.png', 'image/png')).status >= 400);
  const source = await readFile(path.join(task, 'source/js/app.js'), 'utf8');
  check('Product add, replace and gallery use only original-file upload helper', source.includes('upload: (file, onProgress) => uploadFile(file, { onProgress })') && !/removeBackground|uploadWithBackgroundRemoval|bgRemoved|dataURLtoBlob/.test(source));
  const helper = await readFile(path.join(task, 'source/js/product-media.js'), 'utf8');
  check('Required original-background helper text is visible in shared product uploader', helper.includes('Upload a product image. Original image backgrounds are preserved.'));
  const media = await (await fetch(fixture.baseUrl + '/cms-media.php?a=list&pageSize=100', { headers: { Cookie: cookie } })).json();
  check('All uploaded formats are available in Visual Editor media library after reload', images.every(image => media.items.some(item => item.url.endsWith(image.url))));
} finally {
  await writeFile(path.join(out, 'results.json'), JSON.stringify({ php, checks, images, passed: checks.filter(c => c.pass).length, total: checks.length }, null, 2));
}
