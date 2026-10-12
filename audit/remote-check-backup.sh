set -eu
B=/home/backups/crackersmela-20261010-191326
echo "backup file count (excluding manifest):"
find "$B" -type f -not -name 'rollback-manifest.txt' | wc -l
echo "--- manifest breakdown ---"
awk '{print $1}' "$B/rollback-manifest.txt" | sort | uniq -c
echo "--- originals still intact (index.html / visual-editor.js / cms-runtime.js) ---"
sha256sum "$B/index.html" "$B/js/visual-editor.js" "$B/js/cms-runtime.js"
echo "--- compare vs known pre-deploy live hashes ---"
grep -E 'index.html|js/visual-editor.js|js/cms-runtime.js' "$B/rollback-manifest.txt"