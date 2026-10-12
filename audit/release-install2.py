#!/usr/bin/env python3
"""Install-only pass (backup already taken). Verifies every installed hash."""
import json, os, subprocess, sys

WORK = r"C:\Users\NIKSHI~1\AppData\Local\Temp\opencode\release"
RELEASE = "20261010-editor-seo4"
ROOT = "/home/crackersmela.com/public_html"
STAGE = "/tmp/release-" + RELEASE
OWNER = "crack9454:crack9454"

manifest = json.load(open(os.path.join(WORK, RELEASE + ".manifest.json")))
files = list(manifest["files"].keys())
q = lambda s: "'" + s.replace("'", "'\\''") + "'"
file_list = " ".join(q(f) for f in files)

# Verify block runs on the server and compares against the manifest we ship.
checks = "\n".join(
    f'  [ "$(sha256sum "$ROOT/{f}" | awk \'{{print $1}}\')" = "{manifest["files"][f]}" ] || {{ echo "HASH_MISMATCH {f}"; bad=$((bad+1)); }}'
    for f in files
)

script = f"""
set -eu
ROOT={q(ROOT)}
STAGE={q(STAGE)}
installed=0
for f in {file_list}; do
  dir=$(dirname "$ROOT/$f")
  mkdir -p "$dir"
  tmp="$dir/.$(basename "$f").new"
  cp "$STAGE/$f" "$tmp"
  chmod 644 "$tmp"
  if [ -f "$ROOT/$f" ]; then
    chown --reference="$ROOT/$f" "$tmp"
  else
    chown {OWNER} "$tmp"
  fi
  mv -f "$tmp" "$ROOT/$f"
  installed=$((installed+1))
done
echo "installed $installed file(s)"

echo "== hash verification =="
bad=0
{checks}
if [ $bad -eq 0 ]; then echo "HASH_OK all $installed files match the release manifest"; else echo "HASH_FAILURES=$bad"; exit 1; fi

echo "== php lint on installed tree =="
PHP=/usr/local/lsws/lsphp81/bin/php
lintbad=0
for f in {file_list}; do
  case "$f" in
    *.php) $PHP -l "$ROOT/$f" >/dev/null 2>&1 || {{ echo "LINT_FAIL $f"; lintbad=$((lintbad+1)); }} ;;
  esac
done
[ $lintbad -eq 0 ] && echo "LINT_OK" || {{ echo "LINT_FAILURES=$lintbad"; exit 1; }}

echo "== leftover temp files =="
find "$ROOT" -maxdepth 2 -name '.*.new' -print | head
echo "== ownership spot check =="
ls -l "$ROOT/index.html" "$ROOT/js/cms-runtime.js" "$ROOT/seo-api.php" "$ROOT/images/brands/standard-fireworks.png"
"""

payload = script.replace("\r\n", "\n").encode("utf-8")
res = subprocess.run(["ssh", "-o", "BatchMode=yes", "bluehost-vps", "bash -s"],
                     input=payload, capture_output=True, timeout=900)
out = res.stdout.decode("utf-8", "replace")
err = res.stderr.decode("utf-8", "replace")
print(out)
if res.returncode != 0:
    print("STDERR:", err[:3000]); sys.exit(1)