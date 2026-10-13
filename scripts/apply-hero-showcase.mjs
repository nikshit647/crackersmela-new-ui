import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'audit-evidence/home-showcase-20261013/candidate');
function edit(name, changes) {
  const file = path.join(root, name); let source = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  for (const [old, next] of changes) {
    if (source.includes(next)) continue;
    if (source.split(old).length !== 2) throw new Error('Expected one patch location in ' + name + ': ' + old.slice(0, 85));
    source = source.replace(old, next);
  }
  writeFileSync(file, source);
}
for (const name of ['js/hero-showcase.js', 'css/hero-showcase.css']) { mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); copyFileSync(path.join('visual-editor', name), path.join(root, name)); }
const appPath = path.join(root, 'js/app.js');
let source = readFileSync(appPath, 'utf8').replace(/\r\n/g, '\n');
// Old or in-flight HTML may request this bundle without the new script tag.
// Reuse the guarded module verbatim so it is always available synchronously.
const embeddedStart = '/* CM_HERO_COMPAT_START */';
const embeddedEnd = '/* CM_HERO_COMPAT_END */';
if (source.includes(embeddedStart)) {
  const end = source.indexOf(embeddedEnd);
  if (!source.startsWith(embeddedStart) || end < 0) throw new Error('Unexpected embedded hero module');
  source = source.slice(end + embeddedEnd.length).replace(/^\r?\n/, '');
}
source = embeddedStart + '\n' + readFileSync(path.join('visual-editor', 'js/hero-showcase.js'), 'utf8').replace(/\r\n/g, '\n') + '\n' + embeddedEnd + '\n' + source;
writeFileSync(appPath, source);
if (!source.includes('/* CM_FEATURED_HERO */')) {
  const start = source.indexOf('    /* hero composition — real catalog photography, deterministic */');
  const end = source.indexOf('    const arrivalPills =', start);
  if (start < 0 || end < start) throw new Error('Hero selection not found');
  source = source.slice(0, start) + source.slice(end);
  source = source.replace('    const withImg = stock.filter(p => p.image);\n', '');
  const cardStart = source.indexOf('            ${heroShots.map(');
  const cardEnd = source.indexOf('            <div class="hero-chip', cardStart);
  if (cardStart < 0 || cardEnd < cardStart) throw new Error('Hero cards not found');
  source = source.slice(0, cardStart) + '            ${window.CMHeroShowcase.render(heroShowcaseProducts())}\n' + source.slice(cardEnd);
  writeFileSync(appPath, source);
}
const helper = `  /* CM_FEATURED_HERO */
  const heroShowcaseProducts = () => allProducts().map(p => ({
    id: p.id, featured: featuredOf(p), name: p.name || p.shortName, shortName: p.shortName || p.name,
    href: publicPath('/product/' + routePart(slugOf(p))), category: catLabel(p)?.name || '', priceText: money(priceOf(p)),
    imageMarkup: productImageMarkup(p, 400, 'hero'), imageSrc: nobgSrc(safeImageSrc(p.image)) || safeImageSrc(p.image),
    brandMarkup: window.CMProductBrand.render(p, { compact: true }),
  }));
  const refreshHeroShowcase = () => window.CMHeroShowcase?.refresh(heroShowcaseProducts());
  const mountHeroShowcase = () => window.CMHeroShowcase?.mount(document.querySelector('#view .hero-stage'), heroShowcaseProducts());
  document.addEventListener('cm:cms-applied', mountHeroShowcase);
  /* END_CM_FEATURED_HERO */
`;
edit('js/app.js', [
  ['  const timeAgo = iso => {', helper + '  const timeAgo = iso => {'],
  ["loading=\"${kind === 'detail' ? 'eager' : 'lazy'}\"${kind === 'detail' ? ' fetchpriority=\"high\"' : ''}", "loading=\"${kind === 'detail' || kind === 'hero' ? 'eager' : 'lazy'}\"${kind === 'detail' || kind === 'hero' ? ' fetchpriority=\"high\"' : ''}"],
  ['    window.CMCms?.beforeRoute();', '    window.CMHeroShowcase?.destroy();\n    window.CMCms?.beforeRoute();'],
  ['    window.CMCms?.afterRoute(currentRoute);', '    window.CMCms?.afterRoute(currentRoute);\n    mountHeroShowcase();'],
  ['        save();\n        syncCouponCart();', '        save();\n        refreshHeroShowcase();\n        syncCouponCart();'],
  ['        if (changed) save();\n        syncCouponCart();', '        if (changed) save();\n        refreshHeroShowcase();\n        syncCouponCart();'],
  ["setInterval(() => { if(!window.CM_EDITOR_PREVIEW) syncProductsPull(); }, 25000);", "setInterval(() => { if(!window.CM_EDITOR_PREVIEW) { syncCatalogPull(); syncProductsPull(); } }, 25000);"],
]);
edit('js/cms-runtime.js', [
  ['.hero-stats,.hero-shot__tag,', '.hero-stats,.hero-shot,.hero-shot__tag,'],
  ['const allowContainer = node === root ||', "const allowContainer = node === root || node.matches('.hero-shot') ||"],
]);
console.log('Integrated featured hero rendering, catalog refresh, and cleanup in candidate.');
