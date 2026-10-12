"""Freeze only verified application changes, with known prior deployment hashes."""
from pathlib import Path
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
summary = json.loads((ROOT / 'audit/combined-review-package.json').read_text())
package = ROOT / summary['package']
manifest = json.loads((package / 'manifest.json').read_text())
destination = ROOT / 'audit-evidence/deploy-20261006'
destination.mkdir(exist_ok=True)
entries = []
for entry in manifest['files']:
    if not entry['path'].startswith('production-release/'):
        continue
    relative = entry['path'].removeprefix('production-release/')
    allowed = [entry['beforeSha256']]
    previous = ROOT / 'audit-evidence/deploy-20261004/editor' / relative
    if previous.is_file():
        allowed.append(hashlib.sha256(previous.read_bytes()).hexdigest())
    entries.append({'path': relative, 'afterSha256': entry['afterSha256'], 'allowedBefore': allowed})
shutil.copyfile(package / 'candidate-changed-files.zip', destination / 'candidate.zip')
plan = {'release': '20261006-124625', 'root': '/home/crackersmela.com/public_html',
        'zipSha256': hashlib.sha256((destination / 'candidate.zip').read_bytes()).hexdigest(), 'files': entries}
(destination / 'plan.json').write_text(json.dumps(plan, indent=2))
print(json.dumps({'files': len(entries), 'destination': str(destination)}))
