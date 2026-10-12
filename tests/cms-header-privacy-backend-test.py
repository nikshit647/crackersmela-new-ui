"""Synthetic CMS account-content regression; no production data or requests."""
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
SENTINEL = 'cms-private-legacy@example.invalid'
STAMP = '2026-01-01T00:00:00Z'
REVISION = 'r-' + '1' * 24
INLINE_REVISION = 'r-' + '2' * 24
results = []


def check(name, condition):
    results.append({'name': name, 'pass': bool(condition)})
    if not condition:
        raise AssertionError(name)


def document(page='home'):
    responsive = {'desktop': {'fontSize': '18px'}, 'tablet': {'fontSize': '16px'}, 'mobile': {'fontSize': '14px'}}
    elements = {
        'eroot': {'kind': 'container', 'name': 'Navbar', 'styles': responsive},
        'e0.1': {'kind': 'button', 'name': 'Logo link', 'href': '#/'},
        'e0.1.0': {'kind': 'image', 'name': 'Logo', 'src': '/images/logo.png', 'alt': 'Public logo'},
        'e0.2.0': {'kind': 'button', 'name': 'Navigation', 'text': 'Browse products', 'href': '#/products', 'styles': responsive,
                    'overrides': {'mobile': {'hidden': False, 'styles': {'fontSize': '13px'}}}},
        'e0.4.30': {'kind': 'button', 'name': 'Public sibling', 'text': 'Contact', 'href': '#/contact'},
        'a-public': {'kind': 'text', 'name': 'Public addition', 'text': 'Store hours', 'added': True, 'parentId': 'eroot'},
        # The current account root may be absent or renamed in an old draft.
        'e0.4.3.2.0': {'kind': 'text', 'name': SENTINEL, 'text': SENTINEL},
        # Older templates used other paths and class-based container names.
        'e9.2': {'kind': 'container', 'name': 'account-menu__meta'},
        'e9.2.0': {'kind': 'text', 'name': SENTINEL, 'text': SENTINEL},
        'e8.1': {'kind': 'container', 'name': 'Account menu'},
        'e8.1.0': {'kind': 'text', 'name': SENTINEL, 'text': SENTINEL},
        'e7.1': {'kind': 'container', 'name': 'accountArea'},
        'e7.1.0': {'kind': 'text', 'name': SENTINEL, 'text': SENTINEL},
        # Reverse insertion order exercises transitive parent pruning.
        'a-private-text': {'kind': 'text', 'name': SENTINEL, 'text': SENTINEL, 'added': True, 'parentId': 'a-private-container'},
        'a-private-container': {'kind': 'container', 'name': 'Added container', 'added': True, 'parentId': 'e9.2'},
        'a-private-orphan': {'kind': 'text', 'name': SENTINEL, 'text': SENTINEL, 'added': True, 'parentId': 'e0.4.3.99'},
    }
    header = {'id': 'global:header', 'source': 'global:header', 'type': 'native', 'region': 'header', 'name': 'Header',
              'elements': elements, 'styles': responsive, 'overrides': {'mobile': {'hidden': False}}}
    duplicate = copy.deepcopy(header)
    duplicate['id'] = 's-duplicate-header'
    public = {'id': page + ':content', 'source': page + ':content', 'type': 'native', 'region': 'main', 'name': 'Public content',
              'elements': {'e0.4.3': {'kind': 'text', 'name': 'accountArea', 'text': 'An unrelated public section'}}}
    return {'schemaVersion': 1, 'id': page, 'sections': [header, duplicate, public], 'seo': {'title': 'Public page title'}}


def record(page='home', inline=False):
    doc = document(page)
    revisions = [{'id': REVISION, 'kind': 'save', 'at': STAMP}]
    if inline:
        revisions.append({'id': INLINE_REVISION, 'kind': 'save', 'at': STAMP, 'document': copy.deepcopy(doc)})
    return {'version': 1, 'draft': doc, 'published': copy.deepcopy(doc), 'savedAt': STAMP, 'publishedAt': STAMP,
            'publishedVersion': 1, 'status': 'published', 'revisions': revisions}


def preserved(doc):
    original = document(doc['id'])
    for index in (0, 1):
        section = doc['sections'][index]
        expected = original['sections'][index]
        for key in ('eroot', 'e0.1', 'e0.1.0', 'e0.2.0', 'e0.4.30', 'a-public'):
            # Validation may add default fields; original values must survive.
            for field, value in expected['elements'][key].items():
                if section['elements'][key].get(field) != value:
                    return False
        if section.get('styles') != expected['styles'] or section.get('overrides') != expected['overrides']:
            return False
    return doc['sections'][2]['elements']['e0.4.3']['text'] == 'An unrelated public section'


fixture = Path(tempfile.mkdtemp(prefix='cms-header-privacy-'))
site, data, sessions = [fixture / name for name in ('site', 'data', 'sessions')]
server = None
try:
    for directory in (site, site / 'js', data / 'cms-pages', data / 'cms-revisions/home', sessions):
        directory.mkdir(parents=True)
    for name in ('cm-security.php', 'cm-commerce.php', 'cm-google.php', 'cm-seo.php', 'staff-auth.php', 'js/products-data.js'):
        shutil.copyfile(RELEASE / name, site / name)
    for name in ('cm-cms.php', 'cms-api.php', 'cms-page.php', 'visual-preview.php'):
        shutil.copyfile(ROOT / 'visual-editor' / name, site / name)
    (site / 'index.html').write_text('<!doctype html><html><head><title>Public template</title></head><body><script src="js/app.js"></script></body></html>', encoding='utf-8')
    (data / 'cms-pages/home.json').write_text(json.dumps(record(inline=True)), encoding='utf-8')
    (data / 'cms-pages.json').write_text(json.dumps({'schemaVersion': 1, 'pages': {'about': record('about')}}), encoding='utf-8')
    (data / ('cms-revisions/home/' + REVISION + '.json')).write_text(json.dumps(document()), encoding='utf-8')
    env = os.environ.copy()
    env.update(CM_DATA_DIR=str(data), CM_STAFF_CONFIG=str(fixture / 'staff.php'), CM_DISABLE_MAIL='1', EMAIL_ENABLED='false',
               CM_EMAIL_TRANSPORT='fake', CM_CMS_TEST_PASSWORD='Synthetic CMS privacy password 2026')
    hashed = subprocess.check_output([str(PHP), '-r', "echo password_hash(getenv('CM_CMS_TEST_PASSWORD'), PASSWORD_DEFAULT);"], env=env, text=True).strip()
    (fixture / 'staff.php').write_text("<?php return ['email'=>'cms-privacy-staff@example.invalid','hash'=>'" + hashed + "'];", encoding='utf-8')
    with socket.socket() as reserve:
        reserve.bind(('127.0.0.1', 0))
        port = reserve.getsockname()[1]
    origin = 'http://127.0.0.1:' + str(port)
    log = (fixture / 'server.log').open('w', encoding='utf-8')
    server = subprocess.Popen([str(PHP), '-d', 'display_errors=0', '-d', 'log_errors=1', '-d', 'session.save_path="' + sessions.resolve().as_posix() + '"',
                               '-S', '127.0.0.1:' + str(port), '-t', str(site)], env=env, cwd=site, stdout=log, stderr=log,
                              creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    for _ in range(100):
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=.1):
                break
        except OSError:
            time.sleep(.05)

    class Client:
        def __init__(self):
            self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
            self.csrf = ''

        def call(self, path, body=None):
            headers = {'Accept': 'application/json', 'Origin': origin, 'X-CSRF-Token': self.csrf}
            if body is not None:
                headers['Content-Type'] = 'application/json'
            request = urllib.request.Request(origin + path, data=json.dumps(body).encode() if body is not None else None, headers=headers)
            try:
                response = self.opener.open(request, timeout=10)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                raw = response.read().decode()
                try:
                    result = json.loads(raw)
                except ValueError:
                    result = raw
                return response.status, result

    anonymous, staff = Client(), Client()
    for page in ('home', 'about'):
        status, public = anonymous.call('/cms-api.php?a=published&page=' + page)
        check('public ' + page + ' read removes identifiable account content', status == 200 and SENTINEL not in json.dumps(public))
        check('public ' + page + ' read preserves navigation and all device styles', preserved(public['published']))
        check('public ' + page + ' response contains no draft or revision data', 'draft' not in public and 'revisions' not in public)
    check('read filtering does not silently rewrite the saved source', SENTINEL in (data / 'cms-pages/home.json').read_text())
    status, denied = anonymous.call('/cms-api.php?a=load&page=home')
    check('anonymous draft remains protected', status == 401)
    check('anonymous preview remains protected', anonymous.call('/visual-preview.php?page=home')[0] == 401)
    status, html = anonymous.call('/cms-page.php?slug=about')
    check('clean page serves public template without account content', status == 200 and SENTINEL not in html and 'Public page title' in html)
    _, session = staff.call('/staff-auth.php?a=session')
    staff.csrf = session['csrfToken']
    status, login = staff.call('/staff-auth.php?a=login', {'email': 'cms-privacy-staff@example.invalid', 'password': env['CM_CMS_TEST_PASSWORD']})
    check('synthetic staff authenticates through the real endpoint', status == 200 and login['authenticated'])
    staff.csrf = login['csrfToken']
    status, loaded = staff.call('/cms-api.php?a=load&page=home')
    check('loading removes legacy account data from draft and published output', status == 200 and SENTINEL not in json.dumps(loaded))
    status, published = staff.call('/cms-api.php?a=publish', {'page': 'home', 'expectedVersion': loaded['version']})
    check('publish without a document cleans the existing stored draft', status == 200 and SENTINEL not in json.dumps(published) and preserved(published['published']))
    check('record writes clean draft, published and inline revision documents', SENTINEL not in (data / 'cms-pages/home.json').read_text())
    check('new revision snapshots exclude account content', all(SENTINEL not in path.read_text() for path in (data / 'cms-revisions/home').glob('*.json') if path.stem != REVISION))
    version = published['version']
    for revision in (REVISION, INLINE_REVISION):
        status, restored = staff.call('/cms-api.php?a=restore', {'page': 'home', 'expectedVersion': version, 'revision': revision})
        check('restore ' + ('file' if revision == REVISION else 'inline') + ' revision cannot reintroduce account content', status == 200 and SENTINEL not in json.dumps(restored) and preserved(restored['draft']))
        version = restored['version']
    status, saved = staff.call('/cms-api.php?a=save', {'page': 'home', 'expectedVersion': version, 'document': document()})
    check('save removes account paths before validating their added descendants', status == 200 and SENTINEL not in json.dumps(saved) and preserved(saved['draft']))
    status, again = staff.call('/cms-api.php?a=save', {'page': 'home', 'expectedVersion': saved['version'], 'document': saved['draft']})
    check('saving an already filtered document is stable', status == 200 and again['draft'] == saved['draft'])
    status, duplicate = staff.call('/cms-api.php?a=page-duplicate', {'page': 'home', 'expectedVersion': again['version'], 'name': 'Privacy fixture', 'slug': 'privacy-fixture', 'document': document()})
    check('page duplication cannot copy identifiable account content', status == 201 and SENTINEL not in json.dumps(duplicate))
    print(json.dumps({'passed': len(results), 'checks': results}, indent=2))
finally:
    if server is not None:
        server.terminate()
        server.wait(timeout=10)
        log.close()
    if fixture.parent.resolve() != Path(tempfile.gettempdir()).resolve() or not fixture.name.startswith('cms-header-privacy-'):
        raise RuntimeError('Unsafe fixture cleanup path')
    shutil.rmtree(fixture)
