"""Exercise packaging in a synthetic temporary tree; never freeze the actual release."""
from pathlib import Path
import contextlib
import hashlib
import importlib.util
import io
import json
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('release_builder', ROOT / 'audit/build-category-shared-nav-release.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
assert {'cm-seo.php', 'seo-page.php', 'js/seo-content.js', 'js/seo-runtime.js'} <= set(builder.PATHS)
assert {'css/styles.css', 'js/coupons.js', 'css/coupons.css', 'cm-coupons.php', 'coupons-api.php'} <= set(builder.PATHS), 'Cart and coupon changes must be included in the source package'
assert not {'js/products-data.js', 'products.json', 'catalog.json'} & set(builder.PATHS)
latest_seo = ROOT / 'audit-artifacts/seo-all-fields-20261008'
assert builder.PRIVATE_FILES['operators/seo/product-seo-plan.json'] == latest_seo / 'product-seo-plan.json', 'Use the latest reviewed product SEO plan'
assert builder.PRIVATE_FILES['operators/seo/HANDOFF.md'] == latest_seo / 'HANDOFF.md', 'The operator handoff must describe the packaged plan'
assert builder.PRIVATE_FILES['operators/seo/website-seo-plan.json'].read_bytes() == (latest_seo / 'website-seo-plan.json').read_bytes(), 'Retain the reviewed website plan'
product_plan = json.loads(builder.PRIVATE_FILES['operators/seo/product-seo-plan.json'].read_text(encoding='utf-8'))
assert set(product_plan['fields']) == {'seoTitle', 'seoDesc', 'seoKeywords', 'seoSlug', 'seoTags'}
assert all(all(row['changes'][field] != row['expectedProduct'].get(field) for field in product_plan['fields']) for row in product_plan['changes']), 'Package all five revised product fields, not the earlier keyword-only plan'
for value in ['products.json', 'catalog.json', 'js/products-data.js', 'data/products.json', '../source.php', '/absolute.php', 'uploads/a.png', 'staff-config.php', 'operators/seo/product-seo-plan.json', 'audit-artifacts/report.json', 'tests/fixture.php']:
    try:
        builder.validate_relative(value)
    except ValueError:
        pass
    else:
        raise AssertionError('Unsafe path allowed: ' + value)
with tempfile.TemporaryDirectory(prefix='cm-release-package-test-') as temporary:
    root = Path(temporary)
    builder.EVIDENCE = root / 'evidence'
    builder.SOURCE = root / 'source'
    builder.OVERLAY = root / 'overlay'
    builder.BASELINE = builder.EVIDENCE / 'baseline'
    for relative in builder.PATHS:
        source, baseline = builder.SOURCE / relative, builder.BASELINE / relative
        source.parent.mkdir(parents=True, exist_ok=True)
        baseline.parent.mkdir(parents=True, exist_ok=True)
        source.write_bytes(('reviewed ' + relative).encode())
        baseline.write_bytes(('before ' + relative).encode())
    installer = builder.EVIDENCE / 'deploy-20261007-full1/install.py'
    installer.parent.mkdir(parents=True)
    installer.write_bytes(b'# synthetic installer; never run\n')
    sys.argv = ['build-category-shared-nav-release.py', '--release', 'synthetic-test']
    with contextlib.redirect_stdout(io.StringIO()):
        builder.main()
    stage = builder.EVIDENCE / 'deploy-synthetic-test'
    release = json.loads((stage / 'release.json').read_text())
    assert release['dataMigrationsAutomatic'] is False and release['deployed'] is False
    assert release['prepareSha256'] == hashlib.sha256((stage / 'prepare.py').read_bytes()).hexdigest()
    assert len(release['privateFiles']) == 5
    assert len(release['files']) == len(builder.PATHS)
    assert [entry['path'] for entry in release['files']][-3:] == ['visual-preview.php', 'editor-shell.html', 'index.html']
    for entry in release['files']:
        staged = stage / 'upload/production-release' / entry['path']
        assert staged.read_bytes() == (builder.SOURCE / entry['path']).read_bytes()
        assert hashlib.sha256(staged.read_bytes()).hexdigest() == entry['afterSha256']
    for entry in release['privateFiles']:
        assert entry['path'].startswith('operators/seo/')
        assert hashlib.sha256((stage / entry['path']).read_bytes()).hexdigest() == entry['sha256']
    assert not (stage / 'upload/production-release/operators').exists()
    assert not (stage / 'candidate.zip').exists(), 'No installer/preflight execution during build'
    assert all(path.name not in ['products.json', 'catalog.json', 'customers.json', 'orders.json'] for path in stage.rglob('*'))
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            builder.main()
    except SystemExit:
        pass
    else:
        raise AssertionError('Immutable stage overwrite allowed')
print(json.dumps({'status': 'PASS', 'sourceFiles': len(builder.PATHS), 'privateOperatorFiles': 5, 'actualReleaseFrozen': False, 'networkAccess': False, 'storeSnapshotsPackaged': False}))
