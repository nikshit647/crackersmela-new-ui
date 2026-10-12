"""Dedicated isolated fixture for this SEO browser check; no production writes."""
from pathlib import Path
import contextlib
import importlib.util
import io
import json
import os
import shutil
import socket
import subprocess

ROOT = Path(__file__).resolve().parents[1]
ARTIFACT = Path(os.environ.get('CM_REQUESTED_SEO_ARTIFACT', ROOT / 'audit-artifacts/seo-keywords-20261008')).resolve()
spec = importlib.util.spec_from_file_location('cms_fixture', ROOT / 'tests/cms-fixture.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.MANIFEST = Path(os.environ.get('CM_REQUESTED_SEO_FIXTURE', ROOT / 'audit-evidence/seo-keywords-browser-fixture.json')).resolve()
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
with contextlib.redirect_stdout(io.StringIO()):
    module.start(port)
fixture = json.loads(module.MANIFEST.read_text(encoding='utf-8'))
base = Path(fixture['fixture']).resolve()
assert base.parent == (ROOT / 'audit-evidence').resolve() and base.name.startswith('cms-fixture-')
snapshot = ROOT / 'audit-evidence/seo-keywords-20261008'
for name in ['products.json', 'catalog.json']:
    value = json.loads((snapshot / name).read_text(encoding='utf-8'))
    value.pop('ok', None)
    (base / 'data' / name).write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
home = json.loads((snapshot / 'home.json').read_text(encoding='utf-8'))['published']
record = {'version': 83, 'publishedVersion': 83, 'status': 'published', 'draft': home, 'published': home}
(base / 'data/cms-pages.json').write_text(json.dumps({'schemaVersion': 1, 'pages': {'home': record}}, ensure_ascii=False), encoding='utf-8')
old_manifest = ROOT / 'audit-evidence/seo-editor-fixture-20261007.json'
if old_manifest.exists():
    previous = json.loads(old_manifest.read_text(encoding='utf-8'))
    previous_base = Path(previous['fixture']).resolve()
    assert previous_base.parent == (ROOT / 'audit-evidence').resolve() and previous_base.name.startswith('cms-fixture-')
    for relative in ['uploads', 'public/uploads', 'public/images']:
        if (previous_base / relative).is_dir():
            shutil.copytree(previous_base / relative, base / relative, dirs_exist_ok=True)
env = {**os.environ, 'CM_DATA_DIR': str(base / 'data'), 'CM_DISABLE_MAIL': '1'}
product = subprocess.run([str(module.PHP), str(ROOT / 'audit/migrate-product-seo.php'), '--root=' + str(base / 'public'), '--data-dir=' + str(base / 'data'), '--plan=' + str(ARTIFACT / 'product-seo-plan.json'), '--backup-dir=' + str(base / 'backups'), '--apply'], capture_output=True, text=True, env=env)
assert product.returncode == 0, product.stderr + product.stdout
for mode in ['prepare-seo', 'apply']:
    command = [str(module.PHP), str(ROOT / 'audit/migrate-cms-copy.php'), mode, str(base / 'public'), str(base / 'site-seo')]
    if mode == 'prepare-seo':
        command.append(str(ARTIFACT / 'website-seo-plan.json'))
    result = subprocess.run(command, capture_output=True, text=True, env=env)
    assert result.returncode == 0, result.stderr + result.stdout
print(json.dumps({'fixture': str(base), 'url': fixture['baseUrl'], 'isolated': True, 'productMigration': json.loads(product.stdout)}))
