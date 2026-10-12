"""Coupon compatibility tests: isolated synthetic data, separate sessions, mail disabled."""
from pathlib import Path
import http.cookiejar
import json
import os
import socket
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
RELEASE = ROOT / 'audit-evidence/production-release'
PHP = ROOT / 'audit-evidence/tools/php-8.3.35/php.exe'
FIXTURE = Path(tempfile.mkdtemp(prefix='coupons-backend-', dir=ROOT / 'audit-evidence'))
DATA, SESSIONS = FIXTURE / 'data', FIXTURE / 'sessions'
DATA.mkdir()
SESSIONS.mkdir()
# Fixture identities are assembled at run time so no real contact detail ever
# appears as a literal in this file.
DOMAIN = '@' + 'example.test'


def mail(tag):
    return tag + DOMAIN


STAFF_PASSPHRASE = 'Coupon fixture passphrase 2026!'
CUSTOMER_PASSPHRASE = 'Coupon customer passphrase 2026!'
OWNER = mail('coupon.owner')
BILLING_STAFF = mail('coupon.billing')
ADMIN_STAFF = mail('coupon.admin')
CUSTOMER_ONE = mail('coupon.customer1')
CUSTOMER_TWO = mail('coupon.customer2')
CUSTOMER_THREE = mail('coupon.customer3')
FIXTURE_EMAIL = mail('coupon.fixture')
PHONE_DEFAULT = '98765' + '00011'
PHONE_GUEST_A = '98765' + '00033'
PHONE_GUEST_B = '98765' + '00044'
env = os.environ.copy()
env.update(CM_DATA_DIR=str(DATA), CM_STAFF_CONFIG=str(FIXTURE / 'owner.php'), CM_DISABLE_MAIL='1',
           EMAIL_ENABLED='false', CM_EMAIL_TRANSPORT='fake', CM_UPLOAD_DIR=str(FIXTURE / 'uploads'))
hashed = subprocess.check_output([str(PHP), '-r', "echo password_hash(getenv('CM_TEST_PASSPHRASE'), PASSWORD_DEFAULT);"],
                                 env=dict(env, CM_TEST_PASSPHRASE=STAFF_PASSPHRASE), text=True).strip()
(FIXTURE / 'owner.php').write_text("<?php return ['email'=>'" + OWNER + "','hash'=>'" + hashed + "'];", encoding='utf-8')


def fixture_product(pid, price, cats):
    return {'id': pid, 'name': 'Fixture ' + str(pid), 'shortName': 'Fixture ' + str(pid), 'price': price,
            'compareAt': price, 'sku': 'COUPONFIX-' + str(pid), 'cats': cats, 'primary': cats[0],
            'stock': 500, 'inStock': True, 'featured': False, 'image': ''}


PRODUCTS = [fixture_product(9001, 6000, ['sparklers']), fixture_product(9002, 15000, ['sparklers']),
            fixture_product(9003, 2950, ['sparklers']), fixture_product(9004, 4000, ['flower-pots']),
            fixture_product(9005, 1000, ['flower-pots']), fixture_product(9006, 2499, ['sparklers']),
            fixture_product(9007, 500, ['sparklers'])]
(DATA / 'products.json').write_text(json.dumps({'extraProducts': PRODUCTS, 'productOverrides': {},
                                                 'settings': {'maintenance': False, 'coupon': None}, 'rev': 0}))
(DATA / 'catalog.json').write_text('{}')
(DATA / 'customers.json').write_text(json.dumps({'version': 1, 'accounts': []}))

with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    PORT = probe.getsockname()[1]
URL = 'http://127.0.0.1:' + str(PORT)
log = (FIXTURE / 'server.log').open('w', encoding='utf-8')
server = subprocess.Popen([str(PHP), '-d', 'display_errors=0', '-d', 'log_errors=1',
                           '-d', 'extension_dir=' + str(PHP.parent / 'ext'), '-d', 'extension=fileinfo',
                           '-d', 'session.save_path=' + str(SESSIONS), '-S', '127.0.0.1:' + str(PORT),
                           '-t', str(RELEASE)], cwd=RELEASE, env=env, stdout=log, stderr=log)
results = []


def check(name, condition, details=''):
    results.append({'name': name, 'pass': bool(condition)})
    if not condition:
        print('FAIL: ' + name + (' :: ' + str(details) if details else ''))


class Client:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.csrf = ''

    def call(self, path, body=None, use_token=True, origin=None, method=None):
        headers = {'Accept': 'application/json'}
        if use_token and self.csrf:
            headers['X-CSRF-Token'] = self.csrf
        if origin is not None:
            headers['Origin'] = origin
        data = None if body is None else json.dumps(body).encode()
        if data is not None:
            headers['Content-Type'] = 'application/json'
        request = urllib.request.Request(URL + path, data=data, headers=headers,
                                          method=method or ('POST' if body is not None else 'GET'))
        try:
            response = self.opener.open(request, timeout=20)
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

    def login(self, email, passphrase=STAFF_PASSPHRASE):
        self.session()
        return self.call('/staff-auth.php?a=login', {'email': email, 'password': passphrase})

    def register(self, email):
        return self.call('/customer-auth.php', {'a': 'register', 'name': 'Coupon Customer',
                                                'email': email, 'password': CUSTOMER_PASSPHRASE})


def staff_coupon(client, **fields):
    return client.call('/coupons-api.php?a=create', fields)


def line_state(quote, code):
    for line in quote.get('lines', []):
        if line.get('code') == code:
            return line
    return {}


def order_payload(items, totals=None, phone=PHONE_DEFAULT):
    return {'items': items, 'customer': {'name': 'Coupon Fixture', 'phone': phone, 'email': FIXTURE_EMAIL},
            'shipping': {'address': '12 Coupon Fixture Road', 'area': 'Fixture', 'city': 'Fixture City',
                         'pincode': '500001'}, 'payment': 'COD', 'totals': totals or {}}


def place(client, request_id, items, totals=None, phone=PHONE_DEFAULT, pos=False):
    body = {'a': 'create', 'requestId': request_id, 'order': order_payload(items, totals, phone)}
    if pos:
        body['pos'] = True
    return client.call('/orders-api.php', body)


def quote(client, items, codes=None):
    return client.call('/coupons-api.php?a=quote', {'items': items, 'codes': codes or []})


def item(pid, qty=1):
    return {'id': pid, 'qty': qty}


def coupon_row(client, code):
    for row in client.call('/coupons-api.php?a=list')[1].get('coupons', []):
        if row.get('code') == code:
            return row
    return {}


try:
    for attempt in range(100):
        try:
            with socket.create_connection(('127.0.0.1', PORT), timeout=.1):
                break
        except OSError:
            if server.poll() is not None:
                raise RuntimeError('Isolated PHP server failed to start')
            time.sleep(.05)

    # ---- staff permission boundaries ----
    owner = Client()
    status, identity = owner.login(OWNER)
    check('owner session grants coupons.manage', status == 200 and 'coupons.manage' in identity.get('permissions', []), identity.get('permissions'))
    status, billing_created = owner.call('/staff-users.php?a=create', {'name': 'Coupon Billing', 'email': BILLING_STAFF, 'role': 'billing', 'active': True, 'password': STAFF_PASSPHRASE})
    check('billing fixture account created', status == 201, billing_created)
    billing = Client()
    check('billing fixture account can sign in', billing.login(BILLING_STAFF)[0] == 200)
    status, admin_created = owner.call('/staff-users.php?a=create', {'name': 'Coupon Admin', 'email': ADMIN_STAFF, 'role': 'admin', 'active': True, 'password': STAFF_PASSPHRASE})
    check('admin fixture account created', status == 201, admin_created)
    admin = Client()
    check('admin fixture account can sign in', admin.login(ADMIN_STAFF)[0] == 200)
    anonymous = Client()
    anonymous.session()
    customer_one = Client()
    customer_one.session()
    status, registered = customer_one.register(CUSTOMER_ONE)
    customer_id = registered.get('user', {}).get('id', '')
    check('customer fixture registered', status == 201 and customer_id.startswith('cus_'), registered)

    check('anonymous coupon administration is denied', anonymous.call('/coupons-api.php?a=list')[0] == 401)
    check('a registered customer is not staff for coupons', customer_one.call('/coupons-api.php?a=list')[0] == 401)
    check('a staff role without coupons.manage is refused', billing.call('/coupons-api.php?a=list')[0] == 403)
    status, listing = admin.call('/coupons-api.php?a=list')
    check('a staff role with coupons.manage may list', status == 200 and listing.get('ok') is True, status)
    check('anonymous cannot create a coupon', anonymous.call('/coupons-api.php?a=create', {'code': 'ANON1', 'discountPercentBps': 1000})[0] == 401)
    check('a staff role without coupons.manage cannot create a coupon', billing.call('/coupons-api.php?a=create', {'code': 'BILL1', 'discountPercentBps': 1000})[0] == 403)
    # The third positional argument to call() drops the CSRF header entirely.
    check('coupon creation requires a CSRF token', owner.call('/coupons-api.php?a=create', {'code': 'NOCSRF', 'discountPercentBps': 1000}, False)[0] == 403)
    check('coupon creation rejects a cross-origin request', owner.call('/coupons-api.php?a=create', {'code': 'XORIGIN', 'discountPercentBps': 1000}, origin='https://other.invalid')[0] == 403)
    check('coupon creation cannot use GET', owner.call('/coupons-api.php?a=create')[0] == 405)
    check('an unsupported coupon action is refused', owner.call('/coupons-api.php?a=explode', {})[0] in (400, 405))

    # ---- coupon creation ----
    created = {}

    def make(code, **extra):
        fields = dict(extra)
        fields.setdefault('discountPercentBps', 1000)
        status, payload = staff_coupon(admin, code=code, **fields)
        check('create coupon ' + code, status == 201 and payload.get('coupon', {}).get('id', '').startswith('coupon_'), (status, payload))
        created[code] = payload.get('coupon', {})
        return payload.get('coupon', {})

    save10 = make('SAVE10', internalName='Campaign October', description='10% off qualifying orders')
    make('CAP10', maximumDiscountPaise=100000)
    make('EXPIRED', expiresAt='2020-01-01T00:00:00Z')
    make('FUTURE', startsAt='2099-01-01T00:00:00Z')
    make('OFFLINE', active=False)
    make('MIN5000', minimumOrderPaise=500000)
    make('ONCE', totalUsageLimit=1)
    make('ONCEOPEN', totalUsageLimit=5)
    make('PER1', perCustomerUsageLimit=1)
    make('REGONLY', customerEligibility={'type': 'registered'})
    make('FIRSTONLY', customerEligibility={'type': 'first_order'})
    make('SELONLY', customerEligibility={'type': 'selected', 'customerIds': [customer_id]})
    make('PRODP', productIds=['9001'])
    make('CATP', categoryIds=['flower-pots'])
    make('STACKA')
    make('STACKB')
    make('STACKC', stackingEnabled=True)
    make('STACKD', stackingEnabled=True)
    make('BIGC', discountPercentBps=6000, stackingEnabled=True)
    make('BIGD', discountPercentBps=6000, stackingEnabled=True)
    make('LASTUSE', totalUsageLimit=1, showInCartOffers=False)
    for label, fields in [('an unknown field', {'code': 'REJ1', 'discountPercentBps': 1000, 'discount': 50}),
                          ('a fixed rupee discount field', {'code': 'REJ2', 'discountPercentBps': 1000, 'amountOff': 50}),
                          ('a zero percentage', {'code': 'REJ3', 'discountPercentBps': 0}),
                          ('a percentage above 100', {'code': 'REJ4', 'discountPercentBps': 10001}),
                          ('an unnormalizable code', {'code': 'BAD CODE', 'discountPercentBps': 1000}),
                          ('an over-long code', {'code': 'R' * 41, 'discountPercentBps': 1000}),
                          ('an unsupported audience', {'code': 'REJ5', 'discountPercentBps': 1000, 'customerEligibility': {'type': 'nobody'}}),
                          ('a non-boolean flag', {'code': 'REJ6', 'discountPercentBps': 1000, 'active': 'yes'}),
                          ('an end date before its start', {'code': 'REJ7', 'discountPercentBps': 1000, 'startsAt': '2030-01-01T00:00:00Z', 'expiresAt': '2029-01-01T00:00:00Z'}),
                          ('a malformed date', {'code': 'REJ8', 'discountPercentBps': 1000, 'startsAt': 'soon'}),
                          ('a missing code', {'discountPercentBps': 1000}),
                          ('a missing percentage', {'code': 'REJ9'})]:
        check('reject ' + label, staff_coupon(admin, **fields)[0] == 422, fields)


    # ---- advisory quotes ----
    guest = Client()
    guest.session()
    status, quoted = quote(guest, [item(9001)], ['SAVE10'])
    check('10 percent of 6000 is a 600 discount', status == 200 and quoted['subtotal'] == 6000 and line_state(quoted, 'SAVE10').get('discount') == 600 and quoted['total'] == 5400, quoted)
    status, quoted = quote(guest, [item(9002)], ['CAP10'])
    check('10 percent of 15000 is capped at 1000', line_state(quoted, 'CAP10').get('discount') == 1000 and quoted['total'] == 14000, quoted)
    status, quoted = quote(guest, [item(9001)], ['NOSUCHCODE'])
    check('an unknown code is not_found and changes no total', line_state(quoted, 'NOSUCHCODE').get('state') == 'not_found' and quoted['totalDiscount'] == 0 and quoted['total'] == 6000, quoted)
    for code, state in [('EXPIRED', 'expired'), ('FUTURE', 'not_started'), ('OFFLINE', 'inactive')]:
        status, quoted = quote(guest, [item(9001)], [code])
        check('quote reports ' + state, line_state(quoted, code).get('state') == state, quoted)
    status, quoted = quote(guest, [item(9003)], ['MIN5000'])
    line = line_state(quoted, 'MIN5000')
    check('a short cart reports below_minimum with unlock progress', line.get('state') == 'below_minimum' and line.get('unlockAmount') == 2050 and line.get('progressPercent') == 59, quoted)
    status, quoted = quote(guest, [item(9001)], ['STACKA', 'STACKB'])
    check('a second coupon is refused by default', line_state(quoted, 'STACKB').get('state') == 'stacking_blocked' and quoted['totalDiscount'] == 600 and quoted['acceptedCodes'] == ['STACKA'], quoted)
    status, quoted = quote(guest, [item(9001)], ['STACKC', 'STACKD'])
    check('two stackable coupons both apply', quoted['totalDiscount'] == 1200 and quoted['total'] == 4800 and quoted['acceptedCodes'] == ['STACKC', 'STACKD'], quoted)
    status, quoted = quote(guest, [item(9001)], ['BIGC', 'BIGD'])
    check('a stacked discount never exceeds the cart subtotal', quoted['totalDiscount'] == 6000 and quoted['total'] == 0 and len(quoted['acceptedCodes']) == 2 and line_state(quoted, 'BIGD').get('discount') == 2400, quoted)
    status, quoted = quote(guest, [item(9001)], ['PRODP'])
    check('a product-scoped coupon discounts its own product', line_state(quoted, 'PRODP').get('discount') == 600, quoted)
    status, quoted = quote(guest, [item(9001), item(9004)], ['PRODP'])
    line = line_state(quoted, 'PRODP')
    check('a mixed cart discounts only the qualifying items', line.get('qualifyingSubtotal') == 6000 and line.get('discount') == 600 and quoted['subtotal'] == 10000, quoted)
    status, quoted = quote(guest, [item(9004)], ['PRODP'])
    check('a fully ineligible cart is scope_mismatch', line_state(quoted, 'PRODP').get('state') == 'scope_mismatch' and quoted['totalDiscount'] == 0, quoted)
    status, quoted = quote(guest, [item(9004)], ['CATP'])
    check('a category-scoped coupon discounts its own category', line_state(quoted, 'CATP').get('discount') == 400, quoted)
    status, quoted = quote(guest, [item(9001)], ['REGONLY'])
    check('a registered-only coupon requires sign-in before discounting', line_state(quoted, 'REGONLY').get('state') == 'customer_not_eligible' and quoted['totalDiscount'] == 0, quoted)
    for label, payload in [('a negative quantity', {'items': [item(9001, -1)]}),
                           ('a fractional quantity', {'items': [{'id': 9001, 'qty': 1.5}]}),
                           ('an oversized quantity', {'items': [item(9001, 1000)]}),
                           ('a malformed line', {'items': [{'id': 9001, 'qty': 1, 'price': 1}]})]:
        check('quote rejects ' + label, guest.call('/coupons-api.php?a=quote', payload)[0] == 422, payload)
    check('quote rejects an unknown product', guest.call('/coupons-api.php?a=quote', {'items': [item(9999)]})[0] == 409)
    status, quoted = guest.call('/coupons-api.php?a=quote', {'items': [item(9001)], 'codes': ['SAVE10'], 'subtotal': 1, 'discount': 99999, 'total': 1})
    check('quote ignores submitted money keys', status == 200 and quoted['subtotal'] == 6000 and quoted['totalDiscount'] == 600 and quoted['total'] == 5400, quoted)

    # ---- the order endpoint is authoritative ----
    status, placed = place(admin, 'save10-order-001', [item(9001)], {'couponCode': 'SAVE10'})
    stored = placed.get('order', {})
    totals = stored.get('totals', {})
    snapshot = (totals.get('couponSnapshots') or [{}])[0]
    check('an order applies 10 percent of 6000 as 600', status == 201 and totals.get('couponCode') == 'SAVE10' and totals.get('couponAmt') == 600 and totals.get('total') == 5400, totals)
    check('an order stores an immutable coupon snapshot', snapshot.get('couponId') == save10['id'] and snapshot.get('discountPercent') == 10 and snapshot.get('actualDiscount') == 600, snapshot)
    status, placed = place(admin, 'cap10-order-001', [item(9002)], {'couponCode': 'CAP10'})
    check('an order applies the capped discount', placed['order']['totals']['couponAmt'] == 1000 and placed['order']['totals']['total'] == 14000, placed.get('order', {}).get('totals'))
    status, forged = place(admin, 'forged-order-001', [item(9001)], {'couponCode': 'SAVE10', 'subtotal': 1, 'discount': 99999, 'total': 1, 'couponAmt': 99999})
    totals = forged['order']['totals']
    check('an order ignores forged client money', forged['order']['items'][0]['price'] == 6000 and totals['subtotal'] == 6000 and totals['couponAmt'] == 600 and totals['total'] == 5400, totals)
    check('an order refuses an unknown coupon code', place(admin, 'unknown-code-001', [item(9001)], {'couponCode': 'NOSUCHCODE'})[0] == 422)
    status, first = place(admin, 'once-order-001', [item(9001)], {'couponCode': 'ONCE'})
    check('a limited coupon applies to the first order', status == 201 and first['order']['totals']['couponAmt'] == 600, first.get('order', {}).get('totals'))
    status, replay = admin.call('/orders-api.php', {'a': 'create', 'requestId': 'once-order-001', 'order': order_payload([item(9001)], {'couponCode': 'ONCE'})})
    check('replaying a submission returns the same order', status == 200 and replay.get('replayed') is True and replay['order']['id'] == first['order']['id'], status)
    check('a replay does not consume a second use', coupon_row(admin, 'ONCE').get('usedCount') == 1, coupon_row(admin, 'ONCE'))
    check('a limited coupon refuses the next order', place(admin, 'once-order-002', [item(9001)], {'couponCode': 'ONCE'})[0] == 422)
    check('the 2500 minimum still rejects a smaller pre-coupon subtotal', place(admin, 'min-order-001', [item(9006)], {'couponCode': 'SAVE10'})[0] == 422)
    status, allowed = place(admin, 'min-order-002', [item(9006, 2)], {'couponCode': 'SAVE10'})
    check('the 2500 minimum still allows a valid coupon above it', status == 201 and allowed['order']['totals']['couponAmt'] == 499.8 and allowed['order']['totals']['total'] == 4498.2, allowed.get('order', {}).get('totals'))
    status, pos_order = place(admin, 'pos-order-001', [item(9001)], {'posDiscount': 100, 'couponCode': 'SAVE10'}, pos=True)
    totals = pos_order.get('order', {}).get('totals', {})
    check('a POS order keeps its counter discount and ignores coupons', status == 201 and totals.get('couponCode') == '' and totals.get('couponAmt') == 0 and totals.get('total') == 5900, totals)


    # ---- per-customer limits and audiences ----
    (DATA / '.rate-order-create.json').unlink(missing_ok=True)
    status, _ = place(customer_one, 'per1-user-a-001', [item(9001)], {'couponCode': 'PER1'})
    check('a signed-in customer spends their per-customer allowance', status == 201, status)
    check('a signed-in customer cannot reuse a per-customer coupon', place(customer_one, 'per1-user-a-002', [item(9001)], {'couponCode': 'PER1'})[0] == 422)
    customer_two = Client()
    customer_two.session()
    customer_two.register(CUSTOMER_TWO)
    check('a different customer keeps their own allowance', place(customer_two, 'per1-user-b-001', [item(9001)], {'couponCode': 'PER1'})[0] == 201)
    guest_a = Client()
    guest_a.session()
    check('a guest phone spends a per-customer allowance', place(guest_a, 'per1-guest-a-001', [item(9001)], {'couponCode': 'PER1'}, phone=PHONE_GUEST_A)[0] == 201)
    guest_b = Client()
    guest_b.session()
    check('the same guest phone cannot reuse the coupon', place(guest_b, 'per1-guest-a-002', [item(9001)], {'couponCode': 'PER1'}, phone=PHONE_GUEST_A)[0] == 422)
    guest_c = Client()
    guest_c.session()
    check('a different guest phone keeps its own allowance', place(guest_c, 'per1-guest-b-001', [item(9001)], {'couponCode': 'PER1'}, phone=PHONE_GUEST_B)[0] == 201)
    check('a registered-only coupon refuses a guest', place(guest_c, 'regonly-guest-001', [item(9001)], {'couponCode': 'REGONLY'})[0] == 422)
    check('a registered-only coupon accepts a signed-in customer', place(customer_one, 'regonly-user-001', [item(9001)], {'couponCode': 'REGONLY'})[0] == 201)
    customer_three = Client()
    customer_three.session()
    customer_three.register(CUSTOMER_THREE)
    check('a first-order coupon applies to a new customer', place(customer_three, 'firstonly-001', [item(9001)], {'couponCode': 'FIRSTONLY'})[0] == 201)
    check('a first-order coupon refuses a returning customer', place(customer_three, 'firstonly-002', [item(9001)], {'couponCode': 'FIRSTONLY'})[0] == 422)
    check('a selected-audience coupon applies to a listed customer', place(customer_one, 'selonly-001', [item(9001)], {'couponCode': 'SELONLY'})[0] == 201)
    check('a selected-audience coupon refuses an unlisted customer', place(customer_three, 'selonly-002', [item(9001)], {'couponCode': 'SELONLY'})[0] == 422)

    # ---- the public offers projection ----
    status, offers = guest.call('/coupons-api.php?a=offers&items=9003:1')
    body = json.dumps(offers)
    rows = {row['code']: row for row in offers.get('offers', [])}
    check('offers keep a below-minimum coupon with its unlock progress', status == 200 and rows.get('MIN5000', {}).get('state') == 'below_minimum' and rows['MIN5000'].get('unlockAmount') == 2050 and rows['MIN5000'].get('progressPercent') == 59, sorted(rows))
    check('offers report the canonical cart subtotal', offers.get('cartSubtotal') == 2950, offers.get('cartSubtotal'))
    check('offers hide expired, inactive, future and non-public codes', not ({'EXPIRED', 'OFFLINE', 'FUTURE', 'LASTUSE'} & set(rows)), sorted(rows))
    check('offers hide a used-up coupon', 'ONCE' not in rows, sorted(rows))
    check('offers keep an unused limited coupon', 'ONCEOPEN' in rows, sorted(rows))
    allowed = {'code', 'description', 'discountPercent', 'discountType', 'discountAmount', 'automatic', 'minimumOrderValue', 'maximumDiscount', 'qualifyingSubtotal', 'unlockAmount', 'progressPercent', 'discount', 'state'}
    check('every offer carries only public fields', all(set(row) == allowed for row in offers.get('offers', [])), sorted(allowed))
    for leaked in ('internalName', 'customerIds', 'productIds', 'categoryIds', 'usedCount', 'perCustomerCount', 'totalUsageLimit', 'perCustomerUsageLimit', 'stackingEnabled', 'Campaign October'):
        check('the offers projection hides ' + leaked, leaked not in body)
    status, member_offers = customer_one.call('/coupons-api.php?a=offers&items=9001:1')
    member_rows = {row['code']: row for row in member_offers.get('offers', [])}
    check('a signed-in customer gets a definite audience answer', member_rows.get('REGONLY', {}).get('state') == 'eligible', sorted(member_rows))

    # ---- staff coupon administration ----
    status, made = staff_coupon(admin, code='SAVE20', discountPercentBps=1000, internalName='Second campaign', description='Another public offer')
    save20 = made.get('coupon', {})
    check('create returns version 1 and a server id', status == 201 and save20.get('version') == 1 and save20.get('id', '').startswith('coupon_'), made)
    status, changed = admin.call('/coupons-api.php?a=update', {'id': save20['id'], 'expectedVersion': 1, 'discountPercentBps': 2000, 'description': 'Updated public offer'})
    check('update with the current version succeeds', status == 200 and changed['coupon']['version'] == 2 and changed['coupon']['discountPercentBps'] == 2000, changed.get('coupon'))
    stale = admin.call('/coupons-api.php?a=update', {'id': save20['id'], 'expectedVersion': 1, 'description': 'Stale save'})
    check('a stale expected version is refused', stale[0] == 409 and stale[1].get('code') == 'stale_version', stale)
    check('an unknown coupon id is not found', admin.call('/coupons-api.php?a=update', {'id': 'coupon_' + '0' * 32, 'expectedVersion': 1, 'description': 'x'})[0] == 404)
    duplicate_code = staff_coupon(admin, code='save20', discountPercentBps=1000)
    check('a duplicate code is refused case-insensitively', duplicate_code[0] == 409 and duplicate_code[1].get('code') == 'code_in_use', duplicate_code)
    status, copy = admin.call('/coupons-api.php?a=duplicate', {'id': save20['id'], 'expectedVersion': 2})
    check('duplicate starts blank, inactive and at version 1', status == 201 and copy['coupon']['code'] == '' and copy['coupon']['active'] is False and copy['coupon']['version'] == 1, copy.get('coupon'))
    check('a blank coupon cannot be activated', admin.call('/coupons-api.php?a=set-active', {'id': copy['coupon']['id'], 'expectedVersion': 1, 'active': True})[0] == 422)
    status, deactivated = admin.call('/coupons-api.php?a=set-active', {'id': save20['id'], 'expectedVersion': 2, 'active': False})
    check('set-active persists and bumps the version', status == 200 and deactivated['coupon']['active'] is False and deactivated['coupon']['version'] == 3, deactivated.get('coupon'))
    status, removed = admin.call('/coupons-api.php?a=delete', {'id': save20['id'], 'expectedVersion': 3})
    check('an unused coupon is removed outright', status == 200 and removed.get('archived') is False and coupon_row(admin, 'SAVE20') == {}, removed)

    # ---- order history is immutable ----
    status, snap_order = place(admin, 'immutable-order-001', [item(9001)], {'couponCode': 'SAVE10'})
    stored_order = snap_order['order']
    before = json.dumps(stored_order['totals'], sort_keys=True)
    status, edited = admin.call('/coupons-api.php?a=update', {'id': save10['id'], 'expectedVersion': save10['version'], 'discountPercentBps': 3000, 'internalName': 'Rewritten campaign'})
    check('the used coupon can be edited before archival', status == 200 and edited['coupon']['version'] == save10['version'] + 1, edited.get('coupon'))
    admin.call('/coupons-api.php?a=set-active', {'id': save10['id'], 'expectedVersion': save10['version'] + 1, 'active': False})
    status, archived = admin.call('/coupons-api.php?a=delete', {'id': save10['id'], 'expectedVersion': save10['version'] + 2})
    check('deleting a used coupon archives it instead', status == 200 and archived.get('archived') is True and archived['coupon']['active'] is False, archived.get('coupon'))
    status, pulled = admin.call('/orders-api.php?a=pull')
    reread = next((row for row in pulled.get('orders', []) if row.get('id') == stored_order['id']), {})
    after = json.dumps(reread.get('totals', {}), sort_keys=True)
    check('order coupon history survives the coupon being edited and archived', before == after and reread.get('totals', {}).get('couponCode') == 'SAVE10' and reread.get('totals', {}).get('couponAmt') == 600, after)

    # ---- usage is derived from orders, never a drifting ledger ----
    row = coupon_row(admin, 'ONCE')
    check('staff usage counts come from stored orders', row.get('usedCount') == 1 and row.get('perCustomerCount') == 1 and row.get('effectiveState') == 'used_up', row)
    row = coupon_row(admin, 'PER1')
    check('per-customer usage is derived per identity', row.get('usedCount') == 4 and row.get('perCustomerCount') == 4, row)

    # ---- two orders competing for the last remaining use ----
    (DATA / '.rate-order-create.json').unlink(missing_ok=True)
    outcomes = []

    def race(index):
        racer = Client()
        racer.session()
        outcomes.append(place(racer, 'race-order-00' + str(index), [item(9001)], {'couponCode': 'LASTUSE'})[0])

    threads = [threading.Thread(target=race, args=(index,)) for index in (1, 2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    check('exactly one racing order wins the last remaining use', outcomes.count(201) == 1 and outcomes.count(422) == 1, outcomes)
    row = coupon_row(admin, 'LASTUSE')
    check('a coupon use never exceeds its total limit', row.get('usedCount') == 1, row)
    print(json.dumps({'passed': sum(entry['pass'] for entry in results), 'total': len(results)}, indent=2))
except Exception as error:
    print(type(error).__name__ + ': ' + str(error))
    raise
finally:
    server.terminate()
    try:
        server.wait(timeout=10)
    except subprocess.TimeoutExpired:
        server.kill()
        server.wait()
    log.close()
    output = {'checkedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
              'runtime': 'PHP 8.3.35 Windows; production PHP 8.1 lint is a separate gate',
              'fixtureOnly': True, 'mailDisabled': True, 'serverStopped': server.poll() is not None,
              'passed': sum(entry['pass'] for entry in results), 'total': len(results),
              'results': results, 'fixture': str(FIXTURE), 'serverLog': str(FIXTURE / 'server.log')}
    (ROOT / 'audit/coupons-backend-results.json').write_text(json.dumps(output, indent=2), encoding='utf-8')
    print(json.dumps({'passed': output['passed'], 'total': output['total'], 'fixture': str(FIXTURE)}))
if any(not entry['pass'] for entry in results):
    raise SystemExit(1)
