from pathlib import Path

path = Path('audit-evidence/production-release/js/app.js')
source = path.read_text(encoding='utf-8-sig')
start = source.index('  /* Generated SEO copy from js/seo-content.js.')
end = source.index('  const navActive = ', start)
replacement = r'''  /* Use the same metadata rules as the initial PHP response. SEO failure must
     never block navigation, cart controls, or checkout. */
  const updateSeo = (m, params = []) => {
    const seo = window.CM_SEO_RUNTIME;
    if (!seo) return;
    const name = m && m.name || 'home';
    let pageName = name === 'content' ? (params[0] || 'about') : name;
    const product = pageName === 'product' ? prodBySlug(params[0] || '') : null;
    if (pageName === 'product' && !product) pageName = 'notFound';
    const shopParams = name === 'products' && currentRoute ? new URLSearchParams(currentRoute.query || '') : null;
    const shopCat = shopParams && !(shopParams.get('cats') || '').split(',').some(v => v.trim()) ? String(shopParams.get('cat') || '') : '';
    const category = CAT_MAP[shopCat] || null;
    const effectiveProduct = product ? { ...product, price: priceOf(product), stock: stockOf(product), inStock: inStockOf(product) } : null;
    const resolved = product ? seo.resolveProduct(product, CATS) : category ? seo.resolveCategory(category, allProducts()) : seo.pageMetadata(pageName);
    const { title, seoDesc: desc, canonical } = resolved;
    document.title = title;
    const setMeta = (selector, attrs, content) => { let el = document.head.querySelector(selector); if (!el) { el = document.createElement('meta'); Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v)); document.head.appendChild(el); } el.setAttribute('content', content); };
    const ogImage = resolved.image || 'https://crackersmela.com/images/logo.png';
    setMeta('meta[name="description"]', { name: 'description' }, desc);
    setMeta('meta[property="og:title"]', { property: 'og:title' }, title);
    setMeta('meta[property="og:description"]', { property: 'og:description' }, desc);
    setMeta('meta[property="og:type"]', { property: 'og:type' }, product ? 'product' : 'website');
    setMeta('meta[property="og:url"]', { property: 'og:url' }, canonical);
    setMeta('meta[property="og:image"]', { property: 'og:image' }, ogImage);
    setMeta('meta[property="og:site_name"]', { property: 'og:site_name' }, 'Crackers Mela');
    setMeta('meta[name="twitter:card"]', { name: 'twitter:card' }, 'summary_large_image');
    setMeta('meta[name="twitter:title"]', { name: 'twitter:title' }, title);
    setMeta('meta[name="twitter:description"]', { name: 'twitter:description' }, desc);
    setMeta('meta[name="twitter:image"]', { name: 'twitter:image' }, ogImage);
    let link = document.head.querySelector('link[rel="canonical"]'); if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); } link.href = canonical;
    const filtered = shopParams && [...shopParams.entries()].some(([key, value]) => key !== 'cat' && value.trim());
    const privateRoute = IS_ADMIN_HOST || filtered || (shopCat && !category) || ['cart', 'checkout', 'orderSuccess', 'reorder', 'track', 'myOrders', 'wishlist', 'staff', 'maintenance', 'notFound'].includes(pageName);
    setMeta('meta[name="robots"]', { name: 'robots' }, privateRoute ? 'noindex, nofollow, noarchive' : 'index, follow, max-image-preview:large');
    // Remove route-specific server entities before writing the current route.
    ['cm-seo-breadcrumbs', 'cm-seo-collection'].forEach(id => document.getElementById(id)?.remove());
    $$('script[type="application/ld+json"]').forEach(node => {
      if (node.id === 'cm-dynamic-schema') return;
      try { if ((JSON.parse(node.textContent || '{}') || {})['@type'] === 'Product') node.remove(); } catch { /* Preserve unrelated CMS JSON-LD. */ }
    });
    let ld = document.getElementById('cm-dynamic-schema'); if (!ld) { ld = document.createElement('script'); ld.id = 'cm-dynamic-schema'; ld.type = 'application/ld+json'; document.head.appendChild(ld); }
    const schema = product ? { '@context': 'https://schema.org', '@graph': [seo.productSchema(effectiveProduct, CATS), seo.breadcrumbs(product, CATS)] }
      : category ? seo.categorySchema(category, allProducts())
      : { '@context': 'https://schema.org', '@graph': [{ '@type': 'Organization', name: 'Crackers Mela', url: 'https://crackersmela.com/' }, { '@type': 'WebSite', name: 'Crackers Mela', url: 'https://crackersmela.com/' }] };
    // Metadata copy must be identical to the visible description even when a
    // live stock/price override changes the source fingerprint used by SEO.
    if (product) schema['@graph'][0].description = resolved.description;
    ld.textContent = JSON.stringify(schema);
  };

'''
source = source[:start] + replacement + source[end:]
def replace(old, new):
    global source
    if old not in source:
        raise RuntimeError('Missing known frontend anchor: ' + old[:90])
    source = source.replace(old, new)

replace('value="${esc(base.slug || \'\')}" placeholder="product-slug"', 'value="${esc(base.seoSlug || base.slug || \'\')}" placeholder="product-slug"')
replace("const sub = st.cats.length === 1 ? CAT_MAP[st.cats[0]].blurb", "const sub = st.cats.length === 1 ? (window.CM_SEO_RUNTIME?.resolveCategory(CAT_MAP[st.cats[0]], allProducts()).intro || CAT_MAP[st.cats[0]].blurb)")
replace("    const off = discountOf(p);\n    const cat = catLabel(p);\n    const qty = cartQty(p.id) || 1;", "    const off = discountOf(p);\n    const productSeo = window.CM_SEO_RUNTIME?.resolveProduct(p, CATS);\n    const cat = productSeo?.category || catLabel(p);\n    const qty = cartQty(p.id) || 1;")
replace('<h1>${esc(p.shortName)}</h1>', '<h1>${esc(p.name || p.shortName)}</h1>')
replace("${p.image ? imgOf(p, 600) :", "${p.image ? productImageMarkup(p, 600, 'detail') :")
replace("esc(p.shortName)}\" loading=\"lazy\" decoding=\"async\"${dimensions}", "esc(p.name || p.shortName)}\" loading=\"${kind === 'detail' ? 'eager' : 'lazy'}\"${kind === 'detail' ? ' fetchpriority=\"high\"' : ''} decoding=\"async\"${dimensions}")
replace('<div class="rating-row">${stars(p.rating)} <span>${p.rating.toFixed(1)} · ${p.reviews}</span></div>', '<!-- Review counters are omitted until backed by customer review records. -->')
replace('<div class="rating-row">${stars(p.rating)}<span>${p.rating.toFixed(1)} · ${p.reviews} reviews</span></div>', '<!-- Review counters are omitted until backed by customer review records. -->')
replace("  const stars = r => '<span class=\"stars\" aria-hidden=\"true\">' + '★'.repeat(Math.round(r)) + '☆'.repeat(5 - Math.round(r)) + '</span>';\n", '')
replace("${esc(productText(p.note || p.desc || 'Premium quality fireworks from certified factories.'))}", "${esc(productText(productSeo?.description || p.desc || p.note || p.name))}")
replace('STANDARD certified product', 'STANDARD Licensed dealer')
replace('STANDARD Licensed dealer, safety-tested stock only', 'STANDARD Licensed dealer')
replace('<b>Safety</b><span>Certified &amp; tested</span>', '<b>Product guidance</b><span>Follow the instructions on the pack</span>')
replace('Premium quality crackers for every occasion — STANDARD Licensed dealer and factory-direct from Sivakasi, delivered to your doorstep across Hyderabad &amp; Secunderabad.', 'Crackers and fireworks for celebrations across Hyderabad &amp; Secunderabad. Browse the Crackers Mela collection and compare product details, prices and availability.')
replace("CrackersMela started with a simple belief: a good celebration should be safe, affordable and unforgettable. For every season we hand-pick certified stock directly from licensed factories in Sivakasi — Tamil Nadu's fireworks capital — so you get the freshest, loudest, brightest crackers without the mandi markup.", 'Crackers Mela offers crackers and fireworks for Hyderabad and Secunderabad. Explore the collection by category, compare the product details and contact our team for help with an order.')
replace('<b>STANDARD Licensed dealer stock</b> — every box is licensed, tested and legal.', '<b>STANDARD Licensed dealer</b> — browse the listed brands and product details.')
replace('All products shown are licensed and STANDARD Licensed dealer. Prices, offers and availability may change; the price shown at checkout is final.', 'Crackers Mela — STANDARD Licensed dealer. Prices, offers and availability may change; the price shown at checkout is final.')
replace("Yes. We sell licensed, STANDARD Licensed dealer stock for permitted festival windows. In Telangana, crackers can be burst for 2 hours on Deepavali and other permitted days per the pollution-control board rules.", 'Rules can vary by date and location. Check the current Telangana and local authority notices before purchasing or using fireworks, and follow the instructions on the product pack.')
replace('Every box is sealed stock from certified factories. Our riders carry them upright in fire-safe packaging and hand them to an adult at the address.', 'Contact our team to confirm delivery arrangements for your order. Read the handling and storage instructions supplied with each product.')
path.write_text(source, encoding='utf-8', newline='\n')
print('Patched public SEO rendering, factual copy and the saved SEO slug field.')
