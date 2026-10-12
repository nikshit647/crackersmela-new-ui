<?php
/* Read-only validation of the reviewed admin update through the actual validator. */
require __DIR__ . '/../audit-evidence/production-release/cm-commerce.php';
$requestPath=$argv[1]??__DIR__.'/../audit-evidence/live-seo-fields-20261007/request.json';
$request=json_decode(file_get_contents($requestPath),true,512,JSON_THROW_ON_ERROR);
foreach ($request['productOverrides'] as $id=>$product) {
    $clean=cmCleanProduct($product,true);
    ksort($clean); ksort($product);
    if ($clean != $product || count($clean)!==count($product)) throw new RuntimeException('Validator would change protected fields for product '.$id);
    foreach (['seoTitle','seoDesc','seoKeywords','seoSlug','seoTags'] as $field) if (empty($clean[$field])) throw new RuntimeException('Missing SEO field');
}
echo json_encode(['status'=>'PASS','products'=>count($request['productOverrides']),'validatorPreservesRequest'=>true]);
