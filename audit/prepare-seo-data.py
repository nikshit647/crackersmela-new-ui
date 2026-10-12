"""Build a reviewable, idempotent product SEO field plan from a public snapshot."""
from pathlib import Path
import collections
import hashlib
import html
import json
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'audit-artifacts/seo-editor-20261007'
BEFORE = OUT / 'seo-before'
# Guard against the exact source merge rather than a browser-extracted display
# snapshot, which normalized 26 legacy shortName replacement characters.
BASE = json.loads(re.search(r'window\.CM_DATA\s*=\s*(\{.*\})\s*;?\s*$', (BEFORE / 'js_products-data.js').read_text('utf-8-sig'), re.S)[1])
STATE = json.loads((BEFORE / 'products-api.php_a_pull').read_text('utf-8-sig'))
CATALOG = json.loads((BEFORE / 'catalog-api.php_a_pull').read_text('utf-8-sig'))
PRODUCTS = []
for original in BASE['products'] + STATE['extraProducts']:
    product = {**original, **STATE['productOverrides'].get(str(original['id']), {})}
    product['id'] = original['id']
    for field, bucket in [('price', 'priceOverrides'), ('stock', 'stockOverrides'), ('featured', 'featOn')]:
        if str(product['id']) in CATALOG[bucket]:
            product[field] = CATALOG[bucket][str(product['id'])]
    PRODUCTS.append(product)
CATEGORIES = json.loads((BEFORE / 'categories.json').read_text('utf-8'))
CAT = {c['id']: c for c in CATEGORIES}
CONFLICTS = {'50': 'Name states 10 pieces; note states 5 pieces.', '109': 'Name states 50 items; note and previous SEO title state 43.', '110': 'Name states 55 items; note and previous SEO title state 46.', '47': 'Name states lavender; previous SEO title states green.', '148': 'Name says other brand; note and previous SEO title say Standard.', '215': 'Name says other brand; note says Standard.', '234': 'Name states 27 items; supplied component list has 21 numbered entries.'}
QUANTITY_CONFLICTS = {'50', '109', '110', '234'}
SOURCE_FIELDS = ['name', 'shortName', 'note', 'desc', 'brand', 'seoTitle', 'seoDesc', 'primary', 'cats']
ENRICHMENT = ROOT / 'audit-artifacts/seo-enrichment-20261007/fields.json'
ENRICHED = {str(row['id']): row['fields'] for row in json.loads(ENRICHMENT.read_text('utf-8'))} if ENRICHMENT.is_file() else {}

def plain(value):
    return re.sub(r'\s+', ' ', html.unescape(re.sub('<[^>]*>', '', str(value or '')).replace('\\r\\n', ' ').replace('\\n', ' ').replace('\\r', ' '))).strip()

def title_case(value):
    return re.sub(r'\b(\d+)\s*(cm|pcs|pc)\b', lambda m: m[1] + ' ' + m[2].lower(), re.sub(r'[A-Z][A-Z]+', lambda m: m[0].capitalize(), plain(value)), flags=re.I)

def clean_description(value):
    return re.sub(r'^[^:]+:\s*premium, safety-tested fireworks from certified Sivakasi factories\.\s*', '', plain(value), flags=re.I)

def neutral_name(p):
    name = title_case(p['name'])
    if str(p['id']) in QUANTITY_CONFLICTS:
        name = re.sub(r'\(\s*\d+\s*(?:pieces|items)\s*\)', '', name, flags=re.I)
    return re.sub(r'\s+', ' ', name).strip()

def product_copy(p):
    identifier = str(p['id'])
    cat = CAT.get(p.get('primary'), CAT.get(p.get('cats', [''])[0], {'name': 'Fireworks'}))
    name = neutral_name(p)
    # Preserve intentional manual titles unless known to contradict the current listing.
    manual = plain(p.get('seoTitle'))
    title = title_case(manual) if manual and manual != plain(p['name']) and identifier not in CONFLICTS else name
    # Long parenthetical alternatives remain in the visible full product name.
    if len(title) + (0 if re.search(r'crackers\s*mela', title, re.I) else len(' | Crackers Mela')) > 74:
        title = re.sub(r'\s*\([^)]*\)', '', title).strip()
    if len(title) < 25 and cat['name'].lower() not in title.lower(): title += ' | ' + cat['name']
    if not re.search(r'crackers\s*mela', title, re.I): title += ' | Crackers Mela'
    note = plain(p.get('note'))
    current_desc = plain(p.get('desc'))
    cleaned = clean_description(current_desc)
    generic = current_desc != cleaned
    description = cleaned or note
    if identifier in QUANTITY_CONFLICTS or identifier in {'148', '215'}:
        description = name + ' is part of the ' + cat['name'] + ' collection at Crackers Mela. Please confirm pack contents and product details before ordering.'
        if identifier == '234' and cleaned:
            description += '\n\nSupplied product details (please confirm):\n' + (cleaned if generic else p['desc'])
    elif not description or description.lower() == name.lower():
        description = name + ' is part of the ' + cat['name'] + ' collection at Crackers Mela.'
    # A useful existing description survives verbatim; only the known repeated
    # certification boilerplate and empty/name-only descriptions are replaced.
    elif not generic and current_desc:
        description = p['desc']
    else:
        description = name + '. ' + description
    manual_desc = plain(p.get('seoDesc'))
    meta = '' if identifier in CONFLICTS else manual_desc
    if not meta:
        suffix = 'Browse ' + cat['name'] + ' at Crackers Mela.'
        detail = note.rstrip('.') + '. ' if note and len(note) <= 70 and identifier not in CONFLICTS and note.lower() != plain(p['name']).lower() else ''
        meta = name + '. ' + detail + suffix
        if len(meta) > 165: meta = name + '. ' + suffix
        if len(meta) > 180: meta = title.replace(' | Crackers Mela', '') + '. View product details at Crackers Mela.'
    keywords = p.get('seoKeywords') or ', '.join(dict.fromkeys([name, cat['name'], 'Crackers Mela']))
    tags = p.get('seoTags') or ', '.join([CAT[x]['name'] for x in p.get('cats', []) if x in CAT])
    existing_slug = plain(p.get('seoSlug'))
    generated_slug = re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode().lower()).strip('-')
    seo_slug = existing_slug if existing_slug and not re.fullmatch(r'p-\d+', existing_slug) and identifier not in CONFLICTS else generated_slug
    fields = {'seoTitle': title, 'seoDesc': meta, 'seoKeywords': keywords, 'seoTags': tags, 'seoSlug': seo_slug, 'desc': description}
    fields.update(ENRICHED.get(identifier, {}))
    return fields

def main():
    products, changes, audit, seo_slugs = {}, [], [], set()
    for p in PRODUCTS:
        identifier = str(p['id'])
        copy = product_copy(p)
        if copy['seoSlug'] in seo_slugs:
            copy['seoSlug'] += '-' + identifier
        seo_slugs.add(copy['seoSlug'])
        products[identifier] = {'source': {k: p.get(k) for k in SOURCE_FIELDS}, 'seoTitle': copy['seoTitle'], 'seoDesc': copy['seoDesc'], 'description': clean_description(copy['desc']), 'imageAlt': plain(p['name'])}
        after = {k: v for k, v in copy.items() if p.get(k) != v}
        changes.append({'id': p['id'], 'slug': p['slug'], 'expectedProduct': p, 'changes': after})
        audit.append({'id': p['id'], 'name': p['name'], 'url': 'https://crackersmela.com/product/' + p['slug'], 'active': not p.get('disabled', False), 'beforeTitle': p.get('seoTitle', ''), **copy, 'image': p.get('image', ''), 'imageAlt': p['name'], 'sku': p.get('sku'), 'knownBrand': p.get('brand', ''), 'price': p['price'], 'stock': p['stock'], 'inStock': p['inStock'], 'sourceConflict': CONFLICTS.get(identifier, ''), 'missingImage': not bool(p.get('image')), 'titleLength': len(copy['seoTitle']), 'metaDescriptionLength': len(copy['seoDesc']), 'changedFields': list(after)})
    categories = {}
    category_audit = []
    for c in CATEGORIES:
        members = [p for p in PRODUCTS if not p.get('disabled') and (p.get('primary') == c['id'] or c['id'] in p.get('cats', []))]
        names = [neutral_name(p) for p in members[:3]]
        intro = 'Browse ' + c['name'] + ' at Crackers Mela for Hyderabad and Secunderabad. Compare product names, pack details, current prices and availability.'
        # Categories retain their established names and URLs. Examples use real product identities.
        if names: intro += ' This collection includes ' + '; '.join(names) + '.'
        description = 'Explore ' + c['name'] + ' at Crackers Mela for Hyderabad and Secunderabad. View product details, current prices and availability.'
        categories[c['id']] = {'source': {'id': c['id'], 'name': c['name']}, 'seoTitle': c['name'] + ' in Hyderabad | Crackers Mela', 'seoDesc': description, 'intro': intro}
        category_audit.append({'id': c['id'], 'name': c['name'], 'products': len(members), 'url': 'https://crackersmela.com/category/' + c['id'], **categories[c['id']]})
    titles = collections.Counter(row['seoTitle'] for row in audit)
    assert max(titles.values()) == 1, 'Product SEO titles must be unique'
    plan = {'version': 1, 'catalogIds': sorted(str(p['id']) for p in PRODUCTS), 'changes': changes, 'protectedFields': ['name','slug','price','stock','inStock','image','brand','sku','note','disabled'], 'source': 'Public merged product and catalog snapshot 2026-10-07', 'total': len(PRODUCTS), 'active': sum(not p.get('disabled') for p in PRODUCTS), 'disabled': sum(bool(p.get('disabled')) for p in PRODUCTS)}
    payload = {'products': products, 'categories': categories}
    (ROOT / 'audit-evidence/production-release/js/seo-content.js').write_text('/* Factual SEO copy. Generated by audit/prepare-seo-data.py; admin fields remain authoritative after persistence. */\nwindow.CM_SEO = ' + json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + ';\n', 'utf-8')
    for name, data in [('product-seo-plan.json', plan), ('all-products-seo-audit.json', audit), ('all-categories-seo-audit.json', category_audit)]:
        (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    summary = {'totalProducts': len(PRODUCTS), 'activeProducts': plan['active'], 'disabledProducts': plan['disabled'], 'productsWithChanges': sum(bool(row['changes']) for row in changes), 'categories': len(CATEGORIES), 'uniqueTitles': len(titles), 'sourceConflicts': CONFLICTS, 'missingImages': [p['id'] for p in PRODUCTS if not p.get('image')], 'sourceCatalogModified': False}
    (OUT / 'seo-data-summary.json').write_text(json.dumps(summary, indent=2) + '\n', 'utf-8')
    print(json.dumps(summary))

if __name__ == '__main__': main()
