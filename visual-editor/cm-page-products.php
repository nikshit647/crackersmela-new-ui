<?php
/* Anonymous first paint for authored product grids. Prices, stock and brands
   come from the same current catalogue as the storefront. */
require_once __DIR__ . '/cm-seo.php';
require_once __DIR__ . '/cm-product-brand.php';

function cmPageProductCategory($product) {
    $categories = array_column(cmBaseData()['categories'] ?? [], null, 'id');
    foreach (['gift-boxes','bombs','garlands','chakkars','rockets','fancy','night-outs','flower-pots','sparklers','guns-rolls','kids-special'] as $id) {
        if (in_array($id, $product['cats'] ?? [], true) && isset($categories[$id])) return $categories[$id];
    }
    return $categories[$product['primary'] ?? ''] ?? $categories['fancy'] ?? ['id'=>'','name'=>'','blurb'=>''];
}
function cmPageProductMoney($value) {
    $digits = (string)(int)floor((float)$value + 0.5);
    if (strlen($digits) > 3) $digits = preg_replace('/\B(?=(\d{2})+(?!\d))/', ',', substr($digits, 0, -3)) . ',' . substr($digits, -3);
    return '₹' . $digits;
}
function cmPageProductIcon($category) {
    $paths = [
        'gift-boxes'=>'<rect x="3" y="8" width="18" height="4"/><path d="M5 12v8h14v-8M12 8v12M12 8S10.5 4 8 4a2 2 0 0 0 0 4zM12 8s1.5-4 4-4a2 2 0 0 1 0 4z"/>',
        'kids-special'=>'<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9.5h.01M15 9.5h.01"/>',
        'flower-pots'=>'<circle cx="12" cy="12" r="2.6"/><path d="M12 9.4a3.4 3.4 0 1 0-3.4-3.4A3.4 3.4 0 0 0 12 9.4zM12 14.6a3.4 3.4 0 1 0 3.4 3.4A3.4 3.4 0 0 0 12 14.6zM9.4 12a3.4 3.4 0 1 0-3.4 3.4A3.4 3.4 0 0 0 9.4 12zM14.6 12a3.4 3.4 0 1 0 3.4-3.4A3.4 3.4 0 0 0 14.6 12z"/>',
        'chakkars'=>'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/><path d="M20.5 12H23M1 12h2.5M12 20.5V23M12 1v2.5"/>',
        'garlands'=>'<path d="M4 8h16m-13.5 0-2 6M8.5 8l1.3 6M12 8l-.6 6M16.5 8l-1.3 6M18.5 8l2 6"/>',
        'fancy'=>'<path d="M12 3v18M3 12h18M6 6l12 12M18 6 6 18"/>',
        'rockets'=>'<path d="M12 2c3.2 2 4.8 5.2 4.8 9 0 2-.9 3.6-2.6 4.6H9.8C8.1 14.6 7.2 13 7.2 11 7.2 7.2 8.8 4 12 2z"/><circle cx="12" cy="11" r="1.9"/><path d="M9.5 15.6h5l1.2 4.4H8.3zM12 16.5V20"/>',
        'bombs'=>'<circle cx="11" cy="13" r="8"/><path d="M11 9.6a3.4 3.4 0 0 0-3.4 3.4m8.4-10 2.5 2.5M14.5 1.5 17 4M20 4l2 2"/>',
        'guns-rolls'=>'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
        'night-outs'=>'<circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><path d="M12 4.5v3M12 16.5v3M4.5 12h3M16.5 12h3M6.6 6.6l2.1 2.1M15.3 15.3l2.1 2.1M17.4 6.6l-2.1 2.1M8.7 15.3l-2.1 2.1"/>'
    ];
    $path = $paths[$category['id']] ?? '<path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z"/>';
    return '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' . $path . '</svg>';
}
function cmPageProductCardHtml($product) {
    $category = cmPageProductCategory($product); $id = (int)$product['id']; $price = (float)($product['price'] ?? 0); $compare = (float)($product['compareAt'] ?? 0);
    $off = $compare > $price ? (int)floor((1 - $price / $compare) * 100 + 0.5) : 0;
    $stock = max(0, (int)floor((float)($product['stock'] ?? 0))); $available = $stock > 0 && !empty($product['inStock']);
    $name = (string)($product['shortName'] ?? ''); $href = '#/product/' . rawurlencode(cmSeoSlug($product));
    $description = trim(preg_replace('/\s+/u', ' ', (string)(($product['note'] ?? '') ?: ($product['desc'] ?? ''))));
    if ($description === '') $description = $category['blurb'] ?? '';
    elseif (iconv_strlen($description, 'UTF-8') > 76) $description = preg_replace('/[\s,;.]+\S*$/u', '', iconv_substr($description, 0, 74, 'UTF-8')) . '…';
    $src = trim((string)($product['image'] ?? '')); $validImage = cmSeoImage($src) !== '';
    $cutout = $validImage && preg_match('#^images/products/[^?#]+$#', $src) ? 'images/products/nobg/' . preg_replace('/\.(png|jpe?g)$/i', '.webp', basename($src)) : '';
    $media = $validImage ? '<img src="' . cmSeoEscape($cutout ?: $src) . '" alt="' . cmSeoEscape(($product['name'] ?? '') ?: $name) . '" loading="lazy" decoding="async" width="400" height="400" data-cm-image="product" data-image-category="' . cmSeoEscape($category['id']) . '" data-cm-product="' . $id . '"' . ($cutout ? ' data-fallback-src="' . cmSeoEscape($src) . '"' : '') . '>' : '<div class="prod-img-fallback">' . cmPageProductIcon($category) . '</div>';
    $stockClass = !$available ? 'out' : ($stock <= 6 ? 'low' : 'in');
    $stockText = !$available ? 'Out of stock' : ($stock <= 6 ? 'Only ' . $stock . ' left' : 'In stock');
    $stockIcon = !$available ? '<path d="M12 9v4"/><circle cx="12" cy="17" r="0.4"/><circle cx="12" cy="12" r="9" stroke-dasharray="2 2"/>' : ($stock <= 6 ? '<path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.8 2.8M16.2 16.2 19 19M19 5l-2.8 2.8M7.8 16.2 5 19"/>' : '<path d="M20 6 9 17l-5-5"/>');
    $foot = '<span class="stock-line ' . $stockClass . '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' . $stockIcon . '</svg>' . $stockText . '</span>';
    $foot .= $available ? '<button class="add-btn add-btn--product" data-add="' . $id . '" title="Add to cart" aria-label="Add ' . cmSeoEscape($name) . ' to cart"><span>Add to Cart</span></button>' : '<button class="add-btn add-btn--product" disabled title="Sold out" aria-label="Sold out"><span>Sold</span></button>';
    return '<article class="prod-card reveal in" data-id="' . $id . '"><div class="prod-card__media"><a href="' . cmSeoEscape($href) . '">' . $media . '</a>'
        . ($off ? '<div class="prod-card__badges"><span class="badge-off">' . $off . '% OFF</span></div>' : '')
        . '<button class="prod-card__wish" data-wish="' . $id . '" aria-label="Toggle wishlist" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg></button>'
        . (!$available ? '<div class="prod-oos-tint"><span>OUT OF STOCK</span></div>' : '') . '</div><div class="prod-card__body">' . cmProductBrandPill($product)
        . '<span class="prod-card__cat">' . cmSeoEscape($category['name']) . '</span><h3 class="prod-card__name"><a href="' . cmSeoEscape($href) . '">' . cmSeoEscape($name) . '</a></h3><p class="prod-card__desc">' . cmSeoEscape($description) . '</p>'
        . '<div class="price-row"><span class="price-now">' . cmPageProductMoney($price) . '</span>' . ($compare > $price ? '<span class="price-cmp">' . cmPageProductMoney($compare) . '</span><span class="price-off">' . $off . '% off</span>' : '') . '</div><div class="prod-card__foot">' . $foot . '</div></div></article>';
}
function cmPageProductGridHtml($content) {
    $products = array_values(array_filter(cmProductMap(), function($product) { return empty($product['disabled']); }));
    if (!empty($content['productIds']) && is_array($content['productIds'])) {
        $ids = array_map('intval', $content['productIds']);
        $products = array_values(array_filter($products, function($product) use ($ids) { return in_array($product['id'], $ids, true); }));
    }
    if (!empty($content['category']) && $content['category'] !== 'all') $products = array_values(array_filter($products, function($product) use ($content) { return in_array($content['category'], $product['cats'] ?? [], true); }));
    $sort = $content['sort'] ?? 'featured';
    usort($products, function($a, $b) use ($sort) {
        if ($sort === 'price-asc') return (float)($a['price'] ?? 0) <=> (float)($b['price'] ?? 0);
        if ($sort === 'price-desc') return (float)($b['price'] ?? 0) <=> (float)($a['price'] ?? 0);
        if ($sort === 'newest') return $b['id'] <=> $a['id'];
        if ($sort === 'name') return strcasecmp($a['shortName'] ?? '', $b['shortName'] ?? '');
        return (int)!empty($b['featured']) <=> (int)!empty($a['featured']);
    });
    return implode('', array_map('cmPageProductCardHtml', array_slice($products, 0, max(1, min(60, (int)($content['limit'] ?? 12) ?: 12)))));
}
