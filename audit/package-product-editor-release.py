"""Package only reviewed public application files; never include live records."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
TASK = ROOT / 'audit-evidence/product-experience-20261010'
SOURCE = TASK / 'source'
RELEASE = ROOT / 'audit-evidence/deploy-20261010-product-editor-seo'
VERSION = '20261010-editor-seo3'
ALLOWLIST = '''cm-cms.php cm-commerce.php cm-home.php cm-page-content.php cm-page-products.php
cm-product-bootstrap.php cm-product-brand.php cm-seo-settings.php cm-seo.php
cms-api.php cms-media.php cms-page.php products-api.php seo-api.php seo-page.php
seo-page-defaults.json sitemap.php upload-api.php visual-preview.php
css/cms-content.css css/product-brand.css css/product-gallery.css css/product-media.css css/visual-editor.css
js/app.js js/cms-element-actions.js js/cms-element-clipboard.js js/cms-preview.js js/cms-runtime.js
js/editor-upload.js js/editor-seo.js js/page-content.js js/product-brand.js js/product-gallery.js
js/product-media.js js/seo-assistant.js js/seo-manager.js js/seo-runtime.js js/visual-editor.js
images/brands/standard-fireworks.png editor-shell.html index.html'''.split()
parser = argparse.ArgumentParser()
parser.add_argument('--versions', action='store_true', help='Run once after agent edits finish, before final verification')
args = parser.parse_args()
digest = lambda value: hashlib.sha256(value).hexdigest()
baseline = json.loads((TASK / 'baseline-sha256.json').read_text())

if args.versions:
    assets = [Path(name).name for name in ALLOWLIST if name.endswith(('.js', '.css'))]
    expression = re.compile(r'(' + '|'.join(re.escape(name) for name in assets) + r')(?:\?v=[^\s\"\x27<>]*)?(?=[\"\x27])')
    updated = []
    for file in SOURCE.rglob('*'):
        if file.relative_to(SOURCE).as_posix() not in ['index.html', 'editor-shell.html', 'visual-preview.php', 'js/visual-editor.js'] or not file.is_file():
            continue
        text = file.read_text(encoding='utf-8')
        result = expression.sub(lambda match: match[1] + '?v=' + VERSION, text)
        if result != text:
            relative = file.relative_to(SOURCE).as_posix()
            assert relative in ALLOWLIST, 'Review additional reference file: ' + relative
            file.write_text(result, encoding='utf-8')
            updated.append(relative)
    print(json.dumps({'version': VERSION, 'updatedReferences': updated}))
    raise SystemExit(0)

RELEASE.mkdir(exist_ok=True)
files = []
for name in ALLOWLIST:
    file = SOURCE / name
    assert file.is_file(), 'Required reviewed source missing: ' + name
    after = digest(file.read_bytes())
    if after == baseline.get(name):
        continue
    before = baseline.get(name)
    if name == 'cms-page.php':
        before = '09a0571404a293f750202580034b14b07cdfc3f856a8f8aed7be65178c09743c'
    files.append({'path': name, 'afterSha256': after, 'allowedBefore': [before]})
# Install new dependencies before callers; switch HTML entry points last.
files.sort(key=lambda item: (2 if item['path'] in ['index.html', 'editor-shell.html'] else 0 if baseline.get(item['path']) is None else 1, ALLOWLIST.index(item['path'])))
with zipfile.ZipFile(RELEASE / 'candidate.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for item in files:
        archive.write(SOURCE / item['path'], 'production-release/' + item['path'])
plan = {'release': '20261010-product-editor-seo', 'root': '/home/crackersmela.com/public_html', 'assetVersion': VERSION,
        'zipSha256': digest((RELEASE / 'candidate.zip').read_bytes()), 'files': files}
(RELEASE / 'plan.json').write_text(json.dumps(plan, indent=2), encoding='utf-8')
shutil.copy2(ROOT / 'audit-evidence/deploy-20261007-full1/install.py', RELEASE / 'install.py')
print(json.dumps({'release': str(RELEASE), 'files': len(files), 'zipSha256': plan['zipSha256']}))
