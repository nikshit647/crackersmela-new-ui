"""Freeze the category-order release: staged files + plan + host tooling.

Mirrors the proven 20261007-full1 staging layout so the deploy is a single
command run by the operator. This script never connects to the server.
"""
from pathlib import Path
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'audit-evidence/production-release'
BASELINE = ROOT / 'audit-evidence/deploy-20261007-full1'
STAGE = ROOT / 'audit-evidence/deploy-20261008-catorder2'
RELEASE = '20261008-catorder2'
REMOTE = f'/root/cm-release-{RELEASE}'

# Dependency order, not alphabetical: assets first, then backend behaviour,
# then the files that reference them. index.html is LAST because it is the
# activation switch for every versioned asset.
PATHS = [
    'js/app.js',
    'js/cms-runtime.js',
    'js/cms-preview.js',
    'js/visual-editor.js',
    'css/cms-content.css',
    'css/visual-editor.css',
    'cm-cms.php',
    'cms-page.php',
    'sitemap.php',
    'visual-preview.php',
    'editor-shell.html',
    'index.html',
]

digest = lambda value: hashlib.sha256(value).hexdigest()

upload = STAGE / 'upload/production-release'
if STAGE.exists():
    raise SystemExit('Refusing to overwrite an existing release stage: ' + str(STAGE))
for relative in PATHS:
    target = upload / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(SOURCE / relative, target)

entries = []
for relative in PATHS:
    data = (upload / relative).read_bytes()
    origin = ''
    base = BASELINE / 'upload/production-release' / relative
    if base.is_file():
        same = digest(base.read_bytes()) == digest(data)
        origin = 'matches 20261007-full1 (already live)' if same else 'differs from 20261007-full1'
    else:
        origin = 'not in 20261007-full1 allowlist; long-standing live file changed by this feature'
    entries.append({'path': relative, 'bytes': len(data), 'sha256': digest(data), 'comparedTo': origin})

# install.py is generic (it reads plan.json); reuse the proven copy verbatim.
shutil.copy2(BASELINE / 'install.py', STAGE / 'install.py')

prepare = f'''"""Freeze the {RELEASE} category-order release with live before-hashes.

Run on the host alongside install.py. PATHS is a dependency order:
assets first, then backend behaviour, then the activation files last.
index.html is last because it references every versioned asset.

`allowedBefore` records the live hash at prepare time, so preflight fails loudly
if a destination changed underneath us instead of overwriting a newer edit.
Files that do not exist yet record [None]; install.py treats that as
"expected absent" and its rollback removes them again.
"""
from pathlib import Path
import hashlib
import json
import zipfile

STAGE = Path(__file__).resolve().parent
SOURCE = STAGE / 'upload' / 'production-release'
ROOT = Path('/home/crackersmela.com/public_html')
RELEASE = {RELEASE!r}
PATHS = {json.dumps(PATHS, indent=4).replace(chr(10), chr(10))}

digest = lambda value: hashlib.sha256(value).hexdigest()

entries = []
with zipfile.ZipFile(STAGE / 'candidate.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for relative in PATHS:
        data = (SOURCE / relative).read_bytes()
        live_path = ROOT / relative
        allowed = [digest(live_path.read_bytes())] if live_path.is_file() else [None]
        archive.writestr('production-release/' + relative, data)
        entries.append({{'path': relative, 'afterSha256': digest(data), 'allowedBefore': allowed}})

plan = {{'release': RELEASE, 'root': str(ROOT), 'files': entries}}
plan['zipSha256'] = digest((STAGE / 'candidate.zip').read_bytes())
(STAGE / 'plan.json').write_text(json.dumps(plan, indent=2))
print(json.dumps({{
    'release': RELEASE,
    'files': len(entries),
    'installOrder': PATHS,
    'zipSha256': plan['zipSha256'],
}}, indent=2))
'''
(STAGE / 'prepare.py').write_text(prepare, encoding='utf-8')

verify_paths = ' '.join("'%s'" % p for p in PATHS)
urls = ['/', '/products', '/category/sparklers', '/sitemap.xml', '/robots.txt',
        '/product/zamin-chakkar-big-1-box-10-pcs-smaller-size-than-ashoka-deluxe',
        '/visual-editor', '/about', '/track']
commands = []
for relative in PATHS:
    commands.append({'action': 'put', 'local': f'audit-evidence/deploy-20261008-catorder2/upload/production-release/{relative}',
                     'remote': f'{REMOTE}/upload/production-release/{relative}'})
commands.append({'action': 'put', 'local': f'audit-evidence/deploy-20261008-catorder2/prepare.py', 'remote': f'{REMOTE}/prepare.py'})
commands.append({'action': 'put', 'local': f'audit-evidence/deploy-20261008-catorder2/install.py', 'remote': f'{REMOTE}/install.py'})
commands.append({'action': 'exec', 'command': f'cd {REMOTE} && python3 prepare.py', 'timeout': 180})
commands.append({'action': 'exec', 'command': f'cd {REMOTE} && python3 install.py preflight && cat preflight.json', 'timeout': 300})
commands.append({'action': 'exec', 'command': f'cd {REMOTE} && python3 install.py install && cat deployment.json', 'timeout': 300})
commands.append({'action': 'exec', 'command': "cd /home/crackersmela.com/public_html && sha256sum " + verify_paths, 'timeout': 120})
commands.append({'action': 'exec',
                 'command': "for u in " + ' '.join(urls) + "; do code=$(curl -s -k -o /dev/null -w '%{http_code}' -H 'Host: crackersmela.com' \"https://127.0.0.1$u\"); echo \"$code  $u\"; done",
                 'timeout': 240})
commands.append({'action': 'close'})
(STAGE / 'commands.jsonl').write_text(''.join(json.dumps(c) + '\n' for c in commands), encoding='utf-8')

manifest = {
    'release': RELEASE,
    'createdFrom': str(SOURCE.relative_to(ROOT)),
    'fileCount': len(entries),
    'remoteStage': REMOTE,
    'deployed': False,
    'operator': 'python audit/deploy-session.py < audit-evidence/deploy-20261008-catorder2/commands.jsonl',
    'files': entries,
    'notes': [
        'One canonical global category order (document-root categoryOrder) drives the mega-menu, sidebar, mobile rail, drawer, footer and home grid.',
        'Category ids, names, slugs, products and product-category memberships are untouched; only display order changes.',
        'install.py takes a before-image tarball of every destination and rolls back automatically on any failure.',
        'preflight exits non-zero on any destination whose live hash differs from allowedBefore.',
    ],
}
(STAGE / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')

print(json.dumps({
    'staged': str(STAGE),
    'files': len(entries),
    'commands': len(commands),
    'deploy': manifest['operator'],
}, indent=2))
for entry in entries:
    print(f"  {entry['sha256'][:12]}  {entry['bytes']:>7}  {entry['path']}")