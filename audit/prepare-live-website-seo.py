"""Prepare guarded CMS SEO requests from captured evidence; never calls a live write."""
from pathlib import Path
import copy
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'audit-evidence/live-website-seo-readonly-20261008'
CAPTURE = ROOT / 'audit-evidence/live-seo-requested-fields-20261008'
FIELDS = ['title', 'description', 'ogTitle', 'ogDescription']


def load(path):
    return json.loads(path.read_text('utf-8-sig'))


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def protected(document):
    document = copy.deepcopy(document)
    for field in FIELDS:
        document.get('seo', {}).pop(field, None)
    return document


def write(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2), 'utf-8')


captured = load(CAPTURE / 'cms-authenticated-before.json')
plan = load(ROOT / 'audit-artifacts/seo-all-fields-20261008/website-seo-plan.json')
requests = {}
report = {
    'status': 'PREPARED_NOT_SENT',
    'fields': FIELDS,
    'capturedInputSha256': hashlib.sha256((CAPTURE / 'cms-authenticated-before.json').read_bytes()).hexdigest(),
    'pages': {},
    'deferred': {
        'keywords': 'The recovered live CMS schema rejects this SEO property; the live editor also has no keyword field.',
        'wholesale': 'Both CMS documents are null at version 0. No metadata-only API exists; creating a document would replace the native fallback.',
    },
}
for page in ['home', 'products']:
    entry = captured[page]
    before = entry['body']
    public = load(OUT / (page + '.public.json'))
    assert entry['status'] == 200 and before['ok'] is True and before['page'] == page
    assert before['draft'] is not None and before['draft'] == before['published'], 'Draft/publication differ'
    assert public['version'] == before['version'] and public['published'] == before['published'], 'Capture conflict'
    assert before['pageInfo']['status'] == 'published'
    document = copy.deepcopy(before['draft'])
    changes = []
    for field in FIELDS:
        value = plan['pages'][page][field]
        assert isinstance(value, str) and value.strip()
        changes.append({'path': '/seo/' + field, 'before': document['seo'].get(field), 'after': value})
        document['seo'][field] = value
    assert canonical(protected(document)) == canonical(protected(before['draft']))
    save = {'page': page, 'expectedVersion': before['version'], 'document': document}
    publish = {'page': page, 'expectedVersion': before['version'] + 1}
    requests[page] = {'save': save, 'publish': publish}
    write(page + '.save-request.json', save)
    write(page + '.publish-request.json', publish)
    report['pages'][page] = {
        'versionBefore': before['version'], 'expectedSavedVersion': before['version'] + 1,
        'expectedPublishedVersion': before['version'] + 2,
        'draftEqualsPublished': True, 'documentSha256Before': digest(before['draft']),
        'documentSha256ExpectedAfter': digest(document),
        'protectedSha256': digest(protected(document)), 'changes': changes,
        'saveEndpoint': 'https://admin.crackersmela.com/cms-api.php?a=save',
        'publishEndpoint': 'https://admin.crackersmela.com/cms-api.php?a=publish',
    }
wholesale = captured['wholesale']['body']
assert wholesale['version'] == 0 and wholesale['draft'] is None and wholesale['published'] is None

# Supply the unchanged authoritative catalog to the recovered pure document validator.
seed_text = (CAPTURE / 'seed.after.js').read_text('utf-8-sig')
seed = json.loads(re.search(r'window\.CM_DATA\s*=\s*(\{.*\})\s*;?\s*$', seed_text, re.S)[1])
catalog = load(CAPTURE / 'products.after.json')
products = {str(product['id']): {**product, **catalog['productOverrides'].get(str(product['id']), {})}
            for product in seed['products'] + catalog['extraProducts']}
write('validator-catalog.json', {'categories': seed['categories'], 'products': products})
write('requests.json', requests)

php = ROOT / 'audit-evidence/tools/php-8.3.35/php.exe'
result = subprocess.run([str(php), str(OUT / 'validate-prepared.php')], capture_output=True, text=True, check=True)
assert not result.stderr.strip(), result.stderr
validation = json.loads(result.stdout)
assert validation['status'] == 'PASS'
report['recoveredValidator'] = validation
write('preflight.json', report)
print(json.dumps({'status': report['status'], 'pages': {p: {k: v for k, v in r.items() if k in ['versionBefore', 'expectedSavedVersion', 'expectedPublishedVersion', 'protectedSha256']} for p, r in report['pages'].items()}, 'validator': validation, 'deferred': report['deferred']}))
