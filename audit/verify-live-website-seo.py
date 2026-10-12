"""Independently verify captured public responses; never writes to the website."""
from pathlib import Path
from html.parser import HTMLParser
import copy
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'audit-evidence/live-website-seo-readonly-20261008'
FIELDS = ['title', 'description', 'ogTitle', 'ogDescription']
HOSTS = ['crackersmela.com', 'admin.crackersmela.com']


def load(path):
    return json.loads(path.read_text('utf-8-sig'))


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')


def protected(document):
    document = copy.deepcopy(document)
    for field in FIELDS:
        document.get('seo', {}).pop(field, None)
    return canonical(document)


class Metadata(HTMLParser):
    def __init__(self):
        super().__init__()
        self.meta = {}
        self.title = []
        self.in_title = False

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        if tag == 'title':
            self.in_title = True
        if tag == 'meta' and (attributes.get('name') or attributes.get('property')):
            key = attributes.get('name', attributes.get('property'))
            self.meta.setdefault(key, []).append(attributes.get('content'))
        if tag == 'link' and attributes.get('rel') == 'canonical':
            self.meta.setdefault('canonical', []).append(attributes.get('href'))

    def handle_endtag(self, tag):
        if tag == 'title':
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title.append(data)


before = load(ROOT / 'audit-evidence/live-seo-requested-fields-20261008/cms-authenticated-before.json')
after = load(OUT / 'authenticated-after.json')
requests = load(OUT / 'requests.json')
fetches = load(OUT / 'public-fetches.after.json')
assert len(fetches) == 12 and all(row['status'] == 200 for row in fetches)
report = {'status': 'PASS_DATA_WITH_PRODUCTS_INITIAL_HTML_LIMITATION', 'liveWritesPerformedByVerifier': False,
          'cms': {}, 'initialHTML': {}, 'limitations': []}

for page in ['home', 'products']:
    original = before[page]['body']
    saved = after[page]
    expected = requests[page]['save']['document']
    assert saved['version'] == original['version'] + 2
    assert saved['draft'] == expected and saved['published'] == expected
    assert protected(saved['draft']) == protected(original['draft'])
    assert protected(saved['published']) == protected(original['published'])
    assert {k: v for k, v in saved['pageInfo'].items() if k != 'version'} == {k: v for k, v in original['pageInfo'].items() if k != 'version'}
    for host in HOSTS:
        public = load(OUT / (host + '.' + page + '-api.after.json'))
        assert public['version'] == saved['version'] and public['published'] == expected
        assert protected(public['published']) == protected(original['published'])
    report['cms'][page] = {
        'versionBefore': original['version'], 'versionAfter': saved['version'],
        'draftAndPublishedMatchReviewedRequest': True, 'bothPublicHostsMatch': True,
        'protectedCanonicalBytesIdentical': True,
        'protectedSha256': hashlib.sha256(protected(expected)).hexdigest(),
        'sectionsPreserved': len(expected['sections']), 'onlyChangedDocumentFields': ['/seo/' + field for field in FIELDS],
    }

for host in HOSTS:
    path = OUT / (host + '.wholesale-api.after.json')
    assert path.read_bytes() == (OUT / 'wholesale.public.json').read_bytes()
report['cms']['wholesale'] = {'version': 0, 'published': None, 'bothHostsByteIdenticalToBefore': True}

product = load(ROOT / 'audit-evidence/live-seo-requested-fields-20261008/products.after.json')['productOverrides']['26']
for host in HOSTS:
    report['initialHTML'][host] = {}
    for page in ['home', 'products', 'product26']:
        parser = Metadata()
        parser.feed((OUT / (host + '.' + page + '-html.after.html')).read_text('utf-8-sig'))
        actual = {'title': ''.join(parser.title)}
        for field, key in [('description', 'description'), ('ogTitle', 'og:title'), ('ogDescription', 'og:description'), ('canonical', 'canonical'), ('robots', 'robots')]:
            assert len(parser.meta.get(key, [])) == 1, (host, page, key)
            actual[field] = parser.meta[key][0]
        expected = ({'title': product['seoTitle'], 'description': product['seoDesc'], 'ogTitle': product['seoTitle'], 'ogDescription': product['seoDesc']}
                    if page == 'product26' else requests[page]['save']['document']['seo'])
        matches = {field: actual[field] == expected[field] for field in FIELDS}
        if page in ['home', 'product26']:
            assert all(matches.values()), (host, page, matches)
        else:
            assert not any(matches.values()), 'Products source rendering changed; reassess limitation'
        expected_url = 'https://crackersmela.com/' + ('products' if page == 'products' else 'product/zamin-chakkar-big-1-box-10-pcs-smaller-size-than-ashoka-deluxe' if page == 'product26' else '')
        assert actual['canonical'] == expected_url
        assert ('noindex' in actual['robots']) == host.startswith('admin.')
        report['initialHTML'][host][page] = {'actual': actual, 'matchesSavedFields': matches,
                                           'existingCanonicalPreserved': True, 'keywordsMetaPresent': 'keywords' in parser.meta}

report['limitations'] = [
    'All eight supported Home/Products CMS fields persist and are published on both hosts. Direct /products initial HTML still uses the old static title/description/OG metadata; the current server renderer does not read these CMS overrides for this route. Browser-rendered metadata requires separate runtime verification.',
    'Website keywords cannot be saved through the current live CMS schema; its keyword field and rendering support require the pending source update.',
    'Wholesale has no saved CMS document. It remains untouched; no metadata-only API can preserve the null native fallback while filling its fields.',
    'Product 26 serves its saved title/description/OG values at the unchanged product URL. Initial HTML has no keywords meta tag; this verifier does not claim keyword rendering or indexing.',
]
(OUT / 'independent-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf-8')
print(json.dumps({'status': report['status'], 'cms': report['cms'], 'initialHTML': {host: {page: entry['matchesSavedFields'] for page, entry in pages.items()} for host, pages in report['initialHTML'].items()}, 'limitations': report['limitations']}))
