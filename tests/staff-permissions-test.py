"""Real PHP role boundary tests; synthetic data, separate sessions, mail disabled."""
from pathlib import Path
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
BASE = ROOT / 'audit-evidence/production-release'
PHP = ROOT / 'audit-evidence/tools/php-8.3.35/php.exe'
FIXTURE = Path(tempfile.mkdtemp(prefix='staff-permissions-', dir=ROOT / 'audit-evidence'))
WEB, DATA, SESSIONS = [FIXTURE / name for name in ('web', 'data', 'sessions')]
for directory in (WEB, DATA, SESSIONS, WEB / 'js', WEB / 'api'):
    directory.mkdir(parents=True, exist_ok=True)
for source in BASE.glob('*.php'):
    shutil.copy2(source, WEB / source.name)
for source in (BASE / 'api').glob('*.php'):
    shutil.copy2(source, WEB / 'api' / source.name)
shutil.copy2(BASE / 'js/products-data.js', WEB / 'js/products-data.js')
(WEB / 'editor-shell.html').write_text('<!doctype html><title>Isolated editor</title>')
(WEB / 'index.html').write_text('<!doctype html><html><head><title>Isolated store</title></head><body><script src="js/app.js"></script></body></html>')
PASSWORD = 'Synthetic staff password 2026!'
OWNER = 'owner@example.test'
env = os.environ.copy()
env.update(CM_DATA_DIR=str(DATA), CM_STAFF_CONFIG=str(FIXTURE / 'owner.php'),
           CM_STAFF_GOOGLE_CONFIG=str(FIXTURE / 'google.php'), CM_DISABLE_MAIL='1',
           EMAIL_ENABLED='false', CM_EMAIL_TRANSPORT='fake', CM_TEST_STAFF_PASSWORD=PASSWORD,
           CM_UPLOAD_DIR=str(FIXTURE / 'uploads'))
hashed = subprocess.check_output([str(PHP), '-r', "echo password_hash(getenv('CM_TEST_STAFF_PASSWORD'), PASSWORD_DEFAULT);"], env=env, text=True).strip()
(FIXTURE / 'owner.php').write_text("<?php return ['email'=>'" + OWNER + "','hash'=>'" + hashed + "'];", encoding='utf-8')
(FIXTURE / 'google.php').write_text("<?php return ['emails'=>[], 'domains'=>['example.test']];", encoding='utf-8')
PRODUCT = {'id': 9876543210, 'name': 'Role fixture', 'shortName': 'Role fixture', 'price': 100,
           'stock': 100, 'inStock': True, 'cats': ['sparklers'], 'primary': 'sparklers', 'image': ''}
(DATA / 'products.json').write_text(json.dumps({'extraProducts': [PRODUCT], 'productOverrides': {}, 'settings': {'maintenance': False, 'coupon': None}, 'rev': 0}))
(DATA / 'catalog.json').write_text('{}')
(DATA / 'customers.json').write_text(json.dumps({'version': 1, 'accounts': []}))
ORDER = {'id': 'role-fixture-order', 'code': 'CM-ROLE-1', 'status': 'placed', 'payment': 'COD',
         'placedAt': '2026-10-05T00:00:00Z', 'log': [], 'items': [{'id': PRODUCT['id'], 'qty': 1, 'price': 100}],
         'totals': {'total': 100}, 'customer': {'name': 'Fixture Customer', 'phone': '9999999999', 'email': 'buyer@example.test'},
         'shipping': {'address': '123 Fixture Road', 'area': 'Fixture', 'city': 'Hyderabad', 'pincode': '500001'}}
(DATA / 'orders.json').write_text(json.dumps({'orders': [ORDER]}))
# A fresh isolated certificate cache exercises real RS256 verification without
# contacting Google. The private key and signed fixture tokens never leave it.
subprocess.run(['node', '-e', r'''
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const dir=process.argv[1], keys=crypto.generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url'), tokens={};
for(const email of ['owner@example.test','admin@example.test','billing@example.test','inventory_manager@example.test','unknown@example.test']) {
 const now=Math.floor(Date.now()/1000), header=b64({alg:'RS256',typ:'JWT',kid:'fixture'}), claims=b64({aud:'crackersmela-e1028',iss:'https://securetoken.google.com/crackersmela-e1028',sub:'fixture-'+email,exp:now+3600,iat:now,email,email_verified:true,name:'Signed fixture',firebase:{sign_in_provider:'google.com'}});
 const message=header+'.'+claims; tokens[email]=message+'.'+crypto.sign('RSA-SHA256',Buffer.from(message),keys.privateKey).toString('base64url');
}
fs.writeFileSync(path.join(dir,'.google-signing-certs.json'),JSON.stringify({fixture:keys.publicKey}));
fs.writeFileSync(path.join(dir,'fixture-tokens.json'),JSON.stringify(tokens));
''', str(DATA)], check=True, capture_output=True)
TOKENS = json.loads((DATA / 'fixture-tokens.json').read_text())
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    PORT = probe.getsockname()[1]
URL = 'http://127.0.0.1:' + str(PORT)
log = (FIXTURE / 'server.log').open('w', encoding='utf-8')
server = subprocess.Popen([str(PHP), '-d', 'display_errors=0', '-d', 'log_errors=1',
                           '-d', 'extension_dir=' + str(PHP.parent / 'ext'), '-d', 'extension=openssl',
                           '-d', 'session.save_path=' + str(SESSIONS), '-S', '127.0.0.1:' + str(PORT), '-t', str(WEB)],
                          cwd=WEB, env=env, stdout=log, stderr=log)
results = []


def check(name, condition):
    results.append({'name': name, 'pass': bool(condition)})
    if not condition:
        print('FAIL: ' + name)


class Client:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.csrf = ''

    def call(self, path, body=None, token=True, origin=None, method=None):
        headers = {'Accept': 'application/json'}
        if token and self.csrf:
            headers['X-CSRF-Token'] = self.csrf
        if origin is not None:
            headers['Origin'] = origin
        data = None if body is None else json.dumps(body).encode()
        if data is not None:
            headers['Content-Type'] = 'application/json'
        req = urllib.request.Request(URL + path, data=data, headers=headers, method=method or ('POST' if body is not None else 'GET'))
        try:
            response = self.opener.open(req, timeout=15)
        except urllib.error.HTTPError as error:
            response = error
        raw = response.read()
        try:
            payload = json.loads(raw)
        except (ValueError, UnicodeDecodeError):
            payload = {}
        if payload.get('csrfToken'):
            self.csrf = payload['csrfToken']
        return response.code, payload

    def session(self):
        return self.call('/staff-auth.php?a=session')[1]

    def login(self, email, password=PASSWORD):
        self.session()
        return self.call('/staff-auth.php?a=login', {'email': email, 'password': password})


try:
    for attempt in range(100):
        try:
            with socket.create_connection(('127.0.0.1', PORT), timeout=.1):
                break
        except OSError:
            time.sleep(.05)
    owner, anonymous = Client(), Client()
    anonymous.session()
    status, identity = owner.login(OWNER)
    check('configured owner remains able to log in', status == 200 and identity['authenticated'])
    check('configured owner is protected Super Admin', identity.get('role') == 'super_admin' and 'users.manage' in identity.get('permissions', []))
    check('anonymous cannot list staff', anonymous.call('/staff-users.php?a=list')[0] == 401)
    check('create requires CSRF', owner.call('/staff-users.php?a=create', {}, token=False)[0] == 403)
    check('create rejects cross-origin requests', owner.call('/staff-users.php?a=create', {}, origin='https://other.invalid')[0] == 403)
    check('mutation cannot use GET', owner.call('/staff-users.php?a=create')[0] == 405)
    status, listing = owner.call('/staff-users.php?a=list')
    check('owner listed without credential material', status == 200 and listing['users'][0]['protected'] and not any(x in json.dumps(listing) for x in ('passwordHash', 'passwordScheme', hashed)))
    owner_row = listing['users'][0]
    check('configured owner cannot be deactivated', owner.call('/staff-users.php?a=activate', {'id': owner_row['id'], 'expectedVersion': owner_row['version'], 'active': False})[0] == 409)
    check('configured owner cannot be demoted', owner.call('/staff-users.php?a=update', {'id': owner_row['id'], 'expectedVersion': owner_row['version'], 'role': 'admin'})[0] == 409)
    accounts, clients = {}, {}
    for role in ('super_admin', 'admin', 'billing', 'inventory_manager', 'order_manager'):
        body = {'name': 'Fixture ' + role, 'email': role + '@example.test', 'role': role, 'active': True, 'password': PASSWORD}
        status, created = owner.call('/staff-users.php?a=create', body)
        check('create ' + role, status == 201 and created['user']['role'] == role)
        accounts[role] = created['user']
        client = Client()
        status, identity = client.login(body['email'])
        check('server authenticates ' + role, status == 200 and identity['authenticated'] and identity['role'] == role)
        clients[role] = client
    check('duplicate email rejected case-insensitively', owner.call('/staff-users.php?a=create', {'name': 'Duplicate', 'email': 'ADMIN@EXAMPLE.TEST', 'role': 'billing', 'active': True, 'password': PASSWORD})[0] == 409)
    for label, changes in [('weak password', {'password': 'short'}), ('NUL password', {'password': 'Invalid password\x00 suffix'}), ('oversized password', {'password': 'x' * 129}), ('unknown role', {'role': 'owner'}), ('script name', {'name': '<script>bad</script>'}), ('invalid email', {'email': 'not-an-email'}), ('forged grants', {'permissions': ['users.manage']})]:
        body = {'name': 'Valid Fixture', 'email': 'invalid-' + str(len(results)) + '@example.test', 'role': 'billing', 'active': True, 'password': PASSWORD, **changes}
        check('reject ' + label, owner.call('/staff-users.php?a=create', body)[0] == 422)
    listed = owner.call('/staff-users.php?a=list')[1]
    check('managed hashes and credential schemes never appear in staff directory responses', len(listed['users']) == 6 and not any(key in json.dumps(listed) for key in ('passwordHash', 'passwordScheme', PASSWORD)))
    for role, client in clients.items():
        manager = role in ('super_admin', 'admin')
        order_reader = role in ('super_admin', 'admin', 'billing', 'order_manager')
        inventory = role in ('super_admin', 'admin', 'inventory_manager')
        customer_reader = role in ('super_admin', 'admin', 'order_manager')
        status, _ = client.call('/staff-users.php?a=list')
        check(role + ' staff-directory boundary', status == (200 if role == 'super_admin' else 403))
        check(role + ' cannot bypass management by direct create', client.call('/staff-users.php?a=create', {})[0] == (422 if role == 'super_admin' else 403))
        check(role + ' cannot bypass management by direct update', client.call('/staff-users.php?a=update', {})[0] == (422 if role == 'super_admin' else 403))
        check(role + ' cannot bypass management by direct activation', client.call('/staff-users.php?a=activate', {})[0] == (422 if role == 'super_admin' else 403))
        check(role + ' customer-directory boundary', client.call('/customer-auth.php?a=users')[0] == (200 if customer_reader else 403))
        check(role + ' analytics boundary', client.call('/analytics-api.php?a=report')[0] == (200 if manager else 403))
        status, orders = client.call('/orders-api.php?a=pull')
        check(role + ' order-list boundary', status == (200 if order_reader else 403) and (not order_reader or any(x['id'] == ORDER['id'] for x in orders['orders'])))
        check(role + ' status boundary', client.call('/orders-api.php', {'a': 'update', 'id': ORDER['id'], 'status': 'packed'})[0] == (200 if manager or role == 'order_manager' else 403))
        check(role + ' payment boundary', client.call('/orders-api.php', {'a': 'update', 'id': ORDER['id'], 'payment': 'UPI'})[0] == (200 if manager or role == 'billing' else 403))
        check(role + ' catalog boundary', client.call('/catalog-api.php', {'a': 'push', 'stockOverrides': {str(PRODUCT['id']): 99}})[0] == (200 if inventory else 403))
        rev = client.call('/products-api.php?a=pull')[1]['rev']
        check(role + ' product-write boundary', client.call('/products-api.php', {'a': 'push', 'rev': rev, 'productOverrides': {str(PRODUCT['id']): {'name': 'Renamed fixture'}}})[0] == (200 if inventory else 403))
        rev = client.call('/products-api.php?a=pull')[1]['rev']
        check(role + ' settings field boundary', client.call('/products-api.php', {'a': 'push', 'rev': rev, 'settings': {'maintenance': False, 'coupon': None}})[0] == (200 if manager else 403))
        check(role + ' upload boundary', client.call('/upload-api.php', {})[0] == (400 if inventory else 403))
        check(role + ' old upload alias boundary', client.call('/api/upload.php', {})[0] == (400 if inventory else 403))
        check(role + ' invoice boundary', client.call('/invoice-api.php?id=missing&csrf=' + client.csrf)[0] == (404 if order_reader else 403))
        check(role + ' invoice download still requires its CSRF token', client.call('/invoice-api.php?id=' + ORDER['id'])[0] == 403)
        check(role + ' cannot bypass staff invoice permissions through customer endpoint', client.call('/customer-invoice-api.php?code=' + ORDER['code'])[0] == 403)
        check(role + ' notification boundary', client.call('/email-api.php', {'a': 'manual-resend', 'id': ORDER['id']})[0] == (200 if manager or role == 'order_manager' else 403))
        check(role + ' CMS read boundary', client.call('/cms-api.php?a=pages')[0] == (200 if manager else 403))
        check(role + ' CMS write boundary', client.call('/cms-api.php?a=save', {})[0] == (422 if manager else 403))
        check(role + ' editor entry boundary', client.call('/visual-editor.php')[0] == (200 if manager else 403))
        check(role + ' preview boundary', client.call('/visual-preview.php?page=home')[0] == (200 if manager else 403))
        check(role + ' media boundary', client.call('/cms-media.php?a=list')[0] == (200 if manager else 403))
        check(role + ' media mutation boundary', client.call('/cms-media.php?a=update', {})[0] == (422 if manager else 403))
        check(role + ' POS boundary', client.call('/orders-api.php', {'a': 'create', 'pos': True, 'requestId': 'pos-' + role + '-01', 'order': {'items': [{'id': PRODUCT['id'], 'qty': 1}], 'customer': ORDER['customer'], 'shipping': ORDER['shipping'], 'payment': 'CARD', 'totals': {}}})[0] == (201 if manager or role == 'billing' else 403))
    before_orders = (DATA / 'orders.json').read_text()
    check('billing cannot smuggle status through payment update', clients['billing'].call('/orders-api.php', {'a': 'update', 'id': ORDER['id'], 'payment': 'CARD', 'status': 'delivered'})[0] == 403)
    check('mixed forbidden order request changes no fields', (DATA / 'orders.json').read_text() == before_orders)
    rev = clients['inventory_manager'].call('/products-api.php?a=pull')[1]['rev']
    before_products = (DATA / 'products.json').read_text()
    check('inventory cannot smuggle settings through product save', clients['inventory_manager'].call('/products-api.php', {'a': 'push', 'rev': rev, 'productOverrides': {}, 'settings': {'maintenance': True}})[0] == 403)
    check('mixed forbidden product request changes no fields', (DATA / 'products.json').read_text() == before_products)
    google = Client(); google.session()
    status, signed = google.call('/staff-auth.php?a=google', {'idToken': TOKENS['inventory_manager@example.test'], 'email': OWNER, 'role': 'super_admin'})
    check('signed Google email maps to existing managed role and ignores submitted identity', status == 200 and signed.get('role') == 'inventory_manager' and signed.get('email') == 'inventory_manager@example.test')
    check('Google-managed session enforces API permissions', google.call('/staff-users.php?a=list')[0] == 403)
    stranger = Client(); stranger.session()
    check('signed but unprovisioned allowlisted-domain account cannot sign in', stranger.call('/staff-auth.php?a=google', {'idToken': TOKENS['unknown@example.test']})[0] == 403)
    status, signed = stranger.call('/staff-auth.php?a=google', {'idToken': TOKENS[OWNER]})
    check('configured owner retains approved Google sign-in', status == 200 and signed.get('role') == 'super_admin')
    customer = Client(); customer.session()
    status, registered = customer.call('/customer-auth.php', {'a': 'register', 'name': 'Customer Fixture', 'email': 'customer@example.test', 'password': PASSWORD, 'role': 'super_admin'})
    check('customer registration never creates staff privileges', status == 201 and registered.get('user', {}).get('role') == 'customer' and customer.call('/staff-users.php?a=list')[0] == 401)
    # The separate security suite tests rate limiting; reset this synthetic
    # bucket before account lifecycle scenarios require additional sign-ins.
    (DATA / '.rate-staff-login.json').unlink(missing_ok=True)
    billing = accounts['billing']
    status, changed = owner.call('/staff-users.php?a=update', {'id': billing['id'], 'expectedVersion': billing['version'], 'role': 'inventory_manager', 'name': 'Updated Billing'})
    check('role change persists', status == 200 and changed['user']['role'] == 'inventory_manager')
    check('role change immediately revokes old session', clients['billing'].call('/orders-api.php', {'a': 'update', 'id': ORDER['id'], 'payment': 'CARD'})[0] == 401)
    check('stale admin edit rejected', owner.call('/staff-users.php?a=update', {'id': billing['id'], 'expectedVersion': billing['version'], 'name': 'Stale'})[0] == 409)
    billing = changed['user']
    check('updated account signs into new role', clients['billing'].login(billing['email'])[1].get('role') == 'inventory_manager')
    status, deactivated = owner.call('/staff-users.php?a=activate', {'id': billing['id'], 'expectedVersion': billing['version'], 'active': False})
    check('deactivation persists', status == 200 and deactivated['user']['active'] is False)
    check('deactivation revokes existing session', clients['billing'].call('/catalog-api.php', {'a': 'push'})[0] == 401)
    check('inactive account cannot log in', clients['billing'].login(billing['email'])[0] == 401)
    check('inactive managed account cannot use a valid Google token', google.call('/staff-auth.php?a=google', {'idToken': TOKENS['billing@example.test']})[0] == 403)
    billing = deactivated['user']
    status, activated = owner.call('/staff-users.php?a=activate', {'id': billing['id'], 'expectedVersion': billing['version'], 'active': True})
    check('reactivation restores sign-in', status == 200 and clients['billing'].login(billing['email'])[0] == 200)
    billing = activated['user']
    replacement = 'Replacement fixture password 2026!'
    status, updated = owner.call('/staff-users.php?a=update', {'id': billing['id'], 'expectedVersion': billing['version'], 'password': replacement})
    check('password reset revokes active session', status == 200 and clients['billing'].call('/catalog-api.php', {'a': 'push'})[0] == 401)
    check('old password no longer works', clients['billing'].login(billing['email'])[0] == 401)
    check('new password works', clients['billing'].login(billing['email'], replacement)[0] == 200)
    check('customer logout clears new staff identity', clients['billing'].call('/customer-auth.php', {'a': 'logout'})[0] == 200 and clients['billing'].session()['authenticated'] is False)
    check('forged Google identity never grants staff', anonymous.call('/staff-auth.php?a=google', {'idToken': 'invalid', 'email': OWNER, 'role': 'super_admin'})[0] == 401)
    # Remove only new identity fields from a real owner session to mimic a pre-upgrade cookie.
    sid = next(cookie.value for cookie in owner.jar if cookie.name == 'cm_staff')
    subprocess.check_call([str(PHP), '-r', 'session_save_path($argv[1]);session_id($argv[2]);session_start();unset($_SESSION["staff_user_id"],$_SESSION["staff_account_version"]);session_write_close();', str(SESSIONS), sid], stdout=subprocess.DEVNULL)
    check('valid legacy owner session survives upgrade', owner.session().get('role') == 'super_admin')
    stored = (DATA / 'staff-users.json').read_text()
    check('passwords are never stored in plaintext', PASSWORD not in stored and replacement not in stored and 'passwordHash' in stored)
    unicode_password = 'Long staff passphrase: ' + '\u03bb' * 70
    status, unicode_user = owner.call('/staff-users.php?a=create', {'name': 'Unicode Password', 'email': 'unicode@example.test', 'role': 'billing', 'active': True, 'password': unicode_password})
    unicode_client = Client()
    check('managed long Unicode password can be created and used', status == 201 and unicode_client.login('unicode@example.test', unicode_password)[0] == 200)
    check('managed password hashing does not truncate a changed long suffix', unicode_client.login('unicode@example.test', unicode_password[:-1] + '\u03bc')[0] == 401)
    owner_config = (FIXTURE / 'owner.php').read_text()
    (FIXTURE / 'owner.php').write_text("<?php return ['email'=>'','hash'=>''];")
    super_row = accounts['super_admin']
    check('final managed Super Admin cannot deactivate itself when configured owner is unavailable', clients['super_admin'].call('/staff-users.php?a=activate', {'id': super_row['id'], 'expectedVersion': super_row['version'], 'active': False})[0] == 409)
    check('final managed Super Admin cannot demote itself when configured owner is unavailable', clients['super_admin'].call('/staff-users.php?a=update', {'id': super_row['id'], 'expectedVersion': super_row['version'], 'role': 'admin'})[0] == 409)
    (FIXTURE / 'owner.php').write_text(owner_config)
    # Run the existing customer regression assertions against this isolated
    # server; replace only their hardcoded local fixture coordinates/identity.
    customer_suite = (ROOT / 'tests/customer-auth-integration.mjs').read_text()
    customer_suite = customer_suite.replace("const base = 'http://127.0.0.1:4182';", 'const base = ' + json.dumps(URL) + ';')
    customer_suite = customer_suite.replace("const fixture = path.resolve('audit-evidence/customer-auth-fixture');", 'const fixture = ' + json.dumps(str(FIXTURE)) + ';')
    customer_suite = customer_suite.replace("'qa.admin@example.test'", json.dumps(OWNER)).replace("'Local Admin Review 2026!'", json.dumps(PASSWORD))
    (DATA / '.rate-staff-login.json').unlink(missing_ok=True)
    customer_result = subprocess.run(['node', '--input-type=module'], input=customer_suite, text=True, capture_output=True, cwd=ROOT)
    check('existing customer authentication regression suite', customer_result.returncode == 0)
    print(customer_result.stdout.strip())
    if customer_result.returncode:
        print(customer_result.stderr)
finally:
    server.terminate()
    server.wait(timeout=10)
    log.close()
    result = {'checks': results, 'passed': sum(item['pass'] for item in results), 'total': len(results)}
    (ROOT / 'audit/staff-permissions-results.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'passed': result['passed'], 'total': result['total'], 'fixture': str(FIXTURE)}))
if any(not item['pass'] for item in results):
    raise SystemExit(1)
