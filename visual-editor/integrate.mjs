import { readFile, writeFile, mkdir, cp, readdir } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const source = dirname(fileURLToPath(import.meta.url));
const target = resolve(source, '../audit-evidence/production-release');
const backup = resolve(source, '../audit-evidence/visual-editor-baseline');
await mkdir(backup, { recursive: true });
function replaceOnce(text, needle, replacement, marker) {
  if (text.includes(marker)) return text;
  if (!text.includes(needle)) throw new Error(`Integration point changed: ${marker}`);
  return text.replace(needle, () => replacement);
}
async function preserve(file) {
  const contents = await readFile(resolve(target, file), 'utf8');
  const path = resolve(backup, file); await mkdir(dirname(path), { recursive: true });
  try { await writeFile(path, contents, { flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  return contents;
}

let app = (await preserve('js/app.js')).replace(/\r\n/g, '\n');
app = replaceOnce(app, 'const IS_ADMIN_HOST = /(^|\\.)admin\\.crackersmela\\.com$/i.test(location.hostname) || (LOCAL_HOST && location.hostname === \'127.0.0.1\');', "const IS_ADMIN_HOST = !window.CM_EDITOR_PREVIEW && (/(^|\\.)admin\\.crackersmela\\.com$/i.test(location.hostname) || (LOCAL_HOST && location.hostname === '127.0.0.1'));", 'const IS_ADMIN_HOST = !window.CM_EDITOR_PREVIEW');
app = replaceOnce(app, 'const analyticsConsent = () => { try', 'const analyticsConsent = () => { if (window.CM_EDITOR_PREVIEW) return false; try', 'analyticsConsent = () => { if (window.CM_EDITOR_PREVIEW)');
app = replaceOnce(app, 'const initAnalyticsConsent = () => {\n    if (IS_ADMIN_HOST) return;', 'const initAnalyticsConsent = () => {\n    if (IS_ADMIN_HOST || window.CM_EDITOR_PREVIEW) return;', 'IS_ADMIN_HOST || window.CM_EDITOR_PREVIEW');
app = replaceOnce(app, 'const route = () => {', 'const route = () => {\n    window.CMCms?.beforeRoute();', 'window.CMCms?.beforeRoute();');
app = replaceOnce(app, "const m = ROUTES.find(r => new RegExp('^' + r.re.source + '$').test(hashOnly));", "const m = window.CMCms?.resolveRoute(raw, ROUTES) || ROUTES.find(r => new RegExp('^' + r.re.source + '$').test(hashOnly));", 'window.CMCms?.resolveRoute(raw, ROUTES)');
app = replaceOnce(app, '      const params = [];\n      const re =', '      const params = m.cmsId ? [...(m.cmsParams || [])] : [];\n      const re =', 'const params = m.cmsId');
app = replaceOnce(app, 'currentRoute = { name: m.name, params, query };', 'currentRoute = { name: m.name, params, query, ...(m.cmsId ? { cmsId: m.cmsId, templatePage: m.templatePage } : {}) };', 'cmsId: m.cmsId, templatePage: m.templatePage');
app = replaceOnce(app, '    trackPageView();\n  };', '    trackPageView();\n    window.CMCms?.afterRoute(currentRoute);\n  };', 'window.CMCms?.afterRoute(currentRoute);');
app = replaceOnce(app, "      { id: 'canvas', label: 'Canvas Editor', icon: I2.palette },", "      { id: 'visual-editor', label: 'Visual Website Editor', icon: I2.layers },\n      { id: 'canvas', label: 'Canvas Editor', icon: I2.palette },", "id: 'visual-editor'");
app = replaceOnce(app, 'const switchAdminPanel = p => {', "const switchAdminPanel = p => {\n    if (p === 'visual-editor') { location.href = '/visual-editor'; return; }", "p === 'visual-editor'");
app = replaceOnce(app, 'const filterShop = (st) => {', 'const filterShop = (st, cmsDefault = false) => {', 'const filterShop = (st, cmsDefault = false)');
app = replaceOnce(app, '    return list;\n  };\n\n  const activeTokens', '    return cmsDefault ? list : (window.CMCms?.orderProducts(list, st, currentRoute) || list);\n  };\n\n  const activeTokens', 'window.CMCms?.orderProducts(list, st, currentRoute)');
// Explicit editor refreshes reuse the real read endpoints, without intermediate
// paints or background refreshes interrupting a pointer gesture.
for (const [name,end] of [['syncCatalogPull','  /* ---- cross-origin product-data'],['syncProductsPull','  /* ---- background removal']]) {
  const start=app.indexOf(`  const ${name} = `), stop=app.indexOf(end,start);
  if(start<0||stop<0)throw new Error('Catalog refresh integration point changed');
  let part=app.slice(start,stop);
  if(!part.includes('cmsQuiet')) {
    part=part.replace(`const ${name} = () =>`,`const ${name} = (cmsQuiet = false) =>`)
      .replace('if (!j || j.ok !== true) return;', "if (!j || j.ok !== true) { if(cmsQuiet) throw new Error('The product catalog could not be refreshed.'); return; }")
      .replace("if (location.hash.startsWith('#/products')", "if (!cmsQuiet && (location.hash.startsWith('#/products')")
      .replace("location.hash.startsWith('#/product/')) route();", "location.hash.startsWith('#/product/'))) route();")
      .replace('if (!IS_ADMIN_HOST) {','if (!IS_ADMIN_HOST && !cmsQuiet) {')
      .replace('.catch(() => {});','.catch(error => { if(cmsQuiet) throw error; });');
    app=app.slice(0,start)+part+app.slice(stop);
  }
}
app=app.replace("window.addEventListener('focus', debounce(() => { syncCatalogPull(); syncProductsPull(); }, 500));", "window.addEventListener('focus', debounce(() => { if(!window.CM_EDITOR_PREVIEW) { syncCatalogPull(); syncProductsPull(); } }, 500));");
app=app.replace('setInterval(() => { syncProductsPull(); }, 25000);','setInterval(() => { if(!window.CM_EDITOR_PREVIEW) syncProductsPull(); }, 25000);');
const bridge = `  /* CM_VISUAL_EDITOR_BRIDGE: all product markup still comes from the real catalog. */
  window.CMStorefront = Object.freeze({
    ready: () => ensureCsrf(),
    productContext: () => currentRoute?.name === 'products' ? { route: currentRoute, shop: shopState(currentRoute), ids: filterShop(shopState(currentRoute), true).map(product => product.id) } : null,
    firstProductRoute: () => allProducts()[0] ? '#/product/' + routePart(slugOf(allProducts()[0])) : '#/product/p-26',
    unavailable: () => { document.getElementById('view').innerHTML = views.notFound(); updateSeo({ name: 'notFound' }, []); setupReveal(); },
    renderProducts: (container, options = {}) => {
      let products = currentRoute?.name === 'products' ? filterShop(shopState(currentRoute)) : allProducts();
      if (Array.isArray(options.productIds) && options.productIds.length) { const ids = new Set(options.productIds.map(Number)); products = products.filter(product => ids.has(product.id)); }
      if (options.category && options.category !== 'all') products = products.filter(product => product.cats.includes(options.category));
      products = [...products];
      if (options.sort === 'price-asc') products.sort((a, b) => priceOf(a) - priceOf(b));
      else if (options.sort === 'price-desc') products.sort((a, b) => priceOf(b) - priceOf(a));
      else if (options.sort === 'newest') products.sort((a, b) => b.id - a.id);
      else if (options.sort === 'name') products.sort((a, b) => a.shortName.localeCompare(b.shortName));
      else products.sort((a, b) => Number(featuredOf(b)) - Number(featuredOf(a)));
      const limit = Math.max(1, Math.min(60, Number(options.limit) || 12));
      container.innerHTML = products.slice(0, limit).map(product => productCard(product)).join('');
      container.querySelectorAll('.reveal').forEach(node => node.classList.add('in'));
    },
  });

`;
app = replaceOnce(app, '  fbInit();', bridge + '  fbInit();', 'CM_VISUAL_EDITOR_BRIDGE');
// Upgrade the bridge in a previously integrated candidate without rebuilding app.js.
if (!app.includes('firstProductRoute: () =>')) app = app.replace('    ready: () => ensureCsrf(),', "    ready: () => ensureCsrf(),\n    firstProductRoute: () => allProducts()[0] ? '#/product/' + routePart(slugOf(allProducts()[0])) : '#/product/p-26',\n    unavailable: () => { document.getElementById('view').innerHTML = views.notFound(); updateSeo({ name: 'notFound' }, []); setupReveal(); },");
if (!app.includes('productContext: () =>')) app = app.replace('    ready: () => ensureCsrf(),', "    ready: () => ensureCsrf(),\n    productContext: () => currentRoute?.name === 'products' ? { route: currentRoute, shop: shopState(currentRoute), ids: filterShop(shopState(currentRoute), true).map(product => product.id) } : null,");
if (!app.includes('refreshProductView: () =>')) app=app.replace('    ready: () => ensureCsrf(),', "    ready: () => ensureCsrf(),\n    refreshProducts: () => Promise.all([syncCatalogPull(true), syncProductsPull(true)]),\n    refreshProductView: () => route(),");
await writeFile(resolve(target, 'js/app.js'), app);

let index = await preserve('index.html');
index = replaceOnce(index, '</head>', '<link rel="stylesheet" href="/css/cms-content.css?v=20261003">\n</head>', '/css/cms-content.css');
index = replaceOnce(index, '<script src="js/app.js', '<script src="/js/cms-runtime.js?v=20261003"></script>\n<script src="js/app.js', '/js/cms-runtime.js');
index = index.replace(/js\/app\.js\?v=[^"']+/g, 'js/app.js?v=20261004-order1');
index = replaceOnce(index, '<script src="/js/cms-runtime.js', '<script src="/js/cms-responsive.js?v=20261005-responsive1"></script>\n<script src="/js/cms-runtime.js', '/js/cms-responsive.js');
index = index.replace(/(cms-content\.css|cms-runtime\.js)\?v=[^"']+/g, '$1?v=20261005-responsive1');
await writeFile(resolve(target, 'index.html'), index);

let htaccess = await preserve('.htaccess');
// Move the first editor-only rules below the existing HTTPS and private-file rules.
htaccess = htaccess.replace(/\r\n/g, '\n').replace(/\n# Structured visual CMS: authenticated PHP entry point\.\nRewriteRule \^visual-editor\/\?\$ visual-editor\.php \[L\]\nRewriteRule [^\n]+\n?/, '\n');
const editorialRules = `# CM_DYNAMIC_PAGES_BEGIN
RewriteRule ^visual-editor/?$ visual-editor.php [L]
RewriteRule ^(?:cm-cms|editor-shell)\\.(?:php|html)$ - [F,L,NC]
# Editorial pages retain their URLs; publication state decides whether they exist.
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(about|contact|faq|shipping|safety|wholesale|returns|terms|privacy)/?$ cms-page.php?slug=$1 [QSA,L]
# CM_DYNAMIC_PAGES_END

`;
htaccess = replaceOnce(htaccess, 'RewriteCond %{REQUEST_FILENAME} !-f', editorialRules + 'RewriteCond %{REQUEST_FILENAME} !-f', '# CM_DYNAMIC_PAGES_BEGIN');
if (!htaccess.includes('# CM_CUSTOM_PAGE_FALLBACK')) htaccess += `
# CM_CUSTOM_PAGE_FALLBACK: existing commerce/asset routes above keep precedence.
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^([a-z0-9]+(?:-[a-z0-9]+)*)/?$ cms-page.php?slug=$1 [QSA,L]
`;
await writeFile(resolve(target, '.htaccess'), htaccess);

let robots = await preserve('robots.txt');
if (!robots.includes('Sitemap: https://crackersmela.com/cms-sitemap.php')) robots = robots.trimEnd() + '\nSitemap: https://crackersmela.com/cms-sitemap.php\n';
await writeFile(resolve(target, 'robots.txt'), robots);

let sitemap = (await preserve('sitemap.php')).replace(/\r\n/g, '\n');
sitemap = replaceOnce(sitemap, '<?php', "<?php\n// CM_CMS_SITEMAP_MODULE: reuse the same private page state.\nrequire_once __DIR__ . '/cm-cms.php';", 'CM_CMS_SITEMAP_MODULE');
const sitemapPages = `
// CM_CMS_SITEMAP_PAGES: keep commerce URLs, gate editorial tombstones, add live custom pages.
foreach (['about','contact','faq','shipping','safety','wholesale','returns','terms','privacy'] as $cmsPageId) {
    $cmsPageRecord = cmCmsRecord(cmCmsStore($cmsPageId), $cmsPageId);
    if (in_array($cmsPageRecord['status'] ?? '', ['unpublished','deleted'], true)) unset($urls['/' . $cmsPageId]);
}
foreach (cmCmsRegistry()['pages'] as $cmsPageId => $cmsPageMeta) {
    $cmsPageRecord = cmCmsRecord(cmCmsStore($cmsPageId), $cmsPageId);
    if (($cmsPageRecord['status'] ?? '') === 'published' && $cmsPageRecord['published'] !== null) $urls['/' . $cmsPageMeta['slug']] = '0.5';
}
`;
if (!sitemap.includes('CM_CMS_SITEMAP_PAGES')) {
  const insertion = /^\$urls = \[[^\n]*\];/m;
  if (!insertion.test(sitemap)) throw new Error('Integration point changed: sitemap page list');
  sitemap = sitemap.replace(insertion, match => match + sitemapPages);
}
await writeFile(resolve(target, 'sitemap.php'), sitemap);

const files = [];
async function copyAssets(directory, prefix = '') {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + item.name;
    if (item.isDirectory() && ['js', 'css'].includes(name)) await copyAssets(resolve(directory, item.name), name + '/');
    else if (item.isFile() && (name.endsWith('.php') || name === 'editor-shell.html' || /^(js|css)\/[^/]+\.(js|css)$/.test(name))) {
      await mkdir(dirname(resolve(target, name)), { recursive: true });
      await cp(resolve(source, name), resolve(target, name)); files.push(name);
    }
  }
}
await copyAssets(source);
files.push('js/app.js', 'index.html', '.htaccess', 'robots.txt', 'sitemap.php');
const manifest = [];
for (const file of files.sort()) { const content = await readFile(resolve(target, file)); manifest.push({ file, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') }); }
await writeFile(resolve(source, 'release-manifest.json'), JSON.stringify({ target: relative(resolve(source, '..'), target), files: manifest }, null, 2) + '\n');
console.log(`Integrated ${files.length} files into the existing production candidate. Baseline preserved outside the document root.`);
