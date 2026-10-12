"""Local real-PHP fixture for the captured production source; private mail disabled."""
from pathlib import Path
import contextlib
import importlib.util
import io
import json
import shutil
import sys
import argparse

ROOT = Path(__file__).resolve().parents[1]
TASK = ROOT / 'audit-evidence/product-experience-20261010'
spec = importlib.util.spec_from_file_location('cms_fixture', ROOT / 'tests/cms-fixture.py')
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
fixture.RELEASE = TASK / 'source'
parser = argparse.ArgumentParser()
parser.add_argument('--refresh', action='store_true')
parser.add_argument('--port', type=int, default=4328)
parser.add_argument('--manifest', default='fixture.json')
args = parser.parse_args()
if Path(args.manifest).name != args.manifest:
    raise ValueError('Use a manifest filename inside the task evidence directory')
fixture.MANIFEST = TASK / args.manifest
def copy(web):
    shutil.copytree(ROOT / 'review/public/images', web / 'images', dirs_exist_ok=True)
    shutil.copytree(fixture.RELEASE, web, dirs_exist_ok=True)
fixture.copy_source = copy
with contextlib.redirect_stdout(io.StringIO()):
    if args.refresh:
        fixture.refresh()
    else:
        fixture.start(args.port)
active = json.loads(fixture.MANIFEST.read_text())
router = Path(active['fixture']) / 'router.php'
routes = router.read_text(encoding='utf-8')
routes = routes.replace('(about|contact|faq|shipping|safety|wholesale|returns|terms|privacy)', '(about|contact|faq|shipping|safety|wholesale|returns|terms|privacy|price-list)')
router.write_text(routes, encoding='utf-8')
print(json.dumps({key: active[key] for key in ['baseUrl', 'publicUrl', 'editorUrl', 'documentRoot', 'pid']}))
