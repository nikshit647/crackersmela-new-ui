"""Read every public catalog page. Never authenticates or writes to the website."""
import argparse
import concurrent.futures
import hashlib
import html
import json
import pathlib
import re
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / 'audit-artifacts/seo-editor-20261007/seo-before'

def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'CrackersMela-owner-SEO-audit/1.0'})
    try:
        with urllib.request.urlopen(request, timeout=35) as response:
            return response.status, response.read(), dict(response.headers), response.url
    except urllib.error.HTTPError as error:
        return error.code, error.read(), dict(error.headers), error.url

def inspect(url):
    time.sleep(1)
    status, raw, headers, final = fetch(url)
    document = raw.decode('utf-8', 'replace')
    def one(pattern):
        matches = re.findall(pattern, document, re.I | re.S)
        return [html.unescape(re.sub('<[^>]+>', '', value)).strip() for value in matches]
    schemas, errors = [], []
    for value in re.findall(r'<script[^>]+type=[\"\']application/ld\+json[\"\'][^>]*>(.*?)</script>', document, re.I | re.S):
        try: schemas.append(json.loads(value))
        except ValueError as error: errors.append(str(error))
    return {'url': url, 'status': status, 'finalUrl': final, 'bytes': len(raw),
            'sha256': hashlib.sha256(raw).hexdigest(),
            'title': one(r'<title[^>]*>(.*?)</title>'),
            'description': one(r'<meta[^>]+name=[\"\']description[\"\'][^>]+content=[\"\'](.*?)[\"\']'),
            'canonical': one(r'<link[^>]+rel=[\"\']canonical[\"\'][^>]+href=[\"\'](.*?)[\"\']'),
            'h1': one(r'<h1[^>]*>(.*?)</h1>'), 'schemas': schemas, 'schemaParseErrors': errors,
            'links': re.findall(r'<a[^>]+href=[\"\']([^\"\']+)', document, re.I),
            'robots': one(r'<meta[^>]+name=[\"\']robots[\"\'][^>]+content=[\"\'](.*?)[\"\']'),
            'xRobots': next((v for k,v in headers.items() if k.lower() == 'x-robots-tag'), None),
            'oldPhrase': 'PESO-certified' in document}

def run():
    args = argparse.ArgumentParser()
    args.add_argument('--base', default='https://crackersmela.com')
    args.add_argument('--output', default='audit-artifacts/seo-editor-20261007/seo-before/crawl.json')
    options = args.parse_args()
    products = json.loads((SNAPSHOT / 'merged-products.json').read_text('utf-8'))
    categories = json.loads((SNAPSHOT / 'categories.json').read_text('utf-8'))
    paths = ['/', '/products', '/about', '/contact', '/faq', '/shipping', '/returns', '/terms', '/privacy', '/safety', '/wholesale', '/price-list']
    paths += ['/product/' + p['slug'] for p in products if not p.get('disabled')]
    paths += ['/category/' + c['id'] for c in categories]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(inspect, [options.base + path for path in paths]))
    target = ROOT / options.output
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(results, indent=2, ensure_ascii=False), 'utf-8')
    sitemap = ET.fromstring(fetch(options.base + '/sitemap.xml')[1])
    locations = [node.text for node in sitemap.iter() if node.tag.endswith('}loc')]
    summary = {'pages': len(results), 'products': len(products), 'categories': len(categories),
               'non200': [r['url'] for r in results if r['status'] != 200],
               'missingH1': [r['url'] for r in results if not r['h1']],
               'schemaParseErrors': sum(len(r['schemaParseErrors']) for r in results),
               'sitemapUrls': len(locations), 'sitemapDuplicates': len(locations)-len(set(locations)),
               'missingFromSitemap': [r['url'] for r in results if r['status']==200 and r['url'].replace(options.base, 'https://crackersmela.com') not in locations],
               'oldPhrasePages': [r['url'] for r in results if r['oldPhrase']]}
    target.with_name(target.stem + '-summary.json').write_text(json.dumps(summary, indent=2), 'utf-8')
    print(json.dumps(summary))

if __name__ == '__main__': run()
