"""Real HTTP cookie-race regression; isolated PHP, synthetic identity, no mail.

A forwarding server holds a public response until the CSRF bootstrap response
has reached a shared browser-style CookieJar. Both requests are sent without a
cookie. This makes the formerly intermittent first-login failure deterministic.
"""
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import http.client
import http.cookiejar
import json
import os
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'audit-evidence/production-release'
PHP = ROOT / 'audit-evidence/tools/php-8.3.35/php.exe'
FIXTURE = Path(tempfile.mkdtemp(prefix='session-bootstrap-', dir=ROOT / 'audit-evidence'))
WEB, DATA, SESSIONS = [FIXTURE / name for name in ('web', 'data', 'sessions')]
for directory in (WEB, DATA, SESSIONS, WEB / 'js'):
    directory.mkdir(parents=True, exist_ok=True)
for source in BASE.glob('*.php'):
    shutil.copy2(source, WEB / source.name)
shutil.copy2(BASE / 'js/products-data.js', WEB / 'js/products-data.js')
(WEB / 'index.html').write_text('<!doctype html><html><head><title>Fixture</title></head><body>Fixture</body></html>')
(WEB / 'ownership.php').write_text("<?php require __DIR__ . '/cm-commerce.php'; cmRespond(200, ['ok'=>true,'owned'=>cmOrderOwned(cmReadJson(cmDataDir() . '/fixture-order.json'))]);")
(DATA / 'products.json').write_text(json.dumps({'extraProducts': [], 'productOverrides': {}, 'settings': {}, 'rev': 0}))
(DATA / 'catalog.json').write_text('{}')
PASSWORD, OWNER = 'Synthetic session password 2026!', 'session-owner@example.test'
env = os.environ.copy()
env.update(CM_DATA_DIR=str(DATA), CM_STAFF_CONFIG=str(FIXTURE / 'owner.php'),
           CM_DISABLE_MAIL='1', CM_EMAIL_TRANSPORT='fake', CM_TEST_STAFF_PASSWORD=PASSWORD)
hashed = subprocess.check_output([str(PHP), '-r', "echo password_hash(getenv('CM_TEST_STAFF_PASSWORD'), PASSWORD_DEFAULT);"], env=env, text=True).strip()
(FIXTURE / 'owner.php').write_text("<?php return ['email'=>'" + OWNER + "','hash'=>'" + hashed + "'];")
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    PHP_PORT = probe.getsockname()[1]
log = (FIXTURE / 'server.log').open('w', encoding='utf-8')
server = subprocess.Popen([str(PHP), '-d', 'display_errors=0', '-d', 'log_errors=1',
                           '-d', 'session.save_path=' + str(SESSIONS),
                           '-S', '127.0.0.1:' + str(PHP_PORT), '-t', str(WEB)],
                          cwd=WEB, env=env, stdout=log, stderr=log)
results, races = [], {}


def check(name, condition):
    results.append({'name': name, 'pass': bool(condition)})
    if not condition:
        print('FAIL: ' + name)


class Forwarder(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def forward(self):
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        race = races.get(query.get('race', [''])[0])
        bootstrap = self.path.startswith('/staff-auth.php?a=session')
        if race:
            race['no_cookie'].append(not self.headers.get('Cookie'))
            race['barrier'].wait(timeout=10)
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        headers = {key: value for key, value in self.headers.items() if key.lower() != 'connection'}
        connection = http.client.HTTPConnection('127.0.0.1', PHP_PORT, timeout=15)
        connection.request(self.command, self.path, body=body or None, headers=headers)
        response = connection.getresponse()
        content, response_headers, status = response.read(), response.getheaders(), response.status
        connection.close()
        if race and not bootstrap:
            if not race['bootstrap_consumed'].wait(timeout=10):
                raise RuntimeError('Bootstrap did not reach the client')
        self.send_response(status)
        for key, value in response_headers:
            if key.lower() not in ('connection', 'content-length', 'transfer-encoding'):
                self.send_header(key, value)
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    do_GET = forward
    do_POST = forward
    do_HEAD = forward


proxy = ThreadingHTTPServer(('127.0.0.1', 0), Forwarder)
threading.Thread(target=proxy.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:' + str(proxy.server_port)


class Client:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def call(self, path, body=None, token=None):
        headers = {'Accept': 'application/json'}
        if token is not None:
            headers['X-CSRF-Token'] = token
        data = None if body is None else json.dumps(body).encode()
        if data is not None:
            headers['Content-Type'] = 'application/json'
        request = urllib.request.Request(URL + path, data=data, headers=headers)
        try:
            response = self.opener.open(request, timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        raw = response.read()
        try:
            payload = json.loads(raw)
        except (ValueError, UnicodeDecodeError):
            payload = {}
        return response.code, payload, response.headers


try:
    for _ in range(100):
        try:
            with socket.create_connection(('127.0.0.1', PHP_PORT), timeout=.1):
                break
        except OSError:
            time.sleep(.05)
    public_paths = ['/catalog-api.php?a=pull', '/products-api.php?a=pull',
                    '/cms-api.php?a=published&page=home', '/cms-page.php?slug=about',
                    '/cms-sitemap.php', '/sitemap.php']
    for path in public_paths:
        client = Client()
        status, _payload, headers = client.call(path)
        check(path + ' remains publicly readable', status == 200)
        check(path + ' does not set a session cookie', headers.get('Set-Cookie') is None and not list(client.jar))
    for index, path in enumerate(public_paths[:3]):
        key = str(index)
        race = races[key] = {'barrier': threading.Barrier(2), 'bootstrap_consumed': threading.Event(), 'no_cookie': []}
        client = Client()

        def bootstrap_request():
            value = client.call('/staff-auth.php?a=session&race=' + key)
            race['bootstrap_consumed'].set()
            return value

        with ThreadPoolExecutor(max_workers=2) as pool:
            bootstrap = pool.submit(bootstrap_request)
            public = pool.submit(client.call, path + '&race=' + key)
            session_status, session, session_headers = bootstrap.result(timeout=25)
            public_status, _payload, public_headers = public.result(timeout=25)
        check(path + ' test dispatched both initial requests without cookies', race['no_cookie'] == [True, True])
        check(path + ' bootstrap issues a CSRF token and protected cookie', session_status == 200 and bool(session.get('csrfToken'))
              and 'HttpOnly' in session_headers.get('Set-Cookie', '') and 'SameSite=Strict' in session_headers.get('Set-Cookie', ''))
        check(path + ' delayed public response cannot replace bootstrap cookie', public_status == 200 and public_headers.get('Set-Cookie') is None)
        status, identity, _headers = client.call('/staff-auth.php?a=login', {'email': OWNER, 'password': PASSWORD}, session['csrfToken'])
        check(path + ' first login succeeds after concurrent public read', status == 200 and identity.get('authenticated'))
        status, _payload, _headers = client.call('/staff-auth.php?a=logout', {}, 'invalid-token')
        check(path + ' invalid CSRF still fails', status == 403)
        if identity.get('authenticated'):
            status, persisted, _headers = client.call('/staff-auth.php?a=session')
            check(path + ' authenticated session survives to next request', status == 200 and persisted.get('id') == 'staff_owner')
    customer = Client()
    _status, session, _headers = customer.call('/customer-auth.php?a=session')
    status, account, _headers = customer.call('/customer-auth.php', {'a': 'register', 'name': 'Session Customer',
                                         'email': 'session-customer@example.test', 'password': PASSWORD}, session['csrfToken'])
    check('customer registration creates a session', status == 201 and bool(account.get('user')))
    status, persisted, _headers = customer.call('/customer-auth.php?a=session')
    check('customer GET session restores persisted identity before reading it', status == 200 and persisted.get('user') == account.get('user') and bool(persisted.get('user')))
    (DATA / 'fixture-order.json').write_text(json.dumps({'id': 'fixture-owned-order', 'customerUserId': account['user']['id']}))
    status, ownership, _headers = customer.call('/ownership.php')
    check('ownership helper restores the session without an earlier authentication guard', status == 200 and ownership.get('owned') is True)
    sid = next(cookie.value for cookie in customer.jar if cookie.name == 'cm_staff')
    subprocess.check_call([str(PHP), '-r', 'session_save_path($argv[1]);session_id($argv[2]);session_start();$_SESSION["customer_last_seen"]=time()-7201;$_SESSION["cm_order_ids"]=["fixture-owned-order"];session_write_close();', str(SESSIONS), sid], stdout=subprocess.DEVNULL)
    status, ownership, _headers = customer.call('/ownership.php')
    check('ownership helper expires customer and remembered-order capabilities before checking them', status == 200 and ownership.get('owned') is False)
    status, expired, _headers = customer.call('/customer-auth.php?a=session')
    check('expired customer stays signed out after ownership check', status == 200 and expired.get('user') is None)
finally:
    proxy.shutdown()
    proxy.server_close()
    server.terminate()
    server.wait(timeout=10)
    log.close()
    result = {'checks': results, 'passed': sum(item['pass'] for item in results), 'total': len(results)}
    (ROOT / 'audit/session-bootstrap-results.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'passed': result['passed'], 'total': result['total'], 'fixture': str(FIXTURE)}))
if any(not item['pass'] for item in results):
    raise SystemExit(1)
