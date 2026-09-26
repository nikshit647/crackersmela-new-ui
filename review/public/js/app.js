/* ============================================================
   CrackersMela — front-end application (client renderer)
   Blue glassmorphism SPA. No framework. No external runtime deps.

   Local review of the recovered deployed frontend. The deployed
   PHP backend source is missing. Public cart/preferences may use
   localStorage; private order/account data stays in page memory.
   A verified backend must remain the source of truth for accounts,
   prices, stock, discounts and orders before any production use.
   ============================================================ */
(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const DATA = window.CM_DATA || { categories: [], products: [], store: {} };
  const STORE = DATA.store;
  STORE.minOrder = 2500;
  STORE.freeDeliveryAbove = STORE.freeDeliveryAbove || 2500;
  const CATS = DATA.categories;
  const PRODUCTS = DATA.products;

  /* ---------------- helpers ---------------- */
  const money = n => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const routePart = value => encodeURIComponent(String(value ?? ''));
  const readRoutePart = value => { try { return decodeURIComponent(String(value ?? '')); } catch { return ''; } };
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const debounce = (fn, ms = 180) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const fmtDate = iso => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const catById = () => Object.fromEntries(CATS.map(c => [c.id, c]));
  const CAT_MAP = catById();

  const catLabel = p => {
    for (const id of ['gift-boxes', 'bombs', 'garlands', 'chakkars', 'rockets', 'fancy', 'night-outs', 'flower-pots', 'sparklers', 'guns-rolls', 'kids-special']) {
      if (p.cats && p.cats.includes(id) && CAT_MAP[id]) return CAT_MAP[id];
    }
    return CAT_MAP[p.primary] || CAT_MAP.fancy;
  };

  const priceOf = p => (priceOverrides[p.id] != null ? Number(priceOverrides[p.id]) : p.price);
  const featuredOf = p => (featOn[p.id] != null ? !!featOn[p.id] : !!p.featured);
  const discountOf = p => p.compareAt && p.compareAt > priceOf(p) ? Math.round((1 - priceOf(p) / p.compareAt) * 100) : 0;

  /* Deterministic collection buckets (used by homepage pill filters) */
  const BEST_IDS = new Set([...PRODUCTS].sort((a, b) => b.salesCount - a.salesCount).slice(0, 34).map(p => p.id));
  const NEW_IDS = new Set([...PRODUCTS].sort((a, b) => b.id - a.id).slice(0, 34).map(p => p.id));
  const cardKeys = p => [...(p.cats || []), BEST_IDS.has(p.id) ? 'best' : '', NEW_IDS.has(p.id) ? 'new' : '', featuredOf(p) ? 'featured' : '', discountOf(p) >= 25 ? 'deal' : ''].filter(Boolean).join(' ');
  const stockLine = p => {
    const stock = Math.max(0, Math.floor(Number(stockOf(p)) || 0));
    if (!inStockOf(p)) return `<span class="stock-line out"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 9v4"/><circle cx="12" cy="17" r="0.4"/><circle cx="12" cy="12" r="9" stroke-dasharray="2 2"/></svg>Out of stock</span>`;
    if (stock <= 6) return `<span class="stock-line low"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.8 2.8M16.2 16.2 19 19M19 5l-2.8 2.8M7.8 16.2 5 19"/></svg>Only ${stock} left</span>`;
    return `<span class="stock-line in"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>In stock</span>`;
  };
  const stars = r => '<span class="stars" aria-hidden="true">' + '★'.repeat(Math.round(r)) + '☆'.repeat(5 - Math.round(r)) + '</span>';
  /* Product image rendering keeps URLs as data, never as executable event code. */
  const safeImageSrc = value => {
    const src = String(value || '').trim();
    if (!src || /[\u0000-\u001f\u007f]/.test(src)) return '';
    try {
      const url = new URL(src, location.href);
      if (url.username || url.password) return '';
      if (url.protocol === 'https:' || (url.protocol === 'http:' && url.origin === location.origin)) return src;
    } catch { /* Invalid URLs use the normal image placeholder. */ }
    return '';
  };
  const nobgSrc = img => /^images\/products\/[^?#]+$/.test(img || '') ? 'images/products/nobg/' + img.split('/').pop().replace(/\.(png|jpe?g)$/i, '.webp') : '';
  const productImageMarkup = (p, w, kind = 'product') => {
    const src = safeImageSrc(p.image);
    const category = catLabel(p);
    if (!src) return kind === 'thumb' ? `<span class="th-fb">${catIcon(category)}</span>` : `<div class="prod-img-fallback">${catIcon(category)}</div>`;
    const nb = nobgSrc(src);
    const size = Number.isFinite(Number(w)) ? clamp(Math.round(Number(w)), 24, 1600) : 400;
    const dimensions = kind === 'thumb' ? '' : ` width="${size}" height="${size}"`;
    return `<img src="${esc(nb || src)}" alt="${kind === 'thumb' ? '' : esc(p.shortName)}" loading="lazy"${dimensions} data-cm-image="${kind}" data-image-category="${esc(category && category.id || '')}"${nb ? ` data-fallback-src="${esc(src)}"` : ''}>`;
  };
  const handleProductImageError = event => {
    const img = event.target;
    if (!img || img.tagName !== 'IMG' || !img.hasAttribute('data-cm-image')) return;
    const fallback = safeImageSrc(img.dataset.fallbackSrc);
    if (fallback) {
      delete img.dataset.fallbackSrc;
      img.src = fallback;
      return;
    }
    const placeholder = document.createElement(img.dataset.cmImage === 'thumb' ? 'span' : 'div');
    placeholder.className = img.dataset.cmImage === 'thumb' ? 'th-fb' : 'prod-img-fallback';
    if (img.alt) { placeholder.setAttribute('role', 'img'); placeholder.setAttribute('aria-label', img.alt); }
    placeholder.innerHTML = catIcon(CAT_MAP[img.dataset.imageCategory]);
    img.replaceWith(placeholder);
  };
  document.addEventListener('error', handleProductImageError, true);
  const imgOf = (p, w = 400) => productImageMarkup(p, w);
  const slugOf = p => p.slug || 'p-' + p.id;
  const prodUrl = p => publicRoute('#/product/' + slugOf(p));
  const uid = () => 'CM' + Date.now().toString(36).toUpperCase().slice(-6) + Math.random().toString(36).slice(2, 5).toUpperCase();
  const orderCode = () => 'CM' + Math.random().toString(36).slice(2, 7).toUpperCase();
  const isValidEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());

  /* Admin sub-site — the Staff/Admin console moved from the in-app #/staff route to
     its own hostname. While this SPA runs on admin.crackersmela.com it locks straight
     onto the staff console (the existing auth/role gates below are unchanged) and never
     renders the customer storefront. The old #/staff URL on the customer domain is
     migrated to the new admin host. */
  const PREVIEW = ['localhost', '127.0.0.1'].includes(location.hostname) ? window.CM_PREVIEW : null;
  const IS_ADMIN_HOST = PREVIEW ? PREVIEW.isAdmin : /(^|\.)admin\.crackersmela\.com$/i.test(location.hostname);
  const ADMIN_ENTRY = PREVIEW ? PREVIEW.adminEntry : 'https://admin.crackersmela.com/#/staff';
  const PUBLIC_ENTRY = PREVIEW ? PREVIEW.publicEntry : 'https://crackersmela.com/#/';
  const publicRoute = hash => IS_ADMIN_HOST ? PUBLIC_ENTRY.split('#')[0] + hash : hash;
  const CM_SYNC_KEY = ''; // The exposed production key must be revoked on the server.
  const ORDERS_API = 'orders-api.php';
  const EMAIL_API = 'email-api.php';

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- persistence ---------------- */
  const ls = {
    get(k, def) { try { const v = JSON.parse(localStorage.getItem('cm2.' + k)); return v === null || v === undefined ? def : v; } catch { return def; } },
    set(k, v) { try { localStorage.setItem('cm2.' + k, JSON.stringify(v)); } catch { /* quota */ } },
  };

  // Earlier clients cached customer records and password/session data. Do not
  // reuse those browser records as account or order data in the reviewed client.
  const clearPrivateCaches = () => {
    for (const key of ['orders', 'activity', 'session', 'users', 'heldBills']) {
      try { localStorage.removeItem('cm2.' + key); } catch { /* Storage may be blocked. */ }
    }
  };
  clearPrivateCaches();
  let privateDataRevision = 0;

  const storedArray = key => { const value = ls.get(key, []); return Array.isArray(value) ? value : []; };
  let cart = storedArray('cart').filter(c => c && Number.isInteger(c.id) && Number.isInteger(c.qty) && c.qty > 0).map(c => ({ id: c.id, qty: Math.min(c.qty, 50) }));
  let wish = storedArray('wish').filter(Number.isInteger);
  let recent = storedArray('recent').filter(Number.isInteger);
  let users = {};
  let orders = [];
  let stockOverrides = ls.get('stockOverrides', {});
  let priceOverrides = ls.get('priceOverrides', {});
  let featOn = ls.get('featOn', {});
  let extraProducts = ls.get('extraProducts', []);
  let productOverrides = ls.get('productOverrides', {});
  let activity = [];
  let admPrefs = ls.get('admPrefs', { theme: 'light', bell: 0 });
  let couponConfig = ls.get('coupon', { code: 'FREE10', discount: 10 });
  let checkoutCoupon = { code: null, discount: 0 };

  const save = () => { ls.set('cart', cart); ls.set('wish', wish); ls.set('recent', recent); ls.set('stockOverrides', stockOverrides); ls.set('priceOverrides', priceOverrides); ls.set('featOn', featOn); ls.set('extraProducts', extraProducts); ls.set('productOverrides', productOverrides); ls.set('admPrefs', admPrefs); ls.set('coupon', couponConfig); ls.set('cmSettings', cmSettings); };

  /* Merge fine-grained product edits (name, brand, desc, cats, price, image, stock,
     featured, display order, SEO, enabled) over the base catalog WITHOUT duplicates. */
  const mergeProduct = (base, ov) => {
    if (!ov) return base;
    const out = { ...base, ...ov };
    if (base) {
      if ('price' in ov && base.slug) out.slug = base.slug;
      if (ov.cats && Array.isArray(ov.cats)) out.cats = ov.cats;
      if (ov.primary) out.primary = ov.primary;
      if ('shortName' in ov) out.shortName = ov.shortName;
    }
    return out;
  };
  /* Production catalog — admin.crackersmela.com is the source of truth.
     mergedProducts(): seed catalog + admin overrides + admin-created products (disabled included, admin views).
     allProducts(): the live selling catalog (disabled excluded) used by the storefront and selling surfaces. */
  const mergedProducts = () => PRODUCTS.concat(extraProducts).map(p => mergeProduct(p, productOverrides[p.id]));
  const allProducts = () => mergedProducts().filter(p => !p.disabled);
  const prodById = id => allProducts().find(x => x.id === Number(id));
  const prodBySlug = slug => allProducts().find(x => x.slug === slug || 'p-' + x.id === slug);
  const timeAgo = iso => {
    try {
      const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1e3);
      if (s < 60) return 'just now';
      if (s < 3600) return Math.floor(s / 60) + 'm ago';
      if (s < 86400) return Math.floor(s / 3600) + 'h ago';
      return Math.floor(s / 86400) + 'd ago';
    } catch { return '—'; }
  };
  const pctChip = (num, den) => {
    if (!den) return '<span class="k-chip neutral">—</span>';
    const p = Math.round(((num - den) / den) * 100);
    const cls = p > 0 ? 'up' : p < 0 ? 'down' : 'neutral';
    return `<span class="k-chip ${cls}">${p > 0 ? '▲' : p < 0 ? '▼' : '•'} ${Math.abs(p)}%</span>`;
  };
  const statBadge = k => ({ placed: 'Pending', confirmed: 'Confirmed', packed: 'Packed', shipped: 'Processing', out_for_delivery: 'Processing', delivered: 'Delivered' }[k] || 'Pending');

  const stockOf = p => stockOverrides[p.id] !== undefined ? stockOverrides[p.id] : p.stock;
  const inStockOf = p => stockOf(p) > 0 && p.inStock;
  const saved = id => wish.includes(id);
  const cartQty = id => (cart.find(c => c.id === id) || {}).qty || 0;

  /* Role-based access — the maintenance guard and every staff gate share one rule.
     Existing frontend roles are 'admin', 'staff', 'customer'; the staff console also
     accepts mod / sales / billing / packer, which the store's permissions model treats
     as authenticated staff. */
  const STAFF_ROLES = ['admin', 'mod', 'sales', 'billing', 'packer', 'staff'];
  const isStaffRole = role => STAFF_ROLES.includes(role);

  /* The supplied backups have no deployed authentication server. Fail closed until
     a server-verified session is integrated. The loopback-only preview identity is
     for UI inspection; its server rejects every write and is never a deployable auth system. */
  const currentUser = () => PREVIEW && PREVIEW.user ? PREVIEW.user : null;

  /* Analytics adapter: GA4 and first-party events share one sanitized payload. */
  const ANALYTICS_ID = 'G-JEW1SZK6SP';
  const ANALYTICS_API = 'analytics-api.php';
  const analyticsSession = (() => {
    const key = 'cm2.analyticsSession';
    let v = '';
    try { v = localStorage.getItem(key) || ''; } catch (e) {}
    if (!v || typeof v !== 'string') { v = 's-' + Math.random().toString(36).slice(2) + Date.now().toString(36); try { localStorage.setItem(key, v); } catch (e) {} }
    return v;
  })();
  const analyticsDevice = () => /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : /Tablet|iPad/i.test(navigator.userAgent) ? 'tablet' : 'desktop';
  const analyticsBrowser = () => /Edg/i.test(navigator.userAgent) ? 'Edge' : /Chrome/i.test(navigator.userAgent) ? 'Chrome' : /Firefox/i.test(navigator.userAgent) ? 'Firefox' : /Safari/i.test(navigator.userAgent) ? 'Safari' : 'Other';
  const analyticsOS = () => /Windows/i.test(navigator.userAgent) ? 'Windows' : /Android/i.test(navigator.userAgent) ? 'Android' : /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'iOS' : /Mac OS/i.test(navigator.userAgent) ? 'macOS' : /Linux/i.test(navigator.userAgent) ? 'Linux' : 'Other';
  const analyticsCampaign = () => { const q = new URLSearchParams(location.search); return { utm_source: q.get('utm_source') || undefined, utm_medium: q.get('utm_medium') || undefined, utm_campaign: q.get('utm_campaign') || undefined }; };
  const analyticsRoute = () => (location.hash || '#/').split('?')[0];
  const analyticsConsent = () => { try { return localStorage.getItem('cm2.analyticsConsent') === 'granted'; } catch (e) { return false; } };
  const loadGa = () => {
    if (PREVIEW || IS_ADMIN_HOST || !analyticsConsent() || document.getElementById('cm-ga4')) return;
    const s = document.createElement('script'); s.id = 'cm-ga4'; s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ANALYTICS_ID; document.head.appendChild(s);
  };
  const gaEvent = (name, params = {}) => { if (!IS_ADMIN_HOST && analyticsConsent() && typeof window.gtag === 'function') window.gtag('event', name, params); };
  const gaItems = list => (list || []).filter(Boolean).map((p, i) => ({
    item_id: String(p.sku || p.id), item_name: String(p.name || p.shortName || '').slice(0, 180),
    item_category: String((catLabel(p) || {}).name || '').slice(0, 100), price: Number(priceOf(p)) || 0,
    quantity: Number(p.quantity || p.qty || 1), index: i,
  }));
  const firstPartyTrack = (event, data = {}) => {
    if (PREVIEW || IS_ADMIN_HOST || !analyticsConsent()) return;
    const payload = {
      event_id: 'e-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8), event,
      occurred_at: new Date().toISOString(), session_id: analyticsSession, page_type: currentRoute ? currentRoute.name : '', route: analyticsRoute(),
      device: analyticsDevice(), browser: analyticsBrowser(), os: analyticsOS(), ...analyticsCampaign(), ...data,
    };
    fetch(ANALYTICS_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events: [payload] }), keepalive: true }).catch(() => {});
  };
  const trackEvent = (event, data = {}, ga = {}) => { firstPartyTrack(event, data); gaEvent(event, ga); };
  const trackEcommerce = (event, products, value, extra = {}) => {
    const items = gaItems(products);
    const safeProducts = (products || []).map(p => ({ product_id: String(p.sku || p.id), item_name: String(p.name || p.shortName || '').slice(0, 180), item_category: String((catLabel(p) || {}).name || '').slice(0, 100), value: Number(priceOf(p)) || 0, quantity: Number(p.quantity || p.qty || 1) }));
    firstPartyTrack(event, { ...extra, product_id: safeProducts[0] && safeProducts[0].product_id, item_name: safeProducts[0] && safeProducts[0].item_name, item_category: safeProducts[0] && safeProducts[0].item_category, value: Number(value) || 0, quantity: safeProducts.reduce((n, p) => n + p.quantity, 0), item_count: safeProducts.length, currency: 'INR' });
    gaEvent(event, { currency: 'INR', value: Number(value) || 0, items, ...extra });
  };
  const trackPurchaseOnce = order => {
    const key = 'cm2.analytics.purchase.' + String(order.id);
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch (e) {}
    trackEcommerce('purchase', order.items.map(i => ({ ...(prodById(i.id) || { id: i.id, name: i.name, shortName: i.name, price: i.price }), quantity: i.qty })), order.totals.total, { transaction_id: String(order.id), order_id: String(order.code) });
  };
  const trackPageView = () => {
    if (!analyticsConsent()) return;
    const key = location.hostname + '|' + analyticsRoute();
    if (window.__cmLastPageView === key) return;
    window.__cmLastPageView = key;
    const title = document.title;
    const virtualLocation = location.origin + location.pathname + analyticsRoute();
    trackEvent('page_view', { page_type: currentRoute ? currentRoute.name : '', route: analyticsRoute() }, { page_title: title, page_location: virtualLocation });
    if (currentRoute && currentRoute.name === 'product') {
      const p = prodBySlug(currentRoute.params[0] || '');
      if (p) trackEcommerce('view_item', [{ ...p, quantity: 1 }], priceOf(p), { item_list: 'product_detail' });
    } else if (currentRoute && currentRoute.name === 'products') {
      const list = typeof filterShop === 'function' ? filterShop(shopState(currentRoute)).slice(0, 30) : [];
      if (list.length) trackEcommerce('view_item_list', list.map(p => ({ ...p, quantity: 1 })), list.reduce((n, p) => n + priceOf(p), 0), { item_list: 'shop' });
    }
  };
  const initAnalyticsConsent = () => {
    if (PREVIEW || IS_ADMIN_HOST) return;
    let stored = '';
    try { stored = localStorage.getItem('cm2.analyticsConsent') || ''; } catch (e) { return; }
    if (stored) return;
    const bar = document.createElement('aside');
    bar.className = 'analytics-consent';
    bar.innerHTML = '<div><b>Help us improve CrackersMela</b><span>Allow anonymous analytics to measure visits and shopping activity.</span></div><button type="button" data-analytics-reject>Decline</button><button type="button" data-analytics-accept>Allow analytics</button>';
    document.body.appendChild(bar);
    const close = value => { try { localStorage.setItem('cm2.analyticsConsent', value); } catch (e) {} if (value === 'granted' && window.gtag) { window.gtag('consent', 'update', { analytics_storage: 'granted', ad_storage: 'denied' }); loadGa(); requestAnimationFrame(trackPageView); } bar.remove(); };
    bar.querySelector('[data-analytics-accept]').onclick = () => close('granted');
    bar.querySelector('[data-analytics-reject]').onclick = () => close('denied');
  };

  /* ---------------- icons ---------------- */
  const I = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
    cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
    heartF: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
    truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h12v9H3z"/><path d="M15 9h4.2L21 11.8V15h-6z"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 6v5c0 5 3 8.5 7 10 4-1.5 7-5 7-10V6z"/><path d="m9.3 12 1.8 1.8 3.6-3.6"/></svg>',
    cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 12h.01M18 12h.01"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>',
    gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4"/><path d="M5 12v8h14v-8"/><path d="M12 8v12"/><path d="M12 8S10.5 4 8 4a2 2 0 0 0 0 4zM12 8s1.5-4 4-4a2 2 0 0 1 0 4z"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-5.6-7-11a7 7 0 0 1 14 0c0 5.4-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    shop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v11h16V10"/><path d="M2 7l2 3 2-3 2 3 2-3 2 3 2-3 2 3 2-3 2 3 2-2-1-4H3z"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
    wa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.8 4.9-1.3A10 10 0 1 0 12 2zm5.2 14.2c-.2.6-1.2 1.2-1.7 1.2-.5.1-1 .2-3.4-.7-2.9-1.2-4.7-4.1-4.9-4.3-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4-.1.6.4l.8 2.1c.1.2.1.4 0 .6l-.3.5-.4.6c-.1.2-.3.4-.1.7.2.3.8 1.4 1.8 2.2 1.2 1.1 2.3 1.4 2.6 1.6.3.2.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l2.1 1c.3.1.5.2.5.4.1.1.1.7-.2 1.3z"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>',
    sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/></svg>',
    smile: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9.5h.01M15 9.5h.01"/></svg>',
    sparkle: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z"/></svg>',
    flower: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2.6"/><path d="M12 9.4a3.4 3.4 0 1 0-3.4-3.4A3.4 3.4 0 0 0 12 9.4z"/><path d="M12 14.6a3.4 3.4 0 1 0 3.4 3.4A3.4 3.4 0 0 0 12 14.6z"/><path d="M9.4 12a3.4 3.4 0 1 0-3.4 3.4A3.4 3.4 0 0 0 9.4 12z"/><path d="M14.6 12a3.4 3.4 0 1 0 3.4-3.4A3.4 3.4 0 0 0 14.6 12z"/></svg>',
    disc: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/><path d="M20.5 12H23M1 12h2.5M12 20.5V23M12 1v2.5"/></svg>',
    garland: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h16"/><path d="m6.5 8-2 6M8.5 8l1.3 6M12 8l-.6 6M16.5 8l-1.3 6M18.5 8l2 6"/></svg>',
    rocket: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c3.2 2 4.8 5.2 4.8 9 0 2-.9 3.6-2.6 4.6H9.8C8.1 14.6 7.2 13 7.2 11 7.2 7.2 8.8 4 12 2z"/><circle cx="12" cy="11" r="1.9"/><path d="M9.5 15.6h5l1.2 4.4H8.3z"/><path d="M12 16.5V20"/></svg>',
    bomb: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="13" r="8"/><path d="M11 9.6a3.4 3.4 0 0 0-3.4 3.4"/><path d="m16 3 2.5 2.5M14.5 1.5 17 4M20 4l2 2"/></svg>',
    target: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></svg>',
    burst: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v18M3 12h18M6 6l12 12M18 6 6 18"/></svg>',
    fireworks: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><path d="M12 4.5v3M12 16.5v3M4.5 12h3M16.5 12h3M6.6 6.6l2.1 2.1M15.3 15.3l2.1 2.1M17.4 6.6l-2.1 2.1M8.7 15.3l-2.1 2.1"/></svg>',
    tag: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.4"/></svg>',
    copy: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    box: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>',
    trophy: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
    users: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    bell: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
    circleAlert: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>',
    fileQ: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9.5 12.5a2 2 0 1 1 2.5 3.2c-.9.6-1 1.3-1 2"/><path d="M12 20h.01"/></svg>',
    searchX: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/><path d="M8.5 9.5l5 5M13.5 9.5l-5 5"/></svg>',
    dot: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/></svg>',
    trash: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/></svg>',
  };

  /* category icon map — one consistent Lucide-style icon family (data file may ship emoji glyphs) */
  const CAT_ICONS = {
    'gift-boxes': I.gift, 'kids-special': I.smile, sparklers: I.sparkle,
    'flower-pots': I.flower, chakkars: I.disc, garlands: I.garland,
    fancy: I.burst, rockets: I.rocket, bombs: I.bomb,
    'guns-rolls': I.target, 'night-outs': I.fireworks,
  };
  const catIcon = c => CAT_ICONS[c && c.id] || I.sparkle;

  const toast = (msg, type = 'ok', single = false) => {
    const wrapId = single ? 'cartToastWrap' : 'toastWrap';
    let wrap = document.getElementById(wrapId);
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = wrapId;
      wrap.className = 'toast-wrap' + (single ? ' toast-wrap--cart' : '');
      document.body.appendChild(wrap);
    }
    if (single) {
      wrap.querySelectorAll('.toast').forEach(t => { t.classList.add('hide'); setTimeout(() => t.remove(), 260); });
      const nav = document.querySelector('.navbar');
      if (nav) {
        const sy = window.scrollY;
        window.scrollTo(0, 0);
        const y = nav.getBoundingClientRect().bottom;
        window.scrollTo(0, sy);
        wrap.style.top = `calc(${y}px + ${matchMedia('(max-width: 820px)').matches ? 8 : 12}px)`;
      }
    }
    const el = document.createElement('div');
    el.className = 'toast ' + type + (single ? ' toast--cart' : '');
    el.innerHTML = (type === 'ok' ? I.check : type === 'err' ? I.alert : I.info) + `<span>${esc(msg)}</span>`;
    wrap.appendChild(el);
    setTimeout(() => { el.classList.add('hide'); setTimeout(() => el.remove(), 260); }, 3200);
  };

  /* ---------------- product card ---------------- */
  const shortDesc = p => {
    const t = String(p.note || p.desc || '').replace(/\s+/g, ' ').trim();
    if (!t) return catLabel(p).blurb || '';
    return t.length > 76 ? t.slice(0, 74).replace(/[\s,;.]+\S*$/, '') + '…' : t;
  };

  /* Bottom foot of a product card — normal state (stock line + add button) */
  const footNormal = p => `
          ${stockLine(p)}
          ${inStockOf(p) ? `<button class="add-btn add-btn--round" data-add="${p.id}" title="Add to cart" aria-label="Add ${esc(p.shortName)} to cart">${I.cart}<span>Add to Cart</span></button>`
          : `<button class="add-btn add-btn--round" disabled title="Sold out" aria-label="Sold out">${I.cart}<span>Sold</span></button>`}`;

  /* Bottom foot of a product card — quantity controls when already in cart */
  const footCart = (p, qty) => `
        <div class="qty-ctl">
          <button class="qty-btn qty-btn--minus" data-qty="${p.id}" data-d="-1" aria-label="Decrease ${esc(p.shortName)} quantity">−</button>
          <b class="qty-num" aria-live="polite">${qty}</b>
          <button class="qty-btn qty-btn--plus" data-qty="${p.id}" data-d="1" aria-label="Increase ${esc(p.shortName)} quantity">+</button>
        </div>
        <button class="qty-remove" data-del="${p.id}">${I.trash}<span>Remove</span></button>`;

  const productCard = (p, opts = {}) => {
    const off = discountOf(p);
    const qty = cartQty(p.id);
    const img = imgOf(p);
    const hasImg = /<img/.test(img);
    const media = hasImg ? img : `<div class="prod-img-fallback">${catIcon(catLabel(p))}</div>`;
    const badges = [];
    if (off > 0) badges.push(`<span class="badge-off">${off}% OFF</span>`);
    if (featuredOf(p)) badges.push(`<span class="badge-off badge-hot">${off > 0 ? 'HOT' : 'BESTSELLER'}</span>`);
    return `
    <article class="prod-card reveal" data-id="${p.id}" data-keys="${esc(cardKeys(p))}">
      <div class="prod-card__media">
        <a href="${prodUrl(p)}">${media}</a>
        ${badges.length ? `<div class="prod-card__badges">${badges.join('')}</div>` : ''}
        <button class="prod-card__wish ${saved(p.id) ? 'active' : ''}" data-wish="${p.id}" aria-label="Toggle wishlist" aria-pressed="${saved(p.id)}">${saved(p.id) ? I.heartF : I.heart}</button>
        ${!inStockOf(p) ? `<div class="prod-oos-tint"><span>OUT OF STOCK</span></div>` : ''}
      </div>
      <div class="prod-card__body">
        <span class="prod-card__cat">${esc(catLabel(p).name)}</span>
        <h3 class="prod-card__name"><a href="${prodUrl(p)}">${esc(p.shortName)}</a></h3>
        <p class="prod-card__desc">${esc(shortDesc(p))}</p>
        <div class="rating-row">${stars(p.rating)} <span>${p.rating.toFixed(1)} · ${p.reviews}</span></div>
        <div class="price-row">
          <span class="price-now">${money(priceOf(p))}</span>
          ${p.compareAt && p.compareAt > priceOf(p) ? `<span class="price-cmp">${money(p.compareAt)}</span><span class="price-off">${off}% off</span>` : ''}
        </div>
        ${qty > 0
          ? `<div class="prod-card__foot prod-card__foot--cart">${footCart(p, qty)}</div>`
          : `<div class="prod-card__foot">${footNormal(p)}</div>`}
      </div>
    </article>`;
  };

  const productGrid = (list, opts = {}) => list.length
    ? `<div class="prod-grid ${opts.cols === 3 ? 'prod-grid--3' : opts.cols === 5 ? 'prod-grid--5' : ''}">${list.map(p => productCard(p, opts)).join('')}</div>`
    : `<div class="empty-state reveal"><div class="e-emoji">${I.searchX}</div><h3>${esc(opts.emptyTitle || 'Nothing here yet')}</h3><p>${esc(opts.emptyText || 'Try a different search or category.')}</p></div>`;

  const catCard = c => {
    const count = allProducts().filter(p => p.cats && p.cats.includes(c.id)).length;
    return `<div class="cat-card reveal" data-cat="${c.id}" role="link" tabindex="0" aria-label="${esc(c.name)} — ${count} products">
      <div class="cat-card__icon">${catIcon(c)}</div>
      <h3>${esc(c.name)}</h3><p>${esc(c.blurb)}</p>
      <span class="cat-count">${count} products →</span>
    </div>`;
  };

  const countdown = (end, id) => {
    const pad = n => String(n).padStart(2, '0');
    const tick = () => {
      const box = document.getElementById(id);
      if (!box) return false;
      let d = Math.max(0, end - Date.now());
      const days = Math.floor(d / 864e5); d %= 864e5;
      const h = Math.floor(d / 36e5); d %= 36e5;
      const m = Math.floor(d / 6e4); d %= 6e4;
      const s = Math.floor(d / 1e3);
      box.innerHTML = `
        <div class="cd-block"><b>${pad(days)}</b><span>Days</span></div>
        <div class="cd-block"><b>${pad(h)}</b><span>Hours</span></div>
        <div class="cd-block"><b>${pad(m)}</b><span>Mins</span></div>
        <div class="cd-block"><b>${pad(s)}</b><span>Secs</span></div>`;
      return true;
    };
    tick();
    return setInterval(tick, 1000);
  };

  const SALE_END = new Date('2026-11-08T23:59:59').getTime();
  const SALE_LIVE = SALE_END > Date.now();
  let cdTimer = null;

  /* ==================== cart ==================== */
  const cartTotals = () => {
    let subtotal = 0, saving = 0, count = 0;
    for (const line of cart) {
      const p = prodById(line.id);
      if (!p) continue;
      subtotal += priceOf(p) * line.qty;
      if (p.compareAt > priceOf(p)) saving += (p.compareAt - priceOf(p)) * line.qty;
      count += line.qty;
    }
    return { count, subtotal, festiveAmt: 0, festivePct: 0, saving, delivery: 0, total: subtotal };
  };

  const addToCart = (id, qty = 1) => {
    const p = prodById(id);
    if (!p || !inStockOf(p)) { toast('This item is currently unavailable.', 'err'); return false; }
    qty = Number(qty);
    if (!Number.isInteger(qty) || qty < 1) return false;
    const existing = cart.find(c => c.id === p.id);
    const limit = Math.min(50, Math.max(0, Math.floor(stockOf(p))));
    const previousQty = existing ? existing.qty : 0;
    const nextQty = Math.min(previousQty + qty, limit);
    if (nextQty <= previousQty) { toast(`Only ${limit} available for this item.`, 'info'); return false; }
    if (existing) existing.qty = nextQty;
    else cart.push({ id: p.id, qty: nextQty });
    save();
    cartUI();
    bumpBadge($('#cartCount'));
    toast(`${p.shortName} added to cart`, 'ok', true);
    trackEcommerce('add_to_cart', [{ ...p, quantity: nextQty - previousQty }], priceOf(p) * (nextQty - previousQty));
    syncCartFoot(p.id);
    return true;
  };

  const setQty = (id, qty) => {
    const line = cart.find(c => c.id === Number(id));
    if (!line) return;
    qty = Number(qty);
    if (!Number.isInteger(qty)) return;
    const p = prodById(id);
    const limit = p && inStockOf(p) ? Math.min(50, Math.max(0, Math.floor(stockOf(p)))) : 0;
    if (qty > limit) toast(`Only ${limit} available for this item.`, 'info');
    qty = Math.min(qty, limit);
    if (qty <= 0) cart = cart.filter(c => c.id !== line.id);
    else line.qty = clamp(qty, 1, 50);
    save(); cartUI();
    renderCartPageIfVisible();
    syncCartFoot(id);
  };

  const removeLine = id => {
    const line = cart.find(c => c.id === Number(id));
    const p = line ? prodById(line.id) : null;
    cart = cart.filter(c => c.id !== Number(id));
    save(); cartUI(); renderCartPageIfVisible(); syncCartFoot(id);
    if (p) trackEcommerce('remove_from_cart', [{ ...p, quantity: line.qty }], priceOf(p) * line.qty);
  };

  /* In-place product-card foot swap (stock line <-> quantity controls) with a subtle fade/slide */
  const footTail = new WeakMap();
  const swapFoot = (foot, html, qty) => {
    const tok = (footTail.get(foot) || 0) + 1;
    footTail.set(foot, tok);
    foot.classList.toggle('prod-card__foot--cart', qty > 0);
    foot.classList.add('foot-swap');
    setTimeout(() => {
      if (footTail.get(foot) !== tok) return;
      foot.innerHTML = html;
      foot.classList.remove('foot-swap');
      foot.classList.add('foot-in');
      setTimeout(() => foot.classList.remove('foot-in'), 320);
    }, 170);
  };
  const syncCartFoot = (id, animate = true) => {
    const pid = Number(id);
    const qty = cartQty(pid);
    const p = prodById(pid);
    if (!p) return;
    $$(`[data-id="${pid}"] .prod-card__foot`).forEach(foot => {
      const next = qty > 0 ? footCart(p, qty) : footNormal(p);
      if (!animate) {
        foot.classList.toggle('prod-card__foot--cart', qty > 0);
        foot.classList.remove('foot-swap', 'foot-in');
        foot.innerHTML = next;
        return;
      }
      swapFoot(foot, next, qty);
    });
  };

  const bumpBadge = el => {
    if (!el || typeof el.animate !== 'function') return;
    el.classList.remove('hidden');
    el.animate([{ transform: 'scale(1.6)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
  };

  const cartLine = (p, qty) => {
    const img = p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : `${catIcon(catLabel(p))}`;
    const del = `<button class="cart-line__del" data-del="${p.id}" aria-label="Remove from cart">${I.trash}</button>`;
    return `
    <div class="cart-line" data-line="${p.id}">
      <div class="cart-line__img">${img}</div>
      <div class="cart-line__body">
        <h4>${esc(p.shortName)}</h4>
        <div class="cart-line__price">${money(priceOf(p))}${p.compareAt > priceOf(p) ? ' <s>' + money(p.compareAt) + '</s>' : ''}</div>
        <div class="cart-line__foot">
          <div class="mini-qty">
            <button data-qty="${p.id}" data-d="-1" aria-label="Decrease">−</button>
            <b>${qty}</b>
            <button data-qty="${p.id}" data-d="1" aria-label="Increase">+</button>
          </div>
          <b class="cart-line__total">${money(priceOf(p) * qty)}</b>
        </div>
      </div>
      ${del}
    </div>`;
  };

  const cartDrawerRender = () => {
    const body = $('#cartDrawerBody');
    const summary = $('#cartDrawerSummary');
    if (!body) return;
    const { count, subtotal, festivePct, festiveAmt, saving, delivery, total } = cartTotals();
    const badge = $('#cartDrawerCount');
    if (badge) { badge.textContent = count ? `${count}` : ''; badge.style.display = count ? 'inline-grid' : 'none'; }
    if (!count) {
      body.innerHTML = `<div class="cart-empty"><div class="e-emoji">${I.cart}</div><p>Your cart is empty.<br>Let's light up something great.</p><button class="btn btn-primary start-shopping" data-shop-more>${I.shop} Start Shopping</button></div>`;
      summary.innerHTML = '';
      $('#cartCheckoutBtn').disabled = true;
      return;
    }
    const lines = cart.map(c => { const p = prodById(c.id); return p ? cartLine(p, c.qty) : ''; }).join('');
    body.innerHTML = lines;
    const minLeft = Math.max(0, STORE.minOrder - subtotal);
    const pct = Math.min(100, Math.round((subtotal / STORE.minOrder) * 100));
    const minCard = minLeft > 0 ? `
      <div class="min-order-card">
        <div class="min-order-card__title">${I.alert} Add <b>${money(minLeft)}</b> more</div>
        <div class="min-order-card__sub">to reach the ${money(STORE.minOrder)} minimum order</div>
        <span class="min-order-card__track"><span class="min-order-card__fill" style="width:${Math.max(pct, 3)}%"></span></span>
        <span class="min-order-card__pct">${pct}% of minimum reached</span>
        <button class="shop-more-btn" data-shop-more>${I.shop} Shop More</button>
      </div>` : '';
    summary.innerHTML = `
      <div class="cart-summary">
        <div class="sum-row"><span>Subtotal</span><b>${money(subtotal)}</b></div>
        <div class="sum-row total"><span>Total</span><b>${money(total)}</b></div>
        <div class="sum-row"><span>You save</span><span class="save">${money(saving + festiveAmt)}</span></div>
      </div>
      ${minCard}`;
    $('#cartCheckoutBtn').disabled = subtotal < STORE.minOrder;
  };

  const openCart = () => {
    cartDrawerRender();
    const d = $('#cartDrawer');
    d.classList.add('open');
    d.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    if (cart.length) trackEcommerce('view_cart', cart.map(c => ({ ...(prodById(c.id) || {}), quantity: c.qty })).filter(p => p.id), cartTotals().subtotal);
  };
  const closeCart = () => {
    const d = $('#cartDrawer');
    d.classList.remove('open');
    d.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  const cartUI = () => {
    const { count } = cartTotals();
    const b = $('#cartCount');
    if (count) { b.textContent = count; b.classList.remove('hidden'); } else { b.classList.add('hidden'); }
    cartDrawerRender();
  };

  const renderCartPageIfVisible = () => {
    if (location.hash.startsWith('#/cart') || location.hash.startsWith('#/checkout')) route();
  };

  /* ==================== wishlist ==================== */
  const toggleWish = id => {
    id = Number(id);
    const on = wish.includes(id);
    wish = on ? wish.filter(w => w !== id) : [...wish, id];
    save();
    const btn = document.querySelector(`[data-wish="${id}"]`);
    const p = prodById(id);
    if (btn) { btn.innerHTML = on ? I.heart : I.heartF; btn.classList.toggle('active', !on); btn.setAttribute('aria-pressed', String(!on)); }
    if (!on && p) trackEcommerce('add_to_wishlist', [{ ...p, quantity: 1 }], priceOf(p));
    toast(on ? 'Removed from wishlist' : `${p ? p.shortName : 'Item'} saved to wishlist`, on ? 'info' : 'ok');
    wishUI();
    if (location.hash.startsWith('#/wishlist')) route();
  };

  const wishUI = () => {
    const c = $('#wishCount'), m = $('#mWishCount');
    const n = wish.length;
    if (n) { if (c) { c.textContent = n; c.classList.remove('hidden'); } if (m) { m.textContent = n; m.classList.remove('hidden'); } }
    else { if (c) c.classList.add('hidden'); if (m) m.classList.add('hidden'); }
  };

  /* ==================== auth integration pending ==================== */
  // Authentication is deliberately unavailable until the deployed PHP source can
  // supply server-verified sessions. Do not restore localStorage/password fallbacks.
  const firebaseReady = () => false;
  const fbInit = () => {};
  const authUnavailable = async () => ({ ok: false, error: 'Sign-in is unavailable in this local review. The authentication server has not been connected.' });
  const login = authUnavailable;
  const register = authUnavailable;

  const logout = () => {
    stopFeed();
    privateDataRevision += 1;
    orders = []; users = {}; activity = []; heldBills = []; posCart = [];
    checkoutState.data = {}; checkoutState.touched = {}; checkoutState.step = 1;
    checkoutCoupon = { code: null, discount: 0 };
    clearPrivateCaches();
    if (firebaseReady() && firebase.auth().currentUser) { try { firebase.auth().signOut(); } catch (e) {} }
    save(); accountUI(); toast('Signed out. Private information cleared from this browser.', 'info');
    if (IS_ADMIN_HOST || /^#\/(staff|my-orders|order|track|checkout)(\/|\?|$)/.test(location.hash)) route();
  };

  const STAFF_MENU_HTML = `
    <a class="account-menu__item" href="${ADMIN_ENTRY}" role="menuitem" data-act="billing">
      <span class="account-menu__ico">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z"/><path d="M9 8h6M9 13h6"/></svg>
      </span>
      <span>Billing</span>
    </a>
    <a class="account-menu__item" href="${ADMIN_ENTRY}" role="menuitem" data-act="admin">
      <span class="account-menu__ico">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 5 6v5c0 4.6 2.9 8.2 7 9.7 4.1-1.5 7-5.1 7-9.7V6z"/><path d="m9 12 2 2 4-4"/></svg>
      </span>
      <span>Admin Dashboard</span>
    </a>`;
  const STAFF_MOBILE_HTML = `<a class="mobile-nav-link" href="${ADMIN_ENTRY}" data-close-drawer data-staff-only>Staff Hub <span class="badge-mini">Staff</span></a>`;
  const STAFF_FOOTER_HTML = `<a href="${ADMIN_ENTRY}" data-staff-only>Staff Hub</a>`;

  const renderStaffOnly = (staff) => {
    const aSlot = $('#accountAdminSlot');
    if (aSlot) aSlot.innerHTML = staff ? STAFF_MENU_HTML : '';
    const mSlot = $('#mobileStaffSlot');
    if (mSlot) mSlot.innerHTML = staff ? STAFF_MOBILE_HTML : '';
    const fSlot = $('#footerStaffSlot');
    if (fSlot) fSlot.innerHTML = staff ? STAFF_FOOTER_HTML : '';
  };

  const accountUI = () => {
    const u = currentUser();
    const label = $('#accountLabel'); const avatar = $('#avatarText');
    const area = $('#accountArea'); const menu = $('#accountMenu');
    /* CSS owns the chip-vs-icon swap so the mobile breakpoint still wins */
    document.body.classList.toggle('is-authed', !!u);
    const staff = !!(u && isStaffRole(u.role));
    renderStaffOnly(staff);
    if (u) {
      if (label) label.textContent = u.name.split(' ')[0] + (u.role === 'admin' ? ' · Staff' : '');
      if (avatar) avatar.textContent = (u.name || 'G')[0].toUpperCase();
      if (area) area.classList.add('has-menu');
      if (menu) menu.setAttribute('aria-hidden', 'false');
      const mAv = $('#menuAvatar'); if (mAv) mAv.textContent = (u.name || 'G')[0].toUpperCase();
      const mEm = $('#menuEmail'); if (mEm) mEm.textContent = u.email;
    } else {
      if (label) label.textContent = 'Sign in';
      if (avatar) avatar.textContent = 'G';
      if (area) area.classList.remove('has-menu');
      if (menu) menu.setAttribute('aria-hidden', 'true');
    }
  };

  const authModal = (tab = 'login') => {
    const m = $('#authModal');
    $('#authBody').innerHTML = `
      <div class="auth-head"><img src="images/logo.png" alt="CrackersMela" style="display: block; margin: 0 auto; max-width: 100%; height: auto;"><h2>${tab === 'login' ? 'Welcome back' : 'Create your account'}</h2><p>${tab === 'login' ? 'Sign in to track orders & manage your wishlist.' : 'Join CrackersMela for faster checkout.'}</p></div>
      <div class="auth-tabs"><button data-atab="login" class="${tab === 'login' ? 'active' : ''}">Login</button><button data-atab="register" class="${tab === 'register' ? 'active' : ''}">Register</button></div>
      <button class="google-btn" id="googleBtn">${'<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"/></svg>Continue with Google'}</button>
      <div class="divider">or use email</div>
      <div id="authForm"></div>`;
    const renderForm = t => {
      $('#authForm').innerHTML = t === 'login'
        ? `<div class="form-field"><label for="auEmail">Email</label><input type="email" id="auEmail" autocomplete="email" placeholder="Your email"></div>
           <div class="form-field" style="margin-top:12px"><label for="auPass">Password</label><div class="pw-wrap"><input type="password" id="auPass" autocomplete="current-password" placeholder="••••••••"><button type="button" class="pw-toggle" data-pw aria-label="Show password">${I.eye}</button></div></div>
           <button class="btn btn-primary btn-block" style="margin-top:18px" id="auSubmit">Login</button>
           <p class="auth-switch">New here? <a href="#" data-atab="register">Create an account</a></p>`
        : `<div class="form-field"><label for="auName">Full name</label><input type="text" id="auName" autocomplete="name" placeholder="Your name"></div>
           <div class="form-field" style="margin-top:12px"><label for="auEmail">Email</label><input type="email" id="auEmail" autocomplete="email" placeholder="Your email"></div>
           <div class="form-field" style="margin-top:12px"><label for="auPass">Password</label><div class="pw-wrap"><input type="password" id="auPass" autocomplete="new-password" placeholder="Min 8 characters"><button type="button" class="pw-toggle" data-pw aria-label="Show password">${I.eye}</button></div></div>
           <button class="btn btn-primary btn-block" style="margin-top:18px" id="auSubmit">Create account</button>
           <p class="auth-switch">Have an account? <a href="#" data-atab="login">Login</a></p>`;
      const sub = $('#auSubmit');
      sub.addEventListener('click', async () => {
        const email = $('#auEmail').value, pass = $('#auPass').value;
        sub.disabled = true; sub.innerHTML = '<span class="spinner"></span><span>Please wait…</span>';
        const res = t === 'login' ? await login(email, pass) : await register($('#auName').value, email, pass);
        sub.disabled = false;
        if (!res.ok) { sub.textContent = t === 'login' ? 'Login' : 'Create account'; return toast(res.error, 'err'); }
        trackEvent(t === 'login' ? 'login' : 'sign_up', {}, { method: 'email' });
        closeAuth(); accountUI(); toast(`Welcome, ${res.name}!`, 'ok');
        if (location.hash.startsWith('#/checkout')) route();
        if (location.hash.startsWith('#/staff') || IS_ADMIN_HOST) route();
        if (document.querySelector('.maint-scene')) route();
      });
    };
    renderForm(tab);
    $$('#authBody [data-atab]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); const t = b.getAttribute('data-atab') === 'register' ? 'register' : 'login'; $$('#authBody .auth-tabs button').forEach(x => x.classList.toggle('active', x.getAttribute('data-atab') === t)); renderForm(t); }));
    $('#authBody #googleBtn').addEventListener('click', async () => {
      if (!firebaseReady()) {
        const result = await authUnavailable();
        return toast(result.error, 'err');
      }
      const btn = $('#authBody #googleBtn'); btn.disabled = true;
      try {
        await firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider());
      } catch (e) {
        const code = e && e.code ? String(e.code) : '';
        if (code.indexOf('popup-blocked') >= 0) return toast('Allow popups for this site, then try Google sign-in again.', 'err');
        if (code.indexOf('cancelled') >= 0 || code.indexOf('popup-closed-by-user') >= 0) return toast('Google sign-in cancelled.', 'info');
        return toast('Google sign-in could not be completed. Please try again.', 'err');
      } finally {
        btn.disabled = false;
      }
    });
    $$('#authBody [data-pw]').forEach(b => b.addEventListener('click', () => { const inp = $('#authBody #auPass'); inp.type = inp.type === 'password' ? 'text' : 'password'; }));
    openModal(m);
  };

  const openModal = m => { m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; };
  const closeAuth = () => { const m = $('#authModal'); m.classList.remove('open'); m.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; };

  /* ==================== orders ==================== */
  const STATUSES = [
    { key: 'placed', label: 'Order Placed', note: 'We received your order' },
    { key: 'confirmed', label: 'Confirmed', note: 'Verified & accepted by the team' },
    { key: 'packed', label: 'Packed', note: 'Carefully packed in safe boxes' },
    { key: 'shipped', label: 'Shipped', note: 'Handed over to our delivery partner' },
    { key: 'out_for_delivery', label: 'Out for Delivery', note: 'Nearest the house — stay nearby' },
    { key: 'delivered', label: 'Delivered', note: 'Enjoy the celebration, stay safe!' },
  ];

  const statusIndex = s => STATUSES.findIndex(x => x.key === s);

  const placeOrder = async (customer, shipping, payment) => {
    if (cart.some(c => { const p = prodById(c.id); return !p || !inStockOf(p) || !Number.isInteger(c.qty) || c.qty < 1 || c.qty > stockOf(p); })) {
      toast('Some items are no longer available in the requested quantity. Please review your cart.', 'err');
      return null;
    }
    const t = cartTotals();
    if (t.subtotal < STORE.minOrder) {
      toast(`Minimum order value is ${money(STORE.minOrder)}. Please add ${money(STORE.minOrder - t.subtotal)} more to continue.`, 'err');
      return null;
    }
    const lines = cart.map(c => {
      const p = prodById(c.id);
      return { id: p.id, sku: p.sku, name: p.shortName, image: p.image, qty: c.qty, price: priceOf(p), compareAt: p.compareAt };
    });
    const now = new Date().toISOString();
    const code = orderCode();
    const order = {
      id: uid(), code, placedAt: now,
      status: 'placed',
      log: [{ status: 'placed', at: now }],
      items: lines,
      totals: { subtotal: t.subtotal, festiveAmt: 0, festivePct: 0, saving: t.saving, delivery: 0, couponAmt: checkoutCoupon.code ? checkoutCoupon.discount : 0, couponCode: checkoutCoupon.code || '', total: Math.max(0, t.subtotal - (checkoutCoupon.code ? checkoutCoupon.discount : 0)) },
      customer, shipping, payment,
      email: customer.email,
    };
    // Keep the cart until the order service explicitly acknowledges it. The real
    // server must recalculate price/discount/stock and return an authoritative order.
    const result = await syncPushOrders([order]);
    if (!result || result.ok !== true) {
      toast('We could not place your order. Your cart is saved. Please try again later.', 'err');
      return null;
    }
    orders.unshift(order);
    cart = [];
    save(); cartUI();
    trackPurchaseOnce(order);
    return order;
  };

  /* ---- cross-origin order sync (storefront ⇄ admin subdomain) ---- */
  const syncPushOrders = (list) => {
    if (!list || !list.length) return Promise.resolve(null);
    return fetch(ORDERS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 'pushmany', key: CM_SYNC_KEY, orders: list }),
    }).then(r => r.ok ? r.json().catch(() => null) : null).catch(() => null);
  };
  const syncUpdateStatus = (o) => {
    if (!o || !o.id) return;
    fetch(ORDERS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 'update', key: CM_SYNC_KEY, id: o.id, status: o.status, log: o.log, payment: o.payment }),
    }).catch(() => {});
  };
  const syncPull = () => {
    if (PREVIEW || !currentUser()) return Promise.resolve(null);
    const revision = privateDataRevision;
    return fetch(ORDERS_API + '?a=pull&t=' + Date.now(), { cache: 'no-store' })
      .then(r => r.json())
      .then(j => {
        if (revision !== privateDataRevision || !currentUser() || !j || j.ok !== true || !Array.isArray(j.orders)) return;
        const serverIds = new Set();
        const byId = new Map();
        j.orders.forEach(o => { if (o && o.id) { serverIds.add(o.id); byId.set(o.id, o); } });
        orders.forEach(o => {
          if (!o || !o.id) return;
          const s = byId.get(o.id);
          if (!s || String(s.placedAt || '') < String(o.placedAt || '')) byId.set(o.id, o);
        });
        orders = [...byId.values()].sort((x, y) => String(y.placedAt || '').localeCompare(String(x.placedAt || '')));
        save();
      })
      .catch(() => {});
  };

  const CATALOG_API = 'catalog-api.php';
  const syncCatalogPush = () => {
    if (!IS_ADMIN_HOST || !canSyncPush()) return;
    fetch(CATALOG_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 'push', key: CM_SYNC_KEY, priceOverrides, stockOverrides, featOn }),
    }).catch(() => {});
  };
  const syncCatalogPull = () =>
    fetch(CATALOG_API + '?a=pull&t=' + Date.now(), { cache: 'no-store' })
      .then(r => r.json())
      .then(j => {
        if (!j || j.ok !== true) return;
        if (j.priceOverrides) { for (const k in priceOverrides) delete priceOverrides[k]; Object.assign(priceOverrides, j.priceOverrides); }
        if (j.stockOverrides) { for (const k in stockOverrides) delete stockOverrides[k]; Object.assign(stockOverrides, j.stockOverrides); }
        if (j.featOn) { for (const k in featOn) delete featOn[k]; for (const k in j.featOn) featOn[k] = j.featOn[k]; }
        save();
        if (location.hash.startsWith('#/products') || location.hash.startsWith('#/p/') || location.hash.startsWith('#/product/')) route();
      })
      .catch(() => {});

  /* ---- cross-origin product-data + settings sync ----
     admin.crackersmela.com = writer (source of truth) · crackersmela.com = reader.
     The storefront never pushes (it must never overwrite admin state). */
  const PRODUCTS_API = 'products-api.php';
  /* Only authenticated staff may write to the production store — anonymous or
     stale admin tabs must never overwrite newer server data. */
  const canSyncPush = () => { const u = currentUser(); return !!(u && isStaffRole(u.role)); };
  let cmSyncRev = Number(ls.get('cmSyncRev', -1));
  const syncProductsPush = () => {
    if (!canSyncPush()) return Promise.resolve(null);
    return fetch(PRODUCTS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 'push', key: CM_SYNC_KEY, productOverrides, extraProducts, settings: cmSettings, rev: cmSyncRev }),
    }).then(async r => {
      const result = await r.json().catch(() => ({}));
      return r.ok ? result : { ...result, ok: false };
    })
      .then(j => {
        if (j && j.error === 'stale-rev') {
          syncProductsPull();
          toast('The catalog changed elsewhere. Review the latest values before saving again.', 'info');
          return null;
        }
        if (!j || j.ok !== true) { toast('Catalog changes could not be saved. Please try again.', 'err'); return null; }
        if (Number.isSafeInteger(j.rev) && j.rev >= 0) { cmSyncRev = j.rev; ls.set('cmSyncRev', cmSyncRev); }
        return j;
      })
      .catch(() => { toast('Catalog changes could not be saved. Check your connection and try again.', 'err'); return null; });
  };
  const syncProductsPull = () =>
    fetch(PRODUCTS_API + '?a=pull&t=' + Date.now(), { cache: 'no-store' })
      .then(r => r.json())
      .then(j => {
        if (!j || j.ok !== true) return;
        if (typeof j.rev === 'number') { cmSyncRev = j.rev; ls.set('cmSyncRev', cmSyncRev); }
        const before = JSON.stringify([productOverrides, extraProducts, cmSettings]);
        const prevMaint = remoteMaint;
        if (j.productOverrides) { for (const k in productOverrides) delete productOverrides[k]; Object.assign(productOverrides, j.productOverrides); }
        if (Array.isArray(j.extraProducts)) extraProducts = j.extraProducts;
        if (j.settings && typeof j.settings === 'object') {
          cmSettings = { maintenance: !!j.settings.maintenance, coupon: j.settings.coupon || null };
          remoteMaint = !!cmSettings.maintenance;
        }
        const after = JSON.stringify([productOverrides, extraProducts, cmSettings]);
        const changed = before !== after;
        if (cmSettings.coupon && (cmSettings.coupon.code || cmSettings.coupon.discount)) {
          couponConfig = { code: cmSettings.coupon.code || couponConfig.code, discount: Number(cmSettings.coupon.discount) || 0 };
        }
        if (changed) save();
        if (!IS_ADMIN_HOST) {
          const maintFlipped = prevMaint !== remoteMaint;
          const onProductPage = location.hash.startsWith('#/products') || location.hash.startsWith('#/p/') || location.hash.startsWith('#/product/');
          const onMaintScene = !!document.querySelector('.maint-scene');
          if (maintFlipped) { route(); return; }
          if (changed && onProductPage) route();
          else if (changed && onMaintScene && !maintOn()) route();
          else if (changed && maintOn() && !onMaintScene) route();
        }
      })
      .catch(() => {});

  /* ---- background removal on a data URL (client-side, no server needed) ---- */
  const removeBackground = (img, scale = 0.5) => {
    const W = Math.max(320, Math.min(1100, img.naturalWidth));
    const H = Math.round(W * (img.naturalHeight / Math.max(1, img.naturalWidth)));
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, W, H);
    const idt = x.getImageData(0, 0, W, H);
    const d = idt.data;
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], g = d[i + 1], b = d[i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const v = mx, s = mx ? (mx - mn) / mx : 0;
      const isWhite = v > 235 && s < 0.10;
      const isGrey = mn > 130 && s < 0.06;
      if (isWhite || isGrey) {
        d[i + 3] = 0;
      } else {
        const bg = (r + g + b) / 3 * 0.9;
        const a = Math.max(0, Math.min(255, (v - 225) * 14));
        d[i] = Math.min(255, r + 30); d[i + 1] = Math.min(255, g + 30); d[i + 2] = Math.min(255, b + 30);
        d[i + 3] = a < 22 ? 0 : Math.min(255, a);
        void bg;
      }
    }
    x.putImageData(idt, 0, 0);
    return c.toDataURL('image/webp', 0.85);
  };

  /* ---- product image upload helper (upload to server, optional bg removal) ---- */
  const UPLOAD_API = 'upload-api.php';
  const imageFileError = file => {
    if (!file) return 'Choose an image first.';
    if (!/^image\/(jpeg|png|webp)$/.test(file.type || '')) return 'Please choose a JPG, PNG or WebP image.';
    if (!Number.isFinite(file.size) || file.size <= 0) return 'This image file is empty. Choose a different image.';
    if (file.size > 5 * 1024 * 1024) return 'Image is too large (max 5 MB).';
    return '';
  };
  const uploadFile = (file, opts = {}) => {
    const error = imageFileError(file);
    if (error) return Promise.reject(new Error(error));
    const fd = new FormData();
    fd.append('image', file);
    return fetch(UPLOAD_API, { method: 'POST', body: fd })
      .catch(() => { throw new Error('Could not connect to upload the image. Check your connection and try again.'); })
      .then(async response => {
        if (!response.ok) {
          const messages = {
            401: 'Sign in again before uploading an image.',
            403: 'Your account cannot upload images.',
            413: 'Image is too large (max 5 MB).',
            415: 'Please choose a JPG, PNG or WebP image.',
            429: 'Too many uploads. Wait a moment and try again.',
            503: PREVIEW ? 'Image uploads are unavailable in this local preview.' : 'Image uploads are temporarily unavailable. Please try again.',
          };
          throw new Error(messages[response.status] || 'The image could not be uploaded. Please try again.');
        }
        const result = await response.json().catch(() => null);
        if (!result || result.ok !== true) throw new Error('The image could not be uploaded. Please try again.');
        const url = safeImageSrc(result.url);
        if (!url) throw new Error('The uploaded image could not be loaded. Please try again.');
        return { url, bgRemoved: result.bgRemoved === true };
      });
  };
  /* Client-side background removal, then upload the processed result. */
  const uploadWithBackgroundRemoval = file => new Promise((resolve, reject) => {
    const error = imageFileError(file);
    if (error) { reject(new Error(error)); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth > 12000 || img.naturalHeight > 12000 || img.naturalWidth * img.naturalHeight > 40000000) {
          URL.revokeObjectURL(url);
          reject(new Error('Image dimensions are too large. Resize the image and try again.'));
          return;
        }
        const dataUrl = removeBackground(img);
        URL.revokeObjectURL(url);
        const blob = dataURLtoBlob(dataUrl);
        const processed = new File([blob], 'product.webp', { type: 'image/webp' });
        uploadFile(processed).then(resolve, reject);
      } catch (e) { URL.revokeObjectURL(url); reject(new Error('Could not process image')); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
  const dataURLtoBlob = durl => {
    const [meta, b64] = durl.split(',');
    const mime = (meta.match(/data:(.*?);/) || [])[1] || 'image/webp';
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  };

  const findOrder = q => {
    if (!q) return null;
    q = String(q).trim().toUpperCase();
    return orders.find(o => o.code === q || o.id.toUpperCase() === q) || null;
  };

  const timeline = order => {
    const cur = statusIndex(order.status);
    return `<div class="timeline">${STATUSES.map((s, i) => {
      const ev = order.log.find(l => l.status === s.key);
      const cls = i < cur ? 'done' : i === cur ? 'next' : '';
      return `<div class="timeline__item ${cls}">
        <div class="timeline__dot">${i < cur ? I.check : s.key === 'out_for_delivery' ? I.truck : ''}</div>
        <div class="timeline__body">
          <h4>${s.label}</h4><p>${s.note}</p>
          ${ev ? `<time>${fmtDate(ev.at)}</time>` : '<time>—</time>'}
        </div>
      </div>`;
    }).join('')}</div>`;
  };

  /* ==================== search ==================== */
  const searchProducts = q => {
    q = (q || '').trim().toLowerCase();
    if (!q) return [];
    return allProducts().filter(p => {
      const hay = (p.shortName + ' ' + p.name + ' ' + (p.note || '') + ' ' + p.cats.map(id => CAT_MAP[id] ? CAT_MAP[id].name : '').join(' ')).toLowerCase();
      return q.split(/\s+/).every(w => hay.includes(w));
    });
  };

  const navSearchInput = () => $('#navSearchInput');
  const hideSearchResults = () => { const b = $('#navSearchResults'); if (b) { b.hidden = true; b.innerHTML = ''; } };
  const closeSearch = () => { hideSearchResults(); const i = navSearchInput(); if (i && i === document.activeElement) i.blur(); document.body.classList.remove('nav-search-active'); };

  const renderSearchResults = q => {
    const box = $('#navSearchResults'); if (!box) return;
    q = (q || '').trim();
    if (!q) { hideSearchResults(); return; }
    const hits = searchProducts(q).slice(0, 8);
    box.hidden = false;
    if (!hits.length) { box.innerHTML = `<div class="search-empty">No matches for “${esc(q)}”. Try “sparklers”, “flower pot”, “1000 wala”.</div>`; return; }
    box.innerHTML = hits.map(p => `
      <a class="search-hit" href="${prodUrl(p)}" data-search-hit>
        ${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : `<div class="sh-emoji">${catIcon(catLabel(p))}</div>`}
        <div><b>${esc(p.shortName)}</b><span class="sh-sub">${esc(catLabel(p).name)} · ${p.inStock ? 'In stock' : 'Out of stock'}</span></div>
        <span class="sh-price">${money(priceOf(p))}</span>
      </a>`).join('') + `<a class="search-hit" href="#/products?q=${encodeURIComponent(q)}" data-search-hit style="justify-content:center;color:var(--primary-deep);font-weight:700">View all results ${I.arrow}</a>`;
  };

  const trackSearch = q => {
    q = String(q || '').trim();
    if (!q) return;
    trackEvent('search', { search_term: q.slice(0, 120) }, { search_term: q.slice(0, 120) });
  };

  /* ==================== offers tiers (from reference) ==================== */
  const OFFER_TIERS = [
    { min: 500, pct: 5, tag: 'Spend ₹500+ → 5% OFF' },
    { min: 1000, pct: 10, tag: 'Spend ₹1,000+ → 10% OFF' },
    { min: 2000, pct: 15, tag: 'Spend ₹2,000+ → 15% OFF' },
  ];

  /* ---------------- shared homepage/shop blocks ---------------- */
  const BENEFITS = [
    { i: I.shield, t: '100% Original Products', s: 'PESO-certified, safety-tested stock only' },
    { i: I.lock, t: 'Secure Payments', s: 'Protected checkout · Pay on delivery' },
    { i: I.truck, t: 'Fast Delivery', s: 'Hyderabad & Secunderabad, doorstep' },
    { i: I.phone, t: 'Customer Support', s: 'Real humans on call, 9am – 9pm' },
  ];

  const benefitsStrip = () => `
    <div class="benefits-strip">
      ${BENEFITS.map(b => `<div class="benefit reveal"><span class="benefit__ic">${b.i}</span><div><strong>${esc(b.t)}</strong><p>${esc(b.s)}</p></div></div>`).join('')}
    </div>`;

  const pillRow = (group, pills, current = 'all') => `
    <div class="chip-row chip-row--scroll" role="tablist" aria-label="Filter collection">
      ${pills.map(x => `<button class="chip ${x.k === current ? 'active' : ''}" data-pill="${esc(x.k)}" data-pillgroup="${esc(group)}" role="tab" aria-selected="${x.k === current}">${x.n}</button>`).join('')}
    </div>`;

  /* ==================== views ==================== */
  const views = {};

  views.home = () => {
    const stock = allProducts().filter(inStockOf);
    const withImg = stock.filter(p => p.image);

    /* hero composition — real catalog photography, deterministic */
    const usedHero = new Set();
    const heroShots = ['gift-boxes', 'rockets', 'night-outs'].map(c => {
      const p = withImg.find(x => x.cats.includes(c) && !usedHero.has(x.id)) || withImg.find(x => !usedHero.has(x.id));
      if (p) usedHero.add(p.id);
      return p;
    }).filter(Boolean);

    const arrivalPills = [
      { k: 'all', n: 'All' }, { k: 'rockets', n: 'Rockets' }, { k: 'sparklers', n: 'Sparklers' },
      { k: 'flower-pots', n: 'Fountains' }, { k: 'night-outs', n: 'Sky Shots' },
      { k: 'gift-boxes', n: 'Combos' }, { k: 'chakkars', n: 'Chakkars' },
    ];
    const featuredPills = [
      { k: 'all', n: 'All' }, { k: 'best', n: 'Best Sellers' }, { k: 'rockets', n: 'Rockets' },
      { k: 'flower-pots', n: 'Fountains' }, { k: 'gift-boxes', n: 'Combos' }, { k: 'night-outs', n: 'Sky Shots' },
    ];

    /* Only offer a pill when the live catalog can actually fill it */
    const bucketOf = k => stock.filter(p => cardKeys(p).split(' ').includes(k));
    const livePills = pills => pills.filter(x => x.k === 'all' || bucketOf(x.k).length >= 2);

    /* Collections are built so every pill has real material behind it:
       the top 10 by rank lead the grid, then a round-robin top-up per pill bucket. */
    const collectFor = (rank, pills, headline = 10, perPill = 6) => {
      const sorted = [...stock].sort(rank);
      const seen = new Set(), picked = [];
      const take = p => { if (p && !seen.has(p.id)) { seen.add(p.id); picked.push(p); } };
      sorted.slice(0, headline).forEach(take);
      const buckets = pills.filter(x => x.k !== 'all')
        .map(x => sorted.filter(p => cardKeys(p).split(' ').includes(x.k)));
      for (let i = 0; i < perPill; i++) buckets.forEach(b => take(b[i]));
      return picked;
    };

    const arrivalTabs = livePills(arrivalPills);
    const featuredTabs = livePills(featuredPills);
    const arrivals = collectFor((a, b) => b.id - a.id, arrivalTabs);
    const featured = collectFor((a, b) => (featuredOf(b) - featuredOf(a)) || (b.salesCount - a.salesCount), featuredTabs);

    return `
    <!-- ========== 2. HERO ========== -->
    <section class="hero">
      <canvas class="hero-canvas" id="heroCanvas" aria-hidden="true"></canvas>
      <div class="hero-inner">
        <div class="hero-copy">
          <span class="hero-eyebrow"><span class="dot"></span>Celebrate Brighter</span>
          <h1>Light Up Every <span class="grad-text">Celebration</span></h1>
          <p class="hero-lede">Premium quality crackers for every occasion — PESO-certified and factory-direct from Sivakasi, delivered to your doorstep across Hyderabad &amp; Secunderabad.</p>
          <div class="hero-cta">
            <a class="btn btn-primary btn-lg" href="#/products">${I.gift} Shop Now</a>
            <a class="btn btn-glass btn-lg" href="#/products?sort=discount">Explore Crackers ${I.arrow}</a>
          </div>
          <div class="hero-stats">
            <div class="stat"><div class="num">${allProducts().length}+</div><div class="lbl">Products</div></div>
            <div class="stat"><div class="num">${CATS.length}</div><div class="lbl">Categories</div></div>
            <div class="stat"><div class="num">${money(STORE.freeDeliveryAbove)}+</div><div class="lbl">Minimum order</div></div>
            <div class="stat"><div class="num">4.7★</div><div class="lbl">Rated by 2k+</div></div>
          </div>
        </div>

        <div class="hero-visual">
          <span class="hero-glow" aria-hidden="true"></span>
          <div class="hero-stage">
            ${heroShots.map((p, i) => `<a class="hero-shot hero-shot--${['main', 'a', 'b'][i]}" href="${prodUrl(p)}" aria-label="${esc(p.shortName)}">
              <img src="${esc(p.image)}" alt="${esc(p.shortName)}" loading="eager" decoding="async">
              <span class="hero-shot__tag"><b>${esc(p.shortName)}</b><span>${money(priceOf(p))}</span></span>
            </a>`).join('')}
            <div class="hero-chip hero-chip--tl"><span class="hc-ic">${I.shield}</span><span>PESO Certified<small>Licensed dealer</small></span></div>
            <div class="hero-chip hero-chip--br"><span class="hc-ic">${I.truck}</span><span>Minimum order<small>Orders ${money(STORE.freeDeliveryAbove)}+</small></span></div>
          </div>
        </div>
      </div>
    </section>

    <!-- ========== 3. TRUST / BENEFITS ========== -->
    <section class="section" id="trust">
      <div class="section__head section__head--center">
        <div>
          <span class="section__tag">Why shoppers pick us</span>
          <h2 class="section__title">Your Trusted <span class="grad-text">Celebration Partner</span></h2>
          <p class="section__sub">Everything you need for a bright, safe and joyful festival — sourced responsibly and priced fairly.</p>
        </div>
      </div>
      <div class="trust-strip">
        ${[
          { i: I.shield, t: '100% Original Products', s: 'Licensed, safety-tested Sivakasi stock' },
          { i: I.cash, t: 'Best Prices', s: 'Factory-direct rates, no middlemen' },
          { i: I.lock, t: 'Secure Payments', s: 'Protected checkout · COD available' },
          { i: I.truck, t: 'Fast Delivery', s: `Free above ${money(STORE.freeDeliveryAbove)}` },
        ].map(x => `<div class="trust-card reveal"><div class="t-icon">${x.i}</div><div><h3>${esc(x.t)}</h3><p>${esc(x.s)}</p></div></div>`).join('')}
      </div>
    </section>

    <!-- ========== 4. NEW ARRIVALS ========== -->
    <section class="section" id="new-arrivals">
      <div class="section__head">
        <div>
          <span class="section__tag">Just landed</span>
          <h2 class="section__title">New <span class="grad-text">Arrivals</span></h2>
          <p class="section__sub">Discover the latest crackers for your celebration.</p>
        </div>
        <a class="section__link" href="#/products?sort=newest">View all ${I.arrow}</a>
      </div>
      ${pillRow('arrivals', arrivalTabs)}
      <div class="prod-grid prod-grid--5" id="arrivalsGrid" data-cap="10">
        ${arrivals.map(p => productCard(p)).join('')}
      </div>
    </section>

    <!-- ========== 5. FEATURED PRODUCTS ========== -->

    <section class="section" id="featured">
      <div class="section__head">
        <div>
          <span class="section__tag">Hand-picked</span>
          <h2 class="section__title">Featured <span class="grad-text">Products</span></h2>
          <p class="section__sub">Crowd favourites that light up every celebration — the ones that go first.</p>
        </div>
        <a class="section__link" href="#/products?sort=bestsellers">View all ${I.arrow}</a>
      </div>
      ${pillRow('featured', featuredTabs)}
      <div class="prod-grid prod-grid--5" id="featuredGrid" data-cap="10">
        ${featured.map(p => productCard(p)).join('')}
      </div>
    </section>

    <!-- ========== 7. WHY CHOOSE CRACKERS MELA ========== -->
    <section class="section" id="why">
      <div class="section__head section__head--center">
        <div>
          <span class="section__tag">The CrackersMela promise</span>
          <h2 class="section__title">Why Choose <span class="grad-text">Crackers Mela?</span></h2>
          <p class="section__sub">A cleaner, safer and simpler way to buy fireworks — from the first click to the final sparkle.</p>
        </div>
      </div>
      <div class="why-grid">
        ${[
          { i: I.shield, t: '100% Original Products', s: 'Every item is sourced directly from licensed Sivakasi manufacturers and safety-tested before it reaches you.' },
          { i: I.lock, t: 'Secure Payments', s: 'Encrypted checkout with UPI, card and cash-on-delivery — your details are never stored on our servers.' },
          { i: I.truck, t: 'Fast Delivery', s: `Same-day and next-day dispatch across ${esc(STORE.deliveryArea || 'Hyderabad & Secunderabad')}, free above ${money(STORE.freeDeliveryAbove)}.` },
          { i: I.phone, t: 'Customer Support', s: 'Talk to a real person about sizes, safety or bulk orders — every day from 9am to 9pm.' },
        ].map(x => `<div class="why-card reveal"><div class="why-card__ic">${x.i}</div><h3>${esc(x.t)}</h3><p>${x.s}</p></div>`).join('')}
      </div>
    </section>

    ${benefitsStrip()}
    `;
  };

  /* ---------------- shop (listing) helpers ---------------- */
  const PRICE_FLOOR = 0;
  const priceCeiling = () => {
    const highest = allProducts().reduce((maximum, product) => {
      const price = Number(priceOf(product));
      return Number.isFinite(price) ? Math.max(maximum, price) : maximum;
    }, 0);
    return Math.max(500, Math.ceil(highest / 100) * 100);
  };

  const SORTS = [
    ['featured', 'Featured'], ['newest', 'Newest first'], ['bestsellers', 'Best sellers'],
    ['price-asc', 'Price: Low → High'], ['price-desc', 'Price: High → Low'],
    ['discount', 'Biggest discount'], ['rating', 'Top rated'], ['name', 'Name (A–Z)'],
  ];
  const SORT_LABEL = Object.fromEntries(SORTS);

  const AVAIL_STEPS = [['', 'All products'], ['in', 'In stock only'], ['out', 'Out of stock']];

  /* Reads the live filter state out of the URL query */
  const shopState = (route) => {
    const params = new URLSearchParams(route.query || '');
    const maxPrice = priceCeiling();
    const catsRaw = (params.get('cats') || '').split(',').map(s => s.trim()).filter(Boolean);
    const single = params.get('cat');
    const cats = [...new Set([...(single && single !== 'all' ? [single] : []), ...catsRaw])].filter(id => CAT_MAP[id]);
    return {
      params,
      cat: single || 'all',
      cats,
      q: (params.get('q') || '').trim(),
      sort: SORT_LABEL[params.get('sort')] ? params.get('sort') : 'featured',
      min: clamp(parseInt(params.get('min'), 10) || PRICE_FLOOR, PRICE_FLOOR, maxPrice),
      max: clamp(parseInt(params.get('max'), 10) || maxPrice, PRICE_FLOOR, maxPrice),
      avail: AVAIL_STEPS.some(o => o[0] === params.get('avail')) ? params.get('avail') : '',
    };
  };

  /* Builds a #/products?… hash from the current state + a patch */
  const shopHash = (st, patch = {}) => {
    const maxPrice = priceCeiling();
    const next = {
      cat: st.cats.length === 1 ? st.cats[0] : '',
      cats: st.cats.length > 1 ? st.cats.join(',') : '',
      q: st.q, sort: st.sort === 'featured' ? '' : st.sort,
      min: st.min === PRICE_FLOOR ? '' : st.min, max: st.max === maxPrice ? '' : st.max,
      avail: st.avail,
      ...patch,
    };
    if (patch.cats !== undefined) { next.cat = ''; next.cats = patch.cats; }
    if (patch.cat !== undefined) { next.cats = ''; next.cat = patch.cat === 'all' ? '' : patch.cat; }
    const sp = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => { if (v !== '' && v != null) sp.set(k, v); });
    const s = sp.toString();
    return '#/products' + (s ? '?' + s : '');
  };

  const filterShop = (st) => {
    let list = st.q ? searchProducts(st.q) : allProducts();
    if (st.cats.length) list = list.filter(p => p.cats.some(c => st.cats.includes(c)));
    list = list.filter(p => priceOf(p) >= st.min && priceOf(p) <= st.max);
    if (st.avail === 'in') list = list.filter(inStockOf);
    if (st.avail === 'out') list = list.filter(p => !inStockOf(p));

    switch (st.sort) {
      case 'newest': list.sort((a, b) => b.id - a.id); break;
      case 'bestsellers': list.sort((a, b) => b.salesCount - a.salesCount); break;
      case 'price-asc': list.sort((a, b) => priceOf(a) - priceOf(b)); break;
      case 'price-desc': list.sort((a, b) => priceOf(b) - priceOf(a)); break;
      case 'discount': list.sort((a, b) => discountOf(b) - discountOf(a)); break;
      case 'rating': list.sort((a, b) => b.rating - a.rating); break;
      case 'name': list.sort((a, b) => a.shortName.localeCompare(b.shortName)); break;
      default: list.sort((a, b) => (featuredOf(b) - featuredOf(a)) || (b.salesCount - a.salesCount));
    }
    return list;
  };

  const activeTokens = (st) => {
    const t = [];
    st.cats.forEach(id => t.push({ k: 'cat:' + id, l: 'Category', v: CAT_MAP[id].name }));
    if (st.q) t.push({ k: 'q', l: 'Search', v: st.q });
    if (st.min !== PRICE_FLOOR || st.max !== priceCeiling()) t.push({ k: 'price', l: 'Price', v: `${money(st.min)} – ${money(st.max)}` });
    if (st.avail) t.push({ k: 'avail', l: 'Stock', v: st.avail === 'in' ? 'In stock' : 'Out of stock' });
    return t;
  };

  const filterSidebar = (st, list) => {
    const catCount = id => allProducts().filter(p => p.cats.includes(id)).length;
    const maxPrice = priceCeiling();
    const fillPct = v => ((v - PRICE_FLOOR) / (maxPrice - PRICE_FLOOR)) * 100;
    return `
      <aside class="filter-col" id="filterCol" aria-label="Product filters">
        <div class="filter-drawer-head">
          <h3>Filters</h3>
          <button class="filter-close" id="filterClose" aria-label="Close filters">${I.close}</button>
        </div>

        <div class="filter-card">
          <div class="filter-card__head"><h4>Price Range</h4><button class="filter-clear" data-fclear="price">Reset</button></div>
          <div class="range-wrap">
            <div class="range-vals"><b id="rvMin">${money(st.min)}</b><span></span><b id="rvMax">${money(st.max)}</b></div>
            <div class="range-slider">
              <span class="rs-track"></span>
              <span class="rs-fill" id="rsFill" style="left:${fillPct(st.min)}%;right:${100 - fillPct(st.max)}%"></span>
              <input type="range" id="rangeMin" min="${PRICE_FLOOR}" max="${maxPrice}" step="10" value="${st.min}" aria-label="Minimum price">
              <input type="range" id="rangeMax" min="${PRICE_FLOOR}" max="${maxPrice}" step="10" value="${st.max}" aria-label="Maximum price">
            </div>
          </div>
        </div>

        <div class="filter-card">
          <div class="filter-card__head"><h4>Category</h4>${st.cats.length ? '<button class="filter-clear" data-fclear="cats">Clear</button>' : ''}</div>
          <div class="filter-body">
            ${CATS.map(c => `<label class="check-row"><input type="checkbox" value="${c.id}" data-fcat ${st.cats.includes(c.id) ? 'checked' : ''}><span>${esc(c.name)}</span><em class="cr-count">${catCount(c.id)}</em></label>`).join('')}
          </div>
        </div>

        <div class="filter-card">
          <div class="filter-card__head"><h4>Availability</h4>${st.avail ? '<button class="filter-clear" data-fclear="avail">Clear</button>' : ''}</div>
          <div class="filter-body">
            ${AVAIL_STEPS.map(([v, l]) => `<label class="check-row"><input type="radio" name="fAvail" value="${v}" data-favail ${st.avail === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}
          </div>
        </div>

        <button class="btn btn-glass btn-block" data-fclear="all">Clear all filters</button>
      </aside>`;
  };

  views.products = (route) => {
    const st = shopState(route);
    const list = filterShop(st);
    const tokens = activeTokens(st);
    const title = st.cats.length === 1 ? esc(CAT_MAP[st.cats[0]].name)
      : st.q ? `Results for “${esc(st.q)}”`
      : st.cats.length > 1 ? 'Selected categories' : 'All Fireworks';
    const sub = st.cats.length === 1 ? CAT_MAP[st.cats[0]].blurb
      : st.q ? `${list.length} product${list.length === 1 ? '' : 's'} matching your search`
      : 'The full CrackersMela collection — fresh from Sivakasi, ready to celebrate.';

    return `
      <div class="page-head reveal">
        <div class="crumbs"><a href="#/">Home</a><span class="sep">/</span><span>Shop</span></div>
        <h1>${title}</h1>
        <p>${esc(sub)}</p>
      </div>

      <div class="shop-layout">
        ${filterSidebar(st, list)}
        <span class="filter-backdrop" id="filterBackdrop" aria-hidden="true"></span>

        <div class="shop-main">
          <div class="shop-bar reveal">
            <div class="shop-bar__search">${I.search}<input type="text" id="prodSearch" value="${esc(st.q)}" placeholder="Search within products…" aria-label="Search products"></div>
            <div class="shop-bar__right">
              <button class="filter-fab" id="filterFab">${I.sliders} Filters${tokens.length ? `<b>${tokens.length}</b>` : ''}</button>
              <select class="sort-select" id="prodSort" aria-label="Sort products">
                ${SORTS.map(([v, l]) => `<option value="${v}" ${st.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
              </select>
            </div>
          </div>

          ${tokens.length ? `<div class="active-filters reveal">
            <span class="shop-bar__count"><b>${list.length}</b> of ${allProducts().length} products</span>
            ${tokens.map(t => `<button class="f-token" data-ftoken="${esc(t.k)}"><b>${t.l}:</b> ${esc(t.v)} <span aria-hidden="true">×</span></button>`).join('')}
            <button class="filter-clear" data-fclear="all">Clear all</button>
          </div>` : `<p class="result-count reveal"><b>${list.length}</b> ${list.length === 1 ? 'product' : 'products'} · showing the full collection</p>`}

          ${productGrid(list, { emptyTitle: 'No products match those filters', emptyText: 'Try widening the price range or clearing a filter.' })}
        </div>
      </div>

      ${benefitsStrip()}
    `;
  };

  views.product = (route) => {
    const slug = route.params[0];
    const p = allProducts().find(x => x.slug === slug || 'p-' + x.id === slug);
    if (!p) return views.notFound();
    if (!recent.includes(p.id)) { recent = [p.id, ...recent].slice(0, 10); save(); }
    const off = discountOf(p);
    const cat = catLabel(p);
    const qty = cartQty(p.id) || 1;
    const related = allProducts().filter(x => x.id !== p.id && x.cats.some(c => p.cats.includes(c)) && inStockOf(x)).slice(0, 4);

    return `
      <div class="page-head reveal">
        <div class="crumbs"><a href="#/">Home</a><span class="sep">/</span><a href="#/products">Products</a><span class="sep">/</span><a href="#/products?cat=${cat.id}">${esc(cat.name)}</a><span class="sep">/</span><span>${esc(p.shortName)}</span></div>
      </div>

      <div class="prod-detail">
        <div class="prod-detail__media reveal">
          ${p.image ? imgOf(p, 600) : `<div class="fallback">${catIcon(cat)}</div>`}
        </div>

        <div class="prod-detail__info reveal">
          <span class="prod-card__cat" style="font-size:12.5px">${esc(cat.name)}</span>
          <h1>${esc(p.shortName)}</h1>
          <div class="badge-row">
            <div class="rating-row">${stars(p.rating)}<span>${p.rating.toFixed(1)} · ${p.reviews} reviews</span></div>
            <span class="meta-pill">${I.shield} PESO certified</span>
            <span class="meta-pill">${I.bolt} Brand new stock</span>
            ${p.sku ? `<span class="meta-pill">SKU ${esc(p.sku)}</span>` : ''}
          </div>

          <div class="prod-price-big">
            <span class="big">${money(priceOf(p))}</span>
            ${p.compareAt > priceOf(p) ? `<span class="cmp">${money(p.compareAt)}</span>` : ''}
            ${off ? `<span class="off">-${off}% OFF</span>` : ''}
          </div>

          <p class="desc-note">${esc(p.note || p.desc || 'Premium quality fireworks from certified factories.')}</p>

          ${p.compareAt > priceOf(p) ? `<div class="savings-note">${I.check} You save <b>${money((p.compareAt - priceOf(p)) * qty)}</b> on this order</div>` : ''}

          <div class="stock-line ${!p.inStock ? 'out' : p.stock <= 6 ? 'low' : 'in'}">${stockLine(p)}</div>

          ${p.inStock ? `
          <div class="prod-actions">
            <div class="qty-stepper">
              <button id="pdMinus" aria-label="Decrease">−</button>
              <b id="pdQty">${qty}</b>
              <button id="pdPlus" aria-label="Increase">+</button>
            </div>
            <button class="btn btn-primary" id="pdAdd" ${inStockOf(p) ? '' : 'disabled'}>${I.cart} Add to cart</button>
            <button class="btn btn-ghost" id="pdBuyNow" ${inStockOf(p) ? '' : 'disabled'}>${I.bolt} Buy now</button>
            <button class="icon-btn" id="pdWish" aria-label="Toggle wishlist" aria-pressed="${saved(p.id)}">${saved(p.id) ? I.heartF : I.heart}</button>
          </div>` : ''}

          <div class="prod-info-grid">
            <div class="info-tile">${I.truck}<div><b>Delivery</b><span>No delivery fee</span></div></div>
            <div class="info-tile">${I.cash}<div><b>Payment</b><span>Cash / UPI on delivery</span></div></div>
            <div class="info-tile">${I.gift}<div><b>Coupons</b><span>Apply a valid code at checkout</span></div></div>
            <div class="info-tile">${I.shield}<div><b>Safety</b><span>Certified &amp; tested</span></div></div>
          </div>

          <div class="safety-box">
            <h4>${I.shield} Safety first</h4>
            <ul>
              <li>Light fireworks only in open, safe spaces — never indoors.</li>
              <li>Keep water, a bucket of sand or a fire extinguisher nearby.</li>
              <li>Supervise children at all times; keep sparklers at arm's length.</li>
              <li>Burst one at a time and never relight a dud.</li>
            </ul>
          </div>
        </div>
      </div>

      <section class="section">
        <div class="section__head"><div><span class="section__tag">Pairs well</span><h2 class="section__title">You may also <span class="grad-text">love</span></h2></div></div>
        ${productGrid(related)}
      </section>`;
  };

  views.cart = () => {
    const { count, subtotal, festivePct, festiveAmt, saving, delivery, total } = cartTotals();
    if (!count) {
      return `<div class="page-head reveal"><h1>Your cart</h1></div>
        <div class="empty-state reveal"><div class="e-emoji">${I.cart}</div><h3>Your cart is empty</h3><p>Let's find something brilliant to light up the night.</p><a class="btn btn-primary" href="#/products">${I.shop} Start Shopping</a></div>`;
    }
    const lines = cart.map(c => { const p = prodById(c.id); return p ? cartLine(p, c.qty) : ''; }).join('');
    const minLeft = Math.max(0, STORE.minOrder - subtotal);
    const pct = Math.min(100, Math.round((subtotal / STORE.minOrder) * 100));
    const minCard = minLeft > 0 ? `
      <div class="min-order-card">
        <div class="min-order-card__title">${I.alert} Add <b>${money(minLeft)}</b> more</div>
        <div class="min-order-card__sub">to reach the ${money(STORE.minOrder)} minimum order</div>
        <span class="min-order-card__track"><span class="min-order-card__fill" style="width:${Math.max(pct, 3)}%"></span></span>
        <span class="min-order-card__pct">${pct}% of minimum reached</span>
        <button class="shop-more-btn" data-shop-more>${I.shop} Shop More</button>
      </div>` : '';
    return `
      <div class="page-head reveal"><h1>Your cart</h1><p>${count} ${count === 1 ? 'item' : 'items'} · Apply a valid coupon at checkout, if you have one.</p></div>
      <div class="layout-2col">
        <div class="glass-panel reveal">
          <div style="display:flex;flex-direction:column;gap:12px">${lines}</div>
          <div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" id="clearCart">Clear cart</button>
            <a class="btn btn-glass btn-sm" href="#/products">Continue shopping ${I.arrow}</a>
          </div>
        </div>
        <div class="glass-panel reveal" style="position:sticky;top:calc(var(--nav-h) + 20px)">
          <h2>Summary</h2>
          <div style="margin-top:10px">
            <div class="cart-summary" style="margin:0">
              <div class="sum-row"><span>Subtotal</span><b>${money(subtotal)}</b></div>
              <div class="sum-row total"><span>Total</span><b>${money(total)}</b></div>
              <div class="sum-row"><span>You save</span><span class="save">${money(saving + festiveAmt)}</span></div>
            </div>
          </div>
          ${minCard}
          <button class="btn btn-primary btn-block" id="goCheckout" ${subtotal < STORE.minOrder ? 'disabled' : ''}>Proceed to checkout ${I.arrow}</button>
          <p style="font-size:12.5px;color:var(--muted);margin-top:12px;display:flex;gap:8px;align-items:center;justify-content:center">${I.lock} Safe checkout. No prepayment needed.</p>
        </div>
      </div>`;
  };

  /* ---------- Checkout ---------- */
  const checkoutState = { step: 1, data: {}, payment: 'COD', touched: {} };

  const checkoutValidate = (s) => {
    const d = s.data;
    const errs = [];
    if (!d.name || String(d.name).trim().length < 3) errs.push('Full name is required');
    if (!/^[6-9]\d{9}$/.test(String(d.phone || ''))) errs.push('Enter a valid 10-digit mobile number');
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) errs.push('Enter a valid email');
    if (!d.address || String(d.address).trim().length < 8) errs.push('Enter a complete delivery address');
    if (!d.city) errs.push('City is required');
    if (!/^\d{6}$/.test(String(d.pincode || ''))) errs.push('Enter a valid 6-digit pincode');
    if (s.step === 1 && !cart.length) errs.push('Your cart is empty');
    return errs;
  };

  views.checkout = () => {
    if (!cart.length) { toast('Your cart is empty', 'err'); return 'location.#/cart'; }
    if (cart.some(line => !prodById(line.id))) {
      toast('An item in your cart is no longer available. Please review your cart before checkout.', 'err');
      return 'location.#/cart';
    }
    const minT = cartTotals();
    if (minT.subtotal < STORE.minOrder) {
      toast(`Minimum order value is ${money(STORE.minOrder)}. Please add ${money(STORE.minOrder - minT.subtotal)} more to continue.`, 'err');
      return 'location.#/cart';
    }
    checkoutCoupon = { code: null, discount: 0 };
    checkoutState.step = 1;
    checkoutState.coupon = checkoutCoupon;
    return checkoutStepHTML(1);
  };

  const checkoutStepHTML = (step) => {
    const st = checkoutState;
    const d = st.data;
    const t = cartTotals();
    const v = (k, ph = '') => `<input type="text" id="ck_${k}" value="${esc(d[k] || '')}" placeholder="${ph}">`;
    const stepTabs = `
      <div class="stepper">
        <span class="step-pill ${step === 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}"><span class="n">${step > 1 ? '✓' : '1'}</span> Details</span>
        <span class="step-sep"></span>
        <span class="step-pill ${step === 2 ? 'active' : ''} ${step > 2 ? 'done' : ''}"><span class="n">${step > 2 ? '✓' : '2'}</span> Payment</span>
        <span class="step-sep"></span>
        <span class="step-pill ${step === 3 ? 'active' : ''}"><span class="n">3</span> Review</span>
      </div>`;

    let body = '';
    if (step === 1) {
      body = `
        <div class="layout-2col" style="margin-top:6px">
          <div class="glass-panel reveal">
            <h2>Contact &amp; delivery</h2><p class="panel-sub">Where should we bring the sparkle?</p>
            <div class="form-grid">
              <div class="form-field full"><label for="ck_name">Full name <span class="req">*</span></label>${v('name', 'e.g. Rahul Sharma')}</div>
              <div class="form-field"><label for="ck_phone">Mobile <span class="req">*</span></label>
                <div style="display:flex"><span style="display:flex;align-items:center;padding:0 12px;background:var(--surface);border:1.5px solid var(--glass-border-2);border-right:none;border-radius:12px 0 0 12px;font-weight:700;color:var(--muted)">+91</span>
                ${`<input type="tel" id="ck_phone" value="${esc(d.phone || '')}" placeholder="10-digit number" maxlength="10" style="border-radius:0 12px 12px 0">`}</div>
              </div>
              <div class="form-field"><label for="ck_email">Email</label>${`<input type="email" id="ck_email" value="${esc(d.email || '')}" placeholder="Your email (optional)">`}</div>
              <div class="form-field full"><label for="ck_address">Address <span class="req">*</span></label><textarea id="ck_address" rows="2" placeholder="House no, street, colony…">${esc(d.address || '')}</textarea></div>
              <div class="form-field"><label for="ck_area">Area / Landmark</label>${v('area', 'e.g. Beside City Mall')}</div>
              <div class="form-field"><label for="ck_city">City <span class="req">*</span></label>${v('city', d.city || 'Hyderabad')}</div>
              <div class="form-field"><label for="ck_pincode">Pincode <span class="req">*</span></label>${v('pincode', '500001')}</div>
            </div>
            <div style="margin-top:20px;display:flex;gap:10px;justify-content:flex-end">
              <a class="btn btn-ghost" href="#/cart">Back to cart</a>
              <button class="btn btn-primary" id="ckNext1">Continue to payment ${I.arrow}</button>
            </div>
          </div>
          ${checkoutSummaryPanel()}
        </div>`;
    }

    if (step === 2) {
      body = `
        <div class="layout-2col" style="margin-top:6px">
          <div class="glass-panel reveal">
            <h2>Payment method</h2><p class="panel-sub">${STORE.codText}</p>
            <div class="pay-options" role="radiogroup" aria-label="Payment method">
              <div class="pay-option ${st.payment === 'COD' ? 'selected' : ''}" data-pay="COD" role="radio" tabindex="0" aria-checked="${st.payment === 'COD'}"><span class="radio"></span><span class="p-emoji">${I.cash}</span><span><b>Cash on Delivery</b><p>Pay in cash when your order arrives.</p></span></div>
              <div class="pay-option ${st.payment === 'UPI' ? 'selected' : ''}" data-pay="UPI" role="radio" tabindex="0" aria-checked="${st.payment === 'UPI'}"><span class="radio"></span><span class="p-emoji">${I.phone}</span><span><b>UPI on Delivery</b><p>Scan &amp; pay with any UPI app at the door.</p></span></div>
            </div>
            <div style="margin-top:24px;display:flex;gap:10px">
              <button class="btn btn-ghost" id="ckBack1">← Back</button>
              <button class="btn btn-primary btn-block" id="ckNext2">Review order ${I.arrow}</button>
            </div>
          </div>
          ${checkoutSummaryPanel()}
        </div>`;
    }

    if (step === 3) {
      body = `
        <div class="layout-2col" style="margin-top:6px">
          <div class="glass-panel reveal">
            <h2>Review &amp; place order</h2><p class="panel-sub">Almost there — one tap and we're on it.</p>
            <div class="summary-line"><span>Deliver to</span><span class="r">${esc(d.name)} · ${esc(d.phone)}</span></div>
            <div class="summary-line"><span>Address</span><span class="r">${esc(d.address)}${d.area ? ', ' + esc(d.area) : ''}, ${esc(d.city)} — ${esc(d.pincode)}</span></div>
            <div class="summary-line"><span>Payment</span><span class="r">${esc(st.payment === 'COD' ? 'Cash on Delivery' : 'UPI on Delivery')}</span></div>
            <div class="summary-line"><span>Email</span><span class="r">${esc(d.email || '—')}</span></div>
            <div style="margin-top:14px" class="order-items-list">
              ${cart.map(c => { const p = prodById(c.id); return `<div class="order-item">${p.image ? `<img src="${esc(p.image)}" alt="">` : `<div style="width:46px;height:46px;border-radius:9px;background:var(--bg);display:grid;place-items:center">${catIcon(catLabel(p))}</div>`}<span>${esc(p.shortName)} × ${esc(c.qty)}</span><span class="q">${money(priceOf(p) * c.qty)}</span></div>`; }).join('')}
            </div>
            <div style="display:flex;gap:10px;margin-top:22px">
              <button class="btn btn-ghost" id="ckBack2">← Back</button>
              <button class="btn btn-primary btn-block" id="ckPlace">${I.lock} Place order · ${money(Math.max(0, t.subtotal - (checkoutCoupon.code ? checkoutCoupon.discount : 0)))}</button>
            </div>
          </div>
          ${checkoutSummaryPanel()}
        </div>`;
    }

    return `<div class="page-head reveal"><h1>Checkout</h1>${stepTabs}</div>${body}`;
  };

  const checkoutSummaryPanel = () => {
    const t = cartTotals();
    const minLeft = Math.max(0, STORE.minOrder - t.subtotal);
    const couponAmt = checkoutCoupon.code ? checkoutCoupon.discount : 0;
    const finalTotal = Math.max(0, t.subtotal - couponAmt);
    const validCoupon = couponConfig && couponConfig.code;
    return `<div class="glass-panel reveal" style="position:sticky;top:calc(var(--nav-h) + 20px)">
      <h2>Order summary</h2>
      <div style="max-height:220px;overflow:auto;margin:10px 0">
        ${cart.map(c => { const p = prodById(c.id); return `<div class="order-item" style="padding:6px 0">${p.image ? `<img src="${esc(p.image)}" alt="">` : ''}<span>${esc(p.shortName)}</span><span class="q">×${esc(c.qty)} · ${money(priceOf(p) * c.qty)}</span></div>`; }).join('')}
      </div>
      <div class="sum-row"><span>Subtotal</span><b>${money(t.subtotal)}</b></div>
      ${couponAmt > 0 ? `<div class="sum-row"><span>Coupon (${esc(checkoutCoupon.code)})</span><span class="save">−${money(couponAmt)}</span></div>` : ''}
      ${minLeft > 0 ? `<div style="background:rgba(33,150,243,.1);border-radius:9px;padding:8px 12px;font-size:12px;color:var(--ink-soft);margin:8px 0">Add <b>${money(minLeft)}</b> more to reach the ${money(STORE.minOrder)} minimum order</div>` : ''}
      <div class="sum-row total"><span>Total</span><b>${money(finalTotal)}</b></div>
      <div class="sum-row"><span>You save</span><span class="save">${money(t.saving + couponAmt)}</span></div>
      <div style="margin-top:12px;border-top:1px solid var(--glass-border-2);padding-top:12px">
        <label for="ckCouponInput" style="font-size:13px;color:var(--ink-soft);display:block;margin-bottom:6px">Have a coupon?</label>
        <div style="display:flex;gap:6px">
          <input id="ckCouponInput" type="text" placeholder="Enter code" value="${esc(checkoutCoupon.code || '')}" ${checkoutCoupon.code ? 'disabled' : ''} style="flex:1;padding:8px 12px;border:1.5px solid var(--glass-border-2);border-radius:10px;background:var(--surface);font-size:13px">
          <button id="ckApplyCoupon" class="btn ${checkoutCoupon.code ? 'btn-ghost' : 'btn-primary'}" style="padding:8px 14px;font-size:13px;border-radius:10px;white-space:nowrap">${checkoutCoupon.code ? 'Remove' : 'Apply'}</button>
        </div>
        <div id="ckCouponMsg" style="margin-top:6px;font-size:12px">${checkoutCoupon.code ? `<span style="color:#2E7D32">✓ Coupon <b>${esc(checkoutCoupon.code)}</b> applied (−${money(checkoutCoupon.discount)})</span>` : ''}</div>
      </div>
    </div>`;
  };

  views.orderSuccess = (route) => {
    const id = readRoutePart(route.params[0]);
    const order = orders.find(o => o.id === id);
    if (!order) return views.notFound();

    const mkRow = (label, val) => `<div class="summary-line"><span>${label}</span><span class="r">${val}</span></div>`;
    const t = order.totals;

    return `
      <div class="success-hero no-print">
        <div class="check">${I.check}</div>
        <h1>Order placed!</h1>
        <p>Your fireworks are being packed with extra care.</p>
        <div class="order-code" title="Use this code to track your order"><b class="order-code-text">${esc(order.code)}</b> <button class="icon-btn" style="width:32px;height:32px" id="copyCode" aria-label="Copy order code">${I.copy}</button></div>
        <p style="font-size:13px;color:var(--muted);margin-top:8px">SMS &amp; email alerts sent to ${esc(order.customer.phone)} &amp; ${esc(order.customer.email)}</p>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:18px;flex-wrap:wrap">
          <a class="btn btn-primary" href="#/track?id=${esc(routePart(order.code))}">${I.truck} Track order</a>
          <button class="btn btn-glass" id="printInvoice">${I.print} Print / Download invoice</button>
        </div>
      </div>

      <div class="invoice" id="invoiceBox">
        <div class="invoice__head">
          <div class="invoice__brand">
            <img class="logo-img logo-img--invoice" src="images/logo.png" alt="CRACKERSMELA – Buy Crackers Online" width="851" height="213">
            <span><b>CrackersMela</b><small>Premium fireworks · Hyderabad &amp; Secunderabad</small></span>
          </div>
          <div class="invoice__meta">
            <b>INVOICE</b><br>${esc(order.code)}<br>${fmtDate(order.placedAt)}
          </div>
        </div>
        <div class="invoice__body">
          <div class="invoice__addr">
            <div><h5>Billed to</h5>${esc(order.customer.name)}<br>${esc(order.customer.phone)}<br>${esc(order.customer.email)}</div>
            <div><h5>Deliver to</h5>${esc(order.shipping.address)}<br>${esc(order.shipping.area) ? esc(order.shipping.area) + '<br>' : ''}${esc(order.shipping.city)} — ${esc(order.shipping.pincode)}</div>
          </div>
          <table class="invoice__rows">
            <tr><th>Item</th><th>Qty</th><th style="text-align:right">Amount</th></tr>
            ${order.items.map(i => `<tr><td>${esc(i.name)}</td><td>${esc(i.qty)}</td><td style="text-align:right">${money(i.price * i.qty)}</td></tr>`).join('')}
          </table>
          <div class="invoice__totals">
            <div class="row"><span>Subtotal</span><span>${money(t.subtotal)}</span></div>
            ${t.couponCode ? `<div class="row"><span>Coupon (${esc(t.couponCode)})</span><span>−${money(t.couponAmt || 0)}</span></div>` : ''}
            <div class="row grand"><span>Total</span><span>${money(t.total)}</span></div>
          </div>
        </div>
        <div class="invoice__foot">
          Payment: ${esc(order.payment === 'COD' ? 'Cash on Delivery' : 'UPI on Delivery')} · ${STORE.name}, ${STORE.address.line1} · ${STORE.hours}<br>
          Thank you for celebrating with us — burst safely!
        </div>
      </div>

      <div class="no-print" style="text-align:center;margin-top:26px">
        <a class="btn btn-glass" href="#/products">Continue shopping ${I.arrow}</a>
      </div>`;
  };

  views.track = () => {
    const q = new URLSearchParams(location.hash.split('?')[1] || '').get('id');
    return `
      <div class="page-head reveal"><h1>Track your order</h1><p>Enter the order code from your confirmation (e.g. <b>CMXXXXX</b>) — we'll show live status.</p></div>
      <div class="glass-panel reveal" style="max-width:640px">
        <form class="track-form" id="trackForm">
          <input type="text" id="trackCode" placeholder="Order code, e.g. CMT7K2A" value="${esc(q || '')}" autocomplete="off" aria-label="Order code">
          <button class="btn btn-primary" type="submit">${I.search} Track</button>
        </form>
        <div id="trackResult" style="margin-top:8px"></div>
      </div>`;
  };

  const trackRender = code => {
    const box = $('#trackResult'); if (!box) return;
    const order = findOrder(code);
    if (!order) {
      box.innerHTML = `<div class="empty-state" style="padding:26px"><div class="e-emoji">${I.searchX}</div><h3>Order not found</h3><p>Double-check the code or reach us on WhatsApp ${STORE.phones.join(' / ')}.</p></div>`;
      return;
    }
    const t = order.totals;
    box.innerHTML = `
      <div class="glass-panel" style="margin-top:18px">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:16px">
          <div><div class="order-code" style="margin-top:0">${esc(order.code)}</div><p style="font-size:13px;color:var(--muted)">Placed ${fmtDate(order.placedAt)} · ${esc(order.items.reduce((a, b) => a + b.qty, 0))} items</p></div>
          <div style="text-align:right"><span class="tag ${order.status === 'delivered' ? 'in' : ''}">${esc((STATUSES.find(s => s.key === order.status) || {}).label || order.status)}</span><div style="font-weight:800;color:var(--primary-deep);margin-top:6px">${money(t.total)}</div></div>
        </div>
        <div style="background:rgba(33,150,243,.1);border-radius:9px;padding:10px 14px;font-size:13px;color:var(--ink-soft);margin-bottom:16px">Delivering to: ${esc(order.shipping.address)}, ${esc(order.shipping.city)} — ${esc(order.shipping.pincode)} · ${esc(order.payment === 'COD' ? 'Cash on Delivery' : 'UPI on Delivery')}</div>
        ${timeline(order)}
        <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
          <a class="btn btn-ghost btn-sm" href="#/my-orders">My orders</a>
          <a class="btn btn-glass btn-sm" href="#/reorder/${esc(routePart(order.id))}">Reorder ${I.arrow}</a>
        </div>
      </div>`;
  };

  views.reorder = route => {
    const order = orders.find(o => o.id === readRoutePart(route.params[0]));
    if (!order) return views.notFound();
    cart = order.items.map(i => ({ id: i.id, qty: i.qty }));
    save(); cartUI();
    openCart();
    toast('Items added back to your cart');
    return 'location.#/cart';
  };

  views.wishlist = () => {
    const items = wish.map(id => prodById(id)).filter(Boolean);
    return `
      <div class="page-head reveal"><h1>Your wishlist</h1><p>${items.length} saved ${items.length === 1 ? 'item' : 'items'} — grab them before they sell out.</p></div>
      ${productGrid(items, { emptyTitle: 'Nothing saved yet', emptyText: 'Tap the heart on any product to save it here.' })}
      ${items.length ? `<div style="text-align:center;margin-top:24px"><a class="btn btn-primary" href="#/products">${I.gift} Explore more products</a></div>` : ''}`;
  };

  views.myOrders = () => {
    const u = currentUser();
    if (!u) {
      return `<div class="page-head reveal"><h1>My orders</h1></div>
        <div class="glass-panel reveal" style="max-width:520px"><h2>Sign in to view your orders</h2><p class="panel-sub">You'll see order history, statuses and invoices here.</p>
        <button class="btn btn-primary" id="goAuthOrders">Sign in / Register</button></div>`;
    }
    const mine = orders.filter(o => o.email === u.email);
    return `
      <div class="page-head reveal"><h1>My orders</h1><p>${mine.length ? 'Here is your order history.' : "You haven't placed any orders yet."}</p></div>
      ${mine.length ? `<div class="glass-panel reveal">
        ${mine.map(o => {
          const t = o.totals;
          const st = STATUSES.find(s => s.key === o.status);
          return `<div class="summary-line" style="padding:14px 0"><span>
            <a href="#/order/${esc(routePart(o.id))}" style="font-weight:800;color:var(--primary-deep)">${esc(o.code)}</a><br>
            <span style="font-size:12.5px;color:var(--muted)">${fmtDate(o.placedAt)} · ${esc(o.items.reduce((a, b) => a + b.qty, 0))} items</span></span>
            <span style="text-align:right"><span class="tag">${esc(st ? st.label : o.status)}</span><br><b style="font-size:14px">${money(t.total)}</b></span></div>`;
        }).join('')}
      </div>` : `<div class="empty-state reveal"><div class="e-emoji">${I.box}</div><h3>No orders yet</h3><p>Your future Diwali favourites will live here.</p><a class="btn btn-primary" href="#/products">Start shopping</a></div>`}`;
  };

  const CONTENT = {
    about: {
      title: 'About us', lede: 'The story of CrackersMela — and why we do this.',
      body: `
        <h2>Celebrations are our business</h2>
        <p>CrackersMela started with a simple belief: a good celebration should be safe, affordable and unforgettable. For every season we hand-pick certified stock directly from licensed factories in Sivakasi — Tamil Nadu's fireworks capital — so you get the freshest, loudest, brightest crackers without the mandi markup.</p>
        <h2>What makes us different</h2>
        <ul><li><b>PESO-certified stock</b> — every box is licensed, tested and legal.</li><li><b>Factory-direct prices</b> — no middlemen, no inflated rates.</li><li><b>Doorstep delivery</b> across Hyderabad &amp; Secunderabad, same/next day.</li><li><b>People who care</b> — real support on call and WhatsApp.</li></ul>
        <h2>Our promise</h2>
        <p>If a product isn't up to the mark, we make it right. Celebrating together means protecting each other — so we'll always help you burst safely.</p>`,
    },
    contact: {
      title: 'Contact us', lede: 'Questions, bulk orders or just say hi.',
      body: `<div class="contact-grid">
        ${[
          { i: I.phone, t: 'Call us', s: '92480 88588 · 92933 20000', href: 'tel:' + ['9','2','4','8','0','8','8','5','8','8'].join('') },
          { i: I.wa, t: 'WhatsApp', s: 'Chat with the team', href: 'https://wa.me/919248088588' },
          { i: I.mail, t: 'Email', s: STORE.email, href: 'mailto:' + STORE.email },
          { i: I.pin, t: 'Store / outlet', s: STORE.address.line1 + ' · ' + STORE.address.line2 },
          { i: I.clock, t: 'Hours', s: STORE.hours },
        ].map(c => `<div class="contact-card"><div class="c-icon"><div style="width:24px;height:24px;color:inherit">${c.i}</div></div><h2>${c.t}</h2>${c.href ? `<a href="${c.href}">${c.s}</a>` : `<p>${c.s}</p>`}</div>`).join('')}
      </div>
      <div style="margin-top:26px" class="glass-panel">
        <h2>Send us a message</h2><p class="panel-sub">We reply fast — usually within the hour.</p>
        <form id="contactForm" class="form-grid">
          <div class="form-field"><label for="cfName">Your name</label><input type="text" id="cfName" placeholder="Name"></div>
          <div class="form-field"><label for="cfPhone">Phone</label><input type="tel" id="cfPhone" placeholder="10-digit mobile" maxlength="10"></div>
          <div class="form-field full"><label for="cfMsg">Message</label><textarea id="cfMsg" rows="3" placeholder="How can we help?"></textarea></div>
          <div class="form-field full" style="display:flex;gap:12px"><button class="btn btn-primary" type="submit">${I.mail} Send message</button><a class="btn btn-glass" href="https://wa.me/919248088588" target="_blank" rel="noopener">${I.wa} Chat on WhatsApp</a></div>
        </form>
      </div>`,
    },
    faq: {
      title: 'FAQ', lede: 'Quick answers to the questions we get most.',
      body: `<div class="glass-panel">
        ${[
          ['Is it legal to buy fireworks in Telangana?', 'Yes. We sell licensed, PESO-approved stock for permitted festival windows. In Telangana, crackers can be burst for 2 hours on Deepavali and other permitted days per the pollution-control board rules.'],
          ['Where do you deliver?', 'We deliver across Hyderabad and Secunderabad. The minimum order is ₹2,500, and no delivery fee is added.'],
          ['Can I pay at the door?', 'Absolutely — cash or UPI on delivery. No prepayment needed.'],
          ['What if I want bulk quantities for an event?', 'Great! Wholesale &amp; event orders get special rates. Head to the Wholesale page or message us on WhatsApp with quantity and we\'ll quote within the hour.'],
          ['How is the order delivered safely?', 'Every box is sealed stock from certified factories. Our riders carry them upright in fire-safe packaging and hand them to an adult at the address.'],
          ['Can I cancel or change my order?', 'If the order hasn\'t shipped yet, message us on WhatsApp and we\'ll update or cancel it instantly.'],
          ['Are the prices final?', 'Prices shown are per-box prices. Coupon discounts are applied only when you enter and confirm a valid coupon code at checkout.'],
        ].map(([q, a], i) => `<details class="faq-item" ${i === 0 ? 'open' : ''} style="padding:14px 4px;border-bottom:1px solid var(--glass-border-2)"><summary style="font-weight:800;cursor:pointer;font-size:15px;list-style:none;display:flex;justify-content:space-between;gap:10px">${q}<span style="color:var(--primary);font-size:18px" aria-hidden="true">⌄</span></summary><p style="margin-top:10px;color:var(--ink-soft);font-size:14.5px">${a}</p></details>`).join('')}
      </div>`,
    },
    shipping: {
      title: 'Shipping &amp; delivery', lede: 'How fast the sparkle reaches you.',
      body: `<div class="content-card">
        <h2>Delivery area &amp; speed</h2>
        <p>We deliver across <b>Hyderabad &amp; Secunderabad</b>. Orders placed before 6:00 PM are usually delivered the same evening or next morning; most areas get next-day delivery during the season.</p>
        <h2>Charges</h2>
        <ul><li>Orders of <b>₹2,500 and above</b> are eligible to checkout.</li><li>No delivery fee is added to your order.</li><li>Coupon discounts are applied only when you confirm a valid coupon code at checkout.</li></ul>
        <h2>Safe handling</h2>
        <p>Our riders are trained to handle fireworks responsibly. Stock stays sealed and upright, and a minimum-order rule helps keep everything stable and safe.</p>
      </div>`,
    },
    returns: {
      title: 'Returns &amp; refunds', lede: 'Oversold, under-delivered? We make it right.',
      body: `<div class="content-card">
        <h2>Damaged or incorrect items</h2>
        <p>Fireworks are sealed factory stock — if anything arrives damaged or doesn't match your order, tell us within 24 hours on WhatsApp or call. We'll replace it or refund you, no questions.</p>
        <h2>How to start a return</h2>
        <ul><li>Keep the invoice (sent by SMS/email).</li><li>Message the order code + photo on WhatsApp 92480 88588.</li><li>We arrange pickup or issue the refund within 24–48 hours.</li></ul>
        <h2>Not eligible</h2>
        <p>Once partially used or burst, items can't be returned — for everyone's safety.</p>
      </div>`,
    },
    safety: {
      title: 'Safety &amp; usage', lede: 'Big fun, greater responsibility.',
      body: `<div class="content-card">
        <h2>Bursting dos</h2>
        <ul><li>Always burst fireworks outdoors in an open area — never indoors.</li><li>Keep a bucket of water or sand nearby, and one firecracker at a time.</li><li>Keep a safe distance after lighting, and never lean over a lit cracker.</li><li>Let children burst under adult supervision, one at a time.</li><li>Do not relight a dud — pour water on it.</li><li>Wear well-fitting cotton clothing. Avoid loose or synthetic clothing.</li></ul>
        <h2>Storage</h2>
        <p>Store crackers in a dry, cool place away from sources of fire or heat. Don't keep them near gas cylinders or electric boards.</p>
        <h2>Follow local rules</h2>
        <p>In Telangana, fireworks are permitted for a fixed window (typically 8 PM – 10 PM) on Deepavali and other allowed days. Respect the rules and your neighbours.</p>
      </div>`,
    },
    terms: {
      title: 'Terms of service', lede: 'The fine print, written plainly.',
      body: `<div class="content-card">
        <h2>Products &amp; pricing</h2>
        <p>All products shown are licensed and PESO-certified. Prices, offers and availability may change; the price shown at checkout is final.</p>
        <h2>Orders</h2>
        <p>Order confirmation is sent via SMS/email with a tracking code. We may cancel any order if stock is unavailable, and refund you in full.</p>
        <h2>Age &amp; use</h2>
        <p>Fireworks are sold to and handed over to adults only. By ordering you confirm you're 18+ and will use products safely and legally.</p>
      </div>`,
    },
    privacy: {
      title: 'Privacy policy', lede: 'Your data stays yours.',
      body: `<div class="content-card">
        <h2>What we collect</h2>
        <p>Only what's needed to serve you: name, phone, delivery address and email. We never sell or share this data. If you allow analytics, we also collect pseudonymous visit and shopping events to improve the store.</p>
        <h2>How it's used</h2>
        <p>Delivery, order updates, and (if you opt in) festive offers. You can ask us to delete your data any time on WhatsApp.</p>
        <h2>Payments</h2>
        <p>Payment is by cash or UPI on delivery. We do not collect card details on this website.</p>
      </div>`,
    },
    wholesale: {
      title: 'Wholesale &amp; events', lede: 'Special rates for bulk and celebrations.',
      body: `<div class="content-card">
        <h2>Bulk pricing</h2>
        <p>Weddings, corporate shows, mandi suppliers and shop owners get priority rates. Share your list on WhatsApp and our team will quote within the hour.</p>
        <ul><li>₹10,000+ orders — special negotiated rates</li><li>Same-day dispatch for bulk orders</li><li>Consistent supply through the season</li><li>GST invoice for businesses</li></ul>
        <div style="display:flex;gap:12px;margin-top:18px;flex-wrap:wrap">
          <a class="btn btn-primary" href="https://wa.me/919248088588?text=Hi!%20I%20need%20a%20bulk%20quote." target="_blank" rel="noopener">${I.wa} WhatsApp for a quote</a>
          <a class="btn btn-glass" href="#/price-list">Browse price list</a>
        </div>
      </div>`,
    },
  };

  views.content = (route) => {
    const c = CONTENT[route.params[0]];
    if (!c) return views.notFound();
    return `<div class="page-head reveal"><h1>${c.title}</h1><p>${c.lede}</p></div><div class="reveal content-copy" style="max-width:820px">${c.body}</div>`;
  };

  views.priceList = () => `
    <div class="page-head reveal"><h1>Price list</h1><p>MRP vs our price — transparent, front and centre. Bulk rates on WhatsApp.</p></div>
    <div class="glass-panel reveal" style="margin-bottom:20px;padding:16px 18px">
      <div class="chip-row" style="gap:8px">
        <div class="prod-toolbar__search" style="flex:1;min-width:200px">${I.search}<input type="text" id="plSearch" placeholder="Search price list…" aria-label="Search price list"></div>
        <select id="plCat" class="filter-select" aria-label="Filter category"><option value="all">All categories</option>${CATS.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select>
      </div>
    </div>
    <div class="table-wrap reveal"><table class="data-table" id="plTable">
      <thead><tr><th>Item</th><th>Category</th><th style="text-align:right">MRP</th><th style="text-align:right">Our price</th><th style="text-align:right">Save</th><th style="text-align:center">Stock</th></tr></thead>
      <tbody>${priceListRows()}</tbody>
    </table></div>
    <div class="reveal" style="text-align:center;margin-top:22px">
      <a class="btn btn-primary" href="https://wa.me/919248088588?text=Hi!%20I%20need%20the%20bulk%20price%20list." target="_blank" rel="noopener">${I.wa} Get bulk rates</a>
    </div>`;

  const priceListRows = (filterCat = 'all', q = '') => allProducts().filter(p =>
    (filterCat === 'all' || p.cats.includes(filterCat)) &&
    (!q || (p.shortName + ' ' + p.name).toLowerCase().includes(q)))
    .map(p => {
      const off = discountOf(p);
      return `<tr>
        <td class="row-name" style="max-width:340px"><a href="${prodUrl(p)}">${esc(p.shortName)}</a></td>
        <td>${esc(catLabel(p).name)}</td>
        <td style="text-align:right">${p.compareAt > priceOf(p) ? money(p.compareAt) : '—'}</td>
        <td style="text-align:right;font-weight:800;color:var(--primary-deep)">${money(priceOf(p))}</td>
        <td style="text-align:right;color:var(--success);font-weight:700">${off ? '-' + off + '%' : '—'}</td>
        <td style="text-align:center"><span class="tag ${inStockOf(p) ? 'in' : 'out'}">${inStockOf(p) ? 'In stock' : 'Out'}</span></td>
      </tr>`;
    }).join('');

  /* ---------------- admin icons (shell) ---------------- */
  const I2 = {
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/></svg>',
    pie: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M12 3a9 9 0 0 1 9 9h-9z"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/></svg>',
    sheet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/></svg>',
    cashI: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="12" rx="2"/><circle cx="12" cy="13" r="2.4"/><path d="M6 13h.01M18 13h.01"/></svg>',
    palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.9 2-2 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1.1.9-2 2-2h2.4A3.6 3.6 0 0 0 21 11a9 9 0 0 0-9-8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.3 7a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.7 7l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    scroll: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h7a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H5V8h10v13"/><path d="M6 3h10"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    exit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/><path d="m15 5 4 4"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 3 6.6 7 .9-5.2 4.8 1.4 7-6.2-3.6L5.8 21l1.4-7L2 9.5l7-.9z"/></svg>',
    sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/></svg>',
    tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.4"/></svg>',
  };
  const STATUS_PILL = { placed: 'pending', confirmed: 'confirmed', packed: 'packed', shipped: 'processing', out_for_delivery: 'processing', delivered: 'delivered' };
  const adminGravatar = u => esc((u.name || 'A').trim().charAt(0).toUpperCase());

  const ADMIN_NAV = [
    { grp: 'MAIN', items: [
      { id: 'dashboard', label: 'Dashboard', icon: I2.grid },
    ] },
    { grp: 'MANAGE', items: [
      { id: 'analytics', label: 'Analytics', icon: I2.pie },
      { id: 'orders', label: 'Orders', icon: I2.sheet, badge: orders.length },
      { id: 'products', label: 'All Products', icon: I2.box },
      { id: 'add-product', label: 'Add Product', icon: I2.plus },
      { id: 'categories', label: 'Categories', icon: I2.layers },
      { id: 'price-list', label: 'Price List', icon: I2.cashI },
      { id: 'pos', label: 'Billing / POS', icon: I2.cashI },
      { id: 'canvas', label: 'Canvas Editor', icon: I2.palette },
    ] },
    { grp: 'OTHERS', items: [
      { id: 'customers', label: 'Users', icon: I2.user },
      { id: 'notifications', label: 'Notifications', icon: I2.bell, badge: 'unread' },
      { id: 'settings', label: 'Settings', icon: I2.gear },
      { id: 'logs', label: 'Logs', icon: I2.scroll },
    ] },
  ];
  const ADM_QA = [
    { id: 'add-product', label: 'Add Product', icon: I2.plus },
    { id: 'products', label: 'All Products', icon: I2.box },
    { id: 'orders', label: 'Orders', icon: I2.sheet },
    { id: 'pos', label: 'Billing / POS', icon: I2.cashI },
    { id: 'price-list', label: 'Price List', icon: I2.sheet },
    { id: 'customers', label: 'Users', icon: I2.user },
    { id: 'categories', label: 'Categories', icon: I2.layers },
    { id: 'canvas', label: 'Canvas Editor', icon: I2.palette },
  ];

  let adminPanel = 'dashboard';
  let salesRange = 7;
  let salesSince = null;
  let admQ = '';
  let posCart = [];
  let posCat = 'all';
  let posSortK = 'default';
  let posPayMode = 'COD';
  let heldBills = [];
  /* Site settings owned by the admin backend (synced via products-api settings key).
     maintenance: site-wide flag · coupon: storefront coupon config (null = keep local default). */
  let cmSettings = ls.get('cmSettings', { maintenance: false, coupon: null });
  let posPrefs = ls.get('posPrefs', { theme: 'dark' });
  let feedTimer = null;
  /* maintenance mode — the site-wide flag lives in the admin backend (products-api
     settings key) and is synced to every visitor. No per-browser override. */
  let remoteMaint = false;
  const maintOn = () => !!remoteMaint;

  const toggleMaint = () => {
    cmSettings.maintenance = !cmSettings.maintenance;
    remoteMaint = !!cmSettings.maintenance;
    ls.set('cmSettings', cmSettings);
    syncProductsPush();
    toast(remoteMaint ? 'Site-wide maintenance ENABLED — storefront switches over within seconds' : 'Site-wide maintenance disabled — storefront back online', 'ok');
    switchAdminPanel('settings');
  };

  const checkMaint = async () => {
    try {
      const r = await fetch(PRODUCTS_API + '?a=pull&t=' + Date.now(), { cache: 'no-store' });
      const j = await r.json();
      if (j && j.ok === true && j.settings && typeof j.settings === 'object') {
        cmSettings = { maintenance: !!j.settings.maintenance, coupon: j.settings.coupon || null };
        remoteMaint = !!cmSettings.maintenance;
        ls.set('cmSettings', cmSettings);
      }
    } catch { /* keep current flag */ }
    if (document.querySelector('.maint-scene')) {
      if (maintOn()) toast('Still undergoing maintenance — check back soon.');
      else { toast('Maintenance cleared — welcome back.'); route(); }
    } else {
      toast(remoteMaint ? 'Site-wide maintenance is ON (backend flag)' : 'Site-wide maintenance is off', 'ok');
      switchAdminPanel('settings');
    }
  };

  const bellUnread = () => activity.filter(a => !a.read && a.type === 'order').length;

  views.staff = () => {
    const u = currentUser();
    if (!u || !isStaffRole(u.role)) {
      return `<div class="page-head reveal"><h1>Admin panel</h1><p>Restricted — sign in with a staff account.</p></div>
        <div class="glass-panel reveal" style="max-width:520px"><h2 style="margin:0 0 14px">Staff access only</h2>
        <button class="btn btn-primary" id="goAuthStaff">Sign in as staff</button></div>`;
    }
    adminPanel = 'dashboard';
    document.body.classList.remove('pos-mode');
    return adminShell(u);
  };

  const maintSparks = (n = 20) => {
    let out = '';
    for (let i = 0; i < n; i++) {
      const a = i * 2.399963;
      const r = 33 + (i % 5) * 3.4 + Math.random() * 9;
      const px = 50 + Math.cos(a) * r;
      const py = 47 + Math.sin(a) * r * 0.92;
      const s = 3 + (i % 4) * 1.6;
      const dur = (3.6 + (i % 5) * 1.15).toFixed(2);
      const dl = (i * 0.55).toFixed(2);
      const col = ['#ffffff', '#E3F2FD', '#90CAF9', '#2196F3'][i % 4];
      const x = i % 4 === 0 ? ' maint-spark--x' : '';
      out += `<i class="maint-spark${x}" style="--px:${px.toFixed(1)}%;--py:${py.toFixed(1)}%;--s:${s.toFixed(1)}px;--c:${col};--dur:${dur}s;--d:${dl}s"></i>`;
    }
    return out;
  };

  views.maintenance = () => `
    <div class="maint-scene">
      <button class="maint-login" data-maint-login type="button" aria-label="Login to CrackersMela">
        <span class="maint-login__ico">${I2.user}</span><span class="maint-login__txt">Login</span>
      </button>
      <div class="maint-glow maint-glow--a" aria-hidden="true"></div>
      <div class="maint-glow maint-glow--b" aria-hidden="true"></div>
      <div class="maint-shape maint-shape--1" aria-hidden="true"></div>
      <div class="maint-shape maint-shape--2" aria-hidden="true"></div>
      <div class="maint-shape maint-shape--3" aria-hidden="true"></div>
      <div class="maint-card">
        <img class="logo-img maint-logo" src="images/logo.png" alt="CrackersMela – Buy Crackers Online" width="851" height="213">
        <div class="maint-pill"><span class="maint-pill__dot"></span>Maintenance in progress</div>
        <h1 class="maint-title">We&rsquo;ll Be Back Soon</h1>
        <p class="maint-sub">CrackersMela is currently undergoing a little maintenance.<br>We&rsquo;re making things better for your next celebration.</p>
      </div>
      <div class="maint-sparks" aria-hidden="true">${maintSparks()}</div>
    </div>`;

  const adminShell = u => `
    <div class="admin-shell" id="adminShell" data-admtheme="${admPrefs.theme === 'dark' ? 'dark' : 'light'}">
      <aside class="admin-side">
        <div class="as-brand"><img class="as-logo-img" src="images/logo.png" alt="CRACKERSMELA – Buy Crackers Online" width="851" height="213"><div><b>Admin Console</b><small>CrackersMela</small></div></div>
        <nav class="as-nav">
          ${ADMIN_NAV.map(g => `<div class="as-grp"><span class="as-grp-t">${g.grp}</span>${g.items.map(it => `
            <button class="as-item ${adminPanel === it.id ? 'active' : ''}" data-stab="${it.id}" data-panel="${it.id}">
              <span class="as-ico">${it.icon}</span><span>${it.label}</span>
              ${it.badge === 'unread' ? `<b class="as-badge" data-bell-badge>${bellUnread() || ''}</b>` : it.badge ? `<b class="as-badge">${it.badge}</b>` : ''}
            </button>`).join('')}</div>`).join('')}
        </nav>
        <div class="as-foot">
          <button class="as-item" data-signout><span class="as-ico">${I2.exit}</span><span>Sign out</span></button>
          <span class="as-ver">CrackersMela Console · v2</span>
        </div>
      </aside>
      <button type="button" class="as-scrim" data-side-dismiss aria-label="Close navigation"></button>

      <div class="admin-body">
        <header class="admin-top">
          <div class="at-left">
            <button class="at-icon" data-side-toggle aria-label="Toggle sidebar">${I2.menu}</button>
            <div class="at-search">
              ${I2.search}<input id="admSearch" type="text" placeholder="Search orders, products, users…" autocomplete="off">
              <div class="at-search-box" id="admSearchBox"></div>
            </div>
          </div>
          <div class="at-right">
            <span class="at-chip at-srv">${PREVIEW ? 'Local preview' : 'Admin console'}</span>
            <button class="at-icon" data-theme-btn title="Toggle dark mode">${admPrefs.theme === 'dark' ? I2.sun : I2.moon}</button>
            <button class="at-icon at-bell" data-bell title="Notifications">${I2.bell}<b class="at-bell-n" data-bell-badge>${bellUnread() || ''}</b></button>
            <div class="at-av" data-avme>
              <button class="at-av-btn" data-av-btn><span class="av-ic">${adminGravatar(u)}</span><span class="at-av-meta"><b>${esc(u.name)}</b><small>${u.role === 'admin' ? 'Administrator' : 'Staff'}</small></span></button>
              <div class="at-av-menu" id="avMenu">
                <a href="${publicRoute('#/my-orders')}">${I2.user} My storefront account</a>
                <button data-theme-btn2>${I2.sun} Switch to ${admPrefs.theme === 'dark' ? 'light' : 'dark'} mode</button>
                <button data-signout>${I2.exit} Sign out</button>
              </div>
            </div>
          </div>
        </header>

        <div class="admin-main">
          <div id="staffPanel">${panelOf(adminPanel, u)}</div>
        </div>
      </div>
    </div>`;

  const panelOf = (p, u = currentUser()) => {
    try {
      const map = {
        dashboard: () => panelDashboard(u),
        analytics: panelAnalytics, orders: panelOrders, products: panelProducts, 'add-product': panelAddProduct,
        categories: panelCategories, 'price-list': panelPriceList, pos: panelPos, canvas: panelCanvas,
        customers: panelCustomers, notifications: panelNotifications, settings: () => panelSettings(u),
        logs: panelLogs, danger: panelDanger,
      };
      return map[p] ? map[p]() : errPanel();
    } catch (e) { return errPanel(e); }
  };

  const errPanel = (e = null) => `<div class="glass err-panel">
      <div class="e-emoji">${I.alert}</div><h3>Something went wrong</h3>
      <p class="panel-sub">This panel could not be loaded. Please try again.</p>
      <button class="btn btn-primary" data-reload-panel>${I2.refresh} Retry</button></div>`;

  const panelDashboard = u => {
    const revenue = orders.reduce((a, o) => a + o.totals.total, 0);
    const last7 = orders.filter(o => Date.now() - new Date(o.placedAt).getTime() < 7 * 864e5);
    const prev7 = orders.filter(o => { const d = Date.now() - new Date(o.placedAt).getTime(); return d >= 7 * 864e5 && d < 14 * 864e5; });
    const rev7 = last7.reduce((a, o) => a + o.totals.total, 0);
    const revPrev = prev7.reduce((a, o) => a + o.totals.total, 0);
    const prods = allProducts();
    const featured = prods.filter(featuredOf).length;
    const uniqCust = new Set(orders.map(o => o.email)).size;
    const activeCust = new Set(orders.filter(o => Date.now() - new Date(o.placedAt).getTime() < 14 * 864e5).map(o => o.email)).size;
    const returning = Object.entries(users).filter(([e, ux]) => { const n = orders.filter(o => o.email === e).length; return n > 1 && ['customer'].includes(ux.role || 'customer'); }).length;
    const conv = orders.length ? Math.round(clamp(orders.length / Math.max(1, uniqCust || 1) * 18, 3, 98)) : 0;
    const recentList = [...orders].slice(0, 6);
    return `
      <div class="ad-head ad-head--dashboard">
        <div><h1>Store overview</h1>
          <p class="panel-sub">${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · Sales, orders, and catalog activity.</p></div>
        <div class="ad-head-cta"><a class="btn btn-ghost" href="${PUBLIC_ENTRY}">${I2.grid} View store</a><button class="btn btn-primary" data-qa="add-product">${I2.plus} Add Product</button></div>
      </div>

      <div class="kpi-grid">
        <div class="kpi kpi--revenue">
          <div class="k-head"><span class="k-ico" aria-hidden="true">${I2.cashI}</span><span class="k-lbl">Total Revenue</span></div>
          <div class="k-num"><span data-count="${revenue}" data-money="1">0</span></div>
          <div class="k-sub">${pctChip(rev7, revPrev)} <span>vs last 7 days</span></div>
        </div>
        <div class="kpi">
          <div class="k-head"><span class="k-ico" aria-hidden="true">${I2.sheet}</span><span class="k-lbl">Total Orders</span></div>
          <div class="k-num"><span data-count="${orders.length}">0</span></div>
          <div class="k-sub">${pctChip(last7.length, prev7.length)} <span>vs last 7 days</span></div>
        </div>
        <div class="kpi">
          <div class="k-head"><span class="k-ico" aria-hidden="true">${I2.box}</span><span class="k-lbl">Total Products</span></div>
          <div class="k-num"><span data-count="${prods.length}">0</span></div>
          <div class="k-sub"><span>${prods.filter(inStockOf).length} in stock</span></div>
        </div>
        <div class="kpi">
          <div class="k-head"><span class="k-ico" aria-hidden="true">${I2.star}</span><span class="k-lbl">Featured Products</span></div>
          <div class="k-num"><span data-count="${featured}">0</span></div>
          <div class="k-sub"><span>${Math.round((featured / Math.max(1, prods.length)) * 100)}% of catalog</span></div>
        </div>
      </div>

      <div class="qa-head"><h2>Quick actions</h2><span class="panel-sub">Jump to a workspace</span></div>
      <div class="qa-grid">
        ${ADM_QA.map(q => `<button class="qa-tile" type="button" data-qa="${q.id}" aria-label="${q.label}"><span class="qa-ic" aria-hidden="true">${q.icon}</span><span>${q.label}</span>${I.arrow}</button>`).join('')}
      </div>

      <div class="dash-2col">
        <div class="glass g-card g-sales">
          <div class="panel-row">
            <h3>Sales Overview</h3>
            <div class="seg" role="group" aria-label="Sales date range">
              <button class="seg-b ${salesRange === 7 && !salesSince ? 'on' : ''}" data-range="7" type="button">7D</button>
              <button class="seg-b ${salesRange === 14 && !salesSince ? 'on' : ''}" data-range="14" type="button">14D</button>
              <button class="seg-b ${salesRange === 28 && !salesSince ? 'on' : ''}" data-range="28" type="button">28D</button>
              <button class="seg-b ${salesSince ? 'on' : ''}" data-range="custom" type="button">Custom</button>
            </div>
          </div>
          <div class="sale-rows" id="saleSum" aria-live="polite"></div>
          ${orders.length ? `<div class="chart-frame"><canvas id="soChart" height="200" aria-label="Sales overview chart"></canvas></div>
            <div class="cal-row"><input type="date" id="soFrom" aria-label="Sales start date" ${salesSince ? `value="${salesSince}"` : ''}><span class="panel-sub">→</span><input type="date" id="soTo" aria-label="Sales end date" ${salesSince ? `value="${salesSince}"` : ''}></div>`
            : `<div class="chart-empty"><strong>No orders in this period</strong><span>Revenue and order trends will appear here when sales are recorded.</span></div>`}
        </div>

        <div class="glass g-card g-feed">
          <div class="panel-row"><h3>Live Order Feed</h3><button class="link-btn" data-goto="orders">View All ${I.arrow}</button></div>
          <div class="live-feed" id="liveFeed" aria-live="polite">${liveFeedHTML()}</div>
        </div>
      </div>

      <div class="glass g-card g-tbl">
        <div class="panel-row"><h3>Recent Orders</h3><button class="link-btn" data-goto="orders">View All ${I.arrow}</button></div>
        ${recentList.length ? `<div class="table-wrap"><table class="data-table">
          <thead><tr><th>Code</th><th>Customer</th><th style="text-align:right">Total</th><th>Payment</th><th>Status</th><th>When</th></tr></thead>
          <tbody>${recentList.map(o => orderRow(o)).join('')}</tbody>
        </table></div>` : `<div class="empty-state" style="padding:22px"><div class="e-emoji">${I.box}</div><h3>No orders yet</h3><p>Orders from the storefront appear here instantly.</p></div>`}
      </div>

      <div class="dash-2col">
        <div class="glass g-card">
          <h3>Top Selling Products</h3>
          ${orders.length ? `<div class="top-list">${topSellers().map((t, i) => `
            <div class="top-row"><span class="rank rank-${Math.min(i + 1, 3)}">${i + 1}</span>
              <span class="top-th" style="background:transparent">${t.p.image ? `<img src="${esc(t.p.image)}" alt="">` : catIcon(catLabel(t.p))}</span>
              <span class="top-info"><b>${esc(t.p.shortName)}</b><small>${esc(t.qty)} sold · ${money(priceOf(t.p))}</small></span>
              <b class="top-rev">${money(t.qty * priceOf(t.p))}</b></div>`).join('')}</div>`
            : `<div class="empty-state" style="padding:20px"><div class="e-emoji">${I.trophy}</div><h3>No sales yet</h3></div>`}
        </div>
        <div class="glass g-card">
          <div class="panel-row"><h3>Payment Split</h3><span class="panel-sub">${orders.length ? `${Math.round((orders.filter(o => o.payment === 'COD').length / orders.length) * 100)}% COD` : 'Awaiting orders'}</span></div>
          ${orders.length ? `<canvas id="dmChart" height="170" aria-label="Payment method donut"></canvas>` : `<div class="split-empty">Payment mix will appear after the first order.</div>`}
        </div>
      </div>

      <div class="m-bar">
        <div class="m-item"><b>${activeCust}</b><span>Active Customers</span></div>
        <div class="m-item"><b>${conv}%</b><span>Conversion Rate</span></div>
        <div class="m-item"><b>${returning}</b><span>Returning Customers</span></div>
      </div>`;
  };
  const liveFeedHTML = () => {
    const items = [...activity].filter(a => a.type === 'order').slice(0, 6);
    if (!items.length) return `<div class="feed-empty">${I2.bell} New orders will stream in here.</div>`;
    return items.map(a => {
      const order = a.oid != null ? orders.find(o => String(o.id) === String(a.oid)) : null;
      const parts = String(a.msg || '').split(' · ');
      const code = order ? order.code : (parts[0] || 'Order');
      const customer = order ? ((order.customer || {}).name || '') : (parts[1] || 'Storefront order');
      const amount = order ? money(order.totals.total) : (parts[2] || '—');
      const status = order ? String(order.status || 'placed').replace(/[^a-z_]/gi, '') : '';
      return `<article class="feed-row" data-oid="${esc(order ? order.id : '')}">
        <span class="feed-dot ${status ? `feed-dot--${status}` : ''}" aria-hidden="true"></span>
        <span class="feed-main"><span class="feed-line"><b class="feed-code">${esc(code)}</b><time class="feed-at">${timeAgo(a.at)}</time></span><small class="feed-customer">${esc(customer)}</small></span>
        <b class="feed-amount">${esc(amount)}</b>
      </article>`;
    }).join('');
  };

  const topSellers = () => {
    const unitsBy = {};
    for (const o of orders) for (const it of o.items || []) unitsBy[it.id] = (unitsBy[it.id] || 0) + it.qty;
    return Object.entries(unitsBy).map(([id, qty]) => ({ p: allProducts().find(x => x.id === Number(id)), qty })).filter(x => x.p).sort((a, b) => b.qty - a.qty).slice(0, 5);
  };

  const orderRow = (o, expandId = '') => `<tr>
    <td class="row-name"><button type="button" class="link-btn order-code-btn" data-code-detail="${esc(o.id)}"><span class="order-code">${esc(o.code)}</span><span class="order-expand" aria-hidden="true">${expandId === o.id ? '▴' : '▾'}</span></button></td>
    <td class="order-customer">${esc(o.customer.name)}<span class="order-customer__phone">${esc(o.customer.phone)}</span></td>
    <td class="order-total">${money(o.totals.total)}</td>
    <td><span class="pay-chip ${o.payment === 'COD' ? 'cod' : 'upi'}">${esc(o.payment === 'COD' ? 'COD' : 'UPI')}</span></td>
    <td><select class="pill-sel pill-sel--${STATUS_PILL[o.status] || 'pending'}" data-status="${esc(o.id)}" aria-label="Status for ${esc(o.code)}">${STATUSES.map(s => `<option value="${s.key}" ${s.key === o.status ? 'selected' : ''}>${s.label}</option>`).join('')}</select></td>
    <td class="order-date"><time datetime="${esc(o.placedAt)}">${fmtDate(o.placedAt)}</time></td>
  </tr>${expandId === o.id ? orderDetailRow(o) : ''}`;

  const thumb = p => productImageMarkup(p, undefined, 'thumb');

  const adminPageHead = (title, summary) => `<header class="ad-head workspace-head"><div><h1>${esc(title)}</h1><p class="panel-sub">${esc(summary)}</p></div></header>`;

  const panelCustomers = () => {
    const q = (admQ || '').toLowerCase();
    const list = Object.entries(users).filter(([email, ux]) => !q || email.toLowerCase().includes(q) || (ux.name || '').toLowerCase().includes(q) || (ux.city || '').toLowerCase().includes(q));
    const rows = list.map(([email, user]) => {
      const mine = orders.filter(o => o.email === email);
      const spent = mine.reduce((a, o) => a + o.totals.total, 0);
      return `<tr>
        <td class="row-name"><span class="p-cell"><span class="av-ic sm">${esc((user.name || 'C').trim().charAt(0).toUpperCase())}</span><span>${esc(user.name || '—')}<small>${esc(user.city || user.area || '')}</small></span></span></td>
        <td>${esc(email)}</td>
        <td><span class="role-chip ${user.role === 'admin' ? 'a' : isStaffRole(user.role) ? 's' : 'c'}">${esc(user.role || 'customer')}</span></td>
        <td style="font-size:12.5px;color:var(--muted)">${user.createdAt ? fmtDate(user.createdAt) : '—'}</td>
        <td style="text-align:center">${mine.length}</td>
        <td style="text-align:center;font-weight:800;color:var(--primary-deep)">${mine.length ? money(spent) : '—'}</td>
      </tr>`;
    }).join('');
    return `
      ${adminPageHead('Users', 'Review customer and staff accounts, order history, and spend.')}
      <div class="tbl-tools">
        <div class="at-search mini">${I2.search}<input id="admUq" type="text" placeholder="Search users…" value="${esc(q)}"></div>
        <span class="panel-sub">${list.length} users</span>
      </div>
      ${rows ? `<div class="table-wrap"><table class="data-table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th style="text-align:center">Orders</th><th style="text-align:center">Spent</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>` : `<div class="empty-state"><div class="e-emoji">${I.users}</div><h3>No customers yet</h3><p>People who register on this device will be listed here.</p></div>`}`;
  };

  const orderDetailRow = o => `<tr class="odetail" data-oid="${esc(o.id)}">
      <td colspan="6"><div class="odetail-inner">
        <div class="odetail-left"><h4>Items</h4>
          ${(o.items || []).map(it => `<div class="odetail-line"><span>${esc(it.name)} × ${esc(it.qty)}</span><b>${money(it.price * it.qty)}</b></div>`).join('')}
          <div class="odetail-sums">
            <div><span>Subtotal</span><b>${money(o.totals.subtotal)}</b></div>
            ${o.totals.saving ? `<div><span>You save</span><b>−${money(o.totals.saving)}</b></div>` : ''}
            ${o.totals.couponCode ? `<div><span>Coupon (${esc(o.totals.couponCode)})</span><b>−${money(o.totals.couponAmt || 0)}</b></div>` : ''}
            <div class="total"><span>Total</span><b>${money(o.totals.total)}</b></div>
          </div>
        </div>
        <div class="odetail-right">
          <h4>Ship to</h4>
          <p class="panel-sub">${esc(o.customer.name)}<br>${esc(o.customer.phone)}<br>${esc(o.customer.email || '')}</p>
          <p class="panel-sub">${esc(o.customer.address)}, ${esc(o.customer.area)}<br>${esc(o.customer.city)} — ${esc(o.customer.pincode)}</p>
          <h4 style="margin-top:14px">Payment</h4>
          <p class="panel-sub">${esc(o.payment === 'COD' ? 'Cash on delivery' : 'UPI')} · ${fmtDate(o.placedAt)}</p>
        </div>
      </div></td>
    </tr>`;

  const toggleOrderDetail = id => {
    const panel = $('#staffPanel');
    if (!panel) return;
    const btn = $$('[data-code-detail]', panel).find(button => button.getAttribute('data-code-detail') === String(id));
    const open = btn && (btn.textContent || '').includes('▴');
    panel.innerHTML = staffOrders(open ? '' : id);
    wireAdmin();
  };

  let admOrderFilter = 'all';
  const staffOrders = (expandId = '') => {
    const q = (admQ || '').toLowerCase();
    let list = [...orders];
    if (admOrderFilter !== 'all') list = list.filter(o => o.status === admOrderFilter);
    if (q) list = list.filter(o => (o.code + ' ' + (o.customer.name || '') + ' ' + (o.customer.phone || '')).toLowerCase().includes(q));
    return `
      ${adminPageHead('Orders', 'Review purchases and update fulfillment status.')}
      <div class="tbl-tools">
        <div class="at-search mini">${I2.search}<input id="admOrderQ" type="text" placeholder="Search code, name, phone…" value="${esc(q)}"></div>
        <select class="filter-select" id="admOrderF"><option value="all">All statuses</option>${STATUSES.map(s => `<option value="${s.key}" ${admOrderFilter === s.key ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
        <span class="panel-sub">${list.length} of ${orders.length} orders</span>
      </div>
      ${list.length ? `<div class="table-wrap"><table class="data-table">
        <thead><tr><th>Code</th><th>Customer</th><th style="text-align:right">Total</th><th>Payment</th><th>Status</th><th>When</th></tr></thead>
        <tbody>${list.map(o => orderRow(o, expandId)).join('')}</tbody>
      </table></div>` : `<div class="empty-state"><div class="e-emoji">${I.box}</div><h3>No orders yet</h3><p>Orders from the storefront appear here instantly.</p></div>`}`;
  };

  const panelOrders = (expandId = '') => staffOrders(expandId);

  const staffStock = () => {
    const q = (admQ || '').toLowerCase();
    let prods = mergedProducts();
    if (q) prods = prods.filter(p => (p.shortName + ' ' + p.name + ' ' + catLabel(p).name).toLowerCase().includes(q));
    return `
      ${adminPageHead('Products', 'Manage catalog details, pricing, availability, and featured placement.')}
      <div class="tbl-tools">
        <div class="at-search mini">${I2.search}<input id="admPq" type="text" placeholder="Search products…" value="${esc(q)}"></div>
        <button class="btn btn-primary sm" data-qa="add-product">${I2.plus} Add Product</button>
        <span class="panel-sub">${prods.length} products</span>
      </div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Item</th><th>Category</th><th style="text-align:right">Price ₹</th><th style="text-align:center">Stock</th><th style="text-align:center">Override</th><th style="text-align:center">Featured</th><th></th></tr></thead>
        <tbody>${prods.map(p => `<tr>
          <td class="row-name" style="max-width:250px"><span class="p-cell"><span class="p-th">${thumb(p)}</span><span><a href="${prodUrl(p)}" style="${p.disabled ? 'text-decoration:line-through;opacity:.55' : ''}">${esc(p.shortName)}</a>${p.disabled ? ' <b class="tag out">Off</b>' : ''}<small>${esc(p.sku || '')}</small></span></span></td>
          <td>${esc(catLabel(p).name)}</td>
          <td style="text-align:right"><div class="pd-cell"><span class="p-display">${money(priceOf(p))}</span><input class="price-input" type="number" min="0" step="1" data-price="${p.id}" value="${priceOf(p)}" aria-label="Price for ${esc(p.shortName)}"></div></td>
          <td style="text-align:center"><span class="tag ${inStockOf(p) ? 'in' : 'out'}">${stockOf(p) > 0 ? stockOf(p) + ' units' : 'Out'}</span></td>
          <td style="text-align:center"><select class="filter-select" style="padding:6px 30px 6px 10px;font-size:12.5px" data-stock="${p.id}" aria-label="Stock for ${esc(p.shortName)}">
            ${![0, 3, 10, 999].includes(stockOf(p)) ? `<option value="${Number(stockOf(p))}" selected>Current (${Number(stockOf(p))})</option>` : ''}
            <option value="0" ${stockOf(p) === 0 ? 'selected' : ''}>Out of stock</option>
            <option value="3" ${stockOf(p) === 3 ? 'selected' : ''}>Low (3)</option>
            <option value="10" ${stockOf(p) === 10 ? 'selected' : ''}>In stock (10)</option>
            <option value="999" ${stockOf(p) === 999 ? 'selected' : ''}>Abundant (999)</option>
          </select></td>
          <td style="text-align:center"><input type="checkbox" class="feat-box" data-feat="${p.id}" ${featuredOf(p) ? 'checked' : ''} aria-label="Toggle featured for ${esc(p.shortName)}"></td>
          <td style="text-align:center;white-space:nowrap"><button type="button" class="icon-btn" data-edit-prod="${p.id}" title="Edit product" aria-label="Edit ${esc(p.shortName)}">${I2.edit}</button>${p.isExtra ? `<button type="button" class="icon-btn" data-del-prod="${p.id}" title="Delete" aria-label="Delete ${esc(p.shortName)}">${I2.trash}</button>` : ''}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;
  };

  const panelProducts = () => staffStock();

  let analyticsReport = null;
  let analyticsDays = 28;
  let analyticsCustom = null;
  const analyticsRangeDates = () => {
    if (analyticsCustom && analyticsCustom.start && analyticsCustom.end) return analyticsCustom;
    const end = new Date(); end.setHours(0, 0, 0, 0);
    const start = new Date(end); start.setDate(start.getDate() - analyticsDays + 1);
    const dateOnly = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { start: dateOnly(start), end: dateOnly(end) };
  };
  const analyticsReportFetch = () => {
    if (PREVIEW) return Promise.reject(new Error('Analytics are unavailable in this local preview.'));
    const r = analyticsRangeDates();
    return fetch(`${ANALYTICS_API}?a=report&start=${r.start}&end=${r.end}&key=${encodeURIComponent(CM_SYNC_KEY)}`, { cache: 'no-store' })
      .then(x => { if (!x.ok) throw new Error('Analytics unavailable'); return x.json(); }).then(j => { if (!j || j.ok !== true) throw new Error('Analytics unavailable'); analyticsReport = j; return j; });
  };
  const panelAnalytics = () => {
    const m = analyticsReport && analyticsReport.metrics;
    const f = analyticsReport && analyticsReport.funnel;
    const metric = (label, value, sub = '') => `<div class="an-kpi"><span>${label}</span><b>${value}</b><small>${sub}</small></div>`;
    const pct = (a, b) => b ? Math.round((a / b) * 100) + '%' : '—';
    const rows = obj => Object.entries(obj || {}).slice(0, 8).map(([k, v]) => `<div class="an-row"><span>${esc(k)}</span><b>${Number(v).toLocaleString('en-IN')}</b></div>`).join('') || '<p class="panel-sub">No observed data yet.</p>';
    const daily = Object.entries((analyticsReport && analyticsReport.daily) || {}).map(([d, v]) => ({ l: d.slice(5), v }));
    return `<div class="an-shell" data-analytics-shell>
      <div class="an-hero"><div><span class="an-eyebrow">STORE ANALYTICS</span><h1>Analytics overview</h1><p>Traffic, orders and sales for the selected period.</p></div><div class="an-range"><button class="${analyticsCustom ? '' : analyticsDays === 7 ? 'on' : ''}" data-an-range="7">7D</button><button class="${analyticsCustom ? '' : analyticsDays === 14 ? 'on' : ''}" data-an-range="14">14D</button><button class="${analyticsCustom ? '' : analyticsDays === 28 ? 'on' : ''}" data-an-range="28">28D</button><button class="${analyticsCustom ? '' : analyticsDays === 90 ? 'on' : ''}" data-an-range="90">90D</button><label class="an-custom">Custom <input type="date" data-an-custom-start><input type="date" data-an-custom-end></label><button data-an-refresh>Refresh</button><button data-an-csv>Export CSV</button></div></div>
      ${m ? `<div class="an-kpis">${metric('Live visitors', m.live_visitors, 'last 15 minutes')}${metric('Page views', m.page_views, 'observed')}${metric('Sessions', m.sessions, 'unique anonymous sessions')}${metric('Orders', m.orders, 'persisted orders')}${metric('Revenue', money(m.revenue), 'from order store')}${metric('Average order', money(m.average_order_value), 'persisted orders')}${metric('Conversion', m.conversion_rate + '%', 'orders / observed sessions')}${metric('Events', m.events, 'first-party events')}</div>      <div class="an-grid"><section class="an-card an-card--wide"><div class="an-card-head"><div><h2>Traffic over time</h2><p>Daily event volume for the selected range.</p></div><span>${esc(analyticsReport.range.start)} → ${esc(analyticsReport.range.end)}</span></div>${daily.length ? `<div class="an-chart" aria-label="Traffic over time">${daily.map(d => `<i style="--h:${Math.max(3, Math.round((d.v / Math.max(...daily.map(x => x.v), 1)) * 100))}%" title="${esc(d.l)}: ${d.v}"></i>`).join('')}</div>` : '<div class="an-empty">Traffic will appear after consented visitors interact with the site.</div>'}</section>
        <section class="an-card"><h2>Customer journey</h2><p>Observed event funnel</p><div class="an-funnel"><div><b>${f.view_item}</b><span>Product views</span></div><div><b>${f.add_to_cart}</b><span>Add to cart · ${pct(f.add_to_cart, f.view_item)}</span></div><div><b>${f.begin_checkout}</b><span>Checkout · ${pct(f.begin_checkout, f.add_to_cart)}</span></div><div><b>${f.purchase}</b><span>Purchase · ${pct(f.purchase, f.begin_checkout)}</span></div></div></section>
        <section class="an-card"><h2>Devices</h2><p>Observed event distribution</p>${rows(analyticsReport.devices)}</section>
        <section class="an-card"><h2>Acquisition</h2><p>UTM sources when present</p>${rows(analyticsReport.sources)}</section>
        <section class="an-card"><h2>Geography</h2><p>Real order cities · Hyderabad visibility</p>${rows(analyticsReport.order_cities)}</section>
        <section class="an-card"><h2>Popular products</h2><p>Viewed/added product IDs</p>${rows(analyticsReport.top_products)}</section>
        <section class="an-card"><h2>Search terms</h2><p>Consent-based search events</p>${rows(analyticsReport.search_terms)}</section>
      </div>` : '<div class="an-empty an-card">Loading analytics…</div>'}
    </div>`;
  };

  const panelCategories = () => `${adminPageHead('Categories', 'Browse products by the groups used in your storefront.')}
    <div class="cat-grid">${CATS.map(c => {
      const n = allProducts().filter(p => p.cats && p.cats.includes(c.id)).length;
      return `<div class="glass cat-card"><span class="cc-ic">${catIcon(c)}</span><h3>${esc(c.name)}</h3><p class="panel-sub">${n} products</p><a class="link-btn" href="${publicRoute('#/products?cat=' + encodeURIComponent(c.id))}">Browse ${I.arrow}</a></div>`;
    }).join('')}</div>`;

  const panelAddProduct = () => {
    const catsOpt = CATS.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    return `<div class="glass add-wrap">
      <div class="ad-head workspace-head"><div><h1>Add Product</h1><p class="panel-sub">The listing appears in the shop grid, product search and price list instantly.</p></div></div>
      <div class="add-form">
        <label>Product name * <input id="apName" type="text" placeholder="e.g. 1000 Shot Rainbow Cake"></label>
        <label>Category * <select id="apCat">${catsOpt}</select></label>
        <div class="add-g2">
          <label>Brand <input id="apBrand" type="text" placeholder="e.g. CrackersMela"></label>
          <label>Display order <input id="apOrder" type="number" min="0" step="1" placeholder="e.g. 10"></label>
        </div>
        <div class="add-g2">
          <label>Online price (₹) * <input id="apOnline" type="number" min="0" step="1" placeholder="499"></label>
          <label>MRP / Offline price (₹) <input id="apCmp" type="number" min="0" step="1" placeholder="599"></label>
        </div>
        <div class="add-g2">
          <label>Discount price (₹) <input id="apDisc" type="number" min="0" step="1" placeholder="0 if none"></label>
          <label>Stock <input id="apStock" type="number" min="0" max="999" step="1" value="10"></label>
        </div>
        <div class="add-g2">
          <label class="feat-line"><input id="apFeat" type="checkbox"> Featured on home</label>
          <label class="feat-line"><input id="apOos" type="checkbox"> Mark as out of stock</label>
        </div>
        ${imageWidget('ap', null)}
        <label>Description <textarea id="apDesc" rows="3" placeholder="Full product description"></textarea></label>
        <div class="add-g2">
          <label>SEO title <input id="apSeoTitle" type="text" placeholder="SEO-friendly title"></label>
          <label>SEO slug <input id="apSeoSlug" type="text" placeholder="product-slug"></label>
        </div>
        <label>SEO description <textarea id="apSeoDesc" rows="2" placeholder="Short SEO meta description"></textarea></label>
        <div class="add-g2">
          <label>SKU <input id="apSku" type="text" placeholder="CM-9000"></label>
          <label>Rating <input id="apRate" type="number" min="0" max="5" step="0.1" value="4.5"></label>
        </div>
        <label>Short note <input id="apNote" type="text" placeholder="A one-line selling point"></label>
        <div class="add-actions"><button class="btn btn-primary" data-save-product>${I2.plus} Save product</button><button class="btn btn-ghost" data-goto="products">Cancel</button></div>
      </div>
    </div>`;
  };

  /* Shared image upload widget. `pid` prefix scopes the input/preview ids. */
  const imageWidget = (prefix, currentImage) => `
    <div class="img-widget" id="${prefix}ImgWrap">
      <div class="img-preview" id="${prefix}Prev">
        ${safeImageSrc(currentImage) ? `<img src="${esc(safeImageSrc(currentImage))}" alt="">` : '<div class="img-ph">' + I2.image + '<span>No image</span></div>'}
      </div>
      <div class="img-controls">
        <label class="btn btn-ghost sm img-file"><span id="${prefix}fileLbl">${I2.upload} ${currentImage ? 'Upload / Replace image' : 'Upload from device'}</span><input id="${prefix}File" type="file" accept="image/jpeg,image/png,image/webp" hidden></label>
        <div class="img-hint">Background is removed automatically. JPG / PNG / WebP, max 5 MB.</div>
        <div class="img-url-line"><span>or paste image URL</span><input id="${prefix}Url" type="text" placeholder="https://…/image.jpg" value="${currentImage ? esc(currentImage) : ''}"></div>
        <div class="img-load" id="${prefix}Load" hidden><span class="spinner"></span>Processing image…</div>
        <div class="img-err" id="${prefix}Err" hidden></div>
      </div>
    </div>`;

  /* Append image-widget behavior: upload from device w/ background removal + preview,
     or set a URL. Keeps "existing image URL option" working. Final image read via imgGet(prefix). */
  const imgGetters = {};
  const wireImageWidget = prefix => {
    const fileInput = $('#' + prefix + 'File');
    const urlInput = $('#' + prefix + 'Url');
    const preview = $('#' + prefix + 'Prev');
    const loadEl = $('#' + prefix + 'Load');
    const errEl = $('#' + prefix + 'Err');
    const fileLbl = $('#' + prefix + 'fileLbl');
    let selectedUrl = safeImageSrc(urlInput ? urlInput.value : '') || null;
    const setMsg = (which, show, text) => { if (which) { which.hidden = !show; if (text !== undefined) which.textContent = text; } };
    const setPreview = (src, isDefault) => {
      if (!preview) return;
      const safeSrc = safeImageSrc(src);
      if (safeSrc) preview.innerHTML = `<img src="${esc(safeSrc)}" alt="Image preview">`;
      else preview.innerHTML = '<div class="img-ph">' + I2.image + '<span>No image</span></div>';
      if (fileLbl) fileLbl.innerHTML = `${I2.upload} ${isDefault ? 'Upload image' : 'Replace image'}`;
    };
    if (fileInput) fileInput.onchange = () => {
      const f = fileInput.files && fileInput.files[0];
      setMsg(loadEl, true); setMsg(errEl, false);
      const run = promise => promise.then(j => {
        setMsg(loadEl, false);
        const safeSrc = safeImageSrc(j.url);
        if (!safeSrc) throw new Error('The image could not be loaded. Try a different file.');
        selectedUrl = safeSrc;
        if (urlInput) { urlInput.value = safeSrc; urlInput.setCustomValidity(''); }
        setPreview(safeSrc, false);
        toast(j.bgRemoved ? 'Image uploaded · background removed' : 'Image uploaded', 'ok');
      }).catch(e => {
        setMsg(loadEl, false);
        setMsg(errEl, true, e.message || 'Image upload failed');
        toast(e.message || 'Image upload failed', 'err');
        fileInput.value = '';
      });
      if (fileInput.dataset.bg !== '0') run(uploadWithBackgroundRemoval(f));
      else run(uploadFile(f));
    };
    if (urlInput) urlInput.oninput = () => {
      selectedUrl = null;
      const value = urlInput.value.trim();
      const invalid = !!value && !safeImageSrc(value);
      const message = invalid ? 'Use an HTTPS image URL or a local image path.' : '';
      urlInput.setCustomValidity(message);
      setMsg(errEl, invalid, message);
      setPreview(value, !value);
    };
    imgGetters[prefix] = () => {
      if (selectedUrl != null && selectedUrl) return selectedUrl;
      const v = urlInput ? urlInput.value.trim() : '';
      return safeImageSrc(v);
    };
  };
  const imgGet = prefix => imgGetters[prefix] ? imgGetters[prefix]() : '';
  const validateImageInput = prefix => {
    const input = $('#' + prefix + 'Url');
    if (!input) return true;
    const value = input.value.trim();
    input.setCustomValidity(value && !safeImageSrc(value) ? 'Use an HTTPS image URL or a local image path.' : '');
    if (input.checkValidity()) return true;
    input.reportValidity();
    input.focus();
    return false;
  };
  const parseProductNumber = (value, optional = false) => {
    const raw = String(value ?? '').trim();
    if (!raw) return optional ? 0 : null;
    const number = Number(raw);
    return Number.isFinite(number) && number >= 0 ? number : null;
  };

  const PRODUCT_FIELDS = ['name', 'shortName', 'brand', 'desc', 'note', 'seoTitle', 'seoDesc', 'seoSlug', 'cats', 'primary', 'price', 'onlinePrice', 'compareAt', 'mrp', 'discountPrice', 'stock', 'featured', 'inStock', 'image', 'order', 'displayOrder', 'sku', 'rating'];

  /* Edit modal — builds draft overrides for one product (base + existing edits + form). */
  const prodEditModal = p => {
    const over = productOverrides[p.id] || {};
    const base0 = mergeProduct(p, over);
    const base = { ...base0 };
    if (priceOverrides[p.id] != null) base.price = Number(priceOverrides[p.id]);
    if (stockOverrides[p.id] != null) base.stock = Number(stockOverrides[p.id]);
    if (featOn[p.id] != null) base.featured = !!featOn[p.id];
    const catsOpt = CATS.map(c => `<option value="${c.id}" ${(base.cats || []).includes(c.id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    const primary = base.primary || (base.cats && base.cats[0]) || '';
    const ordVal = base.order != null || base.displayOrder != null ? (base.order != null ? base.order : base.displayOrder) : '';
    return `<div class="modal open" role="dialog" aria-modal="true" data-edit-modal>
      <div class="modal__scrim" data-close-edit></div>
      <div class="modal__card edit-card ep-shell">
        <header class="ep-head">
          <span class="ep-head__ico">${I2.edit}</span>
          <div class="ep-head__txt"><h2>Edit product</h2><p>${esc(p.sku || 'No SKU')} · ID ${p.id}</p></div>
          <button class="modal__close" data-close-edit aria-label="Close">${I.close}</button>
        </header>
        <div class="ep-body">

          <section class="ep-card">
            <div class="ep-card__head"><span class="ep-card__ico">${I2.box}</span><div><h3>Product Identity</h3><p>The details customers see on the listing and product page.</p></div></div>
            <div class="ep-grid">
              <label class="ep-field ep-span2" data-field="epName">
                <span class="ep-label">Product name <b>*</b></span>
                <input id="epName" type="text" value="${esc(base.name || '')}" placeholder="e.g. 1000 Shot Rainbow Cake">
                <small class="ep-hint">Full listing title — a short card name is generated automatically.</small>
                <small class="ep-err">Enter a product name (at least 2 characters).</small>
              </label>
              <label class="ep-field" data-field="epBrand">
                <span class="ep-label">Brand</span>
                <input id="epBrand" type="text" value="${esc(base.brand || '')}" placeholder="e.g. CrackersMela">
              </label>
              <label class="ep-field" data-field="epSku">
                <span class="ep-label">SKU</span>
                <input id="epSku" type="text" value="${esc(base.sku || '')}" placeholder="CM-9000">
              </label>
              <label class="ep-field ep-span2" data-field="epDesc">
                <span class="ep-label">Description</span>
                <textarea id="epDesc" rows="4" placeholder="Full product description…">${esc(base.desc || '')}</textarea>
              </label>
              <label class="ep-field ep-span2" data-field="epNote">
                <span class="ep-label">Short note</span>
                <input id="epNote" type="text" value="${esc(base.note || '')}" placeholder="A one-line selling point">
                <small class="ep-hint">Shown under the title on the product page.</small>
              </label>
              <label class="ep-field" data-field="epRate">
                <span class="ep-label">Rating</span>
                <input id="epRate" type="number" min="0" max="5" step="0.1" value="${base.rating != null ? base.rating : 4.5}">
              </label>
            </div>
          </section>

          <section class="ep-card ep-card--media">
            <div class="ep-card__head"><span class="ep-card__ico">${I2.image}</span><div><h3>Product Media</h3><p>Current product image. Upload a new one or paste a URL — the full image is always shown, never cropped.</p></div></div>
            ${imageWidget('ep', base.image)}
          </section>

          <section class="ep-card">
            <div class="ep-card__head"><span class="ep-card__ico">${I2.cashI}</span><div><h3>Pricing</h3><p>MRP is shown struck-through; discount price is optional and overrides the online price when set.</p></div></div>
            <div class="ep-grid">
              <label class="ep-field" data-field="epOnline">
                <span class="ep-label">Online price (₹) <b>*</b></span>
                <input id="epOnline" type="number" min="0" step="1" value="${base.price != null ? base.price : ''}" placeholder="499">
                <small class="ep-err">Enter a valid online price.</small>
              </label>
              <label class="ep-field" data-field="epCmp">
                <span class="ep-label">MRP / Compare at (₹)</span>
                <input id="epCmp" type="number" min="0" step="1" value="${base.compareAt != null ? base.compareAt : ''}" placeholder="599">
              </label>
              <label class="ep-field" data-field="epDisc">
                <span class="ep-label">Discount price (₹)</span>
                <input id="epDisc" type="number" min="0" step="1" value="${base.discountPrice != null ? base.discountPrice : ''}" placeholder="0 if none">
                <small class="ep-hint">Leave 0 or empty for no discount.</small>
              </label>
            </div>
          </section>

          <section class="ep-card">
            <div class="ep-card__head"><span class="ep-card__ico">${I2.tag}</span><div><h3>Categories &amp; SEO</h3><p>Where the product appears and how search engines read it.</p></div></div>
            <div class="ep-grid">
              <label class="ep-field ep-span2" data-field="epCat">
                <span class="ep-label">Categories <b>*</b></span>
                <select id="epCat" multiple size="5">${catsOpt}</select>
                <small class="ep-hint">Hold Ctrl / Cmd to select multiple categories.</small>
                <small class="ep-err">Select at least one category.</small>
              </label>
              <label class="ep-field ep-span2" data-field="epPrim">
                <span class="ep-label">Primary category</span>
                <select id="epPrim">${CATS.map(c => `<option value="${c.id}" ${c.id === primary ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
                <small class="ep-hint">Used for filtering and the product's main badge.</small>
              </label>
              <label class="ep-field ep-span2" data-field="epSeoTitle">
                <span class="ep-label">SEO title</span>
                <input id="epSeoTitle" type="text" value="${esc(base.seoTitle || base.name || '')}">
              </label>
              <label class="ep-field ep-span2" data-field="epSeoDesc">
                <span class="ep-label">SEO description</span>
                <textarea id="epSeoDesc" rows="2">${esc(base.seoDesc || '')}</textarea>
              </label>
              <label class="ep-field ep-span2" data-field="epSeoKeywords">
                <span class="ep-label">SEO keywords</span>
                <input id="epSeoKeywords" type="text" value="${esc(base.seoKeywords || '')}" placeholder="comma, separated, keywords">
              </label>
              <label class="ep-field" data-field="epSeoSlug">
                <span class="ep-label">SEO slug</span>
                <input id="epSeoSlug" type="text" value="${esc(base.slug || '')}" placeholder="product-slug">
                <small class="ep-hint">Displayed for SEO; the product URL stays stable.</small>
              </label>
              <label class="ep-field" data-field="epSeoTags">
                <span class="ep-label">SEO tags</span>
                <input id="epSeoTags" type="text" value="${esc(base.seoTags || '')}" placeholder="diwali, kids, outdoor">
              </label>
            </div>
          </section>

          <section class="ep-card">
            <div class="ep-card__head"><span class="ep-card__ico">${I2.sliders}</span><div><h3>Availability</h3><p>Stock levels, home-page placement and listing order.</p></div></div>
            <div class="ep-grid">
              <label class="ep-field" data-field="epStock">
                <span class="ep-label">Stock</span>
                <input id="epStock" type="number" min="0" max="999" step="1" value="${base.stock != null ? base.stock : 0}">
                <small class="ep-err">Enter a whole stock quantity from 0 to 999.</small>
              </label>
              <label class="ep-field" data-field="epOrder">
                <span class="ep-label">Display order</span>
                <input id="epOrder" type="number" min="0" step="1" value="${ordVal}" placeholder="e.g. 10">
                <small class="ep-hint">Lower numbers appear first.</small>
              </label>
              <div class="ep-toggles ep-span2">
                <label class="ep-toggle" data-field="epFeat">
                  <input id="epFeat" type="checkbox" ${featuredOf(base) ? 'checked' : ''}>
                  <span class="ep-toggle__track"></span>
                  <span class="ep-toggle__txt"><b>Featured product</b><small>Shows in the featured row on the home page.</small></span>
                </label>
                <label class="ep-toggle" data-field="epOos">
                  <input id="epOos" type="checkbox" ${!inStockOf(base) || base.inStock === false ? 'checked' : ''}>
                  <span class="ep-toggle__track ep-toggle__track--out"></span>
                  <span class="ep-toggle__txt"><b>Out of stock</b><small>Hides add-to-cart and shows the out-of-stock badge.</small></span>
                </label>
                <label class="ep-toggle" data-field="epEnabled">
                  <input id="epEnabled" type="checkbox" ${!base.disabled ? 'checked' : ''}>
                  <span class="ep-toggle__track"></span>
                  <span class="ep-toggle__txt"><b>Product enabled</b><small>Off = hidden everywhere on crackersmela.com (catalog, search, home).</small></span>
                </label>
              </div>
            </div>
          </section>

        </div>
        <footer class="ep-actions">
          <button class="btn btn-ghost" data-close-edit>Cancel</button>
          <button class="ep-save" data-save-edit>${I.check} Update Product</button>
        </footer>
      </div>
    </div>`;
  };

  const closeEditModal = () => {
    const m = document.querySelector('[data-edit-modal]');
    if (m && m.__esc) document.removeEventListener('keydown', m.__esc);
    if (m) m.remove();
  };

  const openEditModal = id => {
    const p = mergedProducts().find(x => x.id === id);
    if (!p) return toast('Product not found', 'err');
    const host = document.getElementById('staffPanel');
    if (!host) return;
    host.insertAdjacentHTML('beforeend', prodEditModal(p));
    const m = host.querySelector('[data-edit-modal]');
    if (m) { m.__did = id; m.__prevImage = (mergeProduct(p, productOverrides[id]) || {}).image || p.image || ''; }
    wireImageWidget('ep');
    const card = host.querySelector('.edit-card');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const wireEditModal = () => {
    const m = document.querySelector('[data-edit-modal]');
    if (!m) return;
    $$('[data-close-edit]').forEach(b => b.onclick = closeEditModal);
    m.__esc = e => { if (e.key === 'Escape') { e.preventDefault(); closeEditModal(); } };
    document.addEventListener('keydown', m.__esc);
    const markError = (id, bad) => {
      const wrap = m.querySelector(`[data-field="${id}"]`);
      if (wrap) wrap.classList.toggle('ep-field--error', !!bad);
      return !!bad;
    };
    const saveBtn = m.querySelector('[data-save-edit]');
    if (saveBtn) saveBtn.onclick = () => {
      if (!validateImageInput('ep')) return;
      const did = m.__did;
      const prevImage = (m.__prevImage);
      const name = ($('#epName').value || '').trim();
      const cats = Array.from(m.querySelectorAll('#epCat option:checked')).map(o => o.value);
      const primary = $('#epPrim').value;
      const price = parseProductNumber($('#epOnline').value);
      const stock = parseProductNumber($('#epStock').value);
      const compareAt = parseProductNumber($('#epCmp').value, true);
      const discountPrice = parseProductNumber($('#epDisc').value, true);
      const oos = !!$('#epOos').checked;
      const badName = markError('epName', name.length < 2);
      const badPrice = markError('epOnline', price === null);
      const badStock = markError('epStock', stock === null || !Number.isInteger(stock) || stock > 999);
      const badCompareAt = markError('epCmp', compareAt === null);
      const badDiscountPrice = markError('epDisc', discountPrice === null);
      const badCats = markError('epCat', !cats.length);
      if (badName || badPrice || badStock || badCompareAt || badDiscountPrice || badCats) {
        const firstBad = m.querySelector('.ep-field--error');
        if (firstBad) firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return toast(badName ? 'Enter a product name' : badPrice ? 'Enter a non-negative online price' : badStock ? 'Enter a whole stock quantity from 0 to 999' : badCompareAt ? 'Enter a non-negative MRP' : badDiscountPrice ? 'Enter a non-negative discount price' : 'Select at least one category', 'err');
      }
      const slugRaw = ($('#epSeoSlug').value || '').trim();
      const activeCat = cats.includes(primary) ? primary : cats[0];
      const over = productOverrides[did] || {};
      productOverrides[did] = {
        ...over,
        name,
        disabled: !$('#epEnabled').checked,
        shortName: name.length > 34 ? name.slice(0, 33).trim() + '…' : name,
        brand: ($('#epBrand').value || '').trim(),
        desc: ($('#epDesc').value || '').trim(),
        note: ($('#epNote').value || '').trim(),
        cats,
        primary: activeCat,
        price,
        onlinePrice: price,
        compareAt,
        mrp: compareAt,
        discountPrice,
        stock,
        inStock: stock > 0 && !oos,
        featured: !!$('#epFeat').checked,
        image: imgGet('ep') || prevImage,
        order: Number($('#epOrder').value) || 0,
        displayOrder: Number($('#epOrder').value) || 0,
        sku: ($('#epSku').value || '').trim().toUpperCase(),
        rating: clamp(Number($('#epRate').value) || 4.5, 0, 5),
        seoTitle: ($('#epSeoTitle').value || name).trim(),
        seoDesc: ($('#epSeoDesc').value || '').trim(),
        seoKeywords: ($('#epSeoKeywords').value || '').trim(),
        seoTags: ($('#epSeoTags').value || '').trim(),
        seoSlug: slugRaw || undefined,
      };
      if (!productOverrides[did].seoSlug) delete productOverrides[did].seoSlug;
      priceOverrides[did] = price;
      stockOverrides[did] = stock;
      featOn[did] = !!$('#epFeat').checked;
      save();
      syncCatalogPush();
      activity.unshift({ id: Date.now() + 1, type: 'log', msg: `${productOverrides[did].sku || 'Product'} — updated by admin`, at: new Date().toISOString(), read: true });
      activity = activity.slice(0, 40); save();
      syncProductsPush();
      toast(`Saved ${name}`);
      closeEditModal();
      const panel = $('#staffPanel');
      if (panel) { panel.innerHTML = panelOf(adminPanel); wireAdmin(); }
    };
  };

  const panelPriceList = () => `
    ${adminPageHead('Price list', 'Review current catalog prices, discounts, and stock.')}
    <div class="tbl-tools">
      <div class="at-search mini">${I2.search}<input id="plSearch" type="text" placeholder="Search price list…"></div>
      <select class="filter-select" id="plCat"><option value="all">All categories</option>${CATS.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
      <button class="btn btn-ghost sm" id="plCsv">${I2.download} Export CSV</button>
      <button class="btn btn-ghost sm" id="plPrint">${I.print} Print</button>
    </div>
    <div class="table-wrap"><table class="data-table" id="plTable"><thead>
      <tr><th>SKU</th><th>Item</th><th>Category</th><th style="text-align:right">Compare</th><th style="text-align:right">Price</th><th style="text-align:right">Off</th><th style="text-align:center">Stock</th></tr></thead>
      <tbody>${priceListRows()}</tbody></table></div>`;

  let posQ = '';
  const posFiltered = () => {
    const q = (posQ || '').toLowerCase();
    let list = allProducts().filter(inStockOf);
    if (posCat !== 'all') list = list.filter(p => p.cats && p.cats.includes(posCat));
    if (q) list = list.filter(p => (p.shortName + ' ' + p.name + ' ' + (p.sku || '')).toLowerCase().includes(q));
    if (posSortK === 'price-asc') list = [...list].sort((a, b) => priceOf(a) - priceOf(b));
    else if (posSortK === 'price-desc') list = [...list].sort((a, b) => priceOf(b) - priceOf(a));
    else if (posSortK === 'name') list = [...list].sort((a, b) => a.shortName.localeCompare(b.shortName));
    else if (posSortK === 'newest') list = [...list].sort((a, b) => b.id - a.id);
    return list;
  };
  const posThumb = p => productImageMarkup(p, undefined, 'thumb');
  const posProdsHTML = () => {
    const list = posFiltered();
    if (!list.length) return `<div class="pos-catalog-empty">${I2.search}<p>No products match.</p></div>`;
    return list.slice(0, 90).map(p => {
      const cmp = (p.compareAt || 0) > priceOf(p) ? `<s>${money(p.compareAt)}</s>` : '';
      return `<button type="button" class="pos-card" data-pos-add="${p.id}" title="Add ${esc(p.shortName)}">
        <span class="pos-card__img">${posThumb(p)}</span>
        <span class="pos-card__name">${esc(p.shortName)}</span>
        <span class="pos-card__cat">${esc(catLabel(p).name)}</span>
        <span class="pos-card__price"><b>${money(priceOf(p))}</b>${cmp}</span>
        <span class="pos-card__plus">${I2.plus}</span>
      </button>`;
    }).join('');
  };
  const posSums = () => {
    const subtotal = posCart.reduce((a, l) => { const p = allProducts().find(x => x.id === l.id); return a + (p ? priceOf(p) * l.qty : 0); }, 0);
    const saving = posCart.reduce((a, l) => { const p = allProducts().find(x => x.id === l.id); return a + (p ? Math.max(0, ((p.compareAt || 0) - priceOf(p)) * l.qty) : 0); }, 0);
    const items = posCart.reduce((a, l) => a + l.qty, 0);
    return { subtotal, saving, items };
  };
  const posTotal = () => posSums().subtotal;
  const posDiscountVal = () => { const el = $('#posDiscount'); const v = Number(el && el.value) || 0; return clamp(v, 0, Math.max(0, posTotal())); };
  const posGrand = dVal => Math.max(0, posTotal() - (Number(dVal) || 0));
  const posLinesHTML = () => posCart.length ? posCart.map(l => {
    const p = allProducts().find(x => x.id === l.id);
    if (!p) return '';
    return `<div class="pos-line">
      <span class="pos-line__img">${posThumb(p)}</span>
      <span class="pos-line__info"><b>${esc(p.shortName)}</b><small>${money(priceOf(p))} × ${esc(l.qty)}</small></span>
      <span class="pos-line__qty"><button type="button" data-pos-dec="${p.id}" aria-label="Decrease quantity">&minus;</button><b>${esc(l.qty)}</b><button type="button" data-pos-inc="${p.id}" aria-label="Increase quantity">+</button></span>
      <span class="pos-line__amt">${money(priceOf(p) * l.qty)}</span>
      <button type="button" class="pos-line__del" data-pos-del="${p.id}" aria-label="Remove item">${I2.trash}</button>
    </div>`;
  }).join('') : `<div class="pos-bill-empty">${I2.cashI}<b>Bill is empty</b><span>Tap products to add them to this bill.</span></div>`;
  const panelPos = () => {
    const { subtotal, saving, items } = posSums();
    const dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const pill = (id, label) => `<button type="button" class="pos-pill ${posCat === id ? 'on' : ''}" data-pos-cat="${id}">${label}</button>`;
    const pills = pill('all', 'All') + CATS.map(c => pill(c.id, esc(c.name))).join('');
    return `<div class="pos-root" data-postheme="${posPrefs.theme === 'light' ? 'light' : 'dark'}" data-mview="catalog">
      <header class="pos-top">
        <button type="button" class="pos-btn pos-btn--ghost pos-back" data-goto="dashboard">${I2.exit}<span>Back</span></button>
        <div class="pos-brand"><b>Billing Counter</b><span>Hyderabad &amp; Secunderabad · ${dateStr}</span></div>
        <div class="pos-search">${I2.search}<input id="posQ" type="text" placeholder="Search products…" value="${esc(posQ)}" autocomplete="off"></div>
        <div class="pos-top__actions">
          <button type="button" class="pos-btn pos-btn--ghost" id="posHold" title="Hold this bill">${I2.download}<span>Hold</span></button>
          <button type="button" class="pos-btn pos-btn--ghost pos-held" id="posHeld" title="Held bills"><span>Held</span><b class="pos-held-n" id="posHeldCount">${heldBills.length || ''}</b></button>
          <button type="button" class="pos-btn pos-btn--primary" id="posNew">${I2.plus}<span>New Bill</span></button>
          <button type="button" class="pos-btn pos-btn--ghost pos-ico-btn" id="posTheme" title="Toggle POS theme">${posPrefs.theme === 'light' ? I2.moon : I2.sun}</button>
        </div>
        <div class="pos-top__totals"><span id="posTopCount">${items}${items === 1 ? ' item' : ' items'}</span><b id="posTopTotal">${money(subtotal)}</b></div>
        <div class="pos-heldpop" id="posHeldPop" hidden></div>
      </header>
      <div class="pos-split">
        <section class="pos-catalog" data-pane="catalog">
          <div class="pos-cat__head">
            <h2>Products <span class="pos-count" id="posCount"></span></h2>
            <select id="posSort" class="pos-sort" aria-label="Sort products">
              <option value="default" ${posSortK === 'default' ? 'selected' : ''}>Sort: Default</option>
              <option value="price-asc" ${posSortK === 'price-asc' ? 'selected' : ''}>Price: Low → High</option>
              <option value="price-desc" ${posSortK === 'price-desc' ? 'selected' : ''}>Price: High → Low</option>
              <option value="name" ${posSortK === 'name' ? 'selected' : ''}>Name A–Z</option>
              <option value="newest" ${posSortK === 'newest' ? 'selected' : ''}>Newest</option>
            </select>
          </div>
          <div class="pos-pills" id="posPills">${pills}</div>
          <div class="pos-prods" id="posProds">${posProdsHTML()}</div>
        </section>
        <aside class="pos-billpanel" data-pane="bill">
          <div class="pos-bill__head"><h3>${I2.cashI} Current Bill</h3><span class="pos-bill__n" id="posBillCount">${items ? items + (items === 1 ? ' item' : ' items') : ''}</span></div>
          <div class="pos-cust">
            <label><span>Name</span><input id="posName" type="text" placeholder="Walk-in customer" autocomplete="off"></label>
            <label><span>Phone</span><input id="posPhone" type="text" placeholder="98765 43210" inputmode="numeric" maxlength="10" autocomplete="off"></label>
          </div>
          <div class="pos-lines" id="posLines">${posLinesHTML()}</div>
          <div class="pos-sums">
            <div class="pos-sumrow"><span>Subtotal</span><b id="posSubtotal">${money(subtotal)}</b></div>
            <div class="pos-sumrow pos-sumrow--save" id="posSavingRow" ${saving ? '' : 'hidden'}><span>MRP savings</span><b>− ${money(saving)}</b></div>
            <div class="pos-sumrow pos-sumrow--disc"><span>Discount ₹</span><input id="posDiscount" type="number" min="0" step="1" placeholder="0" inputmode="numeric"></div>
            <div class="pos-grand"><span>Grand Total</span><b id="posTotal">${money(subtotal)}</b></div>
          </div>
          <div class="pos-pay">
            <button type="button" class="pos-paybtn ${posPayMode === 'COD' ? 'on' : ''}" data-pos-pay="COD">${I.cash} Cash</button>
            <button type="button" class="pos-paybtn ${posPayMode === 'UPI' ? 'on' : ''}" data-pos-pay="UPI">UPI</button>
            <button type="button" class="pos-paybtn ${posPayMode === 'CARD' ? 'on' : ''}" data-pos-pay="CARD">Card</button>
          </div>
          <div class="pos-place">
            <button type="button" class="pos-btn pos-btn--primary pos-btn--lg" id="posPlace">${I.check} Generate Bill</button>
            <button type="button" class="pos-btn pos-btn--ghost pos-btn--lg pos-wa" id="posWa" title="Send bill on WhatsApp">${I.wa}</button>
          </div>
        </aside>
      </div>
      <div class="pos-mtabs" role="tablist">
        <button type="button" class="pos-mtab on" data-mtab="catalog">Products</button>
        <button type="button" class="pos-mtab" data-mtab="bill">Bill<b class="pos-mtab__n" id="posMtabCount">${items || ''}</b></button>
      </div>
    </div>`;
  };

  const panelCanvas = () => `
    ${adminPageHead('Canvas editor', 'Adjust a product image and export a storefront-ready preview.')}
    <div class="glass cv-wrap">
      <div class="cv-tools">
        <label>Product <select id="cvProd">${allProducts().map(p => `<option value="${p.id}">${esc(p.shortName)}</option>`).join('')}</select></label>
        <label>Brightness <input type="range" min="0" max="200" value="100" data-cv-f="brightness"></label>
        <label>Contrast <input type="range" min="0" max="200" value="100" data-cv-f="contrast"></label>
        <label>Saturation <input type="range" min="0" max="200" value="100" data-cv-f="saturate"></label>
        <div class="add-actions"><button class="btn btn-primary sm" data-cv-redraw>${I2.refresh} Redraw preview</button><button class="btn btn-ghost sm" data-cv-dl>${I2.download} Download PNG</button></div>
      </div>
      <canvas id="cvCanvas" width="440" height="440" class="cv-canvas"></canvas>
    </div>`;

  const panelNotifications = () => {
    const items = activity.filter(a => a.type === 'order').slice(0, 24);
    if (!items.length) return `${adminPageHead('Notifications', 'Recent order activity and updates.')}
      <div class="glass g-card"><div class="empty-state"><div class="e-emoji">${I.bell}</div><h3>All caught up</h3><p>Order notifications will appear here.</p></div></div>`;
    return `${adminPageHead('Notifications', 'Recent order activity and updates.')}
      <div class="glass g-card">
      <div class="panel-row"><span class="panel-sub">Order updates</span><span class="tbl-tools"><button class="btn btn-ghost sm" data-notif-read>Mark all read</button><button class="btn btn-ghost sm" data-notif-clear>Clear</button></span></div>
      <div class="note-list">${items.map(a => `<div class="note-row ${a.read ? '' : 'unread'}"><span class="note-dot"></span><div><b>${esc(a.msg)}</b><small>${timeAgo(a.at)}</small></div></div>`).join('')}</div>
    </div>`;
  };

  const panelSettings = u => `
    ${adminPageHead('Settings', 'Profile, appearance, and storefront controls.')}
    <div class="glass g-card">
      <div class="panel-row"><h3>Profile</h3></div>
      <div class="profile-row"><span class="av-ic big">${adminGravatar(u)}</span><div><b>${esc(u.name)}</b><small>${esc(u.email)}</small><p class="panel-sub">${u.role === 'admin' ? 'Administrator' : 'Staff'} access · signed in on this device</p></div></div>
    </div>
    <div class="glass g-card">
      <h3>Appearance</h3>
      <p class="panel-sub">Switch the admin console between light and dark.</p>
      <div class="seg"><button class="seg-b ${admPrefs.theme !== 'dark' ? 'on' : ''}" data-theme-set="light">Light</button><button class="seg-b ${admPrefs.theme === 'dark' ? 'on' : ''}" data-theme-set="dark">Dark</button></div>
    </div>
    <div class="glass g-card">
      <h3>Server status</h3>
      <div class="srv-row"><span class="dot"></span><span>API service</span><b>${PREVIEW ? 'Unavailable in preview' : 'Status not checked'}</b></div>
      <div class="srv-row"><span class="dot"></span><span>Demo data storage</span><b class="srv-ok">Local</b></div>
      <div class="srv-row"><span class="dot"></span><span>Catalog</span><b class="srv-ok">${allProducts().length} products</b></div>
      <div class="srv-row"><span class="dot"></span><span>Orders</span><b class="srv-ok">${orders.length} recorded</b></div>
    </div>
    <div class="glass g-card">
      <h3>Coupons</h3>
      <p class="panel-sub">Set the valid coupon code and its discount. Store checkout only applies it when a customer explicitly enters and confirms the code.</p>
      <div class="srv-row"><span>Coupon code</span><input class="admin-field admin-field--coupon-code" id="couponCode" value="${esc(couponConfig.code)}"></div>
      <div class="srv-row"><span>Discount (₹)</span><input class="admin-field admin-field--coupon-discount" id="couponDiscount" type="number" min="0" value="${Number(couponConfig.discount) || 0}"></div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn btn-primary sm" id="saveCoupon">${I2.save || ''} Save coupon</button>
        <button class="btn btn-ghost sm" id="resetCoupon">Reset to FREE10</button>
      </div>
      <p class="panel-sub" id="couponStatus" style="margin-top:8px"></p>
    </div>
    <div class="glass g-card">
      <h3>Maintenance page</h3>
      <p class="panel-sub">Show the premium maintenance page instead of the storefront for every visitor. The flag is stored in the admin backend and synced to crackersmela.com automatically.</p>
      <div class="srv-row"><span class="dot ${remoteMaint ? '' : 'dot-off'}"></span><span>Site-wide flag (admin backend)</span><b class="${remoteMaint ? 'srv-ok' : 'srv-dim'}">${remoteMaint ? 'On' : 'Off'}</b></div>
      <p class="panel-sub">Toggling this writes the flag to the production data store — the storefront picks it up on its next sync (within seconds).</p>
      <button class="btn ${remoteMaint ? 'btn-glass' : 'btn-primary'}" data-maint-toggle>${remoteMaint ? 'Disable maintenance page' : 'Enable maintenance page'}</button>
      <button class="btn btn-ghost" data-maint-check>${I2.refresh} Check Again</button>
    </div>
    <div class="glass g-card danger-c">
      <h3>Danger zone</h3>
      <p class="panel-sub">Reset the demo workspace (this device only).</p>
      <button class="btn btn-danger" id="resetAll">Reset demo data</button>
      <button class="btn btn-ghost" data-signout>${I2.exit} Sign out</button>
    </div>`;

  const panelLogs = () => {
    const sys = [
      ...activity.filter(a => a.type === 'log').map(a => ({ at: a.at, msg: a.msg, lvl: 'info' })),
      ...orders.flatMap(o => (o.log || []).map(l => ({ at: l.at, msg: `${o.code} → ${(STATUSES.find(s => s.key === l.status) || {}).label}`, lvl: statusIndex(l.status) === STATUSES.length - 1 ? 'ok' : 'info' }))),
    ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 48);
    return `${adminPageHead('Operations log', 'A record of order and workspace activity.')}
      <div class="glass g-card">
      <div class="panel-row"><span class="panel-sub">Latest activity on this workspace</span></div>
      ${sys.length ? `<div class="log-list">${sys.map(l => `<div class="log-row"><span class="log-lvl ${l.lvl}">${l.lvl}</span><span>${esc(l.msg)}</span><small>${timeAgo(l.at)}</small></div>`).join('')}</div>` : `<div class="feed-empty">${I2.scroll} No log entries yet. Every order update is recorded here.</div>`}
    </div>`;
  };

  const panelDanger = () => `<div class="glass g-card danger-c">
      <h2>Danger zone</h2>
      <p class="panel-sub">Reset the demo workspace (this device only). This clears orders, users, overrides and added products on this browser.</p>
      <button class="btn btn-danger" id="resetAllB">Reset demo data</button>
    </div>`;

  const canvasSize = cv => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = cv.clientWidth || 420, H = cv.clientHeight || cv.height || 160;
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext('2d');
    if (ctx && ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, W, H };
  };
  const compactMoney = v => {
    if (v >= 10000000) return '₹' + (v / 10000000).toFixed(1) + 'Cr';
    if (v >= 100000) return '₹' + (v / 100000).toFixed(1) + 'L';
    if (v >= 1000) return '₹' + Math.round(v / 1000) + 'k';
    return money(v);
  };
  const lineChart = (cv, pts, opt = {}) => {
    const { ctx, W, H } = canvasSize(cv);
    if (!ctx) return;
    const shell = document.querySelector('.admin-shell');
    const isDark = shell && shell.dataset.admtheme === 'dark';
    const color = opt.color || '#1b5fc1';
    const grid = opt.grid || (isDark ? 'rgba(148,163,184,.16)' : '#e5e7eb');
    const gridTxt = opt.gridTxt || (isDark ? '#94a3b8' : '#667085');
    const pointFill = isDark ? '#172033' : '#ffffff';
    const tooltipBg = isDark ? '#172033' : '#111827';
    const pad = { l: 52, r: 16, t: 16, b: 28 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const maxV = Math.max(...pts.map(p => p.v), 1);
    const xAt = i => pad.l + (pts.length <= 1 ? iw / 2 : (i / (pts.length - 1)) * iw);
    const yAt = v => pad.t + ih - (v / maxV) * ih;
    const paint = tip => {
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = grid;
      ctx.lineWidth = 1;
      ctx.fillStyle = gridTxt;
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let r = 0; r <= 4; r++) {
        const y = pad.t + (ih / 4) * r;
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
        const value = maxV * (1 - r / 4);
        ctx.fillText(opt.formatY ? opt.formatY(value) : compactMoney(value), pad.l - 8, y);
      }
      if (pts.length > 1) {
        ctx.beginPath();
        pts.forEach((p, i) => { const x = xAt(i), y = yAt(p.v); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.8;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();
      }
      pts.forEach((p, i) => {
        if (p.l) {
          ctx.fillStyle = gridTxt;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.font = '9.5px Inter, system-ui, sans-serif';
          ctx.fillText(p.l, xAt(i), H - 9);
        }
        if (pts.length === 1 || (tip && tip.i === i)) {
          const x = xAt(i), y = yAt(p.v);
          ctx.beginPath(); ctx.arc(x, y, pts.length === 1 ? 3 : 4, 0, Math.PI * 2);
          ctx.fillStyle = pointFill; ctx.fill();
          ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
        }
      });
      if (tip && opt.tip && pts[tip.i]) {
        const t = opt.tip(tip.i);
        const tx = tip.x, ty = 12;
        ctx.strokeStyle = color; ctx.globalAlpha = .5; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(tx, pad.t); ctx.lineTo(tx, pad.t + ih); ctx.stroke(); ctx.globalAlpha = 1;
        const bw = Math.max(92, 16 + (t[0] || '').length * 6, 16 + (t[1] || '').length * 7);
        const bx = clamp(tx - bw / 2, 2, W - bw - 2);
        ctx.fillStyle = tooltipBg; ctx.strokeStyle = isDark ? '#334155' : '#d0d5dd'; ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, ty - 8, bw, 40, 5); else ctx.rect(bx, ty - 8, bw, 40);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = isDark ? '#f1f5f9' : '#ffffff';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.font = '500 11px Inter, system-ui, sans-serif'; ctx.fillText(t[0], bx + 10, ty);
        ctx.font = '600 13px Inter, system-ui, sans-serif'; ctx.fillText(t[1], bx + 10, ty + 17);
      }
    };
    paint(null);
    if (opt.tip && !reduceMotion) {
      cv._chartTip = { pts, xAt, yAt, paint };
      cv.onmousemove = e => {
        const r = cv.getBoundingClientRect ? cv.getBoundingClientRect() : null;
        const x = r ? (e.clientX - r.left) * (W / r.width) : (e.clientX || 0);
        let best = 0, bd = 1e9;
        pts.forEach((p, i) => { const d = Math.abs(xAt(i) - x); if (d < bd) { bd = d; best = i; } });
        const step = Math.max(20, iw / Math.max(1, pts.length) / 2);
        if (pts.length && bd < step) paint({ i: best, x: xAt(best) }); else paint(null);
      };
      cv.onmouseleave = () => paint(null);
    }
  };
  const donutChart = (cv, segs, centerTxt, sub) => {
    const { ctx, W, H } = canvasSize(cv);
    if (!ctx) return;
    const S = Math.min(W, H), cx = S / 2, cy = S / 2, R = S / 2 - 10;
    ctx.clearRect(0, 0, W, H);
    const total = segs.reduce((a, s) => a + s[0], 0) || 1;
    let a = -Math.PI / 2;
    for (const [v, col] of segs) {
      const ang = (v / total) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a, a + ang); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); a += ang;
    }
    ctx.beginPath(); ctx.arc(cx, cy, R * .6, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fill();
    ctx.fillStyle = '#0D47A1'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 20px Inter, system-ui, sans-serif'; ctx.fillText(centerTxt, cx, cy - 6);
    ctx.fillStyle = 'rgba(13,71,161,.6)'; ctx.font = '10px Inter, system-ui, sans-serif'; ctx.fillText(sub, cx, cy + 14);
  };
  const salesWindow = () => {
    let days = salesSince ? Math.max(2, Math.round((Date.now() - new Date(salesSince).getTime()) / 864e5)) : salesRange;
    const since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - (days - 1));
    return { days, since };
  };
  const drawSalesChart = (cv, opt = {}) => {
    if (!orders.length) return;
    const days = opt.days || salesWindow().days;
    const since = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (days - 1)); return d; })();
    const buckets = Array.from({ length: days }, () => 0);
    for (const o of orders) { const d = new Date(o.placedAt); d.setHours(0, 0, 0, 0); const i = Math.round((d - since) / 864e5); if (i >= 0 && i < days) buckets[i] += o.totals.total; }
    const step = Math.max(1, Math.ceil(days / 8));
    const pts = buckets.map((v, i) => {
      const d = new Date(since); d.setDate(d.getDate() + i);
      const l = i % step === 0 ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
      return { v, l, d };
    });
    lineChart(cv, pts, {
      color: opt.color || '#1b5fc1',
      xLabel: true,
      tip: i => [pts[i].d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), money(pts[i].v)],
      formatY: compactMoney,
    });
  };
  const updateSalesSummary = () => {
    const so = $('#soChart');
    const sum = $('#saleSum');
    if (!so && !sum) return;
    const { days, since } = salesWindow();
    let tot = 0, cnt = 0;
    for (const o of orders) { const d = new Date(o.placedAt); d.setHours(0, 0, 0, 0); const i = Math.round((d - since) / 864e5); if (i >= 0 && i < days) { tot += o.totals.total; cnt++; } }
    if (sum) sum.innerHTML = `<span class="sale-stat sale-stat--revenue"><small>Revenue</small><b>${money(tot)}</b></span><span class="sale-stat"><small>Orders</small><b>${cnt.toLocaleString('en-IN')}</b></span><span class="sale-stat"><small>Average order value</small><b>${cnt ? money(Math.round(tot / cnt)) : '—'}</b></span>`;
    const to = $('#soTo');
    if (salesSince && to) { const d = new Date(salesSince); d.setDate(d.getDate() + days - 1); to.value = d.toISOString().slice(0, 10); }
    if (so) drawSalesChart(so);
  };
  const handleSalesRange = r => {
    const calRow = document.querySelector('.cal-row');
    if (calRow) calRow.style.display = r === 'custom' ? 'flex' : 'none';
    if (r === 'custom') {
      const f = $('#soFrom');
      salesSince = f && f.value ? f.value : new Date().toISOString().slice(0, 10);
      salesRange = 14;
    } else {
      salesSince = null;
      salesRange = Number(r);
    }
    $$('.seg-b[data-range]').forEach(b => b.classList.toggle('on', b.getAttribute('data-range') === r));
    if (adminPanel === 'dashboard') updateSalesSummary();
    else { const an = $('#anChart'); if (an) drawSalesChart(an, { days: r === '90' ? 90 : 30, color: '#1b5fc1' }); }
  };

  const drawAdminCharts = () => {
    if (adminPanel === 'dashboard') updateSalesSummary();
    if (!orders.length) return;
    const so = $('#soChart');
    const dm = $('#dmChart');
    if (dm) {
      const cod = orders.filter(o => o.payment === 'COD').length, upi = orders.length - cod;
      donutChart(dm, [[upi, '#1b5fc1'], [cod, '#aeb7c2']], String(orders.length), Math.round((cod / orders.length) * 100) + '% COD');
    }
    const an = $('#anChart');
    if (an) drawSalesChart(an, { days: 30, color: '#1b5fc1' });
  };

  const animateCounters = () => {
    $$('[data-count]').forEach(el => {
      const target = Number(el.getAttribute('data-count'));
      const moneyF = el.getAttribute('data-money');
      el.textContent = moneyF ? money(target) : target.toLocaleString('en-IN');
    });
  };
  const updateBellUI = () => {
    $$('[data-bell-badge]').forEach(b => { const n = bellUnread(); b.textContent = n || ''; b.style.display = n ? '' : 'none'; });
  };

  const switchAdminPanel = p => {
    adminPanel = p;
    document.body.classList.toggle('pos-mode', p === 'pos');
    const shell = $('#adminShell');
    if (!shell) return;
    shell.querySelectorAll('.as-item[data-stab]').forEach(x => x.classList.toggle('active', x.getAttribute('data-stab') === p));
    if (p === 'pos' || (window.matchMedia && window.matchMedia('(max-width: 820px)').matches)) shell.classList.remove('side-collapsed');
    const sp = $('#staffPanel');
    if (sp) { sp.innerHTML = panelOf(p); wireAdmin(); }
  };
  const setAdmTheme = t => {
    admPrefs.theme = t; save();
    const shell = $('#adminShell');
    if (shell) shell.setAttribute('data-admtheme', t);
    updateBellUI();
    $$('[data-theme-btn]').forEach(b => { b.innerHTML = t === 'dark' ? I2.sun : I2.moon; });
    $$('[data-theme-btn2]').forEach(b => { b.innerHTML = `${I2.sun} Switch to ${t === 'dark' ? 'light' : 'dark'} mode`; });
    $$('[data-theme-set]').forEach(b => b.classList.toggle('on', b.getAttribute('data-theme-set') === t));
  };
  const saveCouponSetting = () => {
    const codeInp = $('#couponCode');
    const discInp = $('#couponDiscount');
    const status = $('#couponStatus');
    const code = (codeInp && codeInp.value || '').trim().toUpperCase();
    const disc = Math.max(0, Number(discInp && discInp.value) || 0);
    if (!code) { if (status) { status.textContent = 'Coupon code cannot be empty'; status.style.color = '#E0464B'; } return; }
    couponConfig = { code, discount: disc };
    cmSettings.coupon = { code, discount: disc };
    ls.set('cmSettings', cmSettings);
    save();
    syncProductsPush();
    if (status) { status.textContent = `Saved: ${code} = ₹${disc} off. Synced to crackersmela.com automatically.`; status.style.color = '#2E7D32'; }
    toast(`Coupon set: ${code} (₹${disc} off) — synced to storefront`);
  };
  const renderAdmSearch = q => {
    const box = $('#admSearchBox');
    if (!box) return;
    q = String(q || '').trim().toLowerCase();
    if (!q) { box.innerHTML = ''; box.classList.remove('open'); return; }
    const prods = allProducts().filter(p => (p.shortName + ' ' + p.name).toLowerCase().includes(q)).slice(0, 4);
    const ords = orders.filter(o => (o.code + ' ' + (o.customer.name || '')).toLowerCase().includes(q)).slice(0, 4);
    const uxs = Object.entries(users).filter(([e, u]) => (e + ' ' + (u.name || '')).toLowerCase().includes(q)).slice(0, 3);
    if (!prods.length && !ords.length && !uxs.length) { box.innerHTML = `<div class="gs-empty">No matches for “${esc(q)}”.</div>`; box.classList.add('open'); return; }
    box.innerHTML = `
      ${ords.length ? `<b class="gs-h">Orders</b>${ords.map(o => `<button type="button" class="gs-item" data-gs="order" data-id="${esc(o.id)}">${I2.sheet}<span>${esc(o.code)}<small>${esc(o.customer.name || '')} · ${money(o.totals.total)}</small></span></button>`).join('')}` : ''}
      ${prods.length ? `<b class="gs-h">Products</b>${prods.map(p => `<button type="button" class="gs-item" data-gs="product" data-id="${p.id}">${I2.box}<span>${esc(p.shortName)}<small>${money(priceOf(p))}</small></span></button>`).join('')}` : ''}
      ${uxs.length ? `<b class="gs-h">Users</b>${uxs.map(([e, ux]) => `<button type="button" class="gs-item" data-gs="user" data-id="${esc(e)}">${I2.user}<span>${esc(ux.name || '')}<small>${esc(e)}</small></span></button>`).join('')}` : ''}`;
    box.classList.add('open');
  };

  let analyticsRange = 30;
  let avCloseBound = false;
  let adminDismissBound = false;
  const bindAdminDismiss = () => {
    if (adminDismissBound) return;
    adminDismissBound = true;
    document.addEventListener('click', event => {
      const target = event.target;
      const search = $('#admSearchBox');
      if (search && !(target.closest && target.closest('.at-search'))) { search.innerHTML = ''; search.classList.remove('open'); }
      const popup = $('#posHeldPop');
      const button = $('#posHeld');
      if (popup && !popup.hidden && !popup.contains(target) && !(button && button.contains(target))) popup.hidden = true;
    });
  };
  const wireAdmin = () => {
    const u = currentUser();
    if (!u || !isStaffRole(u.role)) return;
    const shell = $('#adminShell');
    if (!shell) return;
    bindAdminDismiss();
    shell.setAttribute('data-admtheme', admPrefs.theme === 'dark' ? 'dark' : 'light');

    const switchP = b => switchAdminPanel(b.getAttribute('data-panel'));
    shell.querySelectorAll('[data-panel]').forEach(b => b.onclick = () => switchP(b));
    const st = shell.querySelector('[data-side-toggle]');
    if (st) st.onclick = () => shell.classList.toggle('side-collapsed');
    const sd = shell.querySelector('[data-side-dismiss]');
    if (sd) sd.onclick = () => shell.classList.remove('side-collapsed');
    const tb = shell.querySelector('[data-theme-btn]');
    if (tb) tb.onclick = () => setAdmTheme(admPrefs.theme === 'dark' ? 'light' : 'dark');
    const tb2 = shell.querySelector('[data-theme-btn2]');
    if (tb2) tb2.onclick = () => setAdmTheme(admPrefs.theme === 'dark' ? 'light' : 'dark');
    shell.querySelectorAll('[data-theme-set]').forEach(b => b.onclick = () => setAdmTheme(b.getAttribute('data-theme-set')));
    const sc = shell.querySelector('#saveCoupon');
    if (sc) sc.onclick = () => saveCouponSetting();
    const rc = shell.querySelector('#resetCoupon');
    if (rc) rc.onclick = () => { couponConfig = { code: 'FREE10', discount: 10 }; save(); toast('Coupon reset to FREE10 (₹10 off)'); switchAdminPanel('settings'); };
    shell.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => switchAdminPanel(b.getAttribute('data-goto')));
    const bl = shell.querySelector('[data-bell]');
    if (bl) bl.onclick = () => { activity.forEach(a => { if (a.type === 'order') a.read = true; }); save(); updateBellUI(); switchAdminPanel('notifications'); };
    const avb = shell.querySelector('[data-av-btn]');
    const avm = $('#avMenu');
    if (avb && avm) avb.onclick = e => { e.stopPropagation(); avm.classList.toggle('open'); };
    if (!avCloseBound) {
      avCloseBound = true;
      document.addEventListener('click', e => { const avme = document.querySelector('.at-av'); if (avme && !avme.contains(e.target)) { const m = $('#avMenu'); if (m) m.classList.remove('open'); } });
    }
    const gs = $('#admSearch');
    const gsb = $('#admSearchBox');
    if (gs && gsb) {
      gs.oninput = () => renderAdmSearch(gs.value.trim());
      gs.onkeydown = e => { if (e.key === 'Escape') { const results = $('#admSearchBox'); if (results) { results.innerHTML = ''; results.classList.remove('open'); } } };
    }

    wireDynamicPanel();
    wireStaffTables();
    animateCounters();
    updateBellUI();
    if (adminPanel === 'analytics') {
      const refreshAnalytics = () => analyticsReportFetch().then(() => { const sp = $('#staffPanel'); if (sp && adminPanel === 'analytics') { sp.innerHTML = panelOf('analytics'); wireAdmin(); } }).catch(() => {
        const sp = $('#staffPanel');
        if (sp && adminPanel === 'analytics') {
          sp.innerHTML = `<div class="an-shell"><h1>Analytics</h1><div class="an-empty an-card"><p>${PREVIEW ? 'Analytics are unavailable in this local preview because the backend source is missing.' : 'We could not load analytics. Please try again.'}</p><button class="btn btn-ghost" data-an-retry>Try again</button></div></div>`;
          sp.querySelector('[data-an-retry]').onclick = refreshAnalytics;
        }
      });
      $$('[data-an-range]').forEach(b => b.onclick = () => { analyticsDays = Number(b.getAttribute('data-an-range')) || 28; analyticsReport = null; refreshAnalytics(); });
      const rr = $('[data-an-refresh]'); if (rr) rr.onclick = refreshAnalytics;
      const acs = $('[data-an-custom-start]'), ace = $('[data-an-custom-end]');
      if (acs && ace) {
        if (analyticsCustom) { acs.value = analyticsCustom.start; ace.value = analyticsCustom.end; }
        const custom = () => { if (acs.value && ace.value) { analyticsCustom = { start: acs.value, end: ace.value }; analyticsReport = null; refreshAnalytics(); } };
        acs.onchange = custom; ace.onchange = custom;
      }
      const csv = $('[data-an-csv]'); if (csv) csv.onclick = () => {
        if (!analyticsReport) return;
        const rows = [['Metric','Value'], ...Object.entries(analyticsReport.metrics || {})];
        const blob = new Blob([rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'crackersmela-analytics.csv'; a.click(); URL.revokeObjectURL(a.href);
      };
      if (!analyticsReport) refreshAnalytics();
    }
    drawAdminCharts();
    startFeed();
  };

  let wireDynBound = false;
  const wireDynamicPanel = () => {
    const refresh = html => { const sp = $('#staffPanel'); if (sp && html !== undefined) sp.innerHTML = html; wireAdmin(); };
    const reRender = () => refresh(panelOf(adminPanel));
    const bindSearch = (id, stateSetter) => {
      const inp = $(id);
      if (inp) inp.oninput = debounce(() => {
        if (!inp.isConnected || inp !== document.activeElement) return;
        const start = inp.selectionStart, end = inp.selectionEnd;
        stateSetter(inp.value.trim());
        reRender();
        const next = $(id);
        if (next) { next.focus({ preventScroll: true }); next.setSelectionRange(start, end); }
      }, 150);
    };
    if (adminPanel === 'orders') {
      bindSearch('#admOrderQ', q => { admQ = q; });
      const f = $('#admOrderF');
      if (f) f.onchange = () => { admOrderFilter = f.value; admQ = ''; reRender(); };
    } else if (adminPanel === 'products') {
      bindSearch('#admPq', q => { admQ = q; });
      $$('[data-edit-prod]').forEach(b => b.onclick = () => {
        openEditModal(Number(b.getAttribute('data-edit-prod')));
        wireEditModal();
      });
      $$('[data-del-prod]').forEach(b => b.onclick = () => {
        const id = Number(b.getAttribute('data-del-prod'));
        extraProducts = extraProducts.filter(p => p.id !== id);
        delete productOverrides[id];
        save(); syncProductsPush(); toast('Product removed from the store'); reRender();
      });
    } else if (adminPanel === 'customers') {
      bindSearch('#admUq', q => { admQ = q; });
    } else if (adminPanel === 'price-list') {
      const ps = $('#plSearch'), pc = $('#plCat'), tb = $('#plTable');
      const upd = () => { if (tb) tb.querySelector('tbody').innerHTML = priceListRows(pc ? pc.value : 'all', ps ? ps.value.toLowerCase() : ''); };
      if (ps) ps.addEventListener('input', debounce(upd, 140));
      if (pc) pc.onchange = upd;
      const csv = $('#plCsv');
      if (csv) csv.onclick = () => {
        const rows = [['SKU', 'Item', 'Category', 'Price', 'Off%', 'Stock']].concat(allProducts().map(p => [p.sku, p.shortName, catLabel(p).name, priceOf(p), discountOf(p) + '%', inStockOf(p) ? stockOf(p) : 0]));
        const escCSV = v => '"' + String(v).replace(/"/g, '""') + '"';
        const blob = new Blob(['\ufeff' + rows.map(r => r.map(escCSV).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'crackersmela-price-list.csv'; a.click();
        toast('Price list exported');
      };
      const pr = $('#plPrint');
      if (pr) pr.onclick = () => window.print();
    } else if (adminPanel === 'add-product') {
      const saveBtn = $('[data-save-product]');
      if (saveBtn) saveBtn.onclick = () => {
        if (!validateImageInput('ap')) return;
        const name = ($('#apName').value || '').trim();
        const cat = $('#apCat').value;
        const price = parseProductNumber($('#apOnline').value);
        const stock = parseProductNumber($('#apStock').value);
        const compareAt = parseProductNumber($('#apCmp').value, true);
        const discountPrice = parseProductNumber($('#apDisc').value, true);
        if (name.length < 2) return toast('Enter a product name', 'err');
        if (price === null) return toast('Enter a non-negative online price', 'err');
        if (stock === null || !Number.isInteger(stock) || stock > 999) return toast('Enter a whole stock quantity from 0 to 999', 'err');
        if (compareAt === null) return toast('Enter a non-negative MRP', 'err');
        if (discountPrice === null) return toast('Enter a non-negative discount price', 'err');
        const id = Date.now();
        const img = imgGet('ap') || '';
        const oos = !!$('#apOos').checked;
        const p = {
          id, isExtra: true, slug: ($('#apSeoSlug').value || 'p-' + id).trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, ''),
          name, shortName: name.length > 34 ? name.slice(0, 33).trim() + '…' : name,
          brand: ($('#apBrand').value || '').trim(),
          sku: ($('#apSku').value || 'CM-' + id.toString().slice(-4)).toUpperCase(),
          price, compareAt,
          discountPrice,
          onlinePrice: price, mrp: compareAt,
          stock, inStock: stock > 0 && !oos,
          featured: !!$('#apFeat').checked,
          cats: [cat], primary: cat,
          image: img,
          order: Number($('#apOrder').value) || 0,
          desc: ($('#apDesc').value || '').trim(),
          note: ($('#apNote').value || '').trim(),
          seoTitle: ($('#apSeoTitle').value || name).trim(),
          seoDesc: ($('#apSeoDesc').value || '').trim(),
          seoSlug: ($('#apSeoSlug').value || '').trim(),
          rating: clamp(Number($('#apRate').value) || 4.5, 0, 5), reviews: 0, salesCount: 0,
        };
        extraProducts.unshift(p);
        if (p.isExtra && p.order) { /* display-order respected via merge */ }
        save();
        activity.unshift({ id: Date.now() + 1, type: 'log', msg: `${p.sku} — new product added by admin`, at: new Date().toISOString(), read: true });
        activity = activity.slice(0, 40); save();
        syncProductsPush();
        toast(`Added ${name}`);
        admQ = ''; switchAdminPanel('products');
      };
      wireImageWidget('ap');
    } else if (adminPanel === 'pos') {
      const refreshPosBill = (updateLines = true) => {
        const { subtotal, saving, items } = posSums();
        const dEl = $('#posDiscount');
        const dVal = dEl ? clamp(Number(dEl.value) || 0, 0, Math.max(0, posTotal())) : 0;
        const grand = posGrand(dVal);
        if (updateLines) { const ln = $('#posLines'); if (ln) ln.innerHTML = posLinesHTML(); }
        const setTxt = (sel, v) => { const el = $(sel); if (el) el.textContent = v; };
        setTxt('#posSubtotal', money(subtotal));
        const sr = $('#posSavingRow');
        if (sr) { sr.hidden = !saving; const b = sr.querySelector('b'); if (b) b.textContent = '− ' + money(saving); }
        setTxt('#posTotal', money(grand));
        setTxt('#posTopCount', `${items} item${items === 1 ? '' : 's'}`);
        setTxt('#posTopTotal', money(grand));
        setTxt('#posBillCount', items ? `${items} item${items === 1 ? '' : 's'}` : '');
        const mn = $('#posMtabCount'); if (mn) mn.textContent = items || '';
        const pc = $('#posCount'); if (pc) pc.textContent = posFiltered().length;
        ['#posPlace', '#posWa'].forEach(sel => { const el = $(sel); if (el) el.disabled = !posCart.length; });
        const hn = $('#posHeldCount'); if (hn) hn.textContent = heldBills.length || '';
      };
      const rerenderProds = () => {
        const pp = $('#posProds');
        if (pp) { const st = pp.scrollTop; pp.innerHTML = posProdsHTML(); pp.scrollTop = st; }
        const pc = $('#posCount'); if (pc) pc.textContent = posFiltered().length;
      };
      const clearBillInputs = () => {
        const pq2 = $('#posQ'); if (pq2) pq2.value = '';
        const nm = $('#posName'); if (nm) nm.value = '';
        const ph = $('#posPhone'); if (ph) ph.value = '';
        const din = $('#posDiscount'); if (din) din.value = '';
      };
      const pq = $('#posQ');
      if (pq) pq.oninput = () => { posQ = pq.value.trim(); rerenderProds(); };
      const prodsEl = $('#posProds');
      if (prodsEl) prodsEl.addEventListener('click', e => {
        const add = e.target.closest('[data-pos-add]');
        if (!add) return;
        const id = Number(add.getAttribute('data-pos-add'));
        const line = posCart.find(l => l.id === id);
        if (line) line.qty = Math.min(line.qty + 1, 99); else posCart.push({ id, qty: 1 });
        refreshPosBill();
      });
      $$('.pos-pill').forEach(b => b.onclick = () => {
        posCat = b.getAttribute('data-pos-cat') || 'all';
        $$('.pos-pill').forEach(x => x.classList.toggle('on', x === b));
        rerenderProds();
      });
      const psort = $('#posSort');
      if (psort) psort.onchange = () => { posSortK = psort.value; rerenderProds(); };
      const bumpLine = (id, d) => {
        const l = posCart.find(x => x.id === Number(id));
        if (!l) return;
        if (d > 0) l.qty = Math.min(l.qty + 1, 99);
        else { l.qty -= 1; if (l.qty <= 0) posCart = posCart.filter(x => x.id !== l.id); }
        refreshPosBill();
      };
      const linesEl = $('#posLines');
      if (linesEl) linesEl.addEventListener('click', e => {
        const inc = e.target.closest('[data-pos-inc]');
        const dec = e.target.closest('[data-pos-dec]');
        const del = e.target.closest('[data-pos-del]');
        if (inc) bumpLine(inc.getAttribute('data-pos-inc'), 1);
        else if (dec) bumpLine(dec.getAttribute('data-pos-dec'), -1);
        else if (del) { posCart = posCart.filter(x => x.id !== Number(del.getAttribute('data-pos-del'))); refreshPosBill(); }
      });
      refreshPosBill();
      const din = $('#posDiscount');
      if (din) din.oninput = () => refreshPosBill(false);
      $$('[data-pos-pay]').forEach(b => b.onclick = () => {
        posPayMode = b.getAttribute('data-pos-pay') || 'COD';
        $$('[data-pos-pay]').forEach(x => x.classList.toggle('on', x === b));
      });
      $$('[data-mtab]').forEach(b => b.onclick = () => {
        const r = $('.pos-root');
        if (r) r.dataset.mview = b.getAttribute('data-mtab') || 'catalog';
        $$('.pos-mtab').forEach(x => x.classList.toggle('on', x === b));
      });
      const th = $('#posTheme');
      if (th) th.onclick = () => {
        posPrefs.theme = posPrefs.theme === 'dark' ? 'light' : 'dark';
        ls.set('posPrefs', posPrefs);
        const r = $('.pos-root');
        if (r) r.dataset.postheme = posPrefs.theme;
        th.innerHTML = posPrefs.theme === 'light' ? I2.moon : I2.sun;
      };
      const hold = $('#posHold');
      if (hold) hold.onclick = () => {
        if (!posCart.length) return toast('Nothing to hold — bill is empty', 'err');
        heldBills.unshift({
          id: Date.now(), at: new Date().toISOString(),
          name: $('#posName') ? $('#posName').value.trim() : '',
          phone: $('#posPhone') ? $('#posPhone').value.trim() : '',
          items: posCart.map(l => ({ ...l })),
        });
        heldBills = heldBills.slice(0, 12);
        posCart = [];
        clearBillInputs();
        rerenderProds(); refreshPosBill();
        toast('Bill held — start a new one');
      };
      const heldBtn = $('#posHeld');
      const pop = $('#posHeldPop');
      const renderHeld = () => {
        if (!pop) return;
        if (!heldBills.length) { pop.innerHTML = '<div class="pos-heldpop__empty">No held bills.</div>'; return; }
        pop.innerHTML = heldBills.map(hb => {
          const sum = hb.items.reduce((a, l) => { const p = allProducts().find(x => x.id === l.id); return a + (p ? priceOf(p) * l.qty : 0); }, 0);
          return `<div class="pos-heldrow">
            <span class="pos-heldrow__info"><b>${esc(hb.name || 'Walk-in')}</b><small>${hb.items.reduce((a, l) => a + l.qty, 0)} items · ${money(sum)} · ${timeAgo(hb.at)}</small></span>
            <button type="button" class="pos-btn pos-btn--ghost pos-btn--sm" data-held-restore="${hb.id}">Restore</button>
            <button type="button" class="pos-heldrow__del" data-held-del="${hb.id}" aria-label="Delete held bill">${I2.trash}</button>
          </div>`;
        }).join('');
      };
      if (heldBtn && pop) {
        heldBtn.onclick = e => { e.stopPropagation(); renderHeld(); pop.hidden = !pop.hidden; };
        pop.onclick = e => {
          const rst = e.target.closest('[data-held-restore]');
          const del = e.target.closest('[data-held-del]');
          if (rst) {
            const id = rst.getAttribute('data-held-restore');
            const hb = heldBills.find(x => String(x.id) === id);
            if (hb) {
              posCart = hb.items.map(l => ({ ...l }));
              const nm = $('#posName'); if (nm) nm.value = hb.name || '';
              const ph = $('#posPhone'); if (ph) ph.value = hb.phone || '';
              heldBills = heldBills.filter(x => String(x.id) !== id);
              pop.hidden = true; refreshPosBill();
              toast('Held bill restored');
            }
          } else if (del) {
            const id = del.getAttribute('data-held-del');
            heldBills = heldBills.filter(x => String(x.id) !== id);
            renderHeld(); refreshPosBill();
          }
        };
      }
      const nb = $('#posNew');
      if (nb) nb.onclick = () => {
        if (!posCart.length) { toast('Already a fresh bill'); return; }
        posCart = [];
        clearBillInputs();
        rerenderProds(); refreshPosBill();
        toast('New bill started');
      };
      const placeBill = openWa => {
        const u = currentUser();
        const name = ($('#posName') ? $('#posName').value.trim() : '') || u.name || 'Walk-in';
        const phone = $('#posPhone') ? $('#posPhone').value.trim() : '';
        if (!/^[6-9]\d{9}$/.test(phone)) return toast('Enter a valid 10-digit mobile number', 'err');
        if (!posCart.length) return toast('Bill is empty', 'err');
        const lines = posCart.map(l => { const p = allProducts().find(x => x.id === l.id); return p ? { id: p.id, sku: p.sku || '', name: p.shortName, image: p.image || '', qty: l.qty, price: priceOf(p), compareAt: p.compareAt || 0 } : null; }).filter(Boolean);
        const subtotal = lines.reduce((a, l) => a + l.price * l.qty, 0);
        const saving = lines.reduce((a, l) => a + Math.max(0, (l.compareAt - l.price) * l.qty), 0) || 0;
        const dEl = $('#posDiscount');
        const discount = clamp(Number(dEl && dEl.value) || 0, 0, Math.max(0, subtotal));
        const grand = Math.max(0, subtotal - discount);
        const now = new Date().toISOString();
        const code = orderCode();
        const cust = { name, phone, email: u.email, address: 'Walk-in · POS counter', area: '', city: 'Counter sale', pincode: '' };
        const o = {
          id: uid(), code, placedAt: now, status: 'confirmed', email: u.email,
          log: [{ status: 'placed', at: now }, { status: 'confirmed', at: now }],
          items: lines,
          totals: { subtotal, festiveAmt: 0, festivePct: 0, saving, posDiscount: discount, delivery: 0, total: grand },
          customer: cust, shipping: {}, payment: posPayMode || 'COD',
        };
        orders.unshift(o);
        posCart = [];
        save();
        activity.unshift({ id: Date.now() + 2, type: 'order', msg: `${o.code} · ${name} · ${money(grand)} (POS)`, at: now, read: false, oid: o.id });
        activity = activity.slice(0, 40); save();
        toast(`Order ${o.code} placed · ${money(grand)}`);
        updateBellUI();
        if (openWa) {
          const waLines = lines.map(l => `• ${l.name} × ${l.qty} — ${money(l.price * l.qty)}`).join('\n');
          const payLabel = posPayMode === 'COD' ? 'Cash' : posPayMode === 'CARD' ? 'Card' : 'UPI';
          const txt = `CrackersMela bill ${code}\n${waLines}\nSubtotal: ${money(subtotal)}${discount ? `\nDiscount: - ${money(discount)}` : ''}\nGrand Total: ${money(grand)}\nPayment: ${payLabel}\nCustomer: ${name} (${phone})`;
          try { window.open('https://wa.me/' + String(STORE.whatsapp || '').replace(/\D/g, '') + '?text=' + encodeURIComponent(txt), '_blank'); } catch (e) { /* popup blocked */ }
        }
        const sp = $('#staffPanel'); if (sp) { sp.innerHTML = panelPos(); wireAdmin(); }
      };
      const place = $('#posPlace');
      if (place) place.onclick = () => placeBill(false);
      const waBtn = $('#posWa');
      if (waBtn) waBtn.onclick = () => placeBill(true);
    } else if (adminPanel === 'canvas') {
      const cv = $('#cvCanvas');
      const draw = () => {
        if (!cv) return;
        const p = allProducts().find(x => x.id === Number($('#cvProd').value));
        const ctx = cv.getContext('2d'); if (!ctx) return;
        const get = k => Number((document.querySelector('[data-cv-f="' + k + '"]') || {}).value || 100);
        const flt = `brightness(${get('brightness')}%) contrast(${get('contrast')}%) saturate(${get('saturate')}%)`;
        ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.fillStyle = '#E3F2FD'; ctx.fillRect(0, 0, cv.width, cv.height);
        const paintFallback = () => {
          ctx.filter = 'none';
          const cx = cv.width / 2, cy = cv.height / 2;
          const r = cv.width * 0.28;
          ctx.strokeStyle = '#2196F3';
          ctx.fillStyle = '#2196F3';
          ctx.lineWidth = Math.max(6, cv.width * 0.03);
          ctx.lineCap = 'round';
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(5, cv.width * 0.05), 0, Math.PI * 2);
          ctx.fill();
        };
        if (p && p.image) {
          const im = new Image();
          im.onload = () => { ctx.filter = flt; const k = Math.min(cv.width / im.width, cv.height / im.height); const w = im.width * k, h = im.height * k; ctx.drawImage(im, (cv.width - w) / 2, (cv.height - h) / 2, w, h); ctx.filter = 'none'; };
          im.onerror = paintFallback;
          im.src = p.image;
        } else paintFallback();
      };
      const redrawBtn = $('[data-cv-redraw]');
      if (redrawBtn) redrawBtn.onclick = draw;
      const prodSel = $('#cvProd');
      if (prodSel) prodSel.onchange = draw;
      const dl = $('[data-cv-dl]');
      if (dl) dl.onclick = () => {
        try {
          const a = document.createElement('a');
          a.href = cv.toDataURL('image/png');
          a.download = 'crackersmela-editor.png';
          a.click();
          toast('Preview downloaded');
        } catch { toast('Canvas export unavailable here', 'err'); }
      };
      draw();
    } else if (adminPanel === 'notifications') {
      const mr = $('[data-notif-read]');
      if (mr) mr.onclick = () => { activity.forEach(a => { if (a.type === 'order') a.read = true; }); save(); updateBellUI(); reRender(); };
      const cl = $('[data-notif-clear]');
      if (cl) cl.onclick = () => { activity = activity.filter(a => a.type !== 'order'); save(); updateBellUI(); reRender(); };
    }
    const r1 = $('#resetAll'), r2 = $('#resetAllB');
    [['#resetAll', r1], ['#resetAllB', r2]].forEach(([sel, el]) => {
      if (el) el.onclick = () => {
        ['cart', 'wish', 'orders', 'session', 'stockOverrides', 'priceOverrides', 'featOn', 'recent', 'extraProducts', 'activity'].forEach(k => localStorage.removeItem('cm2.' + k));
        location.hash = '#/'; location.reload();
      };
    });
    const rr = $('[data-reload-panel]');
    if (rr) rr.onclick = () => reRender();
    wireDynBound = true;
  };

  let feedEpoch = 0;
  const stopFeed = () => {
    clearInterval(feedTimer);
    feedTimer = null;
    feedEpoch++;
  };
  const startFeed = () => {
    if (PREVIEW || !canSyncPush()) { stopFeed(); return; }
    if (feedTimer !== null) return;
    if (!activity.some(a => a.type === 'order')) {
      orders.slice(-6).forEach(o => {
        if (!activity.some(a => a.oid === o.id)) activity.unshift({ id: Date.now() + Math.random(), type: 'order', msg: `${o.code} · ${o.customer.name} · ${money(o.totals.total)}`, at: o.placedAt, read: false, oid: o.id });
      });
      activity = activity.slice(0, 40);
      save();
    }
    const epoch = ++feedEpoch;
    let pending = false;
    feedTimer = setInterval(async () => {
      if (!canSyncPush() || !$('#staffPanel')) { stopFeed(); return; }
      if (document.hidden) return;
      if (pending) return;
      pending = true;
      const known = new Set(orders.map(order => order.id));
      try {
        await syncPull();
        if (epoch !== feedEpoch || !canSyncPush() || !$('#staffPanel')) return;
        const fresh = orders.filter(order => !known.has(order.id) && !activity.some(item => item.oid === order.id));
        if (fresh.length) {
          fresh.forEach(o => activity.unshift({ id: Date.now() + Math.random(), type: 'order', msg: `${o.code} · ${o.customer.name} · ${money(o.totals.total)}`, at: o.placedAt, read: false, oid: o.id }));
          activity = activity.slice(0, 40);
          save(); updateBellUI();
          toast('New order received');
          if (adminPanel === 'dashboard') {
            const sp = $('#staffPanel');
            if (sp) { sp.innerHTML = panelOf('dashboard'); wireAdmin(); }
          }
        }
      } catch { /* The next polling cycle can retry a transient failure. */ }
      finally { pending = false; }
    }, 4000);
  };

  const wireStaffTables = () => {
    $$('[data-status]').forEach(s => s.onchange = () => {
      const o = orders.find(x => x.id === s.getAttribute('data-status'));
      if (o) {
        o.status = s.value;
        o.log = o.log.filter(l => statusIndex(l.status) <= statusIndex(s.value));
        if (!o.log.some(l => l.status === s.value)) o.log.push({ status: s.value, at: new Date().toISOString() });
        save(); toast(`Order ${o.code} → ${(STATUSES.find(x => x.key === s.value) || {}).label}`);
        syncUpdateStatus(o);
        const custEmail = (o.customer || {}).email || o.email || '';
        if (custEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(custEmail)) {
          const st = STATUSES.find(x => x.key === s.value) || {};
          fetch(EMAIL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a: 'status-update', key: CM_SYNC_KEY, order: o, statusLabel: st.label || s.value, statusNote: st.note || '' }) }).catch(() => {});
        }
        if (adminPanel === 'orders') { const sp = $('#staffPanel'); if (sp) { sp.innerHTML = staffOrders(); wireAdmin(); } }
      }
    });
    $$('[data-stock]').forEach(s => s.onchange = () => {
      const id = Number(s.getAttribute('data-stock'));
      stockOverrides[id] = Number(s.value);
      save();
      syncCatalogPush();
      toast('Stock updated');
    });
    $$('[data-price]').forEach(i => i.onchange = () => {
      const id = Number(i.getAttribute('data-price'));
      priceOverrides[id] = Number(i.value) || 0;
      save();
      syncCatalogPush();
      toast('Price updated');
      const cell = i.closest('tr') ? i.closest('tr').querySelector('.p-display') : null;
      if (cell) cell.textContent = money(priceOf(allProducts().find(x => x.id === id)));
    });
    $$('[data-feat]').forEach(c => c.onchange = () => {
      const id = Number(c.getAttribute('data-feat'));
      featOn[id] = c.checked;
      save();
      syncCatalogPush();
      toast(c.checked ? 'Marked as featured' : 'Removed from featured');
    });
  };

  views.notFound = () => `
    <div class="page-head reveal"><h1>Page not found</h1></div>
    <div class="empty-state reveal"><div class="e-emoji">${I.fileQ}</div><h3>This spark fizzled</h3><p>The page you're looking for doesn't exist.</p><a class="btn btn-primary" href="#/">${I.gift} Back to home</a></div>`;

  /* ==================== router ==================== */
  let currentRoute = null;
  const ROUTES = [
    { re: /#\/?$/, name: 'home', view: views.home },
    { re: /#\/products/, name: 'products', view: views.products },
    { re: /#\/product\/([^/?]+)/, name: 'product', view: views.product },
    { re: /#\/cart/, name: 'cart', view: views.cart },
    { re: /#\/checkout/, name: 'checkout', view: views.checkout },
    { re: /#\/order\/([^/?]+)/, name: 'orderSuccess', view: views.orderSuccess },
    { re: /#\/reorder\/([^/?]+)/, name: 'reorder', view: views.reorder },
    { re: /#\/track/, name: 'track', view: views.track },
    { re: /#\/my-orders/, name: 'myOrders', view: views.myOrders },
    { re: /#\/wishlist/, name: 'wishlist', view: views.wishlist },
    { re: /#\/price-list/, name: 'priceList', view: views.priceList },
    { re: /#\/staff/, name: 'staff', view: views.staff },
    { re: /#\/(about)/, name: 'content', view: views.content },
    { re: /#\/(contact)/, name: 'content', view: views.content },
    { re: /#\/(faq)/, name: 'content', view: views.content },
    { re: /#\/(wholesale)/, name: 'content', view: views.content },
    { re: /#\/(shipping)/, name: 'content', view: views.content },
    { re: /#\/(returns)/, name: 'content', view: views.content },
    { re: /#\/(safety)/, name: 'content', view: views.content },
    { re: /#\/(terms)/, name: 'content', view: views.content },
    { re: /#\/(privacy)/, name: 'content', view: views.content },
  ];

  const route = () => {
    const raw = location.hash || '#/';
    if (!location.hash && /^\/product\/[^/]+/.test(location.pathname)) {
      history.replaceState(null, '', '#/product/' + location.pathname.split('/')[2]);
      return route();
    }
    if (!location.hash && location.pathname === '/products') {
      history.replaceState(null, '', '#/products');
      return route();
    }

    /* Old staff URL on the customer domains → move visitors to the admin sub-site.
       Stops before the SPA ever renders the staff page here (no blank/broken staff view). */
    if (!IS_ADMIN_HOST && /^#\/staff(\/|$)/.test(raw)) {
      location.replace(ADMIN_ENTRY);
      return;
    }

    /* The admin sub-site only ever renders the staff console, no matter the hash.
       Auth is enforced inside views.staff (same guards as the old #/staff route). */
    if (IS_ADMIN_HOST) {
      const u = currentUser();
      document.body.classList.remove('maint-on');
      currentRoute = { name: 'staff', params: [], query: '' };
      document.title = 'Staff Hub · CrackersMela';
      document.body.classList.toggle('admin-mode', !!(u && isStaffRole(u.role)));
      document.getElementById('view').innerHTML = views.staff() || '';
      updateSeo({ name: 'staff' }, []);
      window.scrollTo(0, 0);
      postRoute('#/staff', { name: 'staff' });
      return;
    }

    const hashOnly = raw.replace(/^#/, '#').split('?')[0];
    const query = raw.includes('?') ? raw.split('?')[1] : '';
    const m = ROUTES.find(r => new RegExp('^' + r.re.source + '$').test(hashOnly));
    const view = document.getElementById('view');
    const sCur = currentUser();
    const isStaff = !!sCur && isStaffRole(sCur.role);
    if (maintOn() && !isStaff) {
      currentRoute = { name: 'maintenance', params: [], query };
      document.body.classList.add('maint-on');
      document.body.classList.remove('admin-mode');
      view.innerHTML = views.maintenance();
      document.title = 'CrackersMela — We\u2019ll Be Back Soon';
      updateSeo({ name: 'maintenance' }, []);
      window.scrollTo(0, 0);
      return;
    }
    document.body.classList.remove('maint-on');

    let out;
    if (m) {
      const params = [];
      const re = new RegExp('^' + m.re.source + '$');
      const res = re.exec('#' + hashOnly.replace(/^#/, ''));
      if (res) params.push(...res.slice(1));
      currentRoute = { name: m.name, params, query };
      out = m.view(currentRoute);
      document.title = m.name === 'home'
        ? 'CrackersMela — Premium Fireworks & Festive Celebrations'
        : (m.name === 'product')
          ? `${esc((prodBySlug(params[0]) || {}).shortName || 'Product')} · CrackersMela`
          : `${({ products: 'Shop Fireworks', cart: 'Cart', checkout: 'Checkout', track: 'Track Order', myOrders: 'My Orders', wishlist: 'Wishlist', priceList: 'Price List', staff: 'Staff Hub' }[m.name] || 'CrackersMela')} · CrackersMela`;
    } else {
      currentRoute = { name: 'notFound', params: [], query };
      out = views.notFound();
      document.title = 'Not found · CrackersMela';
    }
    if (typeof out === 'string' && out.startsWith('location.')) {
      const target = out.slice('location.'.length);
      location.hash = target;
      return route();
    }
    const au = currentUser();
    document.body.classList.toggle('admin-mode', !!(m && m.name === 'staff' && au && isStaffRole(au.role)));
    view.innerHTML = out || '';
    window.scrollTo(0, 0);
    updateSeo(m || { name: 'notFound' }, currentRoute.params);
    postRoute(raw, m);
  };

  const postRoute = (raw, m) => {
    // refresh chrome
    accountUI(); cartUI(); wishUI();
    navActive();
    catRailUI(m);
    wireView(m);
    wirePills();
    setupReveal();
    if (m && m.name === 'home') initSparks();
    if (m && m.name === 'track' && raw.includes('id=')) {
      const code = new URLSearchParams(raw.split('?')[1]).get('id');
      if (code) requestAnimationFrame(() => trackRender(code));
    }
    if (m && m.name === 'home') {
      const cd = $('#dealClock');
      if (cd && SALE_END) { clearInterval(cdTimer); cdTimer = countdown(SALE_END, 'dealClock'); if (reduceMotion) cd.style.display = 'none'; }
      const heroForm = $('#heroSearchForm');
      if (heroForm) heroForm.onsubmit = e => { e.preventDefault(); const raw = $('#heroSearchInput').value.trim(); trackSearch(raw); const q = encodeURIComponent(raw); location.hash = q ? '#/products?q=' + q : '#/products'; };
    }
    trackPageView();
  };

  const updateSeo = (m, params = []) => {
    const name = m && m.name || 'home';
    const pageName = name === 'content' ? (params[0] || 'about') : name;
    const product = pageName === 'product' ? prodBySlug(params[0] || '') : null;
    const title = product ? `${product.seoTitle || product.shortName} | Crackers in Hyderabad | CrackersMela` : ({ home: 'CrackersMela | Premium Crackers & Fireworks in Hyderabad', products: 'Buy Crackers & Fireworks Online in Hyderabad | CrackersMela', priceList: 'Crackers Price List | Hyderabad | CrackersMela', about: 'About CrackersMela | Hyderabad Fireworks Store', contact: 'Contact CrackersMela | Fireworks Delivery in Hyderabad', faq: 'Fireworks FAQ | CrackersMela Hyderabad' }[pageName] || 'CrackersMela | Fireworks in Hyderabad');
    const desc = product ? (product.seoDesc || `${product.shortName} from CrackersMela. Shop PESO-certified fireworks with delivery across Hyderabad and Secunderabad.`) : ({ home: 'Shop PESO-certified crackers and fireworks online with delivery across Hyderabad, Secunderabad and Telangana service areas.', products: 'Explore crackers, firecrackers, flower pots, sparklers and fireworks from CrackersMela, delivered across Hyderabad and Secunderabad.', priceList: 'Browse the current CrackersMela fireworks price list for Hyderabad delivery.', contact: 'Contact CrackersMela for crackers delivery, product questions, bulk orders and fireworks support in Hyderabad.' }[pageName] || 'CrackersMela offers licensed, PESO-certified fireworks and crackers for Hyderabad celebrations.');
    const canonical = product ? `https://crackersmela.com/product/${encodeURIComponent(product.slug || product.id)}` : `https://crackersmela.com/${pageName === 'home' ? '' : pageName}`;
    document.title = title;
    const setMeta = (selector, attrs, content) => { let el = document.head.querySelector(selector); if (!el) { el = document.createElement('meta'); Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v)); document.head.appendChild(el); } el.setAttribute('content', content); };
    setMeta('meta[name="description"]', { name: 'description' }, String(desc).slice(0, 160));
    setMeta('meta[property="og:title"]', { property: 'og:title' }, title);
    setMeta('meta[property="og:description"]', { property: 'og:description' }, String(desc).slice(0, 160));
    setMeta('meta[property="og:type"]', { property: 'og:type' }, product ? 'product' : 'website');
    const imageSource = product && safeImageSrc(product.image);
    const productImage = imageSource ? new URL(imageSource, 'https://crackersmela.com/').href : '';
    const ogImage = productImage || 'https://crackersmela.com/images/logo.png';
    setMeta('meta[property="og:url"]', { property: 'og:url' }, canonical);
    setMeta('meta[property="og:image"]', { property: 'og:image' }, ogImage);
    setMeta('meta[property="og:site_name"]', { property: 'og:site_name' }, 'CrackersMela');
    setMeta('meta[name="twitter:card"]', { name: 'twitter:card' }, 'summary_large_image');
    setMeta('meta[name="twitter:title"]', { name: 'twitter:title' }, title);
    setMeta('meta[name="twitter:description"]', { name: 'twitter:description' }, String(desc).slice(0, 160));
    setMeta('meta[name="twitter:image"]', { name: 'twitter:image' }, ogImage);
    let link = document.head.querySelector('link[rel="canonical"]'); if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); } link.href = canonical;
    let robots = document.head.querySelector('meta[name="robots"]'); if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.appendChild(robots); }
    const privateRoute = !!PREVIEW || ['cart', 'checkout', 'orderSuccess', 'reorder', 'track', 'myOrders', 'wishlist', 'staff', 'maintenance', 'notFound'].includes(pageName);
    robots.content = privateRoute ? 'noindex, nofollow, noarchive' : 'index, follow, max-image-preview:large';
    let ld = document.getElementById('cm-dynamic-schema'); if (!ld) { ld = document.createElement('script'); ld.id = 'cm-dynamic-schema'; ld.type = 'application/ld+json'; document.head.appendChild(ld); }
    const crumbs = product ? [{ '@type': 'ListItem', position: 1, name: 'Home', item: 'https://crackersmela.com/' }, { '@type': 'ListItem', position: 2, name: 'Products', item: 'https://crackersmela.com/products' }, { '@type': 'ListItem', position: 3, name: product.shortName, item: canonical }] : [];
    const schema = product ? { '@context': 'https://schema.org', '@type': 'Product', name: product.name, image: productImage ? [productImage] : [], description: product.desc || product.note || desc, sku: product.sku || String(product.id), productID: String(product.id), offers: { '@type': 'Offer', url: canonical, priceCurrency: 'INR', price: Number(priceOf(product)) || 0, availability: inStockOf(product) ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', itemCondition: 'https://schema.org/NewCondition' }, ...(product.rating && product.reviews ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(product.rating), reviewCount: Number(product.reviews) } } : {}) } : { '@context': 'https://schema.org', '@graph': [{ '@type': 'Organization', name: 'CrackersMela', url: 'https://crackersmela.com/' }, { '@type': 'WebSite', name: 'CrackersMela', url: 'https://crackersmela.com/', potentialAction: { '@type': 'SearchAction', target: 'https://crackersmela.com/products?q={search_term_string}', 'query-input': 'required name=search_term_string' } }] };
    if (crumbs.length) schema.breadcrumb = { '@type': 'BreadcrumbList', itemListElement: crumbs };
    ld.textContent = JSON.stringify(schema);
  };

  const navActive = () => {
    const raw = '#/' + location.hash.replace(/^#\//, '').split('?')[0].replace(/^#/, '');
    $$('[data-nav]').forEach(a => {
      const v = a.getAttribute('data-nav');
      let on = false;
      if (v === '/') on = raw === '#/' || raw === '#';
      else if (v === '/products') on = raw.startsWith('#/products') || raw.startsWith('#/product/');
      else on = raw.includes(v);
      a.classList.toggle('active', on);
    });
  };

  const setupReveal = () => {
    if (reduceMotion) return;
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    $$('.reveal:not(.in)').forEach(el => io.observe(el));
  };

  /* ==================== hero fireworks (subtle, blue/white) ==================== */
  let fwRaf = null;
  let fwTick = null;
  let sparkResize = null;
  let sparkRepaint = null;
  let sparkIO = null;
  const initSparks = () => {
    const cv = document.getElementById('heroCanvas');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    cv.style.opacity = '0.85';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0;
    const resize = () => { W = cv.clientWidth; H = cv.clientHeight; cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr)); };
    resize();
    if (sparkResize) window.removeEventListener('resize', sparkResize);
    sparkResize = resize;
    window.addEventListener('resize', resize);

    /* Reduced motion: show a static sprinkling of sparkles only, no animation. */
    if (reduceMotion) {
      const spots = Array.from({ length: 16 }, () => ({
        x: Math.random(), y: Math.random(),
        r: 0.6 + Math.random() * 1.5,
        a: 0.12 + Math.random() * 0.2,
        c: ['#0B3D91', '#1565C0', '#1E88E5', '#2979FF', '#00B0FF'][Math.floor(Math.random() * 5)],
      }));
      const paint = () => {
        ctx.clearRect(0, 0, cv.width, cv.height);
        for (const s of spots) {
          ctx.globalAlpha = s.a;
          ctx.fillStyle = s.c;
          ctx.beginPath();
          ctx.arc(s.x * W * dpr, s.y * H * dpr, s.r * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      };
      paint();
      if (sparkRepaint) window.removeEventListener('resize', sparkRepaint);
      sparkRepaint = paint;
      window.addEventListener('resize', paint);
      if (sparkIO) { sparkIO.disconnect(); sparkIO = null; }
      cancelAnimationFrame(fwRaf);
      fwRaf = null;
      fwTick = null;
      return;
    }

    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    const rand = (a, b) => a + Math.random() * (b - a);
    const Rf = Math.PI * 2;
    /* Blue palette — deep saturated blues that read clearly on the light hero */
    const PICK = [[11, 61, 145], [21, 101, 192], [30, 136, 229], [41, 121, 255], [0, 176, 255]];

    /* One sparkle-burst: fades in, its sparks stream outward with a bright head +
       trailing ember + soft centre glow, then fades out, rests, and repeats. */
    class Sparkle {
      constructor(cw, ch, sc) { this.reset(cw, ch, sc); }
      reset(cw, ch, sc) {
        this.x = rand(cw * 0.06, cw * 0.94);
        this.y = rand(ch * 0.08, ch * 0.62);
        this.colour = PICK[Math.random() * PICK.length | 0];
        this.age = 0;
        this.life = rand(1.1, 1.9);
        this.delay = rand(0, 3.2);
        this.sparks = [];
        const u = rand(38, 92);
        for (let c = 0; c < sc; c += 1) {
          const m = (c / sc) * Rf + rand(-0.12, 0.12);
          this.sparks.push({ angle: m, velocity: u * rand(0.55, 1), size: rand(1, 2.4), drag: rand(0.86, 0.94) });
        }
      }
      draw(a, r, cw, ch, sc) {
        if (this.delay > 0) { this.delay -= r; return; }
        this.age += r;
        const m = this.age / this.life;
        if (m >= 1) { this.reset(cw, ch, sc); this.delay = rand(0.4, 3); return; }
        const [f, p, A] = this.colour;
        const v = 1 - Math.pow(1 - m, 3);              // outward ease-in
        const N = m < 0.12 ? m / 0.12 : Math.pow(1 - (m - 0.12) / 0.88, 1.6);   // fast fade-in, slow fade-out
        const k = 26 * m * m;                          // gentle downward drift
        for (let b = 0; b < this.sparks.length; b += 1) {
          const L = this.sparks[b];
          const C = L.velocity * v;
          const M = this.x + Math.cos(L.angle) * C;
          const E = this.y + Math.sin(L.angle) * C + k;
          const G = C * 0.82;
          const D = this.x + Math.cos(L.angle) * G;
          const H = this.y + Math.sin(L.angle) * G + k * 0.82;
          a.globalAlpha = N * 0.28;                    // trailing ember (dimmer, smaller)
          a.fillStyle = `rgb(${f},${p},${A})`;
          a.beginPath(); a.arc(D, H, L.size * 0.7, 0, Rf); a.fill();
          a.globalAlpha = N;                           // bright head
          a.beginPath(); a.arc(M, E, L.size, 0, Rf); a.fill();
        }
        if (m < 0.22) {                                // soft centre glow as it pops
          a.globalAlpha = (1 - m / 0.22) * 0.35;
          const g = a.createRadialGradient(this.x, this.y, 0, this.x, this.y, 46);
          g.addColorStop(0, `rgba(${f},${p},${A},1)`);
          g.addColorStop(1, `rgba(${f},${p},${A},0)`);
          a.fillStyle = g;
          a.beginPath(); a.arc(this.x, this.y, 46, 0, Rf); a.fill();
        }
      }
    }

    /* Build the field of sparkle-bursts; count & richness scale like the reference. */
    const cores = (typeof navigator < 'u' && navigator.hardwareConcurrency) || 4;
    const rich = cores <= 4 ? 0.6 : 1;
    const DENSITY = 1.6;                                   // more bursts live at once
    const groups = Math.max(2, Math.round((isMobile ? 3 : 6) * rich * DENSITY));
    const sparkCount = isMobile ? 16 : (cores <= 4 ? 24 : 32);
    let sparkles = Array.from({ length: groups }, () => new Sparkle(W, H, sparkCount));

    let last = performance.now();
    let onScreen = true;
    const tick = (now) => {
      fwRaf = requestAnimationFrame(tick);              // re-schedule first, the loop can always recover
      if (document.hidden || !onScreen || !document.getElementById('heroCanvas')) { last = now; return; }
      const r = Math.min((now - last) / 1000, 0.05);    // seconds, capped so a tab-switch never jumps
      last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < sparkles.length; i += 1) sparkles[i].draw(ctx, r, W, H, sparkCount);
      ctx.globalAlpha = 1;
    };
    const rebuild = () => { sparkles = Array.from({ length: groups }, () => new Sparkle(W, H, sparkCount)); };
    if (sparkRepaint) window.removeEventListener('resize', sparkRepaint);
    sparkRepaint = rebuild;
    window.addEventListener('resize', rebuild);
    fwTick = tick;
    cancelAnimationFrame(fwRaf);
    fwRaf = requestAnimationFrame(tick);
    if (typeof IntersectionObserver < 'u') {
      if (sparkIO) sparkIO.disconnect();
      const io = new IntersectionObserver((e) => { onScreen = e[0].isIntersecting; }, { rootMargin: '120px' });
      sparkIO = io;
      io.observe(cv);
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (fwRaf) { cancelAnimationFrame(fwRaf); fwRaf = null; } }
    else if (!fwRaf && fwTick) fwRaf = requestAnimationFrame(fwTick);
  });
  window.addEventListener('pageshow', () => { if (!fwRaf && fwTick) fwRaf = requestAnimationFrame(fwTick); });

  /* ==================== shop chrome (rail, pills, filter drawer) ==================== */
  const openFilters = (on) => {
    const col = $('#filterCol'), back = $('#filterBackdrop');
    if (!col) return;
    col.classList.toggle('open', !!on);
    if (back) back.classList.toggle('open', !!on);
    document.body.style.overflow = on && window.matchMedia('(max-width: 980px)').matches ? 'hidden' : '';
  };

  /* Category pill rail — only on listing/detail routes */
  const catRailUI = (m) => {
    const rail = $('#catRail');
    if (!rail) return;
    const show = m && (m.name === 'products' || m.name === 'product' || m.name === 'wishlist');
    rail.hidden = !show;
    if (!show) { rail.innerHTML = ''; return; }
    const st = m.name === 'products' ? shopState(currentRoute) : { cats: [] };
    const active = st.cats.length === 1 ? st.cats[0] : (st.cats.length ? '' : 'all');
    const pill = (id, name, n) => `<button class="cat-pill ${active === id ? 'active' : ''}" data-cat="${esc(id)}" aria-current="${active === id}">${esc(name)}${n != null ? `<span class="cp-n">${n}</span>` : ''}</button>`;
    rail.innerHTML = pill('all', 'All Categories', allProducts().length)
      + CATS.map(c => pill(c.id, c.name, allProducts().filter(p => p.cats.includes(c.id)).length)).join('')
      + `<button class="cat-pill ${location.hash.includes('sort=newest') ? 'active' : ''}" data-railsort="newest">New Arrivals</button>`;
  };

  /* In-place collection pills (homepage New Arrivals / Featured) */
  const wirePills = () => {
    $$('[data-pillgroup]').forEach(btn => btn.addEventListener('click', () => {
      const group = btn.getAttribute('data-pillgroup');
      const key = btn.getAttribute('data-pill');
      const row = btn.closest('.chip-row');
      if (row) $$('[data-pillgroup]', row).forEach(b => {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on);
      });
      const grid = $('#' + group + 'Grid') || (row && row.parentElement && row.parentElement.querySelector('.prod-grid'));
      if (!grid) return;
      const cap = Number(grid.getAttribute('data-cap')) || 999;
      let shown = 0;
      $$('.prod-card', grid).forEach(card => {
        const keys = (card.getAttribute('data-keys') || '').split(' ');
        const match = key === 'all' || keys.includes(key);
        const vis = match && shown < cap;
        card.hidden = !vis;
        if (vis) shown++;
      });
      let empty = grid.parentElement.querySelector('.pill-empty');
      if (!shown) {
        if (!empty) {
          empty = document.createElement('p');
          empty.className = 'pill-empty';
          grid.parentElement.insertBefore(empty, grid.nextSibling);
        }
        empty.textContent = 'Nothing in this collection yet — try another filter.';
      } else if (empty) empty.remove();
    }));
    /* apply the initial cap so first paint matches the pill behaviour */
    $$('.prod-grid[data-cap]').forEach(grid => {
      const cap = Number(grid.getAttribute('data-cap')) || 999;
      $$('.prod-card', grid).forEach((card, i) => { card.hidden = i >= cap; });
    });
  };

  /* ==================== global wiring ==================== */
  const wireView = (m) => {
    const v = m ? m.name : '';
    if (v === 'products') {
      const st = shopState(currentRoute);
      const drawerOpen = () => { const c = $('#filterCol'); return !!(c && c.classList.contains('open')); };
      /* navigate to a patched filter state, keeping the mobile drawer open across re-renders */
      const go = (patch, keepFocus) => {
        const wasOpen = drawerOpen();
        const hash = shopHash(st, patch);
        if (location.hash === hash) route(); else location.hash = hash;
        if (wasOpen) requestAnimationFrame(() => openFilters(true));
        if (keepFocus) requestAnimationFrame(() => {
          const n = $('#prodSearch');
          if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
        });
      };

      const sp = $('#prodSearch');
      if (sp) sp.addEventListener('input', debounce(() => {
        const hash = shopHash(st, { q: sp.value.trim() });
        if (location.hash === hash) return;
        history.replaceState(null, '', hash);
        route();
        const n = $('#prodSearch');
        if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
      }, 260));

      const so = $('#prodSort');
      if (so) so.addEventListener('change', () => go({ sort: so.value === 'featured' ? '' : so.value }));

      /* dual price slider — paints live, commits on release */
      const rMin = $('#rangeMin'), rMax = $('#rangeMax'), rsFill = $('#rsFill');
      if (rMin && rMax) {
        const maxPrice = priceCeiling();
        const pct = n => ((n - PRICE_FLOOR) / (maxPrice - PRICE_FLOOR)) * 100;
        const paint = () => {
          const a = Math.min(+rMin.value, +rMax.value), b = Math.max(+rMin.value, +rMax.value);
          $('#rvMin').textContent = money(a);
          $('#rvMax').textContent = money(b);
          if (rsFill) { rsFill.style.left = pct(a) + '%'; rsFill.style.right = (100 - pct(b)) + '%'; }
          return [a, b];
        };
        [rMin, rMax].forEach(r => {
          r.addEventListener('input', paint);
          r.addEventListener('change', () => { const [a, b] = paint(); go({ min: a === PRICE_FLOOR ? '' : a, max: b === maxPrice ? '' : b }); });
        });
      }

      $$('[data-fcat]').forEach(cb => cb.addEventListener('change', () =>
        go({ cats: $$('[data-fcat]').filter(x => x.checked).map(x => x.value).join(',') })));
      $$('[data-favail]').forEach(r => r.addEventListener('change', () => go({ avail: r.value })));

      $$('[data-fclear]').forEach(b => b.addEventListener('click', () => {
        const k = b.getAttribute('data-fclear');
        if (k === 'all') { if (location.hash === '#/products') route(); else location.hash = '#/products'; return; }
        if (k === 'price') return go({ min: '', max: '' });
        go({ [k]: '' });
      }));

      $$('[data-ftoken]').forEach(b => b.addEventListener('click', () => {
        const k = b.getAttribute('data-ftoken');
        if (k.startsWith('cat:')) return go({ cats: st.cats.filter(c => c !== k.slice(4)).join(',') });
        if (k === 'price') return go({ min: '', max: '' });
        go({ [k]: '' });
      }));

      const fab = $('#filterFab'), fClose = $('#filterClose'), fBack = $('#filterBackdrop');
      if (fab) fab.addEventListener('click', () => openFilters(true));
      if (fClose) fClose.addEventListener('click', () => openFilters(false));
      if (fBack) fBack.addEventListener('click', () => openFilters(false));
    }
    if (v === 'product') {
      const p = prodBySlug(currentRoute.params[0] || '');
      const btnQ = $('#pdQty'), min = $('#pdMinus'), plu = $('#pdPlus'), add = $('#pdAdd'), buy = $('#pdBuyNow'), wish = $('#pdWish');
      const setQ = n => { if (btnQ) btnQ.textContent = n; };
      if (min) min.onclick = () => { let n = Math.max(1, (parseInt(btnQ.textContent) || 1) - 1); setQ(n); };
      if (plu) plu.onclick = () => { const n = Math.min(50, Math.max(1, Math.floor(stockOf(p))), (parseInt(btnQ.textContent) || 1) + 1); setQ(n); };
      if (add) add.onclick = () => { const n = parseInt(btnQ.textContent) || 1; if (!addToCart(p.id, n)) return; add.innerHTML = I.check + ' Added'; add.classList.add('added'); setTimeout(() => { add.innerHTML = I.cart + ' Add to cart'; add.classList.remove('added'); }, 1200); };
      if (buy) buy.onclick = () => { const n = parseInt(btnQ.textContent) || 1; addToCart(p.id, n); const t = cartTotals(); if (t.subtotal < STORE.minOrder) { toast(`Minimum order value is ${money(STORE.minOrder)}. Please add ${money(STORE.minOrder - t.subtotal)} more to continue.`, 'err'); return; } location.hash = '#/checkout'; };
      if (wish) wish.onclick = () => toggleWish(p.id);
    }
    if (v === 'cart') {
      const go = $('#goCheckout');
      if (go) go.onclick = () => {
        const t = cartTotals();
        if (t.subtotal < STORE.minOrder) return toast(`Minimum order value is ${money(STORE.minOrder)}. Please add ${money(STORE.minOrder - t.subtotal)} more to continue.`, 'err');
        location.hash = '#/checkout';
      };
      const clr = $('#clearCart');
      if (clr) clr.onclick = () => { cart = []; save(); cartUI(); route(); toast('Cart cleared', 'info'); };
    }
    if (v === 'checkout') {
      wireCheckout();
    }
    if (v === 'orderSuccess') {
      const pc = $('#copyCode');
      if (pc) pc.onclick = async () => { try { const c = $('.order-code-text'); await navigator.clipboard.writeText(c ? c.textContent.trim() : $('.order-code').textContent.trim()); toast('Order code copied'); } catch { toast('Copy the code manually', 'info'); } };
      const pi = $('#printInvoice');
      if (pi) pi.onclick = () => window.print();
    }
    if (v === 'track') {
      const f = $('#trackForm');
      if (f) f.onsubmit = e => { e.preventDefault(); trackRender($('#trackCode').value); };
    }
    if (v === 'myOrders') {
      const ga = $('#goAuthOrders');
      if (ga) ga.onclick = () => authModal('login');
    }
    if (v === 'staff') {
      const ga = $('#goAuthStaff');
      if (ga) ga.onclick = () => authModal('login');
      wireAdmin();
    }
    if (v === 'priceList') {
      const ps = $('#plSearch'); const pc = $('#plCat');
      if (ps) ps.addEventListener('input', debounce(() => $('#plTable tbody').innerHTML = priceListRows(pc.value, ps.value.toLowerCase())));
      if (pc) pc.onchange = () => $('#plTable tbody').innerHTML = priceListRows(pc.value, ps ? ps.value.toLowerCase() : '');
    }
    if (v === 'content') {
      if (currentRoute.params[0] === 'contact') {
        const f = $('#contactForm');
        if (f) f.onsubmit = e => { e.preventDefault();
          const n = $('#cfName').value.trim(), p = $('#cfPhone').value.trim(), msg = $('#cfMsg').value.trim();
          if (n.length < 2) return toast('Please enter your name', 'err');
          if (!/^[6-9]\d{9}$/.test(p)) return toast('Enter a valid 10-digit mobile number', 'err');
          if (msg.length < 5) return toast('Tell us a little more', 'err');
          toast('The contact form is unavailable in this review. Please use the phone or WhatsApp link to contact the store.', 'info');
        };
      }
    }
  };

  const wireCheckout = () => {
    if (!cart.length) return;
    const st = checkoutState;
    const readStep1 = () => {
      const g = id => $('#ck_' + id).value.trim();
      st.data = { name: g('name'), phone: g('phone'), email: g('email').toLowerCase(), address: g('address'), area: g('area'), city: g('city') || 'Hyderabad', pincode: g('pincode') };
      st.touched.email = st.touched.email || !!st.data.email;
    };
    const eml = $('#ck_email');
    if (eml) eml.onblur = () => { st.touched.email = true; };
    const n1 = $('#ckNext1');
    if (n1) n1.onclick = () => {
      readStep1();
      const errs = checkoutValidate(st);
      if (errs.length) { toast(errs[0], 'err'); return; }
      trackEcommerce('begin_checkout', cart.map(c => ({ ...(prodById(c.id) || {}), quantity: c.qty })).filter(p => p.id), cartTotals().subtotal);
      st.step = 2;
      transition('checkout', checkoutStepHTML(2));
      wireCheckout();
    };
    const b1 = $('#ckBack1');
    if (b1) b1.onclick = () => { st.step = 1; transition('checkout', checkoutStepHTML(1)); wireCheckout(); };
    const n2 = $('#ckNext2');
    if (n2) n2.onclick = () => { st.step = 3; transition('checkout', checkoutStepHTML(3)); wireCheckout(); };
    const b2 = $('#ckBack2');
    if (b2) b2.onclick = () => { st.step = 2; transition('checkout', checkoutStepHTML(2)); wireCheckout(); };
    $$('[data-pay]').forEach(el => el.onclick = () => { st.payment = el.getAttribute('data-pay'); $$('[data-pay]').forEach(x => { x.classList.toggle('selected', x === el); x.setAttribute('aria-checked', String(x === el)); }); trackEvent('add_payment_info', {}, { payment_type: st.payment, currency: 'INR', value: cartTotals().subtotal, items: gaItems(cart.map(c => ({ ...(prodById(c.id) || {}), quantity: c.qty }))) }); });
    $$('[data-pay]').forEach((el, index, options) => {
      el.onkeydown = event => {
        if (['Enter', ' '].includes(event.key)) { event.preventDefault(); el.click(); }
        if (['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)) {
          event.preventDefault();
          const next = options[(index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + options.length) % options.length];
          next.focus(); next.click();
        }
      };
    });
    const applyBtn = $('#ckApplyCoupon');
    if (applyBtn) applyBtn.onclick = () => {
      const inp = $('#ckCouponInput');
      const msg = $('#ckCouponMsg');
      if (checkoutCoupon.code) {
        checkoutCoupon = { code: null, discount: 0 };
        st.coupon = checkoutCoupon;
        if (msg) { msg.textContent = ''; msg.style.color = ''; }
        transition('checkout', checkoutStepHTML(st.step));
        wireCheckout();
        return;
      }
      const entered = (inp && inp.value || '').trim().toUpperCase();
      if (!couponConfig || !couponConfig.code || entered !== String(couponConfig.code).trim().toUpperCase()) {
        checkoutCoupon = { code: null, discount: 0 };
        st.coupon = checkoutCoupon;
        if (msg) { msg.textContent = 'Invalid coupon code'; msg.style.color = '#E0464B'; }
        return;
      }
      checkoutCoupon = { code: String(couponConfig.code).trim().toUpperCase(), discount: Math.max(0, Number(couponConfig.discount) || 0) };
      st.coupon = checkoutCoupon;
      toast(`Coupon ${checkoutCoupon.code} applied (−${money(checkoutCoupon.discount)})`);
      transition('checkout', checkoutStepHTML(st.step));
      wireCheckout();
    };
    const place = $('#ckPlace');
    if (place) place.onclick = async () => {
      if (place.disabled) return;
      const errs = checkoutValidate(st);
      if (errs.length) return toast(errs[0], 'err');
      const label = place.innerHTML;
      place.disabled = true;
      place.textContent = 'Placing order…';
      let order;
      try { order = await placeOrder(st.data, st.data, st.payment); }
      finally { place.disabled = false; place.innerHTML = label; }
      if (!order) return;
      checkoutCoupon = { code: null, discount: 0 };
      save();
      toast(`Order ${order.code} placed!`);
      location.hash = '#/order/' + routePart(order.id);
    };
  };

  const transition = (name, html) => {
    document.getElementById('view').innerHTML = html;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    setupReveal();
  };

  /* ---------- global listeners ---------- */
  const bindGlobals = () => {
    loadGa();
    initAnalyticsConsent();
    window.addEventListener('hashchange', route);

    const drawerEls = ['cartDrawer'];
    document.addEventListener('click', e => {
      const t = e.target;
      if (t.closest && t.closest('[data-close-cart]')) { closeCart(); return; }
      if (t.closest && t.closest('[data-shop-more]')) { closeCart(); location.hash = '#/products'; return; }
      if (t.closest && t.closest('[data-close-drawer]')) { $('#mobileDrawer').classList.remove('open'); $('#mobileDrawer').setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; return; }
      if (t.closest && t.closest('[data-close-auth]')) { closeAuth(); return; }
      if (t.closest && t.closest('[data-wish]')) { toggleWish(t.closest('[data-wish]').getAttribute('data-wish')); return; }
      if (t.closest && t.closest('[data-add]')) { addToCart(t.closest('[data-add]').getAttribute('data-add')); return; }
      if (t.closest && t.closest('[data-qty]')) { const b = t.closest('[data-qty]'); setQty(b.getAttribute('data-qty'), cartQty(Number(b.getAttribute('data-qty'))) + Number(b.getAttribute('data-d'))); return; }
      if (t.closest && t.closest('[data-del]')) { removeLine(t.closest('[data-del]').getAttribute('data-del')); return; }
      if (t.closest && t.closest('[data-cat]')) { const id = t.closest('[data-cat]').getAttribute('data-cat'); const h = !id || id === 'all' ? '#/products' : '#/products?cat=' + id; if (location.hash === h) route(); else location.hash = h; return; }
      if (t.closest && t.closest('[data-railsort]')) { const h = '#/products?sort=' + t.closest('[data-railsort]').getAttribute('data-railsort'); if (location.hash === h) route(); else location.hash = h; return; }
      if (t.closest && t.closest('[data-search-hit]')) { closeSearch(); return; }
      if (t.closest && t.closest('[data-code-detail]')) { toggleOrderDetail(t.closest('[data-code-detail]').getAttribute('data-code-detail')); return; }
      if (t.closest && t.closest('[data-code-jump]')) {
        const id = t.closest('[data-code-jump]').getAttribute('data-code-jump');
        const panel = $('#staffPanel');
        $$('[data-stab]').forEach(x => x.classList.toggle('active', x.getAttribute('data-stab') === 'orders'));
        if (panel) { panel.innerHTML = staffOrders(id); wireAdmin(); }
        return;
      }
      if (t.closest && t.closest('[data-qa]')) { switchAdminPanel(t.closest('[data-qa]').getAttribute('data-qa')); return; }
      if (t.closest && t.closest('[data-signout]')) { logout(); return; }
      if (t.closest && t.closest('[data-range]')) { handleSalesRange(t.closest('[data-range]').getAttribute('data-range')); return; }
      if (t.closest && t.closest('[data-maint-toggle]')) { toggleMaint(); return; }
      if (t.closest && t.closest('[data-maint-check]')) { checkMaint(); return; }
      if (t.closest && t.closest('[data-maint-login]')) { authModal('login'); return; }
      if (t.closest && t.closest('[data-gs]')) {
        const el = t.closest('[data-gs]');
        const kind = el.getAttribute('data-gs');
        const id = el.getAttribute('data-id');
        const box = $('#admSearchBox');
        if (box) { box.innerHTML = ''; box.classList.remove('open'); }
        if (kind === 'order') { switchAdminPanel('orders'); toggleOrderDetail(id); }
        else if (kind === 'product') { const p = allProducts().find(x => x.id === Number(id)); admQ = p ? p.shortName : ''; switchAdminPanel('products'); }
        else { admQ = id || ''; switchAdminPanel('customers'); }
        return;
      }
    });

    $('#cartBtn').addEventListener('click', openCart);
    $('#cartCheckoutBtn').addEventListener('click', () => {
      const t = cartTotals();
      if (t.subtotal < STORE.minOrder) return toast(`Minimum order value is ${money(STORE.minOrder)}. Please add ${money(STORE.minOrder - t.subtotal)} more to continue.`, 'err');
      closeCart(); location.hash = '#/checkout';
    });
    $('#cartViewBtn').addEventListener('click', () => { closeCart(); location.hash = '#/cart'; });
    $('#wishBtn').addEventListener('click', () => location.hash = '#/wishlist');
    $('#accountChip').addEventListener('click', () => { currentUser() ? (IS_ADMIN_HOST ? route() : (location.hash.startsWith('#/staff') ? route() : location.hash = '#/my-orders')) : authModal('login'); });
    $('#userIconBtn').addEventListener('click', () => { currentUser() ? (location.hash = '#/my-orders') : authModal('login'); });

    const acmMenu = $('#accountMenu');
    if (acmMenu) {
      const acmArea = $('#accountArea');
      if (acmArea) acmArea.addEventListener('mouseleave', () => { acmMenu.style.display = ''; });
      acmMenu.querySelectorAll('[role="menuitem"]').forEach(it => {
        it.addEventListener('click', () => { acmMenu.style.display = 'none'; });
      });
      const acmLogout = acmMenu.querySelector('[data-act="logout"]');
      if (acmLogout) acmLogout.addEventListener('click', e => { e.preventDefault(); logout(); });
    }
    $('#mobileToggle').addEventListener('click', () => { const d = $('#mobileDrawer'); d.classList.add('open'); d.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; });
    $('#navSearch').addEventListener('click', e => { if (e.target.closest('.nav-search__close')) return; if (!e.target.closest('a')) navSearchInput().focus(); });
    $('#navSearchInput').addEventListener('input', e => renderSearchResults(e.target.value));
    $('#navSearchInput').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.value.trim()) { const raw = e.target.value.trim(); trackSearch(raw); const q = encodeURIComponent(raw); closeSearch(); location.hash = '#/products?q=' + q; } });
    $('#navSearchClose').addEventListener('click', closeSearch);
    $('#navSearchOpenBtn').addEventListener('click', () => { document.body.classList.add('nav-search-active'); navSearchInput().focus(); });
    document.addEventListener('click', e => { if (!e.target.closest('.nav-search') && !e.target.closest('#navSearchOpenBtn')) hideSearchResults(); });

    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); document.body.classList.add('nav-search-active'); navSearchInput().focus(); return; }
      if (e.key === 'Escape') { closeSearch(); closeCart(); closeAuth(); openFilters(false); $('#mobileDrawer').classList.remove('open'); document.body.style.overflow = ''; }
    });

    // navbar dropdowns: exclusive open, click-outside + ESC close, viewport-safe anchoring
    {
      const drops = Array.from(document.querySelectorAll('.nav-drop'));
      if (drops.length) {
        const closeAll = () => {
          drops.forEach(d => {
            d.classList.add('force-close');
            d.classList.remove('is-open');
            const a = d.querySelector('.nav-link');
            if (a && a === document.activeElement) a.blur();
          });
        };
        const blurOtherLinks = except => {
          drops.forEach(o => {
            if (o !== except) {
              o.classList.remove('is-open');
              const a = o.querySelector('.nav-link');
              if (a && a === document.activeElement) a.blur();
            }
          });
        };
        const prepare = d => { d.classList.remove('force-close'); blurOtherLinks(d); };
        drops.forEach(d => {
          const link = d.querySelector('.nav-link');
          const menu = d.querySelector('.nav-drop__menu');
          if (!menu || !link) return;
          const position = () => {
            const inner = document.querySelector('.nav-inner');
            if (!inner || typeof inner.getBoundingClientRect !== 'function') return;
            if (!link || typeof link.getBoundingClientRect !== 'function') return;
            const ir = inner.getBoundingClientRect();
            const lr = link.getBoundingClientRect();
const mw = Math.min(menu.offsetWidth || 320, window.innerWidth - 40);
    const cw = document.documentElement.clientWidth || (window.innerWidth - 40);
    let cx = lr.left + lr.width / 2;
    if (cx < 16 + mw / 2) cx = 16 + mw / 2;
    if (cx > cw - 16 - mw / 2) cx = cw - 16 - mw / 2;
            menu.style.setProperty('--drop-x', (cx - ir.left) + 'px');
          };
          position();
          window.addEventListener('resize', position);
          link.addEventListener('mouseenter', () => { prepare(d); position(); });
          link.addEventListener('mouseover', () => prepare(d));
          link.addEventListener('focus', () => { prepare(d); position(); });
          link.addEventListener('click', () => { prepare(d); position(); });
          d.addEventListener('mouseenter', () => prepare(d));
          d.addEventListener('mouseover', () => prepare(d));
          d.addEventListener('focusin', () => prepare(d));
        });
        document.addEventListener('click', e => {
          if (!drops.some(d => d.contains(e.target))) closeAll();
        });
        document.addEventListener('keydown', e => {
          if (e.key === 'Escape') closeAll();
        });
      }
    }

    // categories mega-menu
    const ncm = $('#navCatMenu');
    if (ncm) ncm.innerHTML = CATS.map(c => `<a href="#/products?cat=${c.id}" role="menuitem"><span class="mi">${catIcon(c)}</span><span><b>${esc(c.name)}</b><small>${PRODUCTS.filter(p => p.cats.includes(c.id)).length} products</small></span></a>`).join('');

    // mobile drawer: compact Shop-by-Category panel
    const dcg = $('#drawerCatGrid');
    if (dcg) dcg.innerHTML = CATS.map(c => `<a href="#/products?cat=${c.id}" data-close-drawer><span class="mi">${catIcon(c)}</span><span>${esc(c.name)}</span></a>`).join('');

    // footer categories
    const fc = $('#footerCats');
    if (fc) fc.innerHTML = CATS.slice(0, 6).map(c => `<a href="#/products?cat=${c.id}">${esc(c.name)}</a>`).join('');
    const fe = $('#footEmail');
    if (fe) fe.textContent = STORE.email;

    const promo = (() => {
      const track = $('#promoTrack');
      if (!track) return;
      const promoIcon = t => /SALE|OFF/.test(t) ? I.tag : /delivery/i.test(t) ? I.truck : /licensed|safety/i.test(t) ? I.shield : /COD|UPI/i.test(t) ? I.cash : I.bolt;
      const sep = '<svg style="width:6px;height:6px;opacity:.55;flex:none" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/></svg>';
      const items = STORE.promo.map(p => `<span class="promo-bar__item">${promoIcon(p.text)}<span>${esc(p.text)}</span></span><span class="promo-bar__item" aria-hidden="true">${sep}</span>`).join('');
      track.innerHTML = items + items;
    })();

    $('#fabUp').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    window.addEventListener('scroll', () => {
      $('#navbar').classList.toggle('scrolled', window.scrollY > 10);
      $('#fabUp').classList.toggle('show', window.scrollY > 600);
    }, { passive: true });

    /* maintenance flag + settings (site-wide) — read from the admin backend store */
    const maintReady = Promise.resolve();

    /* first paint — waits a beat for the backend flag so site-wide mode has no flash */
    Promise.race([Promise.all([maintReady, syncCatalogPull(), syncProductsPull()]), new Promise(r => setTimeout(r, 1800))]).then(() => {
      route();
      accountUI(); cartUI(); wishUI();
      $('#navbar').classList.toggle('scrolled', window.scrollY > 10);
    });
    window.addEventListener('focus', debounce(() => { syncCatalogPull(); syncProductsPull(); }, 500));
    /* periodic re-sync — admin changes reach the storefront automatically (≤25s) */
    setInterval(() => { syncProductsPull(); }, 25000);
    // Do not download customer orders to every visitor. Order reads must be
    // restored through an authenticated, owner-scoped server API.
  };

  fbInit();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindGlobals);
  else bindGlobals();
})();
