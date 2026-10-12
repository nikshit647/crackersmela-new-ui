"""Prepare a reviewed five-field product SEO revision; never writes live stores."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import argparse
import copy
import hashlib
import json
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PRIOR = ROOT / 'audit-artifacts/seo-keywords-20261008'
OUT = ROOT / 'audit-artifacts/seo-all-fields-20261008'
SNAPSHOT = ROOT / 'audit-evidence/seo-all-fields-20261008'
FIELDS = ['seoTitle', 'seoDesc', 'seoKeywords', 'seoSlug', 'seoTags']


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def capture():
    SNAPSHOT.mkdir(parents=True, exist_ok=True)
    routes = {'products.json': 'products-api.php?a=pull', 'catalog.json': 'catalog-api.php?a=pull', 'seed.js': 'js/products-data.js'}
    def fetch(item):
        name, route = item
        target = SNAPSHOT / name
        if target.exists():
            return name, hashlib.sha256(target.read_bytes()).hexdigest()
        request = urllib.request.Request('https://crackersmela.com/' + route, headers={'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
        target.write_bytes(raw)
        return name, hashlib.sha256(raw).hexdigest()
    hashes = dict(ThreadPoolExecutor(max_workers=3).map(fetch, routes.items()))
    write(SNAPSHOT / 'capture.json', {'source': 'Public read-only production APIs, 2026-10-08; no live writes', 'sha256': hashes})
    return hashes


def unique(values):
    values = [value.strip() for value in values]
    return list(dict((value.casefold(), value) for value in reversed(values) if value).values())[::-1]


def catalog():
    seed = json.loads(re.search(r'window\.CM_DATA\s*=\s*(\{.*\})\s*;?\s*$', (SNAPSHOT / 'seed.js').read_text(encoding='utf-8-sig'), re.S)[1])
    state, catalog_state = read(SNAPSHOT / 'products.json'), read(SNAPSHOT / 'catalog.json')
    products = {}
    for base in seed['products'] + state.get('extraProducts', []):
        pid = str(base['id'])
        product = {**base, **state.get('productOverrides', {}).get(pid, {})}
        product['id'] = int(pid)
        for bucket, key in [('priceOverrides', 'price'), ('stockOverrides', 'stock'), ('featOn', 'featured')]:
            if pid in catalog_state.get(bucket, {}):
                product[key] = catalog_state[bucket][pid]
        products[pid] = product
    return products, state


FAMILY_COPY = {
    'chakkar': ('ground chakkars', 'Chakkars', 'Diwali celebrations'),
    'fountain': ('flower pot and fountain crackers', 'Flower Pots', 'Diwali and weddings'),
    'sparkler': ('sparklers', 'Sparklers', 'Diwali and weddings'),
    'sound': ('sound crackers', 'Sound Crackers', 'Diwali celebrations'),
    'garland': ('garland crackers', 'Garlands', 'Diwali and weddings'),
    'novelty': ('novelty fireworks', 'Fancy Fireworks', 'Diwali celebrations'),
    'smoke': ('colour smoke fireworks', 'Colour Smoke', 'Diwali celebrations'),
    'gift': ('fireworks gift boxes', 'Gift Boxes', 'Diwali gifting'),
    'rocket': ('rocket fireworks', 'Rockets', 'Diwali and weddings'),
    'comet': ('aerial fireworks', 'Sky Shots', 'Diwali and weddings'),
    'shots': ('sky shots', 'Sky Shots', 'Diwali and weddings'),
    'pop': ('pop crackers', 'Pop Crackers', 'Diwali celebrations'),
    'roll': ('cracker rolls', 'Cracker Rolls', 'Diwali celebrations'),
    'gun': ('festival novelty guns', 'Festival Novelty Guns', 'Diwali celebrations'),
    'roman': ('Roman candle fireworks', 'Roman Candles', 'Diwali and weddings'),
}


def build():
    products, state = catalog()
    old_plan = read(PRIOR / 'product-seo-plan.json')
    old_rows = {str(row['id']): row for row in read(PRIOR / 'product-seo-fields.json')}
    old_products = {str(row['id']): row['expectedProduct'] for row in old_plan['changes']}
    families = {str(row['id']): row['family'] for row in read(ROOT / 'audit-artifacts/seo-enrichment-20261007/validation.json')}
    terms = read(PRIOR / 'keyword-coverage.json')['requestedKeywords']
    assert set(products) == set(old_rows), 'Inventory changed; review additions/removals first.'
    rows, changes, checks, source_changes = [], [], [], []
    for pid, product in products.items():
        previous = old_rows[pid]['fields']
        # A reviewed label is only reused when product identity/name/pack facts match.
        for key in ['name', 'slug', 'note', 'brand']:
            assert product.get(key) == old_products[pid].get(key), 'Product fact changed; review copy manually: ' + pid + '/' + key
        source_changes += [{'id': product['id'], 'field': key} for key in set(product) | set(old_products[pid]) if product.get(key) != old_products[pid].get(key)]
        label = previous['seoTitle'].split(' | ')[0]
        label = re.sub(r'\s+Online$', '', label)
        label = label.replace(' Festival Novelty', '').replace('Ayyan Standard', 'Ayyan / Standard')
        family = families[pid]
        family_phrase, family_tag, occasion = FAMILY_COPY[family]
        brand_supported = bool(re.search(r'\bstandard\b', product.get('name', '') + ' ' + product.get('brand', ''), re.I)) and not re.search(r'other\s*brand|ayyan', product.get('name', ''), re.I)
        title = f'Buy {label} Online in Hyderabad | Crackers Mela'
        description = f'Buy {label} online for {occasion} in Hyderabad and Secunderabad. Check current prices and availability at Crackers Mela.'
        # The product itself leads every field, then relevant purchase/location terms.
        selected = [terms[i] for i in [0, 1, 5, 9, 19, 28, 29, 32, 33, 34, 35]]
        if brand_supported:
            selected += [terms[i] for i in [13, 14, 15, 16]]
        if family in ['shots', 'comet', 'roman', 'rocket']:
            selected += [terms[i] for i in [20, 21, 22, 23, 25]]
        elif 'weddings' in occasion:
            selected += [terms[i] for i in [20, 21, 25]]
        keywords = unique([label, f'Buy {label} Online in Hyderabad', f'{label} Secunderabad', f'{family_phrase} online', *selected])
        tags = unique([label, family_tag, 'Buy Crackers Online in Hyderabad', 'Buy Crackers Online in Secunderabad', 'Diwali Special Crackers', 'Crackers Online Telangana', 'Crackermela', *(['Wedding Crackers'] if 'weddings' in occasion else []), *(['Standard Fireworks Online'] if brand_supported else [])])
        fields = {'seoTitle': title, 'seoDesc': description, 'seoKeywords': ', '.join(keywords), 'seoSlug': 'buy-' + previous['seoSlug'] + '-online-hyderabad', 'seoTags': ', '.join(tags)}
        for key, limit in [('seoTitle', 300), ('seoDesc', 1000), ('seoKeywords', 1000), ('seoTags', 1000), ('seoSlug', 200)]:
            assert fields[key].strip() and len(fields[key].encode()) <= limit, (pid, key, len(fields[key].encode()))
            assert fields[key] != product.get(key), (pid, key, 'Not a revised field')
            assert fields[key] != previous[key], (pid, key, 'Not revised since keyword-only plan')
        assert re.fullmatch('[a-z0-9]+(?:-[a-z0-9]+)*', fields['seoSlug']), pid
        assert not re.search(r'\bexclusive\b|wholesale dealer|best.*store', title + ' ' + description, re.I), pid
        if not brand_supported:
            assert not any(term in fields['seoKeywords'].split(', ') for term in terms[10:19]), pid
        changes.append({'id': product['id'], 'slug': product['slug'], 'expectedProduct': copy.deepcopy(product), 'changes': fields})
        rows.append({'id': product['id'], 'name': product['name'], 'url': 'https://crackersmela.com/product/' + product['slug'], 'fields': fields})
        checks.append({'id': product['id'], 'family': family, 'standardProduct': brand_supported, 'titleLength': len(title), 'descriptionLength': len(description), 'fieldBytes': {key: len(value.encode()) for key, value in fields.items()}, 'changedFields': 5, 'canonicalUnchanged': True})
    for key in FIELDS:
        assert len({row['fields'][key].casefold() for row in rows}) == len(rows), 'Duplicate product SEO: ' + key
    plan = {'version': 1, 'fields': FIELDS, 'catalogIds': sorted(products), 'changes': changes, 'total': len(rows), 'source': read(SNAPSHOT / 'capture.json'), 'protectedFields': 'Every product field except five SEO fields. Actual slug and canonical URLs stay unchanged; seoSlug is separate admin metadata.'}
    write(OUT / 'product-seo-plan.json', plan)
    write(OUT / 'product-seo-fields.json', rows)
    write(OUT / 'website-seo-plan.json', read(PRIOR / 'website-seo-plan.json'))
    website = read(PRIOR / 'website-seo-plan.json')['pages']
    coverage = {term: {'websitePages': [key for key, page in website.items() if term in page['keywords'].split(', ')], 'productCount': sum(term in row['fields']['seoKeywords'].split(', ') for row in rows)} for term in terms}
    assert all(value['websitePages'] or value['productCount'] for value in coverage.values())
    write(OUT / 'keyword-coverage.json', {'requestedKeywords': terms, 'total': len(terms), 'coverage': coverage, 'products': checks, 'note': 'Product-specific title, description, keywords, SEO slug and tags revised for every product. Best/exclusive/dealer terms remain website keyword targets, not unverified product claims.'})
    report = {'status': 'PREPARED', 'products': len(rows), 'populatedProductFields': len(rows) * 5, 'changedFieldsFromLiveSnapshot': len(rows) * 5, 'changedFieldsFromPreviousPlan': len(rows) * 5, 'changedFieldsByType': {key: len(rows) for key in FIELDS}, 'sourceRevision': state['rev'], 'sourceChangesSincePriorCapture': source_changes, 'requestedKeywords': len(terms), 'websitePages': list(website), 'maxTitleLength': max(row['titleLength'] for row in checks), 'maxDescriptionLength': max(row['descriptionLength'] for row in checks), 'maxProductKeywordBytes': max(row['fieldBytes']['seoKeywords'] for row in checks), 'liveWrites': False, 'canonicalUrlsUnchanged': True}
    write(OUT / 'summary.json', report)
    print(json.dumps(report))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['capture', 'build'])
    args = parser.parse_args()
    print(json.dumps(capture())) if args.mode == 'capture' else build()
