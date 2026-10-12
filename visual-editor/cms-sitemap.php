<?php
require_once __DIR__ . '/cm-cms.php';
require_once __DIR__ . '/cm-seo.php';
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
if (!in_array($method, ['GET','HEAD'], true)) { header('Allow: GET, HEAD'); cmRespond(405, ['ok'=>false,'error'=>'This method is not supported.']); }
header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: no-cache, must-revalidate');
if (strpos(cmSeoRobots(), 'noindex') !== false) { header('X-Robots-Tag: noindex, nofollow, noarchive'); if ($method !== 'HEAD') echo '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>'; exit; }
if ($method === 'HEAD') exit;
echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
foreach (cmCmsRegistry()['pages'] as $id => $meta) {
    $record = cmCmsRecord(cmCmsStore($id), $id);
    if (($record['status'] ?? '') !== 'published' || $record['published'] === null) continue;
    $url = 'https://crackersmela.com/' . $meta['slug'];
    if (!cmSeoCmsIndexable($record, $url)) continue;
    echo '<url><loc>' . htmlspecialchars($url, ENT_XML1 | ENT_QUOTES, 'UTF-8') . '</loc>';
    if (!empty($record['publishedAt'])) echo '<lastmod>' . htmlspecialchars($record['publishedAt'], ENT_XML1 | ENT_QUOTES, 'UTF-8') . '</lastmod>';
    echo '</url>';
}
echo '</urlset>';
