"""Verify the saved SEO fields and every protected product-data value."""
from pathlib import Path
import hashlib
import json

root = Path(__file__).resolve().parents[1]
folder = root / 'audit-evidence/live-seo-fields-20261007'
before = json.loads((folder / 'products.before.json').read_text('utf-8'))
after = json.loads((folder / 'products.after.json').read_text('utf-8'))
desired = json.loads((folder / 'fields.json').read_text('utf-8'))
fields = {'seoTitle', 'seoDesc', 'seoKeywords', 'seoSlug', 'seoTags'}
assert before['rev'] == 115 and after['rev'] == 116
checks = []
for row in desired:
    saved = after['productOverrides'][str(row['id'])]
    for key in fields:
        assert saved[key] == row['fields'][key], (row['id'], key)
        assert saved[key].strip(), (row['id'], key, 'empty')
    checks.append({'id': row['id'], 'fields': 5, 'status': 'PASS'})

def protected(document):
    document = {k: v for k, v in document.items() if k != 'rev'}
    document['productOverrides'] = {
        key: clean for key, value in document['productOverrides'].items()
        if (clean := {k: v for k, v in value.items() if k not in fields})
    }
    return document

assert protected(before) == protected(after), 'A protected value changed'
hashes = {}
for key, suffix in [('catalog', '.json'), ('seed', '.js')]:
    original = (folder / (key + '.before' + suffix)).read_bytes()
    current = (folder / (key + '.after' + suffix)).read_bytes()
    assert original == current, key + ' changed'
    hashes[key] = hashlib.sha256(current).hexdigest()
assert len(checks) == 117
report = {
    'status': 'PASS', 'products': len(checks), 'fields': 5 * len(checks),
    'revisionBefore': before['rev'], 'revisionAfter': after['rev'],
    'allNonSeoProductDataUnchanged': True, 'catalogUnchanged': True,
    'seedUnchanged': True, 'hashes': hashes, 'checks': checks,
}
(folder / 'verification.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps({k: v for k, v in report.items() if k != 'checks'}))
