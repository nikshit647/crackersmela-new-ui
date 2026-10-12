"""Global chrome persistence, migration, concurrency and rollback in isolated real PHP."""
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
RELEASE = ROOT / 'audit-evidence/production-release'
FIXTURE = Path(tempfile.mkdtemp(prefix='cms-global-chrome-', dir=ROOT / 'audit-evidence'))
SITE, DATA, SESSIONS = [FIXTURE / name for name in ('site', 'data', 'sessions')]
for directory in (SITE, DATA, SESSIONS, SITE / 'js'):
    directory.mkdir(parents=True, exist_ok=True)
for name in ('cm-security.php', 'cm-commerce.php', 'cm-google.php', 'staff-auth.php', 'js/products-data.js'):
    shutil.copyfile(RELEASE / name, SITE / name)
for name in ('cm-cms.php', 'cms-api.php'):
    shutil.copyfile(ROOT / 'visual-editor' / name, SITE / name)
env = os.environ.copy()
env.update(CM_DATA_DIR=str(DATA), CM_STAFF_CONFIG=str(FIXTURE / 'staff.php'), CM_DISABLE_MAIL='1',
           EMAIL_ENABLED='false', CM_EMAIL_TRANSPORT='fake', CM_TEST_PASSWORD='Isolated shared navigation QA 2026!')
hashed = subprocess.check_output([str(PHP), '-r', "echo password_hash(getenv('CM_TEST_PASSWORD'), PASSWORD_DEFAULT);"], env=env, text=True).strip()
(FIXTURE / 'staff.php').write_text("<?php return ['email'=>'shared-qa@example.invalid','hash'=>'" + hashed + "'];", encoding='utf-8')
for name in ('products.json', 'catalog.json'):
    shutil.copyfile(ROOT / 'review/fixtures' / name, DATA / name)
commerce_before = {file.name: file.read_bytes() for file in DATA.glob('*.json')}
with socket.socket() as reserve:
    reserve.bind(('127.0.0.1', 0))
    port = reserve.getsockname()[1]
ORIGIN = 'http://127.0.0.1:' + str(port)
log = (FIXTURE / 'server.log').open('w', encoding='utf-8')
server = subprocess.Popen([str(PHP), '-d', 'display_errors=0', '-d', 'log_errors=1', '-d', 'session.save_path=' + str(SESSIONS),
                           '-S', '127.0.0.1:' + str(port), '-t', str(SITE)], env=env, cwd=SITE, stdout=log, stderr=log,
                          creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
results = []

def check(name, condition):
    results.append({'name': name, 'pass': bool(condition)})
    if not condition:
        raise AssertionError(name)

class Client:
    def __init__(self):
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = ''

    def call(self, action, body=None, page='home', token=True, endpoint='cms-api.php'):
        headers = {'Accept': 'application/json', 'Origin': ORIGIN}
        if token and self.csrf:
            headers['X-CSRF-Token'] = self.csrf
        raw = None
        if body is not None:
            raw = json.dumps(body).encode()
            headers['Content-Type'] = 'application/json'
        request = urllib.request.Request(ORIGIN + '/' + endpoint + '?a=' + action + '&page=' + page, data=raw, headers=headers)
        try:
            response = self.opener.open(request, timeout=15)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, json.load(response)

def document(page, text):
    doc = {'schemaVersion': 1, 'id': page, 'sections': [
        {'id': 'global:header', 'source': 'global:header', 'type': 'native', 'region': 'header', 'name': 'Header',
         'elements': {'e0.2.0': {'kind': 'button', 'name': 'Home', 'text': text, 'href': '#/'}}, 'content': {}},
        {'id': page + ':body', 'source': page + ':body', 'type': 'native', 'region': 'main', 'name': 'Body', 'content': {}, 'elements': {}}
    ], 'seo': {'title': page + ' original'}, 'design': {}}
    if page == 'home':
        doc['sections'].append({'id': 'home:shop-categories', 'source': 'home:shop-categories',
                                'type': 'native', 'region': 'main', 'name': 'Shop by Categories',
                                'content': {}, 'elements': {}})
    return doc

def header_text(doc):
    return next(section for section in doc['sections'] if section.get('source') == 'global:header')['elements']['e0.2.0']['text']


def chrome(page, suffix):
    doc = document(page, 'Header ' + suffix)
    doc['sections'].insert(0, {'id': 'legacy-promo-' + page, 'source': 'global:promo', 'type': 'native', 'region': 'header',
                               'name': 'Announcement', 'content': {'promoMessages': [{'id': 'message-one', 'text': 'Promo ' + suffix, 'enabled': True, 'icon': 'auto'}]}, 'elements': {}})
    doc['sections'].append({'id': 'legacy-footer-' + page, 'source': 'global:footer', 'type': 'native', 'region': 'footer',
                            'name': 'Footer', 'content': {}, 'elements': {'e0.0': {'kind': 'text', 'text': 'Footer ' + suffix}}})
    return doc


def role(doc, name):
    return next(section for section in doc['sections'] if section.get('source') == 'global:' + name)


def has_globals(doc):
    return doc is not None and any(section.get('source') in ['global:promo', 'global:header', 'global:footer'] for section in doc['sections'])


def record(doc, published, version=3):
    return {'version': version, 'draft': doc, 'published': published, 'savedAt': '2026-10-01T00:00:00Z',
            'publishedAt': '2026-10-01T00:00:00Z', 'publishedVersion': version - 1, 'status': 'published', 'revisions': []}


legacy_home = record(chrome('home', 'Home draft'), chrome('home', 'Home published'))
legacy_products = record(chrome('products', 'Stale Products draft'), chrome('products', 'Stale Products published'))
legacy_header = {'version': 7, 'draft': role(chrome('home', 'Shared draft'), 'header'),
                 'published': role(chrome('home', 'Shared published'), 'header'), 'savedAt': None, 'publishedAt': None}
legacy_header['draft']['elements']['e0.4.3'] = {'kind': 'text', 'name': 'Account area', 'text': 'private@example.invalid'}
revision_id = 'r-' + 'a' * 24
legacy_home['revisions'] = [{'id': revision_id, 'kind': 'save', 'at': '2026-10-01T00:00:00Z'}]
(DATA / 'cms-pages').mkdir()
(DATA / 'cms-revisions/home').mkdir(parents=True)
(DATA / 'cms-revisions/home' / (revision_id + '.json')).write_text(json.dumps(legacy_home['draft']), encoding='utf-8')
for page, value in [('home', legacy_home), ('products', legacy_products)]:
    (DATA / 'cms-pages' / (page + '.json')).write_text(json.dumps(value), encoding='utf-8')
(DATA / 'cms-global-header.json').write_text(json.dumps(legacy_header), encoding='utf-8')
legacy_header_bytes = (DATA / 'cms-global-header.json').read_bytes()
legacy_home_bytes = (DATA / 'cms-pages/home.json').read_bytes()
legacy_revision_bytes = (DATA / 'cms-revisions/home' / (revision_id + '.json')).read_bytes()
global_path = DATA / 'cms-global-components.json'

try:
    for _ in range(100):
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=.1):
                break
        except OSError:
            time.sleep(.05)
    staff, public = Client(), Client()
    staff.csrf = staff.call('session', endpoint='staff-auth.php')[1]['csrfToken']
    code, login = staff.call('login', {'email': 'shared-qa@example.invalid', 'password': env['CM_TEST_PASSWORD']}, endpoint='staff-auth.php')
    check('isolated staff login', code == 200)
    staff.csrf = login['csrfToken']
    before = staff.call('load', page='products')[1]
    check('global version extends existing header token', before['globals'].get('version') == 7 and before['globals']['headerVersion'] == 7)
    check('Home promo/footer and existing shared header are canonical',
          before['globals']['promo']['content']['promoMessages'][0]['text'] == 'Promo Home draft'
          and before['globals']['footer']['elements']['e0.0']['text'] == 'Footer Home draft'
          and header_text(before['draft']) == 'Header Shared draft')
    check('canonical IDs injected once around page content', [s['id'] for s in before['draft']['sections']] == ['global:promo', 'global:header', 'products:body', 'global:footer'])
    check('account data sanitized in migrated globals', 'private@example.invalid' not in json.dumps(before))
    check('public reads preserve separate global publication', public.call('published', page='about')[1]['globals']['promo']['content']['promoMessages'][0]['text'] == 'Promo Home published')
    check('reads never write canonical migration or legacy records', not global_path.exists() and (DATA / 'cms-pages/home.json').read_bytes() == legacy_home_bytes and (DATA / 'cms-global-header.json').read_bytes() == legacy_header_bytes)
    edited = copy.deepcopy(before['draft'])
    role(edited, 'promo')['content']['promoMessages'][0]['text'] = 'Promo shared edit'
    role(edited, 'header')['elements']['e0.2.0']['text'] = 'Header shared edit'
    role(edited, 'footer')['elements']['e0.0']['text'] = 'Footer shared edit'
    body = {'page': 'products', 'expectedVersion': before['version'], 'expectedGlobalVersion': 7, 'document': edited}
    check('anonymous global edit denied', public.call('save', body, page='products')[0] == 401)
    check('global save CSRF protected', staff.call('save', body, page='products', token=False)[0] == 403)
    check('stale global save rejected before migration', staff.call('save', {**body, 'expectedGlobalVersion': 6}, page='products')[0] == 409 and not global_path.exists())
    blocked = DATA / 'cms-pages/contact.json'
    blocked.mkdir()
    first_failure = {'page': 'contact', 'expectedVersion': 0, 'expectedGlobalVersion': 7, 'document': chrome('contact', 'Failed first migration')}
    check('first migration page failure returns error', staff.call('save', first_failure, page='contact')[0] == 503)
    check('failed first migration restores legacy authority', not global_path.exists() and (DATA / 'cms-global-header.json').read_bytes() == legacy_header_bytes)
    blocked.rmdir()
    code, saved = staff.call('save', body, page='products')
    check('one canonical record saves all three global drafts', code == 200 and saved['globals']['version'] == 8 and global_path.is_file())
    stored = json.loads((DATA / 'cms-pages/products.json').read_text('utf-8'))
    check('page draft and publication own no global copies after save', not has_globals(stored['draft']) and not has_globals(stored['published']))
    revision = stored['revisions'][-1]['id']
    check('new page revision stores only page content', not has_globals(json.loads((DATA / 'cms-revisions/products' / (revision + '.json')).read_text('utf-8'))))
    check('unrelated legacy page and header file remain unchanged', (DATA / 'cms-pages/home.json').read_bytes() == legacy_home_bytes and (DATA / 'cms-global-header.json').read_bytes() == legacy_header_bytes)
    check('global drafts stay private until publish', public.call('published', page='products')[1]['globals']['promo']['content']['promoMessages'][0]['text'] == 'Promo Home published')
    for page in ('home', 'products', 'about', 'contact', 'faq', 'privacy'):
        loaded = staff.call('load', page=page)[1]
        check('all admin pages share global draft ' + page, loaded['globals'] == saved['globals'])
    code, live = staff.call('publish', {'page': 'products', 'expectedVersion': saved['version'], 'expectedGlobalVersion': 8}, page='products')
    check('publish commits all shared components', code == 200 and live['globals']['version'] == 9)
    for page in ('home', 'products', 'product', 'about', 'contact', 'faq', 'privacy'):
        published = public.call('published', page=page)[1]
        check('all public pages use one global publication ' + page, all(published['globals'][key] == live['globals'][key] for key in ('promo', 'header', 'footer')))
    loaded_home = staff.call('load')[1]
    check('stale cross-page global token rejected', staff.call('save', {'page': 'home', 'expectedVersion': loaded_home['version'], 'expectedGlobalVersion': 8, 'document': loaded_home['draft']})[0] == 409)
    check('contradictory old/new version fields rejected', staff.call('save', {'page': 'home', 'expectedVersion': loaded_home['version'], 'expectedGlobalVersion': 9, 'expectedHeaderVersion': 8, 'document': loaded_home['draft']})[0] == 422)
    legacy_edit = copy.deepcopy(loaded_home['draft'])
    role(legacy_edit, 'promo')['content']['promoMessages'][0]['text'] = 'Obsolete per-page promo'
    check('header-only compatibility cannot change promo or footer', staff.call('save', {'page': 'home', 'expectedVersion': loaded_home['version'], 'expectedHeaderVersion': 9, 'document': legacy_edit})[0] == 409)
    check('missing global guard cannot overwrite chrome', staff.call('save', {'page': 'home', 'expectedVersion': loaded_home['version'], 'document': legacy_edit})[0] == 409)
    duplicate = copy.deepcopy(loaded_home['draft'])
    duplicate['sections'].append({**role(duplicate, 'footer'), 'id': 'second-footer'})
    check('duplicate global instances rejected', staff.call('save', {'page': 'home', 'expectedVersion': loaded_home['version'], 'expectedGlobalVersion': 9, 'document': duplicate})[0] == 422)
    colliding = copy.deepcopy(loaded_home['draft'])
    role(colliding, 'footer')['id'] = 'old-footer-id'
    colliding['sections'].append({'id': 'global:footer', 'type': 'text', 'region': 'main', 'content': {'text': 'Page content'}})
    check('page-specific section cannot claim canonical global identity', staff.call('save', {'page': 'home', 'expectedVersion': loaded_home['version'], 'expectedGlobalVersion': 9, 'document': colliding})[0] == 422)
    current_globals = global_path.read_bytes()
    code, restored = staff.call('restore', {'page': 'home', 'expectedVersion': loaded_home['version'], 'expectedGlobalVersion': 1, 'revision': revision_id})
    check('page restore keeps current shared chrome despite archived copies', code == 200 and header_text(restored['draft']) == 'Header shared edit' and restored['globals'] == live['globals'])
    check('page restore leaves global draft and publication bytes untouched', global_path.read_bytes() == current_globals)
    check('archived legacy revision remains byte-identical', (DATA / 'cms-revisions/home' / (revision_id + '.json')).read_bytes() == legacy_revision_bytes)
    restored_disk = json.loads((DATA / 'cms-pages/home.json').read_text('utf-8'))
    check('restored page stores no global copies', not has_globals(restored_disk['draft']) and not has_globals(restored_disk['published']))
    categories = staff.call('products')[1]['categories']
    ids = [category['id'] for category in categories]
    code, reordered = staff.call('category-order', {'page': 'home', 'expectedVersion': restored['version'], 'categoryOrder': list(reversed(ids))})
    check('category-only save preserves canonical global record', code == 200 and global_path.read_bytes() == current_globals)
    check('category order is unchanged by global operations', reordered['categoryOrder'] == list(reversed(ids)))
    no_chrome = copy.deepcopy(reordered['draft'])
    no_chrome['sections'] = [s for s in no_chrome['sections'] if not s.get('source', '').startswith('global:')]
    no_chrome['seo']['title'] = 'Page-only edit'
    code, page_saved = staff.call('save', {'page': 'home', 'expectedVersion': reordered['version'], 'expectedGlobalVersion': 9, 'document': no_chrome})
    check('omitted global roles are preserved and re-injected', code == 200 and page_saved['globals'] == reordered['globals'] and header_text(page_saved['draft']) == 'Header shared edit' and global_path.read_bytes() == current_globals)
    code, duplicated = staff.call('page-duplicate', {'page': 'products', 'expectedVersion': live['version'], 'name': 'Future page', 'slug': 'future-global-test', 'document': live['draft']}, page='products')
    check('future duplicated page references canonical globals', code == 201 and duplicated['globals'] == page_saved['globals'] and not has_globals(json.loads((DATA / 'cms-pages' / (duplicated['page'] + '.json')).read_text('utf-8'))['draft']))
    blocked.mkdir()
    code, failure = staff.call('publish', {'page': 'contact', 'expectedVersion': 0, 'expectedGlobalVersion': 9, 'document': chrome('contact', 'Failed publication')}, page='contact')
    check('failed page publication returns storage error', code == 503)
    check('failed publication restores exact global bytes', global_path.read_bytes() == current_globals)
    blocked.rmdir()
    old_header_changed = copy.deepcopy(legacy_header)
    old_header_changed['draft']['elements']['e0.2.0']['text'] = 'Inert legacy file'
    (DATA / 'cms-global-header.json').write_text(json.dumps(old_header_changed), encoding='utf-8')
    check('legacy header becomes inert after one canonical import', staff.call('load')[1]['globals']['header'] == live['globals']['header'])
    check('catalog products prices IDs and counts remain byte-identical', all((DATA / name).read_bytes() == before for name, before in commerce_before.items()))
    # Rebuild only this throwaway fixture's legacy state to cover operations
    # before the first normal global save. No live/local review state is used.
    global_path.unlink()
    (DATA / 'cms-global-header.json').write_bytes(legacy_header_bytes)
    (DATA / 'cms-pages/home.json').write_bytes(legacy_home_bytes)
    code, legacy_reorder = staff.call('category-order', {'page': 'home', 'expectedVersion': 3, 'categoryOrder': ids})
    check('category-only write before migration preserves Home chrome fallback', code == 200 and not global_path.exists() and has_globals(json.loads((DATA / 'cms-pages/home.json').read_text('utf-8'))['draft']))
    before_first_restore = staff.call('load')[1]['globals']
    code, first_restore = staff.call('restore', {'page': 'home', 'expectedVersion': legacy_reorder['version'], 'revision': revision_id})
    check('first page restore imports current globals before removing page copies', code == 200 and global_path.is_file() and all(first_restore['globals'][key] == before_first_restore[key] for key in ('promo', 'header', 'footer')))
    check('first restore retains distinct canonical draft and publication', public.call('published', page='about')[1]['globals']['promo']['content']['promoMessages'][0]['text'] == 'Promo Home published')
    print(json.dumps({'passed': len(results), 'fixtureOnly': True}))
finally:
    server.terminate()
    server.wait(timeout=10)
    log.close()
    diagnostic = (FIXTURE / 'server.log').read_text(encoding='utf-8', errors='replace')
    report = {'fixtureOnly': True, 'passed': sum(result['pass'] for result in results), 'total': len(results), 'results': results,
              'phpDiagnostics': any(value in diagnostic for value in ('PHP Warning', 'PHP Fatal', 'PHP Notice', 'PHP Parse'))}
    (ROOT / 'audit/cms-global-chrome-backend-results.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
