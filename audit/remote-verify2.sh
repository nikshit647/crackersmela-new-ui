set -u
echo "=== re-check after full install ==="
for u in /seo-page.php / /sitemap.xml /products-api.php; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 "https://crackersmela.com$u" || echo 000)
  echo "  $code  $u"
done
echo "  (seo-page.php direct hit) body:"
curl -s --max-time 25 "https://crackersmela.com/seo-page.php" | head -c 300; echo

echo "=== storefront head: new assets + real content ==="
curl -s --max-time 30 https://crackersmela.com/ > /tmp/live-home.html
echo "  bytes: $(wc -c < /tmp/live-home.html)"
echo "  editor-seo4 refs: $(grep -c '20261010-editor-seo4' /tmp/live-home.html)"
echo "  old seo3 refs:    $(grep -c '20261010-editor-seo3' /tmp/live-home.html)"
echo "  has h1:           $(grep -c '<h1' /tmp/live-home.html)"
echo "  product cards:    $(grep -o 'prod-card' /tmp/live-home.html | wc -l)"
echo "  brand pill:       $(grep -o 'Standard Fireworks' /tmp/live-home.html | wc -l)"
echo "  title:"; grep -o '<title>[^<]*</title>' /tmp/live-home.html | head -1 | sed 's/^/    /'
echo "  meta description:"; grep -o '<meta name="description" content="[^"]\{0,120\}' /tmp/live-home.html | head -1 | sed 's/^/    /'
echo "  canonical:"; grep -o '<link rel="canonical" href="[^"]*"' /tmp/live-home.html | head -1 | sed 's/^/    /'

echo "=== admin console shell ==="
curl -s --max-time 25 https://admin.crackersmela.com/ > /tmp/live-admin.html
echo "  bytes: $(wc -c < /tmp/live-admin.html)"
echo "  app.js ref: $(grep -o 'js/app.js?v=[^"]*' /tmp/live-admin.html | head -1)"

echo "=== errors logged AFTER install completed (13:45+) ==="
awk '$1" "$2 >= "2026-10-10 13:45:00"' /usr/local/lsws/logs/error.log 2>/dev/null | tail -n 20 || echo "(none)"
echo "=== total PHP fatal count today ==="
grep -c "PHP Fatal" /usr/local/lsws/logs/error.log 2>/dev/null || echo 0