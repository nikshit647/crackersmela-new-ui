"""Real PHP product persistence, upload and CMS checks in disposable local storage.

Run with --source to test another prepared release, or --php for PHP 8.1.
No application fixtures, customer data, production sessions or mail are used.
"""
from pathlib import Path
import argparse
import hashlib
import http.cookiejar
import json
import os
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, default=ROOT / 'audit-evidence/product-experience-20261010/source')
parser.add_argument('--php', type=Path, default=ROOT / 'audit-evidence/tools/php-8.3.35/php.exe')
args = parser.parse_args()
args.source = args.source.resolve()
args.php = args.php.resolve()
fixture = Path(tempfile.mkdtemp(prefix='product-experience-test-', dir=ROOT / 'audit-evidence'))
site, data, sessions = [fixture / name for name in ('site', 'data', 'sessions')]
for directory in (site, data, sessions, site / 'js', site / 'images', site / 'uploads'):
    directory.mkdir(parents=True, exist_ok=True)
for source in args.source.glob('*.php'):
    shutil.copyfile(source, site / source.name)
(site / 'index.html').write_text('<!doctype html><html><head><title>Local product test</title></head><body><main id="app"></main></body></html>')
seed = {'categories': [{'id': 'sparklers', 'name': 'Sparklers'}], 'products': [
    {'id': 901, 'slug': 'gallery-test', 'name': 'Gallery test', 'price': 100, 'stock': 8, 'inStock': True,
     'cats': ['sparklers'], 'primary': 'sparklers', 'image': 'images/legacy.png',
     'desc': 'Original full description', 'note': 'Independent short note', 'seoDesc': 'Preserved search description'},
    {'id': 902, 'slug': 'single-test', 'name': 'Single test', 'price': 200, 'stock': 3, 'inStock': True,
     'cats': ['sparklers'], 'primary': 'sparklers', 'image': 'images/legacy.png', 'desc': 'Other description'}]}
(site / 'js/products-data.js').write_text('window.CM_DATA = ' + json.dumps(seed) + ';')
(data / 'products.json').write_text(json.dumps({'extraProducts': [], 'productOverrides': {}, 'settings': {'maintenance': False}, 'rev': 0}))
(data / 'catalog.json').write_text(json.dumps({'priceOverrides': {'901': 77}, 'stockOverrides': {'901': 6}, 'featOn': {'901': True}}))
(data / 'orders.json').write_text('{"orders":[{"id":"synthetic-preserve"}]}')
preserved = {name: (data / name).read_bytes() for name in ('catalog.json', 'orders.json')}
password = 'Local product fixture only 2026!'
env = dict(os.environ, CM_DATA_DIR=str(data), CM_UPLOAD_DIR=str(site / 'uploads'),
           CM_STAFF_CONFIG=str(fixture / 'staff.php'), CM_DISABLE_MAIL='1', EMAIL_ENABLED='false',
           CM_EMAIL_TRANSPORT='fake', CM_TEST_PASSWORD=password)
php = [str(args.php), '-d', 'extension_dir=' + str(args.php.parent / 'ext'), '-d', 'extension=gd', '-d', 'extension=fileinfo']
hashed = subprocess.check_output(php + ['-r', "echo password_hash(getenv('CM_TEST_PASSWORD'), PASSWORD_DEFAULT);"], env=env, text=True).strip()
(fixture / 'staff.php').write_text("<?php return ['email'=>'product-test@example.test','hash'=>'" + hashed + "'];")
# This test-only reader exercises the real merge and SEO helpers after HTTP writes.
(site / 'test-read.php').write_text("<?php require __DIR__.'/cm-seo.php'; $p=cmProductMap(); $out=[]; foreach($p as $id=>$v) $out[$id]=['product'=>$v,'meta'=>cmSeoProduct($v,cmBaseData()['categories']),'schema'=>cmSeoProductSchema($v,cmBaseData()['categories'])]; cmRespond(200,$out);")
with socket.socket() as reserve:
    reserve.bind(('127.0.0.1', 0))
    port = reserve.getsockname()[1]
origin = 'http://127.0.0.1:' + str(port)
log = (fixture / 'server.log').open('w', encoding='utf-8')
server = None
checks = []


def check(name, condition):
    checks.append({'name': name, 'pass': bool(condition)})
    if not condition:
        print('FAIL: ' + name)


def start():
    global server
    server = subprocess.Popen(php + ['-d', 'display_errors=0', '-d', 'upload_max_filesize=6M', '-d', 'post_max_size=7M',
                              '-d', 'session.save_path=' + str(sessions), '-S', '127.0.0.1:' + str(port), '-t', str(site)],
                              env=env, cwd=site, stdout=log, stderr=log, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    for _ in range(100):
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=.1):
                return
        except OSError:
            time.sleep(.05)
    raise RuntimeError('Local PHP fixture did not start')


def stop():
    if server is not None:
        server.terminate()
        server.wait(timeout=10)


class Client:
    def __init__(self):
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = ''

    def call(self, route, body=None, raw=None, content_type=None, token=True):
        headers = {'Accept': 'application/json', 'Origin': origin}
        if token and self.csrf:
            headers['X-CSRF-Token'] = self.csrf
        if body is not None:
            raw = json.dumps(body).encode()
            content_type = 'application/json'
        if content_type:
            headers['Content-Type'] = content_type
        try:
            response = self.opener.open(urllib.request.Request(origin + route, data=raw, headers=headers), timeout=15)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            content = response.read()
            try:
                payload = json.loads(content)
            except ValueError:
                payload = content.decode(errors='replace')
            if isinstance(payload, dict) and 'csrfToken' in payload:
                self.csrf = payload['csrfToken']
            return response.status, payload

    def upload(self, payload, filename='image.png', content_type='image/png', token=True):
        boundary = 'cm-product-experience-test'
        raw = ('--' + boundary + '\r\nContent-Disposition: form-data; name="image"; filename="' + filename + '"\r\nContent-Type: ' + content_type + '\r\n\r\n').encode() + payload + ('\r\n--' + boundary + '--\r\n').encode()
        return self.call('/upload-api.php', raw=raw, content_type='multipart/form-data; boundary=' + boundary, token=token)


def raster(kind, width=4, height=3):
    command = '$i=imagecreatetruecolor(' + str(width) + ',' + str(height) + ');imagefilledrectangle($i,0,0,' + str(width) + ',' + str(height) + ',imagecolorallocate($i,20,100,180));image' + kind + '($i);imagedestroy($i);'
    return subprocess.check_output(php + ['-r', command])


try:
    start()
    staff, anonymous = Client(), Client()
    staff.call('/staff-auth.php?a=session')
    anonymous.call('/staff-auth.php?a=session')
    check('Anonymous product writes are rejected', anonymous.call('/products-api.php', {'a': 'push', 'rev': 0, 'productOverrides': {}})[0] == 401)
    check('Local staff authentication succeeds', staff.call('/staff-auth.php?a=login', {'email': 'product-test@example.test', 'password': password})[0] == 200)
    check('Product writes still require CSRF', staff.call('/products-api.php', {'a': 'push', 'rev': 0}, token=False)[0] == 403)
    _, initial = staff.call('/test-read.php')
    check('Legacy products display descriptions by default', initial['901']['product'].get('showDescription') is True)
    check('Legacy single image normalizes without altering its URL', initial['901']['product'].get('images') == ['images/legacy.png'])
    check('Catalog price stock and featured overrides remain authoritative', initial['901']['product']['price'] == 77 and initial['901']['product']['stock'] == 6 and initial['901']['product']['featured'] is True)

    def push(overrides, extra=None):
        _, state = staff.call('/products-api.php?a=pull')
        payload = {'a': 'push', 'rev': state['rev'], 'productOverrides': overrides}
        if extra is not None:
            payload['extraProducts'] = extra
        return staff.call('/products-api.php', payload)

    png = raster('png')
    (site / 'images/legacy.png').write_bytes(png)
    check('Anonymous image upload is rejected', anonymous.upload(png)[0] == 401)
    check('Image upload still requires CSRF', staff.upload(png, token=False)[0] == 403)
    uploaded = []
    for kind, ext, mime in [('png', 'png', 'image/png'), ('jpeg', 'jpg', 'image/jpeg'), ('webp', 'webp', 'image/webp')]:
        payload = raster(kind) + b'NON_IMAGE_TRAILING_CONTENT'
        status, result = staff.upload(payload, 'fixture.' + ext, mime)
        check('Validated ' + ext + ' upload succeeds', status == 200 and isinstance(result, dict) and result.get('url', '').startswith('uploads/'))
        if status != 200:
            raise RuntimeError('Upload fixture unavailable: ' + str(result))
        uploaded.append(result['url'])
        check(ext + ' upload preserves the original bytes in a durable file', (site / result['url']).is_file() and (site / result['url']).read_bytes() == payload)
    check('False image content is rejected', staff.upload(b'<?php echo "not an image"; ?>')[0] == 422)
    check('Unsupported SVG is rejected', staff.upload(b'<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'image.svg', 'image/svg+xml')[0] == 422)
    check('Oversized image bytes are rejected', staff.upload(png + b'x' * (5 * 1024 * 1024))[0] == 413)
    check('Oversized image dimensions are rejected', staff.upload(raster('png', 4097, 1))[0] == 422)

    description = 'Saved full description\nwith a second line.'
    change = {'images': uploaded + [uploaded[0]], 'image': uploaded[1], 'showDescription': False,
              'desc': description, 'note': 'Independent short note', 'seoDesc': 'Preserved search description'}
    check('Gallery and description visibility save together', push({'901': change})[0] == 200)
    _, saved = staff.call('/products-api.php?a=pull')
    first = saved['productOverrides']['901']
    check('Image order persists and duplicate URLs are removed', first.get('images') == uploaded)
    check('Explicit primary remains independent of gallery order', first.get('image') == uploaded[1])
    check('Hidden description remains saved verbatim', first.get('showDescription') is False and first.get('desc') == description)
    _, merged = staff.call('/test-read.php')
    check('Different products have independent description visibility', merged['901']['product'].get('showDescription') is False and merged['902']['product'].get('showDescription') is True)
    check('Short note remains present when full description is hidden', merged['901']['product'].get('note') == 'Independent short note')
    check('Hidden full description is absent from structured data', merged['901']['schema'].get('description') == 'Independent short note')
    check('SEO metadata survives description visibility changes', merged['901']['meta'].get('seoDesc') == 'Preserved search description')
    expected_images = ['https://crackersmela.com/' + item for item in [uploaded[1], uploaded[0], uploaded[2]]]
    check('Product structured data includes every image with primary first', merged['901']['schema'].get('image') == expected_images)
    status, library = staff.call('/cms-media.php?a=list')
    check('Media library lists uploaded secondary images as protected', status == 200 and all(any(item['url'].lstrip('/') == url and item['canDelete'] is False for item in library['items']) for url in uploaded))
    for url in uploaded:
        check('CMS refuses deletion of referenced image ' + str(uploaded.index(url) + 1), staff.call('/cms-media.php?a=delete', {'url': '/' + url})[0] == 409 and (site / url).is_file())

    check('Sparse product edits preserve omitted new fields', push({'901': {'name': 'Renamed gallery'}})[0] == 200)
    _, sparse = staff.call('/products-api.php?a=pull')
    current = sparse['productOverrides']['901']
    check('Sparse edit retains visibility gallery primary and description', current.get('showDescription') is False and current.get('images') == uploaded and current.get('image') == uploaded[1] and current.get('desc') == description)
    old_client_image = 'images/replacement.png'
    (site / old_client_image).write_bytes(png)
    check('Legacy image-only replacement is accepted', push({'901': {'image': old_client_image}})[0] == 200)
    _, legacy = staff.call('/products-api.php?a=pull')
    legacy = legacy['productOverrides']['901']
    check('Legacy image-only replacement preserves other gallery members', legacy.get('images') == [uploaded[0], old_client_image, uploaded[2]] and legacy.get('image') == old_client_image)
    check('Description can be enabled without resending its content', push({'901': {'showDescription': True}})[0] == 200)
    _, enabled = staff.call('/test-read.php')
    check('Enabling restores saved full description and schema', enabled['901']['product'].get('desc') == description and enabled['901']['product'].get('showDescription') is True and enabled['901']['schema'].get('description') == 'Saved full description with a second line.')
    check('A product without a short note can hide its description', push({'901': {'showDescription': False, 'note': ''}})[0] == 200)
    _, no_note = staff.call('/test-read.php')
    check('Hidden full description is omitted when no short note exists', 'description' not in no_note['901']['schema'] and no_note['901']['product']['desc'] == description)

    for bad in [None, 'false', 0, 1, {}, []]:
        before = (data / 'products.json').read_bytes()
        check('Non-Boolean visibility is rejected: ' + repr(bad), push({'901': {'showDescription': bad}})[0] == 422 and (data / 'products.json').read_bytes() == before)
    invalid_media = [None, 'uploads/not-array.png', {'named': uploaded[0]}, [''], [None], ['blob:temporary'], ['data:image/png;base64,AAAA'], ['javascript:alert(1)'], ['http://example.test/image.png'], ['uploads/../outside.png'], ['uploads/x.png'] * 21]
    for bad in invalid_media:
        before = (data / 'products.json').read_bytes()
        check('Invalid gallery is rejected without saving: ' + repr(bad)[:65], push({'901': {'images': bad}})[0] == 422 and (data / 'products.json').read_bytes() == before)
    check('Primary outside explicitly supplied gallery is rejected', push({'901': {'images': uploaded, 'image': 'images/outside.png'}})[0] == 422)
    check('Gallery-only edit chooses a remaining primary and saves order', push({'901': {'images': [uploaded[2], uploaded[0]]}})[0] == 200)
    _, reordered = staff.call('/products-api.php?a=pull')
    reordered_product = reordered['productOverrides']['901'] if isinstance(reordered['productOverrides']['901'], dict) else {}
    check('Reordered gallery and replacement primary read back correctly', reordered_product.get('images') == [uploaded[2], uploaded[0]] and reordered_product.get('image') == uploaded[2])
    check('Selecting another saved image as primary is accepted', push({'901': {'image': uploaded[0]}})[0] == 200)
    _, selected = staff.call('/products-api.php?a=pull')
    check('Selecting an existing primary does not reorder the gallery', selected['productOverrides']['901'].get('images') == [uploaded[2], uploaded[0]] and selected['productOverrides']['901'].get('image') == uploaded[0])
    extra = {'id': 903, 'name': 'New single image', 'price': 50, 'cats': ['sparklers'], 'image': uploaded[0]}
    check('New product creation remains compatible with one image', push(reordered['productOverrides'], [extra])[0] == 200)
    _, created = staff.call('/products-api.php?a=pull')
    check('New products persist default visibility and a one-image gallery', created['extraProducts'][0].get('showDescription') is True and created['extraProducts'][0].get('images') == [uploaded[0]])
    hidden_extra = dict(created['extraProducts'][0], showDescription=False, images=uploaded, image=uploaded[1])
    check('New-product records can store all new fields', push(created['productOverrides'], [hidden_extra])[0] == 200)
    check('Old client full-product records preserve omitted new fields', push(created['productOverrides'], [extra])[0] == 200)
    _, extra_saved = staff.call('/products-api.php?a=pull')
    check('Existing extra-product visibility survives a legacy update', extra_saved['extraProducts'][0].get('showDescription') is False and len(extra_saved['extraProducts'][0].get('images', [])) == 3)
    before_restart = (data / 'products.json').read_bytes()
    stop()
    start()
    _, restarted = staff.call('/products-api.php?a=pull')
    check('Products and image order survive a PHP server restart', restarted.get('productOverrides') == extra_saved.get('productOverrides') and restarted.get('extraProducts') == extra_saved.get('extraProducts') and (data / 'products.json').read_bytes() == before_restart)
    check('Uploaded files remain readable after restart', all(staff.call('/' + url)[0] == 200 for url in uploaded))
    check('A stale revision cannot overwrite a saved product', staff.call('/products-api.php', {'a': 'push', 'rev': 0, 'productOverrides': {}})[0] == 409)
    check('Removing all product images is explicit and persistent', push({'901': {'images': [], 'image': ''}}, [dict(extra, images=[], image='')])[0] == 200)
    _, removed = staff.call('/test-read.php')
    check('Empty galleries do not resurrect legacy product images', removed['901']['product'].get('images') == [] and removed['901']['product'].get('image') == '')
    check('Unreferenced removed image can be deleted from CMS library', staff.call('/cms-media.php?a=delete', {'url': '/' + uploaded[2]})[0] == 200 and not (site / uploaded[2]).exists())
    check('Unrelated orders catalog pricing and stock stores remain byte-identical', all((data / name).read_bytes() == contents for name, contents in preserved.items()))
finally:
    stop()
    log.close()
    report = {'source': str(args.source), 'php': str(args.php), 'fixture': str(fixture), 'checks': checks,
              'passed': sum(row['pass'] for row in checks), 'total': len(checks), 'failed': [row['name'] for row in checks if not row['pass']],
              'sourceHashes': {name: hashlib.sha256((args.source / name).read_bytes()).hexdigest() for name in ('cm-commerce.php', 'products-api.php', 'cms-media.php', 'cm-seo.php')}}
    (fixture / 'results.json').write_text(json.dumps(report, indent=2))
    print(json.dumps({'passed': report['passed'], 'total': report['total'], 'report': str(fixture / 'results.json')}))
if report['failed']:
    raise SystemExit(1)
