<?php
/* Public clean pages serve the same storefront, gated by persisted publication state. */
require_once __DIR__ . '/cm-cms.php';
require_once __DIR__ . '/cm-seo.php';
require_once __DIR__ . '/cm-product-bootstrap.php';
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
$id = in_array($requestPath, ['/', '/index.html'], true) ? 'home' : cmCmsPageForSlug($slug);
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
$baseMeta = cmSeoPageMetadata($id);
$robots = cmSeoRobots($baseMeta['robots'] ?? '');
if (stripos($robots, 'noindex') !== false) header('X-Robots-Tag: ' . $robots);
$html = cmSeoHead($html, $baseMeta, 'website', $baseMeta['ogImage'] ?? '', $robots);
$schemas = cmSeoJsonLd(cmSeoPageSchema($id, $baseMeta, $record), 'cm-dynamic-schema');
if ($id !== 'home') $schemas .= cmSeoJsonLd(cmSeoPageBreadcrumbs($baseMeta, $info['name']), 'cm-seo-breadcrumbs');
$html = cmSeoSchemas($html, $schemas);
if ($id !== 'home' && is_file(__DIR__ . '/cm-page-content.php')) {
    require_once __DIR__ . '/cm-page-content.php';
    $body = cmSeoRenderPublishedPage($id, $record, $info);
    if ($body !== null) $html = preg_replace_callback('#(<main\b[^>]*\bid=["\x27]view["\x27][^>]*>).*?</main>#is', function($match) use ($body) { return $match[1] . $body . '</main>'; }, $html, 1);
}
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
    // The published hero section drives the first-paint headline so the server
    // render and the CMS pass cannot disagree.
    $heroSection = null;
    foreach (($record['published']['sections'] ?? array()) as $section) {
        if (is_array($section) && ($section['id'] ?? '') === 'home:hero') { $heroSection = $section; break; }
    }
    $body = cmHomeInitialHtml($categories, $heroSection);
    $html = preg_replace_callback('#(<main\b[^>]*\bid=["\x27]view["\x27][^>]*>).*?</main>#is', function($m) use ($body) { return $m[1] . $body . '</main>'; }, $html, 1);
}
/* The site-wide maintenance flag is a backend settings key that only the
   products pull normally reveals. Hand it to the first client render so the
   SPA can paint immediately without ever showing the storefront while
   maintenance is on. Delivered as a meta tag because the page ships a strict
   script-src CSP that blocks inline scripts. */
$maint = !empty((cmBaseData()['settings']['maintenance'] ?? null));
$flag = '<meta name="cm-remote-maint" content="' . ($maint ? '1' : '0') . '">';
$html = preg_replace('#</head>#i', $flag . '</head>', $html, 1);

/* Same reason for the hero copy: views.home must render the CMS headline, not a
   hardcoded one, or the SPA would briefly show stale hero text after first
   paint even though the server got it right. */
if ($id === 'home') {
    $heroCopy = cmHomeHeroCopy($heroSection);
    $meta = function ($name, $value) {
        return '<meta name="' . $name . '" content="' . htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8') . '">';
    };
    $heroFlags = $meta('cm-hero-eyebrow', $heroCopy['eyebrow'])
        . $meta('cm-hero-h1', json_encode($heroCopy['lines'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES))
        . $meta('cm-hero-lede', $heroCopy['lede']);
    $html = preg_replace('#</head>#i', $heroFlags . '</head>', $html, 1);
}
// Share the exact published revision with first paint and the synchronous client pass.
require_once __DIR__ . '/cm-cms-render.php';
$cmsGlobals = cmCmsGlobals(true);
$cmsPublished = cmCmsOverlayGlobals($record['published'], $cmsGlobals);
if (is_array($cmsPublished) && is_array($cmsGlobals['categoryOrder'] ?? null)) $cmsPublished['categoryOrder'] = $cmsGlobals['categoryOrder'];
$html = cmCmsRenderInitial($html, $id, $id === 'home' ? $cmsPublished : null, $cmsGlobals);
$html = cmCmsRenderBootstrap($html, $id, cmCmsJsonMaps($cmsPublished), $cmsGlobals, $record['version'] ?? 0);
$html = cmProductBootstrapInject($html);
$html = cmSeoSettingsInject($html);
if ($method !== 'HEAD') echo $html;
