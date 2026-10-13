// Patch the verified live release, retaining repairs made outside this change.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.argv[2] || 'audit-evidence/home-showcase-20261013/candidate');
function change(file, edit) {
  const target = path.join(root, file);
  writeFileSync(target, edit(readFileSync(target, 'utf8')));
}
function replaceOnce(source, before, after) {
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before)) throw Error('Unexpected source: ' + before.slice(0, 80));
  return source.replace(before, after);
}
change('js/cms-runtime.js', source => {
  if (source.includes('CM_PUBLICATION_BOOTSTRAP')) return source;
  source = replaceOnce(source, '  async function afterRoute(route) {', `  /* CM_PUBLICATION_BOOTSTRAP: share the HTTP publication with the first
     interactive render. Never paint a native default while fetching Home. */
  const publications = new Map(), publicationReads = new Map();
  try {
    const initial = JSON.parse(document.getElementById?.('cm-cms-bootstrap')?.textContent || 'null');
    if (initial && typeof initial.page === 'string' && Object.hasOwn(initial, 'published')) publications.set(initial.page, initial);
  } catch { /* A malformed optional bootstrap can be retried through the API. */ }
  function readPublication(page, share = true) {
    if (share && publicationReads.has(page)) return publicationReads.get(page);
    const pending = fetch('/cms-api.php?a=published&page=' + encodeURIComponent(page), { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) { const error = new Error('Published page unavailable'); error.code = result?.code; throw error; }
        if (publicationReads.get(page) === pending) publications.set(page, result);
        return result;
      }).finally(() => { if (publicationReads.get(page) === pending) publicationReads.delete(page); });
    publicationReads.set(page, pending); return pending;
  }
  function prepareRoute(route) {
    if (window.CM_EDITOR_PREVIEW) return null;
    const page = pageId(route);
    return publications.has(page) ? null : readPublication(page);
  }
  async function afterRoute(route) {`);
  const start = source.indexOf('    const page = state.page; const request = ++state.request;', source.indexOf('  async function afterRoute(route)'));
  const end = source.indexOf('\n  }\n  if (typeof window', start);
  if (start < 0 || end < 0) throw Error('Publication block not found');
  source = source.slice(0, start) + `    const page = state.page; const request = ++state.request;
    const sourcePage = state.sharedOnly ? 'home' : page;
    const project = result => {
      const published = withSharedNavigation(state.sharedOnly ? baseline : result.published || result.document || baseline, result.globals, baseline);
      state.published.set(page, published);
      apply(published);
      // The server's projection is replaced in this same task by runtime CSS.
      document.querySelectorAll('style[data-cm-initial-css]').forEach(node => node.remove());
    };
    const cached = publications.get(sourcePage);
    if (cached) project(cached);
    try {
      const result = await readPublication(sourcePage, false);
      if (request === state.request && page === state.page) project(result);
    } catch (error) {
      if (error.code === 'page_unavailable' && request === state.request) window.CMStorefront?.unavailable();
      // Preserve the last published view on a transient read failure.
    }` + source.slice(end);
  source = replaceOnce(source, 'Object.freeze({ beforeRoute, afterRoute, apply,', 'Object.freeze({ beforeRoute, afterRoute, prepareRoute, apply,');
  source = replaceOnce(source, 'Object.freeze({ beforeRoute, afterRoute, prepareRoute, apply,', "Object.freeze({ beforeRoute, afterRoute, prepareRoute, promoMessages: () => publications.get('home')?.globals?.promo?.content?.promoMessages, apply,");
  return source;
});
change('js/app.js', source => {
  if (source.includes('CM_HOME_PUBLICATION_READY')) return source;
  source = replaceOnce(source, "  const route = () => {\n    const raw = location.hash || '#/';", `  let homeNavigation = 0;
  const route = () => {
    const raw = location.hash || '#/';
    const navigation = ++homeNavigation;
    /* CM_HOME_PUBLICATION_READY: keep the current published view until the
       destination Home document is available; no default homepage is painted. */
    if (!IS_ADMIN_HOST && raw.split('?')[0] === '#/' && (location.hash || /^\\/(?:index\\.html)?$/.test(location.pathname)) && !window.CMCms?.pageContext()?.id?.startsWith('custom-')) {
      const publication = window.CMCms?.prepareRoute({ name: 'home' });
      if (publication) {
        publication.then(() => { if (navigation === homeNavigation) route(); })
          .catch(() => { if (navigation === homeNavigation) toast('The homepage could not be loaded. Please refresh to try again.', 'err'); });
        return;
      }
    }`);
  source = replaceOnce(source, "const maintReady = refreshSession().then(() => { if (currentRoute) { accountUI(); route(); } });", "const maintReady = refreshSession().then(() => { if (currentRoute) { accountUI(); if (IS_ADMIN_HOST || ['maintenance', 'account', 'checkout', 'myOrders'].includes(currentRoute.name)) route(); } });");
  source = replaceOnce(source, "Promise.race([Promise.all([maintReady, syncCatalogPull(), syncProductsPull()]), new Promise(r => setTimeout(r, 1800))]).then(() => {\n      route();", "Promise.allSettled([maintReady, syncCatalogPull(), syncProductsPull()]).then(() => {\n      if (IS_ADMIN_HOST || currentRoute?.name !== 'home') route();");
  source = replaceOnce(source, "    view.innerHTML = out || '';\n    window.scrollTo(0, 0);\n    updateSeo(m || { name: 'notFound' }, currentRoute.params);\n    postRoute(raw, m);", "    view.innerHTML = out || '';\n    updateSeo(m || { name: 'notFound' }, currentRoute.params);\n    postRoute(raw, m);\n    // Scroll after synchronous publication layout, avoiding browser anchor compensation.\n    window.scrollTo(0, 0);");
  source = replaceOnce(source, 'function renderPromo(messages = promoMessages()) {', 'function renderPromo(messages = window.CMCms?.promoMessages?.() || promoMessages()) {');
  return source;
});
console.log('Applied published homepage startup and catalog-content ownership.');
