from pathlib import Path
source = Path(__file__).resolve().parents[1] / 'audit-evidence/product-experience-20261010/source'
app = source / 'js/app.js'
text = app.read_text(encoding='utf-8')
start = text.index('  const updateSeo = (m, params = []) => {')
end = text.index('\n  const navActive = () => {', start)
text = text[:start] + '''  const updateSeo = (m, params = []) => {
    const seo = window.CM_SEO_RUNTIME, manager = window.CMSeoManager;
    if (!seo || !manager) return;
    const name = m && m.name || 'home';
    let pageName = m.cmsId || (name === 'content' ? (params[0] || 'about') : name === 'priceList' ? 'price-list' : name);
    const product = !m.cmsId && pageName === 'product' ? prodBySlug(params[0] || '') : null;
    if (pageName === 'product' && !product) pageName = 'notFound';
    const shopParams = !m.cmsId && name === 'products' && currentRoute ? new URLSearchParams(currentRoute.query || '') : null;
    const shopCat = shopParams && !(shopParams.get('cats') || '').split(',').some(v => v.trim()) ? String(shopParams.get('cat') || '') : '';
    const category = CAT_MAP[shopCat] || null;
    const scope = product ? 'product' : category ? 'category' : 'page';
    const id = product ? String(product.id) : category ? category.id : pageName;
    let resolved = product ? seo.resolveProduct(product, CATS) : category ? seo.resolveCategory(category, allProducts()) : seo.pageMetadata(pageName);
    if (m.cmsId) {
      const settings = manager.metadata('page', m.cmsId);
      const slug = document.head.querySelector('meta[name="cm-page-slug"]')?.content;
      resolved = { ...resolved, title: settings?.title || document.head.querySelector('meta[name="cm-page-name"]')?.content || 'CrackersMela', canonical: settings?.canonical || 'https://crackersmela.com/' + (slug || '') };
    }
    const filtered = shopParams && [...shopParams.entries()].some(([key, value]) => key !== 'cat' && value.trim());
    const privateRoute = IS_ADMIN_HOST || filtered || (shopCat && !category) || ['cart', 'checkout', 'orderSuccess', 'reorder', 'track', 'myOrders', 'wishlist', 'staff', 'maintenance', 'notFound'].includes(pageName);
    const effectiveProduct = product ? { ...product, price: priceOf(product), stock: stockOf(product), inStock: inStockOf(product) } : null;
    const schema = product ? { '@graph': [seo.productSchema(effectiveProduct, CATS), seo.breadcrumbs(product, CATS)] } : category ? seo.categorySchema(category, allProducts()) : null;
    if (product && product.showDescription !== false) schema['@graph'][0].description = resolved.description;
    manager.setRoute({ scope, id, fallback: resolved, schema, privateRoute, products: allProducts().filter(p => !p.disabled), label: category?.name || resolved.title });
  };
''' + text[end:]
app.write_text(text, encoding='utf-8')
index = source / 'index.html'
text = index.read_text(encoding='utf-8')
needle = '<script src="js/seo-runtime.js?v=20261010-products1"></script>'
assert needle in text and 'seo-manager.js' not in text
text = text.replace(needle, needle + '\n<script src="/js/seo-manager.js?v=20261010-editor-seo1"></script>')
text = text.replace('<script type="application/ld+json">', '<script type="application/ld+json" id="cm-site-schema">', 1)
text = text.replace('"@type":"Organization","name"', '"@type":"Organization","@id":"https://crackersmela.com/#organization","name"', 1)
text = text.replace('"@type":"WebSite","name"', '"@type":"WebSite","@id":"https://crackersmela.com/#website","name"', 1)
index.write_text(text, encoding='utf-8')
