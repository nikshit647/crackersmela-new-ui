"""Prepare requested search phrases in existing CMS/product fields. No live writes."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import argparse
import hashlib
import json
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'audit-artifacts/seo-keywords-20261008'
SNAPSHOT = ROOT / 'audit-evidence/seo-keywords-20261008'
FIELDS = ['seoTitle', 'seoDesc', 'seoKeywords', 'seoSlug', 'seoTags']
TERMS = '''Buy Crackers Online in Hyderabad
Buy Crackers Online in Secunderabad
Buy Crackers Online in Hyderabad and Secunderabad
Best Online Crackers Store in Hyderabad
Online Crackers Store in Secunderabad
Diwali Crackers Online in Hyderabad
Wholesale Crackers Dealer in Hyderabad
Wholesale Crackers Supplier in Telangana
Best Crackers Online Store in Telangana
Fireworks and Crackers Online in Telangana
Standard Fireworks Exclusive Online Store
Standard Crackers Exclusive Online Store
Standard Crackers Wholesale Store
Standard Crackers
Standard Fireworks Online
Standard Fireworks Crackers
Buy Standard Fireworks Online
Standard Fireworks Wholesale Dealer
Standard Crackers Wholesale Dealer
Diwali Special Crackers
Wedding Crackers
Wedding Crackers Online in Hyderabad
Sky Shots
Buy Sky Shots Online in Hyderabad
Premium Crackers Online in Hyderabad
Crackers for Diwali and Weddings Online
Crackers Wholesale and Retail Online Store
Exclusive Online Crackers Store
Crackermela
Crackers Telangana
Best Crackers Store in India
Crackers Wholesale Dealer
Crackers Online Hyderabad
Crackers Online Telangana
Online Fireworks Store Hyderabad
Online Fireworks Store Telangana'''.splitlines()
HOME_TITLE = 'Buy Crackers Online in Hyderabad & Secunderabad | Crackermela'
HOME_DESCRIPTION = 'Shop crackers online in Hyderabad and Secunderabad at Crackermela. Explore Diwali crackers, wedding crackers, sky shots, premium crackers and wholesale options.'


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def unique(values):
    seen, out = set(), []
    for value in values:
        value = value.strip()
        if value and value.casefold() not in seen:
            seen.add(value.casefold())
            out.append(value)
    return out


def capture():
    SNAPSHOT.mkdir(parents=True, exist_ok=True)
    paths = {'products.json': 'products-api.php?a=pull', 'catalog.json': 'catalog-api.php?a=pull', 'seed.js': 'js/products-data.js', 'home.json': 'cms-api.php?a=published&page=home'}
    def fetch(item):
        name, route = item
        target = SNAPSHOT / name
        if target.exists():
            return name, hashlib.sha256(target.read_bytes()).hexdigest()
        req = urllib.request.Request('https://crackersmela.com/' + route, headers={'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(req, timeout=30) as response:
            raw = response.read()
        target.write_bytes(raw)
        return name, hashlib.sha256(raw).hexdigest()
    hashes = dict(ThreadPoolExecutor(max_workers=4).map(fetch, paths.items()))
    write(SNAPSHOT / 'capture.json', {'sha256': hashes, 'source': 'Public read-only production API snapshot, 2026-10-08'})
    return hashes


def catalog():
    source = (SNAPSHOT / 'seed.js').read_text(encoding='utf-8-sig')
    seed = json.loads(re.search(r'window\.CM_DATA\s*=\s*(\{.*\})\s*;?\s*$', source, re.S)[1])
    state, stock = read(SNAPSHOT / 'products.json'), read(SNAPSHOT / 'catalog.json')
    merged = {}
    for base in seed['products'] + state.get('extraProducts', []):
        pid = str(base['id'])
        row = {**base, **state['productOverrides'].get(pid, {})}
        row['id'] = int(pid)
        for values, key in [('priceOverrides', 'price'), ('stockOverrides', 'stock'), ('featOn', 'featured')]:
            if pid in stock.get(values, {}):
                row[key] = stock[values][pid]
        merged[pid] = row
    return seed, state, stock, merged


def build():
    seed, state, stock, products = catalog()
    prior = {str(row['id']): row['fields'] for row in read(ROOT / 'audit-artifacts/seo-enrichment-20261007/fields.json')}
    family = {str(row['id']): row['family'] for row in read(ROOT / 'audit-artifacts/seo-enrichment-20261007/validation.json')}
    assert set(products) == set(prior), 'Product inventory changed; review additions/removals before generation'
    general = [TERMS[i] for i in [0, 1, 5, 9, 19, 28, 29, 32, 33, 34, 35]]
    standard = [TERMS[i] for i in [13, 14, 15, 16]]
    aerial = [TERMS[i] for i in [20, 21, 22, 23, 25]]
    rows, changes, checks = [], [], []
    for pid, product in products.items():
        old = prior[pid]
        # Preserve existing good titles, descriptions, slugs and useful tags.
        fields = {key: product.get(key) or old[key] for key in FIELDS}
        supported_standard = bool(re.search(r'\bstandard\b', product.get('name', '') + ' ' + product.get('brand', ''), re.I)) and not re.search(r'other\s*brand|ayyan', product.get('name', ''), re.I)
        selected = list(general)
        if supported_standard:
            selected += standard
        if family[pid] in ['shots', 'comet', 'roman', 'rocket']:
            selected += aerial
        # Relevant product and family phrases lead; desired location targets follow.
        existing = fields['seoKeywords'].split(',')
        if not supported_standard:
            existing = [term for term in existing if not re.search(r'\bstandard\b', term, re.I)]
        keywords = unique(existing + selected)
        # Keep the backend's byte limit. All requested phrases are retained in
        # website SEO; products carry product-specific and relevant subsets.
        while len(', '.join(keywords).encode('utf-8')) > 1000:
            removable = next((i for i in range(len(existing) - 1, -1, -1) if i < len(keywords) and keywords[i] not in selected and i >= 3), None)
            if removable is None:
                raise AssertionError('Review keyword length for product ' + pid)
            keywords.pop(removable)
        fields['seoKeywords'] = ', '.join(keywords)
        tags = unique(fields['seoTags'].split(',') + ['Crackermela', 'Crackers Online Hyderabad', 'Crackers Online Telangana'])
        fields['seoTags'] = ', '.join(tags)
        for key, limit in [('seoTitle', 300), ('seoDesc', 1000), ('seoKeywords', 1000), ('seoTags', 1000), ('seoSlug', 200)]:
            assert fields[key].strip() and len(fields[key].encode('utf-8')) <= limit, (pid, key)
        assert not re.search(r'exclusive|wholesale dealer|best.*store', fields['seoTitle'] + ' ' + fields['seoDesc'], re.I)
        assert supported_standard or not re.search(r'\bstandard\b', fields['seoKeywords'], re.I), pid
        changes.append({'id': product['id'], 'slug': product['slug'], 'expectedProduct': product, 'changes': fields})
        rows.append({'id': product['id'], 'name': product['name'], 'url': 'https://crackersmela.com/product/' + product['slug'], 'fields': fields})
        checks.append({'id': product['id'], 'keywordBytes': len(fields['seoKeywords'].encode('utf-8')), 'keywords': len(keywords), 'standardProduct': supported_standard, 'family': family[pid], 'protectedFieldsPreserved': True})
    for key in ['seoTitle', 'seoDesc', 'seoSlug']:
        assert len({row['fields'][key].casefold() for row in rows}) == len(rows), 'Duplicate ' + key
    homepage = {'title': HOME_TITLE, 'description': HOME_DESCRIPTION, 'keywords': ', '.join(TERMS), 'ogTitle': HOME_TITLE, 'ogDescription': HOME_DESCRIPTION}
    website = {'home': homepage,
               'products': {'title': 'Crackers Online Hyderabad & Telangana | Crackermela', 'description': 'Browse crackers online for Hyderabad, Secunderabad and Telangana at Crackermela. Compare Diwali crackers, fireworks, pack sizes, prices and availability.', 'keywords': ', '.join(TERMS[i] for i in [1, 2, 4, 5, 9, 19, 20, 21, 22, 23, 24, 25, 28, 29, 32, 33, 34, 35])},
               'wholesale': {'title': 'Wholesale Crackers in Hyderabad & Telangana | Crackermela', 'description': 'Contact Crackermela about wholesale crackers in Hyderabad, Secunderabad and Telangana. Discuss Standard Fireworks, bulk quantities and current availability.', 'keywords': ', '.join(TERMS[i] for i in [6, 7, 12, 17, 18, 26, 31])}}
    for data in website.values():
        data.setdefault('ogTitle', data['title'])
        data.setdefault('ogDescription', data['description'])
    assert set(TERMS) <= {term for data in website.values() for term in data['keywords'].split(', ')}
    plan = {'version': 1, 'fields': FIELDS, 'catalogIds': sorted(products), 'changes': changes, 'total': len(rows), 'source': read(SNAPSHOT / 'capture.json'), 'protectedFields': 'Every product field except the five listed SEO fields; public slug remains unchanged.'}
    write(OUT / 'product-seo-plan.json', plan)
    write(OUT / 'product-seo-fields.json', rows)
    write(OUT / 'website-seo-plan.json', {'version': 1, 'pages': website})
    write(OUT / 'keyword-coverage.json', {'requestedKeywords': TERMS, 'total': len(TERMS), 'websiteFields': website, 'products': checks, 'note': 'Exclusive, best and wholesale phrases are search targets in website keyword metadata, not verified claims in titles, descriptions or product brand data. Google does not use meta keywords for ranking.'})
    # Use the existing shared content resolver; no new runtime or product records.
    content_path = ROOT / 'audit-evidence/production-release/js/seo-content.js'
    content = json.loads(re.search(r'window\.CM_SEO\s*=\s*(\{.*\})\s*;?\s*$', content_path.read_text(encoding='utf-8-sig'), re.S)[1])
    content['pages'] = {key: {'seoTitle': value['title'], 'seoDesc': value['description'], 'keywords': value['keywords'], 'path': '' if key == 'home' else key} for key, value in website.items()}
    content['keywordTargets'] = TERMS
    content_path.write_text('/* Shared catalog and page SEO metadata. Admin values remain authoritative. */\nwindow.CM_SEO = ' + json.dumps(content, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    report = {'products': len(rows), 'populatedProductFields': len(rows) * 5, 'websitePages': list(website), 'requestedKeywords': len(TERMS), 'homepageKeywordBytes': len(homepage['keywords'].encode('utf-8')), 'maxProductKeywordBytes': max(c['keywordBytes'] for c in checks), 'sourceRevision': state['rev'], 'protectedFieldsPreserved': True, 'liveWrites': False}
    write(OUT / 'summary.json', report)
    print(json.dumps(report))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['capture', 'build'])
    args = parser.parse_args()
    print(json.dumps(capture())) if args.mode == 'capture' else build()
