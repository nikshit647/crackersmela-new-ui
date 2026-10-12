"""Restore the deployed navigation CSS omitted from the current candidate."""
from pathlib import Path
import hashlib
import zipfile

root = Path(__file__).resolve().parents[1]
target = root / 'audit-evidence/production-release/css/styles.css'
marker = b'/* Mobile shop navigation: native scrolling with separate, quiet edge cues. */'
current = target.read_bytes()
assert marker not in current, 'Already restored'
with zipfile.ZipFile(root / 'audit-evidence/combined-review-package-20261006T124625.140519Z/candidate-changed-files.zip') as archive:
    deployed = archive.read('production-release/css/styles.css')
    assert deployed.count(marker) == 1
    block = deployed[deployed.index(marker):].replace(b'\r\r\n', b'\n').replace(b'\r\n', b'\n')
backup = root / 'audit-artifacts/seo-editor-20261007/styles.before-rail-restoration.css'
assert not backup.exists()
backup.write_bytes(current)
target.write_bytes(current + b'\n' + block)
print('Restored deployed mobile navigation CSS; SHA256 ' + hashlib.sha256(target.read_bytes()).hexdigest())
