echo "=== PHP errors strictly AFTER install completed (2026-10-10 13:45:00) ==="
n=$(grep -E '^2026-10-10 1[4-9]:|^2026-10-10 2[0-3]:' /usr/local/lsws/logs/error.log 2>/dev/null | grep -cE 'PHP (Fatal|Warning|Parse)' || true)
echo "count = $n"
grep -E '^2026-10-10 1[4-9]:|^2026-10-10 2[0-3]:' /usr/local/lsws/logs/error.log 2>/dev/null | grep -E 'PHP (Fatal|Warning|Parse)' | head -10 || echo "(none)"

echo
echo "=== last cmHomeHeroCopy error timestamp (pre-existing bug, now covered by this release) ==="
grep 'cmHomeHeroCopy' /usr/local/lsws/logs/error.log 2>/dev/null | tail -1 | cut -c1-19

echo
echo "=== is cmHomeHeroCopy defined in the deployed cm-home.php? ==="
grep -n 'function cmHomeHeroCopy' /home/crackersmela.com/public_html/cm-home.php || echo "NOT DEFINED"
grep -n 'cmHomeHeroCopy' /home/crackersmela.com/public_html/cms-page.php | head -3

echo
echo "=== 5 consecutive storefront fetches ==="
for i in 1 2 3 4 5; do
  code=$(curl -s -o /tmp/h$i.html -w '%{http_code}' --max-time 30 https://crackersmela.com/ || echo 000)
  echo "  fetch $i -> $code  bytes=$(wc -c < /tmp/h$i.html)  h1=$(grep -c '<h1' /tmp/h$i.html)  cards=$(grep -o 'prod-card' /tmp/h$i.html | wc -l)"
done

echo
echo "=== key storefront routes ==="
for u in / /about /contact /faq /returns /safety /terms /privacy /products /sitemap.xml /robots.txt; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 "https://crackersmela.com$u" || echo 000)
  echo "  $code  $u"
done

echo
echo "=== seeded sitemap URL count ==="
curl -s --max-time 25 https://crackersmela.com/sitemap.xml | grep -o '<loc>' | wc -l