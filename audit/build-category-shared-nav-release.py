"""Freeze reviewed category/nav/layout/cart/coupon/SEO sources and private operators, without connecting.

Run only after the source is verified, for example:
  python audit/build-category-shared-nav-release.py --release 20261008-catnav1

The default before-hashes come from the October 7 release, with unchanged editor
files inherited from the verified October 6 archive. An unexpected server hash
stops preflight; preparing a release never blesses an unknown live file.
"""
from pathlib import Path, PurePosixPath
import argparse
from datetime import datetime, timezone
import hashlib
import json
import re
import zipfile


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "audit-evidence"
SOURCE = EVIDENCE / "production-release"
OVERLAY = ROOT / "visual-editor"
BASELINE = EVIDENCE / "deploy-20261007-full1/upload/production-release"
OLDER = EVIDENCE / "deploy-20261006/candidate.zip"
PATHS = [
    "js/app.js", "js/cms-runtime.js", "js/cms-preview.js", "js/cms-model.js", "js/visual-editor.js", "js/coupons.js",
    "css/styles.css", "css/cms-content.css", "css/visual-editor.css", "css/coupons.css",
    "cm-cms.php", "cms-api.php", "cms-page.php", "sitemap.php",
    "cm-coupons.php", "coupons-api.php",
    "cm-seo.php", "seo-page.php", "js/seo-content.js", "js/seo-runtime.js",
    "visual-preview.php", "editor-shell.html", "index.html",
]
PRIVATE_FILES = {
    "operators/seo/migrate-product-seo.php": ROOT / "audit/migrate-product-seo.php",
    "operators/seo/migrate-cms-copy.php": ROOT / "audit/migrate-cms-copy.php",
    "operators/seo/product-seo-plan.json": ROOT / "audit-artifacts/seo-all-fields-20261008/product-seo-plan.json",
    "operators/seo/website-seo-plan.json": ROOT / "audit-artifacts/seo-keywords-20261008/website-seo-plan.json",
    "operators/seo/HANDOFF.md": ROOT / "audit-artifacts/seo-all-fields-20261008/HANDOFF.md",
}


def digest(value):
    return hashlib.sha256(value).hexdigest()


def validate_relative(value):
    path = PurePosixPath(value)
    forbidden = {"data", "uploads", "vendor-lib", "invoice-assets", "operators", "fixtures", "audit-evidence", "audit-artifacts", "tests", "review"}
    private = {"products.json", "catalog.json", "orders.json", "customers.json",
               "products-data.js", ".env", "staff-config.php", "email-config.php"}
    if (path.is_absolute() or ".." in path.parts or "\\" in value
            or not path.parts or path.parts[0] in forbidden
            or path.name in private or any(part.startswith(".") for part in path.parts)):
        raise ValueError("Out-of-scope release path: " + value)
    return path.as_posix()


def before_image(relative, approved_baseline):
    if approved_baseline:
        source = approved_baseline / relative
        if not source.is_file():
            raise ValueError("Explicit live-source baseline is missing " + relative)
        return source.read_bytes(), str(source.relative_to(EVIDENCE))
    source = BASELINE / relative
    if source.is_file():
        return source.read_bytes(), "deploy-20261007-full1/upload/production-release/" + relative
    with zipfile.ZipFile(OLDER) as archive:
        name = "production-release/" + relative
        if name not in archive.namelist():
            raise ValueError("No reviewed before-image for " + relative
                             + "; capture/review live source and use --baseline-dir")
        return archive.read(name), "deploy-20261006/candidate.zip!" + name


HOST_PREPARE = r'''"""Verify immutable candidate and reviewed live hashes, then run preflight."""
from pathlib import Path
import hashlib
import json
import subprocess
import zipfile

stage = Path(__file__).resolve().parent
spec = json.loads((stage / 'release.json').read_text())
root = Path('/home/crackersmela.com/public_html')
assert spec['root'] == str(root)
assert stage == Path('/root/cm-release-' + spec['release'])
digest = lambda value: hashlib.sha256(value).hexdigest()
conflicts = []
for entry in spec['files']:
    relative = Path(entry['path'])
    assert not relative.is_absolute() and '..' not in relative.parts
    target = root / relative
    assert target.resolve().is_relative_to(root.resolve()) and not target.is_symlink()
    actual = digest(target.read_bytes()) if target.is_file() else None
    if actual != entry['expectedBeforeSha256']:
        conflicts.append({'path': entry['path'], 'expected': entry['expectedBeforeSha256'], 'actual': actual})
    candidate = stage / 'upload/production-release' / relative
    assert digest(candidate.read_bytes()) == entry['afterSha256'], 'Candidate changed: ' + entry['path']
report = {'release': spec['release'], 'reviewedBaselineMatches': not conflicts, 'conflicts': conflicts}
(stage / 'baseline-check.json').write_text(json.dumps(report, indent=2))
if conflicts:
    print(json.dumps(report))
    raise SystemExit('Live source differs from the reviewed baseline; nothing was installed')
assert digest((stage / 'install.py').read_bytes()) == spec['installerSha256']
for entry in spec.get('privateFiles', []):
    relative = Path(entry['path'])
    assert relative.parts[:2] == ('operators', 'seo') and '..' not in relative.parts
    operator = stage / relative
    assert operator.resolve().is_relative_to((stage / 'operators/seo').resolve())
    assert digest(operator.read_bytes()) == entry['sha256'], 'Private operator changed: ' + entry['path']
assert not (stage / 'deployment.json').exists(), 'This release was already installed'
entries = []
with zipfile.ZipFile(stage / 'candidate.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for item in spec['files']:
        data = (stage / 'upload/production-release' / item['path']).read_bytes()
        archive.writestr('production-release/' + item['path'], data)
        entries.append({'path': item['path'], 'afterSha256': item['afterSha256'],
                        'allowedBefore': [item['expectedBeforeSha256']]})
plan = {'release': spec['release'], 'root': str(root), 'files': entries,
        'zipSha256': digest((stage / 'candidate.zip').read_bytes())}
(stage / 'plan.json').write_text(json.dumps(plan, indent=2))
subprocess.run(['python3', str(stage / 'install.py'), 'preflight'], check=True)
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release", required=True)
    parser.add_argument("--include", action="append", default=[],
                        help="Explicit additional changed source path; no directory uploads")
    parser.add_argument("--baseline-dir", type=Path,
                        help="Reviewed live-source snapshot inside audit-evidence, if archived hashes differ")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{3,63}", args.release):
        parser.error("Use a unique lowercase release ID of 4–64 letters, numbers and hyphens")
    approved = args.baseline_dir.resolve() if args.baseline_dir else None
    if approved and (not approved.is_dir() or not approved.is_relative_to(EVIDENCE.resolve())):
        parser.error("--baseline-dir must be a reviewed snapshot directory inside audit-evidence")
    stage = EVIDENCE / ("deploy-" + args.release)
    if stage.exists():
        raise SystemExit("Refusing to overwrite an existing release stage: " + str(stage))
    paths = list(dict.fromkeys(validate_relative(p) for p in [*PATHS[:-3], *args.include, *PATHS[-3:]]))
    # Keep entrypoints last even if an --include duplicates an existing path.
    paths = [p for p in paths if p not in PATHS[-3:]] + PATHS[-3:]
    frozen = []
    for relative in paths:
        source = SOURCE / relative
        if not source.is_file() or source.is_symlink():
            raise ValueError("Missing/linked candidate: " + relative)
        data = source.read_bytes()
        overlay = OVERLAY / relative
        if overlay.is_file() and overlay.read_bytes() != data:
            raise ValueError("Synchronize the reviewed editor overlay before freezing " + relative)
        before, origin = before_image(relative, approved)
        frozen.append((relative, data, {"path": relative, "bytes": len(data),
                       "afterSha256": digest(data), "expectedBeforeSha256": digest(before),
                       "baselineSource": origin, "changedFromBaseline": before != data}))
    installer = (EVIDENCE / "deploy-20261007-full1/install.py").read_bytes()
    private_frozen = []
    for relative, source in PRIVATE_FILES.items():
        if not source.is_file() or source.is_symlink():
            raise ValueError("Missing/linked private operator: " + relative)
        data = source.read_bytes()
        private_frozen.append((relative, data, {"path": relative, "bytes": len(data), "sha256": digest(data)}))
    stage.mkdir(exist_ok=False)
    for relative, data, _ in frozen:
        target = stage / "upload/production-release" / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    for relative, data, _ in private_frozen:
        target = stage / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    (stage / "install.py").write_bytes(installer)
    prepare = HOST_PREPARE.encode("utf-8")
    (stage / "prepare.py").write_bytes(prepare)
    spec = {"release": args.release, "root": "/home/crackersmela.com/public_html",
            "createdUtc": datetime.now(timezone.utc).isoformat(), "deployed": False,
            "installerSha256": digest(installer), "prepareSha256": digest(prepare),
            "files": [entry for _, _, entry in frozen],
            "privateFiles": [entry for _, _, entry in private_frozen],
            "dataMigrationsAutomatic": False}
    (stage / "release.json").write_text(json.dumps(spec, indent=2), encoding="utf-8")
    (stage / "README.txt").write_text(
        "Frozen local candidate only. No connection or deployment has occurred.\n\n"
        "Compare release.json and the before-source snapshot, then authenticate privately:\n"
        f"python audit/deploy-reviewed-release.py --release {args.release} --phase preflight\n\n"
        "Review the successful baseline/preflight reports before the separate install step:\n"
        f"python audit/deploy-reviewed-release.py --release {args.release} --phase install\n\n"
        "The helper creates a new private remote staging directory and stops on any error.\n"
        "Unexpected live hashes require source review, a new explicit baseline and a new release.\n"
        "Only listed source files are installed. Data/configuration/catalog stores are excluded.\n\n"
        "Reviewed SEO operators and field-level plans are in operators/seo, outside the document root.\n"
        "Preflight uploads and checksum-verifies them but never executes a data migration.\n"
        "After installing source, follow operators/seo/HANDOFF.md with the existing private data directory.\n"
        "The product plan refuses changed inventory/source; CMS preparation must be reviewed before apply.\n"
        "These operators save rollback receipts and preserve product IDs, URLs, commerce data and CMS layouts.\n",
        encoding="utf-8")
    print(json.dumps({"staged": str(stage), "files": len(frozen),
                      "privateOperatorFiles": len(private_frozen), "dataMigrationsAutomatic": False,
                      "changedFiles": sum(entry[2]["changedFromBaseline"] for entry in frozen),
                      "deployed": False}, indent=2))


if __name__ == "__main__":
    main()
