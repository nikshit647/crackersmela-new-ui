<?php
require_once __DIR__ . '/cm-cms.php';
cmRequireMethod('GET'); cmRequirePermission('website.manage', false);
$page = cmCmsPage($_GET['page'] ?? 'home');
$record = cmCmsRecord(cmCmsStore($page), $page); $info = cmCmsPageInfo($page, $record);
if ($info['status'] === 'deleted') cmRespond(404, ['ok'=>false,'error'=>'This page has been deleted.']);
header('Content-Type: text/html; charset=utf-8');
header("Content-Security-Policy: frame-ancestors 'self'; object-src 'none'; base-uri 'self'");
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: same-origin');
header('X-Robots-Tag: noindex, nofollow, noarchive');
session_write_close();
$html = @file_get_contents(__DIR__ . '/index.html');
if (!is_string($html)) { http_response_code(503); echo '<!doctype html><html lang="en"><title>Preview unavailable</title><p>The website preview is temporarily unavailable.</p></html>'; exit; }
if ($info['custom']) $html = preg_replace_callback('/<head\b[^>]*>/i', function($match) use ($info) { return $match[0] . "\n" . cmCmsContextMeta($info); }, $html, 1);
// External synchronous bootstrap executes before the unmodified storefront bundle.
$bootstrap = '<script src="/js/cms-preview.js?v=20261008-globals1"></script>';
$matched = 0;
$html = preg_replace_callback('#<script\b[^>]*\bsrc=["\x27](?:/)?js/app\.js(?:\?[^"\x27]*)?["\x27][^>]*>\s*</script>#i', function($match) use ($bootstrap) { return $bootstrap . "\n" . $match[0]; }, $html, 1, $matched);
if ($matched !== 1) { http_response_code(503); echo '<!doctype html><html lang="en"><title>Preview unavailable</title><p>The website preview could not be initialized.</p></html>'; exit; }
echo $html;
