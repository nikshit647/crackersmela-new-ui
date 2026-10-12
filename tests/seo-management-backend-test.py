"""Isolated SEO API, draft/publication and raw HTML regression checks."""
from pathlib import Path
import argparse
import copy
import hashlib
import http.cookiejar
import json
import os
import re
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, default=ROOT / 'audit-evidence/product-experience-20261010/source')
parser.add_argument('--php', type=Path, default=ROOT / 'audit-evidence/tools/php-8.3.35/php.exe')
args = parser.parse_args()
fixture = Path(tempfile.mkdtemp(prefix='seo-management-test-', dir=ROOT / 'audit-evidence'))
site, data, sessions = [fixture / name for name in ('site', 'data', 'sessions')]
for directory in (site, data, sessions, site / 'js'):
    directory.mkdir(parents=True, exist_ok=True)
for file in args.source.glob('*.php'):
    shutil.copyfile(file, site / file.name)
for name in ('index.html', 'seo-page-defaults.json'):
    if (args.source / name).exists():
        shutil.copyfile(args.source / name, site / name)
for name in ('seo-content.js', 'page-content.js'):
    shutil.copyfile(args.source / 'js' / name, site / 'js' / name)
seed = {'categories': [{'id': 'sparklers', 'name': 'Sparklers'}, {'id': 'flower-pots', 'name': 'Flower Pots'}], 'products': [
    {'id': 901, 'slug': 'seo-test-pack', 'name': 'Test Pack 10 Pcs', 'price': 100, 'compareAt': 1000, 'stock': 8, 'inStock': True,
     'cats': ['sparklers'], 'primary': 'sparklers', 'image': 'images/product.webp', 'images': ['images/product.webp', 'images/second.webp'],
     'desc': 'Actual product description', 'note': '10 pieces per box', 'seoTitle': 'Preserved authored product title', 'seoDesc': 'Preserved authored product description'}]}
(site / 'js/products-data.js').write_text('window.CM_DATA = ' + json.dumps(seed) + ';', encoding='utf-8')
def write(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
write(data / 'products.json', {'extraProducts': [], 'productOverrides': {}, 'settings': {'maintenance': False}, 'rev': 0})
write(data / 'catalog.json', {'priceOverrides': {'901': 77}, 'stockOverrides': {'901': 6}})
write(data / 'categories.json', {'categories': [{'id': 'staff-category', 'name': 'Staff Category', 'blurb': 'Actual new category', 'icon': 'star', 'grad': 'blue'}], 'rev': 1})
globals_record = {'version': 7, 'draft': {'promo': None, 'header': {'id': 'global:header', 'source': 'global:header', 'type': 'native', 'region': 'header', 'content': {}, 'elements': {}, 'styles': {}}, 'footer': None}, 'published': {'promo': None, 'header': None, 'footer': None}, 'savedAt': '2026-10-01T00:00:00Z', 'publishedAt': None}
write(data / 'cms-global-components.json', globals_record)
preserved = {name: (data / name).read_bytes() for name in ('products.json', 'catalog.json', 'categories.json', 'cms-global-components.json')}
password = 'Local SEO fixture only 2026!'
env = dict(os.environ, CM_DATA_DIR=str(data), CM_STAFF_CONFIG=str(fixture / 'staff.php'), CM_DISABLE_MAIL='1', EMAIL_ENABLED='false', CM_TEST_PASSWORD=password)
php = [str(args.php.resolve()), '-d', 'extension_dir=' + str(args.php.resolve().parent / 'ext')]
hashed = subprocess.check_output(php + ['-r', "echo password_hash(getenv('CM_TEST_PASSWORD'), PASSWORD_DEFAULT);"], env=env, text=True).strip()
(fixture / 'staff.php').write_text("<?php return ['email'=>'seo-test@example.test','hash'=>'" + hashed + "'];", encoding='utf-8')
(site / 'test-validate.php').write_text("<?php require __DIR__.'/cm-seo.php'; cmRequirePermission('website.manage',true); $x=cmInput(); $seo=cmCmsSeo($x['seo']); $seo=cmSeoSettingsValidateForPage($seo,$x['page']); cmRespond(200,['ok'=>true,'seo'=>$seo]);", encoding='utf-8')
router = fixture / 'router.php'
router.write_text("""<?php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($path === '/sitemap.xml') require __DIR__.'/site/sitemap.php';
elseif ($path === '/products' || strpos($path,'/product/')===0 || strpos($path,'/category/')===0) require __DIR__.'/site/seo-page.php';
elseif ($path === '/' || preg_match('#^/[a-z-]+$#',$path)) require __DIR__.'/site/cms-page.php';
else return false;
""", encoding='utf-8')
with socket.socket() as reserve:
    reserve.bind(('127.0.0.1', 0))
    port = reserve.getsockname()[1]
origin = 'http://127.0.0.1:' + str(port)
log = (fixture / 'server.log').open('w', encoding='utf-8')
server = subprocess.Popen(php + ['-d', 'display_errors=0', '-d', 'session.save_path=' + str(sessions), '-S', '127.0.0.1:' + str(port), '-t', str(site), str(router)], env=env, cwd=site, stdout=log, stderr=log, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
checks = []
def check(name, condition):
    checks.append({'name': name, 'pass': bool(condition)})
    if not condition:
        raise AssertionError(name)
class Client:
    def __init__(self):
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = ''
    def call(self, route, body=None, token=True, public=False):
        headers = {'Accept': 'application/json', 'Origin': origin}
        if public:
            headers['Host'] = 'crackersmela.com'
        if token and self.csrf:
            headers['X-CSRF-Token'] = self.csrf
        payload = None
        if body is not None:
            headers['Content-Type'] = 'application/json'
            payload = json.dumps(body).encode()
        try:
            response = self.opener.open(urllib.request.Request(origin + route, data=payload, headers=headers), timeout=15)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            raw = response.read().decode('utf-8')
            try:
                value = json.loads(raw)
            except ValueError:
                value = raw
            if isinstance(value, dict) and 'csrfToken' in value:
                self.csrf = value['csrfToken']
            return response.status, value, dict(response.headers)
def seo(title, canonical):
    return {'title': title, 'description': 'A distinct saved description for ' + title + '.', 'focusKeyword': 'specific topic', 'secondaryKeywords': ['One', ' one ', '', 'Two'], 'canonical': canonical, 'ogTitle': 'Share ' + title, 'ogDescription': 'Social description ' + title, 'ogImage': '/uploads/share.webp', 'robots': 'index, follow', 'schemaType': 'auto', 'breadcrumbLabel': title}
def meta(html, name):
    import html as html_module
    match = re.search(r'<meta\b[^>]*(?:name|property)=[\"\']' + re.escape(name) + r'[\"\'][^>]*content=[\"\']([^\"\']*)', html, re.I)
    return html_module.unescape(match.group(1)) if match else None

try:
    for _ in range(100):
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=.1):
                break
        except OSError:
            time.sleep(.05)
    staff, anonymous = Client(), Client()
    staff.call('/staff-auth.php?a=session')
    check('Fixture authentication succeeds', staff.call('/staff-auth.php?a=login', {'email': 'seo-test@example.test', 'password': password})[0] == 200)
    check('Overview requires authentication', anonymous.call('/seo-api.php?a=overview')[0] == 401)
    check('Category writes require authentication', anonymous.call('/seo-api.php?a=save', {'scope': 'category', 'id': 'sparklers', 'expectedVersion': 0, 'seo': {}})[0] == 401)
    check('Authenticated overview works', staff.call('/seo-api.php?a=overview')[0] == 200)
    status, baseline, _ = anonymous.call('/seo-api.php?a=published', public=True)
    check('Public map includes researched defaults', status == 200 and baseline['pages']['home']['focusKeyword'] == 'Buy crackers online in Hyderabad')
    check('Public map has merged staff-created categories', 'staff-category' in baseline['categories'])
    check('Public metadata exposes no draft or CSRF data', not any(key in json.dumps(baseline) for key in ['draft', 'csrfToken', 'expectedVersion']))
    check('Product context preserves authored SEO', staff.call('/seo-api.php?a=context&scope=product&id=901')[1]['seo']['title'] == 'Preserved authored product title')
    status, loaded, _ = staff.call('/seo-api.php?a=load&id=sparklers')
    check('Category starts from its own default and version zero', status == 200 and loaded['version'] == 0 and loaded['seo']['focusKeyword'] == 'sparklers online Hyderabad')
    first = seo('Sparklers custom SEO', 'https://crackersmela.com/category/sparklers')
    request = {'scope': 'category', 'id': 'sparklers', 'expectedVersion': 0, 'seo': first}
    check('Category writes require CSRF', staff.call('/seo-api.php?a=save', request, token=False)[0] == 403)
    check('Unknown target rejected', staff.call('/seo-api.php?a=load&id=missing-category')[0] == 404)
    check('Page writes cannot use category endpoint', staff.call('/seo-api.php?a=save', {**request, 'scope': 'page'})[0] == 422)
    for bad in ['https://evil.test/category/sparklers', 'https://crackersmela.com/about', 'https://admin.crackersmela.com/category/sparklers', 'https://crackersmela.com/category/sparklers?x=1', 'https://crackersmela.com/category/sparklers#x', 'http://crackersmela.com/category/sparklers']:
        check('Reject wrong canonical ' + bad, staff.call('/seo-api.php?a=save', {**request, 'seo': {**first, 'canonical': bad}})[0] == 422)
    for robots in ['index,noindex', 'follow,nofollow']:
        check('Reject conflicting robots ' + robots, staff.call('/seo-api.php?a=save', {**request, 'seo': {**first, 'robots': robots}})[0] == 422)
    check('Secondary keywords require an actual list', staff.call('/seo-api.php?a=save', {**request, 'seo': {**first, 'secondaryKeywords': 'bad'}})[0] == 422)
    check('Focus keyword Unicode character limit enforced', staff.call('/seo-api.php?a=save', {**request, 'seo': {**first, 'focusKeyword': 'a' * 201}})[0] == 422)
    check('Unicode limits count characters rather than bytes', staff.call('/test-validate.php', {'page': 'about', 'seo': {'focusKeyword': 'అ' * 200}})[0] == 200)
    check('Unsupported structured-data scripts rejected', staff.call('/seo-api.php?a=save', {**request, 'seo': {**first, 'schemaType': 'Product'}})[0] == 422)
    status, saved, _ = staff.call('/seo-api.php?a=save', request)
    check('Category save increments version but keeps publication empty', status == 200 and saved['version'] == 1 and saved['published'] is None)
    check('Secondary keywords trim and deduplicate', saved['seo']['secondaryKeywords'] == ['One', 'Two'])
    check('Save draft leaves public map untouched', anonymous.call('/seo-api.php?a=published', public=True)[1] == baseline)
    check('Save draft leaves raw category title untouched', first['title'] not in anonymous.call('/category/sparklers', public=True)[1].split('</head>')[0])
    check('Stale category save is rejected', staff.call('/seo-api.php?a=save', request)[0] == 409)
    check('Stale category publish is rejected', staff.call('/seo-api.php?a=publish', {'scope': 'category', 'id': 'sparklers', 'expectedVersion': 0})[0] == 409)
    status, published, _ = staff.call('/seo-api.php?a=publish', {'scope': 'category', 'id': 'sparklers', 'expectedVersion': 1})
    check('Explicit publish advances only this category', status == 200 and published['version'] == 2 and published['published']['title'] == first['title'])
    public = anonymous.call('/seo-api.php?a=published', public=True)[1]
    check('Published category metadata is public', public['categories']['sparklers']['title'] == first['title'])
    check('Other category and Products metadata unchanged', public['categories']['flower-pots'] == baseline['categories']['flower-pots'] and public['pages']['products'] == baseline['pages']['products'])
    check('Category save/publish preserves global drafts and catalogue bytes', all((data / name).read_bytes() == value for name, value in preserved.items()))
    check('Category save never creates a Products document', not (data / 'cms-pages/products.json').exists())
    reloaded = staff.call('/seo-api.php?a=load&id=sparklers')[1]
    check('Category SEO persists through an independent load', reloaded['version'] == 2 and reloaded['seo']['title'] == first['title'])
    check('A second category retains independent version zero', staff.call('/seo-api.php?a=load&id=flower-pots')[1]['version'] == 0)
    status, html, headers = anonymous.call('/category/sparklers', public=True)
    check('Raw category SEO title published', status == 200 and '<title>' + first['title'] + '</title>' in html)
    check('Canonical is an exact absolute production URL', '<link rel="canonical" href="' + first['canonical'] + '">' in html)
    check('Only one canonical emitted', len(re.findall(r'rel=[\"\']canonical[\"\']', html)) == 1)
    for name, value in [('og:title', first['ogTitle']), ('twitter:title', first['ogTitle']), ('og:description', first['ogDescription']), ('twitter:description', first['ogDescription']), ('og:image', 'https://crackersmela.com/uploads/share.webp'), ('twitter:image', 'https://crackersmela.com/uploads/share.webp'), ('og:url', first['canonical'])]:
        check('Published social field ' + name, meta(html, name) == value)
        check('One tag for ' + name, len(re.findall(r'(?:name|property)=[\"\']' + re.escape(name) + r'[\"\']', html)) == 1)
    check('Category raw schema includes truthful breadcrumbs', 'BreadcrumbList' in html)
    check('Initial HTML has published-only metadata bootstrap', meta(html, 'cm-published-seo') and 'Sparklers custom SEO' in meta(html, 'cm-published-seo'))
    second = {**first, 'title': 'Private newer draft', 'robots': 'noindex, follow'}
    check('A newer category draft saves', staff.call('/seo-api.php?a=save', {**request, 'expectedVersion': 2, 'seo': second})[0] == 200)
    check('Newer draft stays out of public bootstrap', 'Private newer draft' not in anonymous.call('/category/sparklers', public=True)[1])
    sitemap = anonymous.call('/sitemap.xml', public=True)[1]
    check('Draft noindex does not remove sitemap category', 'https://crackersmela.com/category/sparklers' in sitemap)
    check('Staff-created category included in sitemap', 'https://crackersmela.com/category/staff-category' in sitemap)
    check('Noindex category publish succeeds', staff.call('/seo-api.php?a=publish', {'scope': 'category', 'id': 'sparklers', 'expectedVersion': 3})[0] == 200)
    _, html, headers = anonymous.call('/category/sparklers', public=True)
    check('Published noindex reaches raw meta and response header', 'noindex' in meta(html, 'robots') and 'noindex' in headers.get('X-Robots-Tag', ''))
    check('Published noindex category removed from sitemap', 'https://crackersmela.com/category/sparklers' not in anonymous.call('/sitemap.xml', public=True)[1])
    clear = {**first, 'title': 'Updated category SEO', 'canonical': '', 'ogTitle': '', 'ogDescription': '', 'ogImage': '', 'robots': ''}
    check('Cleared optional overrides save independently', staff.call('/seo-api.php?a=save', {**request, 'expectedVersion': 4, 'seo': clear})[0] == 200)
    check('Cleared optional overrides publish', staff.call('/seo-api.php?a=publish', {'scope': 'category', 'id': 'sparklers', 'expectedVersion': 5})[0] == 200)
    _, cleared_html, _ = anonymous.call('/category/sparklers', public=True)
    check('Cleared social overrides follow the current category title', meta(cleared_html, 'og:title') == clear['title'] and meta(cleared_html, 'twitter:title') == clear['title'])
    check('Cleared canonical uses this category route', '<link rel="canonical" href="https://crackersmela.com/category/sparklers">' in cleared_html)
    check('Cleared noindex restores sitemap eligibility', 'https://crackersmela.com/category/sparklers' in anonymous.call('/sitemap.xml', public=True)[1])
    blocked_record = data / 'cms-seo-categories/staff-category.json'
    blocked_record.mkdir()
    before_failure = anonymous.call('/seo-api.php?a=published', public=True)[1]
    failed = staff.call('/seo-api.php?a=save', {'scope': 'category', 'id': 'staff-category', 'expectedVersion': 0, 'seo': {'title': 'Must not commit'}})
    check('Failed atomic record write reports a failure', failed[0] == 503)
    check('Failed write leaves public SEO and unrelated globals unchanged', anonymous.call('/seo-api.php?a=published', public=True)[1] == before_failure and (data / 'cms-global-components.json').read_bytes() == preserved['cms-global-components.json'])
    page_seo = seo('Authored About SEO', 'https://crackersmela.com/about')
    record = {'version': 2, 'publishedVersion': 1, 'publishedAt': '2026-10-01T00:00:00Z', 'savedAt': '2026-10-02T00:00:00Z', 'status': 'published', 'revisions': [], 'published': {'schemaVersion': 1, 'id': 'about', 'seo': page_seo, 'sections': [], 'design': {}}, 'draft': {'schemaVersion': 1, 'id': 'about', 'seo': {**page_seo, 'title': 'About private draft'}, 'sections': [], 'design': {}}}
    write(data / 'cms-pages/about.json', record)
    _, about, _ = anonymous.call('/about', public=True)
    check('Raw page resolves published SEO without leaking draft', '<title>Authored About SEO</title>' in about and 'About private draft' not in about)
    check('One server page head pass keeps social overrides aligned', meta(about, 'og:title') == page_seo['ogTitle'] and meta(about, 'twitter:title') == page_seo['ogTitle'])
    check('Page schema is present and page-specific', 'AboutPage' in about and 'https://crackersmela.com/about' in about)
    record['status'] = 'unpublished'
    write(data / 'cms-pages/about.json', record)
    check('Unpublished pages excluded from public metadata', 'about' not in anonymous.call('/seo-api.php?a=published', public=True)[1]['pages'])
    check('Unpublished clean page returns HTTP404', anonymous.call('/about', public=True)[0] == 404)
    record['status'] = 'published'
    write(data / 'cms-pages/about.json', record)
    wrong_document = copy.deepcopy(record['draft'])
    wrong_document['seo']['canonical'] = 'https://crackersmela.com/contact'
    before_bad_save = (data / 'cms-pages/about.json').read_bytes()
    check('Real CMS API rejects a changed cross-page canonical on save', staff.call('/cms-api.php?a=save', {'page': 'about', 'expectedVersion': 2, 'document': wrong_document})[0] == 422)
    check('Rejected page SEO save leaves page and globals untouched', (data / 'cms-pages/about.json').read_bytes() == before_bad_save and (data / 'cms-global-components.json').read_bytes() == preserved['cms-global-components.json'])
    # Simulate an old canonical already present before this feature, then edit only layout.
    record['draft']['seo'] = {'title': 'Legacy draft title', 'canonical': 'https://crackersmela.com/contact'}
    record['draft']['sections'] = [{'id': 's-seo-preserve', 'type': 'text', 'region': 'main', 'content': {'heading': 'Actual page content', 'text': 'Original page text'}, 'styles': {}, 'elements': {}}]
    write(data / 'cms-pages/about.json', record)
    layout_document = copy.deepcopy(record['draft'])
    layout_document['sections'][0]['content']['text'] = 'An unrelated layout draft edit'
    status, layout_saved, _ = staff.call('/cms-api.php?a=save', {'page': 'about', 'expectedVersion': 2, 'document': layout_document})
    check('Unchanged invalid legacy canonical permits an unrelated layout draft save', status == 200 and layout_saved['version'] == 3)
    check('Layout save preserves published page metadata and content', anonymous.call('/seo-api.php?a=published', public=True)[1]['pages']['about']['title'] == page_seo['title'] and json.loads((data / 'cms-pages/about.json').read_text())['published'] == record['published'])
    before_bad_publish = (data / 'cms-pages/about.json').read_bytes()
    check('Real CMS API rejects invalid legacy SEO at publication', staff.call('/cms-api.php?a=publish', {'page': 'about', 'expectedVersion': 3})[0] == 422)
    check('Rejected publish cannot publish unrelated global drafts', (data / 'cms-global-components.json').read_bytes() == preserved['cms-global-components.json'])
    check('Rejected publication leaves page bytes and version unchanged', (data / 'cms-pages/about.json').read_bytes() == before_bad_publish)
    # Restore the deliberately invalid fixture record for subsequent public checks.
    write(data / 'cms-pages/about.json', {**record, 'draft': {**record['draft'], 'seo': page_seo}})
    legacy_record = copy.deepcopy(record)
    legacy_record['published']['seo']['canonical'] = 'https://crackersmela.com/contact'
    write(data / 'cms-pages/about.json', legacy_record)
    legacy_bytes = (data / 'cms-pages/about.json').read_bytes()
    _, legacy_public, _ = anonymous.call('/seo-api.php?a=published', public=True)
    _, legacy_html, _ = anonymous.call('/about', public=True)
    _, legacy_context, _ = staff.call('/seo-api.php?a=context&scope=page&id=about')
    check('Legacy cross-page canonical never changes effective public route identity', legacy_public['pages']['about']['canonical'] == 'https://crackersmela.com/about' and '<link rel="canonical" href="https://crackersmela.com/about">' in legacy_html and meta(legacy_html, 'og:url') == 'https://crackersmela.com/about')
    check('Legacy canonical issues remain reviewable without a stored-data migration', legacy_context['validationIssues'] and (data / 'cms-pages/about.json').read_bytes() == legacy_bytes)
    write(data / 'cms-pages/about.json', {**record, 'draft': {**record['draft'], 'seo': page_seo}})
    check('Page canonical validation rejects another page', staff.call('/test-validate.php', {'page': 'about', 'seo': {**page_seo, 'canonical': 'https://crackersmela.com/contact'}})[0] == 422)
    check('Empty page canonical remains automatic', staff.call('/test-validate.php', {'page': 'about', 'seo': {**page_seo, 'canonical': ''}})[0] == 200)
    check('Product template SEO cannot block unrelated layout edits', staff.call('/test-validate.php', {'page': 'product', 'seo': {**page_seo, 'canonical': 'https://crackersmela.com/product/old'}})[0] == 200)
    faq_document = {'schemaVersion': 1, 'id': 'faq', 'seo': {**seo('Delivery answers', 'https://crackersmela.com/faq'), 'schemaType': 'FAQPage'}, 'design': {}, 'sections': [
        {'id': 's-published-faq', 'type': 'faq', 'region': 'main', 'content': {'heading': 'Delivery questions', 'items': [{'question': 'Which cities does this published FAQ cover?', 'answer': 'Hyderabad and Secunderabad.'}]}, 'styles': {}, 'elements': {}},
        {'id': 's-hidden-faq', 'type': 'faq', 'region': 'main', 'hidden': True, 'content': {'items': [{'question': 'Hidden draft question?', 'answer': 'This must not be marked up.'}]}, 'styles': {}, 'elements': {}}
    ]}
    status, faq_saved, _ = staff.call('/cms-api.php?a=save', {'page': 'faq', 'expectedVersion': 0, 'document': faq_document})
    saved_faq_section = next((section for section in faq_saved.get('draft', {}).get('sections', []) if section['id'] == 's-published-faq'), {})
    check('Real CMS API saves the actual FAQ items shape', status == 200 and saved_faq_section.get('content', {}).get('items', [{}])[0].get('question') == 'Which cities does this published FAQ cover?')
    check('Unpublished FAQ answers stay out of public markup', 'Which cities does this published FAQ cover?' not in anonymous.call('/faq', public=True)[1])
    faq_publish_status, faq_published, _ = staff.call('/cms-api.php?a=publish', {'page': 'faq', 'expectedVersion': faq_saved['version'], 'expectedGlobalVersion': faq_saved['globals']['version']})
    check('Real CMS API publishes FAQ content and SEO', faq_publish_status == 200)
    _, faq_html, _ = anonymous.call('/faq', public=True)
    faq_graphs = [json.loads(match) for match in re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', faq_html, re.S)]
    faq_nodes = [node for graph in faq_graphs for node in graph.get('@graph', [graph]) if node.get('@type') == 'FAQPage']
    check('Published real FAQ renders visible answer and matching schema', '<summary' in faq_html and 'Hyderabad and Secunderabad.' in faq_html and len(faq_nodes) == 1 and faq_nodes[0]['mainEntity'][0]['name'] == 'Which cities does this published FAQ cover?' and faq_nodes[0]['mainEntity'][0]['acceptedAnswer']['text'] == 'Hyderabad and Secunderabad.')
    check('Hidden FAQ sections contribute no structured questions', len(faq_nodes[0]['mainEntity']) == 1 and 'Hidden draft question?' not in json.dumps(faq_nodes))
    _, product, _ = anonymous.call('/product/seo-test-pack', public=True)
    check('Product authored SEO remains unchanged', '<title>Preserved authored product title | Crackers Mela</title>' in product)
    check('Product schema keeps actual gallery and effective offer', 'https://crackersmela.com/images/second.webp' in product and '"price":77' in product and 'InStock' in product)
    _, filtered, headers = anonymous.call('/products?q=one', public=True)
    check('Filtered listings retain enforced noindex', 'noindex' in meta(filtered, 'robots') and 'noindex' in headers.get('X-Robots-Tag', ''))
    check('All researched informational routes render HTTP200', all(anonymous.call('/' + route, public=True)[0] == 200 for route in ['about', 'contact', 'faq', 'shipping', 'returns', 'terms', 'privacy', 'safety', 'wholesale', 'price-list']))
    check('Catalogue remains byte-for-byte unchanged', all((data / name).read_bytes() == preserved[name] for name in ['products.json', 'catalog.json', 'categories.json']))
    print(json.dumps({'checks': len(checks), 'passed': sum(c['pass'] for c in checks), 'fixture': str(fixture)}))
finally:
    server.terminate()
    server.wait(timeout=10)
    log.close()
    write(fixture / 'results.json', checks)
