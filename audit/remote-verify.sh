set -u
check() {
  url="$1"; expect="$2"
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 "$url" || echo 000)
  size=$(curl -s --max-time 25 "$url" | wc -c)
  if [ "$code" = "$expect" ]; then echo "OK   $code  $url (${size}b)"; else echo "FAIL $code (want $expect)  $url"; fi
}
echo "=== storefront / admin surfaces ==="
check https://crackersmela.com/ 200
check https://crackersmela.com/index.html 200
check https://admin.crackersmela.com/ 200
check https://crackersmela.com/visual-editor 200
check https://crackersmela.com/visual-preview.php 200

echo "=== new release assets served with new cache-bust ==="
check https://crackersmela.com/js/cms-runtime.js?v=20261010-editor-seo4 200
check https://crackersmela.com/js/product-media.js?v=20261010-editor-seo4 200
check https://crackersmela.com/js/product-gallery.js?v=20261010-editor-seo4 200
check https://crackersmela.com/js/product-brand.js?v=20261010-editor-seo4 200
check https://crackersmela.com/js/page-content.js?v=20261010-editor-seo4 200
check https://crackersmela.com/js/seo-manager.js?v=20261010-editor-seo4 200
check https://crackersmela.com/css/product-media.css?v=20261010-editor-seo4 200
check https://crackersmela.com/images/brands/standard-fireworks.png 200

echo "=== JSON endpoints (unauthenticated must be clean, not 500) ==="
for p in /cms-api.php /seo-api.php /cms-media.php /products-api.php /upload-api.php /sitemap.php /seo-page.php; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 "https://crackersmela.com$p" || echo 000)
  echo "  $code  $p"
done

echo "=== my fix is on the server ==="
grep -c 'data-cms-inline\]{display:none' /home/crackersmela.com/public_html/js/cms-runtime.js || true
grep -o "panelOwnsInspector" /home/crackersmela.com/public_html/js/visual-editor.js | head -1 || true

echo "=== maintenance flag ==="
cat /home/crackersmela.com/public_html/maintenance.json; echo

echo "=== server error log tail ==="
tail -n 15 /usr/local/lsws/logs/error.log 2>/dev/null || echo "(no error.log)"