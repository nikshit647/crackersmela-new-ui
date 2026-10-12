"""Freeze an allowlisted review package; never connect to or deploy a server."""
from datetime import datetime, timezone
from pathlib import Path
import difflib
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'audit-evidence/production-release'
PATHS = '''.htaccess
cm-cms.php
cm-coupons.php
cm-security.php
cm-seo.php
coupons-api.php
cms-page.php
cms-sitemap.php
editor-shell.html
index.html
orders-api.php
robots.php
robots.txt
seo-page.php
sitemap.php
css/coupons.css
css/styles.css
css/visual-editor.css
js/app.js
js/cms-runtime.js
js/coupons.js
js/coupons-admin.js
js/seo-content.js
js/seo-runtime.js'''.splitlines()
stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
output = ROOT / ('audit-evidence/seo-coupons-review-' + stamp)
output.mkdir()
reference = ROOT / 'audit-evidence/combined-review-package-20261006T124625.140519Z/candidate-changed-files.zip'
baseline = ROOT / 'audit-artifacts/seo-editor-20261007/seo-before/source'
coupon_before = ROOT / 'audit-artifacts/coupon-completion-20261007/before'
digest = lambda value: hashlib.sha256(value).hexdigest()
entries, patches = [], []
normalize = lambda value: value.decode('utf-8-sig').replace('\r\r\n', '\n').replace('\r\n', '\n')
with zipfile.ZipFile(reference) as previous, zipfile.ZipFile(output / 'candidate.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in PATHS:
        raw = (SOURCE / name).read_bytes()
        archive.writestr(name, raw)
        entry = {'path': name, 'bytes': len(raw), 'sha256': digest(raw), 'remoteBeforeVerified': False}
        prior_name = 'production-release/' + name
        old, origin = None, None
        if prior_name in previous.namelist():
            old, origin = previous.read(prior_name), 'verified historical October 6 deployment package'
        elif (baseline / name).is_file():
            old, origin = (baseline / name).read_bytes(), 'captured SEO source baseline; current remote state unverified'
        elif (coupon_before / name).is_file():
            old, origin = (coupon_before / name).read_bytes(), 'local coupon baseline; remote state unverified'
        if old is not None:
            entry.update(referenceSha256=digest(old), reference=origin)
            patches.extend(difflib.unified_diff(normalize(old).splitlines(True), normalize(raw).splitlines(True),
                                               fromfile='reference/' + name, tofile='candidate/' + name))
        else:
            entry['reference'] = 'No reliable source baseline; inspect current remote file before replacement'
            patches.extend(difflib.unified_diff([], normalize(raw).splitlines(True), fromfile='/dev/null', tofile='candidate/' + name))
        entries.append(entry)

with zipfile.ZipFile(output / 'candidate.zip') as archive:
    assert set(archive.namelist()) == set(PATHS)
    for item in entries:
        assert digest(archive.read(item['path'])) == item['sha256']
        assert digest((SOURCE / item['path']).read_bytes()) == item['sha256'], 'Source changed while packaging'
(output / 'review-normalized.patch').write_text(''.join(patches), encoding='utf-8')
operator_files = ['audit/migrate-product-seo.php', 'audit/migrate-cms-copy.php',
                  'audit-artifacts/seo-editor-20261007/product-seo-plan.json']
with zipfile.ZipFile(output / 'private-operator-tools.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in operator_files:
        archive.write(ROOT / name, arcname=Path(name).name)
manifest = {
    'createdAt': datetime.now(timezone.utc).isoformat(), 'files': entries,
    'root': '/home/crackersmela.com/public_html', 'deployed': False,
    'currentRemoteSourceVerified': False, 'remoteBackupCreated': False,
    'source': 'audit-evidence/production-release', 'sourceArchiveSha256': digest((output / 'candidate.zip').read_bytes()),
    'liveProductSeo': json.loads((ROOT / 'audit-evidence/live-seo-enrichment-20261007/verification.json').read_text()),
    'sourceArchiveContains': 'Only the 24 explicitly listed application files. No credentials, orders, customers, stock stores, uploads or operator tools.',
    'deploymentRequirements': [
        'Authenticated hosting access; compare all current remote files and preserve any newer changes.',
        'Complete browser/API/regression checks against the exact candidate.',
        'Private backup of every affected remote source and CMS/product store, retaining ownership and modes.',
        'Keep private-operator-tools.zip outside every public document root. Run migrations in dry-run mode first.',
        'Five SEO fields are already live; remaining product migration adds descriptions without replacing prices/stock/public slugs.',
        'After deployment verify source hashes, both hosts, cart-to-checkout, admin, editor, SEO, schema, sitemap and public copy.',
        'Rollback source from the fresh remote backup; use guarded migration receipts for data rollback.'
    ]
}
(output / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
(output / 'README.md').write_text(
    '# SEO, editor and coupon review package\n\n'
    'Application source has not been deployed. All five enriched SEO fields for 117 products are already saved live at product revision 117.\n\n'
    '`candidate.zip` contains the allowlisted application source only. `private-operator-tools.zip` must stay outside the public document root. '
    'The normalized patch is for review, not an exact-byte rollback artifact. The historical source is not a substitute for a fresh production backup.\n\n'
    'Preserves the newer category navigation/reorder and itemized email implementation. Current remote state, backup, exact source checks, '
    'and final integration tests must all be verified before deployment. Read manifest.json for the exact files and requirements.\n', encoding='utf-8')
(ROOT / 'audit-artifacts/seo-editor-20261007/release-package.json').write_text(json.dumps({'package': str(output.relative_to(ROOT)), 'sourceFiles': len(entries), 'deployed': False}, indent=2), encoding='utf-8')
print(json.dumps({'package': str(output), 'files': len(entries), 'exactArchiveHashesVerified': True, 'deployed': False}))
