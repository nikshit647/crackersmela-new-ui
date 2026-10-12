<?php
/* Additive structured-content storage. Commerce and identity remain authoritative. */
require_once __DIR__ . '/cm-commerce.php';

function cmCmsError($message) { cmRespond(422, ['ok' => false, 'error' => $message]); }
function cmCmsObject($value, $allowed, $label) {
    if (!is_array($value)) cmCmsError($label . ' must be an object.');
    foreach ($value as $key => $unused) if (!is_string($key) || !in_array($key, $allowed, true)) cmCmsError($label . ' contains an unsupported property.');
    return $value;
}
function cmCmsText($value, $limit = 20000, $label = 'Text') {
    if (!is_string($value) || strlen($value) > $limit || preg_match('//u', $value) !== 1 || preg_match('/[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/', $value)) cmCmsError($label . ' must be plain text within the allowed length.');
    return $value;
}
function cmCmsId($value, $label = 'Identifier') {
    if (!is_string($value) || !preg_match('/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/D', $value)) cmCmsError($label . ' is invalid.');
    return $value;
}
function cmCmsBool($value, $label) {
    if (!is_bool($value)) cmCmsError($label . ' must be true or false.');
    return $value;
}
function cmCmsNumber($value, $min, $max, $integer = false) {
    if ((!is_int($value) && !is_float($value)) || !is_finite((float)$value) || $value < $min || $value > $max || ($integer && floor($value) != $value)) cmCmsError('A numeric value is outside the allowed range.');
    return $integer ? (int)$value : $value;
}
function cmCmsEnum($value, $allowed, $label) {
    if (!is_string($value) || !in_array($value, $allowed, true)) cmCmsError('Choose a supported ' . $label . '.');
    return $value;
}
function cmCmsUrl($value, $image = false, $absolute = false) {
    $value = trim(cmCmsText($value, 2048, 'URL'));
    if ($value === '') return '';
    if (preg_match('/[\s\x00-\x1f\x7f"\x27\\\\]/', $value)) cmCmsError('Use a valid URL.');
    if (preg_match('#^https://#i', $value)) {
        $parts = parse_url($value);
        if (!$parts || empty($parts['host']) || isset($parts['user']) || isset($parts['pass'])) cmCmsError('Use a valid HTTPS URL.');
        return $value;
    }
    if ($absolute) cmCmsError('Use an absolute HTTPS URL.');
    if ($image) {
        if (!preg_match('#^/?(?:images|uploads)/[A-Za-z0-9_./%()@+ -]+$#D', $value) || strpos(rawurldecode($value), '..') !== false || strpos(rawurldecode($value), '\\') !== false || strpos(rawurldecode($value), "\0") !== false) cmCmsError('Choose an existing image or an HTTPS image URL.');
        return '/' . ltrim($value, '/');
    }
    if ($value[0] === '#' || (preg_match('#^/(?!/)#', $value) && strpos(rawurldecode($value), '\\') === false)) return $value;
    if (preg_match('/^mailto:[A-Za-z0-9.!#$%&*+\/= ?^_`{|}~-]+@[A-Za-z0-9.-]+$/D', $value) || preg_match('/^tel:\+?[0-9()-]{3,25}$/D', $value)) return $value;
    cmCmsError('Use an HTTPS, page, email or telephone link.');
}
function cmCmsVideoUrl($value) {
    $value = trim(cmCmsText($value, 2048, 'Video URL'));
    if ($value === '') return '';
    $remote = preg_match('#^https://#i', $value);
    $value = cmCmsUrl($value, !$remote, (bool)$remote);
    $path = parse_url($value, PHP_URL_PATH);
    if ((!$remote && strpos($value, '/uploads/') !== 0) || !is_string($path) || !preg_match('/\.(?:mp4|webm|ogv)$/iD', $path)) cmCmsError('Use an HTTPS MP4, WebM or OGV video URL.');
    return $value;
}
function cmCmsIcon($value) {
    return cmCmsEnum($value, ['star','heart','sparkle','check','gift','phone','mail','location','arrow-right'], 'icon');
}
function cmCmsColor($value) {
    return (bool)preg_match('/^(?:#[0-9a-fA-F]{3,4}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|transparent|currentColor|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\))$/D', $value);
}
function cmCmsLength($value, $negative = false, $auto = false) {
    if ($auto && $value === 'auto') return true;
    if ($value === '0') return true;
    return (bool)preg_match('/^' . ($negative ? '-?' : '') . '(?:\d{1,4}(?:\.\d{1,3})?|\.\d{1,3})(?:px|rem|em|vw|vh|%)$/D', $value);
}
function cmCmsStyles($input) {
    $lengths = ['fontSize','letterSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','width','maxWidth','minHeight','height','borderRadius','borderWidth','gap'];
    $enums = [
        'fontFamily'=>['Inter','Sora','Plus Jakarta Sans','system-ui','Georgia'],
        'textAlign'=>['left','center','right','justify','start','end'],
        'borderStyle'=>['none','solid','dashed','dotted','double'],
        'display'=>['block','inline','inline-block','inline-flex','flex','grid','none'],
        'flexDirection'=>['row','column','row-reverse','column-reverse'],
        'alignItems'=>['stretch','start','end','center','flex-start','flex-end','baseline'],
        'justifyContent'=>['start','end','center','flex-start','flex-end','space-between','space-around','space-evenly'],
        'objectFit'=>['cover','contain','fill','none','scale-down']
    ];
    $allowed = array_merge($lengths, array_keys($enums), ['fontWeight','lineHeight','color','backgroundColor','borderColor','boxShadow','gridTemplateColumns','objectPosition','opacity']);
    cmCmsObject($input, $allowed, 'Styles'); $out = [];
    foreach ($input as $key => $raw) {
        if (!is_string($raw) && !is_int($raw) && !is_float($raw)) cmCmsError('A style value is invalid.');
        $value = trim((string)$raw);
        if ($value === '') continue;
        if (strlen($value) > 200 || preg_match('/[<>;{}\\\\]|url\s*\(|expression\s*\(|@|\/\*/i', $value)) cmCmsError('Use a supported style value.');
        $valid = false;
        if (in_array($key, $lengths, true)) $valid = cmCmsLength($value, $key === 'letterSpacing' || strpos($key, 'margin') === 0, in_array($key, ['width','maxWidth','height','minHeight','marginLeft','marginRight'], true));
        elseif (isset($enums[$key])) $valid = in_array($value, $enums[$key], true);
        elseif (in_array($key, ['color','backgroundColor','borderColor'], true)) $valid = cmCmsColor($value);
        elseif ($key === 'fontWeight') $valid = (bool)preg_match('/^(?:[1-9]00|normal|bold)$/D', $value);
        elseif ($key === 'lineHeight') $valid = $value === 'normal' || cmCmsLength($value) || (is_numeric($value) && (float)$value >= 0.5 && (float)$value <= 5);
        elseif ($key === 'opacity') $valid = is_numeric($value) && (float)$value >= 0 && (float)$value <= 1;
        elseif ($key === 'gridTemplateColumns') $valid = (bool)preg_match('/^repeat\(\s*(?:[1-9]|1[0-2])\s*,\s*(?:1fr|minmax\(\s*0\s*,\s*1fr\s*\))\s*\)$/D', $value);
        elseif ($key === 'objectPosition') $valid = (bool)preg_match('/^(?:(?:\d{1,2}(?:\.\d+)?|100)% (?:\d{1,2}(?:\.\d+)?|100)%|center|top|bottom|left|right|(?:left|center|right) (?:top|center|bottom))$/D', $value);
        elseif ($key === 'boxShadow') {
            $valid = $value === 'none';
            if (!$valid && preg_match('/^(?:inset )?((?:-?(?:\d{1,3}(?:\.\d+)?|\.\d+)(?:px|rem|em)?\s+){2,4})(.+)$/D', $value, $m)) $valid = cmCmsColor(trim($m[2]));
        }
        if (!$valid) cmCmsError('The ' . $key . ' value is not supported.');
        $out[$key] = $value;
    }
    return $out ?: (object)[];
}
function cmCmsResponsive($input) {
    cmCmsObject($input, ['desktop','tablet','mobile'], 'Responsive styles'); $out = [];
    foreach ($input as $device => $styles) $out[$device] = cmCmsStyles($styles);
    return $out ?: (object)[];
}
function cmCmsAnimation($input) {
    cmCmsObject($input, ['type','duration','delay','easing'], 'Animation'); $out = [];
    if (isset($input['type'])) $out['type'] = cmCmsEnum($input['type'], ['none','fade','slide','scale'], 'animation');
    foreach (['duration','delay'] as $key) if (isset($input[$key])) $out[$key] = cmCmsNumber($input[$key], 0, 10000, true);
    if (isset($input['easing'])) $out['easing'] = cmCmsEnum($input['easing'], ['ease','linear','ease-in','ease-out','ease-in-out'], 'easing');
    return $out ?: (object)[];
}
function cmCmsEffects($input) {
    cmCmsObject($input, ['desktop','tablet','mobile'], 'Responsive effects'); $out = [];
    foreach ($input as $device => $effect) {
        cmCmsObject($effect, ['gradient','position','backgroundImage'], 'Visual effects'); $clean = [];
        if (isset($effect['gradient'])) {
            $g = cmCmsObject($effect['gradient'], ['enabled','start','end','angle'], 'Gradient');
            $start = $g['start'] ?? '#1565c0'; $end = $g['end'] ?? '#e91e63';
            if (!is_string($start) || !is_string($end) || !cmCmsColor($start) || !cmCmsColor($end)) cmCmsError('Choose valid gradient colors.');
            $clean['gradient'] = ['enabled'=>cmCmsBool($g['enabled'] ?? false, 'Gradient'), 'start'=>$start,'end'=>$end,'angle'=>cmCmsNumber($g['angle'] ?? 90, 0, 360)];
        }
        if (isset($effect['position'])) {
            $p = cmCmsObject($effect['position'], ['x','y','scale'], 'Visual position');
            $clean['position'] = ['x'=>cmCmsNumber($p['x'] ?? 0, -1000, 1000),'y'=>cmCmsNumber($p['y'] ?? 0, -1000, 1000),'scale'=>cmCmsNumber($p['scale'] ?? 1, 0.1, 5)];
        }
        if (isset($effect['backgroundImage'])) $clean['backgroundImage'] = cmCmsUrl($effect['backgroundImage'], true);
        $out[$device] = $clean ?: (object)[];
    }
    return $out ?: (object)[];
}
function cmCmsPromoMessages($input) {
    if (!is_array($input) || count($input) > 20 || array_values($input) !== $input) cmCmsError('Use a list of up to 20 promo messages.');
    $out = []; $seen = [];
    foreach ($input as $message) {
        cmCmsObject($message, ['id','text','enabled','icon'], 'Promo message');
        $id = cmCmsId($message['id'] ?? null, 'Promo message identifier');
        if (isset($seen[$id])) cmCmsError('Every promo message needs a unique identifier.');
        $seen[$id] = true;
        $out[] = ['id'=>$id,'text'=>cmCmsText($message['text'] ?? null, 300, 'Promo message'),
            'enabled'=>array_key_exists('enabled', $message) ? cmCmsBool($message['enabled'], 'Promo message visibility') : true,
            'icon'=>array_key_exists('icon', $message) ? cmCmsEnum($message['icon'], ['auto','tag','truck','shield','cash','bolt','none'], 'promo icon') : 'auto'];
    }
    return $out;
}
/* Category display order references the canonical catalog; names, counts,
   links and product memberships stay owned by the existing category records. */
function cmCmsCategoryOrder($input) {
    $categories = array_column(cmBaseData()['categories'] ?? [], 'id');
    if (!is_array($input) || array_values($input) !== $input || count($input) > count($categories)) cmCmsError('Use a list of existing categories for their order.');
    $seen = []; $out = [];
    foreach ($input as $id) {
        if (!is_string($id) || !in_array($id, $categories, true)) cmCmsError('An ordered category no longer exists. Reopen Reorder Categories before saving.');
        if (isset($seen[$id])) cmCmsError('A category can appear only once in its order.');
        $seen[$id] = true; $out[] = $id;
    }
    return $out;
}
function cmCmsBlockOrders($input) {
    $groups = ['layout'=>['filters','products'],'filters'=>['price','category','availability','clear'],'products'=>['toolbar','results','grid']];
    cmCmsObject($input, array_keys($groups), 'Product page block orders'); $out = [];
    foreach ($input as $group => $ids) {
        if (!is_array($ids) || array_values($ids) !== $ids || count($ids) > count($groups[$group])) cmCmsError('Use a list of existing page blocks for each group.');
        $seen = []; $out[$group] = [];
        foreach ($ids as $id) {
            if (!is_string($id) || !in_array($id, $groups[$group], true) || isset($seen[$id])) cmCmsError('Each page block must appear once in its original group.');
            $seen[$id] = true; $out[$group][] = $id;
        }
    }
    return $out ?: (object)[];
}
function cmCmsContent($input, $type = '', $promo = false, $homeCategories = false, $productBlocks = false) {
    $allowed = ['heading','text','src','alt','href','buttonText','newTab','icon','items','entries','productIds','category','limit','columns','cardStyle','imageRatio','showPrice','showSalePrice','showCart','showBadge','sort'];
    if ($promo) $allowed = array_merge($allowed, ['promoMessages','showPromoIcons']);
    if ($homeCategories) $allowed[] = 'categoryOrder';
    if ($productBlocks) $allowed[] = 'blockOrders';
    cmCmsObject($input, $allowed, 'Section content'); $out = [];
    if (array_key_exists('categoryOrder', $input)) $out['categoryOrder'] = cmCmsCategoryOrder($input['categoryOrder']);
    if (array_key_exists('blockOrders', $input)) $out['blockOrders'] = cmCmsBlockOrders($input['blockOrders']);
    if (array_key_exists('promoMessages', $input)) $out['promoMessages'] = cmCmsPromoMessages($input['promoMessages']);
    if (array_key_exists('showPromoIcons', $input)) $out['showPromoIcons'] = cmCmsBool($input['showPromoIcons'], 'Promo icon visibility');
    foreach (['heading','text','alt','buttonText'] as $key) if (isset($input[$key])) $out[$key] = cmCmsText($input[$key], $key === 'text' ? 30000 : 1000);
    foreach (['src','href'] as $key) if (isset($input[$key])) $out[$key] = $key === 'src' && $type === 'video' ? cmCmsVideoUrl($input[$key]) : cmCmsUrl($input[$key], $key === 'src');
    if (isset($input['icon'])) $out['icon'] = cmCmsIcon($input['icon']);
    foreach (['newTab','showPrice','showSalePrice','showCart','showBadge'] as $key) if (isset($input[$key])) $out[$key] = cmCmsBool($input[$key], $key);
    foreach (['limit'=>100,'columns'=>12] as $key => $max) if (isset($input[$key])) $out[$key] = cmCmsNumber($input[$key], 1, $max, true);
    foreach (['cardStyle'=>['default','compact','outlined'],'imageRatio'=>['square','portrait','landscape','auto'],'sort'=>['featured','price-asc','price-desc','newest','name']] as $key => $values) if (isset($input[$key])) $out[$key] = cmCmsEnum($input[$key], $values, $key);
    if (isset($input['category'])) {
        $categories = array_column(cmBaseData()['categories'] ?? [], 'id');
        $out['category'] = cmCmsEnum($input['category'], array_merge(['','all'], $categories), 'category');
    }
    if (isset($input['productIds'])) {
        if (!is_array($input['productIds']) || count($input['productIds']) > 100 || array_values($input['productIds']) !== $input['productIds']) cmCmsError('Select up to 100 products.');
        $products = cmProductMap(); $out['productIds'] = [];
        foreach ($input['productIds'] as $id) {
            $id = cmCmsNumber($id, 1, 9007199254740991, true);
            if (!isset($products[(string)$id])) cmCmsError('A selected product no longer exists.');
            $out['productIds'][] = $id;
        }
        $out['productIds'] = array_values(array_unique($out['productIds']));
    }
    if (isset($input['items'])) {
        if (!is_array($input['items']) || count($input['items']) > 80 || array_values($input['items']) !== $input['items']) cmCmsError('Use up to 80 FAQ entries.');
        $out['items'] = [];
        foreach ($input['items'] as $item) {
            cmCmsObject($item, ['question','answer'], 'FAQ item');
            $out['items'][] = ['question'=>cmCmsText($item['question'] ?? '', 2000), 'answer'=>cmCmsText($item['answer'] ?? '', 10000)];
        }
    }
    if (isset($input['entries'])) {
        if (!is_array($input['entries']) || count($input['entries']) > 60 || array_values($input['entries']) !== $input['entries']) cmCmsError('Use up to 60 content entries.');
        $out['entries'] = [];
        foreach ($input['entries'] as $entry) {
            cmCmsObject($entry, ['title','text','src','alt'], 'Content entry');
            $clean = ['title'=>cmCmsText($entry['title'] ?? '', 1000),'text'=>cmCmsText($entry['text'] ?? '', 10000)];
            if (isset($entry['src'])) $clean['src'] = cmCmsUrl($entry['src'], true);
            if (isset($entry['alt'])) $clean['alt'] = cmCmsText($entry['alt'], 2000);
            $out['entries'][] = $clean;
        }
    }
    return $out ?: (object)[];
}
function cmCmsOverrides($input, $promo = false) {
    cmCmsObject($input, ['desktop','tablet','mobile'], 'Device overrides'); $out = [];
    foreach ($input as $device => $value) {
        cmCmsObject($value, ['styles','effects','hidden','content','hover','animation'], 'Device presentation'); $clean = [];
        if (isset($value['styles'])) $clean['styles'] = cmCmsStyles($value['styles']);
        if (isset($value['effects'])) $clean['effects'] = ((array) cmCmsEffects([$device=>$value['effects']]))[$device];
        if (isset($value['hidden'])) $clean['hidden'] = cmCmsBool($value['hidden'], 'Device visibility');
        if (isset($value['hover'])) $clean['hover'] = cmCmsStyles($value['hover']);
        if (isset($value['animation'])) $clean['animation'] = cmCmsAnimation($value['animation']);
        if (isset($value['content'])) {
            $allowed = ['columns','cardStyle','imageRatio','showPrice','showSalePrice','showCart','showBadge'];
            if ($promo) $allowed[] = 'showPromoIcons';
            cmCmsObject($value['content'], $allowed, 'Device content presentation');
            $clean['content'] = cmCmsContent($value['content'], '', $promo);
        }
        $out[$device] = $clean ?: (object)[];
    }
    return $out ?: (object)[];
}
function cmCmsElement($input) {
    cmCmsObject($input, ['kind','name','text','src','alt','href','newTab','hidden','styles','hover','animation','effects','added','parentId','icon','overrides'], 'Element');
    $out = ['kind'=>cmCmsEnum($input['kind'] ?? '', ['text','heading','image','button','video','divider','icon','container'], 'element type'), 'name'=>cmCmsText($input['name'] ?? '', 200)];
    foreach (['text','alt'] as $key) if (isset($input[$key])) $out[$key] = cmCmsText($input[$key], $key === 'text' ? 30000 : 2000);
    foreach (['src','href'] as $key) if (isset($input[$key])) $out[$key] = $key === 'src' && $out['kind'] === 'video' ? cmCmsVideoUrl($input[$key]) : cmCmsUrl($input[$key], $key === 'src');
    if (isset($input['icon'])) $out['icon'] = cmCmsIcon($input['icon']);
    foreach (['hidden','newTab'] as $key) if (isset($input[$key])) $out[$key] = cmCmsBool($input[$key], $key);
    if (isset($input['added'])) $out['added'] = cmCmsBool($input['added'], 'Added element');
    if (!empty($out['added'])) $out['parentId'] = cmCmsId($input['parentId'] ?? 'eroot', 'Element container');
    elseif (isset($input['parentId'])) cmCmsError('Only an added element can choose a container.');
    if (isset($input['styles'])) $out['styles'] = cmCmsResponsive($input['styles']);
    if (isset($input['hover'])) $out['hover'] = cmCmsStyles($input['hover']);
    if (isset($input['animation'])) $out['animation'] = cmCmsAnimation($input['animation']);
    if (isset($input['effects'])) $out['effects'] = cmCmsEffects($input['effects']);
    if (isset($input['overrides'])) $out['overrides'] = cmCmsOverrides($input['overrides']);
    return $out;
}
function cmCmsSeo($input) {
    cmCmsObject($input, ['title','description','keywords','canonical','ogTitle','ogDescription','ogImage','robots'], 'SEO'); $out = [];
    foreach (['title','description','ogTitle','ogDescription'] as $key) if (isset($input[$key])) $out[$key] = cmCmsText($input[$key], 2000);
    if (isset($input['keywords'])) $out['keywords'] = cmCmsText($input['keywords'], 4000);
    if (isset($input['canonical'])) $out['canonical'] = cmCmsUrl($input['canonical'], false, true);
    if (isset($input['ogImage'])) $out['ogImage'] = cmCmsUrl($input['ogImage'], true);
    if (isset($input['robots'])) {
        $value = str_replace(' ', '', cmCmsText($input['robots'], 100));
        if ($value !== '') foreach (explode(',', $value) as $word) cmCmsEnum($word, ['index','noindex','follow','nofollow','noarchive','nosnippet','noimageindex','max-image-preview:large','max-image-preview:standard','max-image-preview:none'], 'robots instruction');
        $out['robots'] = $value;
    }
    return $out ?: (object)[];
}
function cmCmsDesign($input) {
    cmCmsObject($input, ['primary','text','background','fontFamily','headingFont','radius','containerWidth'], 'Design'); $out = [];
    foreach ($input as $key => $value) {
        if ($value === '') continue;
        if (!is_string($value)) cmCmsError('A design value is invalid.');
        if (in_array($key, ['primary','text','background'], true)) { if (!cmCmsColor($value)) cmCmsError('Choose a valid design color.'); }
        elseif (in_array($key, ['fontFamily','headingFont'], true)) cmCmsEnum($value, ['Inter','Sora','Plus Jakarta Sans','system-ui','Georgia'], 'font');
        elseif (!cmCmsLength($value)) cmCmsError('Choose a valid design size.');
        $out[$key] = $value;
    }
    return $out ?: (object)[];
}
/* Product display order. Scopes are:
     'all'                  independent All Products order
     '<category id>'        one existing category, as before
     'section:<section id>' one product section on any page, used when a Home
                            page product grid is reordered. It lives in this same
                            map and the same document, so saving, publishing,
                            revisions and version checks are unchanged; a section
                            may legitimately span categories, so the per-category
                            membership rule does not apply to it. */
function cmCmsSectionScope($scope) {
    return is_string($scope) && (bool) preg_match('/^section:[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/D', $scope);
}
function cmCmsProductOrders($input) {
    if (!is_array($input)) cmCmsError('Product ordering must be an object.');
    $categories = array_column(cmBaseData()['categories'] ?? [], 'id');
    foreach (array_keys((array) $input) as $scope) {
        if ($scope !== 'all' && !in_array($scope, $categories, true) && !cmCmsSectionScope((string) $scope))
            cmCmsError('Unknown product ordering scope.');
    }
    $products = cmProductMap(); $out = []; $total = 0;
    foreach ($input as $scope => $ids) {
        if (!is_array($ids) || array_values($ids) !== $ids || count($ids) > 5000) cmCmsError('Use a list of up to 5,000 products for each order.');
        $total += count($ids);
        if ($total > 50000) cmCmsError('This page has too many product ordering entries.');
        $seen = []; $out[$scope] = [];
        foreach ($ids as $raw) {
            $id = cmCmsNumber($raw, 1, 9007199254740991, true);
            if (isset($seen[$id])) cmCmsError('A product can appear only once in each order.');
            $seen[$id] = true;
            $product = $products[(string)$id] ?? null;
            if ($product === null || !empty($product['disabled'])) cmCmsError('The product catalog changed. Reopen Reorder Products to refresh the order before saving.');
            $memberships = is_array($product['cats'] ?? null) ? $product['cats'] : [];
            if (!cmCmsSectionScope((string) $scope) && $scope !== 'all' && !in_array($scope, $memberships, true)) cmCmsError('An ordered product no longer belongs to this category. Reopen Reorder Products before saving.');
            $out[$scope][] = $id;
        }
    }
    return $out ?: (object)[];
}
function cmCmsAccountPath($key, $blocked) {
    if (!is_string($key)) return false;
    // Native element IDs encode DOM ancestry. Match whole path components so
    // the account root e0.4.3 cannot also remove its public sibling e0.4.30.
    while (true) {
        if (isset($blocked[$key])) return true;
        $dot = strrpos($key, '.');
        if ($dot === false) return false;
        $key = substr($key, 0, $dot);
    }
}
function cmCmsWithoutAccountContent($document) {
    if (!is_array($document) || !is_array($document['sections'] ?? null)) return $document;
    foreach ($document['sections'] as $index => $section) {
        if (!is_array($section) || ($section['type'] ?? '') !== 'native'
            || ($section['source'] ?? '') !== 'global:header' || !is_array($section['elements'] ?? null)) continue;
        $elements = $section['elements'];
        // The current template's accountArea path also covers old snapshots
        // whose account container was omitted or renamed. Historical layouts
        // used other paths, identified by their captured DOM IDs/class names.
        // This removes identifiable account UI, not arbitrary personal text.
        $blocked = ['e0.4.3'=>true];
        foreach ($elements as $key => $element) {
            if ($key === 'eroot' || !is_array($element) || !is_string($element['name'] ?? null)) continue;
            $name = preg_replace('/[^a-z0-9]/', '', strtolower($element['name']));
            if (strpos($name, 'accountmenu') === 0 || in_array($name, ['accountarea','accountchip','accountlabel','accountadminslot','usericonbtn','menuemail','menuavatar','avatartext'], true)) $blocked[$key] = true;
        }
        do {
            $removed = false;
            foreach ($elements as $key => $element) {
                $parent = is_array($element) && !empty($element['added']) ? ($element['parentId'] ?? null) : null;
                if (!cmCmsAccountPath((string)$key, $blocked) && !cmCmsAccountPath($parent, $blocked)) continue;
                // Drop the entire descriptor: captured account text is also
                // copied into its name, and added descendants can refer to it.
                $blocked[$key] = true; unset($elements[$key]); $removed = true;
            }
        } while ($removed);
        $document['sections'][$index]['elements'] = $elements;
    }
    return $document;
}
function cmCmsWithoutAccountRecord($record) {
    if (!is_array($record)) return $record;
    foreach (['draft','published'] as $key) if (array_key_exists($key, $record)) $record[$key] = cmCmsWithoutAccountContent($record[$key]);
    // Old monolithic records may keep revision documents inline.
    if (is_array($record['revisions'] ?? null)) foreach ($record['revisions'] as $index => $revision) {
        if (is_array($revision) && array_key_exists('document', $revision)) $record['revisions'][$index]['document'] = cmCmsWithoutAccountContent($revision['document']);
    }
    return $record;
}
function cmCmsDocument($input, $page, $templatePage = null) {
    cmCmsObject($input, ['schemaVersion','id','sections','seo','design','templatePage','productOrders','categoryOrder'], 'Page');
    $input = cmCmsWithoutAccountContent($input);
    if (isset($input['templatePage']) && $input['templatePage'] !== ($templatePage ?: $page)) cmCmsError('This page must retain its original template.');
    if (($input['schemaVersion'] ?? null) !== 1 || ($input['id'] ?? '') !== $page) cmCmsError('This page document does not match the selected page.');
    $sections = $input['sections'] ?? null;
    if (!is_array($sections) || count($sections) > 80 || array_values($sections) !== $sections) cmCmsError('Use a valid list of up to 80 sections.');
    $out = ['schemaVersion'=>1,'id'=>$page,'sections'=>[],'seo'=>cmCmsSeo($input['seo'] ?? []),'design'=>cmCmsDesign($input['design'] ?? [])];
    if (isset($input['templatePage'])) $out['templatePage'] = $input['templatePage'];
    if (array_key_exists('productOrders', $input)) {
        if (!in_array(($templatePage ?: $page), ['products','home'], true)) cmCmsError('Product ordering belongs to the Home or Products page.');
        $out['productOrders'] = cmCmsProductOrders($input['productOrders']);
    }
    foreach ((array)($out['productOrders'] ?? []) as $scope => $ids) {
        if (cmCmsSectionScope($scope)) {
            $sectionId = substr($scope, 8); $matches = array_values(array_filter($sections, fn($entry) => ($entry['id'] ?? '') === $sectionId && (in_array($entry['type'] ?? '', ['native','productGrid'], true))));
            if (!$matches) cmCmsError('Product ordering needs an existing product section.');
        } elseif (($templatePage ?: $page) !== 'products') cmCmsError('Home product ordering must belong to a section.');
    }
    /* One global category order, owned by the Home document and stored the way
       product ordering is stored. An empty list is a deliberate reset to the
       catalog order, so it stays a valid value rather than a missing field. */
    if (array_key_exists('categoryOrder', $input)) {
        if (($templatePage ?: $page) !== 'home') cmCmsError('Category ordering belongs to the Home page.');
        $out['categoryOrder'] = cmCmsCategoryOrder($input['categoryOrder']);
    }
    $seen = []; $seenGlobals = []; $totalElements = 0;
    foreach ($sections as $section) {
        cmCmsObject($section, ['id','type','source','region','name','hidden','content','elements','styles','hover','animation','effects','overrides'], 'Section');
        $id = cmCmsId($section['id'] ?? '', 'Section identifier');
        if (isset($seen[$id])) cmCmsError('Every section needs a unique identifier.');
        $seen[$id] = true;
        $type = cmCmsEnum($section['type'] ?? '', ['native','text','heading','image','button','video','divider','icon','container','banner','productGrid','faq','hero','imageText','features','testimonials','contact','custom'], 'section type');
        if (in_array($id, ['global:promo','global:header','global:footer'], true)
            && ($type !== 'native' || ($section['source'] ?? '') !== $id)) cmCmsError('Global component identifiers belong to their original sections.');
        $promo = $type === 'native' && ($section['source'] ?? null) === 'global:promo';
        $homeCategories = $type === 'native' && ($section['source'] ?? null) === 'home:shop-categories' && ($templatePage ?: $page) === 'home';
        $productBlocks = $type === 'native' && ($section['source'] ?? null) === 'products:shop-layout' && ($templatePage ?: $page) === 'products';
        $clean = ['id'=>$id,'type'=>$type,'region'=>cmCmsEnum($section['region'] ?? 'main', ['main','header','footer'], 'section region'),'name'=>cmCmsText($section['name'] ?? '', 200),'hidden'=>cmCmsBool($section['hidden'] ?? false, 'Section visibility'),'content'=>cmCmsContent($section['content'] ?? [], $type, $promo, $homeCategories, $productBlocks),'elements'=>[],'styles'=>cmCmsResponsive($section['styles'] ?? []),'hover'=>cmCmsStyles($section['hover'] ?? []),'animation'=>cmCmsAnimation($section['animation'] ?? [])];
        if (isset($section['effects'])) $clean['effects'] = cmCmsEffects($section['effects']);
        if (isset($section['overrides'])) $clean['overrides'] = cmCmsOverrides($section['overrides'], $promo);
        if (isset($section['source'])) $clean['source'] = cmCmsId($section['source'], 'Original section');
        if ($clean['type'] === 'native' && empty($clean['source'])) cmCmsError('An existing section needs its original section reference.');
        if ($clean['type'] === 'native') {
            $source = $clean['source'];
            $globalRegions = ['global:promo'=>'header','global:header'=>'header','global:footer'=>'footer'];
            if (isset($globalRegions[$source])) {
                if (isset($seenGlobals[$source])) cmCmsError('Each global component can appear only once.');
                $seenGlobals[$source] = true;
            }
            $nativePage = $templatePage ?: $page;
            $expectedRegion = $globalRegions[$source] ?? (strpos($source, $nativePage . ':') === 0 ? 'main' : null);
            if ($expectedRegion === null || $clean['region'] !== $expectedRegion) cmCmsError('An existing section must belong to this page and its original region.');
        } elseif ($clean['region'] !== 'main') cmCmsError('Add new content inside the page content region.');
        $elements = $section['elements'] ?? [];
        if (!is_array($elements) || count($elements) > 300) cmCmsError('This section has too many elements.');
        foreach ($elements as $key => $element) { $key = cmCmsId($key, 'Element identifier'); $clean['elements'][$key] = cmCmsElement($element); $totalElements++; }
        // Added content stays inside a known container in its own section. Native
        // IDs cannot be reused by insertions, and cycles cannot reach the renderer.
        foreach ($clean['elements'] as $key => $element) if (!empty($element['added'])) {
            if (strpos($key, 'a-') !== 0) cmCmsError('An added element needs its own identifier.');
            $parent = $element['parentId']; $parents = [$key=>true];
            while ($parent !== 'eroot') {
                if (isset($parents[$parent])) cmCmsError('An element cannot contain itself.');
                $parents[$parent] = true;
                if (count($parents) > 20) cmCmsError('Use fewer nested containers.');
                $container = $clean['elements'][$parent] ?? null;
                if ($container === null || $container['kind'] !== 'container') cmCmsError('Choose an existing container for this element.');
                if (empty($container['added'])) break;
                $parent = $container['parentId'];
            }
        }
        if ($totalElements > 2000) cmCmsError('This page has too many editable elements.');
        if (!$clean['elements']) $clean['elements'] = (object)[];
        $out['sections'][] = $clean;
    }
    if (strlen(json_encode($out)) > 1048576) cmCmsError('This page is too large to save.');
    return $out;
}
function cmCmsBuiltinPages() {
    $pages = [
        ['home','Home','#/','/'], ['products','Products','#/products','/products'], ['product','Product details','#/products','/products'],
        ['price-list','Price list','#/price-list','/price-list'], ['about','About','#/about','/about'], ['contact','Contact','#/contact','/contact'],
        ['faq','FAQ','#/faq','/faq'], ['wholesale','Wholesale','#/wholesale','/wholesale'], ['shipping','Shipping','#/shipping','/shipping'],
        ['returns','Returns','#/returns','/returns'], ['safety','Safety','#/safety','/safety'], ['terms','Terms','#/terms','/terms'], ['privacy','Privacy','#/privacy','/privacy']
    ];
    foreach (cmProductMap() as $product) if (empty($product['disabled'])) { $slug = (string)($product['slug'] ?? ''); if ($slug === '') $slug = 'p-' . (int)$product['id']; $pages[2][2] = '#/product/' . rawurlencode($slug); $pages[2][3] = '/product/' . rawurlencode($slug); break; }
    return array_map(function($p) { return ['id'=>$p[0],'name'=>$p[1],'hash'=>$p[2],'path'=>$p[3]]; }, $pages);
}
function cmCmsRegistry() {
    $registry = cmReadJson(cmDataDir() . '/cms-registry.json', ['pages'=>[]]);
    if (!is_array($registry['pages'] ?? null) || count($registry['pages']) > 100) cmRespond(503, ['ok'=>false,'error'=>'The page registry is temporarily unavailable.']);
    return $registry;
}
function cmCmsPageInfo($id, $record = null) {
    $custom = strpos($id, 'custom-') === 0;
    $builtin = null;
    if (!$custom) foreach (cmCmsBuiltinPages() as $entry) if ($entry['id'] === $id) { $builtin = $entry; break; }
    if ($record === null) $record = cmCmsRecord(cmCmsStore($id), $id);
    $meta = $record['meta'] ?? [];
    $slug = $custom ? (string)($meta['slug'] ?? '') : ltrim($builtin['path'] ?? '', '/');
    $protected = in_array($id, ['home','products','product','price-list'], true);
    return ['id'=>$id,'name'=>$meta['name'] ?? ($builtin['name'] ?? 'Page'),'slug'=>$slug,'path'=>$custom ? '/' . $slug : $builtin['path'],'hash'=>$custom ? '#/page/' . $slug : $builtin['hash'],
        'status'=>$record['status'] ?? ($custom ? 'draft' : 'published'),'custom'=>$custom,'canDelete'=>!$protected,'canUnpublish'=>!$protected,'templatePage'=>$meta['templatePage'] ?? ($custom ? 'custom' : $id),'version'=>$record['version']];
}
function cmCmsPages() {
    $pages = [];
    foreach (array_merge(array_column(cmCmsBuiltinPages(), 'id'), array_keys(cmCmsRegistry()['pages'])) as $id) {
        $info = cmCmsPageInfo($id);
        if ($info['status'] !== 'deleted') $pages[] = $info;
    }
    return $pages;
}
function cmCmsStorageId($value) {
    if (!is_string($value) || (!in_array($value, cmCmsBuiltinPageIds(), true) && !preg_match('/^custom-[a-f0-9]{32}$/D', $value))) cmCmsError('Choose a valid website page.');
    return $value;
}
function cmCmsPage($value) {
    cmCmsStorageId($value);
    if (strpos($value, 'custom-') === 0 && !isset(cmCmsRegistry()['pages'][$value])) cmRespond(404, ['ok'=>false,'error'=>'This page could not be found.']);
    return $value;
}
function cmCmsBuiltinPageIds() { return ['home','products','product','price-list','about','contact','faq','wholesale','shipping','returns','safety','terms','privacy']; }
function cmCmsPageIds() { return array_merge(cmCmsBuiltinPageIds(), array_keys(cmCmsRegistry()['pages'])); }
function cmCmsSlug($value) {
    if (!is_string($value) || strlen($value) > 80 || !preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $value)) cmCmsError('Use lowercase letters, numbers and hyphens for the page URL.');
    $reserved = array_merge(cmCmsBuiltinPageIds(), ['page','categories','offers','cart','checkout','order','orders','my-orders','account','login','logout','register','staff','admin','track','api','images','uploads','css','js','data','robots','sitemap','visual-editor','visual-preview','cms','index','cms-api','cms-page','cms-media','customer-auth','staff-auth']);
    if (in_array($value, $reserved, true) || is_file(__DIR__ . '/' . $value) || is_dir(__DIR__ . '/' . $value)) cmCmsError('That URL belongs to an existing website feature. Choose a different URL.');
    return $value;
}
function cmCmsPageName($value) {
    $name = trim(cmCmsText($value, 200, 'Page name'));
    if ($name === '') cmCmsError('Enter a page name.');
    return $name;
}
function cmCmsStarter($page, $name) {
    $sections = [];
    foreach ([['promo','Announcement','header'],['header','Header','header']] as $global) $sections[] = ['id'=>'global:' . $global[0],'source'=>'global:' . $global[0],'type'=>'native','region'=>$global[2],'name'=>$global[1],'hidden'=>false,'content'=>[], 'elements'=>[], 'styles'=>[], 'hover'=>[], 'animation'=>[]];
    $sections[] = ['id'=>'s-' . bin2hex(random_bytes(12)),'type'=>'text','region'=>'main','name'=>$name,'hidden'=>false,'content'=>['heading'=>$name,'text'=>''],'elements'=>[],'styles'=>[],'hover'=>[],'animation'=>[]];
    $sections[] = ['id'=>'global:footer','source'=>'global:footer','type'=>'native','region'=>'footer','name'=>'Footer','hidden'=>false,'content'=>[],'elements'=>[],'styles'=>[],'hover'=>[],'animation'=>[]];
    return cmCmsDocument(['schemaVersion'=>1,'id'=>$page,'templatePage'=>'custom','sections'=>$sections,'seo'=>[],'design'=>[]], $page, 'custom');
}
function cmCmsPrivateDir($name) {
    $dir = cmDataDir() . '/' . $name;
    if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) cmRespond(503, ['ok'=>false,'error'=>'Website content storage is temporarily unavailable.']);
    return $dir;
}
function cmCmsJsonMaps($value, $key = '') {
    // PHP associative decoding cannot distinguish {} from []. Restore only
    // documented object fields; sections, FAQ entries and product IDs stay lists.
    if (!is_array($value)) return $value;
    if (!$value && in_array($key, ['styles','desktop','tablet','mobile','effects','gradient','position','hover','animation','elements','seo','design','content','productOrders','overrides'], true)) return (object)[];
    $out = [];
    foreach ($value as $childKey => $child) $out[$childKey] = cmCmsJsonMaps($child, (string)$childKey);
    return $out;
}
function cmCmsStore($page = null) {
    // Read one current page for normal requests. Old monolithic stores remain readable.
    $store = ['schemaVersion'=>1,'pages'=>[]];
    $ids = $page === null ? cmCmsPageIds() : [cmCmsPage($page)];
    $legacy = null;
    foreach ($ids as $id) {
        $path = cmDataDir() . '/cms-pages/' . $id . '.json';
        if (is_file($path)) $store['pages'][$id] = cmReadJson($path);
        elseif (is_file(cmDataDir() . '/cms-pages.json')) {
            if ($legacy === null) $legacy = cmReadJson(cmDataDir() . '/cms-pages.json', ['schemaVersion'=>1,'pages'=>[]]);
            if (isset($legacy['pages'][$id])) $store['pages'][$id] = $legacy['pages'][$id];
        }
        // Protect reads immediately, including publication of an existing
        // draft without a new document. Reading never rewrites stored history.
        if (isset($store['pages'][$id])) $store['pages'][$id] = cmCmsWithoutAccountRecord($store['pages'][$id]);
    }
    if (($store['schemaVersion'] ?? null) !== 1 || !is_array($store['pages'] ?? null)) cmRespond(503, ['ok'=>false,'error'=>'Website content is temporarily unavailable.']);
    return $store;
}
function cmCmsReadRevision($page, $revision) {
    if (isset($revision['document']) && is_array($revision['document'])) return cmCmsWithoutAccountContent($revision['document']);
    $id = $revision['id'] ?? '';
    if (!is_string($id) || !preg_match('/^r-[a-f0-9]{24}$/D', $id)) return null;
    $path = cmDataDir() . '/cms-revisions/' . cmCmsPage($page) . '/' . $id . '.json';
    return is_file($path) ? cmCmsWithoutAccountContent(cmReadJson($path)) : null;
}
function cmCmsWriteRevision($page, $revision, $document) {
    $dir = cmCmsPrivateDir('cms-revisions/' . cmCmsStorageId($page));
    if (is_file(cmDataDir() . '/cms-global-components.json')) $document = cmCmsWithoutGlobals($document);
    return cmWriteJson($dir . '/' . $revision['id'] . '.json', cmCmsJsonMaps(cmCmsWithoutAccountContent($document)));
}
function cmCmsWriteRecord($page, $record) {
    if (is_file(cmDataDir() . '/cms-global-components.json')) foreach (['draft','published'] as $key) if (array_key_exists($key, $record)) $record[$key] = cmCmsWithoutGlobals($record[$key]);
    return cmWriteJson(cmCmsPrivateDir('cms-pages') . '/' . cmCmsStorageId($page) . '.json', cmCmsJsonMaps(cmCmsWithoutAccountRecord($record)));
}
function cmCmsRecord($store, $page) {
    return $store['pages'][$page] ?? ['version'=>0,'draft'=>null,'published'=>null,'savedAt'=>null,'publishedAt'=>null,'publishedVersion'=>0,'revisions'=>[]];
}
// Global chrome uses normal section validation, with one draft/publication for
// the whole site. Page responses compose it; page storage never owns its copies.
function cmCmsGlobalSection($document, $role) {
    $document = cmCmsWithoutAccountContent($document);
    foreach ($document['sections'] ?? [] as $section) {
        if (($section['type'] ?? '') !== 'native' || ($section['source'] ?? '') !== 'global:' . $role) continue;
        $section['id'] = 'global:' . $role;
        $section += ['name'=>'','hidden'=>false,'content'=>[],'elements'=>[],'styles'=>[],'hover'=>[],'animation'=>[]];
        foreach ($section['elements'] as &$element) if (is_array($element) && !isset($element['name'])) $element['name'] = '';
        unset($element);
        // Validation emits empty JSON objects; persisted associative reads use
        // empty arrays. Compare the same representation to avoid false edits.
        return json_decode(json_encode($section), true);
    }
    return null;
}
function cmCmsHeaderSection($document) { return cmCmsGlobalSection($document, 'header'); }
function cmCmsWithoutGlobals($document) {
    if (!is_array($document)) return $document;
    $document['sections'] = array_values(array_filter($document['sections'] ?? [], function($section) {
        return ($section['type'] ?? '') !== 'native' || !in_array($section['source'] ?? '', ['global:promo','global:header','global:footer'], true);
    }));
    return $document;
}
function cmCmsGlobalRecord() {
    $path = cmDataDir() . '/cms-global-components.json';
    if (is_file($path)) {
        $record = cmReadJson($path);
        if (!is_int($record['version'] ?? null) || $record['version'] < 0 || !is_array($record['draft'] ?? null) || !is_array($record['published'] ?? null)) cmRespond(503, ['ok'=>false,'error'=>'Global website content is temporarily unavailable.']);
        foreach (['draft','published'] as $kind) foreach (['promo','header','footer'] as $role) {
            $section = $record[$kind][$role] ?? null;
            $record[$kind][$role] = is_array($section) ? cmCmsGlobalSection(['sections'=>[$section]], $role) : null;
        }
        return $record;
    }
    // Legacy inputs are consulted only until the first authenticated write
    // commits the canonical record. Public reads never migrate stored content.
    $home = cmCmsRecord(cmCmsStore('home'), 'home');
    $oldPath = cmDataDir() . '/cms-global-header.json';
    $old = is_file($oldPath) ? cmReadJson($oldPath) : null;
    $record = ['version'=>(int)($old['version'] ?? 0),'draft'=>[],'published'=>[],'savedAt'=>$old['savedAt'] ?? null,'publishedAt'=>$old['publishedAt'] ?? null];
    foreach (['draft','published'] as $kind) foreach (['promo','header','footer'] as $role) {
        $document = $kind === 'draft' ? ($home['draft'] ?? $home['published']) : $home['published'];
        $record[$kind][$role] = $role === 'header' && $old !== null
            ? (is_array($old[$kind] ?? null) ? cmCmsHeaderSection(['sections'=>[$old[$kind]]]) : null)
            : cmCmsGlobalSection($document, $role);
    }
    return $record;
}
function cmCmsHeaderRecord() {
    $record = cmCmsGlobalRecord();
    return ['version'=>$record['version'],'draft'=>$record['draft']['header'],'published'=>$record['published']['header'],'savedAt'=>$record['savedAt'],'publishedAt'=>$record['publishedAt']];
}
function cmCmsOverlayGlobals($document, $globals) {
    if (!is_array($document)) return $document;
    $document = cmCmsWithoutGlobals($document);
    $before = [];
    foreach (['promo','header'] as $role) if (is_array($globals[$role] ?? null)) $before[] = $globals[$role];
    $document['sections'] = array_merge($before, $document['sections']);
    if (is_array($globals['footer'] ?? null)) $document['sections'][] = $globals['footer'];
    return $document;
}
function cmCmsOverlayHeader($document, $header) {
    if (!is_array($document) || !is_array($header)) return $document;
    foreach ($document['sections'] as $index => $section) if (($section['type'] ?? '') === 'native' && ($section['source'] ?? '') === 'global:header') {
        $document['sections'][$index] = $header;
        $document['sections'][$index]['id'] = $section['id'];
    }
    // The runtime overlays onto the native baseline when a page has no header
    // descriptor. Keep unrelated saved page snapshots structurally intact.
    $document['sections'] = array_values($document['sections']);
    return $document;
}
function cmCmsHomeCategoryOrder($home) {
    if (is_array($home['categoryOrder'] ?? null)) return $home['categoryOrder'];
    $document = $home['published'] ?? null;
    if (is_array($document['categoryOrder'] ?? null)) return $document['categoryOrder'];
    foreach ($document['sections'] ?? [] as $section) if (($section['source'] ?? '') === 'home:shop-categories' && is_array($section['content']['categoryOrder'] ?? null)) return $section['content']['categoryOrder'];
    return null;
}
function cmCmsGlobals($published = false) {
    $record = cmCmsGlobalRecord();
    $home = cmCmsRecord(cmCmsStore('home'), 'home');
    $globals = cmCmsJsonMaps($record[$published ? 'published' : 'draft']);
    return array_merge($globals, ['version'=>$record['version'],'headerVersion'=>$record['version'],'categoryOrder'=>cmCmsHomeCategoryOrder($home)]);
}
function cmCmsSetCategoryOrder($document, $order) {
    if (!is_array($document)) return $document;
    $document['categoryOrder'] = $order;
    foreach ($document['sections'] as &$section) {
        if (($section['source'] ?? '') !== 'home:shop-categories') continue;
        // Validation represents an empty content map as stdClass, while stored
        // JSON reads use arrays. Remove only the legacy order in either form.
        if (is_array($section['content'] ?? null)) unset($section['content']['categoryOrder']);
        elseif (is_object($section['content'] ?? null)) {
            $section['content'] = clone $section['content'];
            unset($section['content']->categoryOrder);
        }
    }
    unset($section);
    return $document;
}
function cmCmsCompleteCategoryOrder($input) {
    $order = cmCmsCategoryOrder($input);
    $expected = array_map(function($category) { return (string)$category['id']; }, cmBaseData()['categories'] ?? []);
    $a = $order; $b = $expected; sort($a); sort($b);
    if ($a !== $b) cmCmsError('The category catalog changed. Reopen Reorder Categories and include every category once.');
    return $order;
}
function cmCmsPrepareGlobals($document, $action, $expected, $legacyExpected = null) {
    $shared = cmCmsGlobalRecord();
    // Restoring a page deliberately restores only its own content. Archived
    // global snapshots are never candidates for the current global draft.
    if ($action === 'restore') {
        $migrate = !is_file(cmDataDir() . '/cms-global-components.json');
        if ($migrate) { $shared['version']++; $shared['savedAt'] = gmdate('c'); }
        return [$shared, $migrate];
    }
    $token = $expected ?? $legacyExpected;
    $code = $expected === null && $legacyExpected !== null ? 'stale-header' : 'stale-global';
    if ($token !== null && $token !== $shared['version']) cmRespond(409, ['ok'=>false,'code'=>$code,'error'=>'Global website components changed in another editor. Reload before saving or publishing.']);
    $changed = false;
    foreach (['promo','header','footer'] as $role) {
        $incoming = cmCmsGlobalSection($document, $role);
        if ($incoming === null || $incoming == $shared['draft'][$role]) continue;
        // Old header-aware clients cannot promote their per-page promo/footer
        // snapshots to globals. Unguarded clients may only initialize an empty
        // installation; established global changes always require a token.
        if ($expected === null && ($legacyExpected !== null && $role !== 'header'
            || $legacyExpected === null && ($shared['version'] > 0 || $shared['draft'][$role] !== null))) {
            cmRespond(409, ['ok'=>false,'code'=>'stale-global','error'=>'Reload the editor before changing global website components.']);
        }
        $shared['draft'][$role] = $incoming; $changed = true;
    }
    if ($action === 'publish' && $shared['draft'] != $shared['published']) {
        // A publish without a global token may publish an unchanged legacy
        // page, but must not silently publish another editor's global draft.
        if ($token === null) cmRespond(409, ['ok'=>false,'code'=>'stale-global','error'=>'Reload the editor before publishing global website components.']);
        $shared['published'] = $shared['draft']; $shared['publishedAt'] = gmdate('c'); $changed = true;
    }
    if (!is_file(cmDataDir() . '/cms-global-components.json')) $changed = true;
    if ($changed) { $shared['version']++; $shared['savedAt'] = gmdate('c'); }
    return [$shared, $changed];
}
function cmCmsRestoreGlobalBytes($path, $before) {
    if ($before === null) return !is_file($path) || @unlink($path);
    $tmp = $path . '.' . bin2hex(random_bytes(8)) . '.tmp';
    if (@file_put_contents($tmp, $before, LOCK_EX) !== strlen($before)) { @unlink($tmp); return false; }
    @chmod($tmp, 0640);
    if (!@rename($tmp, $path)) { @unlink($tmp); return false; }
    return true;
}
function cmCmsResponse($page, $record) {
    $globals = cmCmsGlobals(); $publishedGlobals = cmCmsGlobals(true);
    $draft = cmCmsOverlayGlobals($record['draft'], $globals);
    $published = cmCmsOverlayGlobals($record['published'], $publishedGlobals);
    if ($page === 'home' && is_array($record['categoryOrder'] ?? null)) {
        $draft = cmCmsSetCategoryOrder($draft, $record['categoryOrder']);
        $published = cmCmsSetCategoryOrder($published, $record['categoryOrder']);
    }
    return ['ok'=>true,'page'=>$page,'pageInfo'=>cmCmsPageInfo($page, $record),'version'=>$record['version'],'draft'=>cmCmsJsonMaps($draft),'published'=>cmCmsJsonMaps($published),'savedAt'=>$record['savedAt'],'publishedAt'=>$record['publishedAt'],
        'globals'=>$globals,'categoryOrder'=>$globals['categoryOrder']];
}
function cmCmsContextMeta($info) {
    $html = '';
    foreach (['id'=>'id','template'=>'templatePage','name'=>'name','slug'=>'slug'] as $suffix => $key) $html .= '<meta name="cm-page-' . $suffix . '" content="' . htmlspecialchars((string)($info[$key] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '">' . "\n";
    return $html;
}
function cmCmsPageForSlug($slug) {
    if (!is_string($slug) || strlen($slug) > 80 || !preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $slug)) return null;
    foreach (cmCmsBuiltinPages() as $page) if ($page['path'] === '/' . $slug) return $page['id'];
    foreach (cmCmsRegistry()['pages'] as $id => $meta) if (($meta['slug'] ?? '') === $slug) return $id;
    return null;
}
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) cmRespond(404, ['ok'=>false,'error'=>'Not found.']);
