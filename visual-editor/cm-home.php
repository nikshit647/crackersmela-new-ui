<?php
/* The first HTTP paint uses the storefront's real layout and live catalog.
   The SPA replaces this main content once its interactive view is ready. */
function cmHomeInitialHtml($categories) {
    $products = array_values(array_filter(cmProductMap(), function($p) { return empty($p['disabled']); }));
    $stock = array_values(array_filter($products, function($p) { return !empty($p['inStock']) && !empty($p['image']); }));
    $hero = []; $used = [];
    foreach (['gift-boxes','rockets','night-outs'] as $id) {
        $pick = null;
        foreach ($stock as $p) if (!isset($used[$p['id']]) && in_array($id, $p['cats'] ?? [], true)) { $pick=$p; break; }
        if (!$pick) foreach ($stock as $p) if (!isset($used[$p['id']])) { $pick=$p; break; }
        if ($pick) { $hero[]=$pick; $used[$pick['id']]=true; }
    }
    $money = function($n) { return '₹' . number_format((float)$n, 0); };
    $image = function($src) { return preg_match('~^(?:https://|/?(?:images|uploads)/)~i', $src) ? cmSeoEscape($src) : ''; };
    ob_start(); ?>
    <section class="hero">
      <div class="hero-inner">
        <div class="hero-copy">
          <span class="hero-eyebrow"><span class="dot"></span>Celebrate Brighter</span>
          <h1>Crackers &amp; Fireworks <span class="grad-text">in Hyderabad</span></h1>
          <p class="hero-lede">Crackers and fireworks for celebrations across Hyderabad &amp; Secunderabad. Browse the Crackers Mela collection and compare product details, prices and availability.</p>
          <div class="hero-cta"><a class="btn btn-primary btn-lg" href="/products">Shop Now</a><a class="btn btn-secondary btn-lg" href="/products?sort=discount">Explore Crackers</a></div>
          <div class="hero-stats"><div class="stat"><div class="num"><?= count($products) ?>+</div><div class="lbl">Products</div></div><div class="stat"><div class="num"><?= count($categories) ?></div><div class="lbl">Categories</div></div><div class="stat"><div class="num">₹2,500+</div><div class="lbl">Minimum order</div></div></div>
        </div>
        <div class="hero-visual"><span class="hero-glow" aria-hidden="true"></span><div class="hero-stage">
          <?php foreach ($hero as $i=>$p): ?>
          <a class="hero-shot hero-shot--<?= ['main','a','b'][$i] ?>" href="<?= cmSeoEscape(cmSeoUrl($p)) ?>"><img src="<?= $image($p['image']) ?>" alt="<?= cmSeoEscape($p['shortName'] ?? $p['name']) ?>" loading="eager" decoding="async"><span class="hero-shot__tag"><b><?= cmSeoEscape($p['shortName'] ?? $p['name']) ?></b><span><?= $money($p['price']) ?></span></span></a>
          <?php endforeach; ?>
          <div class="hero-chip hero-chip--tl"><span>STANDARD <small>Licensed dealer</small></span></div><div class="hero-chip hero-chip--br"><span>Minimum order<small>Orders ₹2,500+</small></span></div>
        </div></div>
      </div>
    </section>
    <section class="section home-categories" id="shop-categories" aria-labelledby="home-categories-title"><div class="home-categories__panel"><header class="home-categories__head"><span class="home-categories__eyebrow">Explore</span><h2 id="home-categories-title">Shop by Categories</h2><p>Handpicked ranges for every celebration</p></header><div class="home-category-grid" aria-label="Shop fireworks by category">
    <?php foreach ($categories as $c): if (!is_array($c) || !isset($c['id'],$c['name']) || !empty($c['disabled'])) continue;
      $count=count(array_filter($products, function($p) use ($c) { return in_array($c['id'],$p['cats'] ?? [],true); }));
      $art=$c['image'] ?? ('images/categories/' . $c['id'] . '.svg');
      if (empty($c['image']) && !is_file(__DIR__ . '/' . $art)) $art='images/logo.png'; ?>
      <a class="home-category-card" data-category-id="<?= cmSeoEscape($c['id']) ?>" href="/category/<?= rawurlencode($c['id']) ?>"><span class="home-category-card__art" aria-hidden="true"><img src="<?= $image($art) ?>" width="96" height="96" alt="" loading="lazy"></span><span class="home-category-card__copy"><h3><?= cmSeoEscape($c['name']) ?></h3><span class="home-category-card__count"><?= $count ?> <?= $count===1?'item':'items' ?></span></span><span class="home-category-card__arrow" aria-hidden="true">→</span></a>
    <?php endforeach; ?>
    </div></div></section>
    <section class="section" id="new-arrivals"><div class="section__head"><div><span class="section__tag">Just landed</span><h2 class="section__title">New <span class="grad-text">Arrivals</span></h2><p class="section__sub">Discover the latest crackers for your celebration.</p></div><a class="section__link" href="/products">View all →</a></div><div class="prod-grid prod-grid--5">
    <?php usort($stock,function($a,$b){return $b['id']<=>$a['id'];}); foreach(array_slice($stock,0,10) as $p): ?>
      <article class="prod-card"><div class="prod-card__media"><a href="<?= cmSeoEscape(cmSeoUrl($p)) ?>"><img src="<?= $image($p['image']) ?>" alt="<?= cmSeoEscape($p['shortName'] ?? $p['name']) ?>" loading="lazy" width="240" height="240"></a></div><div class="prod-card__body"><h3 class="prod-card__name"><a href="<?= cmSeoEscape(cmSeoUrl($p)) ?>"><?= cmSeoEscape($p['shortName'] ?? $p['name']) ?></a></h3><div class="prod-card__price"><?= $money($p['price']) ?></div><a class="btn btn-primary btn-sm" href="<?= cmSeoEscape(cmSeoUrl($p)) ?>">View product</a></div></article>
    <?php endforeach; ?>
    </div></section>
    <?php return ob_get_clean();
}
