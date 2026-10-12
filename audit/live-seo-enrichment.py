"""Prepare and verify a five-field live SEO update; never writes to the server."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import copy
import hashlib
import json
import re
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'audit-evidence/live-seo-enrichment-20261007'
FIELDS = ['seoTitle', 'seoDesc', 'seoKeywords', 'seoSlug', 'seoTags']
PATHS = {'products': 'products-api.php?a=pull', 'catalog': 'catalog-api.php?a=pull', 'seed': 'js/products-data.js'}

def capture(stage):
    OUT.mkdir(exist_ok=True)
    def fetch(item):
        key, route = item
        target = OUT / (key + '.' + stage + ('.js' if key == 'seed' else '.json'))
        assert not target.exists(), 'Do not overwrite captured evidence: ' + str(target)
        request = urllib.request.Request('https://admin.crackersmela.com/' + route, headers={'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
        target.write_bytes(raw)
        return key, hashlib.sha256(raw).hexdigest()
    return dict(ThreadPoolExecutor(max_workers=3).map(fetch, PATHS.items()))

def load(name):
    return json.loads((OUT / name).read_text('utf-8-sig'))

def protected(document):
    document = copy.deepcopy(document)
    document.pop('rev', None)
    document['productOverrides'] = {pid: value for pid, row in document['productOverrides'].items()
                                    if (value := {key: val for key, val in row.items() if key not in FIELDS})}
    return document

mode = sys.argv[1]
if mode == 'prepare':
    rows = json.loads((ROOT / 'audit-artifacts/seo-enrichment-20261007/fields.json').read_text('utf-8-sig'))
    plan = json.loads((ROOT / 'audit-artifacts/seo-editor-20261007/product-seo-plan.json').read_text('utf-8-sig'))
    assert len(rows) == 117 and {str(r['id']) for r in rows} == {str(r['id']) for r in plan['changes']}
    hashes = capture('before')
    before = load('products.before.json')
    seed = json.loads(re.search(r'window\.CM_DATA\s*=\s*(\{.*\})\s*;?\s*$', (OUT / 'seed.before.js').read_text('utf-8-sig'), re.S)[1])
    products = {str(p['id']): {**p, **before['productOverrides'].get(str(p['id']), {})}
                for p in seed['products'] + before['extraProducts']}
    assert set(products) == {str(r['id']) for r in rows}, 'Inventory changed'
    fact_keys = ['name', 'shortName', 'note', 'brand', 'sku', 'slug', 'primary', 'cats']
    for row in plan['changes']:
        current, expected = products[str(row['id'])], row['expectedProduct']
        for key in fact_keys:
            assert current.get(key) == expected.get(key), (row['id'], 'Source changed', key)
    overrides = copy.deepcopy(before['productOverrides'])
    for row in rows:
        assert set(row['fields']) == set(FIELDS)
        for key in FIELDS:
            assert isinstance(row['fields'][key], str) and row['fields'][key].strip()
        overrides.setdefault(str(row['id']), {}).update(row['fields'])
    for key in ['seoTitle', 'seoDesc', 'seoSlug']:
        assert len({r['fields'][key].casefold() for r in rows}) == 117, 'Duplicate ' + key
    request = {'a': 'push', 'rev': before['rev'], 'productOverrides': overrides}
    assert protected(before) == protected({**before, 'productOverrides': overrides})
    (OUT / 'request.json').write_text(json.dumps(request, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    (OUT / 'fields.json').write_text(json.dumps(rows, ensure_ascii=False), encoding='utf-8')
    report = {'products': 117, 'fields': 585, 'revision': before['rev'], 'protectedFieldsPreserved': True, 'snapshotHashes': hashes}
    (OUT / 'preflight.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report))
elif mode == 'verify':
    hashes = capture('after')
    before, after, rows = load('products.before.json'), load('products.after.json'), load('fields.json')
    for row in rows:
        assert all(after['productOverrides'][str(row['id'])].get(k) == row['fields'][k] for k in FIELDS), row['id']
    assert after['rev'] == before['rev'] + 1
    assert protected(before) == protected(after), 'Protected fields changed'
    unchanged = {key: (OUT / (key + '.before' + suffix)).read_bytes() == (OUT / (key + '.after' + suffix)).read_bytes()
                 for key, suffix in [('catalog', '.json'), ('seed', '.js')]}
    report = {'status': 'PASS', 'products': len(rows), 'fields': len(rows) * 5, 'revisionBefore': before['rev'],
              'revisionAfter': after['rev'], 'nonSeoDataUnchanged': True, 'unchanged': unchanged, 'afterHashes': hashes}
    (OUT / 'verification.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report))
else:
    raise SystemExit('Use prepare or verify')
