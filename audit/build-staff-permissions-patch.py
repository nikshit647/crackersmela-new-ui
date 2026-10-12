"""Build the reviewed staff backend diff from explicit source files only."""
from pathlib import Path
import difflib
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
BASELINE = ROOT / 'audit-evidence/three-area-baseline-20261005'
CANDIDATE = ROOT / 'audit-evidence/production-release'
FILES = ('cm-security.php', 'cm-commerce.php', 'staff-auth.php', 'staff-users.php', 'customer-auth.php',
         'orders-api.php', 'products-api.php', 'catalog-api.php', 'analytics-api.php',
         'invoice-api.php', 'email-api.php', 'upload-api.php')
patch, manifest = [], []
for name in FILES:
    old_path, new_path = BASELINE / name, CANDIDATE / name
    old = old_path.read_bytes() if old_path.is_file() else b''
    new = new_path.read_bytes()
    if old == new:
        continue
    old_text = old.decode('utf-8-sig').replace('\r\n', '\n').replace('\r', '\n')
    new_text = new.decode('utf-8-sig').replace('\r\n', '\n').replace('\r', '\n')
    difference = difflib.unified_diff(old_text.splitlines(keepends=True),
                                      new_text.splitlines(keepends=True),
                                      fromfile='a/' + name if old_path.is_file() else '/dev/null',
                                      tofile='b/' + name)
    patch.extend(line if line.endswith('\n') else line + '\n\\ No newline at end of file\n'
                 for line in difference)
    manifest.append({'file': name, 'beforeSha256': hashlib.sha256(old).hexdigest() if old_path.is_file() else None,
                     'afterSha256': hashlib.sha256(new).hexdigest()})
patch_path = ROOT / 'audit-evidence/staff-permissions-change.patch'
manifest_path = ROOT / 'audit-evidence/staff-permissions-manifest.json'
patch_path.write_text(''.join(patch), encoding='utf-8', newline='\n')
manifest_path.write_text(json.dumps({'scope': 'Staff backend only; CMS and frontend patches are separate',
                                    'files': manifest}, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'files': len(manifest), 'patch': str(patch_path), 'manifest': str(manifest_path)}))
