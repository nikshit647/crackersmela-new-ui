"""Full-brief coupon regressions against isolated data and real PHP endpoints."""
from pathlib import Path
import copy
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
PHP = Path(os.environ.get('CM_TEST_PHP') or ROOT / 'audit-evidence/tools/php-8.3.35/php.exe')
FIXTURE = Path(tempfile.mkdtemp(prefix='coupon-completion-', dir=ROOT / 'audit-evidence'))
DATA, SESSIONS = FIXTURE / 'data', FIXTURE / 'sessions'
DATA.mkdir(); SESSIONS.mkdir()
env = dict(os.environ, CM_DATA_DIR=str(DATA), CM_STAFF_CONFIG=str(FIXTURE / 'owner.php'), CM_DISABLE_MAIL='1',
           EMAIL_ENABLED='false', CM_EMAIL_TRANSPORT='fake', CM_TEST_PASSPHRASE='Synthetic coupon testing 2026!')
hashed = subprocess.check_output([str(PHP), '-r', "echo password_hash(getenv('CM_TEST_PASSPHRASE'), PASSWORD_DEFAULT);"], env=env, text=True).strip()
(FIXTURE / 'owner.php').write_text("<?php return ['email'=>'coupon-completion@example.invalid','hash'=>'" + hashed + "'];", encoding='utf-8')
products = [{'id': pid, 'name': 'Synthetic product', 'shortName': 'Synthetic product', 'price': price, 'compareAt': price,
             'cats': [category], 'primary': category, 'stock': 500, 'inStock': True, 'image': ''}
            for pid, price, category in [(9901, 6000, 'sparklers'), (9902, 2950, 'sparklers'), (9903, 4000, 'flower-pots'), (9904, 2499, 'sparklers')]]
product_store = {'extraProducts': products, 'productOverrides': {}, 'settings': {'maintenance': False, 'coupon': None}, 'rev': 0}
(DATA / 'products.json').write_text(json.dumps(product_store), encoding='utf-8')
(DATA / 'catalog.json').write_text('{}', encoding='utf-8')
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
origin = 'http://127.0.0.1:' + str(port)
log = (FIXTURE / 'server.log').open('w', encoding='utf-8')
server = subprocess.Popen([str(PHP), '-d', 'display_errors=0', '-d', 'log_errors=1', '-d', 'session.save_path="' + SESSIONS.as_posix() + '"',
                           '-S', '127.0.0.1:' + str(port), '-t', str(RELEASE)], env=env, cwd=RELEASE, stdout=log, stderr=log,
                          creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
results = []
extra_servers = []
def check(name, condition):
    results.append({'name': name, 'pass': bool(condition)})
    if not condition: raise AssertionError(name)

class Client:
    def __init__(self, base=origin):
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())); self.csrf = ''; self.base = base
    def call(self, path, body=None):
        headers = {'Origin': self.base, 'Accept': 'application/json', 'X-CSRF-Token': self.csrf}
        if body is not None: headers['Content-Type'] = 'application/json'
        request = urllib.request.Request(self.base + path, data=json.dumps(body).encode() if body is not None else None, headers=headers)
        try: response = self.opener.open(request, timeout=15)
        except urllib.error.HTTPError as error: response = error
        with response:
            value = json.loads(response.read())
            if value.get('csrfToken'): self.csrf = value['csrfToken']
            return response.status, value
    def quote(self, codes=None, items=None, **options):
        return self.call('/coupons-api.php?a=quote', dict(items=items or [{'id': 9901, 'qty': 1}], codes=codes or [], **options))

def order(client, request_id, codes=None, items=None, **totals):
    return client.call('/orders-api.php', {'a': 'create', 'requestId': request_id, 'order': {
        'items': items or [{'id': 9901, 'qty': 1}], 'customer': {'name': 'Coupon Fixture', 'phone': '9876500991', 'email': 'coupon-order@example.invalid'},
        'shipping': {'address': '12 Synthetic Test Road', 'area': 'Fixture', 'city': 'Hyderabad', 'pincode': '500001'},
        'payment': 'COD', 'totals': dict(couponCodes=codes or [], **totals)}})

def line(value, code): return next((row for row in value.get('lines', []) if row.get('code') == code), {})

try:
    for _ in range(100):
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=.1): break
        except OSError: time.sleep(.05)
    staff, guest, member = Client(), Client(), Client()
    staff.call('/staff-auth.php?a=session'); guest.call('/staff-auth.php?a=session'); member.call('/staff-auth.php?a=session')
    status, _ = staff.call('/staff-auth.php?a=login', {'email': 'coupon-completion@example.invalid', 'password': env['CM_TEST_PASSPHRASE']})
    check('real staff authentication', status == 200)
    status, identity = member.call('/customer-auth.php', {'a': 'register', 'name': 'Coupon Member', 'email': 'coupon-member@example.invalid', 'password': 'Synthetic member passphrase 2026!'})
    check('real customer authentication', status == 201)
    def create(code, **fields):
        status, result = staff.call('/coupons-api.php?a=create', dict(code=code, **fields))
        check('create ' + code, status == 201)
        return result['coupon']
    fixed = create('FIXED500', discountType='fixed', discountAmountPaise=50000, minimumOrderPaise=500000)
    status, contextual_offers = guest.call('/coupons-api.php?a=offers', {'items': [{'id': 9902, 'qty': 1}], 'codes': [], 'excludedAutomaticCodes': []})
    check('offers accept the same cart context as quotes', status == 200 and contextual_offers['offers'][0]['state'] == 'below_minimum' and contextual_offers['offers'][0]['unlockAmount'] == 2050)
    status, quoted = guest.quote(['FIXED500'])
    check('fixed discount is authoritative', status == 200 and quoted['totalDiscount'] == 500 and quoted['total'] == 5500 and line(quoted, 'FIXED500')['discountType'] == 'fixed')
    _, short = guest.quote(['FIXED500'], [{'id': 9902, 'qty': 1}])
    check('fixed minimum reports exact unlock amount', line(short, 'FIXED500')['unlockAmount'] == 2050 and short['totalDiscount'] == 0)
    create('SCOPEFIX', discountType='fixed', discountAmountPaise=900000, productIds=['9903'])
    _, scoped = guest.quote(['SCOPEFIX'], [{'id': 9901, 'qty': 1}, {'id': 9903, 'qty': 1}])
    check('fixed discounts stop at the qualifying product subtotal', scoped['totalDiscount'] == 4000 and scoped['total'] == 6000)
    create('SCOPED80A', discountPercentBps=8000, productIds=['9903'], stackingEnabled=True)
    create('SCOPED80B', discountPercentBps=8000, productIds=['9903'], stackingEnabled=True)
    mixed = [{'id': 9901, 'qty': 1}, {'id': 9903, 'qty': 1}]
    _, overlap = guest.quote(['SCOPED80A', 'SCOPED80B'], mixed)
    check('overlapping scoped coupons cannot discount unrelated products', overlap['totalDiscount'] == 4000 and overlap['total'] == 6000)
    status, overlap_order = order(guest, 'overlapping-scope-order-001', ['SCOPED80A', 'SCOPED80B'], mixed)
    check('scoped order snapshots retain only the actual remaining eligible discount', status == 201 and [value['actualDiscount'] for value in overlap_order['order']['totals']['couponSnapshots']] == [3200, 800])
    for fields in [{'discountType': 'fixed'}, {'discountType': 'fixed', 'discountAmountPaise': 0}, {'discountType': 'fixed', 'discountAmountPaise': 1.5},
                   {'discountType': 'free_delivery', 'discountAmountPaise': 500}, {'discountPercentBps': 0}]:
        check('invalid discount definition is rejected', staff.call('/coupons-api.php?a=create', dict(code='INVALID', **fields))[0] == 422)
    status, placed = order(guest, 'fixed-order-snapshot-001', ['FIXED500'], couponAmt=5999, total=1)
    check('order ignores client money and matches fixed quote', status == 201 and placed['order']['totals']['total'] == quoted['total'])
    snapshot = copy.deepcopy(placed['order']['totals']['couponSnapshots'][0])
    check('fixed snapshot contains actual discount and original fixed amount', snapshot['discountType'] == 'fixed' and snapshot['discountAmount'] == 500 and snapshot['actualDiscount'] == 500)
    status, edited = staff.call('/coupons-api.php?a=update', {'id': fixed['id'], 'expectedVersion': fixed['version'], 'discountAmountPaise': 70000})
    check('fixed coupons can be edited', status == 200)
    _, archived = staff.call('/coupons-api.php?a=delete', {'id': fixed['id'], 'expectedVersion': edited['coupon']['version']})
    saved_order = next(value for value in json.loads((DATA / 'orders.json').read_text())['orders'] if value['id'] == placed['order']['id'])
    check('editing and archiving preserve historical snapshots', archived['archived'] and saved_order['totals']['couponSnapshots'][0] == snapshot)
    row = archived['coupon']
    check('analytics derive actual snapshot discount and order revenue', row['orderCount'] == 1 and row['discountGiven'] == 500 and row['orderRevenue'] == 5500 and row['averageOrderValue'] == 5500)
    status, duplicated = staff.call('/coupons-api.php?a=duplicate', {'id': fixed['id'], 'expectedVersion': archived['coupon']['version']})
    check('fixed duplicate retains discount but starts inactive without a code', status == 201 and duplicated['coupon']['discountType'] == 'fixed' and duplicated['coupon']['discountAmountPaise'] == 70000 and not duplicated['coupon']['active'] and duplicated['coupon']['code'] == '')
    check('partial update cannot activate an incomplete duplicate', staff.call('/coupons-api.php?a=update', {'id': duplicated['coupon']['id'], 'expectedVersion': 1, 'active': True})[0] == 422)
    create('REGONLYNEW', discountPercentBps=1000, customerEligibility={'type': 'registered'})
    create('SELECTEDNEW', discountPercentBps=1000, customerEligibility={'type': 'selected', 'customerIds': [identity['user']['id']]})
    create('RETURNINGNEW', discountPercentBps=1000, customerEligibility={'type': 'returning'})
    create('PERPHONE', discountPercentBps=1000, perCustomerUsageLimit=1)
    status, phone_offers = guest.call('/coupons-api.php?a=offers', {'items': [{'id': 9901, 'qty': 1}], 'customerPhone': '9876500991'})
    phone_rows = {row['code']: row for row in phone_offers.get('offers', [])}
    check('offer eligibility uses the checkout phone without exposing restricted audiences', status == 200 and phone_rows['PERPHONE']['state'] == 'eligible' and not {'REGONLYNEW', 'SELECTEDNEW', 'RETURNINGNEW'} & set(phone_rows))
    check('offers reject malformed checkout phone through the quote validator', guest.call('/coupons-api.php?a=offers', {'items': [{'id': 9901, 'qty': 1}], 'customerPhone': 'invalid'})[0] == 422)
    _, anonymous = guest.quote(['REGONLYNEW', 'SELECTEDNEW'])
    check('guest cannot provisionally receive account-only discounts', anonymous['totalDiscount'] == 0 and all(value['state'] == 'customer_not_eligible' for value in anonymous['lines']))
    _, unknown = guest.quote(['PERPHONE'])
    check('unknown guest usage does not reduce the quote', unknown['totalDiscount'] == 0 and unknown['acceptedCodes'] == [])
    _, known = guest.quote(['PERPHONE'], customerPhone='9876500991')
    check('checkout phone obtains definite guest eligibility', known['totalDiscount'] == 600 and line(known, 'PERPHONE')['state'] == 'eligible')
    check('malformed checkout phone is rejected', guest.quote(['PERPHONE'], customerPhone='letters9876500991')[0] == 422)
    check('automatic exclusions must be an array of codes', guest.quote(excludedAutomaticCodes='PERPHONE')[0] == 422)
    _, offers = guest.call('/coupons-api.php?a=offers&items=9901:1')
    check('public offer discovery hides account-restricted audiences', not {'REGONLYNEW', 'SELECTEDNEW', 'RETURNINGNEW'} & {value['code'] for value in offers['offers']})
    _, returning_guest = guest.quote(['RETURNINGNEW'], customerPhone='9876500991')
    check('returning guest is determined from prior orders', returning_guest['totalDiscount'] == 600)
    _, new_member = member.quote(['RETURNINGNEW'])
    check('new member cannot use a returning-customer coupon', new_member['totalDiscount'] == 0)
    check('minimum order still uses pre-discount subtotal', order(guest, 'minimum-order-unchanged-001', items=[{'id': 9904, 'qty': 1}])[0] == 422)
    # A legacy setting must never bypass an inactive modern coupon with the same code.
    create('SHADOW', discountPercentBps=1000, active=False)
    product_store['settings']['coupon'] = {'code': 'SHADOW', 'discount': 1000}
    (DATA / 'products.json').write_text(json.dumps(product_store))
    check('inactive modern coupon cannot fall through to legacy discount', order(guest, 'legacy-shadow-denied-001', ['SHADOW'])[0] == 422)
    product_store['settings']['coupon'] = {'code': 'LEGACY450', 'discount': 450}
    (DATA / 'products.json').write_text(json.dumps(product_store))
    _, legacy_quote = guest.quote(['LEGACY450'])
    status, legacy_order = order(guest, 'legacy-quote-parity-001', ['LEGACY450'])
    check('legacy store campaign uses the same quote and order evaluator', status == 201 and legacy_quote['totalDiscount'] == 450 and legacy_order['order']['totals']['total'] == legacy_quote['total'])
    product_store['settings']['coupon'] = None; (DATA / 'products.json').write_text(json.dumps(product_store))
    check('automatic promotions cannot disclose private hidden coupons', staff.call('/coupons-api.php?a=create', {'code': 'HIDDENAUTO', 'discountPercentBps': 1000, 'automatic': True, 'showInCartOffers': False})[0] == 422)
    create('AUTOLOW', discountPercentBps=500, automatic=True)
    create('AUTOBEST', discountType='fixed', discountAmountPaise=100000, automatic=True)
    _, automatic = guest.quote()
    check('automatic selection chooses the better independent offer', automatic['acceptedCodes'] == ['AUTOBEST'] and automatic['totalDiscount'] == 1000 and line(automatic, 'AUTOBEST')['automatic'])
    status, auto_order = order(guest, 'automatic-without-code-001')
    check('order applies automatic offer without submitted codes', status == 201 and auto_order['order']['totals']['total'] == automatic['total'])
    _, opted = guest.quote(excludedAutomaticCodes=['AUTOBEST'])
    check('automatic removal is respected and another eligible offer may apply', opted['acceptedCodes'] == ['AUTOLOW'] and opted['totalDiscount'] == 300)
    _, restorable = guest.call('/coupons-api.php?a=offers', {'items': [{'id': 9901, 'qty': 1}], 'codes': [], 'excludedAutomaticCodes': ['AUTOBEST']})
    restorable_rows = {row['code']: row for row in restorable['offers']}
    check('excluded automatic offer is re-evaluated after its own opt-in', restorable_rows['AUTOBEST']['state'] == 'eligible' and restorable_rows['AUTOBEST']['discount'] == 1000)
    check('unchanged automatic selection retains its existing applied eligibility', restorable_rows['AUTOLOW']['state'] == 'eligible' and restorable_rows['AUTOLOW']['discount'] == 300)
    status, opted_order = order(guest, 'automatic-optout-order-001', excludedAutomaticCodes=['AUTOBEST', 'AUTOLOW'])
    check('automatic removal carries through order creation', status == 201 and opted_order['order']['totals']['couponAmt'] == 0)
    _, manual = guest.quote(['SCOPEFIX'], items=[{'id': 9903, 'qty': 1}])
    check('manual nonstackable offer takes priority', manual['acceptedCodes'] == ['SCOPEFIX'])
    status, contextual_offers = guest.call('/coupons-api.php?a=offers', {'items': [{'id': 9903, 'qty': 1}], 'codes': ['SCOPEFIX'], 'excludedAutomaticCodes': []})
    offer_rows = {row['code']: row for row in contextual_offers.get('offers', [])}
    check('offer selector reports current non-stackable coupon conflicts from server rules', status == 200 and offer_rows['SCOPED80A']['state'] == 'stacking_blocked' and offer_rows['AUTOBEST']['state'] == 'stacking_blocked')
    check('current stacking conflict precedes provisional phone instructions', offer_rows['PERPHONE']['state'] == 'stacking_blocked')
    check('already selected coupon remains eligible without testing it twice', offer_rows['SCOPEFIX']['state'] == 'eligible')
    _, fresh_offers = guest.call('/coupons-api.php?a=offers', {'items': [{'id': 9903, 'qty': 1}], 'codes': [], 'excludedAutomaticCodes': []})
    fresh_rows = {row['code']: row for row in fresh_offers['offers']}
    check('manual candidate can replace an automatic offer through existing priority', fresh_rows['SCOPEFIX']['state'] == 'eligible')
    check('unselected lower automatic offer cannot claim a working apply action', fresh_rows['AUTOLOW']['state'] != 'eligible')
    create('AUTOSTACKA', discountPercentBps=1000, automatic=True, stackingEnabled=True)
    create('AUTOSTACKB', discountPercentBps=1000, automatic=True, stackingEnabled=True)
    _, stacked = guest.quote()
    check('automatic selection chooses the best compatible combination deterministically', stacked['acceptedCodes'] == ['AUTOSTACKA', 'AUTOSTACKB'] and stacked['totalDiscount'] == 1200)
    _, suppressed = guest.quote(['AUTOBEST'], excludedAutomaticCodes=['AUTOBEST', 'AUTOLOW', 'AUTOSTACKA', 'AUTOSTACKB'])
    check('exclusions override a stale submitted automatic code', suppressed['totalDiscount'] == 0)
    all_excluded = ['AUTOBEST', 'AUTOLOW', 'AUTOSTACKA', 'AUTOSTACKB']
    status, opted_stale = order(guest, 'stale-auto-exclusion-001', ['AUTOBEST'], excludedAutomaticCodes=all_excluded)
    check('order exclusions override a stale automatic code too', status == 201 and opted_stale['order']['totals']['couponAmt'] == 0)
    check('invalid manual code is not silently dropped beside an automatic discount', order(guest, 'invalid-plus-auto-001', ['UNKNOWNCODE'])[0] == 422)
    create('AUTOLIMITED', discountType='fixed', discountAmountPaise=200000, automatic=True, totalUsageLimit=1)
    _, limited = guest.quote()
    check('limited automatic offer wins while available', limited['acceptedCodes'] == ['AUTOLIMITED'])
    status, limited_order = order(guest, 'limited-automatic-use-001')
    check('automatic usage is recorded in its immutable snapshot', status == 201 and limited_order['order']['totals']['couponSnapshots'][0]['automatic'] and limited_order['order']['totals']['couponSnapshots'][0]['actualDiscount'] == 2000)
    _, exhausted = guest.quote()
    check('exhausted automatic coupon is no longer selected', 'AUTOLIMITED' not in exhausted['acceptedCodes'] and exhausted['totalDiscount'] == 1200)
    check('checkout refuses an automatic coupon exhausted since the quote', order(guest, 'stale-limited-automatic-001', ['AUTOLIMITED'])[0] == 422)
    create('AUTOSCOPE80A', discountPercentBps=8000, automatic=True, productIds=['9903'], stackingEnabled=True)
    create('AUTOSCOPE80B', discountPercentBps=8000, automatic=True, productIds=['9903'], stackingEnabled=True)
    create('AUTO6500', discountType='fixed', discountAmountPaise=650000, automatic=True)
    _, best_scoped = guest.quote(items=mixed)
    check('automatic selection compares realizable scoped discounts instead of double-counting product value', best_scoped['acceptedCodes'] == ['AUTO6500'] and best_scoped['totalDiscount'] == 6500)
    # Separate PHP processes, shared synthetic data: unlike a single built-in
    # server, these requests can overlap inside the application write path.
    create('RACELAST', discountType='fixed', discountAmountPaise=50000, totalUsageLimit=1)
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0)); second_port = sock.getsockname()[1]
    second_log = (FIXTURE / 'second-server.log').open('w', encoding='utf-8')
    second_args = list(server.args); second_args[second_args.index('-S') + 1] = '127.0.0.1:' + str(second_port)
    second = subprocess.Popen(second_args, env=env, cwd=RELEASE, stdout=second_log, stderr=second_log,
                              creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    extra_servers.append((second, second_log))
    for _ in range(100):
        try:
            with socket.create_connection(('127.0.0.1', second_port), timeout=.1): break
        except OSError: time.sleep(.05)
    racers = [Client(), Client('http://127.0.0.1:' + str(second_port))]
    for racer in racers:
        racer.call('/staff-auth.php?a=session')
        check('each independent worker initially quotes the last use as available', racer.quote(['RACELAST'])[1]['acceptedCodes'] == ['RACELAST'])
    barrier = threading.Barrier(2); outcomes = []
    def race(index):
        barrier.wait(timeout=5)
        outcomes.append(order(racers[index], 'multi-worker-last-use-' + str(index), ['RACELAST'])[0])
    threads = [threading.Thread(target=race, args=(index,)) for index in range(2)]
    for thread in threads: thread.start()
    for thread in threads: thread.join(timeout=20)
    check('two independent PHP workers cannot both consume the last use', sorted(outcomes) == [201, 422])
    orders = json.loads((DATA / 'orders.json').read_text())['orders']
    race_snapshots = [snapshot for value in orders for snapshot in value['totals'].get('couponSnapshots', []) if snapshot['code'] == 'RACELAST']
    check('racing usage commits exactly one authoritative order snapshot', len(race_snapshots) == 1 and race_snapshots[0]['actualDiscount'] == 500)
    print(json.dumps({'passed': len(results), 'total': len(results)}))
finally:
    server.terminate(); server.wait(timeout=10); log.close()
    for process, stream in extra_servers:
        process.terminate(); process.wait(timeout=10); stream.close()
    report = ROOT / 'audit-artifacts/coupon-completion-20261007/backend-results.json'
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps({'passed': sum(value['pass'] for value in results), 'total': len(results), 'runtime': PHP.parent.name, 'fixtureOnly': True, 'results': results}, indent=2))
