<?php
/* Public first paint for editorial pages. Read only the published CMS document;
   shared copy is strict JSON, never JavaScript evaluated by the PHP server. */
require_once __DIR__ . '/cm-cms.php';
require_once __DIR__ . '/cm-seo.php';
require_once __DIR__ . '/cm-product-brand.php';
require_once __DIR__ . '/cm-page-products.php';

function cmPageEscape($value) { return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function cmPageResource() {
    static $resource;
    if ($resource !== null) return $resource;
    $raw = @file_get_contents(__DIR__ . '/js/page-content.js');
    if (!is_string($raw) || !preg_match('/window\.CM_PAGE_CONTENT\s*=\s*(\{.*\})\s*;?\s*$/s', $raw, $match)) return $resource = [];
    $decoded = json_decode($match[1], true, 32);
    return $resource = is_array($decoded) ? $decoded : [];
}
function cmPageHydrate($html, $resource) {
    $store = cmBaseData()['store'] ?? [];
    return preg_replace_callback('/\{\{CM:(icon|store)\.([a-zA-Z0-9.]+)\}\}/', function($match) use ($resource, $store) {
        if ($match[1] === 'icon') return $resource['icons'][$match[2]] ?? '';
        $value = $store; foreach (explode('.', $match[2]) as $part) $value = is_array($value) ? ($value[$part] ?? '') : '';
        return cmPageEscape(is_scalar($value) ? $value : '');
    }, (string)$html);
}
function cmPageMoney($value) {
    $digits = (string)(int)floor((float)$value + 0.5);
    if (strlen($digits) > 3) { $tail = substr($digits, -3); $head = substr($digits, 0, -3); $digits = preg_replace('/\B(?=(\d{2})+(?!\d))/', ',', $head) . ',' . $tail; }
    return '₹' . $digits;
}
function cmPagePriceList($resource) {
    $categories = cmBaseData()['categories'] ?? []; $options = ''; $rows = '';
    foreach ($categories as $category) $options .= '<option value="' . cmPageEscape($category['id']) . '">' . cmPageEscape($category['name']) . '</option>';
    foreach (cmProductMap() as $product) {
        if (!empty($product['disabled'])) continue;
        $price = (float)($product['price'] ?? 0); $compare = (float)($product['compareAt'] ?? 0);
        $discount = $compare > $price ? (int)floor((1 - $price / $compare) * 100 + 0.5) : 0;
        $stock = (float)($product['stock'] ?? 0) > 0 && !empty($product['inStock']);
        $category = cmSeoCategoryFor($product, $categories);
        $rows .= '<tr><td class="row-name" style="max-width:340px">' . cmProductBrandPill($product, true) . '<a href="' . cmPageEscape(cmSeoUrl($product)) . '">' . cmPageEscape($product['shortName'] ?? $product['name']) . '</a></td>'
            . '<td>' . cmPageEscape($category['name'] ?? 'Products') . '</td><td style="text-align:right">' . ($compare > $price ? cmPageMoney($compare) : '—') . '</td>'
            . '<td style="text-align:right;font-weight:800;color:var(--primary-deep)">' . cmPageMoney($price) . '</td><td style="text-align:right;color:var(--success);font-weight:700">' . ($discount ? '-' . $discount . '%' : '—') . '</td>'
            . '<td style="text-align:center"><span class="tag ' . ($stock ? 'in' : 'out') . '">' . ($stock ? 'In stock' : 'Out') . '</span></td></tr>';
    }
    $rows = str_replace(['<tr><td','</td><td','</td></tr>'], ["<tr>\n        <td","</td>\n        <td","</td>\n      </tr>"], $rows);
    return cmPageHydrate(strtr($resource['priceList'] ?? '', ['{{CM:priceCategories}}'=>$options,'{{CM:priceRows}}'=>$rows]), $resource);
}
function cmPageChildren($node) { return array_values(array_filter(iterator_to_array($node->childNodes), function($child) { return $child instanceof DOMElement; })); }
function cmPageHasClass($node, $class) { return in_array($class, preg_split('/\s+/', trim($node->getAttribute('class'))), true); }
function cmPageCommerce($node) {
    for ($current = $node; $current instanceof DOMElement; $current = $current->parentNode) {
        if (in_array(strtolower($current->tagName), ['form','input','select','textarea','svg','canvas','script','style'], true) || $current->getAttribute('aria-hidden') === 'true') return true;
        foreach (['prod-card','prod-toolbar','shop-sidebar','filter-card','chip-row','prod-price-big','savings-note','stock-line','qty-stepper','rating-row','hero-stats','hero-shot__tag'] as $class) if (cmPageHasClass($current, $class)) return true;
        if (in_array($current->getAttribute('id'), ['pdQty','cartBtn','wishBtn','userIconBtn','cartCount','wishCount','accountChip','accountArea','navCatMenu'], true)) return true;
        if (strtolower($current->tagName) === 'tbody' && $current->parentNode instanceof DOMElement && $current->parentNode->getAttribute('id') === 'plTable') return true;
        foreach (['data-add','data-wish','data-qty','data-del'] as $attribute) if ($current->hasAttribute($attribute)) return true;
    }
    return false;
}
/* Follow cms-runtime.collectElements exactly: text span insertion happens
   before child indices are assigned, and SVG/commerce subtrees own no IDs. */
function cmPageCollect($root) {
    $entries = [];
    $walk = function($node, $path) use (&$walk, &$entries, $root) {
        if (!$node instanceof DOMElement || in_array(strtolower($node->tagName), ['svg','path','circle','rect','line','polyline','polygon','ellipse'], true)) return;
        $tag = strtoupper($node->tagName); $permitted = !cmPageCommerce($node); $children = cmPageChildren($node); $kind = 'container';
        if ($permitted && $tag === 'IMG') $kind = 'image';
        elseif ($permitted && in_array($tag, ['A','BUTTON'], true)) $kind = 'button';
        elseif ($permitted && preg_match('/^(H[1-6]|P|SPAN|STRONG|B|SMALL|LI|SUMMARY|LABEL)$/', $tag) && !$children && trim($node->textContent) !== '') $kind = 'text';
        if ($permitted && $children && preg_match('/^(H[1-6]|P|SPAN|STRONG|SMALL|SUMMARY|LI)$/', $tag)) {
            foreach (iterator_to_array($node->childNodes) as $child) if ($child instanceof DOMText && trim($child->textContent) !== '') {
                $span = $node->ownerDocument->createElement('span'); $span->setAttribute('data-cms-text', ''); $node->replaceChild($span, $child); $span->appendChild($child);
            }
        }
        $key = 'e' . ($path ? implode('.', $path) : 'root');
        if ($kind !== 'container' || $node === $root || $permitted && preg_match('/^(DIV|SECTION|HEADER|H[1-6]|P|UL|DETAILS)$/', $tag)) {
            $node->setAttribute('data-cms-element', $key); $entries[$key] = ['node'=>$node,'kind'=>$kind];
            if ($kind === 'text' && in_array($tag, ['SPAN','STRONG','B','SMALL'], true)) $node->setAttribute('data-cms-inline', '');
        }
        if ($kind === 'button' && !$node->getElementsByTagName('img')->length) return;
        if (!cmPageCommerce($node)) foreach (cmPageChildren($node) as $index=>$child) $walk($child, array_merge($path, [$index]));
    };
    $walk($root, []); return $entries;
}
function cmPageSectionKey($node, $index) {
    if ($node->getAttribute('id') !== '') return $node->getAttribute('id');
    foreach (['page-head','content-copy','shop-layout','prod-detail','table-wrap'] as $class) if (cmPageHasClass($node, $class)) return $class;
    return 'section-' . ($index + 1);
}
function cmPageContentNode($dom, $tag, $class, $text, $key) {
    $node = $dom->createElement($tag); if ($class !== '') $node->setAttribute('class', $class); if ((string)$text !== '') $node->appendChild($dom->createTextNode((string)$text));
    if ($key !== '') $node->setAttribute('data-cms-content', $key); return $node;
}
function cmPageAppendHtml($node, $html) {
    if ($html === '') return;
    $part = new DOMDocument('1.0', 'UTF-8'); $old = libxml_use_internal_errors(true);
    $part->loadHTML('<?xml encoding="UTF-8"><div id="cm-fragment">' . $html . '</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD); libxml_clear_errors(); libxml_use_internal_errors($old);
    $root = $part->getElementById('cm-fragment'); if ($root) foreach (iterator_to_array($root->childNodes) as $child) $node->appendChild($node->ownerDocument->importNode($child, true));
}
function cmPageImageUrl($value) {
    if (!is_string($value) || preg_match('/[\x00-\x1f\\\\]/', $value)) return '';
    return preg_match('#^(?:/?(?:images|uploads)/|https://(?:admin\.)?crackersmela\.com/(?:images|uploads)/)#i', $value) ? $value : '';
}
function cmPageIcon($node,$name) {
    $paths = cmPageResource()['cmsIcons'] ?? []; $path = $paths[$name] ?? $paths['star'] ?? '';
    cmPageAppendHtml($node,'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' . cmPageEscape($path) . '"></path></svg>');
}
function cmPageAddedSection($dom, $section) {
    $type = $section['type']; $content = $section['content'] ?? []; $node = cmPageContentNode($dom, 'section', 'section cms-section cms-section--' . $type, '', '');
    $append = function($tag, $class, $text, $key) use ($dom, $node) { $child = cmPageContentNode($dom, $tag, $class, $text, $key); $node->appendChild($child); return $child; };
    if ($type === 'productGrid') {
        if (!empty($content['heading'])) $append('h2', 'section__title', $content['heading'], 'heading');
        cmPageAppendHtml($append('div', 'prod-grid cms-product-grid', '', ''), cmPageProductGridHtml($content));
    } elseif ($type === 'faq') {
        if (!empty($content['heading'])) $append('h2', 'section__title', $content['heading'], 'heading');
        foreach (array_slice($content['items'] ?? [], 0, 60) as $index=>$item) { $detail = $append('details','cms-faq-item','',''); $detail->appendChild(cmPageContentNode($dom,'summary','',$item['question'] ?? '',"items.$index.question")); $detail->appendChild(cmPageContentNode($dom,'p','',$item['answer'] ?? '',"items.$index.answer")); }
    } elseif (in_array($type, ['features','testimonials'], true)) {
        if (!empty($content['heading'])) $append('h2','section__title',$content['heading'],'heading'); if (!empty($content['text'])) $append('p','cms-copy',$content['text'],'text');
        $grid = $append('div','cms-entry-grid','','');
        foreach (array_slice($content['entries'] ?? [],0,30) as $index=>$item) { $entry = cmPageContentNode($dom,$type === 'testimonials' ? 'blockquote' : 'article','cms-entry','',''); $grid->appendChild($entry);
            if (cmPageImageUrl($item['src'] ?? '')) { $image = cmPageContentNode($dom,'img','cms-entry-image','',"entries.$index.src"); $image->setAttribute('src',$item['src']); $image->setAttribute('alt',$item['alt'] ?? ''); $entry->appendChild($image); }
            foreach (['title'=>['h3',''],'text'=>['p','']] as $key=>$tag) if (!empty($item[$key])) $entry->appendChild(cmPageContentNode($dom,$tag[0],$tag[1],$item[$key],"entries.$index.$key"));
        }
    } elseif ($type === 'divider') $append('hr','cms-divider','','divider');
    elseif ($type === 'video') { $video = $append('video','cms-video','','src'); $video->setAttribute('controls',''); $video->setAttribute('preload','metadata'); $video->setAttribute('playsinline',''); if (preg_match('#^(?:https://|/?uploads/).+\.(?:mp4|webm|ogv)$#i', $content['src'] ?? '')) $video->setAttribute('src',$content['src']); }
    elseif ($type === 'icon') cmPageIcon($append('span','cms-icon','','icon'),$content['icon'] ?? 'star');
    else {
        if (!empty($content['heading'])) $append($type === 'hero' ? 'h1' : 'h2','section__title',$content['heading'],'heading');
        if (!empty($content['text'])) $append('p','cms-copy',$content['text'],'text');
        $image = null;
        if (cmPageImageUrl($content['src'] ?? '')) { $image = $append('img','cms-image','','src'); $image->setAttribute('src',$content['src']); $image->setAttribute('alt',$content['alt'] ?? ''); $image->setAttribute('loading','lazy'); $image->setAttribute('decoding','async'); }
        if (!empty($content['buttonText']) || $type === 'button') { $button = $append('a','btn btn-primary',$content['buttonText'] ?? '','buttonText'); $button->setAttribute('href',$content['href'] ?? '#'); if (!empty($content['newTab'])) { $button->setAttribute('target','_blank'); $button->setAttribute('rel','noopener noreferrer'); } }
        if (in_array($type,['imageText','hero'],true)) { $copy = $dom->createElement('div'); $copy->setAttribute('class','cms-section-copy'); foreach (iterator_to_array($node->childNodes) as $child) if ($child !== $image) $copy->appendChild($child); $node->appendChild($copy); if ($image) $node->appendChild($image); }
    }
    $entries = ['eroot'=>['node'=>$node,'kind'=>'container']]; $node->setAttribute('data-cms-element','eroot');
    foreach ($node->getElementsByTagName('*') as $child) if ($child->hasAttribute('data-cms-content')) { $contentKey = $child->getAttribute('data-cms-content'); $kind = ['img'=>'image','video'=>'video','a'=>'button','hr'=>'divider'][strtolower($child->tagName)] ?? ($contentKey === 'icon' ? 'icon' : 'text'); $key = 'content-' . ($contentKey === 'src' ? ($kind === 'video' ? 'video' : 'image') : ($contentKey === 'buttonText' ? 'button' : $contentKey)); $child->setAttribute('data-cms-element',$key); $entries[$key] = ['node'=>$child,'kind'=>$kind,'content'=>true]; }
    return [$node,$entries];
}
function cmPageStyleDeclarations($styles) {
    $css = '';
    foreach ((array)$styles as $key=>$value) if (is_string($key) && preg_match('/^[a-zA-Z]+$/D',$key) && (is_string($value) || is_numeric($value)) && !preg_match('/[<>;{}\\\\]|url\s*\(|expression\s*\(|@|\/\*/i',(string)$value)) $css .= strtolower(preg_replace('/([A-Z])/', '-$1', $key)) . ':' . $value . '!important;';
    return $css;
}
function cmPageProductRules($selector,$content) {
    $css = '';
    if (isset($content['columns']) && is_int($content['columns'])) $css .= $selector . ' .prod-grid{grid-template-columns:repeat(' . max(1,min(6,$content['columns'])) . ',minmax(0,1fr))}';
    foreach (['showPrice'=>['price-now'],'showSalePrice'=>['price-cmp','price-off'],'showCart'=>['prod-card__foot'],'showBadge'=>['prod-card__badges']] as $key=>$classes) if (($content[$key] ?? true) === false) $css .= implode(',',array_map(function($class) use ($selector) { return $selector . ' .' . $class; },$classes)) . '{display:none}';
    $ratios = ['square'=>'1','portrait'=>'3/4','landscape'=>'4/3'];
    if (isset($ratios[$content['imageRatio'] ?? ''])) $css .= $selector . ' .prod-card__media{aspect-ratio:' . $ratios[$content['imageRatio']] . '}';
    if (($content['cardStyle'] ?? '') === 'compact') $css .= $selector . ' .prod-card__desc,' . $selector . ' .rating-row{display:none}' . $selector . ' .prod-card__body{padding:12px}';
    if (($content['cardStyle'] ?? '') === 'outlined') $css .= $selector . ' .prod-card{box-shadow:none;border:1px solid var(--primary)}';
    return $css;
}
function cmPageDesignCss($design) {
    $tokens = ['primary'=>'--primary','text'=>'--ink','background'=>'--bg','fontFamily'=>'--font-body','headingFont'=>'--font-display','radius'=>'--radius']; $declarations = '';
    foreach ($tokens as $key=>$token) if (!empty($design[$key]) && is_string($design[$key]) && !preg_match('/[<>;{}\\\\]|url\s*\(|@/i',$design[$key])) {
        $declarations .= $token . ':' . $design[$key] . ';';
        if ($key === 'fontFamily') $declarations .= 'font-family:' . $design[$key] . ';';
        if ($key === 'text') $declarations .= 'color:' . $design[$key] . ';';
    }
    $css = $declarations !== '' ? '#view{' . $declarations . '}' : '';
    if (cmCmsColor($design['background'] ?? '')) $css .= '#view{background:' . $design['background'] . '!important}';
    if (is_string($design['containerWidth'] ?? null) && preg_match('/^(?:\d+(?:\.\d+)?)(?:px|rem|em|%|vw)$/D',$design['containerWidth'])) $css .= '#view.container,#view .container{max-width:' . $design['containerWidth'] . '!important}';
    return $css;
}
function cmPageCss($selector,$item) {
    $css = ''; $media = ['desktop'=>'(min-width:1024.01px)','tablet'=>'(min-width:767.01px) and (max-width:1024px)','mobile'=>'(max-width:767px)']; $styles = []; $effects = [];
    foreach ($media as $device=>$condition) {
        $styles = array_replace($styles,(array)($item['styles'][$device] ?? [])); $effects = array_replace_recursive($effects,(array)($item['effects'][$device] ?? []));
        $override = $item['overrides'][$device] ?? []; $resolvedStyles = array_replace($styles,(array)($override['styles'] ?? [])); $resolvedEffects = array_replace_recursive($effects,(array)($override['effects'] ?? []));
        $declarations = cmPageStyleDeclarations($resolvedStyles);
        if (array_key_exists('zIndex',$resolvedStyles)) $declarations .= 'position:relative;';
        if (($override['hidden'] ?? $item['hidden'] ?? false) === true) $declarations .= 'display:none!important;';
        $position = $resolvedEffects['position'] ?? null;
        if (is_array($position)) $declarations .= 'translate:' . (float)($position['x'] ?? 0) . 'px ' . (float)($position['y'] ?? 0) . 'px!important;scale:' . (float)($position['scale'] ?? 1) . '!important;';
        $gradient = $resolvedEffects['gradient'] ?? []; $layers = []; $text = in_array($item['kind'] ?? '',['text','button'],true);
        if (!empty($gradient['enabled']) && cmCmsColor($gradient['start'] ?? '') && cmCmsColor($gradient['end'] ?? '')) {
            $layers[] = 'linear-gradient(' . max(0,min(360,(float)($gradient['angle'] ?? 0))) . 'deg,' . $gradient['start'] . ',' . $gradient['end'] . ')';
            if ($text) $declarations .= 'background-clip:text!important;-webkit-background-clip:text!important;color:transparent!important;-webkit-text-fill-color:transparent!important;';
        } elseif (($gradient['enabled'] ?? null) === false && $text) $declarations .= 'background-image:none!important;-webkit-text-fill-color:currentColor!important;background-clip:border-box!important;color:' . (cmCmsColor($resolvedStyles['color'] ?? '') ? $resolvedStyles['color'] : 'inherit') . '!important;';
        $background = cmPageImageUrl($resolvedEffects['backgroundImage'] ?? '');
        if ($background !== '' && !$text) { $background = preg_replace_callback('/["\'()\\\\]/',function($match) { return '%' . strtoupper(bin2hex($match[0])); },$background); $layers[] = 'url("' . $background . '")'; $declarations .= 'background-size:cover!important;background-position:center!important;'; }
        if ($layers) $declarations .= 'background-image:' . implode(',',$layers) . '!important;';
        elseif (($resolvedEffects['backgroundImage'] ?? null) === '') $declarations .= 'background-image:none!important;';
        $rules = $declarations !== '' ? $selector . '{' . $declarations . '}' : '';
        if (($item['type'] ?? '') === 'productGrid') $rules .= cmPageProductRules($selector,array_replace((array)($item['content'] ?? []),(array)($override['content'] ?? [])));
        if ($rules !== '') $css .= '@media ' . $condition . '{' . $rules . '}';
    }
    return $css;
}
function cmPageApplySection($node, $entries, $section, &$css) {
    $dom = $node->ownerDocument; $node->setAttribute('data-cms-section',$section['id']);
    $selector = '[data-cms-section="' . $section['id'] . '"]'; $css .= cmPageCss($selector,$section);
    $pending = array_filter((array)($section['elements'] ?? []), function($value) { return !empty($value['added']); });
    for ($depth=0; $pending && $depth<20; $depth++) foreach ($pending as $key=>$value) {
        $parentId = $value['parentId'] ?? 'eroot'; $parent = $entries[$parentId]['node'] ?? null; if (!$parent) continue;
        $tag = ['text'=>'p','heading'=>'h2','image'=>'img','button'=>'a','video'=>'video','divider'=>'hr','icon'=>'span','container'=>'div'][$value['kind']] ?? 'div';
        $added = cmPageContentNode($dom,$tag,'cms-added-element cms-added-' . $value['kind'],$value['text'] ?? '',''); $added->setAttribute('data-cms-element',$key); $added->setAttribute('data-cms-added','');
        $before = $entries[$value['beforeId'] ?? '']['node'] ?? null; if ($before && $before->parentNode === $parent) $parent->insertBefore($added,$before); else $parent->appendChild($added);
        if ($before || !empty($value['flow'])) $added->setAttribute('style','position:relative;left:auto;top:auto');
        if ($value['kind'] === 'icon') cmPageIcon($added,$value['icon'] ?? 'star');
        $parent->setAttribute('data-cms-added-container',''); $entries[$key] = ['node'=>$added,'kind'=>$value['kind']]; unset($pending[$key]);
    }
    foreach ($entries as $key=>$entry) {
        $value = $section['elements'][$key] ?? []; $target = $entry['node']; $kind = $entry['kind'];
        if (empty($entry['content']) && in_array($kind,['text','heading','button'],true) && isset($value['text']) && $value['text'] !== $target->textContent) { while ($target->firstChild) $target->removeChild($target->firstChild); $target->appendChild($dom->createTextNode($value['text'])); }
        if (empty($entry['content']) && $kind === 'image') { $url = cmPageImageUrl($value['src'] ?? ''); if ($url !== '') $target->setAttribute('src',$url); if (isset($value['alt'])) $target->setAttribute('alt',$value['alt']); }
        if ($kind === 'button' && strtolower($target->tagName) === 'a') { if (!empty($value['href'])) $target->setAttribute('href',$value['href']); if (array_key_exists('newTab',$value)) { if ($value['newTab']) { $target->setAttribute('target','_blank'); $target->setAttribute('rel','noopener noreferrer'); } else $target->removeAttribute('target'); } }
        if ($kind === 'video' && preg_match('#^(?:https://|/?uploads/).+\.(?:mp4|webm|ogv)$#i',$value['src'] ?? '')) $target->setAttribute('src',$value['src']);
        $css .= cmPageCss($key === 'eroot' ? $selector : $selector . ' [data-cms-element="' . $key . '"]',$value + ['kind'=>$kind]);
    }
}
function cmSeoRenderPublishedPage($id,$record,$info) {
    $resource = cmPageResource(); $template = $info['templatePage'] ?? $id; $published = is_array($record['published'] ?? null) ? $record['published'] : null;
    if ($id === 'home' || !class_exists('DOMDocument')) return null;
    if (isset($resource['pages'][$template])) { $page = $resource['pages'][$template]; $html = '<div class="page-head reveal"><h1>' . $page['title'] . '</h1><p>' . $page['lede'] . '</p></div><div class="reveal content-copy" style="max-width:820px">' . $page['body'] . '</div>'; $html = cmPageHydrate($html,$resource); }
    elseif ($template === 'price-list') $html = cmPagePriceList($resource);
    elseif ($template === 'custom') $html = '';
    else return null;
    $dom = new DOMDocument('1.0','UTF-8'); $old = libxml_use_internal_errors(true); $dom->loadHTML('<?xml encoding="UTF-8"><main id="cm-initial">' . $html . '</main>',LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD); libxml_clear_errors(); libxml_use_internal_errors($old);
    $main = $dom->getElementById('cm-initial'); if (!$main) return null;
    $sources = []; foreach (cmPageChildren($main) as $index=>$node) { $source = $template . ':' . cmPageSectionKey($node,$index); $entries = cmPageCollect($node); $node->setAttribute('data-cms-section',$source); $sources[$source] = ['node'=>$node,'entries'=>$entries]; }
    $css = '#view .reveal{opacity:1;transform:none}';
    if ($published !== null) {
        $css .= cmPageDesignCss($published['design'] ?? []);
        foreach (iterator_to_array($main->childNodes) as $child) $main->removeChild($child);
        $used = [];
        foreach (array_slice($published['sections'] ?? [],0,80) as $section) {
            if (($section['region'] ?? 'main') !== 'main' || isset($used[$section['id']])) continue; $used[$section['id']] = true;
            if ($section['type'] === 'native') {
                $source = $sources[$section['source']] ?? null; if (!$source) continue;
                $node = $source['node']->cloneNode(true); $entries = []; foreach ([$node,...iterator_to_array($node->getElementsByTagName('*'))] as $child) if ($child->hasAttribute('data-cms-element')) { $key = $child->getAttribute('data-cms-element'); if (isset($source['entries'][$key])) $entries[$key] = ['node'=>$child,'kind'=>$source['entries'][$key]['kind']]; }
            } else [$node,$entries] = cmPageAddedSection($dom,$section);
            cmPageApplySection($node,$entries,$section,$css); $main->appendChild($node);
        }
    }
    $output = '<style data-cm-initial-css>' . $css . '</style>'; foreach ($main->childNodes as $child) $output .= $dom->saveHTML($child);
    return $output;
}
