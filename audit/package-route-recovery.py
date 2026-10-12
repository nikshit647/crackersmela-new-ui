"""Package the independently verified homepage-helper scope repair only."""
from pathlib import Path
import hashlib
import json
import shutil
import zipfile

root = Path(__file__).resolve().parents[1]
task = root / 'audit-evidence/product-experience-20261010'
release = root / 'audit-evidence/route-recovery-20261010'
release.mkdir(exist_ok=True)
baseline = (task / 'baseline/cms-page.php').read_bytes()
current = (task / 'source/cms-page.php').read_bytes()
# Strip the product feature additions to keep this urgent repair independent.
candidate = current.replace(b"require_once __DIR__ . '/cm-product-bootstrap.php';\r\n", b'').replace(b"require_once __DIR__ . '/cm-product-bootstrap.php';\n", b'')
candidate = candidate.replace(b'$html = cmProductBootstrapInject($html);\r\n', b'').replace(b'$html = cmProductBootstrapInject($html);\n', b'')
assert b"if ($id === 'home') {\r\n    $heroCopy" in candidate or b"if ($id === 'home') {\n    $heroCopy" in candidate
assert b'cmProductBootstrap' not in candidate
candidate_dir = release / 'source'
candidate_dir.mkdir(exist_ok=True)
(candidate_dir / 'cms-page.php').write_bytes(candidate)
digest = lambda value: hashlib.sha256(value).hexdigest()
before = json.loads((task / 'baseline-sha256.json').read_text())['cms-page.php']
assert digest(baseline) == before
with zipfile.ZipFile(release / 'candidate.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('production-release/cms-page.php', candidate)
plan = {'release': '20261010-route-recovery', 'root': '/home/crackersmela.com/public_html',
        'zipSha256': digest((release / 'candidate.zip').read_bytes()),
        'files': [{'path': 'cms-page.php', 'afterSha256': digest(candidate), 'allowedBefore': [before]}]}
(release / 'plan.json').write_text(json.dumps(plan, indent=2))
shutil.copy2(root / 'audit-evidence/deploy-20261007-full1/install.py', release / 'install.py')
print(json.dumps({'release': str(release), 'files': 1, 'before': before, 'after': digest(candidate)}))
