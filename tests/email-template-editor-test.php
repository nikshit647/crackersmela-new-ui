<?php
// Real template rendering and persistence against disposable local data. No SMTP.
$root = dirname(__DIR__);
$data = sys_get_temp_dir() . '/cm-email-editor-' . bin2hex(random_bytes(5));
mkdir($data, 0750, true);
putenv('CM_DATA_DIR=' . $data);
putenv('CM_EMAIL_TRANSPORT=fake');
putenv('EMAIL_ENABLED=true');
ini_set('session.use_cookies', '0');
require_once $root . '/audit-evidence/production-release/cm-email-templates.php';
function verify($condition, $message) { if (!$condition) throw new RuntimeException($message); }
verify(function_exists('cmEmailBuiltInTemplates'), 'The editor must receive all real built-in templates');
$all = cmEmailBuiltInTemplates();
verify(count($all) === 8 && !isset($all['INTERNAL_NEW_ORDER']), 'Only eight customer templates are editable');
$order = cmEmailSampleOrder(); $cfg = cmEmailConfig();
foreach ($all as $event => $template) {
    foreach (['subject','preheader','heading','body','buttonText','buttonUrl'] as $field) verify(trim($template[$field]) !== '', $event . ': populated ' . $field);
    $order['status'] = cmEmailStatusForEvent($event);
    $preview = cmEmailRenderTemplate($event, $order, $cfg, $template);
    $built = cmEmailBuildForEvent($order, $event, $cfg);
    verify($preview === $built, $event . ': preview uses exactly the real send renderer');
    verify(strpos($preview['html'], 'ORDER ITEMS') !== false && strpos($preview['html'], 'DOWNLOAD INVOICE') !== false, $event . ': order structure preserved');
    verify(substr_count($preview['text'], 'ORDER ITEMS') === 1, $event . ': plain text has one item table');
    $template['heading'] = 'Edited ' . $event;
    $template['body'] = 'Hi {CUSTOMER_NAME}, **your order** {ORDER_ID} costs {ORDER_TOTAL}.\n\n[Track]({ORDER_URL}) <script>bad()</script>';
    cmEmailTemplateSave($event, $template);
    verify(cmEmailBuildForEvent($order, $event, $cfg) === cmEmailRenderTemplate($event, $order, $cfg, $template), $event . ': saved and draft use identical HTML');
    verify(strpos(cmEmailBuildForEvent($order, $event, $cfg)['html'], '<script>') === false, 'Unsafe HTML escaped');
    cmEmailTemplateDelete($event);
    verify(cmEmailBuildForEvent($order, $event, $cfg) === $built, $event . ': reset restores original renderer');
}
verify($all['ORDER_PLACED']['body'] === 'Hi {CUSTOMER_NAME}, Thank you for your order. We are checking stock and will confirm shortly.', 'Original received wording is recovered');
verify(strpos($all['ORDER_DELIVERED']['body'], 'Enjoy the celebration, and burst safely.') !== false, 'Original delivered wording is recovered');
verify(cmEmailTemplateProblem(['subject'=>'Only subject','heading'=>'','body'=>'','buttonText'=>'','buttonUrl'=>'']) !== '', 'Incomplete templates cannot erase complete mail');
verify(cmEmailTemplateProblem(array_merge($all['ORDER_PLACED'], ['buttonUrl'=>'javascript:alert(1)'])) !== '', 'Unsafe buttons rejected');
verify(cmEmailTemplateProblem(array_merge($all['ORDER_PLACED'], ['body'=>'Unknown {NOT_SUPPORTED}'])) !== '', 'Unsupported tokens rejected');
putenv('EMAIL_LOGO_URL=https://example.test/brand-logo.png');
verify(cmEmailConfig()['logoUrl'] === 'https://example.test/brand-logo.png', 'Explicit logo URL is not changed');
cmWriteJson($data . '/products.json', ['settings'=>['emailBrand'=>['storeName'=>'Brand test','logoUrl'=>'https://example.test/saved-logo.png','supportPhone'=>'555 0100','supportEmail'=>'help@example.test','footer'=>'Saved footer','accentColor'=>'#123456']]]);
$branded = cmEmailRenderTemplate('ORDER_PLACED', $order, $cfg, $all['ORDER_PLACED']);
verify(strpos($branded['html'],'https://example.test/saved-logo.png') !== false, 'Saved logo reaches actual email renderer');
verify(strpos($branded['html'],'Saved footer') !== false && strpos($branded['html'],'help@example.test') !== false && strpos($branded['html'],'555 0100') !== false, 'Saved support and footer reach actual email renderer');
verify(strpos($branded['html'],'#123456') !== false, 'Saved accent reaches actual email renderer');
echo "PASS: eight built-in templates, shared previews, persistence/reset, structure, variables and validation\n";
