<?php
require_once __DIR__ . '/cm-product-brand.php';
require_once __DIR__ . '/cm-page-products.php';
/* The first HTTP paint uses the storefront's real layout and live catalog.
   This MUST stay structurally identical to views.home in js/app.js: the SPA
   replaces #view once its interactive view is ready, and any divergence
   between the two renderers shows up as a flash of the wrong homepage.
   When you change a home section, change it in BOTH places. */
/* Icon set mirrored from app.js `const I` (only the icons the home uses). */
function cmHomeIcons() {
    return array(
        'shield' => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 6v5c0 5 3 8.5 7 10 4-1.5 7-5 7-10V6z"/><path d="m9.3 12 1.8 1.8 3.6-3.6"/></svg>',
        'lock'   => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
        'truck'  => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h12v9H3z"/><path d="M15 9h4.2L21 11.8V15h-6z"/><circle cx="7" cy="18" r="1.8"/><circle cx="17.5" cy="18" r="1.8"/></svg>',
        'phone'  => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z"/></svg>',
        'arrow'  => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
        'heart'  => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 0 0-7.1 7.1l8.8 8.8 8.8-8.8a5 5 0 0 0 0-7.1z"/></svg>',
    );
}
/* Category art assets mirrored from CATEGORY_ART_ASSET in app.js. */
function cmHomeCategoryArt() {
    return array(
        'gift-boxes' => 'images/categories/gift-boxes.svg',
        'kids-special' => 'images/categories/kids-special.svg',
        'sparklers' => 'images/categories/sparklers.svg',
        'flower-pots' => 'images/categories/flower-pots.svg',
        'chakkars' => 'images/categories/chakkars.svg',
        'garlands' => 'images/categories/garlands.svg',
        'fancy' => 'images/categories/fancy.svg',
        'rockets' => 'images/categories/rockets.svg',
        'bombs' => 'images/categories/bombs.svg',
        'guns-rolls' => 'images/categories/guns-rolls.svg',
        'night-outs' => 'images/categories/night-outs.svg',
    );
}
/* Mirrors priceOf/discountOf: the effective selling price may be the compareAt. */
function cmHomePrice(array $p) {
    $price = (float)($p['price'] ?? 0);
    $compareAt = (float)($p['compareAt'] ?? 0);
    if ($compareAt > 0 && $compareAt < $price) return $compareAt;
    return $price;
}
function cmHomeDiscount(array $p) {
    $price = (float)($p['price'] ?? 0);
    $compareAt = (float)($p['compareAt'] ?? 0);
    if ($compareAt > 0 && $compareAt > $price) return (int)round((1 - $price / $compareAt) * 100);
    return 0;
}
/* The homepage hero is CMS-authored through the visual editor, which stores it
   as an element tree. Extract the eyebrow, headline lines and lede in document
   order so the server's first paint shows the SAME copy the CMS will apply
   moments later. Falling back to the static defaults keeps a fresh install
   (with no published hero) fully populated for crawlers. */
function cmHomeHeroCopy($hero) {
    $out = array('eyebrow' => '', 'lines' => array(), 'lede' => '');
    if (!is_array($hero) || empty($hero['elements']) || !is_array($hero['elements'])) return $out;
    $elements = $hero['elements'];

    /* The editor stores elements as a flat map keyed by dotted path, already in
       document order. A node's owning container is therefore found by walking
       the key prefix, not by recursing into children. */
    $scopeOf = function ($key) use ($elements) {
        $parts = explode('.', (string)$key);
        while (count($parts) > 1) {
            array_pop($parts);
            $parent = implode('.', $parts);
            if (isset($elements[$parent]) && (string)($elements[$parent]['name'] ?? '') !== '') {
                return (string)$elements[$parent]['name'];
            }
        }
        return '';
    };

    $flat = array();
    foreach ($elements as $key => $node) {
        if (!is_array($node)) continue;
        $kind = (string)($node['kind'] ?? '');
        $text = (string)($node['text'] ?? '');
        if (($kind === 'text' || $text !== '') && trim($text) !== '') {
            $flat[] = array('text' => $text, 'scope' => $scopeOf($key), 'kind' => $kind);
        }
    }
    $isH1 = function ($n) { return strcasecmp($n['scope'], 'h1') === 0; };
    foreach ($flat as $n) if ($isH1($n)) $out['lines'][] = trim($n['text']);
    if (!$out['lines']) return $out; // no CMS headline: keep the static defaults

    $first = null; $last = null;
    foreach ($flat as $i => $n) if ($isH1($n)) { if ($first === null) $first = $i; $last = $i; }
    for ($i = 0; $i < $first; $i++) {
        $n = $flat[$i];
        if ($n['kind'] === 'button' || $isH1($n)) continue;
        $out['eyebrow'] = trim(preg_replace('/\s+/', ' ', $n['text']));
        break;
    }
    for ($i = $last + 1; $i < count($flat); $i++) {
        $n = $flat[$i];
        if ($n['kind'] === 'button' || $isH1($n)) continue;
        $out['lede'] = trim($n['text']);
        break;
    }
    return $out;
}
/* Featured selection is shared with CMHeroShowcase: preserve catalogue order,
   include products without stock/images, and never invent unfeatured fallbacks. */
function cmHomeFeaturedProducts($products) {
    return array_values(array_filter($products, function($p) { return empty($p['disabled']) && !empty($p['featured']); }));
}
function cmHomeHeroShowcase($products) {
    $html = '';
    foreach (['main','a','b'] as $i=>$slot) {
        $p = $products[$i] ?? null;
        $html .= '<a class="hero-shot hero-shot--' . $slot . '" data-hero-slot="' . $i . '"';
        if (!$p) {
            $html .= !$products && $i === 0 ? ' href="/products" aria-label="Explore our crackers"><span class="hero-shot__content hero-shot__empty"><span aria-hidden="true">✦</span><b>Discover our crackers</b><span>Explore the collection</span></span></a>' : ' hidden></a>';
            continue;
        }
        $name = (string)($p['name'] ?? $p['shortName'] ?? ''); $category = cmPageProductCategory($p);
        $html .= ' data-hero-product="' . cmSeoEscape($p['id']) . '" href="' . cmSeoEscape(cmSeoUrl($p)) . '" aria-label="' . cmSeoEscape($name) . '"><span class="hero-shot__content">';
        $src = cmSafeImage($p['image'] ?? '');
        if ($src !== '') {
            $cutout = preg_match('~^images/products/[^?#]+$~', $src) ? 'images/products/nobg/' . preg_replace('/\.(png|jpe?g)$/i', '.webp', basename($src)) : '';
            $html .= '<img src="' . cmSeoEscape($cutout ?: $src) . '" alt="' . cmSeoEscape($name) . '" loading="eager" fetchpriority="high" decoding="async" width="400" height="400" data-cm-image="hero" data-image-category="' . cmSeoEscape($category['id'] ?? '') . '" data-cm-product="' . cmSeoEscape($p['id']) . '"' . ($cutout ? ' data-fallback-src="' . cmSeoEscape($src) . '"' : '') . '>';
        } else $html .= '<div class="prod-img-fallback">' . cmPageProductIcon($category) . '</div>';
        $html .= '<span class="hero-shot__tag">' . cmProductBrandPill($p, true) . (!empty($category['name']) ? '<span class="hero-shot__category">' . cmSeoEscape($category['name']) . '</span>' : '') . '<span class="hero-shot__details"><b>' . cmSeoEscape($p['shortName'] ?? $name) . '</b><span>' . cmPageProductMoney($p['price'] ?? 0) . '</span></span></span></span></a>';
    }
    return $html;
}
function cmHomeInitialHtml($categories, $heroSection = null) {
    $I = cmHomeIcons();
    $art = cmHomeCategoryArt();
    $products = array_values(array_filter(cmProductMap(), function($p) { return empty($p['disabled']); }));
    $stock = array_values(array_filter($products, function($p) { return !empty($p['inStock']) && !empty($p['image']); }));
    $withImg = $stock;

    $money = function($n) { return '₹' . number_format((float)$n, 0); };
    $image = function($src) { return preg_match('~^(?:https://|/?(?:images|uploads)/)~i', $src) ? cmSeoEscape($src) : ''; };
    $name = function($p) { return (string)($p['shortName'] ?? $p['name'] ?? ''); };

    $hero = cmHomeFeaturedProducts($products);

    /* Arrival pills: only offer a pill the live catalog can actually fill. */
    $arrivalPills = array(
        array('k' => 'all', 'n' => 'All'), array('k' => 'rockets', 'n' => 'Rockets'),
        array('k' => 'sparklers', 'n' => 'Sparklers'), array('k' => 'flower-pots', 'n' => 'Fountains'),
        array('k' => 'night-outs', 'n' => 'Sky Shots'), array('k' => 'gift-boxes', 'n' => 'Combos'),
        array('k' => 'chakkars', 'n' => 'Chakkars'),
    );
    $bucketCount = function($k) use ($stock) {
        $n = 0;
        foreach ($stock as $p) if (in_array($k, $p['cats'] ?? array(), true)) $n++;
        return $n;
    };
    $livePills = array();
    foreach ($arrivalPills as $pill) if ($pill['k'] === 'all' || $bucketCount($pill['k']) >= 2) $livePills[] = $pill;

    /* Top 10 by id lead the grid, then a round-robin top-up per pill bucket. */
    $sorted = $stock;
    usort($sorted, function($a, $b) { return $b['id'] <=> $a['id']; });
    $seen = array(); $arrivals = array();
    $take = function($p) use (&$seen, &$arrivals) {
        if ($p && !isset($seen[$p['id']])) { $seen[$p['id']] = true; $arrivals[] = $p; }
    };
    foreach (array_slice($sorted, 0, 10) as $p) $take($p);
    $buckets = array();
    foreach ($livePills as $pill) {
        if ($pill['k'] === 'all') continue;
        $b = array();
        foreach ($sorted as $p) if (in_array($pill['k'], $p['cats'] ?? array(), true)) $b[] = $p;
        $buckets[] = $b;
    }
    for ($i = 0; $i < 6; $i++) foreach ($buckets as $b) if (isset($b[$i])) $take($b[$i]);

    $settings = cmBaseData()['settings'] ?? array();
    $freeAbove = (float)($settings['freeDeliveryAbove'] ?? 2500);
    $deliveryArea = (string)($settings['deliveryArea'] ?? 'Hyderabad & Secunderabad');

    $copy = cmHomeHeroCopy($heroSection);
    $eyebrow = $copy['eyebrow'] !== '' ? $copy['eyebrow'] : 'Celebrate Brighter';
    $lede = $copy['lede'] !== '' ? $copy['lede'] : 'Crackers and fireworks for celebrations across Hyderabad &amp; Secunderabad. Browse the Crackers Mela collection and compare product details, prices and availability.';
    $ledeHtml = nl2br(cmSeoEscape($lede), false);

    $card = function($p) use ($money, $image, $name) {
        $price = cmHomePrice($p); $off = cmHomeDiscount($p);
        $url = cmSeoEscape(cmSeoUrl($p));
        $badges = $off > 0 ? '<div class="prod-card__badges"><span class="badge-off">' . $off . '% OFF</span></div>' : '';
        $cmp = '';
        if (!empty($p['compareAt']) && (float)$p['compareAt'] > $price) {
            $cmp = '<span class="price-cmp">' . $money($p['compareAt']) . '</span><span class="price-off">' . $off . '% off</span>';
        }
        return '<article class="prod-card" data-id="' . cmSeoEscape((string)$p['id']) . '">'
            . '<div class="prod-card__media"><a href="' . $url . '"><img src="' . $image($p['image']) . '" alt="' . cmSeoEscape($name($p)) . '" loading="lazy" width="240" height="240"></a>'
            . $badges
            . '<button class="prod-card__wish" data-wish="' . cmSeoEscape((string)$p['id']) . '" aria-label="Toggle wishlist" aria-pressed="false">' . cmHomeIcons()['heart'] . '</button>'
            . '</div>'
            . '<div class="prod-card__body">'
            . cmProductBrandPill($p)
            . '<h3 class="prod-card__name"><a href="' . $url . '">' . cmSeoEscape($name($p)) . '</a></h3>'
            . '<div class="price-row"><span class="price-now">' . $money($price) . '</span>' . $cmp . '</div>'
            . '<div class="prod-card__foot"><button class="add-btn add-btn--product" data-add="' . cmSeoEscape((string)$p['id']) . '" title="Add to cart" aria-label="Add ' . cmSeoEscape($name($p)) . ' to cart"><span>Add to Cart</span></button></div>'
            . '</div></article>';
    };

    ob_start(); ?>
    <section class="hero">
      <canvas class="hero-canvas" id="heroCanvas" aria-hidden="true"></canvas>
      <div class="hero-inner">
        <div class="hero-copy">
          <span class="hero-eyebrow"><span class="dot"></span><?= cmSeoEscape($eyebrow) ?></span>
          <h1><?php if ($copy['lines']) : foreach ($copy['lines'] as $i => $line): ?><?= $i === count($copy['lines']) - 1 ? '<span class="grad-text">' . cmSeoEscape($line) . '</span>' : cmSeoEscape($line) ?><?php if ($i < count($copy['lines']) - 1) echo ' '; endforeach; ?><?php else: ?>Crackers &amp; Fireworks <span class="grad-text">in Hyderabad</span><?php endif; ?></h1>
          <p class="hero-lede"><?= $ledeHtml ?></p>
          <div class="hero-cta"><a class="btn btn-primary btn-lg" href="#/products">Shop Now</a><a class="btn btn-secondary btn-lg" href="#/products?sort=discount">Explore Crackers</a></div>
          <div class="hero-stats">
            <div class="stat"><div class="num"><?= count($products) ?>+</div><div class="lbl">Products</div></div>
            <div class="stat"><div class="num"><?= count($categories) ?></div><div class="lbl">Categories</div></div>
            <div class="stat"><div class="num"><?= $money($freeAbove) ?>+</div><div class="lbl">Minimum order</div></div>
          </div>
        </div>
        <div class="hero-visual">
          <span class="hero-glow" aria-hidden="true"></span>
          <div class="hero-stage">
            <?= cmHomeHeroShowcase($hero) ?>
            <div class="hero-chip hero-chip--tl"><span class="hc-ic"><?= $I['shield'] ?></span><span>STANDARD <small>Licensed dealer</small></span></div>
            <div class="hero-chip hero-chip--br"><span class="hc-ic"><?= $I['truck'] ?></span><span>Minimum order<small>Orders <?= $money($freeAbove) ?>+</small></span></div>
          </div>
        </div>
      </div>
    </section>

    <section class="section home-categories" id="shop-categories" aria-labelledby="home-categories-title">
      <div class="home-categories__panel">
        <header class="home-categories__head">
          <span class="home-categories__eyebrow"><span aria-hidden="true"></span>Explore<span aria-hidden="true"></span></span>
          <h2 id="home-categories-title">Shop by Categories</h2>
          <p>Handpicked ranges for every celebration</p>
        </header>
        <div class="home-category-grid" aria-label="Shop fireworks by category">
    <?php
      foreach ($categories as $c) {
        if (!is_array($c) || !isset($c['id'], $c['name']) || !empty($c['disabled'])) continue;
        $count = 0;
        foreach ($products as $p) if (in_array($c['id'], $p['cats'] ?? array(), true)) $count++;
        $artwork = $art[$c['id']] ?? ($art['fancy'] ?? 'images/categories/fancy.svg');
        $href = cmSeoEscape('/category/' . rawurlencode($c['id']));
    ?>
          <a class="home-category-card" data-category-id="<?= cmSeoEscape($c['id']) ?>" href="<?= $href ?>" data-spa-route="#/products?cat=<?= rawurlencode($c['id']) ?>">
            <span class="home-category-card__art" aria-hidden="true"><img src="<?= $image($artwork) ?>" width="96" height="96" alt="" loading="lazy" decoding="async" aria-hidden="true" data-cm-image="category" data-image-category="<?= cmSeoEscape($c['id']) ?>"></span>
            <span class="home-category-card__copy"><h3><?= cmSeoEscape($c['name']) ?></h3><span class="home-category-card__count"><?= $count ?> <?= $count === 1 ? 'item' : 'items' ?></span></span>
            <span class="home-category-card__arrow" aria-hidden="true"><?= $I['arrow'] ?></span>
          </a>
    <?php } ?>
        </div>
      </div>
    </section>

    <section class="section" id="new-arrivals">
      <div class="section__head">
        <div>
          <span class="section__tag">Just landed</span>
          <h2 class="section__title">New <span class="grad-text">Arrivals</span></h2>
          <p class="section__sub">Discover the latest crackers for your celebration.</p>
        </div>
        <a class="section__link" href="#/products?sort=newest">View all <?= $I['arrow'] ?></a>
      </div>
      <div class="chip-row chip-row--scroll" role="group" aria-label="Filter collection">
    <?php foreach ($livePills as $pill): ?>
        <button class="chip<?= $pill['k'] === 'all' ? ' active' : '' ?>" data-pill="<?= cmSeoEscape($pill['k']) ?>" data-pillgroup="arrivals" aria-pressed="<?= $pill['k'] === 'all' ? 'true' : 'false' ?>"><?= cmSeoEscape($pill['n']) ?></button>
    <?php endforeach; ?>
      </div>
      <div class="prod-grid prod-grid--5" id="arrivalsGrid" data-cap="10">
    <?php foreach (array_slice($arrivals, 0, 10) as $p) echo $card($p); ?>
      </div>
    </section>

    <section class="section" id="why">
      <div class="section__head section__head--center">
        <div>
          <span class="why-section-tag">The CrackersMela promise</span>
          <h2 class="section__title">Why Choose <span>Crackers Mela?</span></h2>
          <p class="section__sub">Explore the collection and find information for your celebration.</p>
        </div>
      </div>
      <div class="why-grid">
        <div class="why-card"><div class="why-card__ic"><?= $I['shield'] ?></div><h3>Product Information</h3><p>STANDARD Licensed dealer. Compare the listed brands, pack details, prices and availability.</p></div>
        <div class="why-card"><div class="why-card__ic"><?= $I['lock'] ?></div><h3>Pay on Delivery</h3><p>Cash or UPI on delivery. Review your order details before checkout.</p></div>
        <div class="why-card"><div class="why-card__ic"><?= $I['truck'] ?></div><h3>Fast Delivery</h3><p>Same-day and next-day dispatch across <?= cmSeoEscape($deliveryArea) ?>, free above <?= $money($freeAbove) ?>.</p></div>
        <div class="why-card"><div class="why-card__ic"><?= $I['phone'] ?></div><h3>Customer Support</h3><p>Talk to a real person about sizes, safety or bulk orders &mdash; every day from 9am to 9pm.</p></div>
      </div>
    </section>

    <div class="benefits-strip">
      <div class="benefit"><span class="benefit__ic"><?= $I['shield'] ?></span><div><strong>100% Original Products</strong><p>STANDARD Licensed dealer</p></div></div>
      <div class="benefit"><span class="benefit__ic"><?= $I['lock'] ?></span><div><strong>Secure Payments</strong><p>Protected checkout &mdash; Pay on delivery</p></div></div>
      <div class="benefit"><span class="benefit__ic"><?= $I['truck'] ?></span><div><strong>Fast Delivery</strong><p><?= cmSeoEscape($deliveryArea) ?>, doorstep</p></div></div>
      <div class="benefit"><span class="benefit__ic"><?= $I['phone'] ?></span><div><strong>Customer Support</strong><p>Real humans on call, 9am &mdash; 9pm</p></div></div>
    </div>
    <?php return ob_get_clean();
}
