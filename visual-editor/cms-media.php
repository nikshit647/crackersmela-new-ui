<?php
require_once __DIR__ . '/cm-cms.php';
cmRequirePermission('website.manage', false);

function cmMediaRoots() { return ['images'=>__DIR__ . '/images', 'uploads'=>(string)(getenv('CM_UPLOAD_DIR') ?: __DIR__ . '/uploads')]; }
function cmMediaWithin($path, $root) {
    $path = str_replace('\\', '/', $path); $root = rtrim(str_replace('\\', '/', $root), '/') . '/';
    if (DIRECTORY_SEPARATOR === '\\') { $path = strtolower($path); $root = strtolower($root); }
    return strpos($path, $root) === 0;
}
function cmMediaResolve($url) {
    if (!is_string($url) || strlen($url) > 1500 || strpos($url, '?') !== false || strpos($url, '#') !== false) cmCmsError('Select a valid library image.');
    $decoded = rawurldecode(ltrim($url, '/'));
    if (preg_match('/[\x00-\x1f\x7f<>"\x27\\\\]/', $decoded) || strpos($decoded, '..') !== false) cmCmsError('Select a valid library image.');
    $parts = explode('/', $decoded); $kind = array_shift($parts); $roots = cmMediaRoots();
    if (!isset($roots[$kind]) || !$parts || in_array('', $parts, true) || in_array('.', $parts, true)) cmCmsError('Select a valid library image.');
    $root = realpath($roots[$kind]); $candidate = $roots[$kind] . '/' . implode('/', $parts); $real = realpath($candidate);
    if (!$root || !$real || !cmMediaWithin($real, $root) || !is_file($real) || is_link($candidate)) cmRespond(404, ['ok'=>false,'error'=>'This image is no longer in the media library.']);
    if (!preg_match('/\.(?:jpe?g|png|webp)$/iD', $real)) cmCmsError('Select a JPG, PNG or WebP image.');
    $size = @getimagesize($real);
    if (!$size || !in_array($size[2], [IMAGETYPE_JPEG,IMAGETYPE_PNG,IMAGETYPE_WEBP], true)) cmCmsError('This library file is not a supported image.');
    return ['path'=>$real,'kind'=>$kind,'url'=>'/' . $kind . '/' . implode('/', array_map('rawurlencode', $parts)), 'name'=>basename($real),'width'=>$size[0],'height'=>$size[1],'bytes'=>(int)filesize($real)];
}
function cmMediaUrlPath($value) {
    if (!is_string($value)) return null;
    $value = trim($value);
    if (preg_match('#^https://#i', $value)) {
        $parts = parse_url($value); $host = strtolower((string)($parts['host'] ?? ''));
        $own = explode(':', strtolower((string)($_SERVER['HTTP_HOST'] ?? '')))[0];
        if (!in_array($host, ['crackersmela.com','www.crackersmela.com','admin.crackersmela.com',$own], true)) return null;
        $value = (string)($parts['path'] ?? '');
    }
    if (!preg_match('#^/?(?:images|uploads)/#', $value)) return null;
    return '/' . ltrim(rawurldecode(explode('?', explode('#', $value)[0])[0]), '/');
}
function cmMediaReferences($value, &$references) {
    if (is_array($value)) { foreach ($value as $entry) cmMediaReferences($entry, $references); return; }
    if (is_object($value)) { foreach (get_object_vars($value) as $entry) cmMediaReferences($entry, $references); return; }
    $path = cmMediaUrlPath($value); if ($path !== null) $references[$path] = true;
}
function cmMediaProtection() {
    $references = [];
    foreach (cmProductMap() as $product) cmMediaReferences($product['image'] ?? '', $references);
    // Includes every draft, published document and retained revision, not just the open page.
    $store = cmCmsStore();
    cmMediaReferences($store, $references);
    foreach ($store['pages'] as $page => $record) foreach ($record['revisions'] ?? [] as $revision) cmMediaReferences(cmCmsReadRevision($page, $revision), $references);
    $sources = '';
    $files = array_merge([__DIR__ . '/index.html'], glob(__DIR__ . '/js/*.js') ?: [], glob(__DIR__ . '/css/*.css') ?: []);
    foreach ($files as $file) if (is_file($file) && filesize($file) <= 3000000) $sources .= "\n" . (string)@file_get_contents($file);
    return [$references, $sources];
}
function cmMediaReason($item, $protection) {
    // Bundled images can be reached through generated template paths; only runtime uploads are removable.
    if ($item['kind'] === 'images') return 'Bundled website asset';
    $path = rawurldecode($item['url']);
    if (isset($protection[0][$path])) return 'Used by a product, page or revision';
    if (strpos($protection[1], ltrim($path, '/')) !== false || strpos($protection[1], ltrim($item['url'], '/')) !== false) return 'Used by the website template';
    return '';
}
function cmMediaItem($item, $metadata, $protection) {
    $reason = cmMediaReason($item, $protection);
    return ['url'=>$item['url'],'name'=>$item['name'],'alt'=>(string)($metadata[$item['url']]['alt'] ?? ''),'width'=>$item['width'],'height'=>$item['height'],'bytes'=>$item['bytes'],'canDelete'=>$reason === '', 'protectedReason'=>$reason];
}
$action = is_string($_GET['a'] ?? null) ? $_GET['a'] : 'list';
if ($action === 'list') {
    cmRequireMethod('GET');
    $query = strtolower(cmCmsText($_GET['q'] ?? '', 200, 'Search'));
    $limit = filter_var($_GET['pageSize'] ?? $_GET['limit'] ?? 36, FILTER_VALIDATE_INT);
    $page = filter_var($_GET['page'] ?? 1, FILTER_VALIDATE_INT);
    if ($limit === false || $limit < 1 || $limit > 100 || $page === false || $page < 1 || $page > 10000) cmCmsError('Choose a valid media page.');
    $offset = isset($_GET['offset']) ? filter_var($_GET['offset'], FILTER_VALIDATE_INT) : ($page - 1) * $limit;
    if ($offset === false || $offset < 0 || $offset > 1000000) cmCmsError('Choose a valid media page.');
    $metadata = cmReadJson(cmDataDir() . '/cms-media.json', []); $protection = cmMediaProtection(); $files = []; $count = 0;
    foreach (cmMediaRoots() as $kind => $rootPath) {
        $root = realpath($rootPath); if (!$root || !is_dir($root)) continue;
        $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS));
        $iterator->setMaxDepth(5);
        foreach ($iterator as $file) {
            if (++$count > 20000) break 2;
            if (!$file->isFile() || $file->isLink() || !preg_match('/\.(?:jpe?g|png|webp)$/iD', $file->getFilename())) continue;
            $real = $file->getRealPath(); if (!$real || !cmMediaWithin($real, $root)) continue;
            $relative = str_replace('\\', '/', substr($real, strlen($root) + 1));
            $url = '/' . $kind . '/' . implode('/', array_map('rawurlencode', explode('/', $relative)));
            $alt = (string)($metadata[$url]['alt'] ?? '');
            if ($query !== '' && strpos(strtolower($file->getFilename() . ' ' . $alt), $query) === false) continue;
            $files[] = ['url'=>$url,'sort'=>$file->getMTime()];
        }
    }
    usort($files, function($a, $b) { return $b['sort'] <=> $a['sort'] ?: strcmp($a['url'], $b['url']); });
    $items = [];
    foreach (array_slice($files, $offset, $limit) as $file) $items[] = cmMediaItem(cmMediaResolve($file['url']), $metadata, $protection);
    $total = count($files); $hasMore = $offset + $limit < $total;
    cmRespond(200, ['ok'=>true,'items'=>$items,'total'=>$total,'page'=>(int)floor($offset / $limit) + 1,'pageSize'=>$limit,'offset'=>$offset,'limit'=>$limit,'hasMore'=>$hasMore,'nextOffset'=>$hasMore ? $offset + $limit : null,'truncated'=>$count > 20000]);
}
cmRequireMethod('POST'); cmRequirePermission('website.manage', true);
if (!in_array($action, ['update','delete'], true)) cmRespond(400, ['ok'=>false,'error'=>'This media action is not supported.']);
$request = cmInput(8192); cmCmsObject($request, ['url','alt'], 'Media request');
$item = cmMediaResolve($request['url'] ?? null);
$alt = $action === 'update' ? cmCmsText($request['alt'] ?? '', 2000, 'Alternative text') : '';
cmRateLimit('cms-media-write', 120, 60);
// Order is always commerce -> cms. Keep reference checks and deletion in the same lock scope.
$commerceLock = cmLock('commerce'); $cmsLock = cmLock('cms');
$metadata = cmReadJson(cmDataDir() . '/cms-media.json', []); $protection = cmMediaProtection();
if ($action === 'delete') {
    $reason = cmMediaReason($item, $protection);
    if ($reason !== '') { cmUnlock($cmsLock); cmUnlock($commerceLock); cmRespond(409, ['ok'=>false,'error'=>'This image is protected because it is still used by the website or a saved revision.','code'=>'media_in_use']); }
    if (!@unlink($item['path'])) { cmUnlock($cmsLock); cmUnlock($commerceLock); cmRespond(503, ['ok'=>false,'error'=>'This image could not be removed. Please try again.']); }
    unset($metadata[$item['url']]);
} else $metadata[$item['url']] = ['alt'=>$alt,'updatedAt'=>gmdate('c')];
$saved = cmWriteJson(cmDataDir() . '/cms-media.json', $metadata ?: (object)[]);
cmUnlock($cmsLock); cmUnlock($commerceLock);
if (!$saved) cmRespond(503, ['ok'=>false,'error'=>'Media details could not be saved. Please try again.']);
cmRespond(200, $action === 'delete' ? ['ok'=>true,'url'=>$item['url'],'deleted'=>true] : ['ok'=>true,'item'=>cmMediaItem($item, $metadata, $protection)]);
