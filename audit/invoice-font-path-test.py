"""Real-mPDF regression: configured assets work; legacy default fonts still work.

Removing configured fontDir from the renderer must fail the external-assets case.
Replacing defaults instead of extending them must fail the legacy-fonts case.
This test mutates only the two verified test-owned aliases in isolated vendor/.
"""
from pathlib import Path
import hashlib, json, os, shutil, subprocess, sys

ROOT = Path(__file__).resolve().parents[1]
HERE = ROOT / 'audit-evidence/invoice-render-20261005'
label = sys.argv[1] if len(sys.argv) > 1 else 'current'
results = []
fonts = ['cmregular.ttf', 'cmregular-bold.ttf']
for name in fonts:
    alias = HERE / 'vendor/mpdf/mpdf/ttfonts' / name
    if alias.exists():
        assert alias.resolve().is_relative_to(HERE.resolve())
        assert hashlib.sha256(alias.read_bytes()).digest() == hashlib.sha256((HERE / 'invoice-assets' / name).read_bytes()).digest()
        alias.unlink()

def check_layout(layout):
    for version in ['8.1.34','8.3.35']:
        output = HERE / ('font-path-' + label) / version
        output.mkdir(parents=True, exist_ok=True)
        (output / 'tmp').mkdir(exist_ok=True)
        exe = ROOT / f'audit-evidence/tools/php-{version}/php.exe'
        env = os.environ.copy()
        env.update(CM_TEST_INVOICE_SOURCE=str(ROOT / 'audit-evidence/production-release/cm-invoice.php'), CM_INVOICE_FONT_DIR=str(HERE / ('invoice-assets' if layout == 'external-assets' else 'missing-assets')), CM_INVOICE_MPDF_AUTOLOAD=str(HERE / 'vendor/autoload.php'), CM_INVOICE_MPDF_TMP=str(output / 'tmp'))
        command = [str(exe), '-d', 'extension_dir=' + str(exe.parent / 'ext'), '-d', 'extension=mbstring', '-d', 'extension=gd', '-d', 'allow_url_fopen=0', '-d', 'date.timezone=Asia/Kolkata', str(ROOT / 'audit/invoice-render-harness.php'), str(ROOT / 'audit/invoice-render-standard-order.json'), str(output / (layout + '.pdf'))]
        run = subprocess.run(command,env=env,capture_output=True,text=True)
        result = json.loads(run.stdout)
        passed = run.returncode == 0 and result.get('ok') and not run.stderr
        results.append({'name':version + ' ' + layout, 'pass':bool(passed), 'details':result, 'stderr':run.stderr})

try:
    check_layout('external-assets')
finally:
    for name in fonts:
        shutil.copy2(HERE / 'invoice-assets' / name, HERE / 'vendor/mpdf/mpdf/ttfonts' / name)
check_layout('legacy-default-fonts')
report = {'sourceSha256':hashlib.sha256((ROOT / 'audit-evidence/production-release/cm-invoice.php').read_bytes()).hexdigest(), 'passed':sum(x['pass'] for x in results), 'failed':sum(not x['pass'] for x in results), 'results':results}
(HERE / ('font-path-' + label + '.json')).write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report))
raise SystemExit(1 if report['failed'] else 0)
