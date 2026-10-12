"""Refresh one named isolated fixture's source from the current candidate tree."""
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / 'audit-evidence/seo-editor-fixture-20261007.json').read_text())
spec = importlib.util.spec_from_file_location('fixture_helper', ROOT / 'tests/cms-fixture.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
web = Path(manifest['documentRoot'])
module.copy_source(web)
print(json.dumps({'synced': str(web), 'publicUrl': manifest['publicUrl']}))
