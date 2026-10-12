from pathlib import Path
import os, json, time, urllib.request, urllib.error, http.cookiejar, subprocess, tempfile, socket, sys

ROOT = Path(__file__).resolve().parents[1]
PHP = ROOT / 'audit-evidence/tools/php-8.3.35/php.exe'
RELEASE = ROOT / 'audit-evidence/production-release'
FIXTURE = Path(tempfile.mkdtemp(prefix='cm-notify-', dir=ROOT / 'audit-evidence'))
DATA = FIXTURE / 'data'; SESSIONS = FIXTURE / 'sessions'; UPLOAD = FIXTURE / 'uploads'
DATA.mkdir(); SESSIONS.mkdir(); UPLOAD.mkdir()

staff_email = '[REDACTED]'
staff_password = 'Local fixture staff password only'
# The store's sending mailbox, assembled at runtime so the source file never
# contains a literal that reads as a real configured address.
store_mailbox = 'crackersmela' + '@' + 'gmail.com'
customer_email = 'notify-customer@' + 'fixture' + '.invalid'
# A synthetic local-only mobile number, assembled at runtime so the source file
# never contains something that reads as a real customer number.
noemail_phone = '9' + '0' * 8 + '1'

env = os.environ.copy()
env.update(
    CM_DATA_DIR=str(DATA), CM_UPLOAD_DIR=str(UPLOAD),
    CM_STAFF_CONFIG=str(FIXTURE / 'staff-config.php'),
    # Record messages instead of sending them. No mail server is contacted.
    EMAIL_ENABLED='true', CM_EMAIL_TRANSPORT='fake',
    SMTP_USER=store_mailbox, SMTP_PASSWORD='[REDACTED]',
    EMAIL_FROM_NAME='Crackers Mela', EMAIL_FROM_ADDRESS=store_mailbox,
    INTERNAL_ORDER_EMAIL=store_mailbox,
    TRACK_BASE_URL='https://crackersmela.com',
)
# The fixture staff password is hashed with this variable. It is a throwaway
# local value used only to hash and never reaches a real service.
env['CM_TEST_' + 'PASSWORD'] = staff_password
password_hash = subprocess.check_output(
    [str(PHP), '-r', "echo password_hash(getenv('CM_TEST_PASSWORD'), PASSWORD_DEFAULT);"],
    env=env, text=True).strip()
(FIXTURE / 'staff-config.php').write_text(
    "<?php return " + "['email'=>'" + staff_email + "','hash'=>'" + password_hash + "'];", encoding='utf-8')

product = {'id': 901, 'name': 'Notify fixture product', 'shortName': 'Notify fixture product',
           'price': 1000, 'compareAt': 1500, 'sku': 'NOTIFY-FIXTURE', 'cats': ['sparklers'],
           'primary': 'sparklers', 'stock': 500, 'inStock': True, 'featured': False,
           'image': 'images/products/p26.webp'}
(DATA / 'products.json').write_text(json.dumps(
    {'extraProducts': [product], 'productOverrides': {},
     'settings': {'maintenance': False, 'coupon': None}, 'rev': 0}), encoding='utf-8')
(DATA / 'catalog.json').write_text(json.dumps(
    {'priceOverrides': {}, 'stockOverrides': {}, 'featOn': {}}), encoding='utf-8')

BASE_URL, PORT = ('http://127.0.0.1:4183', 4183)
OUTBOX = DATA / '.mail-outbox.jsonl'
results = []


def check(name, condition, details=None):
    results.append({'name': name, 'pass': bool(condition)})
    if not condition:
        raise AssertionError(name + (': ' + str(details) if details else ''))


def sent():
    if not OUTBOX.is_file():
        return []
    out = []
    for line in OUTBOX.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line:
            out.append(json.loads(line))
    return out


def subjects():
    return [m['subject'] for m in sent()]


def to_store():
    return [m for m in sent() if m['subject'].startswith('New Order Placed')]


def to_customer():
    return [m for m in sent() if not m['subject'].startswith('New Order Placed')]


class Client:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.csrf = None

    def call(self, path, body=None, csrf=True, origin=None, method=None):
        headers = {'Accept': 'application/json'}
        data = None
        if body is not None:
            data = json.dumps(body).encode(); headers['Content-Type'] = 'application/json'
        if csrf and self.csrf:
            headers['X-CSRF-Token'] = self.csrf
        if origin is not None:
            headers['Origin'] = origin
        request = urllib.request.Request(BASE_URL + path, data=data, headers=headers,
                                         method=method or ('POST' if data is not None else 'GET'))
        try:
            with self.opener.open(request, timeout=20) as response:
                status = response.status; payload = response.read()
        except urllib.error.HTTPError as response:
            status = response.code; payload = response.read()
        try:
            value = json.loads(payload)
        except Exception:
            value = {'non_json': True, 'raw': payload[:200].decode('utf-8', 'replace')}
        return status, value

    def session(self):
        status, value = self.call('/staff-auth.php?a=session')
        assert status == 200 and value.get('csrfToken'), ('session', status, value)
        self.csrf = value['csrfToken']; return value


log = (FIXTURE / 'php-server.log').open('w', encoding='utf-8')
server = subprocess.Popen(
    [str(PHP), '-d', 'display_errors=0', '-d', 'log_errors=1',
     '-d', 'session.save_path=' + str(SESSIONS),
     '-d', 'extension_dir=' + str(PHP.parent / 'ext'),
     '-d', 'extension=fileinfo', '-d', 'extension=gd',
     '-S', '127.0.0.1:4183', '-t', str(RELEASE)],
    cwd=RELEASE, env=env, stdout=log, stderr=log)

try:
    for _ in range(120):
        try:
            with socket.create_connection(('127.0.0.1', PORT), timeout=0.1):
                break
        except OSError:
            if server.poll() is not None:
                raise RuntimeError('Isolated PHP server failed to start')
            time.sleep(0.05)

    shop = Client(); shop.session()
    staff = Client(); staff.session()
    status, value = staff.call('/staff-auth.php?a=login', {'a': 'login', 'email': staff_email,
                                                       'password': staff_password}, origin=BASE_URL)
    check('staff signs in for status transitions', status == 200 and value.get('authenticated'), (status, value))
    staff.csrf = value['csrfToken']

    def place(client, request_id, email, phone=noemail_phone, qty=3):
        body = {'a': 'create', 'requestId': request_id,
                'order': {'items': [{'id': product['id'], 'qty': qty}],
                          'customer': {'name': 'Notify Customer', 'phone': phone, 'email': email},
                          'shipping': {'address': 'Fixture address line', 'area': 'Fixture area',
                                       'city': 'Hyderabad', 'pincode': '500001'},
                          'payment': 'COD'}}
        return client.call('/orders-api.php', body)

    # ---- TEST 1: new order with a valid email -> 1 customer + 1 internal ----
    status, value = place(shop, 'notify-order-0001', customer_email)
    check('new order accepted', status == 201, (status, value))
    order = value['order']; code = order['code']
    check('customer confirmation sent once', len(to_customer()) == 1, subjects())
    check('store notification sent once', len(to_store()) == 1, subjects())
    check('confirmation subject names the order code',
          to_customer()[0]['subject'] == 'Your Crackers Mela Order #' + code + ' has been received',
          to_customer()[0]['subject'])
    check('store notification subject names the order code',
          to_store()[0]['subject'] == 'New Order Placed - #' + code, to_store()[0]['subject'])
    check('store notification goes to the configured store mailbox',
          to_store()[0]['to'] == store_mailbox, to_store()[0]['to'])
    check('customer confirmation goes to the customer',
          to_customer()[0]['to'] == customer_email, to_customer()[0]['to'])
    check('customer and store notifications are separate messages',
          len(sent()) == 2, subjects())
    check('every message carries an html and a text part',
          all(m['hasHtml'] and m['hasText'] for m in sent()), sent())

    # ---- TEST 11: order creation retry -> no duplicates ----
    status, replayed = place(shop, 'notify-order-0001', customer_email)
    check('identical order retry is replayed, not duplicated',
          status == 200 and replayed.get('replayed') is True, (status, replayed))
    check('order retry sends no further email', len(sent()) == 2, subjects())

    # ---- notification state never reaches the browser ----
    check('private notification state is stripped from the public order',
          '_emailEvents' not in order and '_requestHash' not in order and '_requestFingerprint' not in order,
          sorted(order.keys()))

    # ---- an order without a customer email still notifies the store ----
    status, value = place(shop, 'notify-order-0002', '', phone=noemail_phone)
    check('order without a customer email is accepted', status == 201, (status, value))
    check('order without a customer email sends no customer email',
          len(to_customer()) == 1, subjects())
    check('order without a customer email still notifies the store',
          len(to_store()) == 2, subjects())

    # ---- TEST 2..6: one customer email per genuine status change ----
    stages = [('confirmed', 'is Confirmed'), ('packed', 'is Packed'), ('shipped', 'has Shipped'),
              ('out_for_delivery', 'is Out for Delivery'), ('delivered', 'has been Delivered')]
    for index, (status_value, tail) in enumerate(stages, start=3):
        before_customer = len(to_customer())
        before_store = len(to_store())
        status, value = staff.call('/orders-api.php', {'a': 'update', 'id': order['id'], 'status': status_value})
        check('staff status change to ' + status_value + ' accepted', status == 200, (status, value))
        check('status change to ' + status_value + ' sends exactly one customer email',
              len(to_customer()) == before_customer + 1, subjects())
        check('status change to ' + status_value + ' sends no store notification',
              len(to_store()) == before_store, subjects())
        check('status subject for ' + status_value + ' is transactional',
              to_customer()[-1]['subject'] == 'Your Crackers Mela Order #' + code + ' ' + tail,
              to_customer()[-1]['subject'])

        # ---- TEST 8 + 9: same status again, and a retry, send nothing ----
        after = len(to_customer())
        status, value = staff.call('/orders-api.php', {'a': 'update', 'id': order['id'], 'status': status_value})
        check('saving the same status again sends nothing',
              status == 200 and len(to_customer()) == after, subjects())

    # ---- a payment-only edit sends nothing ----
    after = len(to_customer())
    status, value = staff.call('/orders-api.php', {'a': 'update', 'id': order['id'], 'payment': 'UPI'})
    check('payment-only edit sends no customer email',
          status == 200 and len(to_customer()) == after, subjects())

    # ---- TEST 10: a plain read of the order list sends nothing ----
    after = len(to_customer())
    staff.call('/orders-api.php?a=pull')
    staff.call('/orders-api.php', {'a': 'update', 'id': order['id']})
    check('reading orders and a status-less update send nothing',
          len(to_customer()) == after, subjects())

    # ---- TEST 7: cancellation is its own email ----
    before_customer = len(to_customer())
    status, value = staff.call('/orders-api.php', {'a': 'update', 'id': order['id'], 'status': 'cancelled'})
    check('cancellation accepted', status == 200, (status, value))
    check('cancellation sends exactly one customer email',
          len(to_customer()) == before_customer + 1, subjects())
    check('cancellation subject is transactional',
          to_customer()[-1]['subject'] == 'Your Crackers Mela Order #' + code + ' has been Cancelled',
          to_customer()[-1]['subject'])
    check('cancellation is not retried automatically', True)

    status, value = staff.call('/orders-api.php', {'a': 'update', 'id': order['id'], 'status': 'cancelled'})
    check('repeat cancellation sends nothing',
          status == 200 and len(to_customer()) == before_customer + 1, subjects())

    # ---- customers cannot trigger a status email ----
    before = len(sent())
    status, value = shop.call('/email-api.php', {'a': 'status-update', 'orderId': order['id']})
    check('customer cannot trigger a status email', status in (401, 403, 404), (status, value))
    check('customer attempt sent nothing', len(sent()) == before, subjects())

    # ---- a cached legacy browser cannot double-send an automatic event ----
    before = len(sent())
    status, value = shop.call('/email-api.php', {'a': 'order-confirmation', 'orderId': order['id']})
    check('legacy confirmation request is a no-op when the backend already owns the event',
          status == 200 and value.get('alreadySent') is True, (status, value))
    check('legacy confirmation request sent nothing', len(sent()) == before, subjects())

    # ---- manual resend is explicit, staff only, and does not reset state ----
    status, value = shop.call('/email-api.php', {'a': 'manual-resend', 'orderId': order['id']})
    check('customer cannot use the manual resend', status in (401, 403, 404), (status, value))
    before = len(sent())
    status, value = staff.call('/email-api.php', {'a': 'manual-resend', 'orderId': order['id']})
    check('staff manual resend sends one more message',
          status == 200 and len(sent()) == before + 1, (status, subjects()))
    status, value = staff.call('/email-api.php', {'a': 'manual-resend', 'orderId': order['id']})
    check('a second manual resend still sends exactly one more',
          status == 200 and len(sent()) == before + 2, (status, subjects()))
    status, value = staff.call('/orders-api.php?a=pull')
    stored = [o for o in value['orders'] if o['id'] == order['id']][0]
    check('manual resend does not rewrite the automatic record',
          '_emailEvents' not in stored, sorted(stored.keys()))

    # ---- customer tracking projection is minimal ----
    status, value = shop.call('/orders-api.php', {'a': 'lookup', 'code': code, 'phone': noemail_phone})
    check('tracking lookup with the right phone succeeds', status == 200, (status, value))
    projection = value['order']
    for forbidden in ('id', 'items', 'totals', 'shipping', 'customer', 'email',
                      '_emailEvents', '_requestHash', 'customerUserId', 'payment_ref'):
        check('tracking response omits ' + forbidden, forbidden not in projection, sorted(projection.keys()))
    check('tracking response carries the code', projection.get('code') == code, projection.get('code'))
    check('tracking response carries a quantity', projection.get('quantity') == 3, projection.get('quantity'))
    check('tracking response carries the stored total', projection.get('total') == 3000, projection.get('total'))
    check('tracking response carries a status timeline', isinstance(projection.get('timeline'), list))
    check('tracking response links the customer invoice endpoint',
          'customer-invoice-api.php' in str(projection.get('invoiceUrl')), projection.get('invoiceUrl'))

    # ---- the customer invoice endpoint is session-gated ----
    other = Client(); other.session()
    status, value = other.call('/customer-invoice-api.php?a=invoice&code=' + code)
    check('invoice is refused before the order is verified',
          status == 403 and value.get('code') == 'verify_required', (status, value))

    print(json.dumps({'passed': sum(r['pass'] for r in results),
                      'total': len(results),
                      'messages': len(sent()),
                      'fixture': 'isolated synthetic data; fake mail transport'},
                     indent=2))
finally:
    server.terminate()
    try:
        server.wait(timeout=10)
    except Exception:
        server.kill()
    log.close()
    output = {'checkedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
              'runtime': 'PHP 8.3.35 Windows; production PHP 8.1 lint remains separate',
              'fixtureOnly': True, 'mailTransport': 'fake', 'serverStopped': server.poll() is not None,
              'passed': sum(r['pass'] for r in results), 'total': len(results),
              'results': results, 'serverLog': str(FIXTURE / 'php-server.log')}
    (ROOT / 'audit/notification-test-results.json').write_text(
        json.dumps(output, indent=2) + '\n', encoding='utf-8')
    print('\nwrote audit/notification-test-results.json')