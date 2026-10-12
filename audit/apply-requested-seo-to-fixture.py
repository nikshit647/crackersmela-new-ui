"""Apply reviewed SEO only to an explicitly named, healthy synthetic fixture."""
from pathlib import Path
import argparse
import json
import os
import shutil
import subprocess
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PHP = ROOT / 'audit-evidence/tools/php-8.3.35/php.exe'
ARTIFACT = ROOT / 'audit-artifacts/seo-keywords-20261008'
parser = argparse.ArgumentParser()
parser.add_argument('manifest')
parser.add_argument('--seed-public-snapshot', action='store_true', help='Initialize a fresh dedicated fixture with the captured public catalog and published Home.')
parser.add_argument('--artifact-dir', type=Path, default=ARTIFACT)
parser.add_argument('--prior-fields', type=Path, help='Require each existing product SEO value to match this reviewed prior plan or the new target before applying.')
parser.add_argument('--product-only', action='store_true', help='Preserve all website CMS documents and update only the five product SEO fields.')
args = parser.parse_args()
ARTIFACT = args.artifact_dir.resolve()
manifest = json.loads(Path(args.manifest).read_text(encoding='utf-8-sig'))
base, web = Path(manifest['fixture']).resolve(), Path(manifest['documentRoot']).resolve()
assert base.parent == (ROOT / 'audit-evidence').resolve() and base.name.startswith('cms-fixture-')
assert web == base / 'public'
url = urllib.parse.urlparse(manifest['baseUrl'])
assert url.scheme == 'http' and url.hostname == '127.0.0.1'
with urllib.request.urlopen(manifest['baseUrl'] + '/__fixture-health', timeout=5) as response:
    health = json.load(response)
assert health.get('isolated') is True and health.get('mail') == 'disabled'
assert "'keywords'" in (web / 'cm-cms.php').read_text(encoding='utf-8'), 'Refresh fixture source before applying SEO'
work = base / 'requested-seo-seed'
work.mkdir(exist_ok=True)
if args.seed_public_snapshot:
    snapshot = ROOT / 'audit-evidence/seo-keywords-20261008'
    initial = work / 'initial-backup'
    initial.mkdir()
    for name in ['products.json', 'catalog.json']:
        target = base / 'data' / name
        if target.exists():
            shutil.copyfile(target, initial / name)
        value = json.loads((snapshot / name).read_text(encoding='utf-8'))
        value.pop('ok', None)
        target.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
    shutil.copyfile(web / 'js/products-data.js', initial / 'products-data.js')
    shutil.copyfile(snapshot / 'seed.js', web / 'js/products-data.js')
    legacy_path = base / 'data/cms-pages.json'
    legacy = json.loads(legacy_path.read_text(encoding='utf-8')) if legacy_path.exists() else {'schemaVersion': 1, 'pages': {}}
    if not (base / 'data/cms-pages/home.json').exists() and 'home' not in legacy.get('pages', {}):
        captured = json.loads((snapshot / 'home.json').read_text(encoding='utf-8'))
        home = captured['published']
        seed = json.loads((snapshot / 'seed.js').read_text(encoding='utf-8-sig').split('=', 1)[1].strip().rstrip(';'))
        canonical_order = [category['id'] for category in seed['categories']]
        home['categoryOrder'] = canonical_order
        for section in home.get('sections', []):
            if section.get('source') == 'home:shop-categories':
                section.get('content', {}).pop('categoryOrder', None)
        record = {'version': captured['version'], 'publishedVersion': captured['version'], 'status': 'published', 'publishedAt': captured['publishedAt'], 'categoryOrder': canonical_order, 'draft': home, 'published': home}
        legacy['pages']['home'] = record
        legacy_path.write_text(json.dumps(legacy, ensure_ascii=False), encoding='utf-8')
env = {**os.environ, 'CM_DATA_DIR': str(base / 'data'), 'CM_DISABLE_MAIL': '1'}
harness = work / 'read-catalog.php'
harness.write_text("<?php require $argv[1].'/cm-commerce.php'; echo json_encode(array_values(cmProductMap()),JSON_UNESCAPED_UNICODE);", encoding='utf-8')
result = subprocess.run([str(PHP), str(harness), str(web)], env=env, capture_output=True, text=True, encoding='utf-8', check=True)
products = json.loads(result.stdout)
fields = {str(row['id']): row['fields'] for row in json.loads((ARTIFACT / 'product-seo-fields.json').read_text(encoding='utf-8'))}
assert {str(product['id']) for product in products} == set(fields), 'Unexpected fixture product inventory'
if args.prior_fields:
    prior_fields = {str(row['id']): row['fields'] for row in json.loads(args.prior_fields.read_text(encoding='utf-8-sig'))}
    assert set(prior_fields) == set(fields), 'Reviewed prior inventory changed'
    conflicts = [{'id': product['id'], 'field': key} for product in products for key, value in fields[str(product['id'])].items()
                 if product.get(key) not in (prior_fields[str(product['id'])].get(key), value)]
    assert not conflicts, 'Existing product SEO differs from the reviewed prior/target values; no writes: ' + json.dumps(conflicts)
plan = {'version': 1, 'fields': ['seoTitle','seoDesc','seoKeywords','seoSlug','seoTags'], 'catalogIds': sorted(fields), 'changes': [{'id': product['id'], 'slug': product['slug'], 'expectedProduct': product, 'changes': fields[str(product['id'])]} for product in products]}
plan_path = work / 'product-seo-plan.json'
plan_path.write_text(json.dumps(plan, ensure_ascii=False), encoding='utf-8')
command = [str(PHP), str(ROOT / 'audit/migrate-product-seo.php'), '--root=' + str(web), '--data-dir=' + str(base / 'data'), '--plan=' + str(plan_path)]
def run(arguments):
    result = subprocess.run(arguments, env=env, capture_output=True, text=True, encoding='utf-8')
    assert result.returncode == 0, result.stderr + result.stdout
    return json.loads(result.stdout)
run(command)
product_result = run(command + ['--apply', '--backup-dir=' + str(work / 'product-backups')])
if args.product_only:
    prepared = applied = {'status': 'SKIPPED', 'reason': 'Product-only update preserves all CMS data'}
else:
    site_command = [str(PHP), str(ROOT / 'audit/migrate-cms-copy.php')]
    site_work = work / 'website'
    prepared = run(site_command + ['prepare-seo', str(web), str(site_work), str(ARTIFACT / 'website-seo-plan.json')])
    applied = run(site_command + ['apply', str(web), str(site_work)])
with urllib.request.urlopen(manifest['baseUrl'] + '/products-api.php?a=pull', timeout=5) as response:
    saved = json.load(response)
assert all(all(saved['productOverrides'][pid][key] == value for key, value in row.items()) for pid, row in fields.items())
report = {'status': 'PASS', 'manifest': args.manifest, 'publicUrl': manifest['publicUrl'], 'products': len(fields), 'fields': len(fields) * 5, 'productMigration': product_result, 'websitePreparation': prepared, 'websiteMigration': applied, 'noDuplicateProducts': True, 'seededPublicSnapshot': args.seed_public_snapshot, 'priorFieldsGuarded': bool(args.prior_fields), 'mailDisabled': True, 'liveWrites': False}
(ARTIFACT / 'stable-preview-seed.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report))
