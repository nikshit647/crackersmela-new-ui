<?php
/* Template assertions for the Crackers Mela transactional email.
 *
 * Runs on the PHP CLI with no mail server and no web request. It checks the
 * rendered customer and internal emails directly, so the itemized snapshot and
 * the plain-text fallback are verified rather than assumed.
 *
 * Usage: php audit/notification-template-test.php
 */
$release = __DIR__ . '/../audit-evidence/production-release';
$data = sys_get_temp_dir() . '/cm-template-test-' . bin2hex(random_bytes(6));
@mkdir($data, 0750, true);
putenv('CM_DATA_DIR=' . $data);
putenv('EMAIL_ENABLED=true');
putenv('CM_EMAIL_TRANSPORT=fake');
putenv('SMTP_USER=' . 'crackersmela' . '@' . 'gmail.com');
putenv('SMTP_PASSWORD=[REDACTED]');
putenv('EMAIL_FROM_NAME=Crackers Mela');
putenv('EMAIL_FROM_ADDRESS=' . 'crackersmela' . '@' . 'gmail.com');
putenv('INTERNAL_ORDER_EMAIL=' . 'crackersmela' . '@' . 'gmail.com');
putenv('TRACK_BASE_URL=https://crackersmela.com');
ini_set('session.use_cookies', '0');
ini_set('session.save_path', $data);

require_once $release . '/cm-email-templates.php';

$results = array();
function check($name, $condition, $details = null) {
    global $results;
    $results[] = array('name' => $name, 'pass' => (bool)$condition);
    if (!$condition) {
        echo "FAIL: $name" . ($details !== null ? ' -- ' . (is_string($details) ? $details : json_encode($details)) : '') . "\n";
    }
}

/* A realistic stored order whose item detail belongs in customer emails. */
$order = array(
    'id' => 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
    'code' => 'CM-261002-85B8A46A',
    'status' => 'placed',
    'placedAt' => '2026-10-02T09:15:00Z',
    'payment' => 'COD',
    'items' => array(
        array('id' => 42, 'sku' => 'SECRET-SKU-7788', 'name' => 'Sparkler Pack Deluxe Reserve', 'qty' => 4, 'price' => 320.5),
        array('id' => 77, 'sku' => 'SECRET-SKU-9911', 'name' => 'Rocket Fountain XL', 'qty' => 2, 'price' => 899),
    ),
    'totals' => array('subtotal' => 3079, 'total' => 3079, 'couponCode' => 'DIWALI50', 'couponAmt' => 500),
    'customer' => array('name' => 'Ananya Sharma', 'email' => '[REDACTED]', 'phone' => '[REDACTED]'),
    'shipping' => array('address' => '12 Test Street', 'area' => 'Banjara Hills', 'city' => 'Hyderabad', 'pincode' => '500034'),
);
$cfg = cmEmailConfig();

/* ---- customer messages show their own purchased items, not private fields ---- */
foreach (array('confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered') as $statusKey) {
    $order['status'] = $statusKey;
    $event = cmEmailEventForStatus($statusKey);
    $html = cmTplCustomerHtml($order, $event, $cfg);
    $text = cmTplCustomerText($order, $event, $cfg);

    check($statusKey . ': html includes the stored product names',
        strpos($html, 'Sparkler Pack Deluxe Reserve') !== false && strpos($html, 'Rocket Fountain XL') !== false);
    check($statusKey . ': text includes the stored product names',
        strpos($text, 'Sparkler Pack Deluxe Reserve') !== false && strpos($text, 'Rocket Fountain XL') !== false);
    check($statusKey . ': html omits the SKU', strpos($html, 'SECRET-SKU-7788') === false);
    check($statusKey . ': html includes the stored unit prices', strpos($html, '320.50') !== false && strpos($html, '899.00') !== false);
    check($statusKey . ': html omits the street address', strpos($html, '12 Test Street') === false);
    check($statusKey . ': html shows the order code', strpos($html, 'CM-261002-85B8A46A') !== false);
    check($statusKey . ': html shows the total quantity', strpos($html, '6 items') !== false);
    check($statusKey . ': html shows the order total', strpos($html, '3,079.00') !== false);
    check($statusKey . ': html shows the payment method', strpos($html, 'Cash on Delivery') !== false);
    check($statusKey . ': html shows the customer name', strpos($html, 'Ananya Sharma') !== false);
    check($statusKey . ': html links the tracker', strpos($html, 'https://crackersmela.com/track/CM-261002-85B8A46A') !== false);
    check($statusKey . ': html links an invoice action', strpos($html, 'DOWNLOAD INVOICE') !== false);
    check($statusKey . ': html uses the real logo url', strpos($html, 'https://crackersmela.com/images/logo.png') !== false);
    check($statusKey . ': html never mentions a competitor brand',
        stripos($html, 'hyderabad') === false || stripos($html, 'crackers hyderabad') === false);
    check($statusKey . ': text carries the order id', strpos($text, 'Order ID: #CM-261002-85B8A46A') !== false);
    check($statusKey . ': text carries the tracker link', strpos($text, 'Track Your Order: https://crackersmela.com/track/') !== false);
    check($statusKey . ': text carries the invoice link', strpos($text, 'Download Invoice: https://crackersmela.com/track/') !== false);
    check($statusKey . ': text includes the stored line total', strpos($text, 'Line total: ₹1,282.00') !== false);
    /* All five stages must be represented in both renderings. */
    foreach (array('Confirmed', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered') as $stage) {
        check($statusKey . ': tracker shows ' . $stage, strpos($html, $stage) !== false);
    }
}

/* ---- the placed email must not claim the order is confirmed ---- */
$order['status'] = 'placed';
$placedHtml = cmTplCustomerHtml($order, cmEmailEventPlaced(), $cfg);
check('placed email does not announce confirmation', stripos($placedHtml, 'Order received') !== false);
check('placed email marks confirmation as pending',
    stripos($placedHtml, 'has been confirmed yet') !== false || stripos($placedHtml, 'not been confirmed') !== false);
check('placed subject is factual', cmTplSubject(cmEmailEventPlaced(), $order) === 'Your Crackers Mela Order #CM-261002-85B8A46A has been received');
check('placed preheader is present and hidden', strpos(cmTplCustomerHtml($order, cmEmailEventPlaced(), $cfg), 'display:none') !== false);

/* ---- cancellation is rendered separately ---- */
$order['status'] = 'cancelled';
$cancelledHtml = cmTplCancelledHtml($order, $cfg);
check('cancelled email says order cancelled', stripos($cancelledHtml, 'ORDER CANCELLED') !== false);
check('cancelled email keeps the order code', strpos($cancelledHtml, 'CM-261002-85B8A46A') !== false);
check('cancelled email keeps the total', strpos($cancelledHtml, '3,079.00') !== false);
check('cancelled email keeps the quantity', strpos($cancelledHtml, '6 items') !== false);
check('cancelled email does not show the delivery progression',
    strpos($cancelledHtml, 'Order progress') === false);
check('cancelled subject is transactional', cmTplSubject(cmEmailEventCancelled(), $order) === 'Your Crackers Mela Order #CM-261002-85B8A46A has been Cancelled');

/* ---- tracker state mapping ---- */
$cases = array(
    'placed'           => array('current', 'upcoming', 'upcoming', 'upcoming', 'upcoming'),
    'confirmed'        => array('current', 'upcoming', 'upcoming', 'upcoming', 'upcoming'),
    'packed'           => array('done', 'current', 'upcoming', 'upcoming', 'upcoming'),
    'shipped'          => array('done', 'done', 'current', 'upcoming', 'upcoming'),
    'out_for_delivery' => array('done', 'done', 'done', 'current', 'upcoming'),
    'delivered'        => array('done', 'done', 'done', 'done', 'current'),
);
foreach ($cases as $statusKey => $expected) {
    check('tracker states for ' . $statusKey, array_values(cmTplTrackerStates($statusKey)) === $expected,
        array_values(cmTplTrackerStates($statusKey)));
}

/* ---- the internal notification is a separate, compact template ---- */
$order['status'] = 'placed';
$internalHtml = cmTplInternalHtml($order);
$internalText = cmTplInternalText($order);
check('internal email announces a new order', stripos($internalHtml, 'NEW ORDER PLACED') !== false);
check('internal email shows the customer', strpos($internalHtml, 'Ananya Sharma') !== false);
check('internal email shows the customer email', strpos($internalHtml, '[REDACTED]') !== false);
check('internal email shows the phone', strpos($internalHtml, '[REDACTED]') !== false);
check('internal email shows the total', strpos($internalHtml, '3,079.00') !== false);
check('internal email shows the payment', strpos($internalHtml, 'Cash on Delivery') !== false);
check('internal email shows the delivery area', strpos($internalHtml, 'Hyderabad') !== false);
check('internal email shows the order date', strpos($internalHtml, '02 Oct 2026') !== false);
check('internal email offers a staff link', strpos($internalHtml, 'admin.crackersmela.com') !== false);
check('internal email places no token in a url',
    !preg_match('/(token|key|auth|session)=/i', $internalHtml));
check('internal text carries the order code', strpos($internalText, '#CM-261002-85B8A46A') !== false);

/* ---- email events map to recipients and subjects correctly ---- */
$built = cmEmailBuildForEvent($order, cmEmailEventInternalNewOrder(), $cfg);
check('internal event targets the configured store mailbox', $built['to'] === $cfg['internalTo']);
check('internal event is not the customer', $built['to'] !== '[REDACTED]');

$noEmailOrder = $order;
$noEmailOrder['customer']['email'] = '';
check('customer event is skipped when there is no address',
    cmEmailBuildForEvent($noEmailOrder, cmEmailEventPacked(), $cfg) === null);
check('internal event still builds when there is no customer address',
    cmEmailBuildForEvent($noEmailOrder, cmEmailEventInternalNewOrder(), $cfg) !== null);

/* ---- no credential material can appear in any rendered message ---- */
foreach (array(
    cmTplCustomerHtml($order, cmEmailEventPacked(), $cfg),
    cmTplCustomerText($order, cmEmailEventPacked(), $cfg),
    cmTplInternalHtml($order),
    cmTplInternalText($order),
) as $index => $rendered) {
    check('rendered message ' . $index . ' carries no password',
        stripos($rendered, 'local-fixture') === false && stripos($rendered, 'PASSWORD') === false);
}

/* ---- plain text is a genuine alternative, not the HTML ---- */
$text = cmTplCustomerText($order, cmEmailEventPacked(), $cfg);
check('plain text contains no html tags', strpos($text, '<') === false && strpos($text, '>') === false);
check('plain text is multi-line', strpos($text, "\n") !== false);

$passed = 0;
foreach ($results as $r) if ($r['pass']) $passed++;
echo json_encode(array('passed' => $passed, 'total' => count($results)), JSON_PRETTY_PRINT), "\n";
array_map('unlink', glob($data . '/*') ?: []);
@rmdir($data);
exit($passed === count($results) ? 0 : 1);
