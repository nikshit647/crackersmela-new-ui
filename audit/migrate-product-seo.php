<?php
/* CLI only, outside the document root. No network access and no credential output.
 * php audit/migrate-product-seo.php --root=/site/public --data-dir=/site/data
 *   --plan=/private/product-seo-plan.json --backup-dir=/private/seo-backups --apply
 * Omit --apply to validate. Restore with --rollback=/private/seo-backups/<receipt>.json
 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
function seoAbort($message) { fwrite(STDERR, json_encode(['ok'=>false,'error'=>$message], JSON_UNESCAPED_SLASHES) . "\n"); exit(2); }
function seoInside($path, $root) { return strpos(str_replace('\\','/', $path) . '/', rtrim(str_replace('\\','/', $root), '/') . '/') === 0; }
function seoRead($path) {
    $raw = @file_get_contents($path); $data = is_string($raw) ? json_decode($raw, true, 64) : null;
    if (!is_array($data) || json_last_error() !== JSON_ERROR_NONE) seoAbort('Invalid JSON file: ' . basename($path));
    return $data;
}
function seoSame($a, $b) {
    if (is_array($a) && is_array($b)) {
        if (count($a) !== count($b)) return false;
        foreach ($a as $k=>$v) if (!array_key_exists($k, $b) || !seoSame($v, $b[$k])) return false;
        return true;
    }
    if ((is_int($a) || is_float($a)) && (is_int($b) || is_float($b))) return $a == $b;
    return $a === $b;
}
function seoHash($path) { return is_file($path) ? hash_file('sha256', $path) : null; }
function seoWriteRaw($path, $raw) {
    $attributes = is_file($path) ? stat($path) : null;
    $temp = $path . '.' . bin2hex(random_bytes(8)) . '.tmp';
    if (file_put_contents($temp, $raw, LOCK_EX) !== strlen($raw)) seoAbort('Could not prepare atomic write.');
    // Backups are new private files. Existing stores retain the PHP worker's
    // permissions and ownership even when an operator runs this CLI as root.
    $mode = $attributes === null ? 0600 : $attributes['mode'] & 0777;
    if (!@chmod($temp, $mode)) { @unlink($temp); seoAbort('Could not preserve store permissions.'); }
    if ($attributes !== null && PHP_OS_FAMILY !== 'Windows') {
        if (fileowner($temp) !== $attributes['uid'] && !@chown($temp, $attributes['uid'])) { @unlink($temp); seoAbort('Could not preserve store owner.'); }
        if (filegroup($temp) !== $attributes['gid'] && !@chgrp($temp, $attributes['gid'])) { @unlink($temp); seoAbort('Could not preserve store group.'); }
        // chown can clear mode bits; reapply and verify before replacing data.
        if (!@chmod($temp, $mode)) { @unlink($temp); seoAbort('Could not restore store permissions.'); }
        clearstatcache(true, $temp); $prepared = stat($temp);
        if (($prepared['mode'] & 0777) !== $mode || $prepared['uid'] !== $attributes['uid'] || $prepared['gid'] !== $attributes['gid']) { @unlink($temp); seoAbort('Store ownership verification failed.'); }
    }
    if (!rename($temp, $path)) { @unlink($temp); seoAbort('Could not complete atomic write.'); }
}
$options = getopt('', ['root:','data-dir:','plan:','backup-dir:','apply','rollback:']);
$root = realpath($options['root'] ?? ''); $dataDir = realpath($options['data-dir'] ?? '');
if (!$root || !$dataDir || !is_file($root . '/cm-commerce.php') || !isset($options['root'], $options['data-dir'])) seoAbort('Explicit existing --root and --data-dir are required.');
if (seoInside(__FILE__, $root) || seoInside($dataDir, $root)) seoAbort('Migration script and private data must be outside the document root.');
if (isset($options['apply'], $options['rollback'])) seoAbort('Choose apply or rollback.');
putenv('CM_DATA_DIR=' . $dataDir);
require_once $root . '/cm-commerce.php';
$lock = cmLock('commerce');
$statePath = $dataDir . '/products.json'; $catalogPath = $dataDir . '/catalog.json'; $basePath = $root . '/js/products-data.js';
if (!is_file($statePath)) seoAbort('An existing products.json is required.');
$rawBefore = file_get_contents($statePath); $stateHash = hash('sha256', $rawBefore);
$catalogHash = seoHash($catalogPath); $baseHash = seoHash($basePath);
if (isset($options['rollback'])) {
    $receiptPath = realpath($options['rollback']);
    if (!$receiptPath || seoInside($receiptPath, $root)) seoAbort('Rollback receipt must be outside the document root.');
    $receipt = seoRead($receiptPath);
    if (($receipt['version'] ?? null) !== 1 || ($receipt['statePath'] ?? '') !== $statePath || ($receipt['afterHash'] ?? '') !== $stateHash) seoAbort('Rollback refused: state no longer matches the saved migration.');
    $beforePath = dirname($receiptPath) . '/' . basename($receipt['beforeFile'] ?? '');
    if (seoHash($beforePath) !== ($receipt['beforeHash'] ?? null)) seoAbort('Rollback backup checksum mismatch.');
    seoWriteRaw($statePath, file_get_contents($beforePath));
    if (seoHash($statePath) !== $receipt['beforeHash']) seoAbort('Rollback verification failed.');
    cmUnlock($lock); echo json_encode(['ok'=>true,'rolledBack'=>true]) . "\n"; exit;
}
if (!isset($options['plan'])) seoAbort('A reviewed --plan is required.');
$plan = seoRead($options['plan']);
if (($plan['version'] ?? null) !== 1 || !is_array($plan['changes'] ?? null) || !is_array($plan['catalogIds'] ?? null)) seoAbort('Invalid migration plan.');
$state = cmProductState(); $catalog = cmCatalogState(); $products = cmProductMap($state, $catalog);
$ids = array_map('strval', array_keys($products)); sort($ids, SORT_STRING);
$expectedIds = array_map('strval', $plan['catalogIds']); sort($expectedIds, SORT_STRING);
if ($ids !== $expectedIds || count($plan['changes']) !== count($ids)) seoAbort('Inventory changed: regenerate and review the complete plan.');
$allowedFields = ['seoTitle','seoDesc','seoKeywords','seoSlug','seoTags','desc'];
$fields = $plan['fields'] ?? $allowedFields;
if (!is_array($fields) || count($fields) !== count(array_unique($fields)) || array_diff($fields, $allowedFields) || array_diff(['seoTitle','seoDesc','seoKeywords','seoSlug','seoTags'], $fields)) seoAbort('Invalid migration field scope.');
$next = $state; $seen = []; $changedProducts = 0; $changedFields = 0;
foreach ($plan['changes'] as $row) {
    $id = (string)($row['id'] ?? ''); $expected = $row['expectedProduct'] ?? null; $changes = $row['changes'] ?? null;
    if (!isset($products[$id]) || isset($seen[$id]) || !is_array($expected) || !is_array($changes)) seoAbort('Invalid or duplicate plan product.');
    $seen[$id] = true; $current = $products[$id];
    if ((string)($expected['id'] ?? '') !== $id || ($row['slug'] ?? null) !== ($current['slug'] ?? null)) seoAbort('Stable product identity changed: ' . $id);
    foreach ($changes as $field=>$value) if (!in_array($field, $fields, true) || !is_string($value)) seoAbort('Plan includes a forbidden product field: ' . $id);
    $desired = array_replace($expected, $changes);
    if (($desired['slug'] ?? '') !== ($current['slug'] ?? '')) seoAbort('Existing product URL must remain unchanged: ' . $id);
    // Every non-target source field is guarded. A target can be either its
    // reviewed before value or its exact after value for safe repeat runs.
    foreach (array_unique(array_merge(array_keys($expected), array_keys($current))) as $field) {
        $present = array_key_exists($field, $current); $expectedPresent = array_key_exists($field, $expected);
        $matchesBefore = $present === $expectedPresent && (!$present || seoSame($current[$field], $expected[$field]));
        $matchesAfter = in_array($field, $fields, true) && $present && array_key_exists($field, $desired) && seoSame($current[$field], $desired[$field]);
        if (!$matchesBefore && !$matchesAfter) seoAbort('Source conflict for product ' . $id . ', field ' . $field . '. No changes written.');
    }
    $patch = [];
    foreach ($fields as $field) {
        if (!is_string($desired[$field] ?? null) || trim($desired[$field]) === '') seoAbort('Plan leaves an admin SEO field empty for product ' . $id . '.');
        $patch[$field] = $desired[$field];
    }
    $clean = cmCleanProduct($patch, true);
    if (!seoSame($clean, $patch)) seoAbort('Plan values require normalization: ' . $id);
    $override = $next['productOverrides'][$id] ?? []; $count = 0;
    foreach ($patch as $field=>$value) if (!array_key_exists($field, $override) || !seoSame($override[$field], $value)) { $override[$field] = $value; $count++; }
    if ($count) { $next['productOverrides'][$id] = $override; $changedProducts++; $changedFields += $count; }
}
if (count($seen) !== count($ids)) seoAbort('Plan does not cover every product.');
if (!$changedProducts) { cmUnlock($lock); echo json_encode(['ok'=>true,'products'=>count($ids),'changedProducts'=>0,'changedFields'=>0,'idempotent'=>true]) . "\n"; exit; }
$next['rev'] = (int)$state['rev'] + 1;
$afterProducts = cmProductMap($next, $catalog);
foreach ($products as $id=>$product) {
    foreach (array_diff(array_keys($product), $fields) as $field) if (!seoSame($product[$field], $afterProducts[$id][$field] ?? null)) seoAbort('Protected field changed: ' . $field);
}
if (!isset($options['apply'])) { cmUnlock($lock); echo json_encode(['ok'=>true,'dryRun'=>true,'products'=>count($ids),'changedProducts'=>$changedProducts,'changedFields'=>$changedFields]) . "\n"; exit; }
$backupDir = $options['backup-dir'] ?? '';
if ($backupDir === '' || (!is_dir($backupDir) && !mkdir($backupDir, 0700, true))) seoAbort('A private --backup-dir is required for apply.');
$backupDir = realpath($backupDir);
if (!$backupDir || seoInside($backupDir, $root)) seoAbort('Backups must be outside the document root.');
$token = 'seo-' . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(5));
$beforePath = $backupDir . '/' . $token . '.before.json'; $receiptPath = $backupDir . '/' . $token . '.receipt.json';
$afterRaw = json_encode($next, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
if (!is_string($afterRaw)) seoAbort('Could not encode new product state.');
seoWriteRaw($beforePath, $rawBefore);
$receipt = ['version'=>1,'statePath'=>$statePath,'beforeFile'=>basename($beforePath),'beforeHash'=>$stateHash,'afterHash'=>hash('sha256', $afterRaw),'catalogHash'=>$catalogHash,'baseHash'=>$baseHash,'planHash'=>seoHash($options['plan']),'products'=>count($ids),'changedProducts'=>$changedProducts,'changedFields'=>$changedFields,'createdAt'=>gmdate('c')];
seoWriteRaw($receiptPath, json_encode($receipt, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . "\n");
if (seoHash($statePath) !== $stateHash || seoHash($catalogPath) !== $catalogHash || seoHash($basePath) !== $baseHash || seoHash($beforePath) !== $stateHash) seoAbort('Source changed before write. Migration refused.');
seoWriteRaw($statePath, $afterRaw);
if (seoHash($statePath) !== $receipt['afterHash'] || seoHash($catalogPath) !== $catalogHash || seoHash($basePath) !== $baseHash) seoAbort('Post-write verification failed; inspect the private rollback receipt.');
cmUnlock($lock);
echo json_encode(['ok'=>true,'applied'=>true,'products'=>count($ids),'changedProducts'=>$changedProducts,'changedFields'=>$changedFields,'receipt'=>$receiptPath], JSON_UNESCAPED_SLASHES) . "\n";
