#!/usr/bin/env python3
"""Stage the release on the VPS: build tar, upload, verify hashes, PHP 8.1 lint.
Nothing is installed into public_html by this script."""
import hashlib, io, json, os, subprocess, sys, tarfile, time

SRC = r"C:\Users\Nikshit Garje\Documents\ChatGPT\crackersmela final\audit-evidence\product-experience-20261010\source"
WORK = r"C:\Users\NIKSHI~1\AppData\Local\Temp\opencode\release"
RELEASE = "20261010-editor-seo4"

DEPLOY = [
    # changed on live
    "cm-cms.php", "cm-commerce.php", "cm-home.php", "cm-seo.php", "cms-api.php",
    "cms-media.php", "cms-page.php", "css/cms-content.css", "css/visual-editor.css",
    "editor-shell.html", "index.html", "js/app.js", "js/cms-preview.js", "js/cms-runtime.js",
    "js/seo-runtime.js", "js/visual-editor.js", "products-api.php", "seo-page.php",
    "sitemap.php", "upload-api.php", "visual-preview.php",
    # new on live
    "cm-page-content.php", "cm-page-products.php", "cm-product-bootstrap.php",
    "cm-product-brand.php", "cm-seo-settings.php", "css/product-brand.css",
    "css/product-gallery.css", "css/product-media.css", "images/brands/README.md",
    "images/brands/standard-fireworks-official.png", "images/brands/standard-fireworks.png",
    "js/cms-element-actions.js", "js/cms-element-clipboard.js", "js/editor-seo.js",
    "js/editor-upload.js", "js/page-content.js", "js/product-brand.js",
    "js/product-gallery.js", "js/product-media.js", "js/seo-assistant.js",
    "js/seo-manager.js", "seo-api.php", "seo-page-defaults.json",
]

def sha_bytes(b):
    return hashlib.sha256(b).hexdigest()

os.makedirs(WORK, exist_ok=True)
tar_path = os.path.join(WORK, RELEASE + ".tar.gz")
manifest = {}

buf = io.BytesIO()
with tarfile.open(fileobj=buf, mode="w:gz") as tar:
    for rel in DEPLOY:
        src = os.path.join(SRC, rel.replace("/", os.sep))
        if not os.path.isfile(src):
            sys.exit("missing source file: " + rel)
        data = open(src, "rb").read()
        manifest[rel] = sha_bytes(data)
        info = tarfile.TarInfo(rel)
        info.size = len(data)
        info.mtime = int(time.time())
        info.mode = 0o644
        tar.addfile(info, io.BytesIO(data))

tar_sha = sha_bytes(buf.getvalue())
open(tar_path, "wb").write(buf.getvalue())
json.dump({"release": RELEASE, "tarSha256": tar_sha, "files": manifest},
          open(os.path.join(WORK, RELEASE + ".manifest.json"), "w"), indent=2)
print("built", tar_path, os.path.getsize(tar_path), "bytes")
print("tarSha256", tar_sha)
print("files", len(DEPLOY))

remote_dir = "/tmp/release-" + RELEASE
remote_tar = remote_dir + ".tar.gz"
ssh = ["ssh", "-o", "BatchMode=yes", "bluehost-vps"]

subprocess.run(ssh + ["rm -rf " + remote_dir + " " + remote_tar], check=True)
subprocess.run(["scp", "-o", "BatchMode=yes", tar_path, "bluehost-vps:" + remote_tar], check=True)
print("uploaded", remote_tar)

script = f"""
set -e
mkdir -p {remote_dir}
tar -xzf {remote_tar} -C {remote_dir}
echo "SHA_TAR $(sha256sum {remote_tar} | awk '{{print $1}}')"
echo "--- php lint (live php81) ---"
PHP=/usr/local/lsws/lsphp81/bin/php
$PHP -v | head -1
fail=0
for f in $(find {remote_dir} -name '*.php'); do
  out=$($PHP -l "$f" 2>&1) || {{ echo "LINT_FAIL $f: $out"; fail=1; }}
done
[ $fail -eq 0 ] && echo "LINT_OK all php files"
echo "--- file count ---"
find {remote_dir} -type f | wc -l
"""
res = subprocess.run(ssh + [script], capture_output=True, text=True, timeout=600)
print(res.stdout)
if res.returncode != 0:
    print("STDERR", res.stderr[:3000]); sys.exit(1)

if f"SHA_TAR {tar_sha}" not in res.stdout:
    sys.exit("uploaded tar hash mismatch")
print("PREFLIGHT OK")