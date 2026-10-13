"""Use public catalog/publication data in a separate local synthetic test store."""
from pathlib import Path
import contextlib, importlib.util, io, json, shutil, sys, urllib.request
ROOT = Path(__file__).resolve().parents[1]
TASK = ROOT / 'audit-evidence/home-showcase-20261013'
spec = importlib.util.spec_from_file_location('cms_fixture', ROOT / 'tests/cms-fixture.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.MANIFEST = TASK / 'fixture.json'

def copy_candidate(web):
    original = json.loads((ROOT / 'audit-evidence/hero-hitbox-followup-20261013/fixture.json').read_text())
    shutil.copytree(Path(original['documentRoot']), web, dirs_exist_ok=True)
    shutil.copytree(TASK / 'candidate', web, dirs_exist_ok=True)

module.copy_source = copy_candidate
if '--refresh' in sys.argv:
    active = json.loads(module.MANIFEST.read_text())
    copy_candidate(Path(active['documentRoot']))
else:
    if not module.MANIFEST.exists():
        with contextlib.redirect_stdout(io.StringIO()):
            module.start(4317)
    active = json.loads(module.MANIFEST.read_text())
    data = Path(active['fixture']) / 'data'
    def public(endpoint):
        request = urllib.request.Request('https://crackersmela.com/' + endpoint, headers={'User-Agent': 'Mozilla/5.0', 'Referer': 'https://crackersmela.com/'})
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.load(response)
        assert result.get('ok') is True
        return result
    products = public('products-api.php?a=pull')
    catalog = public('catalog-api.php?a=pull')
    publication = public('cms-api.php?a=published&page=home')
    products.pop('ok', None); catalog.pop('ok', None)
    (data / 'products.json').write_text(json.dumps(products), encoding='utf-8')
    (data / 'catalog.json').write_text(json.dumps(catalog), encoding='utf-8')
    (data / 'categories.json').write_text(json.dumps({'categories': products.get('categories', [])}), encoding='utf-8')
    (data / 'cms-pages').mkdir(exist_ok=True)
    doc = publication['published']
    record = dict(version=1, draft=doc, published=doc, publishedVersion=1, savedAt=None, publishedAt=publication.get('publishedAt'), revisions=[])
    (data / 'cms-pages/home.json').write_text(json.dumps(record), encoding='utf-8')
    globals_record = dict(version=1, draft=publication['globals'], published=publication['globals'], savedAt=None, publishedAt=publication.get('publishedAt'))
    (data / 'cms-global-components.json').write_text(json.dumps(globals_record), encoding='utf-8')
    (TASK / 'public-publication.json').write_text(json.dumps(publication), encoding='utf-8')
print(json.dumps({'baseUrl': active['baseUrl'], 'fixture': active['fixture'], 'isolated': True}))
