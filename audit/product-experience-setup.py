"""Capture only application source from the known host; never private stores."""
from pathlib import Path
import hashlib
import io
import json
import shutil
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[1]
TASK = ROOT / 'audit-evidence/product-experience-20261010'
FILES = ['cm-commerce.php', 'cms-media.php', 'seo-page.php', 'cm-seo.php',
 'cm-home.php', 'cms-page.php', 'cm-cms.php', 'cms-api.php', 'products-api.php',
 'catalog-api.php', 'categories-api.php', 'upload-api.php', 'cm-security.php',
 'staff-auth.php', 'staff-users.php', 'customer-auth.php', 'cm-google.php',
 'cm-coupons.php', 'coupons-api.php', 'cm-email.php', 'cm-email-templates.php',
 'cm-email-template-editor.php', 'cm-invoice.php', 'cm-pdf.php', 'orders-api.php',
 'email-api.php', 'invoice-api.php', 'customer-invoice-api.php', 'analytics-api.php',
 'cms-sitemap.php', 'sitemap.php', 'robots.php', 'robots.txt',
 'visual-editor.php', 'visual-preview.php', 'index.html', 'editor-shell.html',
 'js', 'css', 'api', '.htaccess']

if __name__ == '__main__':
    baseline = TASK / 'baseline'
    if baseline.exists():
        raise SystemExit('Baseline already exists; refusing to replace it')
    command = 'tar -C /home/crackersmela.com/public_html -cf - ' + ' '.join(FILES)
    result = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
                             '-o', 'ConnectTimeout=10', 'bluehost-vps', command],
                            capture_output=True, check=True, timeout=90)
    baseline.mkdir(parents=True)
    with tarfile.open(fileobj=io.BytesIO(result.stdout), mode='r:') as archive:
        archive.extractall(baseline, filter='data')
    manifest = {str(p.relative_to(baseline)).replace('\\', '/'):
                hashlib.sha256(p.read_bytes()).hexdigest()
                for p in baseline.rglob('*') if p.is_file()}
    (TASK / 'baseline-sha256.json').write_text(json.dumps(manifest, indent=2))
    shutil.copytree(baseline, TASK / 'source')
    local = ROOT / 'audit-evidence/production-release'
    changed = [p for p, h in manifest.items() if not (local / p).is_file()
               or hashlib.sha256((local / p).read_bytes()).hexdigest() != h]
    print(json.dumps({'capturedFiles': len(manifest), 'source': str(TASK / 'source'),
                      'differentFromOldLocalCopy': changed}, indent=2))
