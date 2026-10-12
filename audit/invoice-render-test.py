"""Local-only invoice regression. Synthetic records; no outbound mail or private API calls."""
from pathlib import Path
import hashlib, http.cookiejar, io, json, os, shutil, socket, subprocess, time, urllib.error, urllib.request, zipfile
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
HERE = ROOT / 'audit-evidence/invoice-render-20261005'
SOURCE = ROOT / 'audit-evidence/production-release'
WEB = HERE / 'web'
WEB.mkdir(exist_ok=True)
(WEB / 'js').mkdir(exist_ok=True)
for file in SOURCE.glob('*.php'):
    shutil.copy2(file, WEB / file.name)
shutil.copy2(SOURCE / 'js/products-data.js', WEB / 'js/products-data.js')
SOURCE_HASHES = {name: hashlib.sha256((WEB / name).read_bytes()).hexdigest() for name in ['cm-invoice.php', 'invoice-api.php', 'customer-invoice-api.php', 'cm-commerce.php', 'cm-security.php', 'orders-api.php']}
STANDARD = json.loads((ROOT / 'audit/invoice-render-standard-order.json').read_text(encoding='utf-8'))
(HERE / 'standard-order.json').write_text(json.dumps(STANDARD, ensure_ascii=False), encoding='utf-8')
LONG = json.loads(json.dumps(STANDARD))
LONG['id'] = 'local-invoice-fixture-2'
LONG['code'] = 'CM-LOCAL-0002'
LONG['items'] = [{'id': 91000 + i, 'name': f'ROW{i:03d} Café celebration product with a longer descriptive name for wrapping validation', 'sku': f'FIXTURE-{i:03d}', 'qty': 2, 'price': 1234.5} for i in range(1, 66)]
LONG['totals'] = {'subtotal': 160485, 'total': 160485, 'delivery': 0}
(HERE / 'long-order.json').write_text(json.dumps(LONG, ensure_ascii=False), encoding='utf-8')

results = []
def check(name, passed, details=None):
    item = {'name': name, 'pass': bool(passed)}
    if details is not None: item['details'] = details
    results.append(item)

def php_command(version):
    exe = ROOT / f'audit-evidence/tools/php-{version}/php.exe'
    command = [str(exe), '-d', 'extension_dir=' + str(exe.parent / 'ext'), '-d', 'extension=mbstring', '-d', 'extension=gd', '-d', 'allow_url_fopen=0', '-d', 'date.timezone=Asia/Kolkata', '-d', 'display_errors=0', '-d', 'log_errors=1']
    if (exe.parent / 'ext/php_zip.dll').is_file(): command += ['-d','extension=zip']
    return command

def env_for(version):
    local = HERE / version
    for part in ['data', 'sessions', 'tmp', 'uploads']:
        (local / part).mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env.update(CM_TEST_INVOICE_SOURCE=str(WEB / 'cm-invoice.php'), CM_INVOICE_FONT_DIR=str(HERE / 'invoice-assets'), CM_INVOICE_MPDF_AUTOLOAD=str(HERE / 'vendor/autoload.php'), CM_INVOICE_MPDF_TMP=str(local / 'tmp'), CM_DATA_DIR=str(local / 'data'), CM_UPLOAD_DIR=str(local / 'uploads'), CM_STAFF_CONFIG=str(local / 'owner.php'), CM_STAFF_GOOGLE_CONFIG=str(local / 'google.php'), CM_DISABLE_MAIL='1', EMAIL_ENABLED='false', CM_EMAIL_TRANSPORT='fake')
    return env, local

def render(version, name):
    env, local = env_for(version)
    output = local / f'{name}.pdf'
    run = subprocess.run(php_command(version) + [str(ROOT / 'audit/invoice-render-harness.php'), str(HERE / f'{name}-order.json'), str(output)], env=env, capture_output=True, text=True)
    try: status = json.loads(run.stdout)
    except Exception: status = {'stdout': run.stdout, 'stderr': run.stderr}
    (local / f'{name}-render.json').write_text(json.dumps(status, indent=2))
    check(f'{version} {name} renderer returns PDF', run.returncode == 0 and output.is_file(), status)
    if output.is_file():
        reader = PdfReader(output)
        content = '\n'.join(page.extract_text() for page in reader.pages)
        (local / f'{name}-text.txt').write_text(content, encoding='utf-8')
        check(f'{version} {name} text contains rupee glyph', '₹' in content)
        check(f'{version} {name} accent glyph survives', 'Café' in content)
        check(f'{version} {name} contains all line items', all(f'ROW{i:03d}' in content for i in range(1,66)) if name == 'long' else 'Festival Sparklers' in content)
        check(f'{version} {name} stored grand total preserved', '1,60,485.00' in content if name == 'long' else '2,950.00' in content)
        check(f'{version} {name} expected pagination', len(reader.pages) >= 3 if name == 'long' else len(reader.pages) == 1, {'pages': len(reader.pages), 'bytes': output.stat().st_size})
        def embedded(font):
            font = font.get_object()
            if font.get('/DescendantFonts'): font = font['/DescendantFonts'][0].get_object()
            descriptor = font.get('/FontDescriptor')
            return descriptor is not None and bool(descriptor.get_object().get('/FontFile2'))
        check(f'{version} {name} fonts embedded', all(embedded(font) for page in reader.pages for font in page['/Resources']['/Font'].values()))
    check(f'{version} {name} renderer emits no warnings', not run.stderr, run.stderr)

class Client:
    def __init__(self, base):
        self.base = base
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = ''
    def call(self, path, body=None):
        headers = {}
        if self.csrf: headers['X-CSRF-Token'] = self.csrf
        if body is not None: headers['Content-Type'] = 'application/json'
        request = urllib.request.Request(self.base + path, data=None if body is None else json.dumps(body).encode(), headers=headers)
        try: response = self.opener.open(request, timeout=60)
        except urllib.error.HTTPError as error: response = error
        payload = response.read()
        headers = dict(response.headers)
        try: value = json.loads(payload)
        except Exception: value = None
        return response.code, value, payload, headers
    def session(self):
        code, value, _, _ = self.call('/staff-auth.php?a=session')
        assert code == 200, value
        self.csrf = value['csrfToken']

def http_checks(version):
    env, local = env_for(version)
    data = local / 'data'
    # Reset only rate counters owned by this synthetic fixture for repeat runs.
    for counter in data.glob('.rate-*.json'):
        assert counter.resolve().is_relative_to(HERE.resolve())
        counter.unlink()
    (data / 'orders.json').write_text(json.dumps({'orders': [STANDARD, LONG]}))
    (data / 'products.json').write_text('{}')
    (data / 'catalog.json').write_text('{}')
    (data / 'customers.json').write_text(json.dumps({'version':1, 'accounts':[]}))
    (local / 'google.php').write_text("<?php return ['emails'=>[], 'domains'=>[]];")
    env['CM_TEST_PASSWORD'] = 'Synthetic invoice owner password only!'
    hashed = subprocess.check_output(php_command(version) + ['-r', "echo password_hash(getenv('CM_TEST_PASSWORD'), PASSWORD_DEFAULT);"], env=env, text=True)
    (local / 'owner.php').write_text("<?php return ['email'=>'invoice-owner@example.test','hash'=>'" + hashed + "'];")
    before = hashlib.sha256((data / 'orders.json').read_bytes()).hexdigest()
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    with (local / 'server.log').open('w') as log:
        server = subprocess.Popen(php_command(version) + ['-d', 'session.save_path=' + str(local / 'sessions'), '-S', f'127.0.0.1:{port}', '-t', str(WEB)], env=env, cwd=WEB, stdout=log, stderr=log)
        try:
            for attempt in range(100):
                try:
                    with socket.create_connection(('127.0.0.1',port),timeout=.2): break
                except OSError: time.sleep(.05)
            anon = Client(base)
            anon.session()
            check(version + ' customer code alone refuses invoice', anon.call('/customer-invoice-api.php?code=CM-LOCAL-0001')[0] == 403)
            check(version + ' invalid customer code rejected', anon.call('/customer-invoice-api.php?code=../secrets')[0] == 400)
            check(version + ' customer POST rejected', anon.call('/customer-invoice-api.php?code=CM-LOCAL-0001', {})[0] == 405)
            check(version + ' anonymous staff invoice rejected', anon.call('/invoice-api.php?id=local-invoice-fixture-1')[0] in (401,403))
            code, value, _, _ = anon.call('/orders-api.php', {'a':'lookup','code':STANDARD['code'],'phone':STANDARD['customer']['phone']})
            check(version + ' synthetic phone lookup grants own invoice', code == 200)
            code, _, pdf, headers = anon.call('/customer-invoice-api.php?code=CM-LOCAL-0001')
            check(version + ' verified customer downloads PDF', code == 200 and pdf.startswith(b'%PDF-'), {'status':code,'contentType':headers.get('Content-Type')})
            if pdf.startswith(b'%PDF-'): (local / 'customer-api.pdf').write_bytes(pdf)
            check(version + ' customer PDF headers safe', headers.get('Content-Type') == 'application/pdf' and 'no-store' in headers.get('Cache-Control','') and headers.get('X-Content-Type-Options') == 'nosniff' and headers.get('Content-Disposition') == 'attachment; filename="Invoice-CM-LOCAL-0001.pdf"')
            check(version + ' verifying one order does not unlock another', anon.call('/customer-invoice-api.php?code=CM-LOCAL-0002')[0] == 403)
            staff = Client(base)
            staff.session()
            code, value, _, _ = staff.call('/staff-auth.php?a=login', {'email':'invoice-owner@example.test','password':env['CM_TEST_PASSWORD']})
            check(version + ' local owner login succeeds', code == 200)
            staff.csrf = value.get('csrfToken',staff.csrf)
            check(version + ' staff invoice missing CSRF rejected', staff.call('/invoice-api.php?id=local-invoice-fixture-1')[0] == 403)
            check(version + ' staff cannot use customer endpoint', staff.call('/customer-invoice-api.php?code=CM-LOCAL-0001')[0] == 403)
            code, _, pdf, headers = staff.call('/invoice-api.php?id=local-invoice-fixture-1&csrf=' + staff.csrf)
            check(version + ' staff single PDF succeeds', code == 200 and pdf.startswith(b'%PDF-'))
            if pdf.startswith(b'%PDF-'): (local / 'staff-api.pdf').write_bytes(pdf)
            code, _, payload, headers = staff.call('/invoice-api.php?ids=local-invoice-fixture-1,local-invoice-fixture-2&csrf=' + staff.csrf)
            check(version + ' bulk invoice ZIP succeeds', code == 200 and headers.get('Content-Type') == 'application/zip')
            if payload.startswith(b'PK'):
                (local / 'bulk-invoices.zip').write_bytes(payload)
                with zipfile.ZipFile(io.BytesIO(payload)) as archive:
                    check(version + ' ZIP contains both complete PDFs', sorted(archive.namelist()) == ['Invoice-CM-LOCAL-0001.pdf','Invoice-CM-LOCAL-0002.pdf'] and all(archive.read(n).startswith(b'%PDF-') for n in archive.namelist()))
            check(version + ' orders unchanged by downloads', before == hashlib.sha256((data / 'orders.json').read_bytes()).hexdigest())
            check(version + ' no email outbox written', not (data / '.mail-outbox.jsonl').exists())
        finally:
            server.terminate()
            server.wait(timeout=10)
    server_log = (local / 'server.log').read_text()
    check(version + ' HTTP renderer emits no warnings or errors', not any(marker in server_log for marker in ['Warning:', 'Fatal error:', 'Notice:', 'Deprecated:', 'CrackersMela:']))

# Main regression uses external fonts only. Remove the known diagnostic aliases.
for name in ['cmregular.ttf','cmregular-bold.ttf']:
    alias = HERE / 'vendor/mpdf/mpdf/ttfonts' / name
    if alias.exists():
        assert alias.resolve().is_relative_to(HERE.resolve())
        assert hashlib.sha256(alias.read_bytes()).digest() == hashlib.sha256((HERE / 'invoice-assets' / name).read_bytes()).digest()
        alias.unlink()

for version in ['8.1.34','8.3.35']:
    render(version, 'standard')
    render(version, 'long')
    http_checks(version)

report = {'scope':'Synthetic local records only; no live data, mail, deployment, or private API.', 'sourceSha256':SOURCE_HASHES, 'dependency':'Official mpdf/mpdf 8.3.1 with official full DejaVu fonts copied under custom names into isolated external invoice-assets directory. No custom fonts remain in vendor default ttfonts.', 'knownLimitations':['Production mPDF version and font placement are unknown.','Candidate logo-invoice.png is absent; visual render uses text logo fallback.'], 'results':results, 'passed':sum(x['pass'] for x in results), 'failed':sum(not x['pass'] for x in results)}
(HERE / 'results.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({'passed':report['passed'],'failed':report['failed'],'failures':[x for x in results if not x['pass']]}))
raise SystemExit(1 if report['failed'] else 0)
