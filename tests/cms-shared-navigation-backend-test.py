"""Exercise shared navigation and category-only saves against isolated real PHP."""
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
FIXTURE = Path(tempfile.mkdtemp(prefix='cms-shared-navigation-', dir=ROOT / 'audit-evidence'))
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
    categories = staff.call('products')[1]['categories']
    ids = [category['id'] for category in categories]
    order = list(reversed(ids))
    body = {'page': 'home', 'expectedVersion': 0, 'categoryOrder': order}
    check('anonymous cannot reorder', public.call('category-order', body)[0] == 401)
    check('CSRF protects reorder', staff.call('category-order', body, token=False)[0] == 403)
    code, first = staff.call('category-order', body)
    check('category-only save works before any Home draft exists', code == 200 and first.get('categoryOrder') == order)
    check('category-only save retains unsaved native Home fallback', first['draft'] is None and first['published'] is None)
    live = public.call('published', page='products')[1]
    check('fresh Products response includes saved Home category order', live['globals']['categoryOrder'] == order and live['published'] is None)
    check('stale category update rejected', staff.call('category-order', body)[0] == 409)
    for bad in (ids[:-1], ids + [ids[0]], ['unknown-category'] + ids[1:], [1] + ids[1:]):
        check('invalid category permutation rejected ' + str(len(bad)), staff.call('category-order', {**body, 'expectedVersion': first['version'], 'categoryOrder': bad})[0] == 422)
    home = document('home', 'Shared home')
    code, saved = staff.call('save', {'page': 'home', 'expectedVersion': first['version'], 'expectedHeaderVersion': 0, 'document': home})
    check('header saved through existing CMS endpoint', code == 200 and saved['globals']['headerVersion'] > 0)
    check('header draft stays private', public.call('published', page='about')[1]['globals']['header'] is None)
    code, published = staff.call('publish', {'page': 'home', 'expectedVersion': saved['version'], 'expectedHeaderVersion': saved['globals']['headerVersion']})
    check('publishing header succeeds', code == 200)
    for page in ('home', 'products', 'product', 'about', 'contact', 'faq', 'privacy'):
        live = public.call('published', page=page)[1]
        check('same shared header and category order on ' + page, live['globals']['header']['elements']['e0.2.0']['text'] == 'Shared home' and live['globals']['categoryOrder'] == order)
    # Saving only categories must not publish other work in the Home draft.
    draft = copy.deepcopy(published['draft'])
    draft['seo']['title'] = 'Private unfinished redesign'
    draft['sections'][1]['name'] = 'Private body edit'
    code, pending = staff.call('save', {'page': 'home', 'expectedVersion': published['version'], 'expectedHeaderVersion': published['globals']['headerVersion'], 'document': draft})
    check('unrelated Home draft saved', code == 200)
    code, reordered = staff.call('category-order', {'page': 'home', 'expectedVersion': pending['version'], 'categoryOrder': ids})
    check('category save preserves draft and published page separately', code == 200 and reordered['draft']['seo']['title'] == 'Private unfinished redesign' and reordered['published']['seo']['title'] == 'home original')
    check('only order fields change in both documents', reordered['draft'] == {**pending['draft'], 'categoryOrder': ids} and reordered['published'] == {**pending['published'], 'categoryOrder': ids})
    # An edit originating on another page changes one shared header, not Home content.
    about_loaded = staff.call('load', page='about')[1]
    about = document('about', 'Across every page')
    about['sections'][0]['elements']['e0.4.3'] = {'kind': 'text', 'name': 'Account area', 'text': 'private@example.invalid'}
    code, about_saved = staff.call('save', {'page': 'about', 'expectedVersion': 0, 'expectedHeaderVersion': about_loaded['globals']['headerVersion'], 'document': about}, page='about')
    check('another page can edit the shared header', code == 200)
    check('account details excluded from shared header', 'private@example.invalid' not in json.dumps(about_saved['globals']))
    check('Home draft receives latest header without losing page edits', header_text(staff.call('load')[1]['draft']) == 'Across every page' and staff.call('load')[1]['draft']['seo']['title'] == 'Private unfinished redesign')
    check('stale header overwrite rejected across page versions', staff.call('save', {'page': 'home', 'expectedVersion': reordered['version'], 'expectedHeaderVersion': reordered['globals']['headerVersion'], 'document': reordered['draft']})[0] == 409)
    check('stale header publication rejected', staff.call('publish', {'page': 'home', 'expectedVersion': reordered['version'], 'expectedHeaderVersion': reordered['globals']['headerVersion']})[0] == 409)
    code, about_live = staff.call('publish', {'page': 'about', 'expectedVersion': about_saved['version'], 'expectedHeaderVersion': about_saved['globals']['headerVersion']}, page='about')
    check('header edited from About publishes on all pages', code == 200 and public.call('published', page='products')[1]['globals']['header']['elements']['e0.2.0']['text'] == 'Across every page')
    home_loaded = staff.call('load')[1]
    code, home_live = staff.call('publish', {'page': 'home', 'expectedVersion': home_loaded['version'], 'expectedHeaderVersion': home_loaded['globals']['headerVersion']})
    check('publishing a clean old page never restores its obsolete header snapshot', code == 200 and public.call('published', page='products')[1]['globals']['header']['elements']['e0.2.0']['text'] == 'Across every page')
    shared_before_failure = (DATA / 'cms-global-components.json').read_bytes()
    blocked_record = DATA / 'cms-pages/contact.json'
    blocked_record.mkdir()
    code, failed_save = staff.call('save', {'page': 'contact', 'expectedVersion': 0, 'expectedHeaderVersion': home_live['globals']['headerVersion'], 'document': document('contact', 'Must never escape a failed save')}, page='contact')
    check('failed page write returns an error', code == 503)
    check('failed page write rolls back shared navigation', (DATA / 'cms-global-components.json').read_bytes() == shared_before_failure)
    blocked_record.rmdir()
    check('fresh admin reads retain category order', staff.call('load')[1]['categoryOrder'] == ids)
    # Revalidation turns empty native content into stdClass. Save, explicit
    # publish and restore must all retain the authoritative order without
    # treating that content object as a PHP array.
    before_restore = staff.call('load')[1]
    revisions = staff.call('revisions')[1]['revisions']
    code, restored = staff.call('restore', {'page': 'home', 'expectedVersion': before_restore['version'],
                                          'expectedHeaderVersion': before_restore['globals']['headerVersion'],
                                          'revision': revisions[-1]['id']})
    check('restore after category save accepts empty native content', code == 200 and restored['draft']['sections'][2]['content'] == {})
    check('restore preserves live category order and published document', restored['draft']['categoryOrder'] == ids and restored['published'] == before_restore['published'])
    code, explicit_publish = staff.call('publish', {'page': 'home', 'expectedVersion': restored['version'],
                                                   'expectedHeaderVersion': restored['globals']['headerVersion'],
                                                   'document': restored['draft']})
    check('explicit publish after category save accepts empty native content', code == 200 and explicit_publish['published']['sections'][2]['content'] == {})
    check('published response retains authoritative category order', public.call('published')[1]['published']['categoryOrder'] == ids)
    check('catalog, products and counts remain byte-identical', all((DATA / name).read_bytes() == before for name, before in commerce_before.items()))
    print(json.dumps({'passed': len(results), 'fixtureOnly': True}))
finally:
    server.terminate()
    server.wait(timeout=10)
    log.close()
    diagnostic = (FIXTURE / 'server.log').read_text(encoding='utf-8', errors='replace')
    report = {'fixtureOnly': True, 'passed': sum(result['pass'] for result in results), 'total': len(results), 'results': results,
              'phpDiagnostics': any(value in diagnostic for value in ('PHP Warning', 'PHP Fatal', 'PHP Notice', 'PHP Parse'))}
    (ROOT / 'audit/cms-shared-navigation-backend-results.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
