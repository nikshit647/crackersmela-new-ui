"""Isolated SEO SSR and field migration regression checks; no orders or mail."""
from pathlib import Path
import copy
import html
import json
import os
import re
import shutil
import socket
import stat
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'audit-evidence/production-release'
BEFORE = ROOT / 'audit-artifacts/seo-editor-20261007/seo-before'
PLAN = ROOT / 'audit-artifacts/seo-editor-20261007/product-seo-plan.json'
PHP = ROOT / 'audit-evidence/tools/php-8.3.35/php.exe'
MIGRATION = ROOT / 'audit/migrate-product-seo.php'
checks = 0

def check(condition, message):
    global checks
    if not condition:
        raise AssertionError(message)
    checks += 1

def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')

with tempfile.TemporaryDirectory(prefix='cm-seo-test-') as tmp:
    fixture = Path(tmp)
    web, data, backups = (fixture / name for name in ('public', 'data', 'backups'))
    for directory in (web, data, backups, web / 'js'):
        directory.mkdir()
    for name in ('cm-security.php','cm-commerce.php','cm-cms.php','cm-seo.php','seo-page.php','cms-page.php','cms-sitemap.php','sitemap.php','robots.php','robots.txt','index.html'):
        shutil.copyfile(BASE / name, web / name)
    for name in ('products-data.js','seo-content.js','seo-runtime.js'):
        shutil.copyfile(BASE / 'js' / name, web / 'js' / name)
    for source, target in [('products-api.php_a_pull','products.json'), ('catalog-api.php_a_pull','catalog.json')]:
        payload = read(BEFORE / source)
        payload.pop('ok', None)
        write(data / target, payload)
    original = (data / 'products.json').read_bytes()
    os.chmod(data / 'products.json', 0o640)
    original_stat = (data / 'products.json').stat()
    catalog_original = (data / 'catalog.json').read_bytes()
    base_original = (web / 'js/products-data.js').read_bytes()
    plan = read(PLAN)
    command = [str(PHP), str(MIGRATION), '--root=' + str(web), '--data-dir=' + str(data)]
    def migrate(*args, ok=True):
        result = subprocess.run(command + list(args), capture_output=True, text=True, encoding='utf-8')
        check(result.returncode == (0 if ok else 2), 'Migration exit status: ' + result.stderr[:240])
        return json.loads(result.stdout if ok else result.stderr)
    dry = migrate('--plan=' + str(PLAN))
    check(dry['products'] == 117 and dry['changedProducts'] == 117 and dry['dryRun'], 'Complete dry-run inventory')
    check((data / 'products.json').read_bytes() == original, 'Dry run leaves store unchanged')
    # Concurrent/new manual values must be rejected before any write.
    source = read(data / 'products.json')
    identifier = str(plan['changes'][0]['id'])
    modified = copy.deepcopy(source)
    modified['productOverrides'][identifier]['seoDesc'] = 'A later manual description.'
    write(data / 'products.json', modified)
    conflict_bytes = (data / 'products.json').read_bytes()
    conflict = migrate('--plan=' + str(PLAN), '--backup-dir=' + str(backups), '--apply', ok=False)
    check('Source conflict' in conflict['error'] and (data / 'products.json').read_bytes() == conflict_bytes, 'Manual edit conflict is non-destructive')
    modified = copy.deepcopy(source)
    modified['extraProducts'].append({'id':99999999,'name':'New product','slug':'new-product','price':1,'stock':1})
    write(data / 'products.json', modified)
    check('Inventory changed' in migrate('--plan=' + str(PLAN), ok=False)['error'], 'Added product refuses incomplete inventory plan')
    (data / 'products.json').write_bytes(original)
    bad_plan = copy.deepcopy(plan)
    bad_plan['changes'][0]['changes']['price'] = 1
    write(fixture / 'bad-plan.json', bad_plan)
    check('forbidden' in migrate('--plan=' + str(fixture / 'bad-plan.json'), ok=False)['error'], 'Price mutation rejected')
    applied = migrate('--plan=' + str(PLAN), '--backup-dir=' + str(backups), '--apply')
    check(applied['applied'] and applied['products'] == 117, 'All products persisted')
    after_stat = (data / 'products.json').stat()
    check((stat.S_IMODE(after_stat.st_mode), after_stat.st_uid, after_stat.st_gid) == (stat.S_IMODE(original_stat.st_mode), original_stat.st_uid, original_stat.st_gid), 'Migration preserves store permissions and owner/group')
    saved = read(data / 'products.json')
    fields = {'seoTitle','seoDesc','seoKeywords','seoSlug','seoTags','desc'}
    for row in plan['changes']:
        identifier = str(row['id'])
        desired = {**row['expectedProduct'], **row['changes']}
        override = saved['productOverrides'][identifier]
        check(all(override[field] == desired[field] and str(override[field]).strip() for field in fields), 'Saved admin fields ' + identifier)
        check(desired['slug'] == row['slug'], 'Stable public slug ' + identifier)
        before_override = source['productOverrides'].get(identifier, {})
        check({k:v for k,v in override.items() if k not in fields} == {k:v for k,v in before_override.items() if k not in fields}, 'Preserved other product fields ' + identifier)
    check(saved['extraProducts'] == source['extraProducts'] and saved['settings'] == source['settings'] and saved['rev'] == source['rev'] + 1, 'Preserved settings/extra product source; bumped revision once')
    applied_bytes = (data / 'products.json').read_bytes()
    repeated = migrate('--plan=' + str(PLAN), '--backup-dir=' + str(backups), '--apply')
    check(repeated['idempotent'] and repeated['changedProducts'] == 0 and (data / 'products.json').read_bytes() == applied_bytes, 'Repeat is byte-for-byte idempotent')
    check((data / 'catalog.json').read_bytes() == catalog_original and (web / 'js/products-data.js').read_bytes() == base_original, 'Inventory and seed never written')
    # Whole-store rollback is guarded by the exact after checksum.
    edited = copy.deepcopy(saved)
    edited['settings']['maintenance'] = not bool(edited['settings'].get('maintenance'))
    write(data / 'products.json', edited)
    check('Rollback refused' in migrate('--rollback=' + applied['receipt'], ok=False)['error'], 'Rollback refuses newer store edits')
    (data / 'products.json').write_bytes(applied_bytes)
    migrate('--rollback=' + applied['receipt'])
    check((data / 'products.json').read_bytes() == original, 'Rollback restores exact original bytes')
    restored_stat = (data / 'products.json').stat()
    check((stat.S_IMODE(restored_stat.st_mode), restored_stat.st_uid, restored_stat.st_gid) == (stat.S_IMODE(original_stat.st_mode), original_stat.st_uid, original_stat.st_gid), 'Rollback preserves store permissions and owner/group')
    applied = migrate('--plan=' + str(PLAN), '--backup-dir=' + str(backups), '--apply')

    env = os.environ.copy()
    env.update(CM_DATA_DIR=str(data), CM_DISABLE_MAIL='1', EMAIL_ENABLED='false')
    router = fixture / 'router.php'
    router.write_text("""<?php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($path === '/robots.txt') require __DIR__ . '/public/robots.php';
elseif ($path === '/sitemap.xml') require __DIR__ . '/public/sitemap.php';
elseif (preg_match('#^/(product/|products/?$|category/)#', $path)) require __DIR__ . '/public/seo-page.php';
elseif ($path === '/' || in_array($path, ['/about','/contact','/privacy','/sample-page','/alias-page'])) require __DIR__ . '/public/cms-page.php';
else return false;
""", encoding='utf-8')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    server_log = (fixture / 'server.log').open('wb')
    server = subprocess.Popen([str(PHP), '-S', '127.0.0.1:' + str(port), '-t', str(web), str(router)], env=env, stdout=server_log, stderr=server_log)
    origin = 'http://127.0.0.1:' + str(port)
    def request(path, host='crackersmela.com', method='GET'):
        request = urllib.request.Request(origin + path, method=method, headers={'Host':host})
        try:
            response = urllib.request.urlopen(request, timeout=8)
        except urllib.error.HTTPError as error:
            response = error
        return response.status, response.headers, response.read().decode('utf-8')
    def schemas(document):
        return [json.loads(raw) for raw in re.findall(r'<script\b[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', document, re.S)]
    def tag(document, selector, name):
        tag = re.search(r'<'+selector+r'\b[^>]*'+name+r'[^>]*>', document)
        return html.unescape(re.search(r'(?:content|href)="([^"]*)"', tag[0])[1]) if tag else None
    def urls(document):
        return {element.text for element in ET.fromstring(document).findall('{*}url/{*}loc')}
    try:
        for attempt in range(50):
            try:
                request('/robots.txt')
                break
            except OSError:
                time.sleep(.05)
        # Compare every direct Product and category JSON-LD with the browser resolver.
        expected_products = [{**row['expectedProduct'], **row['changes']} for row in plan['changes']]
        categories = read(BEFORE / 'categories.json')
        parity_input = fixture / 'parity.json'
        write(parity_input, {'products':expected_products,'categories':categories})
        node_script = """const fs=require('node:fs'),vm=require('node:vm'); const c={window:{}};vm.createContext(c);
vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c);vm.runInContext(fs.readFileSync(process.argv[2],'utf8'),c);
const input=JSON.parse(fs.readFileSync(process.argv[3],'utf8')), r=c.window.CM_SEO_RUNTIME;
console.log(JSON.stringify({products:input.products.map(p=>({meta:r.resolveProduct(p,input.categories),schema:r.productSchema(p,input.categories),breadcrumbs:r.breadcrumbs(p,input.categories)})),categories:input.categories.map(cat=>r.categorySchema(cat,input.products))}));"""
        parity = json.loads(subprocess.check_output(['node','-e',node_script,str(web/'js/seo-content.js'),str(web/'js/seo-runtime.js'),str(parity_input)], encoding='utf-8'))
        for product, browser in zip(expected_products, parity['products']):
            status, headers, document = request('/product/' + product['slug'])
            check(status == 200, 'Product direct response ' + str(product['id']))
            nodes = schemas(document)
            product_nodes = [n for n in nodes if n.get('@type') == 'Product']
            breadcrumb_nodes = [n for n in nodes if n.get('@type') == 'BreadcrumbList']
            differing = [key for key in browser['schema'] if not product_nodes or product_nodes[0].get(key) != browser['schema'][key]]
            check(product_nodes == [browser['schema']] and breadcrumb_nodes == [browser['breadcrumbs']], 'SSR/browser schema parity ' + str(product['id']) + ', differing fields: ' + str(differing))
            check(tag(document, 'link', r'rel="canonical"') == browser['meta']['canonical'], 'Product canonical ' + str(product['id']))
            check(tag(document, 'meta', r'name="description"') == browser['meta']['seoDesc'], 'Product metadata ' + str(product['id']))
            check(len(re.findall(r'<h1\b', document)) == 1 and '<script src="js/app.js' in document, 'Crawlable heading and storefront preserved')
            check('aggregateRating' not in product_nodes[0] and 'review' not in product_nodes[0], 'No unsupported reviews')
        # The optional generated overlay must also match before persistence,
        # including legacy source characters covered by its source fingerprint.
        migrated_bytes = (data / 'products.json').read_bytes()
        (data / 'products.json').write_bytes(original)
        for product, browser in zip(expected_products, parity['products']):
            nodes = schemas(request('/product/' + product['slug'])[2])
            check([n for n in nodes if n.get('@type') == 'Product'] == [browser['schema']], 'Generated pre-migration source parity ' + str(product['id']))
        (data / 'products.json').write_bytes(migrated_bytes)
        for category, browser_schema in zip(categories, parity['categories']):
            status, headers, document = request('/category/' + category['id'])
            check(status == 200 and [n for n in schemas(document) if n.get('@type') == 'CollectionPage'] == [browser_schema], 'Category schema parity ' + category['id'])
        status, headers, document = request('/')
        check(status == 200 and len(re.findall(r'<h1\b', document)) == 1, 'Homepage initial heading')
        check(all('/product/' + p['slug'] in document for p in expected_products) and all('/category/' + c['id'] in document for c in categories), 'Homepage links all active products and categories')
        check(document.index('js/seo-content.js') < document.index('js/seo-runtime.js') < document.index('js/app.js'), 'Runtime loads after content and before application')
        status, headers, document = request('/products?q=sparklers')
        check(status == 200 and 'noindex' in headers.get('X-Robots-Tag','') and 'noindex' in tag(document,'meta',r'name="robots"'), 'Filtered URL is noindex')
        status, headers, document = request('/products', host='admin.crackersmela.com')
        check('noindex' in headers.get('X-Robots-Tag',''), 'Private host HTML noindex')
        check('Disallow: /' in request('/robots.txt', host='admin.crackersmela.com')[2], 'Private host blocks crawling')
        check('Sitemap: https://crackersmela.com/sitemap.xml' in request('/robots.txt')[2], 'Public robots exposes canonical sitemap')
        check(request('/product/not-a-product')[0] == 404 and request('/category/not-a-category')[0] == 404, 'Missing product/category 404')
        check(request('/products', method='HEAD')[2] == '' and request('/products', method='POST')[0] == 405, 'HEAD and method policy')
        sitemap = urls(request('/sitemap.xml')[2])
        check(len(sitemap) == 140 and all('https://crackersmela.com/product/' + p['slug'] in sitemap for p in expected_products), 'All 117 products, 11 categories and 12 public pages in sitemap')
        check(urls(request('/sitemap.xml',host='admin.crackersmela.com')[2]) == set(), 'Private host empty sitemap')
        # Live catalog changes are reflected without changing public identity.
        stock = read(data/'catalog.json')
        selected = expected_products[0]
        stock['stockOverrides'][str(selected['id'])] = 0
        stock['priceOverrides'][str(selected['id'])] = 123.45
        write(data/'catalog.json',stock)
        current_schema = next(n for n in schemas(request('/product/'+selected['slug'])[2]) if n.get('@type') == 'Product')
        check(current_schema['offers']['price'] == 123.45 and current_schema['offers']['availability'].endswith('/OutOfStock'), 'Current catalog price/stock override reflected in Offer')
        state = read(data/'products.json')
        state['productOverrides'][str(selected['id'])]['disabled'] = True
        write(data/'products.json',state)
        check(request('/product/'+selected['slug'])[0] == 404 and 'https://crackersmela.com/product/'+selected['slug'] not in urls(request('/sitemap.xml')[2]), 'Disabled product excluded from page and sitemap')
        # Editorial publication and metadata remain authoritative.
        custom = 'custom-' + 'a'*32
        alias = 'custom-' + 'b'*32
        write(data/'cms-registry.json', {'pages':{custom:{'slug':'sample-page'},alias:{'slug':'alias-page'}}})
        def record(page, seo, meta=None):
            return {'version':1,'status':'published','publishedAt':'2026-10-07T12:00:00Z','draft':None,'published':{'id':page,'seo':seo,'sections':[]},'meta':meta or {}}
        write(data/'cms-pages.json', {'schemaVersion':1,'pages':{
            'about':record('about',{'title':'Manual About Title','description':'Manual about description','ogTitle':'Manual social title'}),
            'privacy':record('privacy',{'robots':'noindex, follow'}),
            custom:record(custom,{}, {'name':'Sample Page','slug':'sample-page'}),
            alias:record(alias,{'canonical':'https://crackersmela.com/about'},{'name':'Alias Page','slug':'alias-page'})
        }})
        status, headers, document = request('/about?slug=contact')
        check(status == 200 and '<title>Manual About Title</title>' in document and tag(document,'link',r'rel="canonical"') == 'https://crackersmela.com/about', 'CMS overrides and authoritative route preserved')
        check(tag(document,'meta',r'property="og:title"') == 'Manual social title', 'CMS social override preserved')
        sitemap = urls(request('/sitemap.xml')[2])
        check('https://crackersmela.com/privacy' not in sitemap and 'https://crackersmela.com/alias-page' not in sitemap and 'https://crackersmela.com/sample-page' in sitemap, 'CMS noindex and noncanonical URLs excluded')
        status, headers, document = request('/privacy')
        check('noindex' in headers.get('X-Robots-Tag',''), 'CMS noindex header applied')
        cms_urls = urls(request('/cms-sitemap.php')[2])
        check(cms_urls == {'https://crackersmela.com/sample-page'}, 'CMS sitemap indexability matches main sitemap')
        (web/'js/products-data.js').write_text('invalid source',encoding='utf-8')
        check(request('/products')[0] == 503, 'Unavailable catalog produces retryable error')
    finally:
        server.terminate()
        server.wait(timeout=10)
        server_log.close()
print(json.dumps({'ok':True,'checks':checks,'products':117,'categories':11,'scope':'SEO migration, rollback, SSR/browser parity, CMS metadata and sitemap'}))
