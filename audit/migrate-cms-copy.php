<?php
/* CLI only: scoped text migration with a reviewed plan, private backup and CAS. */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
function cmsCopyText($text) {
    $text = str_replace([
        'Your one-stop shop for premium, STANDARD-certified crackers. Factory-direct from Sivakasi — celebrate every moment with joy and brightness.',
        'Your one-stop shop for premium, PESO-certified crackers. Factory-direct from Sivakasi — celebrate every moment with joy and brightness.'
    ], 'Crackers Mela — STANDARD Licensed dealer. Explore crackers and fireworks for Hyderabad and Secunderabad.', $text);
    $text = str_replace(['PESO-certified', 'STANDARD-certified', 'STANDARD certified product', 'PESO Certified'], 'STANDARD Licensed dealer', $text);
    $text = str_replace(['STANDARD Licensed dealer, safety-tested stock only', '100% licensed, safety-certified crackers from Sivakasi'], 'STANDARD Licensed dealer', $text);
    if (str_starts_with($text, 'Light Up Every Celebration with Premium-Quality Crackers!') && stripos($text, 'Hyderabad') === false) $text .= "\n\nServing Hyderabad and Secunderabad.";
    return $text;
}
function cmsCopyDocument($document, &$changes, $path) {
    if (!is_object($document)) return $document;
    $replace = function (&$value, $where) use (&$changes) {
        if (!is_string($value)) return;
        $next = cmsCopyText($value);
        if ($next !== $value) { $changes[] = ['path'=>$where,'before'=>$value,'after'=>$next]; $value = $next; }
    };
    foreach (['title','description','ogTitle','ogDescription'] as $field) if (isset($document->seo->$field)) $replace($document->seo->$field, $path . '/seo/' . $field);
    if (($document->id ?? '') === 'home' && isset($document->seo)) foreach (['title','ogTitle'] as $field) {
        if (($document->seo->$field ?? '') === 'CrackersMela | Premium Crackers & Fireworks in Hyderabad') {
            $changes[]=['path'=>$path.'/seo/'.$field,'before'=>$document->seo->$field,'after'=>'Crackers & Fireworks in Hyderabad | Crackers Mela'];
            $document->seo->$field='Crackers & Fireworks in Hyderabad | Crackers Mela';
        }
    }
    // Content supports promo message arrays; URLs, IDs, names and design values
    // are never text targets, including text-looking CSS values.
    $content = function (&$value, $where, $key = '') use (&$content, $replace) {
        if (is_string($value) && in_array($key, ['text','heading','title','description','body','label','message','subtitle'], true)) $replace($value, $where);
        elseif (is_array($value) || is_object($value)) foreach ($value as $k=>&$child) $content($child, $where . '/' . $k, (string)$k);
    };
    foreach (($document->sections ?? []) as $i=>$section) {
        if (!is_object($section)) continue;
        if (isset($section->content)) $content($section->content, $path . '/sections/' . $i . '/content');
        foreach (($section->elements ?? (object)[]) as $id=>$element) if (is_object($element)) {
            if (isset($element->text)) $replace($element->text, $path . '/sections/' . $i . '/elements/' . $id . '/text');
            if (isset($element->alt)) $replace($element->alt, $path . '/sections/' . $i . '/elements/' . $id . '/alt');
        }
    }
    return $document;
}
function cmsSeoDocument($document, $pages, &$changes, $path) {
    if (!is_object($document) || !isset($pages[$document->id ?? ''])) return $document;
    if (!isset($document->seo)) $document->seo = (object)[];
    if (!is_object($document->seo)) throw new RuntimeException('Existing SEO metadata is invalid');
    foreach ($pages[$document->id] as $field=>$value) {
        $before = $document->seo->$field ?? null;
        if ($before !== $value) {
            $changes[] = ['path'=>$path . '/seo/' . $field,'before'=>$before,'after'=>$value];
            $document->seo->$field = $value;
        }
    }
    return $document;
}
function cmsCopyRecord($record, &$changes, $path, $now, $seoPages = null) {
    if (!is_object($record)) throw new RuntimeException('Invalid CMS record');
    $count = count($changes); $publishedChanged = false;
    foreach (['draft','published'] as $key) {
        $before = count($changes);
        if (isset($record->$key)) $record->$key = $seoPages === null ? cmsCopyDocument($record->$key, $changes, $path . '/' . $key) : cmsSeoDocument($record->$key, $seoPages, $changes, $path . '/' . $key);
        if ($key === 'published') $publishedChanged = count($changes) > $before;
    }
    if (count($changes) !== $count) {
        $record->version = (int)($record->version ?? 0) + 1;
        $record->savedAt = $now;
        if ($publishedChanged) { $record->publishedVersion = $record->version; $record->publishedAt = $now; }
    }
    return $record;
}
function cmsCopyJson($value) { return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR); }
function cmsCopyWrite($path, $raw, $mode = 0600) {
    $tmp = $path . '.' . bin2hex(random_bytes(6)) . '.tmp';
    if (file_put_contents($tmp, $raw) !== strlen($raw)) throw new RuntimeException('Cannot write migration artifact');
    if (!chmod($tmp, $mode)) { @unlink($tmp); throw new RuntimeException('Cannot preserve file permissions'); }
    if (is_file($path) && function_exists('chown')) {
        if (fileowner($tmp) !== fileowner($path) && !chown($tmp, fileowner($path))) { @unlink($tmp); throw new RuntimeException('Cannot preserve file owner'); }
        if (filegroup($tmp) !== filegroup($path) && !chgrp($tmp, filegroup($path))) { @unlink($tmp); throw new RuntimeException('Cannot preserve file group'); }
    }
    if (!rename($tmp, $path)) { @unlink($tmp); throw new RuntimeException('Cannot replace migration target'); }
}
function cmsCopyTarget($data, $relative) {
    if (!preg_match('~^(?:cms-pages/[a-z0-9-]+\.json|cms-pages\.json)$~D', $relative)) throw new RuntimeException('Unexpected migration path');
    $target = realpath($data . '/' . $relative);
    if ($target === false || !str_starts_with($target, $data . DIRECTORY_SEPARATOR)) throw new RuntimeException('CMS target escaped data directory');
    return $target;
}
function cmsCopyMain($args) {
    [$script,$mode,$root,$work] = array_pad($args, 4, null);
    if (!in_array($mode,['prepare','prepare-seo','apply','rollback'],true) || !$root || !$work) throw new RuntimeException('Usage: php migrate-cms-copy.php prepare|prepare-seo|apply|rollback APPLICATION_ROOT PRIVATE_WORK_DIR [REVIEWED_SEO_PLAN]');
    $root = realpath($root); if (!$root || !is_file($root . '/cm-security.php')) throw new RuntimeException('Application root is invalid');
    require_once $root . '/cm-security.php';
    $seoPages = null;
    if ($mode === 'prepare-seo') {
        require_once $root . '/cm-cms.php';
        $seoPlan = json_decode(file_get_contents($args[4] ?? ''), true, 64, JSON_THROW_ON_ERROR);
        if (($seoPlan['version'] ?? null) !== 1 || !is_array($seoPlan['pages'] ?? null)) throw new RuntimeException('Invalid reviewed website SEO plan');
        $seoPages = [];
        foreach ($seoPlan['pages'] as $page=>$seo) {
            if (!in_array($page, ['home','products','wholesale'], true) || !is_array($seo) || array_diff(array_keys($seo), ['title','description','keywords','ogTitle','ogDescription'])) throw new RuntimeException('Unsupported website SEO field');
            if (count($seo) !== 5 || array_filter($seo, fn($value)=>!is_string($value) || trim($value) === '')) throw new RuntimeException('Website SEO fields must be filled');
            $seoPages[$page] = (array)cmCmsSeo($seo);
        }
    }
    $data = realpath(cmDataDir());
    if (!is_dir($work) && !mkdir($work,0700,true)) throw new RuntimeException('Cannot create private work directory');
    $work = realpath($work);
    if ($work === $root || str_starts_with($work,$root.DIRECTORY_SEPARATOR) || $work === $data || str_starts_with($work,$data.DIRECTORY_SEPARATOR)) throw new RuntimeException('Work directory must be outside public and application data directories');
    @chmod($work,0700);
    $lock = cmLock('cms');
    try {
        $planFile=$work.'/cms-copy-plan.json'; $receiptFile=$work.'/cms-copy-receipt.json';
        if ($mode === 'prepare' || $mode === 'prepare-seo') {
            $paths = glob($data . '/cms-pages/*.json') ?: [];
            if (is_file($data . '/cms-pages.json')) $paths[]=$data . '/cms-pages.json';
            $files=[]; $preview=[]; $now=gmdate('c');
            foreach ($paths as $path) {
                $relative=str_replace('\\','/',substr($path,strlen($data)+1));
                $path=cmsCopyTarget($data,$relative); $raw=file_get_contents($path);
                $value=json_decode($raw,false,128,JSON_THROW_ON_ERROR); $changes=[];
                if ($relative==='cms-pages.json') {
                    foreach (($value->pages ?? (object)[]) as $id=>$record) $value->pages->$id=cmsCopyRecord($record,$changes,'pages/'.$id,$now,$seoPages);
                } else $value=cmsCopyRecord($value,$changes,basename($relative,'.json'),$now,$seoPages);
                if (!$changes) continue;
                $after=cmsCopyJson($value);
                $files[]=['path'=>$relative,'beforeSha256'=>hash('sha256',$raw),'afterSha256'=>hash('sha256',$after),'afterBase64'=>base64_encode($after),'mode'=>fileperms($path)&0777];
                $preview[]=['file'=>$relative,'changes'=>$changes];
            }
            cmsCopyWrite($planFile,cmsCopyJson(['version'=>1,'root'=>$root,'dataDir'=>$data,'files'=>$files]));
            cmsCopyWrite($work.'/cms-copy-preview.json',cmsCopyJson($preview));
            return ['status'=>'PREPARED','files'=>count($files),'textFields'=>array_sum(array_map(fn($p)=>count($p['changes']),$preview))];
        }
        $plan=json_decode(file_get_contents($planFile),true,128,JSON_THROW_ON_ERROR);
        if ($plan['root']!==$root || $plan['dataDir']!==$data) throw new RuntimeException('Migration root mismatch');
        if ($mode==='rollback') {
            $receipt=json_decode(file_get_contents($receiptFile),true,128,JSON_THROW_ON_ERROR);
            $restore=[];
            // A stopped apply/rollback legitimately leaves a mix of exact before
            // and after states. Validate every backup and target before any write.
            foreach ($receipt['files'] as $f) {
                $before=base64_decode($f['beforeBase64'],true);
                if (!is_string($before) || hash('sha256',$before)!==$f['beforeSha256']) throw new RuntimeException('Backup checksum mismatch');
                $target=cmsCopyTarget($data,$f['path']); $current=hash_file('sha256',$target);
                if ($current!==$f['beforeSha256'] && $current!==$f['afterSha256']) throw new RuntimeException('Later CMS edits prevent rollback: '.$f['path']);
                if ($current===$f['afterSha256']) $restore[]=['file'=>$f,'target'=>$target,'before'=>$before];
            }
            foreach ($restore as $item) {
                $f=$item['file']; $current=hash_file('sha256',$item['target']);
                if ($current===$f['beforeSha256']) continue;
                if ($current!==$f['afterSha256']) throw new RuntimeException('Later CMS edits prevent rollback: '.$f['path']);
                cmsCopyWrite($item['target'],$item['before'],$f['mode']);
                if (hash_file('sha256',$item['target'])!==$f['beforeSha256']) throw new RuntimeException('Rollback verification failed: '.$f['path']);
            }
            return ['status'=>'ROLLED_BACK','files'=>count($receipt['files'])];
        }
        $pending=[];
        foreach ($plan['files'] as $f) {
            $target=cmsCopyTarget($data,$f['path']); $raw=file_get_contents($target); $current=hash('sha256',$raw);
            if ($current===$f['afterSha256']) continue;
            if ($current!==$f['beforeSha256']) throw new RuntimeException('CMS changed after preparation: '.$f['path']);
            $after=base64_decode($f['afterBase64'],true);
            if (!is_string($after)||hash('sha256',$after)!==$f['afterSha256']) throw new RuntimeException('Plan checksum mismatch');
            $f['beforeBase64']=base64_encode($raw); $pending[]=$f;
        }
        if (!$pending) return ['status'=>'ALREADY_APPLIED','files'=>0];
        if (is_file($receiptFile)) throw new RuntimeException('Use a new work directory for a different application');
        cmsCopyWrite($receiptFile,cmsCopyJson(['status'=>'BACKED_UP','files'=>$pending]));
        $written=[];
        try {
            foreach ($pending as $f) {
                $target=cmsCopyTarget($data,$f['path']);
                if (hash_file('sha256',$target)!==$f['beforeSha256']) throw new RuntimeException('Concurrent CMS change');
                cmsCopyWrite($target,base64_decode($f['afterBase64'],true),$f['mode']); $written[]=$f;
            }
        } catch (Throwable $e) {
            foreach ($written as $f) if (hash_file('sha256',cmsCopyTarget($data,$f['path']))===$f['afterSha256']) cmsCopyWrite(cmsCopyTarget($data,$f['path']),base64_decode($f['beforeBase64'],true),$f['mode']);
            throw $e;
        }
        return ['status'=>'APPLIED','files'=>count($pending)];
    } finally { cmUnlock($lock); }
}
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    try { echo cmsCopyJson(cmsCopyMain($argv)) . "\n"; }
    catch (Throwable $e) { fwrite(STDERR,$e->getMessage()."\n"); exit(1); }
}
