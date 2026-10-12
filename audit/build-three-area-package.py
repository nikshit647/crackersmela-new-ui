"""Snapshot the integrated original task without rebuilding or changing source.

The saved baseline is selective. Its production files and full editor overlay
are compared, with explicit new original-task assets. Unbaselined pre-existing
supporting assets are inventoried separately and never asserted to be new.
"""
from datetime import datetime, timezone
from pathlib import Path
import difflib
import hashlib
import json
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
BASELINE = ROOT / 'audit-evidence/three-area-baseline-20261005'
PRODUCTION = ROOT / 'audit-evidence/production-release'
OVERLAY = ROOT / 'visual-editor'
INCLUDE_FOLLOWUPS = '--include-ui-followups' in sys.argv
if len(sys.argv) > 1 and sys.argv[1:] != ['--include-ui-followups']:
    raise SystemExit('Usage: build-three-area-package.py [--include-ui-followups]')
NEW_PRODUCTION = {
    'staff-users.php', 'css/staff-users.css', 'js/analytics-bootstrap.js',
    'js/cms-responsive.js', 'js/vendor/firebase/10.12.2/firebase-app-compat.js',
    'js/vendor/firebase/10.12.2/firebase-auth-compat.js',
    'js/vendor/firebase/10.12.2/LICENSE.txt',
}
FALLBACK_BASELINES = {'editor-shell.html': 'editor-overlay/editor-shell.html'}
category_assets = {p.relative_to(PRODUCTION).as_posix() for p in (PRODUCTION / 'images/categories').glob('*.svg')}
if category_assets and not INCLUDE_FOLLOWUPS:
    raise SystemExit('Follow-up assets are present. Use --include-ui-followups; the original package is already frozen.')
if INCLUDE_FOLLOWUPS:
    assert len(category_assets) == 11, 'Expected all eleven custom category illustrations'
    NEW_PRODUCTION.update(category_assets)
PACKAGE_STEM = 'combined-review' if INCLUDE_FOLLOWUPS else 'three-area'
PATCH_NAME = 'combined-work.patch' if INCLUDE_FOLLOWUPS else 'original-three-area.patch'
generated = datetime.now(timezone.utc)
stamp = generated.strftime('%Y%m%dT%H%M%S.%fZ')
PACKAGE = ROOT / 'audit-evidence' / (PACKAGE_STEM + '-package-' + stamp)
PACKAGE.mkdir()
CHECK = Path(tempfile.mkdtemp(prefix='three-area-apply-', dir=ROOT / 'audit-evidence'))
# The workspace's text/eol attributes would otherwise rewrite the verification
# checkout on Windows. The release snapshot must retain its original bytes.
(CHECK / '.gitattributes').write_text('* -text\n', encoding='utf-8')
sha256 = lambda data: hashlib.sha256(data).hexdigest()
entries, unchanged, unbaselined, mirrors, chunks = [], [], [], [], []
before_bytes, after_bytes = {}, {}


def add_diff(relative, old, new):
    old_text = '' if old is None else old.decode('utf-8')
    new_text = '' if new is None else new.decode('utf-8')
    difference = difflib.unified_diff(old_text.splitlines(keepends=True), new_text.splitlines(keepends=True),
                                     fromfile='/dev/null' if old is None else 'a/' + relative,
                                     tofile='/dev/null' if new is None else 'b/' + relative)
    for line in difference:
        if line.endswith('\n'):
            chunks.append(line)
        else:
            chunks.extend((line + '\n', '\\ No newline at end of file\n'))


def compare(area, relative, source, baseline):
    old = baseline.read_bytes() if baseline is not None and baseline.is_file() else None
    new = source.read_bytes() if source.is_file() else None
    item = {'path': area + '/' + relative, 'sourcePath': source.relative_to(ROOT).as_posix(),
            'baselinePath': baseline.relative_to(ROOT).as_posix() if baseline is not None else None,
            'beforeBytes': len(old) if old is not None else None, 'afterBytes': len(new) if new is not None else None,
            'beforeSha256': sha256(old) if old is not None else None, 'afterSha256': sha256(new) if new is not None else None}
    if area == 'production-release' and relative in FALLBACK_BASELINES:
        item['baselineCaveat'] = 'Production file was omitted from selective baseline; saved overlay copy is the comparison surrogate. Exact pre-task production rollback is not independently established.'
    if old == new:
        unchanged.append(item)
        return
    item['change'] = 'added' if old is None else 'deleted' if new is None else 'modified'
    entries.append(item)
    before_bytes[item['path']] = old
    after_bytes[item['path']] = new
    add_diff(item['path'], old, new)


production_baselines = {p.relative_to(BASELINE).as_posix(): p for p in BASELINE.rglob('*')
                        if p.is_file() and 'editor-overlay' not in p.relative_to(BASELINE).parts}
for name, fallback in FALLBACK_BASELINES.items():
    if name not in production_baselines:
        production_baselines[name] = BASELINE / fallback
for name in sorted(set(production_baselines) | NEW_PRODUCTION):
    compare('production-release', name, PRODUCTION / name, production_baselines.get(name))
for source in sorted(PRODUCTION.rglob('*')):
    if not source.is_file():
        continue
    relative = source.relative_to(PRODUCTION).as_posix()
    if relative not in production_baselines and relative not in NEW_PRODUCTION:
        content = source.read_bytes()
        unbaselined.append({'path': 'production-release/' + relative, 'bytes': len(content),
                            'sha256': sha256(content), 'classification': 'supporting file not captured by the selective baseline; no change assertion'})
overlay_baseline = BASELINE / 'editor-overlay'
overlay_names = {p.relative_to(overlay_baseline).as_posix() for p in overlay_baseline.rglob('*') if p.is_file()}
overlay_names |= {p.relative_to(OVERLAY).as_posix() for p in OVERLAY.rglob('*') if p.is_file()}
for name in sorted(overlay_names):
    compare('visual-editor', name, OVERLAY / name, overlay_baseline / name)
    production_copy = PRODUCTION / name
    if production_copy.is_file() and (OVERLAY / name).is_file():
        mirrors.append({'path': name, 'sameBytes': production_copy.read_bytes() == (OVERLAY / name).read_bytes(),
                        'productionSha256': sha256(production_copy.read_bytes()), 'overlaySha256': sha256((OVERLAY / name).read_bytes())})
patch = PACKAGE / PATCH_NAME
patch.write_bytes(''.join(chunks).encode('utf-8'))

for relative, old in before_bytes.items():
    if old is not None:
        path = CHECK / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(old)
git = ['git', '-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', 'apply']
directory = '--directory=' + CHECK.relative_to(ROOT).as_posix()
subprocess.run(git + ['--check', directory, str(patch)], cwd=ROOT, check=True, capture_output=True)
subprocess.run(git + [directory, str(patch)], cwd=ROOT, check=True, capture_output=True)
for relative, expected in after_bytes.items():
    actual = CHECK / relative
    assert (actual.read_bytes() if actual.is_file() else None) == expected, 'Patch output differs from source bytes: ' + relative
subprocess.run(git + ['--reverse', '--check', directory, str(patch)], cwd=ROOT, check=True, capture_output=True)
subprocess.run(git + ['--reverse', directory, str(patch)], cwd=ROOT, check=True, capture_output=True)
for relative, expected in before_bytes.items():
    actual = CHECK / relative
    assert (actual.read_bytes() if actual.is_file() else None) == expected, 'Rollback differs from baseline bytes: ' + relative
for name, content in [('candidate-changed-files.zip', after_bytes), ('rollback-changed-files.zip', before_bytes)]:
    with zipfile.ZipFile(PACKAGE / name, 'w', zipfile.ZIP_DEFLATED) as archive:
        for relative, data in content.items():
            if data is not None:
                archive.writestr(relative, data)

manifest = {
    'generatedAt': generated.isoformat().replace('+00:00', 'Z'),
    'scope': ('Staff permissions, responsive editor, console fixes, Promo Bar editor, category design/reordering/mobile navigation, invoice font-directory correction, and itemized customer order emails' if INCLUDE_FOLLOWUPS else 'Original staff permissions, responsive editor, and console regression task only'),
    'sourceRebuilt': False, 'deployed': False,
    'baseline': BASELINE.relative_to(ROOT).as_posix(),
    'baselineLimit': 'Selective production snapshot plus full editor overlay. Production editor-shell.html uses its saved overlay copy as a surrogate because the production baseline omitted it; its exact pre-task production rollback is not independently established.',
    'queuedUnimplemented': [] if INCLUDE_FOLLOWUPS else ['Promo Bar contextual editor', 'Shop by Categories redesign'],
    'storefrontVerification': 'See audit/storefront-cua-verification-20261005.md and the final combined report for tested scope and live limitations' if INCLUDE_FOLLOWUPS else 'pending root final review at package creation',
    'files': entries, 'unchangedBaselinedFiles': unchanged,
    'unbaselinedSupportingFiles': unbaselined, 'overlayMirrors': mirrors,
    'verification': {'forwardPatchExactBytes': True, 'reversePatchExactBytesAgainstDeclaredBaseline': True,
                     'allOverlayMirrorsMatch': all(item['sameBytes'] for item in mirrors)},
    'artifacts': {},
}
for name in [PATCH_NAME, 'candidate-changed-files.zip', 'rollback-changed-files.zip']:
    data = (PACKAGE / name).read_bytes()
    manifest['artifacts'][name] = {'bytes': len(data), 'sha256': sha256(data)}
# Write the same bytes that are hashed; write_text would translate LF to CRLF
# on Windows and make manifestSha256 disagree with the saved artifact.
manifest_bytes = (json.dumps(manifest, indent=2) + '\n').encode('utf-8')
(PACKAGE / 'manifest.json').write_bytes(manifest_bytes)
(ROOT / ('audit/' + PACKAGE_STEM + '-change-manifest.json')).write_bytes(manifest_bytes)
summary = {'generatedAt': manifest['generatedAt'], 'package': PACKAGE.relative_to(ROOT).as_posix(),
           'changedFiles': len(entries), 'productionChanged': sum(item['path'].startswith('production-release/') for item in entries),
           'overlayChanged': sum(item['path'].startswith('visual-editor/') for item in entries),
           'unbaselinedSupportingFiles': len(unbaselined), 'verification': manifest['verification'],
           'manifestSha256': sha256(manifest_bytes)}
(ROOT / ('audit/' + PACKAGE_STEM + '-package.json')).write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
(PACKAGE / 'README.md').write_text(
    ('# Combined review package\n\n' if INCLUDE_FOLLOWUPS else '# Original three-area change package\n\n')
    + 'Created ' + manifest['generatedAt'] + '. No candidate rebuild or deployment occurred.\n\n'
    + 'The patch uses logical production-release/ and visual-editor/ roots. Candidate and rollback ZIPs retain exact original file bytes. '
    + 'Forward and reverse patch application were tested against the declared baseline inputs and compared byte-for-byte. '
    + 'New files have no rollback copy; reversing the patch removes them. Private data, customer records, credentials and uploads are not packaged.\n\n'
    + 'This is a changed-file review package, not a complete installation bundle. The baseline was selective; unbaselined supporting files are inventoried in manifest.json without a new/changed claim. '
    + 'Production editor-shell.html was omitted from the selective baseline, so its saved overlay copy is a comparison surrogate; exact pre-task production rollback for that one file is not independently established.\n\n'
    + ('Includes Promo Bar, category reordering/mobile navigation, itemized customer email follow-ups and the invoice font-directory correction. Read the combined verification report for tested scope and remaining limitations. Local preview refresh helpers are excluded from the release. ' if INCLUDE_FOLLOWUPS else 'Promo Bar and Shop by Categories follow-ups are queued and unimplemented. Final storefront review remains pending at packaging time. ')
    + 'Do not use the old broad integration/build scripts to rebuild this candidate; they would overwrite integrated work.\n', encoding='utf-8')
print(json.dumps(summary))
