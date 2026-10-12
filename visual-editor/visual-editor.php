<?php
require_once __DIR__ . '/cm-security.php';
cmRequireMethod('GET');
header('Content-Type: text/html; charset=utf-8');
header('Content-Security-Policy: default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\' https://fonts.googleapis.com; font-src \'self\' https://fonts.gstatic.com; img-src \'self\' data: blob: https:; connect-src \'self\'; frame-src \'self\'; frame-ancestors \'none\'; object-src \'none\'; base-uri \'self\'; form-action \'self\'');
header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');
if (!cmIsStaff()) {
    http_response_code(401);
    echo '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in to the visual editor | Crackers Mela</title><body style="margin:0;padding:64px 24px;background:#f1f5f9;color:#172b4d;font:16px/1.6 system-ui"><main style="max-width:520px;margin:auto;background:white;padding:36px;border-radius:16px"><h1>Sign in to edit your website</h1><p>The visual editor uses your existing Crackers Mela staff account.</p><p><a href="/#/staff">Open staff sign in</a></p><p>After signing in, <a href="/visual-editor">return to the visual editor</a>.</p></main></body></html>';
    exit;
}
cmRequirePermission('website.manage', false);
session_write_close();
$shell = __DIR__ . '/editor-shell.html';
if (!is_file($shell)) { http_response_code(503); echo '<!doctype html><html lang="en"><title>Visual editor unavailable</title><p>The visual editor files are unavailable. Please finish installing the editor.</p></html>'; exit; }
readfile($shell);
