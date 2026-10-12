<?php
/* Renders the transactional emails to disk so they can be inspected in a
   browser. Local verification only; not part of the deployed application. */
$release = __DIR__ . '/../audit-evidence/production-release';
$out = sys_get_temp_dir() . '/cm-email-preview';
@mkdir($out, 0750, true);
putenv('CM_DATA_DIR=' . $out);
putenv('EMAIL_ENABLED=true');
putenv('CM_EMAIL_TRANSPORT=fake');
putenv('SMTP_USER=' . 'crackersmela' . '@' . 'gmail.com');
putenv('SMTP_PASSWORD=[REDACTED]');
putenv('EMAIL_FROM_NAME=Crackers Mela');
putenv('EMAIL_FROM_ADDRESS=' . 'crackersmela' . '@' . 'gmail.com');
putenv('INTERNAL_ORDER_EMAIL=' . 'crackersmela' . '@' . 'gmail.com');
putenv('TRACK_BASE_URL=https://crackersmela.com');
ini_set('session.use_cookies', '0');
ini_set('session.save_path', $out);
require_once $release . '/cm-email-templates.php';

$base = array(
    'id' => 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
    'code' => 'CM-261002-85B8A46A',
    'placedAt' => '2026-10-02T09:15:00Z',
    'payment' => 'COD',
    'items' => array(array('id' => 42, 'sku' => 'CM-0042', 'name' => 'Product', 'qty' => 4, 'price' => 320.5)),
    'totals' => array('subtotal' => 3079, 'total' => 3079, 'couponCode' => 'DIWALI50', 'couponAmt' => 500),
    'customer' => array('name' => 'Ananya Sharma', 'email' => '[REDACTED]', 'phone' => '[REDACTED]'),
    'shipping' => array('address' => '12 Test Street', 'area' => 'Banjara Hills', 'city' => 'Hyderabad', 'pincode' => '500034'),
);
$cfg = cmEmailConfig();

$variants = array(
    'placed'   => array('status' => 'placed',           'event' => cmEmailEventPlaced()),
    'confirmed'=> array('status' => 'confirmed',        'event' => cmEmailEventConfirmed()),
    'packed'   => array('status' => 'packed',           'event' => cmEmailEventPacked()),
    'shipped'  => array('status' => 'shipped',          'event' => cmEmailEventShipped()),
    'out'      => array('status' => 'out_for_delivery', 'event' => cmEmailEventOutForDelivery()),
    'delivered'=> array('status' => 'delivered',        'event' => cmEmailEventDelivered()),
);
foreach ($variants as $name => $v) {
    $order = array_merge($base, array('status' => $v['status']));
    file_put_contents($out . '/customer-' . $name . '.html', cmTplCustomerHtml($order, $v['event'], $cfg));
    file_put_contents($out . '/customer-' . $name . '.txt', cmTplCustomerText($order, $v['event'], $cfg));
}
$order = array_merge($base, array('status' => 'cancelled'));
file_put_contents($out . '/customer-cancelled.html', cmTplCancelledHtml($order, $cfg));
file_put_contents($out . '/customer-cancelled.txt', cmTplCustomerText($order, cmEmailEventCancelled(), $cfg));
file_put_contents($out . '/internal-new-order.html', cmTplInternalHtml($order));
file_put_contents($out . '/internal-new-order.txt', cmTplInternalText($order));

echo $out, "\n";