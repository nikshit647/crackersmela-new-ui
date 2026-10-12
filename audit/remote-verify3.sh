echo "=== PHP errors/warnings with timestamps, last 40 ==="
grep -nE 'PHP (Fatal error|Warning|Parse error|Notice)' /usr/local/lsws/logs/error.log 2>/dev/null | tail -n 40
echo
echo "=== errors AFTER 2026-10-10 13:45:00 (full lines) ==="
grep -E '^2026-10-10 1[3-9]:' /usr/local/lsws/logs/error.log 2>/dev/null \
 | grep -E 'PHP (Fatal|Warning|Parse)' | sed -E 's/^(.{19}).*PHP /\1 PHP /' | sort | uniq -c | sort -rn | head -20
echo
echo "=== cms-page.php around line 94 ==="
sed -n '85,100p' /home/crackersmela.com/public_html/cms-page.php
echo
echo "=== cm-seo.php lines 1-12 ==="
sed -n '1,12p' /home/crackersmela.com/public_html/cm-seo.php
echo
echo "=== do the required files exist now? ==="
for f in cm-seo-settings.php cm-page-content.php cm-page-products.php cm-product-brand.php cm-product-bootstrap.php; do
  if [ -f "/home/crackersmela.com/public_html/$f" ]; then echo "  present  $f"; else echo "  MISSING  $f"; fi
done