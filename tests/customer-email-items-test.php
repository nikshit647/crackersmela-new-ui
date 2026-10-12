<?php
/* Stored-order template and fake-transport regression; never contacts SMTP.
   Usage: php tests/customer-email-items-test.php [output-directory] */
$root = dirname(__DIR__);
$output = $argv[1] ?? $root . '/audit-evidence/customer-email-items';
if (!is_dir($output)) mkdir($output, 0750, true);
putenv('CM_DATA_DIR=' . $output);
putenv('EMAIL_ENABLED=true'); putenv('CM_EMAIL_TRANSPORT=fake');
ini_set('session.use_cookies', '0'); ini_set('session.save_path', $output);
require_once $root . '/audit-evidence/production-release/cm-email-templates.php';
$cfg = array('enabled'=>true,'transport'=>'fake','internalTo'=>'store@example.test','trackBaseUrl'=>'https://crackersmela.com','logoUrl'=>'https://crackersmela.com/images/logo.png','password'=>'NEVER_RENDER_THIS_SECRET');
$checks = array();
function expectEmail($name, $value) {
    global $checks;
    $checks[] = array('name'=>$name,'pass'=>(bool)$value);
    if (!$value) throw new RuntimeException($name);
}
// Only test fixture construction reads the seed. Rendering receives the saved
// snapshot, exactly as the order/event dispatcher does.
$seed = file_get_contents($root . '/audit-evidence/production-release/js/products-data.js');
$catalog = json_decode(substr($seed, strpos($seed, '{')), true, 512, JSON_THROW_ON_ERROR);
$items = array(); $subtotalPaise = 0;
foreach (array_slice($catalog['products'], 0, 7) as $product) {
    $items[] = array('id'=>$product['id'],'name'=>$product['shortName'],'qty'=>1,'price'=>$product['price']);
    $subtotalPaise += (int)round($product['price'] * 100);
}
$order = array('id'=>'test-stored-order','code'=>'CM-TEST-7ITEMS','status'=>'placed','placedAt'=>'2026-10-06T09:30:00Z','payment'=>'COD',
    'customer'=>array('name'=>'Test Customer','email'=>'buyer@example.test'),'items'=>$items,
    'totals'=>array('subtotal'=>$subtotalPaise/100,'couponAmt'=>50,'couponCode'=>'TEST50','delivery'=>25,'saving'=>800,'total'=>($subtotalPaise-5000+2500)/100));
file_put_contents($output . '/order-snapshot.json', json_encode($order, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE));
try {
    foreach (array('placed','confirmed','packed','shipped','out_for_delivery','delivered','cancelled') as $status) {
        $order['status']=$status; $event=$status==='placed'?cmEmailEventPlaced():cmEmailEventForStatus($status);
        $message=cmEmailBuildForEvent($order,$event,$cfg);
        expectEmail($status . ': only this customer receives the order', $message['to']==='buyer@example.test');
        expectEmail($status . ': every one of seven stored lines appears in HTML and text', count(cmTplOrderItems($order))===7 && array_reduce($items, function($ok,$item) use($message){return $ok&&strpos($message['html'],cmTplEsc($item['name']))!==false&&strpos($message['text'],$item['name'])!==false;},true));
        expectEmail($status . ': unit and line amounts use the stored snapshot', array_reduce($items,function($ok,$item)use($message){return $ok&&strpos($message['text'],'Qty: 1 | Unit price: '.cmTplInr($item['price']).' | Line total: '.cmTplInr($item['price']))!==false;},true));
        expectEmail($status . ': stored subtotal, discount, delivery and final total appear', strpos($message['text'],'Subtotal: '.cmTplInr($order['totals']['subtotal']))!==false&&strpos($message['text'],'Discount: -₹50.00')!==false&&strpos($message['text'],'Delivery: ₹25.00')!==false&&strpos($message['text'],'ORDER TOTAL: '.cmTplInr($order['totals']['total']))!==false);
        expectEmail($status . ': branding, payment, tracking and protected invoice action remain', strpos($message['html'],$cfg['logoUrl'])!==false&&strpos($message['html'],'Cash on Delivery')!==false&&strpos($message['html'],'https://crackersmela.com/track/CM-TEST-7ITEMS')!==false&&strpos($message['html'],'https://crackersmela.com/track/CM-TEST-7ITEMS?invoice=1')!==false);
        expectEmail($status . ': itemization precedes total and actions', strpos($message['html'],'ORDER ITEMS')<strpos($message['html'],'ORDER TOTAL')&&strpos($message['html'],'ORDER TOTAL')<strpos($message['html'],'TRACK YOUR ORDER'));
        expectEmail($status . ': customer mail exposes no secret or admin link',strpos($message['html'],'NEVER_RENDER_THIS_SECRET')===false&&strpos($message['html'],'admin.crackersmela.com')===false);
        expectEmail($status . ': original status information remains',strpos($message['html'],$status==='cancelled'?'ORDER CANCELLED':($status==='placed'?'Order received':cmTplStatusLabel($status)))!==false&&($status==='cancelled'||strpos($message['html'],'Order progress')!==false));
        expectEmail($status . ': fake transport accepts both MIME alternatives',cmEmailSend($cfg,$message['to'],$message['subject'],$message['html'],$message['text'])['ok']);
        file_put_contents($output . '/'.$status.'.html',$message['html']); file_put_contents($output . '/'.$status.'.txt',$message['text']);
    }
    $single=$order; $single['items']=array(array('id'=>26,'name'=>'Stored <script>alert(1)</script> & "old name"','qty'=>3,'price'=>123.45));
    $single['totals']=array('subtotal'=>370.35,'couponAmt'=>0,'delivery'=>0,'saving'=>200,'total'=>370.35);
    $snapshot=cmTplOrderItems($single);
    expectEmail('Repeated quantities use order-creation paise arithmetic',count($snapshot)===1&&$snapshot[0]['qty']===3&&$snapshot[0]['lineTotal']===370.35);
    $html=cmTplOrderItemsHtml($single);$text=cmTplOrderItemsText($single);
    expectEmail('Historical names are escaped in HTML and never replaced from the catalog',strpos($html,'Stored &lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;old name&quot;')!==false&&strpos($html,'<script>')===false);
    expectEmail('Free delivery renders without treating comparison savings as another discount',strpos($text,'Delivery: Free')!==false&&strpos($text,'Discount:')===false&&strpos($text,'200.00')===false);
    $single['items'][0]['lineTotal']=369.99;$single['totals']['subtotal']=369.99;$single['totals']['total']=319.77;
    expectEmail('Explicit historical line total and final total are preserved without repricing',cmTplOrderItems($single)[0]['lineTotal']===369.99&&strpos(cmTplOrderItemsText($single),'ORDER TOTAL: ₹319.77')!==false);
    $single['totals']['posDiscount']=12.25;$single['totals']['festiveAmt']=2.03;
    expectEmail('Stored counter discounts and invoice other charges remain distinct',strpos(cmTplOrderItemsText($single),'Counter discount: -₹12.25')!==false&&strpos(cmTplOrderItemsText($single),'Other charges: ₹2.03')!==false);
    $single['status']='placed';file_put_contents($output.'/single-item.html',cmTplCustomerHtml($single,cmEmailEventPlaced(),$cfg));
    $none=$order;$none['customer']['email']='';expectEmail('Orders with no customer address still skip customer mail',cmEmailBuildForEvent($none,cmEmailEventPlaced(),$cfg)===null);
    expectEmail('Internal notification stays separate and unchanged',strpos(cmTplInternalHtml($order),'ORDER ITEMS')===false);
    $long=$order;$long['items'][0]['name']=str_repeat('VeryLongStoredProductName',12);$long['items'][0]['price']=99999.99;$long['items'][0]['qty']=50;
    file_put_contents($output.'/long-name.html',cmTplCustomerHtml($long,cmEmailEventPlaced(),$cfg));
    $result=array('status'=>'PASS','checks'=>$checks,'output'=>$output,'transport'=>'fake','scope'=>'Synthetic stored-order snapshots; no SMTP or real email');
} catch(Throwable $e) {$result=array('status'=>'FAIL','checks'=>$checks,'error'=>$e->getMessage(),'output'=>$output);}
file_put_contents($root.'/audit/customer-email-items-results.json',json_encode($result,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE));
echo json_encode(array('status'=>$result['status'],'checks'=>count($checks),'output'=>$output),JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES),"\n";
exit($result['status']==='PASS'?0:1);
