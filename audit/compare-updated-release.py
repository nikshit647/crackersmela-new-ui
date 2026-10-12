"""Record source provenance against the newer, already deployed combined release."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
package = ROOT / 'audit-evidence/combined-review-package-20261006T124625.140519Z'
candidate = ROOT / 'audit-evidence/production-release'
output = ROOT / 'audit-artifacts/seo-editor-20261007'
digest = lambda data: hashlib.sha256(data).hexdigest()
same, changed = [], []
with zipfile.ZipFile(package / 'candidate-changed-files.zip') as archive:
    for name in archive.namelist():
        if not name.startswith('production-release/') or name.endswith('/'):
            continue
        relative = name.removeprefix('production-release/')
        before = archive.read(name)
        current = (candidate / relative).read_bytes()
        entry = {'path': relative, 'deployedReleaseSha256': digest(before), 'candidateSha256': digest(current)}
        (same if before == current else changed).append(entry)
receipt = json.loads((ROOT / 'audit-evidence/deploy-20261006/deployment.json').read_text())
result = {'referenceThread': '01a11104-1cfd-7de0-b104-27c211d278db',
          'referencePackage': str(package.relative_to(ROOT)), 'savedDeploymentReceipt': receipt,
          'currentRemoteSourceVerified': False, 'unchanged': same, 'changed': changed}
(output / 'source-provenance.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
body = ('# Updated version preserved\n\n'
        'The user identified chat `01a11104-1cfd-7de0-b104-27c211d278db` as the updated version. '
        'That chat used this same workspace and production candidate. Its frozen October 6 package '
        'contains the mobile category navigation, editor category ordering and itemized customer emails. '
        'The saved deployment receipt records 46 files deployed with matching checksums and no data-file changes. '
        'This is historical evidence, not a fresh verification of current remote files.\n\n'
        f'Compared all {len(same)+len(changed)} production files in that archive: '
        f'{len(same)} remain byte-identical and {len(changed)} have subsequent changes. '
        'The precise checksums are in source-provenance.json.\n\n'
        'Changed overlap:\n\n' + ''.join('- `' + e['path'] + '`\n' for e in changed) +
        '\nThe current SEO work and the remaining coupon request build on this candidate. '
        'The earlier preview at review/public is not a deployment source. '
        'Before deployment, obtain current remote source/data, compare against these known snapshots, '
        'and preserve any newer admin or source changes.\n')
(output / 'source-provenance.md').write_text(body, encoding='utf-8')
print(json.dumps({'compared':len(same)+len(changed),'unchanged':len(same),'changed':[e['path'] for e in changed]}))
