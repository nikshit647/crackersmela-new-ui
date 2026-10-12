<?php
require_once __DIR__ . '/cm-cms.php';
$action = is_string($_GET['a'] ?? null) ? $_GET['a'] : 'pages';
if ($action === 'published') {
    cmRequireMethod('GET'); $page = cmCmsPage($_GET['page'] ?? 'home');
    $record = cmCmsRecord(cmCmsStore($page), $page);
    $info = cmCmsPageInfo($page, $record);
    if (in_array($info['status'], ['unpublished','deleted'], true) || ($info['custom'] && $info['status'] !== 'published')) cmRespond(404, ['ok'=>false,'error'=>'This page is not available.','code'=>'page_unavailable']);
    $globals = cmCmsGlobals(true);
    $published = cmCmsOverlayGlobals($record['published'], $globals);
    if ($page === 'home' && is_array($record['categoryOrder'] ?? null)) $published = cmCmsSetCategoryOrder($published, $record['categoryOrder']);
    cmRespond(200, ['ok'=>true,'page'=>$page,'pageInfo'=>$info,'version'=>$record['publishedVersion'] ?? 0,'published'=>cmCmsJsonMaps($published),'publishedAt'=>$record['publishedAt'],'globals'=>$globals]);
}
cmRequirePermission('website.manage', false);
if ($action === 'pages') { cmRequireMethod('GET'); cmRespond(200, ['ok'=>true,'pages'=>cmCmsPages(),'csrfToken'=>cmCsrfToken()]); }
if ($action === 'products') {
    cmRequireMethod('GET'); $products = [];
    foreach (cmProductMap() as $p) if (empty($p['disabled'])) $products[] = ['id'=>(int)$p['id'],'name'=>(string)($p['name'] ?? ''),'shortName'=>(string)($p['shortName'] ?? $p['name'] ?? ''),'image'=>(string)($p['image'] ?? ''),'price'=>(float)($p['price'] ?? 0),'category'=>(string)($p['primary'] ?? ''),'cats'=>array_values($p['cats'] ?? [])];
    $categories = array_map(function($c) { return ['id'=>(string)($c['id'] ?? ''),'name'=>(string)($c['name'] ?? $c['label'] ?? $c['id'] ?? '')]; }, cmBaseData()['categories'] ?? []);
    cmRespond(200, ['ok'=>true,'products'=>$products,'categories'=>$categories]);
}
if ($action === 'load' || $action === 'revisions') {
    cmRequireMethod('GET'); $page = cmCmsPage($_GET['page'] ?? 'home'); $record = cmCmsRecord(cmCmsStore($page), $page);
    if (($record['status'] ?? '') === 'deleted') cmRespond(404, ['ok'=>false,'error'=>'This page has been deleted.']);
    if ($action === 'load') cmRespond(200, cmCmsResponse($page, $record));
    $revisions = array_map(function($r) { return ['id'=>$r['id'],'at'=>$r['at'],'kind'=>$r['kind']]; }, array_reverse($record['revisions']));
    cmRespond(200, ['ok'=>true,'revisions'=>$revisions]);
}
cmRequireMethod('POST'); cmRequirePermission('website.manage', true);
if ($action === 'category-order') {
    $request = cmInput(65536);
    cmCmsObject($request, ['page','expectedVersion','categoryOrder'], 'Category order request');
    if (($request['page'] ?? '') !== 'home') cmCmsError('Category order is shared by the whole website.');
    $expected = cmCmsNumber($request['expectedVersion'] ?? null, 0, 9007199254740990, true);
    cmRateLimit('cms-write', 240, 60);
    $lock = cmLock('cms');
    $order = cmCmsCompleteCategoryOrder($request['categoryOrder'] ?? null);
    $record = cmCmsRecord(cmCmsStore('home'), 'home');
    if ($record['version'] !== $expected) { cmUnlock($lock); cmRespond(409, ['ok'=>false,'error'=>'The categories or Home draft changed in another editor. Reopen Reorder Categories before saving.','code'=>'stale-version','version'=>$record['version']]); }
    $record['categoryOrder'] = $order;
    foreach (['draft','published'] as $kind) $record[$kind] = cmCmsSetCategoryOrder($record[$kind], $order);
    $record['version']++; $now = gmdate('c');
    $record['savedAt'] = $now; $record['publishedAt'] = $now; $record['publishedVersion'] = $record['version'];
    $revision = ['id'=>'r-' . bin2hex(random_bytes(12)), 'at'=>$now, 'kind'=>'category-order'];
    // A never-edited native Home page has no page document to restore. Preserve
    // that fallback instead of recording an invalid null page revision.
    if ($record['draft'] !== null) {
        if (!cmCmsWriteRevision('home', $revision, $record['draft'])) { cmUnlock($lock); cmRespond(503, ['ok'=>false,'error'=>'The category order could not be saved. Please try again.']); }
        $record['revisions'][] = $revision;
    }
    $pruned = array_slice($record['revisions'], 0, max(0, count($record['revisions']) - 30));
    $record['revisions'] = array_slice($record['revisions'], -30);
    $ok = cmCmsWriteRecord('home', $record);
    if ($ok) foreach ($pruned as $old) if (preg_match('/^r-[a-f0-9]{24}$/D', $old['id'] ?? '')) @unlink(cmDataDir() . '/cms-revisions/home/' . $old['id'] . '.json');
    cmUnlock($lock);
    if (!$ok) cmRespond(503, ['ok'=>false,'error'=>'The category order could not be saved. Please try again.']);
    cmRespond(200, cmCmsResponse('home', $record));
}
if (in_array($action, ['page-create','page-update','page-duplicate','page-delete','page-unpublish'], true)) {
    $request = cmInput(2097152);
    $allowed = $action === 'page-create' ? ['name','slug'] : ($action === 'page-duplicate' ? ['page','expectedVersion','name','slug','document'] : ($action === 'page-update' ? ['page','expectedVersion','name'] : ['page','expectedVersion']));
    cmCmsObject($request, $allowed, 'Page request');
    $page = $action === 'page-create' ? null : cmCmsPage($request['page'] ?? null);
    $expected = $page !== null ? cmCmsNumber($request['expectedVersion'] ?? null, 0, 9007199254740990, true) : null;
    $name = in_array($action, ['page-create','page-duplicate','page-update'], true) ? cmCmsPageName($request['name'] ?? '') : null;
    $slug = in_array($action, ['page-create','page-duplicate'], true) ? cmCmsSlug($request['slug'] ?? '') : null;
    cmRateLimit('cms-pages-write', 120, 60);
    $lock = cmLock('cms'); $registry = cmCmsRegistry();
    $record = $page !== null ? cmCmsRecord(cmCmsStore($page), $page) : null;
    if ($record !== null && ($record['status'] ?? '') === 'deleted') { cmUnlock($lock); cmRespond(404, ['ok'=>false,'error'=>'This page has been deleted.']); }
    if ($record !== null && $record['version'] !== $expected) { cmUnlock($lock); cmRespond(409, ['ok'=>false,'error'=>'This page changed in another editor. Reload before continuing.','code'=>'stale-version','version'=>$record['version']]); }
    if ($slug !== null) {
        foreach ($registry['pages'] as $entry) if (($entry['slug'] ?? '') === $slug) { cmUnlock($lock); cmRespond(409, ['ok'=>false,'error'=>'That page URL is already used. Choose another URL.','code'=>'slug_in_use']); }
        if (count($registry['pages']) >= 100) { cmUnlock($lock); cmCmsError('The custom page limit has been reached.'); }
        $id = 'custom-' . bin2hex(random_bytes(16)); $now = gmdate('c');
        $template = 'custom';
        if ($action === 'page-duplicate') {
            $template = $record['meta']['templatePage'] ?? $page;
            $input = $request['document'] ?? ($record['draft'] ?? $record['published']);
            if ($input === null) { cmUnlock($lock); cmRespond(409, ['ok'=>false,'error'=>'Open and save this page once before duplicating it.']); }
            $draft = cmCmsDocument($input, $page, $template);
            $draft['id'] = $id; $draft['templatePage'] = $template;
            // The duplicate gets its own URL; it must not canonicalize to the source page.
            $draft['seo'] = (array)$draft['seo'];
            $draft['seo']['canonical'] = 'https://crackersmela.com/' . $slug;
            $draft['seo']['title'] = $name;
        } else $draft = cmCmsStarter($id, $name);
        $draft = cmCmsWithoutGlobals($draft);
        $new = ['version'=>1,'draft'=>$draft,'published'=>null,'savedAt'=>$now,'publishedAt'=>null,'publishedVersion'=>0,'status'=>'draft','meta'=>['name'=>$name,'slug'=>$slug,'templatePage'=>$template,'createdAt'=>$now],'revisions'=>[]];
        $revision = ['id'=>'r-' . bin2hex(random_bytes(12)),'at'=>$now,'kind'=>$action === 'page-create' ? 'create' : 'duplicate'];
        $new['revisions'][] = $revision;
        if (!cmCmsWriteRevision($id, $revision, $draft) || !cmCmsWriteRecord($id, $new)) { cmUnlock($lock); cmRespond(503, ['ok'=>false,'error'=>'The page could not be created. Please try again.']); }
        $registry['pages'][$id] = ['slug'=>$slug,'createdAt'=>$now];
        $ok = cmWriteJson(cmDataDir() . '/cms-registry.json', $registry); cmUnlock($lock);
        if (!$ok) cmRespond(503, ['ok'=>false,'error'=>'The page could not be registered. Please try again.']);
        cmRespond(201, cmCmsResponse($id, $new));
    }
    $info = cmCmsPageInfo($page, $record);
    if (($action === 'page-delete' && !$info['canDelete']) || ($action === 'page-unpublish' && !$info['canUnpublish'])) { cmUnlock($lock); cmRespond(409, ['ok'=>false,'error'=>'This page is required for the store and cannot be removed.','code'=>'protected_page']); }
    if ($action === 'page-update') { if (!isset($record['meta'])) $record['meta'] = []; $record['meta']['name'] = $name; }
    else $record['status'] = $action === 'page-delete' ? 'deleted' : 'unpublished';
    $record['version']++;
    $ok = cmCmsWriteRecord($page, $record); cmUnlock($lock);
    if (!$ok) cmRespond(503, ['ok'=>false,'error'=>'The page could not be updated. Please try again.']);
    cmRespond(200, cmCmsResponse($page, $record));
}
if (!in_array($action, ['save','publish','restore'], true)) cmRespond(400, ['ok'=>false,'error'=>'This editor action is not supported.']);
$request = cmInput(2097152);
cmCmsObject($request, ['page','expectedVersion','expectedGlobalVersion','expectedHeaderVersion','document','revision'], 'Request');
$page = cmCmsPage($request['page'] ?? null);
$version = cmCmsNumber($request['expectedVersion'] ?? null, 0, 9007199254740990, true);
$headerVersion = array_key_exists('expectedHeaderVersion', $request) ? cmCmsNumber($request['expectedHeaderVersion'], 0, 9007199254740990, true) : null;
$globalVersion = array_key_exists('expectedGlobalVersion', $request) ? cmCmsNumber($request['expectedGlobalVersion'], 0, 9007199254740990, true) : null;
if ($globalVersion !== null && $headerVersion !== null && $globalVersion !== $headerVersion) cmCmsError('The global component versions must agree. Reload the editor.');
// The fixed page metadata determines which native template references are legal.
$current = cmCmsRecord(cmCmsStore($page), $page);
if (($current['status'] ?? '') === 'deleted') cmRespond(404, ['ok'=>false,'error'=>'This page has been deleted.']);
$document = array_key_exists('document', $request) ? cmCmsDocument($request['document'], $page, $current['meta']['templatePage'] ?? $page) : null;
if ($action === 'save' && $document === null) cmCmsError('Choose page content to save.');
if ($action === 'restore') cmCmsId($request['revision'] ?? '', 'Revision');
cmRateLimit('cms-write', 240, 60);
$lock = cmLock('cms'); $store = cmCmsStore($page); $record = cmCmsRecord($store, $page);
if (($record['status'] ?? '') === 'deleted') { cmUnlock($lock); cmRespond(404, ['ok'=>false,'error'=>'This page has been deleted.']); }
if ($record['version'] !== $version) { cmUnlock($lock); cmRespond(409, ['ok'=>false,'error'=>'This page changed in another editor. Reload it before saving.','code'=>'stale-version','version'=>$record['version']]); }
$now = gmdate('c');
if ($action === 'restore') {
    $document = null;
    foreach ($record['revisions'] as $revision) if (hash_equals($revision['id'], $request['revision'])) { $document = cmCmsReadRevision($page, $revision); break; }
    if ($document === null) { cmUnlock($lock); cmRespond(404, ['ok'=>false,'error'=>'This revision is no longer available.']); }
    $document = cmCmsDocument(cmCmsWithoutGlobals($document), $page, $record['meta']['templatePage'] ?? $page);
}
[$sharedGlobals, $globalsChanged] = cmCmsPrepareGlobals($document, $action, $globalVersion, $headerVersion);
if ($document !== null && $page === 'home' && is_array($record['categoryOrder'] ?? null)) $document = cmCmsSetCategoryOrder($document, $record['categoryOrder']);
if ($document !== null) { $record['draft'] = $document; $record['savedAt'] = $now; }
if ($record['draft'] === null) { cmUnlock($lock); cmRespond(409, ['ok'=>false,'error'=>'Save the current website as a draft before publishing.']); }
$record['version']++;
if ($action === 'publish') { $record['published'] = $record['draft']; $record['publishedAt'] = $now; $record['publishedVersion'] = $record['version']; $record['status'] = 'published'; }
foreach (['draft','published'] as $kind) $record[$kind] = cmCmsWithoutGlobals($record[$kind]);
$revision = ['id'=>'r-' . bin2hex(random_bytes(12)), 'at'=>$now, 'kind'=>$action];
if (!cmCmsWriteRevision($page, $revision, $record['draft'])) { cmUnlock($lock); cmRespond(503, ['ok'=>false,'error'=>'Your revision could not be saved. Please try again.']); }
$record['revisions'][] = $revision;
$pruned = array_slice($record['revisions'], 0, max(0, count($record['revisions']) - 30));
$record['revisions'] = array_slice($record['revisions'], -30);
$globalPath = cmDataDir() . '/cms-global-components.json';
$previousGlobals = $globalsChanged && is_file($globalPath) ? @file_get_contents($globalPath) : null;
if ($previousGlobals === false) { cmUnlock($lock); cmRespond(503, ['ok'=>false,'error'=>'Global website content could not be backed up. Please try again.']); }
// Prepare directories before the first shared write: directory failures must
// not terminate through a helper after committing a global change.
cmCmsPrivateDir('cms-pages');
$ok = !$globalsChanged || cmWriteJson($globalPath, cmCmsJsonMaps($sharedGlobals));
if ($ok && !cmCmsWriteRecord($page, $record)) {
    $ok = false;
    // The same CMS lock covers both records and rollback. A failed page save
    // must never leave navigation published despite returning an error.
    if ($globalsChanged) {
        $rolledBack = cmCmsRestoreGlobalBytes($globalPath, $previousGlobals);
        if (!$rolledBack) error_log('CrackersMela: global component rollback failed after a page save error.');
    }
}
// Only unreferenced old revision snapshots are pruned, after the new record commits.
if ($ok) foreach ($pruned as $old) if (preg_match('/^r-[a-f0-9]{24}$/D', $old['id'] ?? '')) @unlink(cmDataDir() . '/cms-revisions/' . $page . '/' . $old['id'] . '.json');
cmUnlock($lock);
if (!$ok) cmRespond(503, ['ok'=>false,'error'=>'Your page could not be saved. Please try again.']);
cmRespond(200, cmCmsResponse($page, $record));
