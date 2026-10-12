"""Exercise the real additive CMS against isolated PHP sessions/data, never production."""
from pathlib import Path
import copy
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
PHP = ROOT / 'audit-evidence/tools/php-8.3.35/php.exe'
BASE = ROOT / 'audit-evidence/production-release'
OVERLAY = ROOT / 'visual-editor'
FIXTURE = Path(tempfile.mkdtemp(prefix='cms-backend-', dir=ROOT / 'audit-evidence'))
SITE, DATA, SESSIONS = [FIXTURE / name for name in ('site', 'data', 'sessions')]
for directory in (SITE, DATA, SESSIONS, SITE / 'js', SITE / 'images', SITE / 'uploads', SITE / 'css'):
    directory.mkdir(parents=True, exist_ok=True)
for name in ('cm-security.php', 'cm-commerce.php', 'cm-seo.php', 'cm-google.php', 'staff-auth.php', 'customer-auth.php', 'upload-api.php'):
    shutil.copyfile(BASE / name, SITE / name)
for name in ('cm-cms.php', 'cms-api.php', 'cms-media.php', 'cms-page.php', 'cms-sitemap.php', 'visual-editor.php', 'visual-preview.php'):
    shutil.copyfile(OVERLAY / name, SITE / name)
shutil.copyfile(BASE / 'js/products-data.js', SITE / 'js/products-data.js')
(SITE / 'js/app.js').write_text('const existingSiteImage = "uploads/in-native.png";', encoding='utf-8')
(SITE / 'index.html').write_text('<!doctype html><html><head><title>Real template</title><meta name="description" content="Original description"><link rel="canonical" href="https://crackersmela.com/"><script type="application/ld+json">{"@type":"Store"}</script></head><body><script src="js/app.js?v=current"></script></body></html>', encoding='utf-8')
(SITE / 'editor-shell.html').write_text('<!doctype html><title>Authenticated editor shell</title>', encoding='utf-8')
env = os.environ.copy()
env.update(CM_DATA_DIR=str(DATA), CM_UPLOAD_DIR=str(SITE / 'uploads'), CM_STAFF_CONFIG=str(FIXTURE / 'staff.php'),
           CM_DISABLE_MAIL='1', EMAIL_ENABLED='false', CM_EMAIL_TRANSPORT='fake', CM_CMS_TEST_PASSWORD='CMS fixture password only 2026')
hashed = subprocess.check_output([str(PHP), '-r', "echo password_hash(getenv('CM_CMS_TEST_PASSWORD'), PASSWORD_DEFAULT);"], env=env, text=True).strip()
(FIXTURE / 'staff.php').write_text("<?php return ['email'=>'cms-staff@example.invalid','hash'=>'" + hashed + "'];", encoding='utf-8')
seed = (SITE / 'js/products-data.js').read_text(encoding='utf-8-sig')
seed = json.loads(seed.split('=', 1)[1].strip().rstrip(';'))
product_id = seed['products'][0]['id']
(DATA / 'products.json').write_text(json.dumps({'extraProducts': [], 'productOverrides': {str(product_id): {'image': 'uploads/in-product.png'}}, 'settings': {'maintenance': False, 'coupon': None}, 'rev': 0}), encoding='utf-8')
(DATA / 'catalog.json').write_text(json.dumps({'priceOverrides': {}, 'stockOverrides': {}, 'featOn': {}}), encoding='utf-8')
(DATA / 'orders.json').write_text('{"orders":[{"id":"synthetic-commerce-preservation"}]}', encoding='utf-8')
commerce_before = {p.name: p.read_bytes() for p in DATA.glob('*.json')}
png = subprocess.check_output([str(PHP), '-d', 'extension_dir=' + str(PHP.parent / 'ext'), '-d', 'extension=gd', '-r', '$i=imagecreatetruecolor(2,2);imagepng($i);imagedestroy($i);'])
for name in ('unused.png', 'in-product.png', 'in-native.png', 'in-revision.png'):
    (SITE / 'uploads' / name).write_bytes(png)
(SITE / 'images/bundled.png').write_bytes(png)
(FIXTURE / 'outside.png').write_bytes(png)
with socket.socket() as reserve:
    reserve.bind(('127.0.0.1', 0))
    port = reserve.getsockname()[1]
ORIGIN = 'http://127.0.0.1:' + str(port)
router = FIXTURE / 'router.php'
router.write_text('''<?php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (preg_match('~^/([a-z0-9]+(?:-[a-z0-9]+)*)/?$~D', $path, $match)) {
    // Simulate QSA: the original query can contain a colliding slug argument.
    if (!isset($_GET['slug'])) $_GET['slug'] = $match[1];
    require __DIR__ . '/site/cms-page.php'; return true;
}
return false;
''', encoding='utf-8')
log = (FIXTURE / 'server.log').open('w', encoding='utf-8')
server = subprocess.Popen([str(PHP), '-d', 'display_errors=0', '-d', 'log_errors=1', '-d', 'session.save_path=' + str(SESSIONS),
                           '-d', 'extension_dir=' + str(PHP.parent / 'ext'), '-d', 'extension=fileinfo', '-d', 'extension=gd', '-S', '127.0.0.1:' + str(port), '-t', str(SITE), str(router)],
                          env=env, cwd=SITE, stdout=log, stderr=log, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
results = []

def check(name, condition):
    results.append({'name': name, 'pass': bool(condition)})
    if not condition:
        raise AssertionError(name)

class Client:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.csrf = ''

    def call(self, path, body=None, token=True, origin=ORIGIN, raw=None, content_type=None, host=None):
        headers = {'Accept': 'application/json', 'Origin': origin}
        if host:
            headers['Host'] = host
        if token and self.csrf:
            headers['X-CSRF-Token'] = self.csrf
        if body is not None:
            raw = json.dumps(body).encode()
            headers['Content-Type'] = 'application/json'
        if content_type:
            headers['Content-Type'] = content_type
        request = urllib.request.Request(ORIGIN + path, data=raw, headers=headers)
        try:
            response = self.opener.open(request, timeout=15)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            data = response.read()
            try:
                value = json.loads(data)
            except (ValueError, UnicodeDecodeError):
                value = data.decode(errors='replace')
            return response.status, value, dict(response.headers)

    def session(self):
        status, data, _ = self.call('/staff-auth.php?a=session')
        self.csrf = data['csrfToken']
        return status

try:
    for _ in range(100):
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=.1):
                break
        except OSError:
            time.sleep(.05)
    anonymous, staff, customer = Client(), Client(), Client()
    for client in (anonymous, staff, customer):
        client.session()
    for path in ('/cms-api.php?a=pages', '/cms-api.php?a=load&page=home', '/cms-api.php?a=revisions&page=home', '/cms-api.php?a=products', '/cms-media.php?a=list', '/visual-preview.php'):
        check('anonymous denied ' + path, anonymous.call(path)[0] == 401)
    status, html, _ = anonymous.call('/visual-editor.php')
    check('editor entry requires existing staff sign-in', status == 401 and 'Open staff sign in' in html)
    status, public, _ = anonymous.call('/cms-api.php?a=published&page=home')
    check('uninitialized public page falls back to current website', status == 200 and public['published'] is None and 'draft' not in public)
    status, login, _ = staff.call('/staff-auth.php?a=login', {'email': 'cms-staff@example.invalid', 'password': env['CM_CMS_TEST_PASSWORD']})
    check('real staff authentication works', status == 200 and login['authenticated'])
    staff.csrf = login['csrfToken']
    status, account, _ = customer.call('/customer-auth.php', {'a': 'register', 'name': 'CMS Fixture', 'email': 'cms-customer@example.invalid', 'password': 'Customer fixture password only 2026'})
    check('real customer fixture created', status == 201)
    customer.csrf = account['csrfToken']
    check('customer cannot read CMS drafts', customer.call('/cms-api.php?a=load&page=home')[0] == 401)
    check('customer cannot browse admin media', customer.call('/cms-media.php?a=list')[0] == 401)
    status, pages, _ = staff.call('/cms-api.php?a=pages')
    check('registry contains only existing content templates', status == 200 and len(pages['pages']) == 13 and any(p['id'] == 'product' for p in pages['pages']))
    status, products, _ = staff.call('/cms-api.php?a=products')
    check('product selection references canonical catalog', status == 200 and any(p['id'] == product_id and p['image'] == 'uploads/in-product.png' for p in products['products']) and len(products['categories']) > 0)
    status, html, headers = staff.call('/visual-preview.php?page=home')
    check('preview serves actual template with bootstrap before app', status == 200 and html.index('/js/cms-preview.js') < html.index('js/app.js') and 'Real template' in html)
    check('preview remains private and same-origin framed', 'no-store' in headers['Cache-Control'] and "frame-ancestors 'self'" in headers['Content-Security-Policy'])
    check('authenticated editor shell is served', 'Authenticated editor shell' in staff.call('/visual-editor.php')[1])
    document = {'schemaVersion': 1, 'id': 'home', 'sections': [{'id': 'home:hero', 'source': 'home:hero', 'type': 'native', 'name': 'Hero', 'hidden': False, 'content': {},
                'elements': {'e0001': {'kind': 'text', 'name': 'Heading', 'text': 'Current real website', 'styles': {'desktop': {'fontSize': '64px', 'display': 'inline-flex'}, 'mobile': {'fontSize': '32px', 'display': 'block'}}},
                             'e0002': {'kind': 'image', 'name': 'Image', 'src': '/uploads/in-revision.png', 'alt': 'Fixture image'}}, 'styles': {}, 'hover': {}, 'animation': {}}], 'seo': {'robots': 'index, follow, max-image-preview:large'}, 'design': {}}
    visual_elements = document['sections'][0]['elements']
    visual_elements['e0001']['effects'] = {
        'desktop': {'gradient': {'enabled': True, 'start': '#1565c0', 'end': '#e91e63', 'angle': 125},
                    'position': {'x': 32, 'y': -24, 'scale': 1}},
        'tablet': {'position': {'x': 8, 'y': 12, 'scale': 1}},
        'mobile': {'gradient': {'enabled': False}, 'position': {'x': 0, 'y': 4, 'scale': 1}}}
    visual_elements['e0001']['styles']['desktop'].update(fontFamily='Georgia', color='#1565c0', opacity='0.72')
    visual_elements['e0002']['styles'] = {'desktop': {'width': '340px', 'height': '220px', 'objectFit': 'cover'}, 'mobile': {'width': '180px', 'height': '120px'}}
    visual_elements['e0002']['effects'] = {'desktop': {'position': {'x': -12, 'y': 18, 'scale': 1}}, 'mobile': {'position': {'x': 0, 'y': 6, 'scale': 1}}}
    visual_elements['a-container'] = {'kind': 'container', 'name': 'Inserted container', 'added': True, 'parentId': 'eroot'}
    for kind in ('text', 'heading', 'image', 'button', 'video', 'divider', 'icon'):
        visual_elements['a-' + kind] = {'kind': kind, 'name': 'Inserted ' + kind, 'added': True, 'parentId': 'a-container', 'styles': {'desktop': {'opacity': '0.9'}, 'mobile': {'width': '100%'}}}
    visual_elements['a-text']['text'] = 'New text stays on the real page'
    visual_elements['a-heading']['text'] = 'New heading'
    visual_elements['a-image'].update(src='/images/bundled.png', alt='Inserted fixture image')
    visual_elements['a-button'].update(text='Shop now', href='#/products', newTab=False)
    visual_elements['a-video'].update(src='https://media.example.test/celebration.webm?version=1', alt='Celebration video')
    visual_elements['a-icon'].update(icon='sparkle', alt='Sparkle')
    request = {'page': 'home', 'expectedVersion': 0, 'document': document}
    check('anonymous cannot save', anonymous.call('/cms-api.php?a=save', request)[0] == 401)
    check('customer cannot publish', customer.call('/cms-api.php?a=publish', request)[0] == 401)
    check('staff save requires CSRF', staff.call('/cms-api.php?a=save', request, token=False)[0] == 403)
    check('staff save rejects external origin', staff.call('/cms-api.php?a=save', request, origin='https://example.invalid')[0] == 403)
    status, saved, _ = staff.call('/cms-api.php?a=save', request)
    check('draft persists typed real content', status == 200 and saved['version'] == 1 and saved['draft']['sections'][0]['elements']['e0001']['text'] == 'Current real website')
    saved_visual = saved['draft']['sections'][0]['elements']
    check('responsive visual position and gradient persist', saved_visual['e0001']['effects']['desktop']['gradient']['angle'] == 125 and saved_visual['e0001']['effects']['mobile']['position']['y'] == 4 and saved_visual['e0001']['effects']['mobile']['gradient']['enabled'] is False)
    check('image movement and responsive resize persist', saved_visual['e0002']['effects']['desktop']['position']['x'] == -12 and saved_visual['e0002']['styles']['mobile']['width'] == '180px')
    check('all simple inserted elements persist with explicit parent', all(saved_visual['a-' + kind]['parentId'] == 'a-container' for kind in ('text', 'heading', 'image', 'button', 'video', 'divider', 'icon')) and saved_visual['a-container']['added'])
    check('draft does not leak to public', anonymous.call('/cms-api.php?a=published&page=home')[1]['published'] is None)
    check('optimistic concurrency rejects stale save', staff.call('/cms-api.php?a=save', request)[0] == 409)
    status, published, _ = staff.call('/cms-api.php?a=publish', {'page': 'home', 'expectedVersion': 1})
    check('publish copies saved draft to public version', status == 200 and published['version'] == 2 and published['publishedAt'])
    public = anonymous.call('/cms-api.php?a=published&page=home')[1]
    check('public receives published content only', public['published']['sections'][0]['elements']['e0001']['text'] == 'Current real website' and 'draft' not in public and 'revisions' not in public)
    public_visual = public['published']['sections'][0]['elements']
    check('public gets identical saved visual effects and inserted elements', public_visual == saved_visual)
    check('stale publishing cannot replace the public page', staff.call('/cms-api.php?a=publish', {'page': 'home', 'expectedVersion': 1, 'document': document})[0] == 409)
    document['sections'][0]['elements']['e0001']['text'] = 'Draft only revision'
    document['sections'][0]['elements'].pop('e0002')
    status, changed, _ = staff.call('/cms-api.php?a=save', {'page': 'home', 'expectedVersion': 2, 'document': document})
    check('subsequent draft preserves published content', status == 200 and changed['published']['sections'][0]['elements']['e0001']['text'] == 'Current real website')
    revisions = staff.call('/cms-api.php?a=revisions&page=home')[1]['revisions']
    check('real revisions are enumerated', len(revisions) == 3 and all(set(r) == {'id', 'at', 'kind'} for r in revisions))
    status, restored, _ = staff.call('/cms-api.php?a=restore', {'page': 'home', 'expectedVersion': 3, 'revision': revisions[-1]['id']})
    check('restore changes draft without publishing', status == 200 and restored['version'] == 4 and restored['draft']['sections'][0]['elements']['e0001']['text'] == 'Current real website' and restored['publishedAt'] == published['publishedAt'])
    check('unknown revision cannot be restored', staff.call('/cms-api.php?a=restore', {'page': 'home', 'expectedVersion': 4, 'revision': 'r-nonexistent', 'document': document})[0] == 404)
    bad_cases = [
        ('script text', lambda d: d['sections'][0]['elements']['e0001'].update(text='<script>alert(1)</script>')),
        ('script link', lambda d: d['sections'][0]['elements']['e0001'].update(href='javascript:alert(1)')),
        ('encoded traversal image', lambda d: d['sections'][0]['elements']['e0001'].update(src='/uploads/%2e%2e/outside.png')),
        ('CSS URL', lambda d: d['sections'][0].update(styles={'desktop': {'backgroundColor': 'url(https://example.invalid/x)'}})),
        ('arbitrary CSS property', lambda d: d['sections'][0].update(styles={'desktop': {'position': 'fixed'}})),
        ('raw HTML field', lambda d: d['sections'][0].update(html='<p>Injected</p>')),
        ('invented product record', lambda d: d['sections'][0].update(content={'products': [{'id': 1, 'price': 1}]})),
        ('unknown product reference', lambda d: d['sections'][0].update(content={'productIds': [9007199254740990]})),
        ('duplicate section identity', lambda d: d['sections'].append(copy.deepcopy(d['sections'][0]))),
        ('unknown page identity', lambda d: d.update(id='invented-page')),
        ('source from checkout workflow', lambda d: d['sections'][0].update(source='checkout:form')),
        ('forged native region', lambda d: d['sections'][0].update(region='footer')),
        ('raw gradient CSS', lambda d: d['sections'][0]['elements']['e0001'].update(effects={'desktop': {'gradient': {'enabled': True, 'start': 'red);background:url(https://bad.invalid)', 'end': '#fff'}}})),
        ('gradient invalid range', lambda d: d['sections'][0]['elements']['e0001'].update(effects={'desktop': {'gradient': {'angle': 361}}})),
        ('unbounded visual position', lambda d: d['sections'][0]['elements']['e0001'].update(effects={'mobile': {'position': {'x': 1001}}})),
        ('untyped visual position', lambda d: d['sections'][0]['elements']['e0001'].update(effects={'mobile': {'position': {'x': '20px'}}})),
        ('arbitrary transform effect', lambda d: d['sections'][0]['elements']['e0001'].update(effects={'desktop': {'transform': 'translate(10px)'}})),
        ('raw icon markup', lambda d: d['sections'][0]['elements']['a-icon'].update(icon='<svg onload=alert(1)>')),
        ('insecure video URL', lambda d: d['sections'][0]['elements']['a-video'].update(src='http://media.example.test/movie.mp4')),
        ('executable video URL', lambda d: d['sections'][0]['elements']['a-video'].update(src='javascript:alert(1)')),
        ('unsupported video page', lambda d: d['sections'][0]['elements']['a-video'].update(src='https://media.example.test/embed.html')),
        ('video path traversal', lambda d: d['sections'][0]['elements']['a-video'].update(src='/uploads/%2e%2e/outside.mp4')),
        ('unknown added parent', lambda d: d['sections'][0]['elements']['a-image'].update(parentId='missing')),
        ('leaf added parent', lambda d: d['sections'][0]['elements']['a-image'].update(parentId='a-text')),
        ('recursive added parent', lambda d: d['sections'][0]['elements']['a-container'].update(parentId='a-container')),
        ('mutual added parent cycle', lambda d: d['sections'][0]['elements'].update({'a-container': {'kind': 'container', 'added': True, 'parentId': 'a-second'}, 'a-second': {'kind': 'container', 'added': True, 'parentId': 'a-container'}})),
        ('added native identity collision', lambda d: d['sections'][0]['elements'].update({'eroot': {'kind': 'container', 'added': True, 'parentId': 'eroot'}})),
        ('native element reparenting', lambda d: d['sections'][0]['elements']['e0001'].update(parentId='a-container')),
        ('arbitrary inserted markup', lambda d: d['sections'][0]['elements']['a-text'].update(html='<b>Markup</b>')),
    ]
    for name, mutate in bad_cases:
        bad = copy.deepcopy(document)
        mutate(bad)
        check('reject ' + name, staff.call('/cms-api.php?a=save', {'page': 'home', 'expectedVersion': 4, 'document': bad})[0] == 422)
    status, media, _ = staff.call('/cms-media.php?a=list&pageSize=2')
    check('media inventory is paginated', status == 200 and len(media['items']) == 2 and media['total'] == 5 and media['hasMore'])
    check('media metadata requires CSRF', staff.call('/cms-media.php?a=update', {'url': '/uploads/unused.png', 'alt': 'Searchable alternative'}, token=False)[0] == 403)
    check('media alt metadata persists', staff.call('/cms-media.php?a=update', {'url': '/uploads/unused.png', 'alt': 'Searchable alternative'})[0] == 200)
    searched = staff.call('/cms-media.php?a=list&q=Searchable')[1]
    check('media search includes saved alt text', len(searched['items']) == 1 and searched['items'][0]['alt'] == 'Searchable alternative')
    for path in ('/images/bundled.png', '/uploads/in-product.png', '/uploads/in-native.png', '/uploads/in-revision.png'):
        check('protect referenced media ' + path, staff.call('/cms-media.php?a=delete', {'url': path})[0] == 409)
    for path in ('/uploads/../outside.png', '/uploads/%2e%2e/outside.png', '/uploads/%00.png', 'https://example.invalid/a.png'):
        check('reject media path ' + path, staff.call('/cms-media.php?a=delete', {'url': path})[0] in (404, 422))
    check('unused uploaded image can be deleted', staff.call('/cms-media.php?a=delete', {'url': '/uploads/unused.png'})[0] == 200 and not (SITE / 'uploads/unused.png').exists())
    # A separate page proves that an image referenced only by an old revision is protected.
    (SITE / 'uploads/revision-only.png').write_bytes(png)
    about = copy.deepcopy(document)
    about['id'] = 'about'
    about['sections'][0].update(id='about:copy', source='about:copy')
    about['sections'][0]['elements']['e0002'] = {'kind': 'image', 'name': 'Historical image', 'src': '/uploads/revision-only.png', 'alt': ''}
    status, first_about, _ = staff.call('/cms-api.php?a=save', {'page': 'about', 'expectedVersion': 0, 'document': about})
    check('second page has independent version history', status == 200 and first_about['version'] == 1)
    about['sections'][0]['elements'].pop('e0002')
    staff.call('/cms-api.php?a=save', {'page': 'about', 'expectedVersion': 1, 'document': about})
    check('image referenced only by revision cannot be deleted', staff.call('/cms-media.php?a=delete', {'url': '/uploads/revision-only.png'})[0] == 409)
    for version in range(2, 33):
        about['sections'][0]['elements']['e0001']['text'] = 'Revision ' + str(version)
        status, _, _ = staff.call('/cms-api.php?a=save', {'page': 'about', 'expectedVersion': version, 'document': about})
        if status != 200:
            raise AssertionError('bounded revision creation failed')
    remaining = staff.call('/cms-api.php?a=revisions&page=about')[1]['revisions']
    check('retained revisions and snapshot files are bounded', len(remaining) == 30 and len(list((DATA / 'cms-revisions/about').glob('*.json'))) == 30)
    check('expired revision releases unused uploaded image', staff.call('/cms-media.php?a=delete', {'url': '/uploads/revision-only.png'})[0] == 200)
    check('CMS operations preserve every commerce store', all((DATA / name).read_bytes() == before for name, before in commerce_before.items()))
    check('direct helper access is denied', anonymous.call('/cm-cms.php')[0] == 404)
    stored = json.loads((DATA / 'cms-pages/home.json').read_text())
    check('CMS data is outside document root', DATA != SITE and not (SITE / 'cms-pages').exists() and stored['version'] == 4)
    check('public page reads do not load revision documents', all('document' not in r for r in stored['revisions']) and len(list((DATA / 'cms-revisions/home').glob('*.json'))) == 4)
    # The same existing upload endpoint remains usable with the same staff cookie.
    boundary = 'CMFixtureUploadBoundary'
    upload = ('--' + boundary + '\r\nContent-Disposition: form-data; name="image"; filename="pixel.png"\r\nContent-Type: image/png\r\n\r\n').encode() + png + ('\r\n--' + boundary + '--\r\n').encode()
    status, uploaded, _ = staff.call('/upload-api.php', raw=upload, content_type='multipart/form-data; boundary=' + boundary)
    check('existing raster upload remains compatible', status == 200 and uploaded['url'].startswith('uploads/'))
    check('new existing-system upload appears in library', any(item['url'].lstrip('/') == uploaded['url'] for item in staff.call('/cms-media.php?a=list')[1]['items']))
    # A loaded empty style map must remain an object that the editor can modify.
    # This specifically guards PHP decoding {} as [] and losing named JS edits.
    empty_maps = {'schemaVersion': 1, 'id': 'contact', 'seo': {}, 'design': {}, 'sections': [{
        'id': 's-empty-maps', 'type': 'custom', 'name': 'Empty maps', 'region': 'main',
        'content': {'items': [], 'entries': [], 'productIds': []},
        'styles': {'desktop': {}, 'tablet': {}, 'mobile': {}}, 'effects': {'desktop': {}, 'tablet': {}, 'mobile': {}},
        'hover': {}, 'animation': {}, 'elements': {'a-text': {'kind': 'text', 'name': 'Editable text', 'text': 'Edit me', 'added': True,
        'parentId': 'eroot', 'styles': {'desktop': {}, 'tablet': {}, 'mobile': {}}, 'effects': {}, 'hover': {}, 'animation': {}}}}]}
    check('save accepts empty visual maps', staff.call('/cms-api.php?a=save', {'page': 'contact', 'expectedVersion': 0, 'document': empty_maps})[0] == 200)
    loaded_maps = staff.call('/cms-api.php?a=load&page=contact')[1]['draft']
    loaded_section = loaded_maps['sections'][0]
    check('load preserves editable map objects and real list arrays', isinstance(loaded_section['styles']['desktop'], dict) and isinstance(loaded_section['elements']['a-text']['styles']['mobile'], dict) and isinstance(loaded_section['effects']['desktop'], dict) and isinstance(loaded_section['hover'], dict) and isinstance(loaded_maps['seo'], dict) and isinstance(loaded_maps['design'], dict) and all(isinstance(loaded_section['content'][key], list) for key in ('items', 'entries', 'productIds')))
    loaded_section['elements']['a-text']['styles']['desktop'].update(fontSize='36px', color='#aa2277')
    loaded_section['elements']['a-text']['styles']['mobile']['fontSize'] = '22px'
    check('editing loaded empty responsive map saves normally', staff.call('/cms-api.php?a=save', {'page': 'contact', 'expectedVersion': 1, 'document': loaded_maps})[0] == 200)
    staff.call('/cms-api.php?a=publish', {'page': 'contact', 'expectedVersion': 2})
    public_maps = anonymous.call('/cms-api.php?a=published&page=contact')[1]['published']
    check('edited empty maps survive publication and reload', public_maps['sections'][0]['elements']['a-text']['styles']['desktop'] == {'fontSize': '36px', 'color': '#aa2277'} and public_maps['sections'][0]['elements']['a-text']['styles']['mobile']['fontSize'] == '22px' and isinstance(public_maps['sections'][0]['styles']['tablet'], dict))
    # Existing malformed-but-readable empty maps are repaired at the read boundary.
    legacy_path = DATA / 'cms-pages/contact.json'
    legacy_record = json.loads(legacy_path.read_text())
    legacy_record['draft']['sections'][0]['elements']['a-text']['styles']['tablet'] = []
    legacy_record['draft']['sections'][0]['effects']['tablet'] = {'gradient': [], 'position': []}
    legacy_path.write_text(json.dumps(legacy_record), encoding='utf-8')
    repaired = staff.call('/cms-api.php?a=load&page=contact')[1]['draft']['sections'][0]
    check('legacy empty maps normalize without changing real lists', isinstance(repaired['elements']['a-text']['styles']['tablet'], dict) and isinstance(repaired['effects']['tablet']['gradient'], dict) and isinstance(repaired['effects']['tablet']['position'], dict) and isinstance(repaired['content']['productIds'], list))
    model_regression = subprocess.run(['node', '--input-type=module', '-e', '''
import assert from 'node:assert/strict';
import {clone,fingerprint,History} from './visual-editor/js/cms-model.js';
const old = {sections:[{styles:{desktop:[],tablet:[],mobile:[]},effects:[],hover:[],animation:[],elements:[],content:{items:[],entries:[],productIds:[]}}],seo:[],design:[],productOrders:[]};
const doc = clone(old);
doc.sections[0].styles.desktop.fontSize = '36px';
assert.notEqual(fingerprint(old),fingerprint(doc));
assert.equal(JSON.parse(fingerprint(doc)).sections[0].styles.desktop.fontSize,'36px');
assert.deepEqual(doc.sections[0].content,{items:[],entries:[],productIds:[]});
old.sections[0].styles.desktop.color = '#aa2277';
assert.equal(clone(old).sections[0].styles.desktop.color,'#aa2277');
assert.equal(fingerprint({styles:{desktop:[]}}),fingerprint({styles:{desktop:{}}}));
assert.deepEqual(clone(old).productOrders,{});
const loaded = clone(JSON.parse(JSON.stringify({productOrders:{all:[3,1,2],rockets:[7,6],sparklers:[]}})));
const history = new History(); history.commit(loaded); loaded.productOrders.rockets.reverse();
const undone = history.undo(loaded);
assert.deepEqual(undone.productOrders,{all:[3,1,2],rockets:[7,6],sparklers:[]});
assert.deepEqual(history.redo(undone).productOrders,{all:[3,1,2],rockets:[6,7],sparklers:[]});
'''], cwd=ROOT, capture_output=True, text=True)
    check('editor clone and dirty comparison preserve legacy-map edits', model_regression.returncode == 0)
    # Product ordering is presentation data in the same Products draft. It never
    # writes names, prices, stock, images, IDs, SKUs or category membership.
    category_products = {c['id']: [p['id'] for p in seed['products'] if c['id'] in p.get('cats', [])] for c in seed['categories']}
    order_scopes = [key for key, ids in category_products.items() if len(ids) >= 3]
    scope_a, scope_b = order_scopes[:2]
    all_order = [p['id'] for p in seed['products'][:6]][::-1]
    orders = {'all': all_order, scope_a: category_products[scope_a][:3][::-1], scope_b: category_products[scope_b][:3]}
    order_doc = {'schemaVersion': 1, 'id': 'products', 'sections': [], 'seo': {}, 'design': {}, 'productOrders': orders}
    order_request = {'page': 'products', 'expectedVersion': 0, 'document': order_doc}
    check('anonymous product ordering save denied', anonymous.call('/cms-api.php?a=save', order_request)[0] == 401)
    check('customer product ordering publish denied', customer.call('/cms-api.php?a=publish', order_request)[0] == 401)
    check('product ordering save requires CSRF', staff.call('/cms-api.php?a=save', order_request, token=False)[0] == 403)
    check('product ordering save requires same origin', staff.call('/cms-api.php?a=save', order_request, origin='https://example.invalid')[0] == 403)
    check('product ordering cannot mutate through GET', staff.call('/cms-api.php?a=save&page=products')[0] == 405)
    status, order_saved, _ = staff.call('/cms-api.php?a=save', order_request)
    check('independent all and category orders persist in draft', status == 200 and order_saved['draft']['productOrders'] == orders)
    check('product ordering draft remains private', anonymous.call('/cms-api.php?a=published&page=products')[1]['published'] is None)
    status, order_published, _ = staff.call('/cms-api.php?a=publish', {'page': 'products', 'expectedVersion': 1})
    check('publish exposes exact saved order lists', status == 200 and anonymous.call('/cms-api.php?a=published&page=products')[1]['published']['productOrders'] == orders)
    loaded_order = staff.call('/cms-api.php?a=load&page=products')[1]['draft']
    loaded_order['productOrders'][scope_a].reverse()
    status, scoped_saved, _ = staff.call('/cms-api.php?a=save', {'page': 'products', 'expectedVersion': 2, 'document': loaded_order})
    check('reordering one category leaves all and other categories unchanged', status == 200 and scoped_saved['draft']['productOrders']['all'] == orders['all'] and scoped_saved['draft']['productOrders'][scope_b] == orders[scope_b] and scoped_saved['draft']['productOrders'][scope_a] != orders[scope_a])
    check('category reorder does not change public order before publish', anonymous.call('/cms-api.php?a=published&page=products')[1]['published']['productOrders'] == orders)
    check('stale ordering writes cannot overwrite another edit', staff.call('/cms-api.php?a=save', {'page': 'products', 'expectedVersion': 2, 'document': order_doc})[0] == 409)
    check('stale ordering publish cannot replace live order', staff.call('/cms-api.php?a=publish', {'page': 'products', 'expectedVersion': 2})[0] == 409)
    staff.call('/cms-api.php?a=publish', {'page': 'products', 'expectedVersion': 3})
    revised_orders = anonymous.call('/cms-api.php?a=published&page=products')[1]['published']['productOrders']
    check('publishing category reorder preserves the other scope orders', revised_orders == loaded_order['productOrders'])
    outside_category = next(p['id'] for p in seed['products'] if scope_a not in p.get('cats', []))
    invalid_orders = [
        ('unknown scope', {'invented-category': [all_order[0]]}),
        ('prototype scope', {'__proto__': [all_order[0]]}),
        ('path scope', {'../products': [all_order[0]]}),
        ('non-object ordering', [all_order[0]]),
        ('non-list scope', {'all': {'first': all_order[0]}}),
        ('duplicate product', {'all': [all_order[0], all_order[0]]}),
        ('string product ID', {'all': [str(all_order[0])]}),
        ('fractional product ID', {'all': [1.5]}),
        ('boolean product ID', {'all': [True]}),
        ('unsafe product ID', {'all': [9007199254740992]}),
        ('unknown product', {'all': [9007199254740990]}),
        ('negative product', {'all': [-1]}),
        ('zero product', {'all': [0]}),
        ('product record injection', {'all': [{'id': all_order[0], 'price': 1}]}),
        ('nested product ID', {'all': [[all_order[0]]]}),
        ('category membership mismatch', {scope_a: [outside_category]}),
        ('oversized scope list', {'all': [all_order[0]] * 5001}),
    ]
    for label, invalid_order in invalid_orders:
        invalid_doc = copy.deepcopy(order_doc); invalid_doc['productOrders'] = invalid_order
        check('reject product order ' + label, staff.call('/cms-api.php?a=save', {'page': 'products', 'expectedVersion': 4, 'document': invalid_doc})[0] == 422)
    invalid_page = copy.deepcopy(order_doc); invalid_page['id'] = 'home'
    check('product ordering cannot be attached to another template', staff.call('/cms-api.php?a=save', {'page': 'home', 'expectedVersion': 4, 'document': invalid_page})[0] == 422)
    product_store_path = DATA / 'products.json'; product_store_before = product_store_path.read_bytes()
    disabled_state = json.loads(product_store_before)
    disabled_state['productOverrides'].setdefault(str(all_order[0]), {})['disabled'] = True
    product_store_path.write_text(json.dumps(disabled_state), encoding='utf-8')
    try:
        check('new ordering rejects disabled catalog products', staff.call('/cms-api.php?a=save', {'page': 'products', 'expectedVersion': 4, 'document': order_doc})[0] == 422)
    finally:
        product_store_path.write_bytes(product_store_before)
    clear_scope = copy.deepcopy(loaded_order); clear_scope['productOrders'][scope_a] = []
    cleared = staff.call('/cms-api.php?a=save', {'page': 'products', 'expectedVersion': 4, 'document': clear_scope})[1]['draft']['productOrders']
    check('empty category order remains a list and does not clear all products', cleared[scope_a] == [] and cleared['all'] == all_order)
    empty_order_doc = copy.deepcopy(order_doc); empty_order_doc['productOrders'] = {}
    staff.call('/cms-api.php?a=save', {'page': 'products', 'expectedVersion': 5, 'document': empty_order_doc})
    check('empty product ordering map reloads as an editable object', isinstance(staff.call('/cms-api.php?a=load&page=products')[1]['draft']['productOrders'], dict))
    order_revisions = staff.call('/cms-api.php?a=revisions&page=products')[1]['revisions']
    restored_order = staff.call('/cms-api.php?a=restore', {'page': 'products', 'expectedVersion': 6, 'revision': order_revisions[-1]['id']})[1]
    check('restoring ordering history changes draft without republishing', restored_order['draft']['productOrders'] == orders and restored_order['published']['productOrders'] == revised_orders)
    check('ordering operations leave all canonical commerce data byte-identical', all((DATA / name).read_bytes() == before for name, before in commerce_before.items()))
    create_body = {'name': 'About "Us" & $0', 'slug': 'about-us'}
    check('anonymous page creation denied', anonymous.call('/cms-api.php?a=page-create', create_body)[0] == 401)
    check('customer page creation denied', customer.call('/cms-api.php?a=page-create', create_body)[0] == 401)
    check('page creation requires CSRF', staff.call('/cms-api.php?a=page-create', create_body, token=False)[0] == 403)
    check('page creation requires same origin', staff.call('/cms-api.php?a=page-create', create_body, origin='https://example.invalid')[0] == 403)
    for bad_slug in ('checkout', 'products', 'images', 'visual-editor', '../escape', 'a%2fb', 'about us', 'BadCase'):
        check('unsafe or reserved slug rejected ' + bad_slug, staff.call('/cms-api.php?a=page-create', {'name': 'Page', 'slug': bad_slug})[0] == 422)
    status, created, _ = staff.call('/cms-api.php?a=page-create', create_body)
    custom_id = created.get('page', '')
    check('custom page gets stable generated identity and real URL', status == 201 and custom_id.startswith('custom-') and len(custom_id) == 39 and created['pageInfo']['path'] == '/about-us' and created['pageInfo']['status'] == 'draft')
    check('custom starter references canonical or native fallback chrome with typed content', created['draft']['templatePage'] == 'custom' and 'header' in created['globals'] and any(s['type'] == 'text' for s in created['draft']['sections']))
    check('slug collision rejected atomically', staff.call('/cms-api.php?a=page-create', create_body)[0] == 409)
    check('custom draft has no public HTML route', anonymous.call('/cms-page.php?slug=about-us')[0] == 404)
    check('custom draft has no public API document', anonymous.call('/cms-api.php?a=published&page=' + custom_id)[0] == 404)
    status, custom_preview, _ = staff.call('/visual-preview.php?page=' + custom_id)
    check('custom draft preview has escaped fixed context', status == 200 and 'name="cm-page-id" content="' + custom_id + '"' in custom_preview and 'About &quot;Us&quot; &amp; $0' in custom_preview and 'name="cm-page-template" content="custom"' in custom_preview)
    draft = copy.deepcopy(created['draft'])
    draft['seo'] = {'title': 'A "quoted" & safe title $0', 'description': 'Safe & private draft description', 'canonical': 'https://crackersmela.com/about-us'}
    typed = next(s for s in draft['sections'] if s['type'] == 'text')
    typed['effects'] = {'desktop': {'gradient': {'enabled': True, 'start': '#6a1b9a', 'end': '#ec407a', 'angle': 120}, 'position': {'x': 10, 'y': -20, 'scale': 1.4}, 'backgroundImage': '/uploads/in-native.png'}, 'mobile': {'position': {'x': 0, 'y': 5, 'scale': .8}}}
    # Standalone simple sections and children share the same typed save/publish contract.
    for kind in ('heading', 'image', 'button', 'video', 'divider', 'icon', 'container'):
        content = {'heading': 'A heading'} if kind == 'heading' else {'src': '/uploads/celebration.mp4'} if kind == 'video' else {'icon': 'gift'} if kind == 'icon' else {}
        draft['sections'].insert(-1, {'id': 's-simple-' + kind, 'type': kind, 'region': 'main', 'name': kind.title(), 'content': content})
    status, effect_saved, _ = staff.call('/cms-api.php?a=save', {'page': custom_id, 'expectedVersion': 1, 'document': draft})
    check('responsive gradients and positioning persist', status == 200 and next(s for s in effect_saved['draft']['sections'] if s['type'] == 'text')['effects']['desktop']['position']['y'] == -20)
    check('all standalone simple sections persist', set(s['type'] for s in effect_saved['draft']['sections']) >= {'heading', 'image', 'button', 'video', 'divider', 'icon', 'container'})
    check('local uploaded video path persists safely', next(s for s in effect_saved['draft']['sections'] if s['type'] == 'video')['content']['src'] == '/uploads/celebration.mp4')
    for label, change in (
        ('gradient code', lambda d: next(s for s in d['sections'] if s['type'] == 'text')['effects']['desktop']['gradient'].update(start='url(https://example.invalid)')),
        ('unbounded scale', lambda d: next(s for s in d['sections'] if s['type'] == 'text')['effects']['desktop']['position'].update(scale=99)),
        ('script background', lambda d: next(s for s in d['sections'] if s['type'] == 'text')['effects']['desktop'].update(backgroundImage='javascript:alert(1)')),
        ('forged source template', lambda d: d.update(templatePage='home')),
    ):
        invalid = copy.deepcopy(draft); change(invalid)
        check('reject ' + label, staff.call('/cms-api.php?a=save', {'page': custom_id, 'expectedVersion': 2, 'document': invalid})[0] == 422)
    status, custom_live, _ = staff.call('/cms-api.php?a=publish', {'page': custom_id, 'expectedVersion': 2})
    check('custom publishing changes lifecycle', status == 200 and custom_live['pageInfo']['status'] == 'published')
    status, html, _ = anonymous.call('/cms-page.php?slug=about-us')
    check('published custom URL serves actual template and escaped SEO', status == 200 and '<title>A &quot;quoted&quot; &amp; safe title $0</title>' in html and 'js/app.js?v=current' in html and '"@type":"Store"' in html)
    status, clean_html, _ = anonymous.call('/about-us?slug=missing-page')
    check('clean page path cannot be overridden by query slug', status == 200 and 'A &quot;quoted&quot; &amp; safe title $0' in clean_html)
    check('unknown clean path cannot borrow a published query slug', anonymous.call('/missing-page?slug=about-us')[0] == 404)
    check('trailing-slash clean route uses the same published page', anonymous.call('/about-us/?slug=missing-page')[0] == 200)
    check('custom sitemap contains published page', '/about-us</loc>' in anonymous.call('/cms-sitemap.php', host='crackersmela.com')[1])
    check('stale page rename denied', staff.call('/cms-api.php?a=page-update', {'page': custom_id, 'expectedVersion': 1, 'name': 'Renamed'})[0] == 409)
    renamed = staff.call('/cms-api.php?a=page-update', {'page': custom_id, 'expectedVersion': 3, 'name': 'Renamed page'})[1]
    check('rename retains original URL', renamed['version'] == 4 and renamed['pageInfo']['path'] == '/about-us' and renamed['pageInfo']['name'] == 'Renamed page')
    for action in ('page-delete', 'page-unpublish', 'page-duplicate'):
        stale = {'page': custom_id, 'expectedVersion': 3}
        if action == 'page-duplicate':
            stale.update(name='Stale duplicate', slug='stale-copy')
        check('stale lifecycle change denied ' + action, staff.call('/cms-api.php?a=' + action, stale)[0] == 409)
    check('rejected lifecycle changes preserve live publication', anonymous.call('/cms-page.php?slug=about-us')[0] == 200)
    check('unpublish is a real lifecycle change', staff.call('/cms-api.php?a=page-unpublish', {'page': custom_id, 'expectedVersion': 4})[0] == 200)
    check('unpublished clean page and public API return 404', anonymous.call('/cms-page.php?slug=about-us')[0] == 404 and anonymous.call('/cms-api.php?a=published&page=' + custom_id)[0] == 404)
    check('unpublished clean path cannot borrow another live page', anonymous.call('/about-us?slug=contact')[0] == 404)
    check('unpublished page disappears from sitemap', '/about-us</loc>' not in anonymous.call('/cms-sitemap.php', host='crackersmela.com')[1])
    check('unpublished draft stays editable', staff.call('/cms-api.php?a=load&page=' + custom_id)[1]['draft']['id'] == custom_id)
    staff.call('/cms-api.php?a=publish', {'page': custom_id, 'expectedVersion': 5})
    status, duplicate, _ = staff.call('/cms-api.php?a=page-duplicate', {'page': custom_id, 'expectedVersion': 6, 'name': 'Page copy', 'slug': 'page-copy'})
    check('duplicate is independent draft with own ID', status == 201 and duplicate['page'] != custom_id and duplicate['draft']['id'] == duplicate['page'] and duplicate['pageInfo']['status'] == 'draft')
    check('duplicate canonical belongs to its own URL', duplicate['draft']['seo']['canonical'] == 'https://crackersmela.com/page-copy')
    copy_draft = copy.deepcopy(duplicate['draft'])
    next(s for s in copy_draft['sections'] if s['type'] == 'text')['content']['heading'] = 'Independent copied page'
    status, copy_saved, _ = staff.call('/cms-api.php?a=save', {'page': duplicate['page'], 'expectedVersion': 1, 'document': copy_draft})
    original = staff.call('/cms-api.php?a=load&page=' + custom_id)[1]
    check('editing duplicate cannot mutate source draft or live page', status == 200 and next(s for s in original['draft']['sections'] if s['type'] == 'text')['content']['heading'] != 'Independent copied page' and original['published'] == custom_live['published'])
    check('duplicate stays private until explicitly published', anonymous.call('/cms-page.php?slug=page-copy')[0] == 404 and copy_saved['published'] is None)
    check('native page duplicate retains actual source template', (native_copy := staff.call('/cms-api.php?a=page-duplicate', {'page': 'about', 'expectedVersion': 33, 'name': 'Native copy', 'slug': 'native-copy'})[1])['draft']['templatePage'] == 'about' and native_copy['draft']['sections'][0]['source'] == 'about:copy')
    for protected in ('home', 'products', 'product', 'price-list'):
        version = staff.call('/cms-api.php?a=load&page=' + protected)[1]['version']
        for action in ('page-delete', 'page-unpublish'):
            check('protect commerce page ' + protected + ' ' + action, staff.call('/cms-api.php?a=' + action, {'page': protected, 'expectedVersion': version})[0] == 409)
    check('editorial page unpublish permitted', staff.call('/cms-api.php?a=page-unpublish', {'page': 'about', 'expectedVersion': 33})[0] == 200)
    check('editorial clean route is gated by publication', anonymous.call('/cms-page.php?slug=about')[0] == 404)
    check('editorial hash API supplies unavailable status', anonymous.call('/cms-api.php?a=published&page=about')[0] == 404)
    check('page deletion persists tombstone', staff.call('/cms-api.php?a=page-delete', {'page': custom_id, 'expectedVersion': 6})[1]['pageInfo']['status'] == 'deleted')
    check('deleted page not listed or public', custom_id not in [p['id'] for p in staff.call('/cms-api.php?a=pages')[1]['pages']] and anonymous.call('/cms-page.php?slug=about-us')[0] == 404)
    check('deleted page cannot be silently republished', staff.call('/cms-api.php?a=publish', {'page': custom_id, 'expectedVersion': 7})[0] == 404)
    check('deleted page cannot be silently saved', staff.call('/cms-api.php?a=save', {'page': custom_id, 'expectedVersion': 7, 'document': draft})[0] == 404)
    check('deleted page cannot be duplicated', staff.call('/cms-api.php?a=page-duplicate', {'page': custom_id, 'expectedVersion': 7, 'name': 'Resurrected', 'slug': 'resurrected-copy'})[0] == 404)
    responsive_doc = {'schemaVersion': 1, 'id': 'home', 'sections': [{'id':'home:responsive-test','type':'productGrid','name':'Responsive products','content':{'columns':4},'styles':{'desktop':{'paddingTop':'20px'}},'overrides':{'desktop':{'styles':{'paddingTop':'32px'},'content':{'columns':5}},'tablet':{'hidden':True},'mobile':{'styles':{'width':'100%'},'content':{'columns':2}}}}], 'productOrders': {'section:home:responsive-test':[product_id]}}
    responsive_version = staff.call('/cms-api.php?a=load&page=home')[1]['version']
    status, responsive_saved, _ = staff.call('/cms-api.php?a=save', {'page':'home','expectedVersion':responsive_version,'document':responsive_doc})
    check('exact-device presentation and Home section ordering save together', status == 200)
    check('legacy base and three independent overrides survive save', responsive_saved['draft']['sections'][0]['styles']['desktop']['paddingTop'] == '20px' and responsive_saved['draft']['sections'][0]['overrides'] == responsive_doc['sections'][0]['overrides'])
    for invalid in [{'desktop':{'styles':{'width':'expression(alert(1))'}}}, {'watch':{'hidden':True}}, {'mobile':{'content':{'productIds':[product_id]}}}]:
        rejected = copy.deepcopy(responsive_doc); rejected['sections'][0]['overrides'] = invalid
        check('invalid responsive presentation rejected '+str(invalid), staff.call('/cms-api.php?a=save', {'page':'home','expectedVersion':responsive_version+1,'document':rejected})[0] == 422)
    dangling = copy.deepcopy(responsive_doc); dangling['productOrders'] = {'section:missing':[product_id]}
    check('ordering an absent Home section is rejected', staff.call('/cms-api.php?a=save', {'page':'home','expectedVersion':responsive_version+1,'document':dangling})[0] == 422)
    staff.call('/cms-api.php?a=publish', {'page':'home','expectedVersion':responsive_version+1})
    check('published responsive presentation matches saved draft', anonymous.call('/cms-api.php?a=published&page=home')[1]['published']['sections'][0]['overrides'] == responsive_doc['sections'][0]['overrides'])
    promo_doc = {'schemaVersion': 1, 'id': 'home', 'sections': [
        {'id': 'global:promo', 'source': 'global:promo', 'type': 'native', 'region': 'header', 'name': 'Promo Bar',
         'content': {'promoMessages': [{'id': 'promo-one', 'text': 'Delivery above \u20b92,500'},
                                       {'id': 'promo-two', 'text': 'COD + UPI Available', 'enabled': False, 'icon': 'cash'}],
                     'showPromoIcons': True},
         'overrides': {'desktop': {'styles': {'fontSize': '18px', 'paddingTop': '10px'}},
                       'tablet': {'content': {'showPromoIcons': True}},
                       'mobile': {'styles': {'fontSize': '12px'}, 'content': {'showPromoIcons': False}}}}]}
    promo_version = staff.call('/cms-api.php?a=load&page=home')[1]['version']
    before_promo_public = anonymous.call('/cms-api.php?a=published&page=home')[1]['published']
    status, promo_saved, _ = staff.call('/cms-api.php?a=save', {'page': 'home', 'expectedVersion': promo_version, 'expectedGlobalVersion': staff.call('/cms-api.php?a=load&page=home')[1]['globals']['version'], 'document': promo_doc})
    check('Promo Bar messages and exact-device icon presentation save through existing CMS', status == 200)
    clean_promo = promo_saved['draft']['sections'][0]
    check('Promo message defaults are explicit and message order is preserved', clean_promo['content']['promoMessages'] == [
        {'id': 'promo-one', 'text': 'Delivery above \u20b92,500', 'enabled': True, 'icon': 'auto'},
        {'id': 'promo-two', 'text': 'COD + UPI Available', 'enabled': False, 'icon': 'cash'}])
    check('Promo shared visibility and exact-device overrides survive validation unchanged', clean_promo['content']['showPromoIcons'] is True and clean_promo['overrides'] == promo_doc['sections'][0]['overrides'])
    check('Promo draft edits do not alter published content', anonymous.call('/cms-api.php?a=published&page=home')[1]['published'] == before_promo_public)
    reloaded_promo = staff.call('/cms-api.php?a=load&page=home')[1]
    check('Promo message data survives editor reload', reloaded_promo['draft']['sections'][0] == clean_promo)
    promo_version = promo_saved['version']
    invalid_promos = []
    for label, message in [
        ('invalid icon', {'icon': 'arbitrary-svg'}), ('invalid ID', {'id': '../outside'}),
        ('HTML message', {'text': '<script>alert(1)</script>'}), ('long message', {'text': 'x' * 301}),
        ('non-boolean enabled', {'enabled': 'false'}), ('null enabled', {'enabled': None}),
        ('null icon', {'icon': None}), ('unknown message property', {'href': 'javascript:alert(1)'})]:
        invalid = copy.deepcopy(promo_doc)
        invalid['sections'][0]['content']['promoMessages'][0].update(message)
        invalid_promos.append((label, invalid))
    invalid = copy.deepcopy(promo_doc); invalid['sections'][0]['content']['promoMessages'][1]['id'] = 'promo-one'
    invalid_promos.append(('duplicate message ID', invalid))
    invalid = copy.deepcopy(promo_doc); invalid['sections'][0]['content']['promoMessages'] = [{'id': 'm-' + str(i), 'text': 'Message'} for i in range(21)]
    invalid_promos.append(('too many messages', invalid))
    invalid = copy.deepcopy(promo_doc); invalid['sections'][0]['content']['promoMessages'] = 'Message'
    invalid_promos.append(('non-list messages', invalid))
    invalid = copy.deepcopy(promo_doc); invalid['sections'][0]['content']['showPromoIcons'] = 'false'
    invalid_promos.append(('non-boolean shared icon visibility', invalid))
    invalid = copy.deepcopy(promo_doc); invalid['sections'][0]['source'] = 'global:header'
    invalid_promos.append(('messages on unrelated native source', invalid))
    invalid = copy.deepcopy(promo_doc); invalid['sections'][0]['type'] = 'text'
    invalid_promos.append(('messages on non-native section', invalid))
    invalid = copy.deepcopy(promo_doc); invalid['sections'][0]['overrides']['mobile']['content']['promoMessages'] = []
    invalid_promos.append(('message content in device override', invalid))
    invalid = copy.deepcopy(promo_doc); invalid['sections'][0]['overrides']['mobile']['content']['showPromoIcons'] = 0
    invalid_promos.append(('non-boolean device icon visibility', invalid))
    invalid = copy.deepcopy(promo_doc); invalid['sections'][0]['content'] = {'showPromoIcons': True}; invalid['sections'][0]['source'] = 'global:header'
    invalid_promos.append(('icon visibility on unrelated native source', invalid))
    invalid = copy.deepcopy(promo_doc); invalid['sections'][0]['content'] = {}; invalid['sections'][0]['source'] = 'global:header'
    invalid_promos.append(('device icon visibility on unrelated native source', invalid))
    invalid = copy.deepcopy(promo_doc); invalid['sections'][0]['elements'] = {'e0001': {'kind': 'text', 'text': 'Safe', 'overrides': {'mobile': {'content': {'showPromoIcons': False}}}}}
    invalid_promos.append(('device icon visibility on element', invalid))
    for label, invalid in invalid_promos:
        check('Promo rejects ' + label, staff.call('/cms-api.php?a=save', {'page': 'home', 'expectedVersion': promo_version, 'expectedGlobalVersion': staff.call('/cms-api.php?a=load&page=home')[1]['globals']['version'], 'document': invalid})[0] == 422)
    check('Rejected Promo data never changes saved draft or version', staff.call('/cms-api.php?a=load&page=home')[1] == reloaded_promo)
    status, promo_published, _ = staff.call('/cms-api.php?a=publish', {'page': 'home', 'expectedVersion': promo_version, 'expectedGlobalVersion': staff.call('/cms-api.php?a=load&page=home')[1]['globals']['version']})
    check('Promo content publishes through existing workflow', status == 200 and promo_published['published']['sections'][0] == clean_promo)
    status, public_promo, _ = anonymous.call('/cms-api.php?a=published&page=home')
    check('Public Promo response contains published content without private draft', status == 200 and public_promo['published']['sections'][0] == clean_promo and 'draft' not in public_promo)
    promo_version = promo_published['version']
    empty_promo = copy.deepcopy(promo_doc); empty_promo['sections'][0]['content']['promoMessages'] = []
    status, empty_saved, _ = staff.call('/cms-api.php?a=save', {'page': 'home', 'expectedVersion': promo_version, 'expectedGlobalVersion': staff.call('/cms-api.php?a=load&page=home')[1]['globals']['version'], 'document': empty_promo})
    check('Empty Promo message list is preserved as intentional empty content', status == 200 and empty_saved['draft']['sections'][0]['content']['promoMessages'] == [])
    status, empty_published, _ = staff.call('/cms-api.php?a=publish', {'page': 'home', 'expectedGlobalVersion': empty_saved['globals']['version'], 'expectedVersion': empty_saved['version']})
    check('Explicit empty Promo list remains a list after publication', status == 200 and anonymous.call('/cms-api.php?a=published&page=home')[1]['published']['sections'][0]['content']['promoMessages'] == [])
    legacy_promo = copy.deepcopy(promo_doc); legacy_promo['sections'][0]['content'] = {}; legacy_promo['sections'][0].pop('overrides')
    status, legacy_saved, _ = staff.call('/cms-api.php?a=save', {'page': 'home', 'expectedGlobalVersion': empty_published['globals']['version'], 'expectedVersion': empty_published['version'], 'document': legacy_promo})
    check('Missing Promo messages remain missing for original storefront fallback', status == 200 and 'promoMessages' not in legacy_saved['draft']['sections'][0]['content'])
    all_icons = copy.deepcopy(promo_doc); all_icons['sections'][0]['content']['promoMessages'] = [{'id': 'icon-' + icon, 'text': icon, 'icon': icon} for icon in ['auto', 'tag', 'truck', 'shield', 'cash', 'bolt', 'none']]
    status, icons_saved, _ = staff.call('/cms-api.php?a=save', {'page': 'home', 'expectedGlobalVersion': legacy_saved['globals']['version'], 'expectedVersion': legacy_saved['version'], 'document': all_icons})
    check('Every supported Promo icon survives validation', status == 200 and [m['icon'] for m in icons_saved['draft']['sections'][0]['content']['promoMessages']] == ['auto', 'tag', 'truck', 'shield', 'cash', 'bolt', 'none'])
    check('page CRUD leaves commerce stores unchanged', all((DATA / name).read_bytes() == before for name, before in commerce_before.items()))
    for bad_slug in ('../outside', '%2e%2e', 'unknown-clean-page'):
        check('public dynamic route rejects ' + bad_slug, anonymous.call('/cms-page.php?slug=' + bad_slug)[0] == 404)
    print(json.dumps({'passed': sum(r['pass'] for r in results), 'total': len(results), 'fixtureOnly': True}, indent=2))
finally:
    server.terminate()
    try:
        server.wait(timeout=10)
    except subprocess.TimeoutExpired:
        server.kill()
    log.close()
    diagnostic = (FIXTURE / 'server.log').read_text(encoding='utf-8', errors='replace')
    report = {'fixtureOnly': True, 'passed': sum(r['pass'] for r in results), 'total': len(results), 'results': results,
              'phpDiagnostics': any(word in diagnostic for word in ('PHP Warning', 'PHP Fatal', 'PHP Notice', 'PHP Parse')), 'serverStopped': server.poll() is not None}
    (ROOT / 'audit/cms-backend-test-results.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
