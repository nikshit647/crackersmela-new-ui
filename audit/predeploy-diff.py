#!/usr/bin/env python3
"""Read-only pre-deploy diff: authoritative source vs live production tree."""
import hashlib, json, os, subprocess, sys

SRC = r"C:\Users\Nikshit Garje\Documents\ChatGPT\crackersmela final\audit-evidence\product-experience-20261010\source"
ROOT = "/home/crackersmela.com/public_html"

def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

files = []
for base, _dirs, names in os.walk(SRC):
    for n in names:
        full = os.path.join(base, n)
        files.append(os.path.relpath(full, SRC).replace("\\", "/"))
files.sort()

local = {rel: sha(os.path.join(SRC, rel)) for rel in files}

# Ask the server for hashes of exactly these paths (plus a not-found marker).
quoted = " ".join("'" + rel.replace("'", "'\\''") + "'" for rel in files)
script = f"""
cd {ROOT} || exit 1
for f in {quoted}; do
  if [ -f "$f" ]; then sha256sum "$f" | awk '{{print $1" "$2}}'; else echo "MISSING $f"; fi
done
"""
res = subprocess.run(
    ["ssh", "-o", "BatchMode=yes", "bluehost-vps", script],
    capture_output=True, text=True, timeout=300,
)
if res.returncode != 0:
    print("SSH FAILED", res.returncode, res.stderr[:2000]); sys.exit(1)

live = {}
for line in res.stdout.splitlines():
    line = line.strip()
    if not line:
        continue
    if line.startswith("MISSING "):
        live[line[8:]] = None
    else:
        digest, path = line.split(" ", 1)
        live[path] = digest

changed, missing, same = [], [], []
for rel in files:
    lv = live.get(rel, "__ABSENT__")
    if lv == "__ABSENT__" or lv is None:
        missing.append(rel)
    elif lv != local[rel]:
        changed.append(rel)
    else:
        same.append(rel)

print(json.dumps({
    "total_source_files": len(files),
    "identical": len(same),
    "differ": changed,
    "not_on_live": missing,
}, indent=2))