#!/usr/bin/env python3
"""Install the staged release into public_html, with a full rollback backup."""
import json, os, subprocess, sys, time

SRC = r"C:\Users\Nikshit Garje\Documents\ChatGPT\crackersmela final\audit-evidence\product-experience-20261010\source"
WORK = r"C:\Users\NIKSHI~1\AppData\Local\Temp\opencode\release"
RELEASE = "20261010-editor-seo4"
ROOT = "/home/crackersmela.com/public_html"
STAGE = "/tmp/release-" + RELEASE
OWNER = "crack9454:crack9454"

manifest = json.load(open(os.path.join(WORK, RELEASE + ".manifest.json")))
files = list(manifest["files"].keys())
stamp = time.strftime("%Y%m%d-%H%M%S")
BACKUP = "/home/backups/crackersmela-" + stamp

q = lambda s: "'" + s.replace("'", "'\\''") + "'"
file_list = " ".join(q(f) for f in files)

script = f"""
set -eu
ROOT={q(ROOT)}
STAGE={q(STAGE)}
BACKUP={q(BACKUP)}

mkdir -p "$BACKUP"

echo "== backup =="
existing=0; added=0
: > "$BACKUP/rollback-manifest.txt"
for f in {file_list}; do
  if [ -f "$ROOT/$f" ]; then
    mkdir -p "$BACKUP/$(dirname "$f")"
    cp -p "$ROOT/$f" "$BACKUP/$f"
    echo "OVERWRITTEN $f" >> "$BACKUP/rollback-manifest.txt"
    existing=$((existing+1))
  else
    echo "ADDED $f" >> "$BACKUP/rollback-manifest.txt"
    added=$((added+1))
  fi
done
echo "backed up $existing existing file(s); $added new file(s)"
echo "backup dir: $BACKUP"

echo "== install =="
for f in {file_list}; do
  mkdir -p "$ROOT/$(dirname "$f")"
  cp "$STAGE/$f" "$ROOT/.$f.new"
  chmod 644 "$ROOT/.$f.new"
  if [ -f "$ROOT/$f" ]; then
    chown --reference="$ROOT/$f" "$ROOT/.$f.new"
  else
    chown {OWNER} "$ROOT/.$f.new"
  fi
  mv -f "$ROOT/.$f.new" "$ROOT/$f"
done
echo "installed $((existing+added)) file(s)"
"""

res = subprocess.run(["ssh", "-o", "BatchMode=yes", "bluehost-vps", script],
                     capture_output=True, text=True, timeout=900)
print(res.stdout)
if res.returncode != 0:
    print("STDERR:", res.stderr[:3000]); sys.exit(1)

print("BACKUP_PATH", BACKUP)