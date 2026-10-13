<?php
/* The initial HTTP document and the browser consume one published CMS snapshot.
   Keep the presentation rules aligned with cms-runtime.js/CMResponsive. */
require_once __DIR__ . '/cm-page-content.php';

function cmCmsRenderArray($value) { return json_decode(json_encode($value), true) ?? []; }
function cmCmsRenderId($value) { return is_string($value) && preg_match('/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/D', $value); }
function cmCmsRenderUrl($value, $image = false) {
    if (!is_string($value) || preg_match('/[\x00-\x1f\\\\]/', $value)) return '';
    $value = trim($value);
    if ($value === '' || substr($value, 0, 2) === '//') return '';
    if (preg_match('/^(?:https?:|mailto:|tel:)/i', $value)) return !$image || preg_match('#^https://(?:admin\.)?crackersmela\.com/(?:images|uploads)/#i', $value) ? $value : '';
    if ($image && !preg_match('#^/?(?:images|uploads)/#', $value)) return '';
    return preg_match('/^[#\/?A-Za-z0-9._-]/', $value) && !preg_match('#^[^/?\#]*:|(?:^|/)\.\.(?:/|$)#', $value) ? $value : '';
}
function cmCmsRenderStyles($styles) {
    $allowed = explode(' ', 'fontFamily fontSize fontWeight lineHeight letterSpacing textAlign color backgroundColor paddingTop paddingRight paddingBottom paddingLeft marginTop marginRight marginBottom marginLeft width maxWidth minHeight height borderRadius borderWidth borderColor borderStyle boxShadow display gap gridTemplateColumns flexDirection alignItems justifyContent objectFit objectPosition opacity');
    return cmPageStyleDeclarations(array_filter((array)$styles, function($value, $key) use ($allowed) { return in_array($key, $allowed, true) && (is_string($value) || is_numeric($value)) && strlen((string)$value) <= 200; }, ARRAY_FILTER_USE_BOTH));
}
function cmCmsRenderResolve($item, $device) {
    $styles = []; $effects = [];
    foreach (['desktop', 'tablet', 'mobile'] as $key) {
        $styles = array_replace($styles, (array)($item['styles'][$key] ?? []));
        $effects = array_replace_recursive($effects, (array)($item['effects'][$key] ?? []));
        if ($key === $device) break;
    }
    $override = (array)($item['overrides'][$device] ?? []);
    return ['styles'=>array_replace($styles, (array)($override['styles'] ?? [])), 'effects'=>array_replace_recursive($effects, (array)($override['effects'] ?? [])), 'hidden'=>$override['hidden'] ?? !empty($item['hidden']), 'content'=>array_replace((array)($item['content'] ?? []), (array)($override['content'] ?? [])), 'hover'=>array_replace((array)($item['hover'] ?? []), (array)($override['hover'] ?? [])), 'animation'=>array_replace((array)($item['animation'] ?? []), (array)($override['animation'] ?? []))];
}
function cmCmsRenderEffects($effects, $kind, $color) {
    $css = ''; $layers = []; $text = in_array($kind, ['text','button'], true); $gradient = $effects['gradient'] ?? [];
    if (!empty($gradient['enabled']) && cmCmsColor($gradient['start'] ?? '') && cmCmsColor($gradient['end'] ?? '')) {
        $layers[] = 'linear-gradient(' . max(0,min(360,(float)($gradient['angle'] ?? 0))) . 'deg,' . $gradient['start'] . ',' . $gradient['end'] . ')';
        if ($text) $css .= 'background-clip:text!important;-webkit-background-clip:text!important;color:transparent!important;-webkit-text-fill-color:transparent!important;';
    } elseif (($gradient['enabled'] ?? null) === false && $text) $css .= 'background-image:none!important;-webkit-text-fill-color:currentColor!important;background-clip:border-box!important;color:' . (cmCmsColor($color) ? $color : 'inherit') . '!important;';
    $image = cmCmsRenderUrl($effects['backgroundImage'] ?? '', true);
    if ($image !== '' && !$text) {
        if (!preg_match('#^https://#i', $image)) $image = 'https://crackersmela.com/' . ltrim($image, '/');
        $image = preg_replace_callback('/["\'()\\\\]/', function($m) { return '%' . bin2hex($m[0]); }, $image);
        $layers[] = 'url("' . $image . '")'; $css .= 'background-size:cover!important;background-position:center!important;';
    }
    if ($layers) $css .= 'background-image:' . implode(',', $layers) . '!important;';
    elseif (($effects['backgroundImage'] ?? null) === '') $css .= 'background-image:none!important;';
    if (is_array($effects['position'] ?? null)) {
        $position = $effects['position'];
        $bound = function($key, $low, $high, $fallback) use ($position) { return is_numeric($position[$key] ?? null) ? max($low,min($high,(float)$position[$key])) : $fallback; };
        $css .= 'translate:' . $bound('x',-1000,1000,0) . 'px ' . $bound('y',-1000,1000,0) . 'px!important;scale:' . $bound('scale',.1,5,1) . '!important;';
    }
    return $css;
}
function cmCmsRenderRules($selector, $item) {
    $css = ''; $text = in_array($item['kind'] ?? '', ['text','heading','button'], true);
    foreach (['desktop'=>'', 'tablet'=>'(max-width:1024px)', 'mobile'=>'(max-width:767px)'] as $device=>$condition) {
        $declarations = cmCmsRenderStyles($item['styles'][$device] ?? []);
        if ($text && !empty($item['styles'][$device]['color'])) $declarations .= '-webkit-text-fill-color:currentColor!important;';
        $rule = $declarations !== '' ? $selector . '{' . $declarations . '}' : '';
        $css .= $condition !== '' && $rule !== '' ? '@media ' . $condition . '{' . $rule . '}' : $rule;
    }
    foreach (['desktop'=>'(min-width:1024.01px)', 'tablet'=>'(min-width:767.01px) and (max-width:1024px)', 'mobile'=>'(max-width:767px)'] as $device=>$condition) {
        $resolved = cmCmsRenderResolve($item, $device); $override = $item['overrides'][$device] ?? [];
        $declarations = cmCmsRenderStyles($override['styles'] ?? []);
        if ($text && !empty($override['styles']['color'])) $declarations .= '-webkit-text-fill-color:currentColor!important;';
        $declarations .= cmCmsRenderEffects($resolved['effects'], $item['kind'] ?? '', $resolved['styles']['color'] ?? '');
        $rules = $declarations !== '' ? $selector . '{' . $declarations . '}' : '';
        if ((!empty($resolved['effects']['position']) || !empty($resolved['styles']['width']) || !empty($resolved['styles']['height'])) && empty($resolved['styles']['display'])) $rules .= $selector . '[data-cms-inline]{display:inline-block!important}';
        $position = $resolved['effects']['position'] ?? null;
        if (($resolved['styles']['display'] ?? '') === 'inline' && is_array($position) && (float)($position['scale'] ?? 1) === 1.0) {
            $offset = function($value) { return is_numeric($value) ? max(-1000,min(1000,(float)$value)) : 0; };
            $rules .= $selector . '[data-cms-inline]{position:relative!important;left:' . $offset($position['x'] ?? 0) . 'px!important;top:' . $offset($position['y'] ?? 0) . 'px!important;translate:none!important;scale:none!important}';
        } elseif (($resolved['styles']['display'] ?? '') === 'inline' && is_array($position)) $rules .= $selector . '[data-cms-inline]{display:inline-block!important;left:0!important;top:0!important}';
        if (($resolved['styles']['display'] ?? '') === 'inline-block' && is_array($position)) $rules .= $selector . '[data-cms-inline]{left:0!important;top:0!important}';
        // Hidden must beat the more specific size/position rule for inline text.
        if ($resolved['hidden']) $rules .= $selector . '{display:none!important}' . $selector . '[data-cms-inline]{display:none!important}';
        $hover = cmCmsRenderStyles($resolved['hover']);
        if ($hover !== '') $rules .= '@media(hover:hover){' . $selector . ':hover{' . $hover . '}}';
        $animation = $resolved['animation'];
        if (in_array($animation['type'] ?? '', ['fade','slide','scale'], true)) {
            $duration = max(100,min(3000,(float)($animation['duration'] ?? 500))); $delay = max(0,min(3000,(float)($animation['delay'] ?? 0)));
            $easing = in_array($animation['easing'] ?? '', ['ease','ease-in','ease-out','ease-in-out','linear'], true) ? $animation['easing'] : 'ease';
            $rules .= '@media(prefers-reduced-motion:no-preference){' . $selector . '{animation:cm-content-' . $animation['type'] . ' ' . $duration . 'ms ' . $easing . ' ' . $delay . 'ms both}}';
        }
        if ($rules !== '') $css .= '@media ' . $condition . '{' . $rules . '}';
    }
    return $css;
}
/* Same path IDs as the browser, including text span insertion. Product cards,
   accounts and the changing featured hero payload remain catalog-owned. */
function cmCmsRenderCollect($root) {
    $entries = [];
    $walk = function($node, $path) use (&$walk, &$entries, $root) {
        if (!$node instanceof DOMElement || in_array(strtolower($node->tagName), ['svg','path','circle','rect','line','polyline','polygon','ellipse'], true)) return;
        $tag = strtoupper($node->tagName); $dynamic = cmPageHasClass($node, 'hero-shot') && $node->hasAttribute('data-hero-slot');
        $statistic = cmPageHasClass($node, 'stat') && $node->parentNode instanceof DOMElement && cmPageHasClass($node->parentNode, 'hero-stats');
        $permitted = !cmPageCommerce($node); $children = cmPageChildren($node); $kind = 'container';
        if (!$dynamic && $permitted && $tag === 'IMG') $kind = 'image';
        elseif (!$dynamic && $permitted && in_array($tag, ['A','BUTTON'], true)) $kind = 'button';
        elseif ($permitted && preg_match('/^(H[1-6]|P|SPAN|STRONG|B|SMALL|LI|SUMMARY|LABEL)$/', $tag) && !$children && trim($node->textContent) !== '') $kind = 'text';
        if ($permitted && $children && preg_match('/^(H[1-6]|P|SPAN|STRONG|SMALL|SUMMARY|LI)$/', $tag)) foreach (iterator_to_array($node->childNodes) as $child) if ($child instanceof DOMText && trim($child->textContent) !== '') {
            $span = $node->ownerDocument->createElement('span'); $span->setAttribute('data-cms-text',''); $node->replaceChild($span,$child); $span->appendChild($child);
        }
        $key = 'e' . ($path ? implode('.', $path) : 'root');
        if ($dynamic || $kind !== 'container' || $node === $root || $statistic || $permitted && (preg_match('/^(DIV|SECTION|HEADER|H[1-6]|P|UL|DETAILS)$/', $tag) || cmPageHasClass($node, 'hero-eyebrow'))) {
            $node->setAttribute('data-cms-element', $key); $entries[$key] = ['node'=>$node, 'kind'=>$kind];
            if ($kind === 'text' && in_array($tag,['SPAN','STRONG','B','SMALL'],true)) $node->setAttribute('data-cms-inline','');
        }
        if ($dynamic || $statistic || $root->getAttribute('id') === 'promoBar' || $kind === 'button' && !$node->getElementsByTagName('img')->length) return;
        // Statistics expose their layout wrappers, never the catalog-owned values.
        if (!cmPageCommerce($node) || cmPageHasClass($node, 'hero-stats')) foreach (cmPageChildren($node) as $index=>$child) $walk($child, array_merge($path, [$index]));
    };
    $walk($root, []); return $entries;
}
function cmCmsRenderPromoItem($item) {
    foreach (['desktop','tablet','mobile'] as $device) foreach (['paddingTop','paddingRight','paddingBottom','paddingLeft'] as $key) { unset($item['styles'][$device][$key], $item['overrides'][$device]['styles'][$key]); }
    return $item;
}
function cmCmsRenderPromoRules($selector, $item) {
    $css = '';
    foreach (['desktop'=>'(min-width:1024.01px)', 'tablet'=>'(min-width:767.01px) and (max-width:1024px)', 'mobile'=>'(max-width:767px)'] as $device=>$media) {
        $resolved = cmCmsRenderResolve($item,$device); $styles = $resolved['styles'];
        $padding = array_intersect_key($styles, array_flip(['paddingTop','paddingRight','paddingBottom','paddingLeft']));
        $text = cmCmsRenderStyles(array_intersect_key($styles,array_flip(['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','color','textAlign'])));
        $declarations = cmCmsRenderStyles($padding);
        if (in_array($styles['textAlign'] ?? '', ['left','center','right'],true)) $declarations .= 'justify-content:' . ['left'=>'flex-start','center'=>'center','right'=>'flex-end'][$styles['textAlign']] . '!important;';
        $rules = $declarations !== '' ? $selector . ' .promo-bar__group{' . $declarations . '}' : '';
        if ($text !== '') $rules .= $selector . ' .promo-bar__item{' . $text . '}';
        if (($resolved['effects']['gradient']['enabled'] ?? null) === false || !empty($styles['backgroundColor']) && empty($resolved['effects']['gradient']['enabled'])) $rules .= $selector . '{background-image:none!important}';
        if (($resolved['content']['showPromoIcons'] ?? true) === false) $rules .= $selector . ' .promo-bar__message-icon{display:none!important}';
        if ($rules !== '') $css .= '@media ' . $media . '{' . $rules . '}';
    }
    return $css;
}
function cmCmsRenderPromo($node, $section) {
    if (!is_array($section['content']['promoMessages'] ?? null)) return;
    $track = $node->ownerDocument->getElementById('promoTrack'); if (!$track) return;
    // These are the same five native icons used by app.js renderPromo. They
    // cannot depend on the editorial-content resource, which omits some icons.
    $paths = [
        'tag'=>'<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.4"/>',
        'truck'=>'<path d="M3 6h12v9H3z"/><path d="M15 9h4.2L21 11.8V15h-6z"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
        'shield'=>'<path d="M12 3 5 6v5c0 5 3 8.5 7 10 4-1.5 7-5 7-10V6z"/><path d="m9.3 12 1.8 1.8 3.6-3.6"/>',
        'cash'=>'<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 12h.01M18 12h.01"/>',
        'bolt'=>'<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>'
    ];
    $icons = []; foreach ($paths as $key=>$path) $icons[$key] = '<svg' . ($key === 'tag' ? ' width="1em" height="1em"' : '') . ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' . $path . '</svg>';
    $items = '';
    $separator = '<svg style="width:6px;height:6px;opacity:.55;flex:none" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"></path></svg>';
    foreach ($section['content']['promoMessages'] as $message) {
        $text = (string)($message['text'] ?? ''); if (($message['enabled'] ?? true) === false || trim($text) === '') continue;
        $icon = $message['icon'] ?? 'auto';
        if (!in_array($icon, ['tag','truck','shield','cash','bolt','none'],true)) $icon = preg_match('/SALE|OFF/i',$text) ? 'tag' : (preg_match('/delivery/i',$text) ? 'truck' : (preg_match('/licensed|safety/i',$text) ? 'shield' : (preg_match('/COD|UPI/i',$text) ? 'cash' : 'bolt')));
        $items .= '<span class="promo-bar__item" data-promo-message="' . cmPageEscape($message['id'] ?? '') . '">' . ($icon !== 'none' ? '<span class="promo-bar__message-icon" aria-hidden="true">' . ($icons[$icon] ?? '') . '</span>' : '') . '<span>' . cmPageEscape($text) . '</span></span><span class="promo-bar__item" aria-hidden="true">' . $separator . '</span>';
    }
    while ($track->firstChild) $track->removeChild($track->firstChild);
    cmPageAppendHtml($track, '<div class="promo-bar__group">' . $items . '</div><div class="promo-bar__group" aria-hidden="true">' . $items . '</div>');
}
function cmCmsRenderApply($node, $entries, $section, &$css) {
    $promo = ($section['source'] ?? '') === 'global:promo';
    if ($promo) cmCmsRenderPromo($node,$section);
    /* Old category snapshots contain prices/counts and old hero snapshots contain
       product links. Do not let either replace the current commerce data. */
    foreach ($entries as $key=>$entry) {
        $target = $entry['node']; $category = false;
        for ($parent=$target; $parent instanceof DOMElement && $parent !== $node; $parent=$parent->parentNode) if (cmPageHasClass($parent,'home-category-card')) { $category=true; break; }
        if ($category || cmPageHasClass($target,'hero-shot')) unset($section['elements'][$key]['text'], $section['elements'][$key]['href'], $section['elements'][$key]['src']);
    }
    foreach ((array)($section['elements'] ?? []) as $key=>$value) {
        if (!cmCmsRenderId($key)) { unset($section['elements'][$key]); continue; }
        foreach (['href'=>false,'src'=>($value['kind'] ?? '') === 'image'] as $field=>$image) if (isset($value[$field]) && cmCmsRenderUrl($value[$field],$image) === '') unset($section['elements'][$key][$field]);
    }
    $discard = ''; cmPageApplySection($node,$entries,$section,$discard);
    $selector = '[data-cms-section="' . $section['id'] . '"]';
    foreach ([$node,...iterator_to_array($node->getElementsByTagName('*'))] as $target) {
        $key = $target->getAttribute('data-cms-element'); if ($key === '' || !cmCmsRenderId($key)) continue;
        $value = (array)($section['elements'][$key] ?? []); $value['kind'] = $entries[$key]['kind'] ?? $value['kind'] ?? 'container';
        $css .= cmCmsRenderRules($key === 'eroot' ? $selector : $selector . ' [data-cms-element="' . $key . '"]', $promo && $key === 'eroot' ? cmCmsRenderPromoItem($value) : $value);
        if ($promo && $key === 'eroot') $css .= cmCmsRenderPromoRules($selector,$value);
    }
    $css .= cmCmsRenderRules($selector, $promo ? cmCmsRenderPromoItem($section) : $section);
    if ($promo) $css .= cmCmsRenderPromoRules($selector,$section);
    return $node;
}
function cmCmsRenderInitial($html, $page, $published, $globals) {
    if (!class_exists('DOMDocument')) throw new RuntimeException('CMS first paint requires the PHP DOM extension.');
    $published = is_array($published) ? cmCmsRenderArray($published) : null; $globals = cmCmsRenderArray($globals);
    $dom = new DOMDocument('1.0','UTF-8'); $previous = libxml_use_internal_errors(true);
    $dom->loadHTML('<?xml encoding="UTF-8">' . $html, LIBXML_NONET); libxml_clear_errors(); libxml_use_internal_errors($previous);
    $main = $dom->getElementById('view'); $body = $dom->getElementsByTagName('body')->item(0); if (!$main || !$body) return $html;
    $sources = []; $css = '';
    foreach (cmPageChildren($main) as $index=>$node) {
        $key = cmPageHasClass($node,'hero') ? 'hero' : (cmPageHasClass($node,'benefits-strip') ? 'benefits' : cmPageSectionKey($node,$index));
        $source = $page . ':' . $key; $entries = cmCmsRenderCollect($node); $sources[$source] = ['node'=>$node, 'entries'=>$entries];
    }
    if ($published !== null) {
        foreach (iterator_to_array($main->childNodes) as $child) $main->removeChild($child);
        $used = [];
        foreach (array_slice($published['sections'] ?? [],0,80) as $section) {
            if (!cmCmsRenderId($section['id'] ?? null) || isset($used[$section['id']]) || ($section['region'] ?? 'main') !== 'main') continue;
            $used[$section['id']] = true;
            if (($section['type'] ?? '') === 'native') {
                $source = $sources[$section['source'] ?? ''] ?? null; if (!$source) continue;
                $node = $source['node']->cloneNode(true); $entries = [];
                foreach ([$node,...iterator_to_array($node->getElementsByTagName('*'))] as $target) if ($target->hasAttribute('data-cms-element')) {
                    $key=$target->getAttribute('data-cms-element'); if (isset($source['entries'][$key])) $entries[$key]=['node'=>$target,'kind'=>$source['entries'][$key]['kind']];
                    if (($section['id'] ?? '') !== ($section['source'] ?? '')) $target->removeAttribute('id');
                }
            } else [$node,$entries] = cmPageAddedSection($dom,$section);
            $main->appendChild($node); cmCmsRenderApply($node,$entries,$section,$css);
        }
        $css .= cmPageDesignCss($published['design'] ?? []);
    }
    foreach (['promo'=>'promoBar','header'=>'navbar','footer'=>''] as $role=>$id) {
        $section = $globals[$role] ?? null; if (!is_array($section) || !cmCmsRenderId($section['id'] ?? null)) continue;
        $node = $id !== '' ? $dom->getElementById($id) : null;
        if ($role === 'footer') foreach ($dom->getElementsByTagName('footer') as $candidate) if (cmPageHasClass($candidate,'footer')) { $node=$candidate; break; }
        if ($node) cmCmsRenderApply($node,cmCmsRenderCollect($node),$section,$css);
    }
    /* Retain the original head byte-for-byte, including CSP hashes and SEO JSON.
       Only the public body presentation is serialized; scripts keep their order. */
    if (!preg_match('/^(.*?)(<body\b[^>]*>).*<\/body>(.*)$/is', $html, $parts)) return $html;
    $head = preg_replace('/<\/head>/i', '<style data-cm-initial-css>' . $css . '</style></head>', $parts[1], 1);
    return $head . $dom->saveHTML($body) . $parts[3];
}
function cmCmsRenderBootstrap($html, $page, $published, $globals, $version = 0) {
    $payload = ['page'=>$page, 'published'=>$published, 'globals'=>$globals, 'version'=>(int)$version];
    $json = json_encode($payload, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    return preg_replace_callback('/<\/head>/i', function() use ($json) { return '<script id="cm-cms-bootstrap" type="application/json">' . $json . '</script></head>'; }, $html, 1);
}
