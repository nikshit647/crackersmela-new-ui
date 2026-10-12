<?php
/* Public clean pages serve the same storefront, gated by persisted publication state. */
require_once __DIR__ . '/cm-cms.php';
require_once __DIR__ . '/cm-seo.php';
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
if (!in_array($method, ['GET','HEAD'], true)) { header('Allow: GET, HEAD'); cmRespond(405, ['ok'=>false,'error'=>'This method is not supported.']); }
header('Content-Type: text/html; charset=utf-8');
header('Referrer-Policy: same-origin');
function cmCmsPageNotFound($method) {
    http_response_code(404); header('X-Robots-Tag: noindex, nofollow');
    if ($method !== 'HEAD') echo '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found | Crackers Mela</title><body><main><h1>Page not found</h1><p>This page is not available.</p><a href="/">Return to Crackers Mela</a></main></body></html>';
    exit;
}
// A clean page's path is authoritative. Rewrite rules preserve query strings,
// so a visitor-supplied ?slug= must never select a different public page.
$requestPath = (string)parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
$slug = $requestPath === '/cms-page.php' ? ($_GET['slug'] ?? '') : trim(rawurldecode($requestPath), '/');
$id = $requestPath === '/' ? 'home' : cmCmsPageForSlug($slug);
if ($id === null) cmCmsPageNotFound($method);
$record = cmCmsRecord(cmCmsStore($id), $id); $info = cmCmsPageInfo($id, $record);
if (in_array($info['status'], ['unpublished','deleted'], true) || ($info['custom'] && ($info['status'] !== 'published' || $record['published'] === null))) cmCmsPageNotFound($method);
session_write_close();
$html = @file_get_contents(__DIR__ . '/index.html');
if (!is_string($html)) { http_response_code(503); if ($method !== 'HEAD') echo '<!doctype html><title>Temporarily unavailable</title><p>Please try again shortly.</p>'; exit; }
if ($info['custom']) {
    $context = cmCmsContextMeta($info);
    $html = preg_replace_callback('/<head\b[^>]*>/i', function($match) use ($context) { return $match[0] . "\n" . $context; }, $html, 1);
}
$seo = $record['published']['seo'] ?? [];
$baseMeta = cmSeoPageMetadata($id);
if ($info['custom']) $baseMeta = ['title'=>$info['name'] . ' | Crackers Mela','seoDesc'=>'Read ' . $info['name'] . ' at Crackers Mela.','canonical'=>'https://crackersmela.com/' . $info['slug']];
foreach (['title'=>'title','description'=>'seoDesc','canonical'=>'canonical','keywords'=>'keywords'] as $key=>$target) if (!empty($seo[$key]) || ($key === 'keywords' && array_key_exists($key, $seo))) $baseMeta[$target] = $seo[$key];
$seo['robots'] = cmSeoRobots($seo['robots'] ?? '');
if (stripos($seo['robots'], 'noindex') !== false) header('X-Robots-Tag: ' . $seo['robots']);
$html = cmSeoHead($html, $baseMeta, 'website', $seo['ogImage'] ?? '', $seo['robots']);
$escape = function($value) { return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); };
$title = $seo['title'] ?? ($info['custom'] ? $info['name'] . ' | Crackers Mela' : '');
if ($title !== '') $html = preg_replace_callback('#<title\b[^>]*>.*?</title>#is', function() use ($title, $escape) { return '<title>' . $escape($title) . '</title>'; }, $html, 1);
$tags = [];
foreach (['description'=>'description','ogTitle'=>'og:title','ogDescription'=>'og:description','ogImage'=>'og:image','robots'=>'robots'] as $key => $name) if (!empty($seo[$key])) {
    $html = preg_replace('#<meta\b[^>]*(?:name|property)=["\x27]' . preg_quote($name, '#') . '["\x27][^>]*>#i', '', $html);
    $tags[] = '<meta ' . (strpos($name, 'og:') === 0 ? 'property' : 'name') . '="' . $name . '" content="' . $escape($seo[$key]) . '">';
}
$canonical = $seo['canonical'] ?? '';
if ($canonical === '' && $info['custom']) $canonical = 'https://crackersmela.com/' . $info['slug'];
if ($canonical !== '') {
    $html = preg_replace('#<link\b[^>]*rel=["\x27]canonical["\x27][^>]*>#i', '', $html);
    $tags[] = '<link rel="canonical" href="' . $escape($canonical) . '">';
}
// The existing JSON-LD/schema and executable scripts remain unchanged.
if ($tags) $html = preg_replace_callback('/<\/head>/i', function() use ($tags) { return implode("\n", $tags) . "\n</head>"; }, $html, 1);
if ($id === 'home') {
    $categories = cmBaseData()['categories'] ?? [];
    /* CM_CMS_HOME_CATEGORY_ORDER: the global home category order drives this
       crawlable list too; invalid or absent metadata keeps canonical order.
       The document root owns it; a section value is only for older drafts. */
    $categoryOrder = is_array($record['published']['categoryOrder'] ?? null) ? $record['published']['categoryOrder'] : [];
    if (!$categoryOrder) foreach ((array)($record['published']['sections'] ?? []) as $section) {
        if (is_array($section) && ($section['type'] ?? '') === 'native' && ($section['source'] ?? '') === 'home:shop-categories' && isset($section['content']['categoryOrder']) && is_array($section['content']['categoryOrder'])) { $categoryOrder = $section['content']['categoryOrder']; break; }
    }
    if ($categoryOrder) {
        $position = [];
        foreach ($categories as $index => $category) if (is_array($category) && isset($category['id'])) $position[(string)$category['id']] = $index;
        $rank = []; $next = 0;
        foreach ($categoryOrder as $categoryId) if (is_string($categoryId) && isset($position[$categoryId]) && !isset($rank[$categoryId])) $rank[$categoryId] = $next++;
        usort($categories, function ($a, $b) use ($rank, $position) {
            $aId = (string)($a['id'] ?? ''); $bId = (string)($b['id'] ?? '');
            $aRank = $rank[$aId] ?? PHP_INT_MAX; $bRank = $rank[$bId] ?? PHP_INT_MAX;
            return $aRank === $bRank ? (($position[$aId] ?? PHP_INT_MAX) <=> ($position[$bId] ?? PHP_INT_MAX)) : ($aRank <=> $bRank);
        });
    }
    require_once __DIR__ . '/cm-home.php';
    $body = cmHomeInitialHtml($categories);
    $html = preg_replace_callback('#(<main\b[^>]*\bid=["\x27]view["\x27][^>]*>).*?</main>#is', function($m) use ($body) { return $m[1] . $body . '</main>'; }, $html, 1);
}
if ($method !== 'HEAD') echo $html;
