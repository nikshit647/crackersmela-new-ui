"""Current-catalog SEO persistence, exact field scope and website metadata checks."""
from pathlib import Path
import copy
import html
import json
import os
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
RELEASE = ROOT / 'audit-evidence/production-release'
ARTIFACT = Path(os.environ.get('CM_REQUESTED_SEO_ARTIFACT', ROOT / 'audit-artifacts/seo-keywords-20261008')).resolve()
SNAPSHOT = Path(os.environ.get('CM_REQUESTED_SEO_SOURCE', ROOT / 'audit-evidence/seo-keywords-20261008')).resolve()
PHP = ROOT / 'audit-evidence/tools/php-8.3.35/php.exe'
PLAN = ARTIFACT / 'product-seo-plan.json'
SITE_PLAN = ARTIFACT / 'website-seo-plan.json'
checks = []


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')


def check(condition, message):
    assert condition, message
    checks.append(message)


def run(command, env, valid=True):
    result = subprocess.run([str(PHP)] + [str(p) for p in command], env=env, capture_output=True, text=True, encoding='utf-8')
    check((result.returncode == 0) == valid, 'Process result: ' + (result.stderr[:300] or 'passed'))
    return json.loads(result.stdout if valid else result.stderr)


with tempfile.TemporaryDirectory(prefix='cm-requested-seo-') as directory:
    root = Path(directory)
    web, data, work, backup = [root / name for name in ['public', 'data', 'site-work', 'backups']]
    for folder in [web, data, work, backup, web / 'js']:
        folder.mkdir()
    for name in ['cm-security.php', 'cm-commerce.php', 'cm-cms.php', 'cm-seo.php', 'cms-page.php', 'seo-page.php', 'index.html']:
        shutil.copyfile(RELEASE / name, web / name)
    for name in ['seo-content.js', 'seo-runtime.js']:
        shutil.copyfile(RELEASE / 'js' / name, web / 'js' / name)
    shutil.copyfile(SNAPSHOT / 'seed.js', web / 'js/products-data.js')
    source = read(SNAPSHOT / 'products.json')
    source.pop('ok', None)
    write(data / 'products.json', source)
    write(data / 'catalog.json', read(SNAPSHOT / 'catalog.json'))
    original = (data / 'products.json').read_bytes()
    catalog_original = (data / 'catalog.json').read_bytes()
    seed_original = (web / 'js/products-data.js').read_bytes()
    env = {**os.environ, 'CM_DATA_DIR': str(data), 'CM_DISABLE_MAIL': '1', 'EMAIL_ENABLED': 'false', 'CM_EMAIL_TRANSPORT': 'fake'}
    command = [ROOT / 'audit/migrate-product-seo.php', '--root=' + str(web), '--data-dir=' + str(data), '--plan=' + str(PLAN)]
    dry = run(command, env)
    check(dry['dryRun'] and dry['products'] == 117, 'All 117 current products validated')
    check((data / 'products.json').read_bytes() == original, 'Dry run does not write')
    changed = copy.deepcopy(source)
    changed['productOverrides']['26']['seoDesc'] = 'An admin edit after review.'
    write(data / 'products.json', changed)
    rejected_bytes = (data / 'products.json').read_bytes()
    rejected = run(command + ['--apply', '--backup-dir=' + str(backup)], env, valid=False)
    check('Source conflict' in rejected['error'] and (data / 'products.json').read_bytes() == rejected_bytes, 'Concurrent admin edit rejected without writing')
    (data / 'products.json').write_bytes(original)
    applied = run(command + ['--apply', '--backup-dir=' + str(backup)], env)
    check(applied['applied'] and applied['products'] == 117, 'Current product SEO saved')
    saved = read(data / 'products.json')
    plan = read(PLAN)
    allowed = set(plan['fields'])
    check(allowed == {'seoTitle', 'seoDesc', 'seoKeywords', 'seoSlug', 'seoTags'}, 'Exactly five SEO fields are editable')
    for row in plan['changes']:
        pid = str(row['id'])
        actual, before = saved['productOverrides'][pid], source['productOverrides'].get(pid, {})
        check(all(actual[key] == row['changes'][key] and actual[key].strip() for key in allowed), 'Five saved admin SEO fields: ' + pid)
        check({k: v for k, v in actual.items() if k not in allowed} == {k: v for k, v in before.items() if k not in allowed}, 'Product facts and description preserved: ' + pid)
    check(saved['extraProducts'] == source['extraProducts'] and saved['settings'] == source['settings'] and saved['rev'] == source['rev'] + 1, 'Extra product records/settings preserved; one revision')
    saved_bytes = (data / 'products.json').read_bytes()
    again = run(command + ['--apply', '--backup-dir=' + str(backup)], env)
    check(again['idempotent'] and saved_bytes == (data / 'products.json').read_bytes(), 'Repeat migration is byte-for-byte idempotent')
    check(catalog_original == (data / 'catalog.json').read_bytes() and seed_original == (web / 'js/products-data.js').read_bytes(), 'Catalog IDs, seed, prices and stock are untouched')
    # Use a published production layout to prove SEO changes preserve all design.
    home = read(SNAPSHOT / 'home.json')['published']
    records = {'home': {'version': 83, 'publishedVersion': 83, 'status': 'published', 'published': copy.deepcopy(home), 'draft': copy.deepcopy(home), 'revisions': [], 'categoryOrder': ['gift-boxes', 'kids-special']}}
    for page in ['products', 'wholesale']:
        doc = {'schemaVersion': 1, 'id': page, 'sections': [], 'seo': {'canonical': 'https://crackersmela.com/' + page}, 'design': {}}
        records[page] = {'version': 3, 'publishedVersion': 3, 'status': 'published', 'published': copy.deepcopy(doc), 'draft': copy.deepcopy(doc)}
    site_source = {'schemaVersion': 1, 'pages': records}
    write(data / 'cms-pages.json', site_source)
    site_before = (data / 'cms-pages.json').read_bytes()
    site_command = [ROOT / 'audit/migrate-cms-copy.php']
    prepared = run(site_command + ['prepare-seo', web, work, SITE_PLAN], env)
    check(prepared['files'] == 1 and prepared['textFields'] == 30, 'Website title, description, keywords and sharing fields prepared for three pages/draft+published')
    check(site_before == (data / 'cms-pages.json').read_bytes(), 'Website preparation does not write CMS data')
    site_apply = run(site_command + ['apply', web, work], env)
    check(site_apply['status'] == 'APPLIED', 'Website SEO persisted')
    site_saved = read(data / 'cms-pages.json')
    site_saved_bytes = (data / 'cms-pages.json').read_bytes()
    site_plan = read(SITE_PLAN)
    for page, fields in site_plan['pages'].items():
        record = site_saved['pages'][page]
        check(record['version'] == records[page]['version'] + 1, 'One CMS revision: ' + page)
        for scope in ['draft', 'published']:
            doc = record[scope]
            check(all(doc['seo'][key] == value for key, value in fields.items()), 'Website SEO persisted: ' + page + '/' + scope)
            check({k: v for k, v in doc.items() if k != 'seo'} == {k: v for k, v in records[page][scope].items() if k != 'seo'}, 'Layout, header, category order, hero styles preserved: ' + page + '/' + scope)
    check(run(site_command + ['apply', web, work], env)['status'] == 'ALREADY_APPLIED', 'Website apply is idempotent')
    # Resolve server and browser metadata from the exact saved product state.
    harness = root / 'metadata.php'
    harness.write_text("<?php require $argv[1].'/cm-seo.php'; $categories=cmBaseData()['categories']; $products=array_values(cmProductMap()); echo json_encode(['products'=>$products,'resolved'=>array_map(fn($p)=>cmSeoProduct($p,$categories),$products),'home'=>cmSeoPageMetadata('home')],JSON_UNESCAPED_UNICODE);", encoding='utf-8')
    metadata = run([harness, web], env)
    js = "const fs=require('fs'),vm=require('vm');const x=JSON.parse(fs.readFileSync(0,'utf8'));const w={window:{}};vm.createContext(w);vm.runInContext(fs.readFileSync(x.web+'/js/seo-content.js','utf8'),w);vm.runInContext(fs.readFileSync(x.web+'/js/seo-runtime.js','utf8'),w);console.log(JSON.stringify({home:w.window.CM_SEO_RUNTIME.pageMetadata('home'),products:x.products.map(p=>w.window.CM_SEO_RUNTIME.resolveProduct(p,[]))}));"
    resolved = json.loads(subprocess.run(['node', '-e', js], input=json.dumps({'web': str(web), 'products': metadata['products']}), capture_output=True, text=True, encoding='utf-8', check=True).stdout)
    for browser, server in zip(resolved['products'], metadata['resolved']):
        check(all(browser[key] == server[key] for key in ['title', 'seoDesc', 'keywords', 'canonical']), 'Server/browser product metadata parity: ' + server['canonical'])
    expected_rows = {row['id']: row for row in plan['changes']}
    for product, server in zip(metadata['products'], metadata['resolved']):
        planned = expected_rows[product['id']]
        check(server['title'] == planned['changes']['seoTitle'] and server['seoDesc'] == planned['changes']['seoDesc'], 'Saved product titles/descriptions are not overridden: ' + str(product['id']))
        check(server['canonical'] == 'https://crackersmela.com/product/' + planned['slug'], 'SEO slug changes preserve canonical product URL: ' + str(product['id']))
    check(resolved['home'] == metadata['home'], 'Server/browser homepage metadata parity')
    check(metadata['home']['title'] == site_plan['pages']['home']['title'], 'Requested exact homepage title')
    coverage = read(ARTIFACT / 'keyword-coverage.json')
    check(set(metadata['home']['keywords'].split(', ')) == set(coverage['requestedKeywords']), 'All 36 requested phrases in website SEO')
    # Exercise actual PHP HTML entry with saved CMS metadata, including escaping.
    page_harness = root / 'page.php'
    page_harness.write_text("<?php $_SERVER['HTTP_HOST']='crackersmela.com'; $_SERVER['REQUEST_METHOD']='GET'; $_SERVER['REQUEST_URI']=$argv[2]; $_SERVER['SCRIPT_FILENAME']=$argv[1].'/cms-page.php'; require $argv[1].'/'.($argv[2]==='/'?'cms-page.php':'seo-page.php');", encoding='utf-8')
    def document(route):
        return subprocess.run([str(PHP), str(page_harness), str(web), route], env=env, capture_output=True, text=True, encoding='utf-8', check=True).stdout
    def meta(doc, name, attribute='name'):
        return html.unescape(re.search(r'<meta[^>]+' + attribute + r'="' + name + r'"[^>]+content="([^"]*)"', doc)[1])
    home_html = document('/')
    check(html.unescape(re.search(r'<title>(.*?)</title>', home_html)[1]) == site_plan['pages']['home']['title'], 'Saved website title on initial HTML response')
    check(meta(home_html, 'keywords') == site_plan['pages']['home']['keywords'], 'Saved website keywords on initial HTML response')
    products_html = document('/products')
    check(meta(products_html, 'keywords') == site_plan['pages']['products']['keywords'], 'Saved listing keywords on initial HTML response')
    custom_listing = read(data / 'cms-pages.json')
    custom_listing['pages']['products']['published']['seo'].update(title='Manual listing title', keywords='Manual listing keywords', ogTitle='Manual listing social title', ogDescription='Manual listing social description', ogImage='https://crackersmela.com/images/products/p106.jpg')
    write(data / 'cms-pages.json', custom_listing)
    manual_html = document('/products')
    check('<title>Manual listing title</title>' in manual_html and meta(manual_html, 'keywords') == 'Manual listing keywords', 'Later listing editor changes override fallback on initial HTML')
    check(meta(manual_html, 'og:title', 'property') == 'Manual listing social title' and meta(manual_html, 'og:description', 'property') == 'Manual listing social description' and meta(manual_html, 'og:image', 'property') == 'https://crackersmela.com/images/products/p106.jpg', 'Dedicated Products social title, description and image on initial HTML')
    (data / 'cms-pages.json').write_bytes(site_saved_bytes)
    first = plan['changes'][0]
    product_html = document('/product/' + first['slug'])
    check(meta(product_html, 'keywords') == first['changes']['seoKeywords'], 'Saved product keywords on initial HTML response')
    run(site_command + ['rollback', web, work], env)
    check((data / 'cms-pages.json').read_bytes() == site_before, 'Website exact rollback')
    run([ROOT / 'audit/migrate-product-seo.php', '--root=' + str(web), '--data-dir=' + str(data), '--rollback=' + applied['receipt']], env)
    check((data / 'products.json').read_bytes() == original, 'Product exact rollback')

report = {'status': 'PASS', 'checks': len(checks), 'products': 117, 'productSeoFields': 585, 'requestedKeywords': 36, 'websitePages': 3, 'liveWrites': False, 'verification': checks}
write(ARTIFACT / 'backend-verification.json', report)
print(json.dumps({key: value for key, value in report.items() if key != 'verification'}))
