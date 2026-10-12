"""Read-only public verification after the explicit release install."""
from pathlib import Path
import hashlib
import json
import re
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
RELEASE = ROOT / 'audit-evidence/deploy-20261010-product-editor-seo'
plan = json.loads((RELEASE / 'plan.json').read_text())
checks = []
def get(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'CrackersMela-release-verification/1.0', 'Cache-Control': 'no-cache'})
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            return response.status, response.read(), dict(response.headers)
    except urllib.error.HTTPError as error:
        return error.code, error.read(), dict(error.headers)
def check(name, condition, detail=None):
    checks.append({'name': name, 'pass': bool(condition), **({'detail': detail} if detail is not None else {})})
    print(('PASS ' if condition else 'FAIL ') + name)
    assert condition, name
try:
    for origin in ['https://crackersmela.com', 'https://admin.crackersmela.com']:
        for path in ['/', '/js/app.js', '/js/product-media.js', '/js/visual-editor.js', '/js/editor-seo.js', '/js/cms-runtime.js']:
            status, data, headers = get(origin + path)
            check(origin + path + ' available', status == 200)
            if path == '/js/app.js': check(origin + ' uploader contains no remover pipeline', b'uploadWithBackgroundRemoval' not in data and b'bgRemoved' not in data)
            if path == '/js/product-media.js': check(origin + ' preserves-background helper is live', b'Upload a product image. Original image backgrounds are preserved.' in data)
            if path.startswith('/js/'):
                wanted = next(item['afterSha256'] for item in plan['files'] if item['path'] == path[1:])
                check(origin + path + ' matches tested release bytes', hashlib.sha256(data).hexdigest() == wanted)
        check(origin + ' visual editor requires authentication', get(origin + '/visual-editor')[0] == 401)
    status, data, _ = get('https://crackersmela.com/seo-api.php?a=published')
    public = json.loads(data)
    check('Public page/category SEO metadata available', status == 200 and public.get('ok') and len(public['pages']) >= 12 and len(public['categories']) >= 11)
    for route in ['', 'about', 'contact', 'faq', 'wholesale', 'shipping', 'returns', 'safety', 'terms', 'privacy', 'price-list', 'products']:
        status, data, _ = get('https://crackersmela.com/' + route)
        text = data.decode('utf-8')
        check('/' + route + ' renders valid page and unique head', status == 200 and len(re.findall(r'<title\b', text, re.I)) == 1 and len(re.findall(r'<link\b[^>]*rel=["\x27]canonical["\x27]', text, re.I)) == 1 and 'Fatal error' not in text)
    for category in list(public['categories'])[:2]:
        status, data, _ = get('https://crackersmela.com/category/' + category)
        check('Category ' + category + ' renders category schema', status == 200 and b'CollectionPage' in data)
    status, data, _ = get('https://crackersmela.com/sitemap.xml')
    root = ET.fromstring(data)
    urls = [item.text for item in root.findall('.//{http://www.sitemaps.org/schemas/sitemap/0.9}loc')]
    check('Sitemap is valid XML with clean product URLs', status == 200 and any('/product/' in url for url in urls) and all('#' not in url for url in urls))
    product = next(url for url in urls if '/product/' in url)
    status, data, _ = get(product)
    check('Live product page renders gallery and Product schema', status == 200 and b'Product' in data and b'product-gallery.js' in data)
finally:
    (RELEASE / 'live-verification.json').write_text(json.dumps({'checks': checks, 'passed': sum(c['pass'] for c in checks), 'total': len(checks)}, indent=2), encoding='utf-8')
