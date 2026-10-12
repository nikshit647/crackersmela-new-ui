set -eu
B=/home/backups/crackersmela-20261010-131326
B=/home/backups/crackersmela-20261010-191326
echo "=== backup still intact ==="
find "$B" -type f -not -name 'rollback-manifest.txt' | wc -l
echo "=== rollback manifest summary ==="
awk '{print $1}' "$B/rollback-manifest.txt" | sort | uniq -c
echo
echo "=== removing release staging from /tmp (backup is kept for rollback) ==="
rm -rf /tmp/release-20261010-editor-seo4 /tmp/release-20261010-editor-seo4.tar.gz
ls -d /tmp/release-* 2>/dev/null || echo "  staging removed"
echo
echo "=== final deployed state ==="
cd /home/crackersmela.com/public_html
echo "  release assets present: $(grep -c '20261010-editor-seo4' index.html)"
echo "  delete-fix rule count: $(grep -c 'data-cms-inline\]{display:none' js/cms-runtime.js)"
echo "  mobile inspector fix:  $(grep -c 'panelOwnsInspector' js/visual-editor.js)"
echo "  maintenance:           $(cat maintenance.json)"