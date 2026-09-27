import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const reviewDirectory = dirname(fileURLToPath(import.meta.url));
const publicDirectory = resolve(reviewDirectory, 'public');
const fixtureDirectory = resolve(reviewDirectory, 'fixtures');
const publicEntry = 'http://localhost:4173/#/';
const adminEntry = 'http://localhost:4174/#/staff';
const previewMessage = 'Local UI preview only. The deployed backend source is unavailable, so this action cannot be completed or saved.';
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'], ['.avif', 'image/avif'], ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'], ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'], ['.woff2', 'font/woff2'], ['.ttf', 'font/ttf'],
]);

const securityHeaders = {
  'Content-Security-Policy': [
    "default-src 'none'",
    "base-uri 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "worker-src 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Cache-Control': 'no-store',
  'X-CrackersMela-Preview': 'ui-only-backend-unavailable',
};

function respond(request, response, statusCode, body, contentType = 'application/json; charset=utf-8') {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  response.writeHead(statusCode, { ...securityHeaders, 'Content-Type': contentType, 'Content-Length': Buffer.byteLength(payload) });
  response.end(request.method === 'HEAD' ? undefined : payload);
}

function backendUnavailable(request, response) {
  request.resume();
  respond(request, response, 503, {
    ok: false,
    preview: true,
    error: 'PREVIEW_BACKEND_UNAVAILABLE',
    message: previewMessage,
  });
}

// These selectors correspond to the recovered frontend's write handlers. This
// is a preview affordance, not authorization or a substitute for a real backend.
export function installPreviewWriteGuard() {
  if (!window.CM_PREVIEW?.isAdmin) return;
  const reason = 'Unavailable: production backend source required';
  const writes = [
    '[data-save-product]', '[data-save-edit]', '[data-del-prod]',
    '[data-maint-toggle]', '#saveCoupon', '#resetCoupon', '#resetAll', '#resetAllB',
    '#posPlace', '#posWa', '#posHold', '[data-held-restore]', '[data-held-del]',
    '[data-notif-read]', '[data-notif-clear]', '#apFile', '#epFile',
    '[data-status]', '[data-stock]', '[data-price]', '[data-feat]',
  ].join(',');
  const instantWrites = '[data-status],[data-stock],[data-price],[data-feat],#apFile,#epFile';
  const initial = new WeakMap();
  const mark = element => {
    if (!initial.has(element)) initial.set(element, { value: element.value, checked: element.checked });
    element.setAttribute('aria-disabled', 'true');
    element.setAttribute('title', reason);
    element.setAttribute('data-cm-preview-unavailable', '');
    if (element.matches('#apFile,#epFile')) element.closest('.img-file')?.setAttribute('title', reason);
  };
  const markTree = root => {
    if (root.nodeType !== 1) return;
    if (root.matches(writes)) mark(root);
    root.querySelectorAll(writes).forEach(mark);
  };
  const announce = () => {
    const message = document.getElementById('cm-preview-message');
    if (message) message.textContent = `${reason}. Nothing was saved.`;
  };
  const preventWrite = event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    let control = target.closest(writes);
    if (event.type === 'submit') {
      control = event.submitter?.closest(writes) || target.querySelector('[data-save-product],[data-save-edit]');
    }
    if (!control) return;
    if (event.type !== 'click' && event.type !== 'submit' && !control.matches(instantWrites)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    mark(control);
    if (event.type === 'input' || event.type === 'change') {
      const prior = initial.get(control);
      if (control.matches('#apFile,#epFile')) control.value = '';
      else {
        if (prior.value !== undefined) control.value = prior.value;
        if (prior.checked !== undefined) control.checked = prior.checked;
      }
    }
    announce();
  };
  for (const type of ['click', 'submit', 'beforeinput', 'input', 'change']) {
    window.addEventListener(type, preventWrite, { capture: true });
  }
  const observer = new MutationObserver(records => {
    for (const record of records) record.addedNodes.forEach(markTree);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => markTree(document.body), { once: true });
}

// The local-only notice takes real layout space. Full-height POS panels must
// account for its wrapping text rather than pushing their bottom tabs offscreen.
export function installPreviewNoticeLayout() {
  document.addEventListener('DOMContentLoaded', () => {
    const notice = document.querySelector('.cm-preview-notice');
    if (!notice) return;
    const measure = () => {
      document.documentElement.style.setProperty('--cm-preview-notice-height', `${Math.ceil(notice.getBoundingClientRect().height)}px`);
    };
    measure();
    if (typeof ResizeObserver === 'function') new ResizeObserver(measure).observe(notice);
    window.addEventListener('resize', measure, { passive: true });
  }, { once: true });
}

function renderPreview(html, isAdmin) {
  const preview = { isAdmin, publicEntry, adminEntry, user: isAdmin ? { name: 'Local review admin', email: 'review@example.test', role: 'admin' } : null };
  const bootstrap = `<script>window.CM_PREVIEW=${JSON.stringify(preview)};if(window.CM_PREVIEW.user)Object.freeze(window.CM_PREVIEW.user);Object.freeze(window.CM_PREVIEW);(${installPreviewWriteGuard.toString()})();(${installPreviewNoticeLayout.toString()})();</script>`;
  const notice = `<aside class="cm-preview-notice" role="note" aria-label="Local preview limitations"><span id="cm-preview-message" role="status" aria-live="polite"><strong>Local UI preview</strong> — backend unavailable; changes cannot be saved.</span><nav aria-label="Local preview sites"><a href="${publicEntry}">Storefront</a><a href="${adminEntry}">Admin preview</a></nav></aside>`;
  const noticeStyle = `<style>.cm-preview-notice{position:relative;z-index:0;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:6px 20px;padding:9px 16px;background:#fff7df;color:#5a4000;border-bottom:1px solid #ead7a3;font:12px/1.5 system-ui,sans-serif;text-align:center}.cm-preview-notice nav{display:flex;gap:14px}.cm-preview-notice a{color:#354f79;text-decoration:underline;text-underline-offset:2px}.cm-preview-notice a:focus-visible{outline:2px solid currentColor;outline-offset:3px}[data-cm-preview-unavailable]{cursor:not-allowed;opacity:.65}html body.pos-mode .app-shell,html body.pos-mode .admin-shell,html body.pos-mode .admin-body{height:calc(100vh - var(--cm-preview-notice-height,0px));height:calc(100dvh - var(--cm-preview-notice-height,0px));min-height:0}@media print{.cm-preview-notice{display:none}}</style>`;
  return html
    // The preview never loads production authentication or analytics SDKs.
    .replace(/<script\b[^>]*\bsrc=["'](?:https?:)?\/\/[^"']*["'][^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<meta\s+name=["']robots["'][^>]*>/gi, '<meta name="robots" content="noindex, nofollow">')
    .replace(/<head([^>]*)>/i, `<head$1>${bootstrap}${noticeStyle}`)
    .replace(/<body([^>]*)>/i, `<body$1>${notice}`);
}

function isPublicAsset(pathname) {
  if (pathname === '/index.html') return true;
  if (!/^\/(css|js|images|fonts)\//.test(pathname)) return false;
  const name = pathname.split('/').at(-1);
  if (/(^|[._-])(config|secret|credentials|env)([._-]|$)/i.test(name)) return false;
  return mimeTypes.has(extname(pathname).toLowerCase()) && extname(pathname).toLowerCase() !== '.html';
}

export function createPreviewServer({ isAdmin = false, port }) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('A valid local preview port is required.');
  const expectedHosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
  const server = http.createServer(async (request, response) => {
    try {
      if (!expectedHosts.has((request.headers.host || '').toLowerCase())) {
        respond(request, response, 421, { ok: false, message: 'Use the local preview address.' });
        return;
      }
      const target = request.url || '/';
      if (!target.startsWith('/') || target.startsWith('//')) {
        respond(request, response, 400, { ok: false, message: 'Invalid request path.' });
        return;
      }
      let pathname;
      try { pathname = decodeURIComponent(target.split('?')[0]); }
      catch { respond(request, response, 400, { ok: false, message: 'Invalid request path.' }); return; }
      const segments = pathname.split('/');
      if (/[\u0000-\u001f\\:]/.test(pathname) || segments.some(segment => segment.startsWith('.'))) {
        respond(request, response, 403, { ok: false, message: 'This path is not available in the preview.' });
        return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        backendUnavailable(request, response);
        return;
      }
      const url = new URL(target, `http://127.0.0.1:${port}`);
      const fixture = new Map([['/products-api.php', 'products.json'], ['/catalog-api.php', 'catalog.json']]).get(pathname);
      if (fixture && (!url.searchParams.has('a') || url.searchParams.get('a') === 'pull')) {
        const snapshot = JSON.parse(await readFile(resolve(fixtureDirectory, fixture), 'utf8'));
        respond(request, response, 200, snapshot);
        return;
      }
      if (fixture || /\.php(?:\/|$)/i.test(pathname) || /^\/(api|orders|email|upload|analytics)(\/|$)/i.test(pathname)) {
        backendUnavailable(request, response);
        return;
      }
      if (pathname === '/robots.txt') {
        respond(request, response, 200, 'User-agent: *\nDisallow: /\n', 'text/plain; charset=utf-8');
        return;
      }
      if (pathname === '/') pathname = '/index.html';
      if (!isPublicAsset(pathname)) {
        respond(request, response, 404, { ok: false, message: 'This page or file is not available in the local preview.' });
        return;
      }
      const root = await realpath(publicDirectory);
      const file = await realpath(resolve(root, `.${pathname}`));
      const withinRoot = relative(root, file);
      if (!withinRoot || withinRoot === '..' || withinRoot.startsWith(`..${sep}`) || isAbsolute(withinRoot)) {
        respond(request, response, 403, { ok: false, message: 'This path is not available in the preview.' });
        return;
      }
      if (!(await stat(file)).isFile()) {
        respond(request, response, 404, { ok: false, message: 'File not found.' });
        return;
      }
      const type = mimeTypes.get(extname(file).toLowerCase());
      const content = pathname === '/index.html' ? renderPreview(await readFile(file, 'utf8'), isAdmin) : await readFile(file);
      respond(request, response, 200, content, type);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
        respond(request, response, 404, { ok: false, message: 'File not found in the local preview.' });
      } else {
        console.error('Local preview request failed:', error.code || error.name || 'unknown error');
        respond(request, response, 500, { ok: false, message: 'The local preview could not load this file.' });
      }
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const servers = [{ isAdmin: false, port: 4173 }, { isAdmin: true, port: 4174 }].map(options => {
    const server = createPreviewServer(options);
    server.on('error', error => {
      console.error(`Cannot start local preview on port ${options.port}: ${error.code || error.name}`);
      for (const active of servers) active.close();
      process.exitCode = 1;
    });
    server.listen(options.port, '127.0.0.1', () => console.log(`${options.isAdmin ? 'Admin UI' : 'Public UI'} preview: http://localhost:${options.port}/ — backend unavailable`));
    return server;
  });
  const close = () => { for (const server of servers) server.close(); };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}
