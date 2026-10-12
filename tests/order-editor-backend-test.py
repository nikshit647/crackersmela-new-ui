"""Order editor API regressions against isolated synthetic stores and fake mail."""
from pathlib import Path
import copy
import http.cookiejar
import json
import os
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
RELEASE = ROOT / 'audit-evidence/production-release'
PHP = ROOT / 'audit-evidence/tools/php-8.3.35/php.exe'
FIXTURE = Path(tempfile.mkdtemp(prefix='order-editor-', dir=ROOT / 'audit-evidence'))
DATA, SESSIONS = FIXTURE / 'data', FIXTURE / 'sessions'
DATA.mkdir()
SESSIONS.mkdir()
OWNER = 'order.editor@' + 'example.test'
PASSWORD = 'Isolated order editor test only!'
env = dict(os.environ, CM_DATA_DIR=str(DATA), CM_STAFF_CONFIG=str(FIXTURE / 'owner.php'),
           CM_UPLOAD_DIR=str(FIXTURE / 'uploads'), CM_DISABLE_MAIL='1',
           EMAIL_ENABLED='true', CM_EMAIL_TRANSPORT='fake', SMTP_HOST='', SMTP_USER='', SMTP_PASSWORD='')
hashed = subprocess.check_output([str(PHP), '-r', "echo password_hash(getenv('CM_TEST_PASSWORD'), PASSWORD_DEFAULT);"],
                                 env=dict(env, CM_TEST_PASSWORD=PASSWORD), text=True).strip()
(FIXTURE / 'owner.php').write_text("<?php return ['email'=>'" + OWNER + "','hash'=>'" + hashed + "'];")
products = [{'id': n, 'name': 'Fixture product ' + str(n), 'shortName': 'Fixture product ' + str(n),
             'price': price, 'compareAt': price, 'sku': 'ORDER-' + str(n), 'cats': ['sparklers'],
             'primary': 'sparklers', 'stock': 50, 'inStock': True, 'image': ''}
            for n, price in [(9901, 1200), (9902, 500)]]
product_store = {'extraProducts': products, 'productOverrides': {}, 'settings': {'coupon': None}, 'rev': 1}
(DATA / 'products.json').write_text(json.dumps(product_store))
(DATA / 'catalog.json').write_text('{}')
(DATA / 'customers.json').write_text('{"version":1,"accounts":[]}')


def seed(order_id='fixture-order', **extra):
    order = {'id': order_id, 'code': 'FIXTURE-001', 'placedAt': '2026-10-09T08:00:00Z',
             'status': 'placed', 'log': [{'status': 'placed', 'at': '2026-10-09T08:00:00Z'}],
             'items': [dict(products[0], price=1000, compareAt=1500, qty=3)],
             'totals': {'subtotal': 3000, 'saving': 1500, 'delivery': 0, 'couponCode': '',
                        'couponAmt': 0, 'couponSnapshots': [], 'festiveAmt': 0, 'festivePct': 0, 'total': 3000},
             'customer': {'name': 'Synthetic Customer', 'phone': '9876500011', 'email': 'order.customer@example.test',
                          'address': '12 Synthetic Fixture Road', 'area': 'Test Area', 'city': 'Test City', 'pincode': '500001'},
             'shipping': {'address': '12 Synthetic Fixture Road', 'area': 'Test Area', 'city': 'Test City', 'pincode': '500001'},
             'payment': 'COD', 'email': 'order.customer@example.test', '_internalNote': 'STAFF PRIVATE NOTE'}
    order.update(extra)
    (DATA / 'orders.json').write_text(json.dumps({'orders': [order], 'lastSeq': 1}))
    return order


def stored():
    return json.loads((DATA / 'orders.json').read_text())['orders'][0]


def outbox():
    path = DATA / '.mail-outbox.jsonl'
    return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []


with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    PORT = probe.getsockname()[1]
URL = 'http://127.0.0.1:' + str(PORT)
log = (FIXTURE / 'server.log').open('w')
server = subprocess.Popen([str(PHP), '-d', 'display_errors=0', '-d', 'log_errors=1',
                           '-d', 'session.save_path=' + str(SESSIONS), '-S', '127.0.0.1:' + str(PORT),
                           '-t', str(RELEASE)], env=env, stdout=log, stderr=log,
                          creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
results = []


def check(name, value):
    results.append({'name': name, 'pass': bool(value)})
    if not value:
        print('FAIL: ' + name)


class Client:
    def __init__(self):
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = ''

    def call(self, path, body=None):
        headers = {'Content-Type': 'application/json', 'X-CSRF-Token': self.csrf}
        request = urllib.request.Request(URL + path, data=json.dumps(body).encode() if body is not None else None, headers=headers)
        try:
            response = self.opener.open(request, timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        payload = json.loads(response.read())
        self.csrf = payload.get('csrfToken', self.csrf)
        return response.code, payload

    def edit(self, action='edit', **fields):
        return self.call('/orders-api.php', {'a': action, 'id': 'fixture-order', **fields})


try:
    for _ in range(100):
        try:
            with socket.create_connection(('127.0.0.1', PORT), timeout=.1):
                break
        except OSError:
            time.sleep(.05)
    owner = Client()
    owner.call('/staff-auth.php?a=session')
    check('staff authenticates in isolated fixture', owner.call('/staff-auth.php?a=login', {'email': OWNER, 'password': PASSWORD})[0] == 200)
    seed()
    status, pull = owner.call('/orders-api.php')
    check('authorized staff can load the current internal note', status == 200 and pull['orders'][0].get('internalNote') == 'STAFF PRIVATE NOTE')
    before = (DATA / 'orders.json').read_bytes()
    messages = len(outbox())
    status, preview = owner.edit('preview', items=[{'id': 9901, 'qty': 4, 'price': 1}, {'id': 9902, 'qty': 1}], totals={'total': 1})
    check('preview calculates historical and new product prices on the server', status == 200 and preview.get('order', {}).get('totals', {}).get('total') == 4500)
    check('preview never persists or sends mail', before == (DATA / 'orders.json').read_bytes() and len(outbox()) == messages)
    status, _ = owner.edit('preview', items=[{'id': 9901, 'qty': 1}])
    check('preview enforces minimum order rule', status == 409)
    payload = {'items': [{'id': 9901, 'qty': 4}], 'status': 'confirmed', 'requestId': 'logical-save-0001',
               'customer': {'email': 'edited.customer@example.test'}, 'internalNote': 'NEW PRIVATE NOTE'}
    messages = len(outbox())
    status, saved = owner.edit(**payload)
    check('one save persists edited items and status together', status == 200 and stored()['status'] == 'confirmed' and stored()['totals']['total'] == 4000)
    check('customer email mirror follows final saved email', stored()['email'] == 'edited.customer@example.test')
    check('combined detail and status save sends only one customer update', len(outbox()) == messages + 1)
    check('combined update suppresses a duplicate legacy status email', stored().get('_emailEvents', {}).get('ORDER_CONFIRMED', {}).get('state') == 'skipped')
    snapshot, messages = (DATA / 'orders.json').read_bytes(), len(outbox())
    status, replay = owner.edit(**payload)
    check('same logical save is replayed without duplicate history or mail', status == 200 and replay.get('replayed') is True and snapshot == (DATA / 'orders.json').read_bytes() and len(outbox()) == messages)
    status, _ = owner.edit(**dict(payload, note='changed payload'))
    check('reusing a save identifier for different fields is rejected', status == 409)
    messages = len(outbox())
    owner.edit(internalNote='PRIVATE ONLY CHANGE', requestId='private-save-001')
    check('internal note edits do not trigger customer mail', len(outbox()) == messages)
    check('internal note content never appears in customer change summaries', 'Internal note updated' not in stored().get('_editSummary', {}).get('changes', []))
    messages = len(outbox())
    owner.edit(note='Customer-visible note', requestId='customer-save-001')
    check('a later distinct customer edit sends a fresh update email', len(outbox()) == messages + 1)
    snapshot, messages = (DATA / 'orders.json').read_bytes(), len(outbox())
    status, noop = owner.edit(note='Customer-visible note')
    check('no-op save makes no new history or email', status == 200 and noop.get('unchanged') is True and snapshot == (DATA / 'orders.json').read_bytes() and len(outbox()) == messages)
    visitor = Client()
    visitor.call('/staff-auth.php?a=session')
    visitor.call('/orders-api.php', {'a': 'lookup', 'code': 'FIXTURE-001', 'phone': '9876500011'})
    _, public = visitor.call('/orders-api.php')
    check('customer order responses never expose internal notes or save metadata', bool(public.get('orders')) and not any(k in public['orders'][0] for k in ('internalNote', '_internalNote', '_editRequests', 'editHistory')))
    check('preview requires staff authorization', visitor.edit('preview')[0] == 401)
    seed(status='shipped')
    check('shipped item restrictions remain enforced', owner.edit(items=[{'id': 9901, 'qty': 4}])[0] == 409)
    check('shipped tracking and contact changes still work', owner.edit(trackingUrl='https://tracking.example.test/123', customer={'name': 'Updated Customer'})[0] == 200)
    snapshot = (DATA / 'orders.json').read_bytes()
    check('malformed tracking URL is rejected', owner.edit(trackingUrl='https://')[0] == 422)
    check('failed validation preserves the whole saved order', snapshot == (DATA / 'orders.json').read_bytes())
    seed(status='delivered')
    check('terminal order edit restriction remains enforced', owner.edit(note='no')[0] == 409)
    order = seed(source='pos')
    order['totals'].update(posDiscount=200, total=2800)
    seed(**{k: v for k, v in order.items() if k != 'id'})
    owner.edit(note='First POS edit')
    owner.edit(note='Second POS edit')
    check('POS discount survives repeated edits', stored()['totals'].get('posDiscount') == 200 and stored()['totals']['total'] == 2800)
    order = seed()
    order['totals'].update(delivery=100, festiveAmt=150, festivePct=5, total=2950)
    seed(**{k: v for k, v in order.items() if k != 'id'})
    owner.edit(note='Preserve pricing')
    check('contact or note edit preserves delivery and existing festive discount', stored()['totals']['delivery'] == 100 and stored()['totals']['festiveAmt'] == 150 and stored()['totals']['total'] == 2950)
    seed()
    check('unsupported coupon mode is rejected', owner.edit(coupon='typo')[0] == 422)
    check('negative refund amount is rejected', owner.edit(refundAmount='-20')[0] == 422)
    status, coupon = owner.call('/coupons-api.php?a=create', {'code': 'ONLYONCE', 'discountPercentBps': 1000,
                                                         'totalUsageLimit': 1, 'perCustomerUsageLimit': 1})
    check('coupon fixture created', status == 201)
    order = seed()
    order['totals'].update(couponCode='ONLYONCE', couponAmt=300, total=2700,
                           couponSnapshots=[{'couponId': coupon.get('coupon', {}).get('id'), 'code': 'ONLYONCE', 'actualDiscount': 300}])
    seed(**{k: v for k, v in order.items() if k != 'id'})
    status, preview = owner.edit('preview', items=[{'id': 9901, 'qty': 4}], coupon='keep')
    check('keeping a limited coupon does not count the current order twice', status == 200 and preview.get('order', {}).get('totals', {}).get('total') == 3600)
    status, _ = owner.call('/coupons-api.php?a=create', {'code': 'REGISTERED', 'discountPercentBps': 1000,
                                                       'customerEligibility': {'type': 'registered'}})
    seed(customerUserId='cus_fixturecustomer')
    status, preview = owner.edit('preview', coupon='set', couponCode='REGISTERED')
    check('coupon eligibility uses the order customer instead of staff identity', status == 200 and preview.get('order', {}).get('totals', {}).get('total') == 2700)
    seed()
    owner.call('/coupons-api.php?a=create', {'code': 'AUTOMATIC', 'discountPercentBps': 1000, 'automatic': True})
    status, preview = owner.edit('preview', coupon='remove')
    check('remove coupon does not immediately reapply automatic coupons', status == 200 and preview.get('order', {}).get('totals', {}).get('couponCode') == '')
    seed()
    product_store['settings']['emailAuto'] = {'ORDER_UPDATED': {'enabled': False}}
    (DATA / 'products.json').write_text(json.dumps(product_store))
    messages = len(outbox())
    status, saved = owner.edit(note='Automation disabled')
    check('disabled order update automation sends no mail', status == 200 and len(outbox()) == messages and saved.get('email', {}).get('state') == 'disabled')
    messages = len(outbox())
    status, saved = owner.edit(note='Status fallback', status='packed')
    check('status event remains available when update automation is disabled', status == 200 and len(outbox()) == messages + 1 and 'ORDER_PACKED' in stored().get('_emailEvents', {}))
    product_store['settings']['emailAuto'] = {}
    (DATA / 'products.json').write_text(json.dumps(product_store))
    seed()
    if os.name == 'nt':
        # Windows permits reads but refuses rename while a handle lacks delete
        # sharing. This creates a real atomic-write failure without stubbing PHP.
        import ctypes
        from ctypes import wintypes
        create_file = ctypes.windll.kernel32.CreateFileW
        create_file.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, wintypes.LPVOID,
                                wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
        create_file.restype = wintypes.HANDLE
        close_handle = ctypes.windll.kernel32.CloseHandle
        close_handle.argtypes = [wintypes.HANDLE]
        handle = create_file(str(DATA / 'orders.json'), 0x80000000, 3, None, 3, 128, None)
        if handle == wintypes.HANDLE(-1).value:
            raise OSError('Could not lock isolated order file for write-failure test')
        snapshot, messages = (DATA / 'orders.json').read_bytes(), len(outbox())
        try:
            status, failed = owner.edit(note='Must never persist', requestId='persist-failure-001')
        finally:
            close_handle(handle)
        check('failed atomic save leaves the order unchanged and sends no email', status == 503 and snapshot == (DATA / 'orders.json').read_bytes() and len(outbox()) == messages)
        check('same request can succeed after an unpersisted failure', owner.edit(note='Must never persist', requestId='persist-failure-001')[0] == 200)
    seed()
    stale_dispatch = FIXTURE / 'stale-dispatch.php'
    stale_dispatch.write_text("<?php require getenv('CM_RELEASE') . '/cm-email.php'; "
                             "$o=cmOrdersRead()[0]; cmEmailQueueEvent($o, cmEmailEventOrderUpdated(), 'generation-one'); "
                             "cmWriteJson(cmDataDir().'/orders.json',['orders'=>[$o],'lastSeq'=>1]); "
                             "cmEmailDeliverOrder($o); cmEmailDeliverOrder($o);")
    messages = len(outbox())
    subprocess.run([str(PHP), str(stale_dispatch)], env=dict(env, CM_RELEASE=str(RELEASE)), check=True, capture_output=True)
    check('stale concurrent dispatch cannot resend a claimed event', len(outbox()) == messages + 1)
    seed()
    messages = len(outbox())
    subprocess.run([str(PHP), str(stale_dispatch)], env=dict(env, CM_RELEASE=str(RELEASE), EMAIL_ENABLED='false'), check=True, capture_output=True)
    check('transport failure is recorded without claiming delivery', stored().get('_emailEvents', {}).get('ORDER_UPDATED', {}).get('state') == 'failed' and len(outbox()) == messages)
finally:
    server.terminate()
    server.wait(timeout=10)
    log.close()
report = {'passed': sum(row['pass'] for row in results), 'total': len(results), 'results': results,
          'fixture': str(FIXTURE), 'mailTransport': 'fake (local file only)'}
(ROOT / 'audit/order-editor-backend-results.json').write_text(json.dumps(report, indent=2))
print(json.dumps({'passed': report['passed'], 'total': report['total']}))
raise SystemExit(0 if all(row['pass'] for row in results) else 1)
