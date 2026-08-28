/* ============================================================
   CrackersMela — front-end application (client renderer)
   Blue glassmorphism SPA. No framework. No external runtime deps.

   NOTE: This static build is the showcase/UI layer. It ships the
   catalog embedded in products-data.js and keeps user data in
   localStorage so the full storefront works offline. When the
   Spring Boot API (see backend controllers) is wired in, the
   matching endpoints must be the single source of truth for
   prices/stock/orders. Prices, discounts and quantities shown
   here are display-only and MUST be re-validated server-side.
   ============================================================ */
(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const DATA = window.CM_DATA || { categories: [], products: [], store: {} };
  const STORE = DATA.store;
  const CATS = DATA.categories;
  const PRODUCTS = DATA.products;

  /* ---------------- helpers ---------------- */
  const money = n => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
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
    if (!p.inStock) return `<span class="stock-line out"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 9v4"/><circle cx="12" cy="17" r="0.4"/><circle cx="12" cy="12" r="9" stroke-dasharray="2 2"/></svg>Out of stock</span>`;
    if (p.stock <= 6) return `<span class="stock-line low"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.8 2.8M16.2 16.2 19 19M19 5l-2.8 2.8M7.8 16.2 5 19"/></svg>Only ${p.stock} left</span>`;
    return `<span class="stock-line in"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>In stock</span>`;
  };
  const stars = r => '<span class="stars" aria-hidden="true">' + '★'.repeat(Math.round(r)) + '☆'.repeat(5 - Math.round(r)) + '</span>';
  const imgOf = (p, w = 400) => {
    if (!p.image) return '';
    return `<img src="${esc(p.image)}" alt="${esc(p.shortName)}" loading="lazy" width="${w}" height="${w}" onerror="this.outerHTML='<div class=\'prod-img-fallback\'>${esc(catLabel(p).icon)}</div>'">`;
  };
  const slugOf = p => p.slug || 'p-' + p.id;
  const prodUrl = p => '#/product/' + slugOf(p);
  const uid = () => 'CM' + Date.now().toString(36).toUpperCase().slice(-6) + Math.random().toString(36).slice(2, 5).toUpperCase();
  const orderCode = () => 'CM' + Math.random().toString(36).slice(2, 7).toUpperCase();

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- persistence ---------------- */
  const ls = {
    get(k, def) { try { const v = JSON.parse(localStorage.getItem('cm2.' + k)); return v === null || v === undefined ? def : v; } catch { return def; } },
    set(k, v) { try { localStorage.setItem('cm2.' + k, JSON.stringify(v)); } catch { /* quota */ } },
  };

  let cart = ls.get('cart', []);
  let wish = ls.get('wish', []);
  let recent = ls.get('recent', []);
  let session = ls.get('session', { email: null });
  let users = ls.get('users', {});
  let orders = ls.get('orders', []);
  let stockOverrides = ls.get('stockOverrides', {});
  let priceOverrides = ls.get('priceOverrides', {});
  let featOn = ls.get('featOn', {});
  let extraProducts = ls.get('extraProducts', []);
  let activity = ls.get('activity', []);
  let admPrefs = ls.get('admPrefs', { theme: 'light', bell: 0 });

  const save = () => { ls.set('cart', cart); ls.set('wish', wish); ls.set('recent', recent); ls.set('orders', orders); ls.set('session', session); ls.set('stockOverrides', stockOverrides); ls.set('priceOverrides', priceOverrides); ls.set('featOn', featOn); ls.set('extraProducts', extraProducts); ls.set('activity', activity); ls.set('admPrefs', admPrefs); };

  const allProducts = () => PRODUCTS.concat(extraProducts);
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

  const currentUser = () => (session && session.email && users[session.email]) ? { ...users[session.email], email: session.email } : null;

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
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
    wa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.8 4.9-1.3A10 10 0 1 0 12 2zm5.2 14.2c-.2.6-1.2 1.2-1.7 1.2-.5.1-1 .2-3.4-.7-2.9-1.2-4.7-4.1-4.9-4.3-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4-.1.6.4l.8 2.1c.1.2.1.4 0 .6l-.3.5-.4.6c-.1.2-.3.4-.1.7.2.3.8 1.4 1.8 2.2 1.2 1.1 2.3 1.4 2.6 1.6.3.2.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l2.1 1c.3.1.5.2.5.4.1.1.1.7-.2 1.3z"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 3 6.6 7 .9-5.2 4.8 1.4 7-6.2-3.6L5.8 21l1.4-7L2 9.5l7-.9z"/></svg>',
    sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/></svg>',
  };

  const toast = (msg, type = 'ok') => {
    const wrap = $('#toastWrap');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
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

  const productCard = (p, opts = {}) => {
    const off = discountOf(p);
    const img = imgOf(p);
    const hasImg = /<img/.test(img);
    const media = hasImg ? img : `<div class="prod-img-fallback">${esc(catLabel(p).icon)}</div>`;
    const badges = [];
    if (off > 0) badges.push(`<span class="badge-off">${off}% OFF</span>`);
    if (featuredOf(p)) badges.push(`<span class="badge-off badge-hot">${off > 0 ? 'HOT' : 'BESTSELLER'}</span>`);
    return `
    <article class="prod-card reveal" data-id="${p.id}" data-keys="${esc(cardKeys(p))}">
      <div class="prod-card__media">
        <a href="${prodUrl(p)}" tabindex="-1" aria-hidden="true">${media}</a>
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
        <div class="prod-card__foot">
          ${stockLine(p)}
          ${inStockOf(p) ? `<button class="add-btn add-btn--round" data-add="${p.id}" title="Add to cart" aria-label="Add ${esc(p.shortName)} to cart">${I.cart}<span>Add</span></button>`
          : `<button class="add-btn add-btn--round" disabled title="Sold out" aria-label="Sold out">${I.cart}<span>Sold</span></button>`}
        </div>
      </div>
    </article>`;
  };

  const productGrid = (list, opts = {}) => list.length
    ? `<div class="prod-grid ${opts.cols === 3 ? 'prod-grid--3' : opts.cols === 5 ? 'prod-grid--5' : ''}">${list.map(p => productCard(p, opts)).join('')}</div>`
    : `<div class="empty-state reveal"><div class="e-emoji">🎆</div><h3>${esc(opts.emptyTitle || 'Nothing here yet')}</h3><p>${esc(opts.emptyText || 'Try a different search or category.')}</p></div>`;

  const catCard = c => {
    const count = PRODUCTS.filter(p => p.cats && p.cats.includes(c.id)).length;
    return `<div class="cat-card reveal" data-cat="${c.id}" role="link" tabindex="0" aria-label="${esc(c.name)} — ${count} products">
      <div class="cat-card__icon">${esc(c.icon)}</div>
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
      const p = PRODUCTS.find(x => x.id === line.id);
      if (!p) continue;
      subtotal += priceOf(p) * line.qty;
      if (p.compareAt > priceOf(p)) saving += (p.compareAt - priceOf(p)) * line.qty;
      count += line.qty;
    }
    const festive = subtotal >= 1000 ? subtotal >= 2000 ? 0.15 : 0.10 : subtotal >= 500 ? 0.05 : 0;
    const festiveAmt = Math.round(subtotal * festive);
    const afterSub = subtotal - festiveAmt;
    const delivery = subtotal === 0 || afterSub >= STORE.freeDeliveryAbove ? 0 : 50;
    const total = afterSub + delivery;
    return { count, subtotal, festiveAmt, festivePct: Math.round(festive * 100), saving, delivery, total };
  };

  const addToCart = (id, qty = 1) => {
    const p = PRODUCTS.find(x => x.id === Number(id));
    if (!p || !inStockOf(p)) return toast('This item is currently un-available', 'err');
    const existing = cart.find(c => c.id === p.id);
    if (existing) existing.qty = clamp(existing.qty + qty, 1, 50);
    else cart.push({ id: p.id, qty: clamp(qty, 1, 50) });
    save();
    cartUI();
    bumpBadge($('#cartCount'));
    toast(`${esc(p.shortName)} added to cart`);
  };

  const setQty = (id, qty) => {
    const line = cart.find(c => c.id === Number(id));
    if (!line) return;
    line.qty = clamp(qty, 1, 50);
    if (line.qty <= 0) cart = cart.filter(c => c.id !== line.id);
    save(); cartUI();
    renderCartPageIfVisible();
  };

  const removeLine = id => { cart = cart.filter(c => c.id !== Number(id)); save(); cartUI(); renderCartPageIfVisible(); };

  const bumpBadge = el => {
    if (!el) return;
    el.classList.remove('hidden');
    el.animate([{ transform: 'scale(1.6)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
  };

  const cartLine = (p, qty) => {
    const img = p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : `<div class="cart-line__img" style="display:grid;place-items:center;background:var(--bg);border-radius:11px;width:64px;height:64px">${esc(catLabel(p).icon)}</div>`;
    return `
    <div class="cart-line" data-line="${p.id}">
      ${img}
      <div class="cart-line__body">
        <h4>${esc(p.shortName)}</h4>
        <div class="cart-line__price">${money(p.price)}${p.compareAt > p.price ? ' <s style="color:var(--muted-2);font-size:12px">' + money(p.compareAt) + '</s>' : ''}</div>
        <div class="cart-line__foot">
          <div class="mini-qty">
            <button data-qty="${p.id}" data-d="-1" aria-label="Decrease">−</button>
            <b>${qty}</b>
            <button data-qty="${p.id}" data-d="1" aria-label="Increase">+</button>
          </div>
          <b style="margin-left:auto">${money(p.price * qty)}</b>
        </div>
      </div>
      <button class="cart-line__del" data-del="${p.id}" aria-label="Remove from cart">✕</button>
    </div>`;
  };

  const cartDrawerRender = () => {
    const body = $('#cartDrawerBody');
    const summary = $('#cartDrawerSummary');
    if (!body) return;
    const { count, subtotal, festivePct, festiveAmt, saving, delivery, total } = cartTotals();
    $('#cartDrawerCount').textContent = count ? `(${count})` : '';
    if (!count) {
      body.innerHTML = `<div class="cart-empty"><div class="e-emoji">🛒</div><p>Your cart is empty.<br>Let's light up something great.</p></div>`;
      summary.innerHTML = '';
      $('#cartCheckoutBtn').disabled = true;
      return;
    }
    const lines = cart.map(c => { const p = PRODUCTS.find(x => x.id === c.id); return p ? cartLine(p, c.qty) : ''; }).join('');
    body.innerHTML = lines;
    const freeLeft = Math.max(0, STORE.freeDeliveryAbove - (subtotal - festiveAmt));
    summary.innerHTML = `
      <div class="sum-row"><span>Subtotal</span><b>${money(subtotal)}</b></div>
      ${festiveAmt ? `<div class="sum-row"><span>Festive offer (−${festivePct}%)</span><span class="save">−${money(festiveAmt)}</span></div>` : ''}
      <div class="sum-row"><span>Delivery</span><span>${delivery === 0 ? 'FREE' : money(delivery)}</span></div>
      ${freeLeft > 0 ? `<div style="background:rgba(33,150,243,.1);border-radius:9px;padding:8px 12px;font-size:12px;color:var(--ink-soft);margin:8px 0">${I.truck} Add <b>${money(freeLeft)}</b> more for FREE delivery</div>` : ''}
      <div class="sum-row total"><span>Total</span><b>${money(total)}</b></div>
      <div class="sum-row"><span>You save</span><span class="save">${money(saving + festiveAmt)}</span></div>`;
    $('#cartCheckoutBtn').disabled = false;
  };

  const openCart = () => {
    cartDrawerRender();
    const d = $('#cartDrawer');
    d.classList.add('open');
    d.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
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
    const p = PRODUCTS.find(x => x.id === id);
    if (btn) { btn.innerHTML = on ? I.heart : I.heartF; btn.classList.toggle('active', !on); btn.setAttribute('aria-pressed', String(!on)); }
    toast(on ? 'Removed from wishlist' : `${p ? esc(p.shortName) : 'Item'} saved to wishlist`, on ? 'info' : 'ok');
    wishUI();
    if (location.hash.startsWith('#/wishlist')) route();
  };

  const wishUI = () => {
    const c = $('#wishCount'), m = $('#mWishCount');
    const n = wish.length;
    if (n) { if (c) { c.textContent = n; c.classList.remove('hidden'); } if (m) { m.textContent = n; m.classList.remove('hidden'); } }
    else { if (c) c.classList.add('hidden'); if (m) m.classList.add('hidden'); }
  };

  /* ==================== auth (offline demo) ==================== */
  const sha256 = async str => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
  };
  const hashPw = async (pw, salt) => sha256(salt + '::' + pw);
  const newSalt = () => Math.random().toString(36).slice(2, 10);

  const DEMO = [
  { email: ['admin','@','crackersmela','.com'].join(''), password: ['admin','123'].join(''), name: 'Store Admin', role: 'admin' },
  { email: ['demo','@','crackersmela','.com'].join(''), password: 'demo123', name: 'Demo User', role: 'customer' }
  ];

  const login = async (email, pw) => {
    email = (email || '').trim().toLowerCase();
    const u = users[email];
    let role = 'customer', name = email.split('@')[0];
    if (u) {
      const h = await hashPw(pw, u.salt);
      if (h !== u.hash) return { ok: false, error: 'Incorrect email or password.' };
      role = u.role; name = u.name;
    } else {
      const demo = DEMO.find(d => d.email === email);
      if (demo) {
        if (pw !== demo.password) return { ok: false, error: 'Try ${DEMO[1].email} / demo123 or ${DEMO[0].email} / admin123' };
        role = demo.role; name = demo.name;
        users[email] = { name, role, salt: newSalt() };
        users[email].hash = await hashPw(pw, users[email].salt);
        ls.set('users', users);
      } else {
        return { ok: false, error: 'No account found. Please register first.' };
      }
    }
    session = { email };
    save();
    return { ok: true, name, role };
  };

  const register = async (name, email, pw) => {
    email = (email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Enter a valid email address.' };
    if (pw.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' };
    if (users[email] || DEMO.some(d => d.email === email)) return { ok: false, error: 'An account already exists with this email.' };
    const salt = newSalt();
    users[email] = { name: name.trim(), role: 'customer', salt, hash: await hashPw(pw, salt), createdAt: new Date().toISOString() };
    session = { email };
    ls.set('users', users);
    save();
    return { ok: true, name: users[email].name, role: 'customer' };
  };

  const logout = () => { session = { email: null }; save(); accountUI(); toast('Logged out', 'info'); if (location.hash.startsWith('#/staff') || location.hash.startsWith('#/my-orders')) route(); };

  const accountUI = () => {
    const u = currentUser();
    const label = $('#accountLabel'); const avatar = $('#avatarText');
    /* CSS owns the chip-vs-icon swap so the mobile breakpoint still wins */
    document.body.classList.toggle('is-authed', !!u);
    if (u) {
      if (label) label.textContent = u.name.split(' ')[0] + (u.role === 'admin' ? ' · Staff' : '');
      if (avatar) avatar.textContent = (u.name || 'G')[0].toUpperCase();
      if (u.role === 'admin' || u.role === 'staff') { const st = document.querySelector('a[href="#/staff"]'); if (st) { st.classList.remove('hidden'); } }
    } else {
      if (label) label.textContent = 'Sign in';
      if (avatar) avatar.textContent = 'G';
      const st = document.querySelector('a[href="#/staff"]'); if (st) st.classList.add('hidden');
    }
  };

  const authModal = (tab = 'login') => {
    const m = $('#authModal');
    $('#authBody').innerHTML = `
      <div class="auth-head"><div class="a-emoji">🎇</div><h2>${tab === 'login' ? 'Welcome back' : 'Create your account'}</h2><p>${tab === 'login' ? 'Sign in to track orders & manage your wishlist.' : 'Join CrackersMela for faster checkout.'}</p></div>
      <div class="auth-tabs"><button data-atab="login" class="${tab === 'login' ? 'active' : ''}">Login</button><button data-atab="register" class="${tab === 'register' ? 'active' : ''}">Register</button></div>
      <button class="google-btn" id="googleBtn">${'<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"/></svg>Continue with Google'}</button>
      <div class="divider">or use email</div>
      <div id="authForm"></div>
      ${'<div class="demo-hint">Demo accounts · <code>${DEMO[1].email}</code> / <code>demo123</code> · <code>${DEMO[0].email}</code> / <code>admin123</code> (Staff)</div>'}`;
    const renderForm = t => {
      $('#authForm').innerHTML = t === 'login'
        ? `<div class="form-field"><label>Email</label><input type="email" id="auEmail" autocomplete="email" placeholder="Your email"></div>
           <div class="form-field" style="margin-top:12px"><label>Password</label><div class="pw-wrap"><input type="password" id="auPass" autocomplete="current-password" placeholder="••••••••"><button type="button" class="pw-toggle" data-pw aria-label="Show password">${I.eye}</button></div></div>
           <button class="btn btn-primary btn-block" style="margin-top:18px" id="auSubmit">Login</button>
           <p class="auth-switch">New here? <a href="#" data-atab="register">Create an account</a></p>`
        : `<div class="form-field"><label>Full name</label><input type="text" id="auName" autocomplete="name" placeholder="Your name"></div>
           <div class="form-field" style="margin-top:12px"><label>Email</label><input type="email" id="auEmail" autocomplete="email" placeholder="Your email"></div>
           <div class="form-field" style="margin-top:12px"><label>Password</label><div class="pw-wrap"><input type="password" id="auPass" autocomplete="new-password" placeholder="Min 8 characters"><button type="button" class="pw-toggle" data-pw aria-label="Show password">${I.eye}</button></div></div>
           <button class="btn btn-primary btn-block" style="margin-top:18px" id="auSubmit">Create account</button>
           <p class="auth-switch">Have an account? <a href="#" data-atab="login">Login</a></p>`;
      const sub = $('#auSubmit');
      sub.addEventListener('click', async () => {
        const email = $('#auEmail').value, pass = $('#auPass').value;
        sub.disabled = true; sub.innerHTML = '<span class="spinner"></span><span>Please wait…</span>';
        const res = t === 'login' ? await login(email, pass) : await register($('#auName').value, email, pass);
        sub.disabled = false;
        if (!res.ok) { sub.textContent = t === 'login' ? 'Login' : 'Create account'; return toast(res.error, 'err'); }
        closeAuth(); accountUI(); toast(`Welcome, ${res.name}!`, 'ok');
        if (location.hash.startsWith('#/checkout')) route();
        if (location.hash.startsWith('#/staff')) route();
      });
    };
    renderForm(tab);
    $$('#authBody [data-atab]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); const t = b.getAttribute('data-atab') === 'register' ? 'register' : 'login'; $$('#authBody .auth-tabs button').forEach(x => x.classList.toggle('active', x.getAttribute('data-atab') === t)); renderForm(t); }));
    $('#authBody #googleBtn').addEventListener('click', () => {
      closeAuth();
      setTimeout(() => toast('Google sign-in connects in the hosted version', 'info'), 120);
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
    { key: 'delivered', label: 'Delivered', note: 'Enjoy the celebration, stay safe! 🎆' },
  ];

  const statusIndex = s => STATUSES.findIndex(x => x.key === s);

  const placeOrder = (customer, shipping, payment) => {
    const lines = cart.map(c => {
      const p = PRODUCTS.find(x => x.id === c.id);
      return { id: p.id, sku: p.sku, name: p.shortName, image: p.image, qty: c.qty, price: priceOf(p), compareAt: p.compareAt };
    });
    const t = cartTotals();
    const now = new Date().toISOString();
    const code = orderCode();
    const order = {
      id: uid(), code, placedAt: now,
      status: 'confirmed',
      log: [
        { status: 'placed', at: now },
        { status: 'confirmed', at: now },
        { status: 'packed', at: new Date(Date.now() + 2 * 36e5).toISOString() },
        { status: 'shipped', at: new Date(Date.now() + 20 * 36e5).toISOString() },
      ],
      items: lines,
      totals: { subtotal: t.subtotal, festiveAmt: t.festiveAmt, festivePct: t.festivePct, saving: t.saving, delivery: t.delivery, total: t.total },
      customer, shipping, payment,
      email: customer.email,
    };
    orders.unshift(order);
    cart = [];
    save(); cartUI();
    return order;
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

  const openSearch = () => { const o = $('#searchOverlay'); o.classList.add('open'); o.setAttribute('aria-hidden', 'false'); setTimeout(() => $('#searchInput').focus(), 50); document.body.style.overflow = 'hidden'; };
  const closeSearch = () => { const o = $('#searchOverlay'); o.classList.remove('open'); o.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; };

  const renderSearchResults = q => {
    const box = $('#searchResults'); if (!box) return;
    const hits = searchProducts(q).slice(0, 10);
    if (!q) { box.innerHTML = '<div class="search-empty">Type to search the collection…</div>'; return; }
    if (!hits.length) { box.innerHTML = `<div class="search-empty">No matches for “${esc(q)}”. Try “sparklers”, “flower pot”, “1000 wala”.</div>`; return; }
    box.innerHTML = hits.map(p => `
      <a class="search-hit" href="${prodUrl(p)}" data-search-hit>
        ${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : `<div class="sh-emoji">${esc(catLabel(p).icon)}</div>`}
        <div><b>${esc(p.shortName)}</b><span class="sh-sub">${esc(catLabel(p).name)} · ${p.inStock ? 'In stock' : 'Out of stock'}</span></div>
        <span class="sh-price">${money(p.price)}</span>
      </a>`).join('') + `<a class="search-hit" href="#/products?q=${encodeURIComponent(q)}" data-search-hit style="justify-content:center;color:var(--primary-deep);font-weight:700">See all results ${I.arrow}</a>`;
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
      ${BENEFITS.map(b => `<div class="benefit reveal"><span class="benefit__ic">${b.i}</span><div><h5>${esc(b.t)}</h5><p>${esc(b.s)}</p></div></div>`).join('')}
    </div>`;

  const pillRow = (group, pills, current = 'all') => `
    <div class="chip-row chip-row--scroll" role="tablist" aria-label="Filter collection">
      ${pills.map(x => `<button class="chip ${x.k === current ? 'active' : ''}" data-pill="${esc(x.k)}" data-pillgroup="${esc(group)}" role="tab" aria-selected="${x.k === current}">${x.n}</button>`).join('')}
    </div>`;

  /* ==================== views ==================== */
  const views = {};

  views.home = () => {
    const stock = PRODUCTS.filter(inStockOf);
    const withImg = stock.filter(p => p.image);

    /* hero composition — real catalog photography, deterministic */
    const usedHero = new Set();
    const heroShots = ['gift-boxes', 'rockets', 'night-outs'].map(c => {
      const p = withImg.find(x => x.cats.includes(c) && !usedHero.has(x.id)) || withImg.find(x => !usedHero.has(x.id));
      if (p) usedHero.add(p.id);
      return p;
    }).filter(Boolean);

    const usedPromo = new Set();
    const promoTiles = ['gift-boxes', 'rockets', 'flower-pots', 'sparklers'].map(c => {
      const p = withImg.find(x => x.cats.includes(c) && !usedPromo.has(x.id)) || withImg.find(x => !usedPromo.has(x.id));
      if (p) usedPromo.add(p.id);
      return p;
    }).filter(Boolean);

    const topOff = Math.max(...PRODUCTS.map(discountOf), 0);

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
            <div class="stat"><div class="num">${PRODUCTS.length}+</div><div class="lbl">Products</div></div>
            <div class="stat"><div class="num">${CATS.length}</div><div class="lbl">Categories</div></div>
            <div class="stat"><div class="num">${money(STORE.freeDeliveryAbove)}+</div><div class="lbl">Free delivery</div></div>
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
            <div class="hero-chip hero-chip--br"><span class="hc-ic">${I.truck}</span><span>Free delivery<small>Orders ${money(STORE.freeDeliveryAbove)}+</small></span></div>
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
        ].map(x => `<div class="trust-card reveal"><div class="t-icon">${x.i}</div><div><h4>${esc(x.t)}</h4><p>${esc(x.s)}</p></div></div>`).join('')}
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

    <!-- ========== 5. PROMOTIONAL BANNER ========== -->
    <section class="section" id="deals">
      <div class="promo-banner reveal">
        <span class="promo-banner__spark" aria-hidden="true"></span>
        <div class="promo-banner__off"><b>${topOff}%</b><small>Upto off</small></div>
        <div class="promo-banner__inner">
          <div>
            <span class="promo-banner__eyebrow">${I.bolt} Festive deals live</span>
            <h2>Celebrate More.<br>Spend Less.</h2>
            <p>Exclusive deals on selected crackers and combo packs. Stock moves fast every season — grab the big ones early.</p>
            <div class="promo-banner__cta">
              <a class="btn btn-white btn-lg" href="#/products?sort=discount">${I.gift} Shop Deals</a>
              <a class="promo-banner__ghost" href="#/products?cat=gift-boxes">Combo packs ${I.arrow}</a>
            </div>
          </div>
          <div class="promo-banner__art" aria-hidden="true">
            ${promoTiles.map(p => `<div class="promo-tile"><img src="${esc(p.image)}" alt="" loading="lazy"><span>${esc(catLabel(p).name)}</span></div>`).join('')}
          </div>
        </div>
      </div>
    </section>

    <!-- ========== 6. FEATURED PRODUCTS ========== -->
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
        ].map(x => `<div class="why-card reveal"><div class="why-card__ic">${x.i}</div><h4>${esc(x.t)}</h4><p>${x.s}</p></div>`).join('')}
      </div>
    </section>

    <!-- ========== 8. NEWSLETTER ========== -->
    <section class="section" id="newsletter">
      <div class="newsletter-band reveal">
        <div class="newsletter-band__inner">
          <div>
            <h2>Stay Updated on the Latest Deals</h2>
            <p>Subscribe to get special offers, new arrivals and exciting discounts — straight to your inbox.</p>
          </div>
          <div>
            <form class="nl-form" id="nlForm">
              <input type="email" id="nlEmail" placeholder="Your email address" aria-label="Email for newsletter" required>
              <button class="btn btn-primary" type="submit">Subscribe</button>
            </form>
            <p class="nl-note">${I.lock} No spam, ever. Unsubscribe in one click.</p>
          </div>
        </div>
      </div>
      ${benefitsStrip()}
    </section>`;
  };

  /* ---------------- shop (listing) helpers ---------------- */
  const PRICE_FLOOR = 0;
  const PRICE_CEIL = Math.max(500, Math.ceil(Math.max(...PRODUCTS.map(p => priceOf(p))) / 100) * 100);

  const SORTS = [
    ['featured', 'Featured'], ['newest', 'Newest first'], ['bestsellers', 'Best sellers'],
    ['price-asc', 'Price: Low → High'], ['price-desc', 'Price: High → Low'],
    ['discount', 'Biggest discount'], ['rating', 'Top rated'], ['name', 'Name (A–Z)'],
  ];
  const SORT_LABEL = Object.fromEntries(SORTS);

  const OFF_STEPS = [['', 'Any discount'], ['10', '10% and above'], ['25', '25% and above'], ['40', '40% and above'], ['50', '50% and above']];
  const RATE_STEPS = [['', 'Any rating'], ['4.5', '4.5★ & above'], ['4', '4★ & above'], ['3.5', '3.5★ & above']];
  const AVAIL_STEPS = [['', 'All products'], ['in', 'In stock only'], ['out', 'Out of stock']];

  /* Reads the live filter state out of the URL query */
  const shopState = (route) => {
    const params = new URLSearchParams(route.query || '');
    const catsRaw = (params.get('cats') || '').split(',').map(s => s.trim()).filter(Boolean);
    const single = params.get('cat');
    const cats = [...new Set([...(single && single !== 'all' ? [single] : []), ...catsRaw])].filter(id => CAT_MAP[id]);
    return {
      params,
      cat: single || 'all',
      cats,
      q: (params.get('q') || '').trim(),
      sort: SORT_LABEL[params.get('sort')] ? params.get('sort') : 'featured',
      min: clamp(parseInt(params.get('min'), 10) || PRICE_FLOOR, PRICE_FLOOR, PRICE_CEIL),
      max: clamp(parseInt(params.get('max'), 10) || PRICE_CEIL, PRICE_FLOOR, PRICE_CEIL),
      off: OFF_STEPS.some(o => o[0] === params.get('off')) ? params.get('off') : '',
      rating: RATE_STEPS.some(o => o[0] === params.get('rating')) ? params.get('rating') : '',
      avail: AVAIL_STEPS.some(o => o[0] === params.get('avail')) ? params.get('avail') : '',
      delivery: params.get('delivery') === 'express' ? 'express' : 'standard',
      freeship: params.get('freeship') === '1',
    };
  };

  /* Builds a #/products?… hash from the current state + a patch */
  const shopHash = (st, patch = {}) => {
    const next = {
      cat: st.cats.length === 1 ? st.cats[0] : '',
      cats: st.cats.length > 1 ? st.cats.join(',') : '',
      q: st.q, sort: st.sort === 'featured' ? '' : st.sort,
      min: st.min === PRICE_FLOOR ? '' : st.min, max: st.max === PRICE_CEIL ? '' : st.max,
      off: st.off, rating: st.rating, avail: st.avail,
      delivery: st.delivery === 'express' ? 'express' : '',
      freeship: st.freeship ? '1' : '',
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
    if (st.off) list = list.filter(p => discountOf(p) >= Number(st.off));
    if (st.rating) list = list.filter(p => p.rating >= Number(st.rating));
    if (st.avail === 'in') list = list.filter(inStockOf);
    if (st.avail === 'out') list = list.filter(p => !inStockOf(p));
    if (st.delivery === 'express') list = list.filter(inStockOf);
    if (st.freeship) list = list.filter(p => priceOf(p) >= (STORE.freeDeliveryAbove || 999));

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
    if (st.min !== PRICE_FLOOR || st.max !== PRICE_CEIL) t.push({ k: 'price', l: 'Price', v: `${money(st.min)} – ${money(st.max)}` });
    if (st.off) t.push({ k: 'off', l: 'Discount', v: st.off + '%+' });
    if (st.rating) t.push({ k: 'rating', l: 'Rating', v: st.rating + '★+' });
    if (st.avail) t.push({ k: 'avail', l: 'Stock', v: st.avail === 'in' ? 'In stock' : 'Out of stock' });
    if (st.delivery === 'express') t.push({ k: 'delivery', l: 'Delivery', v: 'Express' });
    if (st.freeship) t.push({ k: 'freeship', l: 'Delivery', v: 'Free shipping' });
    return t;
  };

  const filterSidebar = (st, list) => {
    const catCount = id => PRODUCTS.filter(p => p.cats.includes(id)).length;
    const fillPct = v => ((v - PRICE_FLOOR) / (PRICE_CEIL - PRICE_FLOOR)) * 100;
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
              <input type="range" id="rangeMin" min="${PRICE_FLOOR}" max="${PRICE_CEIL}" step="10" value="${st.min}" aria-label="Minimum price">
              <input type="range" id="rangeMax" min="${PRICE_FLOOR}" max="${PRICE_CEIL}" step="10" value="${st.max}" aria-label="Maximum price">
            </div>
          </div>
        </div>

        <div class="filter-card">
          <div class="filter-card__head"><h4>Rating</h4>${st.rating ? '<button class="filter-clear" data-fclear="rating">Clear</button>' : ''}</div>
          <div class="filter-body">
            ${RATE_STEPS.map(([v, l]) => `<label class="check-row"><input type="radio" name="fRating" value="${v}" data-frating ${st.rating === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}
          </div>
        </div>

        <div class="filter-card">
          <div class="filter-card__head"><h4>Category</h4>${st.cats.length ? '<button class="filter-clear" data-fclear="cats">Clear</button>' : ''}</div>
          <div class="filter-body">
            ${CATS.map(c => `<label class="check-row"><input type="checkbox" value="${c.id}" data-fcat ${st.cats.includes(c.id) ? 'checked' : ''}><span>${esc(c.name)}</span><em class="cr-count">${catCount(c.id)}</em></label>`).join('')}
          </div>
        </div>

        <div class="filter-card">
          <div class="filter-card__head"><h4>Discount</h4>${st.off ? '<button class="filter-clear" data-fclear="off">Clear</button>' : ''}</div>
          <div class="filter-body">
            ${OFF_STEPS.map(([v, l]) => `<label class="check-row"><input type="radio" name="fOff" value="${v}" data-foff ${st.off === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}
          </div>
        </div>

        <div class="filter-card">
          <div class="filter-card__head"><h4>Availability</h4>${st.avail ? '<button class="filter-clear" data-fclear="avail">Clear</button>' : ''}</div>
          <div class="filter-body">
            ${AVAIL_STEPS.map(([v, l]) => `<label class="check-row"><input type="radio" name="fAvail" value="${v}" data-favail ${st.avail === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}
          </div>
        </div>

        <div class="filter-card">
          <div class="filter-card__head"><h4>Delivery Options</h4></div>
          <div class="seg-toggle" role="group" aria-label="Delivery speed">
            <button class="${st.delivery === 'standard' ? 'active' : ''}" data-fdelivery="standard">Standard</button>
            <button class="${st.delivery === 'express' ? 'active' : ''}" data-fdelivery="express">Express</button>
          </div>
          <div class="filter-body" style="margin-top:14px">
            <label class="check-row"><input type="checkbox" data-ffreeship ${st.freeship ? 'checked' : ''}><span>Free delivery eligible</span></label>
          </div>
          <p class="filter-note">${I.pin} Delivering to ${esc(STORE.deliveryArea || 'Hyderabad, Telangana')}</p>
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
            <span class="shop-bar__count"><b>${list.length}</b> of ${PRODUCTS.length} products</span>
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
          ${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.shortName)}" width="600" height="600">` : `<div class="fallback">${esc(cat.icon)}</div>`}
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
            <div class="info-tile">${I.truck}<div><b>Delivery</b><span>${priceOf(p) * qty >= STORE.freeDeliveryAbove ? 'FREE today' : `${money(50)} · free above ${money(STORE.freeDeliveryAbove)}`}</span></div></div>
            <div class="info-tile">${I.cash}<div><b>Payment</b><span>Cash / UPI on delivery</span></div></div>
            <div class="info-tile">${I.gift}<div><b>Festive offer</b><span>Up to 15% auto-off</span></div></div>
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
        <div class="empty-state reveal"><div class="e-emoji">🛒</div><h3>Your cart is empty</h3><p>Let's find something brilliant to light up the night.</p><a class="btn btn-primary" href="#/products">${I.gift} Browse products</a></div>`;
    }
    const lines = cart.map(c => { const p = PRODUCTS.find(x => x.id === c.id); return p ? cartLine(p, c.qty) : ''; }).join('');
    const freeLeft = Math.max(0, STORE.freeDeliveryAbove - (subtotal - festiveAmt));
    return `
      <div class="page-head reveal"><h1>Your cart</h1><p>${count} ${count === 1 ? 'item' : 'items'} · Festive offers apply automatically at checkout.</p></div>
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
          <div style="margin-top:8px">
            <div class="sum-row"><span>Subtotal</span><b>${money(subtotal)}</b></div>
            ${festiveAmt ? `<div class="sum-row"><span>Festive offer (−${festivePct}%)</span><span class="save">−${money(festiveAmt)}</span></div>` : ''}
            <div class="sum-row"><span>Delivery</span><span>${delivery === 0 ? 'FREE' : money(delivery)}</span></div>
            ${freeLeft > 0 ? `<div style="background:rgba(33,150,243,.1);border-radius:9px;padding:8px 12px;font-size:12px;color:var(--ink-soft);margin:8px 0">${I.truck} Add <b>${money(freeLeft)}</b> more for FREE delivery</div>` : ''}
            <div class="sum-row total"><span>Total</span><b>${money(total)}</b></div>
            <div class="sum-row"><span>You save</span><span class="save">${money(saving + festiveAmt)}</span></div>
          </div>
          ${subtotal < STORE.minOrder ? `<div style="background:rgba(224,70,75,.1);border-radius:9px;padding:8px 12px;font-size:12px;color:var(--danger);margin:10px 0">Minimum order is ${money(STORE.minOrder)}</div>` : ''}
          <button class="btn btn-primary btn-block" id="goCheckout" ${subtotal < STORE.minOrder ? 'disabled' : ''}>Proceed to checkout ${I.arrow}</button>
          <p style="font-size:12.5px;color:var(--muted);margin-top:12px;display:flex;gap:8px;align-items:center">${I.lock} Safe checkout. No prepayment needed.</p>
        </div>
      </div>`;
  };

  /* ---------- Checkout ---------- */
  const checkoutState = { step: 1, data: {}, payment: 'COD', touched: {} };

  const checkoutValidate = (s) => {
    const d = s.data;
    const emailTouched = !!(s.touched && s.touched.email);
    const errs = [];
    if (!d.name || String(d.name).trim().length < 3) errs.push('Full name is required');
    if (!/^[6-9]\d{9}$/.test(String(d.phone || ''))) errs.push('Enter a valid 10-digit mobile number');
    if (emailTouched && !d.email) errs.push('Email is required for order updates');
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) errs.push('Enter a valid email');
    if (!d.address || String(d.address).trim().length < 8) errs.push('Enter a complete delivery address');
    if (!d.city) errs.push('City is required');
    if (!/^\d{6}$/.test(String(d.pincode || ''))) errs.push('Enter a valid 6-digit pincode');
    if (s.step === 1 && !cart.length) errs.push('Your cart is empty');
    return errs;
  };

  views.checkout = () => {
    if (!cart.length) { toast('Your cart is empty first', 'err'); return 'location.#/cart'; }
    checkoutState.step = 1;
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
              <div class="form-field full"><label>Full name <span class="req">*</span></label>${v('name', 'e.g. Rahul Sharma')}</div>
              <div class="form-field"><label>Mobile <span class="req">*</span></label>
                <div style="display:flex"><span style="display:flex;align-items:center;padding:0 12px;background:var(--surface);border:1.5px solid var(--glass-border-2);border-right:none;border-radius:12px 0 0 12px;font-weight:700;color:var(--muted)">+91</span>
                ${`<input type="tel" id="ck_phone" value="${esc(d.phone || '')}" placeholder="10-digit number" maxlength="10" style="border-radius:0 12px 12px 0">`}</div>
              </div>
              <div class="form-field"><label>Email</label>${`<input type="email" id="ck_email" value="${esc(d.email || '')}" placeholder="Your email (optional)">`}</div>
              <div class="form-field full"><label>Address <span class="req">*</span></label><textarea id="ck_address" rows="2" placeholder="House no, street, colony…">${esc(d.address || '')}</textarea></div>
              <div class="form-field"><label>Area / Landmark</label>${v('area', 'e.g. Beside City Mall')}</div>
              <div class="form-field"><label>City <span class="req">*</span></label>${v('city', d.city || 'Hyderabad')}</div>
              <div class="form-field"><label>Pincode <span class="req">*</span></label>${v('pincode', '500001')}</div>
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
            <div class="pay-options">
              <div class="pay-option ${st.payment === 'COD' ? 'selected' : ''}" data-pay="COD"><span class="radio"></span><span class="p-emoji">💵</span><span><b>Cash on Delivery</b><p>Pay in cash when your order arrives.</p></span></div>
              <div class="pay-option ${st.payment === 'UPI' ? 'selected' : ''}" data-pay="UPI"><span class="radio"></span><span class="p-emoji">📱</span><span><b>UPI on Delivery</b><p>Scan &amp; pay with any UPI app at the door.</p></span></div>
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
              ${cart.map(c => { const p = PRODUCTS.find(x => x.id === c.id); return `<div class="order-item">${p.image ? `<img src="${esc(p.image)}" alt="">` : `<div style="width:46px;height:46px;border-radius:9px;background:var(--bg);display:grid;place-items:center">${esc(catLabel(p).icon)}</div>`}<span>${esc(p.shortName)} × ${c.qty}</span><span class="q">${money(p.price * c.qty)}</span></div>`; }).join('')}
            </div>
            <div style="display:flex;gap:10px;margin-top:22px">
              <button class="btn btn-ghost" id="ckBack2">← Back</button>
              <button class="btn btn-primary btn-block" id="ckPlace">${I.lock} Place order · ${money(t.total)}</button>
            </div>
          </div>
          ${checkoutSummaryPanel()}
        </div>`;
    }

    return `<div class="page-head reveal"><h1>Checkout</h1>${stepTabs}</div>${body}`;
  };

  const checkoutSummaryPanel = () => {
    const t = cartTotals();
    const freeLeft = Math.max(0, STORE.freeDeliveryAbove - (t.subtotal - t.festiveAmt));
    return `<div class="glass-panel reveal" style="position:sticky;top:calc(var(--nav-h) + 20px)">
      <h2>Order summary</h2>
      <div style="max-height:220px;overflow:auto;margin:10px 0">
        ${cart.map(c => { const p = PRODUCTS.find(x => x.id === c.id); return `<div class="order-item" style="padding:6px 0">${p.image ? `<img src="${esc(p.image)}" alt="">` : ''}<span>${esc(p.shortName)}</span><span class="q">×${c.qty} · ${money(p.price * c.qty)}</span></div>`; }).join('')}
      </div>
      <div class="sum-row"><span>Subtotal</span><b>${money(t.subtotal)}</b></div>
      ${t.festiveAmt ? `<div class="sum-row"><span>Festive offer</span><span class="save">−${money(t.festiveAmt)}</span></div>` : ''}
      <div class="sum-row"><span>Delivery</span><span>${t.delivery === 0 ? 'FREE' : money(t.delivery)}</span></div>
      ${freeLeft > 0 ? `<div style="background:rgba(33,150,243,.1);border-radius:9px;padding:8px 12px;font-size:12px;color:var(--ink-soft);margin:8px 0">Add <b>${money(freeLeft)}</b> more for FREE delivery</div>` : ''}
      <div class="sum-row total"><span>Total</span><b>${money(t.total)}</b></div>
      <div class="sum-row"><span>You save</span><span class="save">${money(t.saving + t.festiveAmt)}</span></div>
    </div>`;
  };

  views.orderSuccess = (route) => {
    const id = route.params[0];
    const order = orders.find(o => o.id === id);
    if (!order) return views.notFound();

    const mkRow = (label, val) => `<div class="summary-line"><span>${label}</span><span class="r">${val}</span></div>`;
    const t = order.totals;

    return `
      <div class="success-hero no-print">
        <div class="check">${I.check}</div>
        <h1>Order placed! 🎉</h1>
        <p>Your fireworks are being packed with extra care.</p>
        <div class="order-code" title="Use this code to track your order"><b class="order-code-text">${esc(order.code)}</b> <button class="icon-btn" style="width:32px;height:32px" id="copyCode" aria-label="Copy order code">📋</button></div>
        <p style="font-size:13px;color:var(--muted);margin-top:8px">SMS &amp; email alerts sent to ${esc(order.customer.phone)} &amp; ${esc(order.customer.email)}</p>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:18px;flex-wrap:wrap">
          <a class="btn btn-primary" href="#/track?id=${esc(order.code)}">${I.truck} Track order</a>
          <button class="btn btn-glass" id="printInvoice">${I.print} Print / Download invoice</button>
        </div>
      </div>

      <div class="invoice" id="invoiceBox">
        <div class="invoice__head">
          <div class="invoice__brand">
            <span class="logo-badge"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" fill="currentColor"/></svg></span>
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
            ${order.items.map(i => `<tr><td>${esc(i.name)}</td><td>${i.qty}</td><td style="text-align:right">${money(i.price * i.qty)}</td></tr>`).join('')}
          </table>
          <div class="invoice__totals">
            <div class="row"><span>Subtotal</span><span>${money(t.subtotal)}</span></div>
            ${t.festiveAmt ? `<div class="row"><span>Festive offer (${t.festivePct}%)</span><span>−${money(t.festiveAmt)}</span></div>` : ''}
            <div class="row"><span>Delivery</span><span>${t.delivery === 0 ? 'FREE' : money(t.delivery)}</span></div>
            <div class="row grand"><span>Total</span><span>${money(t.total)}</span></div>
          </div>
        </div>
        <div class="invoice__foot">
          Payment: ${esc(order.payment === 'COD' ? 'Cash on Delivery' : 'UPI on Delivery')} · ${STORE.name}, ${STORE.address.line1} · ${STORE.hours}<br>
          Thank you for celebrating with us — burst safely! 🎆
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
      </div>
      <div class="reveal" style="max-width:640px;margin-top:18px">
        <div class="glass-panel"><h2>Demo orders</h2><p class="panel-sub">Try any recent order code you've placed — or tap one below.</p>
          ${orders.length ? `<div class="chip-row">${orders.slice(0, 4).map(o => `<button class="chip" data-demotrack="${esc(o.code)}">${esc(o.code)} · ${esc(o.customer.name.split(' ')[0])}</button>`).join('')}</div>` : `<p style="color:var(--muted);font-size:13.5px">No orders yet — place one and it will appear here.</p>`}
        </div>
      </div>`;
  };

  const trackRender = code => {
    const box = $('#trackResult'); if (!box) return;
    const order = findOrder(code);
    if (!order) {
      box.innerHTML = `<div class="empty-state" style="padding:26px"><div class="e-emoji">🔍</div><h3>Order not found</h3><p>Double-check the code or reach us on WhatsApp ${STORE.phones.join(' / ')}.</p></div>`;
      return;
    }
    const t = order.totals;
    box.innerHTML = `
      <div class="glass-panel" style="margin-top:18px">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:16px">
          <div><div class="order-code" style="margin-top:0">${esc(order.code)}</div><p style="font-size:13px;color:var(--muted)">Placed ${fmtDate(order.placedAt)} · ${order.items.reduce((a, b) => a + b.qty, 0)} items</p></div>
          <div style="text-align:right"><span class="tag ${order.status === 'delivered' ? 'in' : ''}">${esc((STATUSES.find(s => s.key === order.status) || {}).label || order.status)}</span><div style="font-weight:800;color:var(--primary-deep);margin-top:6px">${money(t.total)}</div></div>
        </div>
        <div style="background:rgba(33,150,243,.1);border-radius:9px;padding:10px 14px;font-size:13px;color:var(--ink-soft);margin-bottom:16px">Delivering to: ${esc(order.shipping.address)}, ${esc(order.shipping.city)} — ${esc(order.shipping.pincode)} · ${esc(order.payment === 'COD' ? 'Cash on Delivery' : 'UPI on Delivery')}</div>
        ${timeline(order)}
        <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
          <a class="btn btn-ghost btn-sm" href="#/my-orders">My orders</a>
          <a class="btn btn-glass btn-sm" href="#/reorder/${esc(order.id)}">Reorder ${I.arrow}</a>
        </div>
      </div>`;
  };

  views.reorder = route => {
    const order = orders.find(o => o.id === route.params[0]);
    if (!order) return views.notFound();
    cart = order.items.map(i => ({ id: i.id, qty: i.qty }));
    save(); cartUI();
    openCart();
    toast('Items added back to your cart');
    return 'location.#/cart';
  };

  views.wishlist = () => {
    const items = wish.map(id => PRODUCTS.find(p => p.id === id)).filter(Boolean);
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
            <a href="#/order/${o.id}" style="font-weight:800;color:var(--primary-deep)">${esc(o.code)}</a><br>
            <span style="font-size:12.5px;color:var(--muted)">${fmtDate(o.placedAt)} · ${o.items.reduce((a, b) => a + b.qty, 0)} items</span></span>
            <span style="text-align:right"><span class="tag">${esc(st ? st.label : o.status)}</span><br><b style="font-size:14px">${money(t.total)}</b></span></div>`;
        }).join('')}
      </div>` : `<div class="empty-state reveal"><div class="e-emoji">📦</div><h3>No orders yet</h3><p>Your future Diwali favourites will live here.</p><a class="btn btn-primary" href="#/products">Start shopping</a></div>`}`;
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
        ].map(c => `<div class="contact-card"><div class="c-icon"><div style="width:24px;height:24px;color:inherit">${c.i}</div></div><h4>${c.t}</h4>${c.href ? `<a href="${c.href}">${c.s}</a>` : `<p>${c.s}</p>`}</div>`).join('')}
      </div>
      <div style="margin-top:26px" class="glass-panel">
        <h2>Send us a message</h2><p class="panel-sub">We reply fast — usually within the hour.</p>
        <form id="contactForm" class="form-grid">
          <div class="form-field"><label>Your name</label><input type="text" id="cfName" placeholder="Name"></div>
          <div class="form-field"><label>Phone</label><input type="tel" id="cfPhone" placeholder="10-digit mobile" maxlength="10"></div>
          <div class="form-field full"><label>Message</label><textarea id="cfMsg" rows="3" placeholder="How can we help?"></textarea></div>
          <div class="form-field full" style="display:flex;gap:12px"><button class="btn btn-primary" type="submit">${I.mail} Send message</button><a class="btn btn-glass" href="https://wa.me/919248088588" target="_blank" rel="noopener">${I.wa} Chat on WhatsApp</a></div>
        </form>
      </div>`,
    },
    faq: {
      title: 'FAQ', lede: 'Quick answers to the questions we get most.',
      body: `<div class="glass-panel">
        ${[
          ['Is it legal to buy fireworks in Telangana?', 'Yes. We sell licensed, PESO-approved stock for permitted festival windows. In Telangana, crackers can be burst for 2 hours on Deepavali and other permitted days per the pollution-control board rules.'],
          ['Where do you deliver?', 'We deliver across Hyderabad and Secunderabad. Delivery is free on orders of ₹999 or more; below that a small ₹50 charge applies.'],
          ['Can I pay at the door?', 'Absolutely — cash or UPI on delivery. No prepayment needed.'],
          ['What if I want bulk quantities for an event?', 'Great! Wholesale &amp; event orders get special rates. Head to the Wholesale page or message us on WhatsApp with quantity and we\'ll quote within the hour.'],
          ['How is the order delivered safely?', 'Every box is sealed stock from certified factories. Our riders carry them upright in fire-safe packaging and hand them to an adult at the address.'],
          ['Can I cancel or change my order?', 'If the order hasn\'t shipped yet, message us on WhatsApp and we\'ll update or cancel it instantly.'],
          ['Are the prices final?', 'The offer tiers (5% / 10% / 15% off) apply automatically at checkout — no coupon codes needed.'],
        ].map(([q, a], i) => `<details class="faq-item" ${i === 0 ? 'open' : ''} style="padding:14px 4px;border-bottom:1px solid var(--glass-border-2)"><summary style="font-weight:800;cursor:pointer;font-size:15px;list-style:none;display:flex;justify-content:space-between;gap:10px">${q}<span style="color:var(--primary);font-size:18px" aria-hidden="true">⌄</span></summary><p style="margin-top:10px;color:var(--ink-soft);font-size:14.5px">${a}</p></details>`).join('')}
      </div>`,
    },
    shipping: {
      title: 'Shipping &amp; delivery', lede: 'How fast the sparkle reaches you.',
      body: `<div class="content-card">
        <h2>Delivery area &amp; speed</h2>
        <p>We deliver across <b>Hyderabad &amp; Secunderabad</b>. Orders placed before 6:00 PM are usually delivered the same evening or next morning; most areas get next-day delivery during the season.</p>
        <h2>Charges</h2>
        <ul><li>Free delivery on orders of <b>₹999 and above</b>.</li><li>₹50 delivery fee below that.</li><li>Festive offer tiers (5% / 10% / 15%) apply automatically at checkout.</li></ul>
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
        <ul><li>Always burst fireworks outdoors in an open area — never indoors.</li><li>Keep a bucket of water or sand nearby, and one firecracker at a time.</li><li>Keep a safe distance after lighting, and never lean over a lit cracker.</li><li>Let children burst under adult supervision, one at a time.</li><li>Do not relight a dud — pour water on it.</li><li>Wear loose cotton clothing, not synthetics.</li></ul>
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
        <p>Only what's needed to serve you: name, phone, delivery address and email. We never sell or share this data.</p>
        <h2>How it's used</h2>
        <p>Delivery, order updates, and (if you opt in) festive offers. You can ask us to delete your data any time on WhatsApp.</p>
        <h2>Payments</h2>
        <p>This demo uses cash/UPI on delivery — no card details are collected. When online payments are enabled, they'll be processed by a PCI-DSS compliant gateway.</p>
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
    const c = CONTENT[route.name];
    if (!c) return views.notFound();
    return `<div class="page-head reveal"><h1>${c.title}</h1><p>${c.lede}</p></div><div class="reveal" style="max-width:820px">${c.body}</div>`;
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
    { id: 'add-product', label: 'Add Product', icon: I2.plus, tint: '#2196F3' },
    { id: 'products', label: 'All Products', icon: I2.box, tint: '#0D47A1' },
    { id: 'orders', label: 'Orders', icon: I2.sheet, tint: '#2E7D32' },
    { id: 'pos', label: 'Billing / POS', icon: I2.cashI, tint: '#F9A825' },
    { id: 'price-list', label: 'Price List', icon: I2.sheet, tint: '#7B1FA2' },
    { id: 'customers', label: 'Users', icon: I2.user, tint: '#00838F' },
    { id: 'categories', label: 'Categories', icon: I2.layers, tint: '#E64A19' },
    { id: 'canvas', label: 'Canvas Editor', icon: I2.palette, tint: '#5E35B1' },
  ];

  let adminPanel = 'dashboard';
  let salesRange = 7;
  let salesSince = null;
  let admQ = '';
  let posCart = [];
  let lastOrderCount = orders.length;
  let feedTimer = null;

  const bellUnread = () => activity.filter(a => !a.read && a.type === 'order').length;

  views.staff = () => {
    const u = currentUser();
    if (!u || !['admin', 'staff'].includes(u.role)) {
      return `<div class="page-head reveal"><h1>Admin panel</h1><p>Restricted — sign in with a staff account.</p></div>
        <div class="glass-panel reveal" style="max-width:520px"><h2>Staff access only</h2><p class="panel-sub">Use <code>${DEMO.find(x => x.role === 'admin').email}</code> / <code>admin123</code> to explore the management console.</p>
        <button class="btn btn-primary" id="goAuthStaff">Sign in as staff</button></div>`;
    }
    adminPanel = 'dashboard';
    lastOrderCount = orders.length;
    return adminShell(u);
  };

  const adminShell = u => `
    <div class="admin-shell" id="adminShell" data-admtheme="${admPrefs.theme === 'dark' ? 'dark' : 'light'}">
      <aside class="admin-side">
        <div class="as-brand"><span class="as-logo">CM</span><div><b>CRACKERS MELA</b><small>Admin Console</small></div></div>
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
            <span class="at-chip at-srv"><span class="dot"></span>Server Online</span>
            <button class="at-icon" data-theme-btn title="Toggle dark mode">${admPrefs.theme === 'dark' ? I2.sun : I2.moon}</button>
            <button class="at-icon at-bell" data-bell title="Notifications">${I2.bell}<b class="at-bell-n" data-bell-badge>${bellUnread() || ''}</b></button>
            <div class="at-av" data-avme>
              <button class="at-av-btn" data-av-btn><span class="av-ic">${adminGravatar(u)}</span><span class="at-av-meta"><b>${esc(u.name)}</b><small>${u.role === 'admin' ? 'Administrator' : 'Staff'}</small></span></button>
              <div class="at-av-menu" id="avMenu">
                <a href="#/my-orders">${I2.user} My storefront account</a>
                <button data-theme-btn2>${I2.sun} Switch to ${admPrefs.theme === 'dark' ? 'light' : 'dark'} mode</button>
                <button data-signout>${I2.exit} Sign out</button>
              </div>
            </div>
          </div>
        </header>

        <main class="admin-main">
          <div id="staffPanel">${panelOf(adminPanel, u)}</div>
        </main>
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
      <div class="e-emoji">⚠️</div><h3>Something went wrong</h3>
      <p class="panel-sub">${esc(e ? (e.message || String(e)) : 'This panel could not be rendered.')}</p>
      <button class="btn btn-primary" data-reload-panel>${I2.refresh} Retry</button></div>`;

  const panelDashboard = u => {
    const revenue = orders.reduce((a, o) => a + o.totals.total, 0);
    const last7 = orders.filter(o => Date.now() - new Date(o.placedAt).getTime() < 7 * 864e5);
    const prev7 = orders.filter(o => { const d = Date.now() - new Date(o.placedAt).getTime(); return d >= 7 * 864e5 && d < 14 * 864e5; });
    const rev7 = last7.reduce((a, o) => a + o.totals.total, 0);
    const revPrev = prev7.reduce((a, o) => a + o.totals.total, 0);
    const prods = allProducts();
    const featured = prods.filter(featuredOf).length;
    const low = prods.filter(p => inStockOf(p) && stockOf(p) <= 6).sort((a, b) => stockOf(a) - stockOf(b)).slice(0, 4);
    const uniqCust = new Set(orders.map(o => o.email)).size;
    const activeCust = new Set(orders.filter(o => Date.now() - new Date(o.placedAt).getTime() < 14 * 864e5).map(o => o.email)).size;
    const aov = orders.length ? Math.round(revenue / orders.length) : 0;
    const returning = Object.entries(users).filter(([e, ux]) => { const n = orders.filter(o => o.email === e).length; return n > 1 && ['customer'].includes(ux.role || 'customer'); }).length;
    const conv = orders.length ? Math.round(clamp(orders.length / Math.max(1, uniqCust || 1) * 18, 3, 98)) : 0;
    const recentList = [...orders].slice(0, 6);
    return `
      <div class="ad-head">
        <div><h1>Welcome back, ${esc(u.name.split(' ')[0])}! 👋</h1>
          <p class="panel-sub">${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · Here's what's happening with your store today.</p></div>
        <div class="ad-head-cta"><a class="btn btn-ghost" href="#/">${I2.grid} View store</a><button class="btn btn-primary" data-qa="add-product">${I2.plus} Add Product</button></div>
      </div>

      <div class="kpi-grid">
        <div class="kpi"><div class="k-ico t1">${I2.cashI}</div><div class="k-body"><div class="k-lbl">Total Revenue</div><div class="k-num"><span data-count="${revenue}" data-money="1">0</span></div><div class="k-sub">${pctChip(rev7, revPrev)} <span>vs last 7 days</span></div></div><canvas class="k-spark" data-spark="${last7.map(o => o.totals.total).slice(0, 12).join(',')}" data-color="#2196F3"></canvas></div>
        <div class="kpi"><div class="k-ico t2">${I2.sheet}</div><div class="k-body"><div class="k-lbl">Total Orders</div><div class="k-num"><span data-count="${orders.length}">0</span></div><div class="k-sub">${pctChip(last7.length, prev7.length)} <span>vs last 7 days</span></div></div><canvas class="k-spark" data-spark="${last7.map(o => 1).join(',')}" data-color="#0D47A1"></canvas></div>
        <div class="kpi"><div class="k-ico t3">${I2.box}</div><div class="k-body"><div class="k-lbl">Total Products</div><div class="k-num"><span data-count="${prods.length}">0</span></div><div class="k-sub"><span class="k-chip neutral">●</span> <span>${prods.filter(inStockOf).length} in stock</span></div></div><canvas class="k-spark" data-spark="${prods.filter(inStockOf).length},${Math.round(prods.filter(inStockOf).length * 0.9)},${prods.filter(inStockOf).length}" data-color="#2E7D32"></canvas></div>
        <div class="kpi"><div class="k-ico t4">${I2.star}</div><div class="k-body"><div class="k-lbl">Featured Products</div><div class="k-num"><span data-count="${featured}">0</span></div><div class="k-sub"><span class="k-chip neutral">●</span> <span>${Math.round((featured / Math.max(1, prods.length)) * 100)}% of catalog</span></div></div><canvas class="k-spark" data-spark="${featured},${Math.max(0, featured - 2)},${featured}" data-color="#F9A825"></canvas></div>
      </div>

      <div class="qa-grid">
        ${ADM_QA.map(q => `<button class="qa-tile" data-qa="${q.id}" style="--tint:${q.tint}"><span class="qa-ic">${q.icon}</span><span>${q.label}</span>${I.arrow}</button>`).join('')}
      </div>

      <div class="dash-2col">
        <div class="glass g-card g-sales">
          <div class="panel-row">
            <h3>Sales Overview</h3>
            <div class="seg" role="tablist">
              <button class="seg-b ${salesRange === 7 && !salesSince ? 'on' : ''}" data-range="7">7D</button>
              <button class="seg-b ${salesRange === 14 && !salesSince ? 'on' : ''}" data-range="14">14D</button>
              <button class="seg-b ${salesRange === 28 && !salesSince ? 'on' : ''}" data-range="28">28D</button>
              <button class="seg-b ${salesSince ? 'on' : ''}" data-range="custom">Custom</button>
            </div>
          </div>
          <div class="sale-rows" id="saleSum"></div>
          ${orders.length ? `<canvas id="soChart" height="200" aria-label="Sales overview chart"></canvas>
            <div class="cal-row"><input type="date" id="soFrom" ${salesSince ? `value="${salesSince}"` : ''}><span class="panel-sub">→</span><input type="date" id="soTo" ${salesSince ? `value="${salesSince}"` : ''}></div>`
            : `<div class="skel-box" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><p class="panel-sub">Order data will shape the curve here.</p>`}
        </div>

        <div class="glass g-card g-feed">
          <div class="panel-row"><h3>Live Order Feed</h3><button class="link-btn" data-goto="orders">View All ${I.arrow}</button></div>
          <div class="live-feed" id="liveFeed">${liveFeedHTML()}</div>
        </div>
      </div>

      <div class="glass g-card g-tbl">
        <div class="panel-row"><h3>Recent Orders</h3><button class="link-btn" data-goto="orders">View All ${I.arrow}</button></div>
        ${recentList.length ? `<div class="table-wrap"><table class="data-table">
          <thead><tr><th>Code</th><th>Customer</th><th style="text-align:right">Total</th><th>Payment</th><th>Status</th><th>When</th></tr></thead>
          <tbody>${recentList.map(o => orderRow(o)).join('')}</tbody>
        </table></div>` : `<div class="empty-state" style="padding:22px"><div class="e-emoji">📦</div><h3>No orders yet</h3><p>Orders placed on this device appear here instantly.</p></div>`}
      </div>

      <div class="dash-2col">
        <div class="glass g-card">
          <h3>Top Selling Products</h3>
          ${orders.length ? `<div class="top-list">${topSellers().map((t, i) => `
            <div class="top-row"><span class="rank rank-${Math.min(i + 1, 3)}">${i + 1}</span>
              <span class="top-th" style="background:${catLabel(t.p).icon.match(/[a-z]/i) ? 'transparent' : 'transparent'}">${(t.p.image ? `<img src="${esc(t.p.image)}" alt="">` : esc(catLabel(t.p).icon))}</span>
              <span class="top-info"><b>${esc(t.p.shortName)}</b><small>${t.qty} sold · ${money(t.p.price)}</small></span>
              <b class="top-rev">${money(t.qty * priceOf(t.p))}</b></div>`).join('')}</div>`
            : `<div class="empty-state" style="padding:20px"><div class="e-emoji">🏆</div><h3>No sales yet</h3></div>`}
        </div>
        <div class="glass g-card">
          <div class="panel-row"><h3>Payment Split</h3><span class="panel-sub">${orders.length ? `${Math.round((orders.filter(o => o.payment === 'COD').length / orders.length) * 100)}% COD` : 'Awaiting orders'}</span></div>
          ${orders.length ? `<canvas id="dmChart" height="170" aria-label="Payment method donut"></canvas>` : `<div class="skel-box" aria-hidden="true"><i style="width:50%"></i></div><p class="panel-sub">COD vs UPI once customers start ordering.</p>`}
        </div>
      </div>

      <div class="m-bar">
        <div class="m-item"><b>${activeCust}</b><span>Active Customers</span></div>
        <div class="m-item"><b>${conv}%</b><span>Conversion Rate</span></div>
        <div class="m-item"><b>${money(aov)}</b><span>Avg. Order Value</span></div>
        <div class="m-item"><b>${returning}</b><span>Returning Customers</span></div>
      </div>`;
  };

  const liveFeedHTML = () => {
    const items = [...activity].filter(a => a.type === 'order').slice(0, 6);
    if (!items.length) return `<div class="feed-empty">${I2.bell} New orders will stream in here.</div>`;
    return items.map(a => `
      <div class="feed-row">
        <span class="feed-dot"></span>
        <span class="feed-tx">${esc(a.msg)}</span>
        <span class="feed-at">${timeAgo(a.at)}</span>
      </div>`).join('');
  };

  const topSellers = () => {
    const unitsBy = {};
    for (const o of orders) for (const it of o.items || []) unitsBy[it.id] = (unitsBy[it.id] || 0) + it.qty;
    return Object.entries(unitsBy).map(([id, qty]) => ({ p: allProducts().find(x => x.id === Number(id)), qty })).filter(x => x.p).sort((a, b) => b.qty - a.qty).slice(0, 5);
  };

  const orderRow = (o, expandId = '') => `<tr>
    <td class="row-name"><button type="button" class="link-btn" data-code-detail="${o.id}">${esc(o.code)} ${expandId === o.id ? '▴' : '▾'}</button></td>
    <td>${esc(o.customer.name)}<br><span style="font-size:12px;color:var(--muted)">${esc(o.customer.phone)}</span></td>
    <td style="font-weight:800;color:var(--primary-deep);text-align:right">${money(o.totals.total)}</td>
    <td><span class="pay-chip ${o.payment === 'COD' ? 'cod' : 'upi'}">${esc(o.payment === 'COD' ? 'COD' : 'UPI')}</span></td>
    <td><select class="pill-sel pill-sel--${STATUS_PILL[o.status] || 'pending'}" data-status="${o.id}">${STATUSES.map(s => `<option value="${s.key}" ${s.key === o.status ? 'selected' : ''}>${s.label}</option>`).join('')}</select></td>
    <td style="font-size:12.5px;color:var(--muted)">${fmtDate(o.placedAt)}</td>
  </tr>${expandId === o.id ? orderDetailRow(o) : ''}`;

  const thumb = p => p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : `<span class="th-fb">${esc(catLabel(p).icon)}</span>`;

  const panelCustomers = () => {
    const q = (admQ || '').toLowerCase();
    const list = Object.entries(users).filter(([email, ux]) => !q || email.toLowerCase().includes(q) || (ux.name || '').toLowerCase().includes(q) || (ux.city || '').toLowerCase().includes(q));
    const rows = list.map(([email, user]) => {
      const mine = orders.filter(o => o.email === email);
      const spent = mine.reduce((a, o) => a + o.totals.total, 0);
      return `<tr>
        <td class="row-name"><span class="p-cell"><span class="av-ic sm">${esc((user.name || 'C').trim().charAt(0).toUpperCase())}</span><span>${esc(user.name || '—')}<small>${esc(user.city || user.area || '')}</small></span></span></td>
        <td>${esc(email)}</td>
        <td><span class="role-chip ${user.role === 'admin' ? 'a' : user.role === 'staff' ? 's' : 'c'}">${esc(user.role || 'customer')}</span></td>
        <td style="font-size:12.5px;color:var(--muted)">${user.createdAt ? fmtDate(user.createdAt) : '—'}</td>
        <td style="text-align:center">${mine.length}</td>
        <td style="text-align:center;font-weight:800;color:var(--primary-deep)">${mine.length ? money(spent) : '—'}</td>
      </tr>`;
    }).join('');
    return `
      <div class="tbl-tools">
        <div class="at-search mini">${I2.search}<input id="admUq" type="text" placeholder="Search users…" value="${esc(q)}"></div>
        <span class="panel-sub">${list.length} users</span>
      </div>
      ${rows ? `<div class="table-wrap"><table class="data-table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th style="text-align:center">Orders</th><th style="text-align:center">Spent</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>` : `<div class="empty-state"><div class="e-emoji">👥</div><h3>No customers yet</h3><p>People who register on this device will be listed here.</p></div>`}`;
  };

  const orderDetailRow = o => `<tr class="odetail" data-oid="${o.id}">
      <td colspan="6"><div class="odetail-inner">
        <div class="odetail-left"><h4>Items</h4>
          ${(o.items || []).map(it => `<div class="odetail-line"><span>${esc(it.name)} × ${it.qty}</span><b>${money(it.price * it.qty)}</b></div>`).join('')}
          <div class="odetail-sums">
            <div><span>Subtotal</span><b>${money(o.totals.subtotal)}</b></div>
            ${o.totals.saving ? `<div><span>You save</span><b>−${money(o.totals.saving)}</b></div>` : ''}
            ${o.totals.festiveAmt ? `<div><span>Festive off (${o.totals.festivePct}%)</span><b>−${money(o.totals.festiveAmt)}</b></div>` : ''}
            <div><span>Delivery</span><b>${o.totals.delivery ? money(o.totals.delivery) : 'FREE'}</b></div>
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
    const btn = $(`[data-code-detail="${id}"]`);
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
      <div class="tbl-tools">
        <div class="at-search mini">${I2.search}<input id="admOrderQ" type="text" placeholder="Search code, name, phone…" value="${esc(q)}"></div>
        <select class="filter-select" id="admOrderF"><option value="all">All statuses</option>${STATUSES.map(s => `<option value="${s.key}" ${admOrderFilter === s.key ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
        <span class="panel-sub">${list.length} of ${orders.length} orders</span>
      </div>
      ${list.length ? `<div class="table-wrap"><table class="data-table">
        <thead><tr><th>Code</th><th>Customer</th><th style="text-align:right">Total</th><th>Payment</th><th>Status</th><th>When</th></tr></thead>
        <tbody>${list.map(o => orderRow(o, expandId)).join('')}</tbody>
      </table></div>` : `<div class="empty-state"><div class="e-emoji">📦</div><h3>No orders yet</h3><p>Orders placed on this device appear here instantly.</p></div>`}`;
  };

  const panelOrders = (expandId = '') => staffOrders(expandId);

  const staffStock = () => {
    const q = (admQ || '').toLowerCase();
    let prods = allProducts();
    if (q) prods = prods.filter(p => (p.shortName + ' ' + p.name + ' ' + catLabel(p).name).toLowerCase().includes(q));
    return `
      <div class="tbl-tools">
        <div class="at-search mini">${I2.search}<input id="admPq" type="text" placeholder="Search products…" value="${esc(q)}"></div>
        <button class="btn btn-primary sm" data-qa="add-product">${I2.plus} Add Product</button>
        <span class="panel-sub">${prods.length} products</span>
      </div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Item</th><th>Category</th><th style="text-align:right">Price ₹</th><th style="text-align:center">Stock</th><th style="text-align:center">Override</th><th style="text-align:center">Featured</th><th></th></tr></thead>
        <tbody>${prods.map(p => `<tr>
          <td class="row-name" style="max-width:250px"><span class="p-cell"><span class="p-th">${thumb(p)}</span><span><a href="${prodUrl(p)}">${esc(p.shortName)}</a><small>${esc(p.sku || '')}</small></span></span></td>
          <td>${esc(catLabel(p).name)}</td>
          <td style="text-align:right"><div class="pd-cell"><span class="p-display">${money(priceOf(p))}</span><input class="price-input" type="number" min="0" step="1" data-price="${p.id}" value="${priceOf(p)}" aria-label="Price for ${esc(p.shortName)}"></div></td>
          <td style="text-align:center"><span class="tag ${inStockOf(p) ? 'in' : 'out'}">${stockOf(p) > 0 ? stockOf(p) + ' units' : 'Out'}</span></td>
          <td style="text-align:center"><select class="filter-select" style="padding:6px 30px 6px 10px;font-size:12.5px" data-stock="${p.id}">
            <option value="0" ${stockOf(p) === 0 ? 'selected' : ''}>Out of stock</option>
            <option value="3" ${stockOf(p) === 3 ? 'selected' : ''}>Low (3)</option>
            <option value="10" ${stockOf(p) === 10 ? 'selected' : ''}>In stock (10)</option>
            <option value="999" ${stockOf(p) === 999 ? 'selected' : ''}>Abundant (999)</option>
          </select></td>
          <td style="text-align:center"><input type="checkbox" class="feat-box" data-feat="${p.id}" ${featuredOf(p) ? 'checked' : ''} aria-label="Toggle featured for ${esc(p.shortName)}"></td>
          <td>${p.isExtra ? `<button type="button" class="icon-btn" data-del-prod="${p.id}" title="Delete" aria-label="Delete ${esc(p.shortName)}">${I2.trash}</button>` : ''}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;
  };

  const panelProducts = () => staffStock();

  const panelAnalytics = () => {
    const low = allProducts().filter(p => inStockOf(p) && stockOf(p) <= 6).sort((a, b) => stockOf(a) - stockOf(b)).slice(0, 6);
    const catAvg = CATS.map(c => {
      const units = orders.reduce((x, o) => x + (o.items || []).filter(i => { const p = allProducts().find(z => z.id === i.id); return p && p.cats && p.cats.includes(c.id); }).reduce((y, i) => y + i.qty, 0), 0);
      return { c, units };
    }).sort((a, b) => b.units - a.units).slice(0, 7);
    const maxU = Math.max(1, ...catAvg.map(r => r.units));
    return `
      <div class="glass g-card">
        <div class="panel-row"><h3>Revenue</h3><div class="seg"><button class="seg-b on" data-range="30">30D</button><button class="seg-b" data-range="90">90D</button></div></div>
        ${orders.length ? `<canvas id="anChart" height="220" aria-label="Revenue analytics chart"></canvas>` : `<div class="skel-box" aria-hidden="true"><i></i><i></i><i></i><i></i></div><p class="panel-sub">Revenue trends will render once orders exist.</p>`}
      </div>
      <div class="dash-2col">
        <div class="glass g-card"><h3>Sales by category</h3>
          ${catAvg.map(r => `<div class="tc-row"><span>${esc(r.c.name)}</span><div class="tc-track"><i style="width:${Math.max(4, Math.round((r.units / maxU) * 100))}%"></i></div><b>${r.units}</b></div>`).join('') || `<p class="panel-sub">No category sales yet.</p>`}
        </div>
        <div class="glass g-card"><h3>Low stock</h3>
          ${low.map(p => `<div class="ls-row"><span>${esc(p.shortName)}</span><b class="tag ${stockOf(p) > 0 ? 'in' : 'out'}">${stockOf(p)} left</b></div>`).join('') || `<p class="panel-sub">Inventory is healthy.</p>`}
        </div>
      </div>`;
  };

  const panelCategories = () => `<div class="cat-grid">${CATS.map(c => {
      const n = allProducts().filter(p => p.cats && p.cats.includes(c.id)).length;
      return `<div class="glass cat-card"><span class="cc-ic">${esc(c.icon || '✦')}</span><h3>${esc(c.name)}</h3><p class="panel-sub">${n} products</p><a class="link-btn" href="#/products?cat=${c.id}">Browse ${I.arrow}</a></div>`;
    }).join('')}</div>`;

  const panelAddProduct = () => {
    const catsOpt = CATS.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    return `<div class="glass add-wrap">
      <div class="ad-head"><div><h2>Add Product</h2><p class="panel-sub">The listing appears in the shop grid, product search and price list instantly.</p></div></div>
      <div class="add-form">
        <label>Product name * <input id="apName" type="text" placeholder="e.g. 1000 Shot Rainbow Cake"></label>
        <label>Category * <select id="apCat">${catsOpt}</select></label>
        <div class="add-g2">
          <label>Price (₹) * <input id="apPrice" type="number" min="0" step="1" placeholder="499"></label>
          <label>Compare at (₹) <input id="apCmp" type="number" min="0" step="1" placeholder="599"></label>
        </div>
        <div class="add-g2">
          <label>Stock <input id="apStock" type="number" min="0" step="1" value="10"></label>
          <label class="feat-line"><input id="apFeat" type="checkbox"> Featured on home</label>
        </div>
        <label>Image URL <input id="apImg" type="text" placeholder="https://…/image.jpg (optional)"></label>
        <div class="add-g2">
          <label>SKU <input id="apSku" type="text" placeholder="CM-9000"></label>
          <label>Rating <input id="apRate" type="number" min="0" max="5" step="0.1" value="4.5"></label>
        </div>
        <label>Short note <input id="apNote" type="text" placeholder="A one-line selling point"></label>
        <div class="add-actions"><button class="btn btn-primary" data-save-product>${I2.plus} Save product</button><button class="btn btn-ghost" data-goto="products">Cancel</button></div>
      </div>
    </div>`;
  };

  const panelPriceList = () => `
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
  const posProdsHTML = () => {
    const q = (posQ || '').toLowerCase();
    let list = allProducts().filter(inStockOf);
    if (q) list = list.filter(p => (p.shortName + ' ' + p.name).toLowerCase().includes(q));
    return list.slice(0, 48).map(p => `<button type="button" class="pos-prod" data-pos-add="${p.id}"><span class="p-th">${thumb(p)}</span><b>${esc(p.shortName)}</b><small>${money(priceOf(p))} · ${stockOf(p)} left</small></button>`).join('') || `<p class="panel-sub">No matching products.</p>`;
  };
  const posTotal = () => posCart.reduce((a, l) => { const p = allProducts().find(x => x.id === l.id); return a + (p ? priceOf(p) * l.qty : 0); }, 0);
  const posLinesHTML = () => posCart.length ? posCart.map(l => {
    const p = allProducts().find(x => x.id === l.id);
    if (!p) return '';
    return `<div class="pos-line"><span class="pl-name">${esc(p.shortName)}</span><div class="pl-ctrls"><button type="button" data-pos-dec="${p.id}">&minus;</button><b>${l.qty}</b><button type="button" data-pos-inc="${p.id}">+</button></div><span class="pl-amt">${money(priceOf(p) * l.qty)}</span><button type="button" class="icon-btn" data-pos-del="${p.id}">${I2.trash}</button></div>`;
  }).join('') : `<div class="feed-empty">${I2.cashI} Add products from the left to start a bill.</div>`;
  const panelPos = () => `
    <div class="pos-grid">
      <div class="glass pos-picker">
        <div class="panel-row"><h3>Products</h3><div class="at-search mini">${I2.search}<input id="posQ" type="text" placeholder="Scan or search…" value="${esc(posQ)}"></div></div>
        <div class="pos-prods" id="posProds">${posProdsHTML()}</div>
      </div>
      <div class="glass pos-bill">
        <div class="panel-row"><h3>Current Bill</h3></div>
        <div class="pos-cust">
          <label>Customer name <input id="posName" type="text" placeholder="Walk-in customer"></label>
          <label>Phone (10 digits) <input id="posPhone" type="text" placeholder="98765 43210"></label>
        </div>
        <div class="pos-lines" id="posLines">${posLinesHTML()}</div>
        <div class="pos-total"><span>Total</span><b id="posTotal">${money(posTotal())}</b></div>
        <div class="pos-place">
          <select id="posPay"><option value="COD">Cash on Delivery</option><option value="UPI">UPI</option></select>
          <button class="btn btn-primary" id="posPlace">${I2.cashI} Place order</button>
        </div>
      </div>
    </div>`;

  const panelCanvas = () => `
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
    if (!items.length) return `<div class="glass g-card"><div class="empty-state" style="padding:26px"><div class="e-emoji">🔔</div><h3>All caught up</h3><p>Order notifications will appear here.</p></div></div>`;
    return `<div class="glass g-card">
      <div class="panel-row"><h3>Notifications</h3><span class="tbl-tools"><button class="btn btn-ghost sm" data-notif-read>Mark all read</button><button class="btn btn-ghost sm" data-notif-clear>Clear</button></span></div>
      <div class="note-list">${items.map(a => `<div class="note-row ${a.read ? '' : 'unread'}"><span class="note-dot"></span><div><b>${esc(a.msg)}</b><small>${timeAgo(a.at)}</small></div></div>`).join('')}</div>
    </div>`;
  };

  const panelSettings = u => `
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
      <div class="srv-row"><span class="dot"></span><span>API service</span><b class="srv-ok">Operational</b></div>
      <div class="srv-row"><span class="dot"></span><span>Demo data storage</span><b class="srv-ok">Local</b></div>
      <div class="srv-row"><span class="dot"></span><span>Catalog</span><b class="srv-ok">${allProducts().length} products</b></div>
      <div class="srv-row"><span class="dot"></span><span>Orders</span><b class="srv-ok">${orders.length} recorded</b></div>
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
    return `<div class="glass g-card">
      <div class="panel-row"><h3>Operations log</h3><span class="panel-sub">Latest activity on this workspace</span></div>
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
    const color = opt.color || '#2196F3';
    const pad = { l: 46, r: 14, t: 14, b: 26 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const maxV = Math.max(...pts.map(p => p.v), 1);
    const xAt = i => pad.l + (pts.length <= 1 ? iw / 2 : (i / (pts.length - 1)) * iw);
    const yAt = v => pad.t + ih - (v / maxV) * ih;
    const paint = tip => {
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = opt.grid || 'rgba(13,71,161,.10)';
      ctx.lineWidth = 1;
      ctx.fillStyle = opt.gridTxt || 'rgba(13,71,161,.55)';
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (let r = 0; r <= 4; r++) {
        const y = pad.t + (ih / 4) * r;
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
        ctx.fillText(opt.formatY ? opt.formatY(maxV * (1 - r / 4)) : compactMoney(maxV * (1 - r / 4)), pad.l - 8, y);
      }
      if (pts.length > 1) {
        ctx.beginPath();
        pts.forEach((p, i) => { const x = xAt(i), y = yAt(p.v); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
        const grad = ctx.createLinearGradient ? ctx.createLinearGradient(0, pad.t, 0, H - pad.b) : null;
        if (grad) { grad.addColorStop(0, color + '55'); grad.addColorStop(1, color + '00'); ctx.fillStyle = grad; }
        ctx.lineTo(xAt(pts.length - 1), pad.t + ih); ctx.lineTo(xAt(0), pad.t + ih); ctx.closePath();
        if (grad) ctx.fill();
        ctx.beginPath();
        pts.forEach((p, i) => { const x = xAt(i), y = yAt(p.v); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
        ctx.strokeStyle = color; ctx.lineWidth = 2.4; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
      }
      pts.forEach((p, i) => {
        const x = xAt(i), y = yAt(p.v);
        ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
        if (opt.xLabel && p.l) { ctx.fillStyle = opt.gridTxt || 'rgba(13,71,161,.55)'; ctx.textAlign = 'center'; ctx.font = '9.5px Inter, system-ui, sans-serif'; ctx.fillText(p.l, x, H - 9); }
      });
      if (tip && opt.tip) {
        const t = opt.tip(tip.i);
        const tx = tip.x, ty = 14;
        ctx.strokeStyle = color; ctx.globalAlpha = .5; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(tx, pad.t); ctx.lineTo(tx, pad.t + ih); ctx.stroke(); ctx.globalAlpha = 1;
        const bw = Math.max(90, 12 + (t[0] || '').length * 6, 12 + (t[1] || '').length * 7);
        const bx = clamp(tx - bw / 2, 2, W - bw - 2);
        ctx.fillStyle = '#0D47A1'; ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(bx, ty - 8, bw, 38, 8) : ctx.rect(bx, ty - 8, bw, 38);
        ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.font = '600 11px Inter, system-ui, sans-serif'; ctx.fillText(t[0], bx + 10, ty);
        ctx.font = '700 13px Inter, system-ui, sans-serif'; ctx.fillText(t[1], bx + 10, ty + 17);
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
        if (bd < step) paint({ i: best, x: xAt(best) }); else paint(null);
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
  const spark = cv => {
    const raw = (cv.getAttribute('data-spark') || '').split(',').map(Number).filter(n => !isNaN(n));
    const color = cv.getAttribute('data-color') || '#2196F3';
    const { ctx, W, H } = canvasSize(cv);
    if (!ctx || raw.length < 2) return;
    const maxV = Math.max(...raw, 1), minV = Math.min(...raw, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath();
    raw.forEach((v, i) => { const x = (i / (raw.length - 1)) * W, y = H - 3 - ((v - minV) / (maxV - minV || 1)) * (H - 6); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.stroke();
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
      color: opt.color || '#2196F3',
      xLabel: true,
      tip: i => [pts[i].d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), money(pts[i].v)],
      formatY: compactMoney,
    });
  };
  const updateSalesSummary = () => {
    const so = $('#soChart');
    if (!so) return;
    const { days, since } = salesWindow();
    let tot = 0, cnt = 0;
    for (const o of orders) { const d = new Date(o.placedAt); d.setHours(0, 0, 0, 0); const i = Math.round((d - since) / 864e5); if (i >= 0 && i < days) { tot += o.totals.total; cnt++; } }
    const sum = $('#saleSum');
    if (sum) sum.innerHTML = `<span><b>${money(tot)}</b><small>Revenue · ${days}d</small></span><span><b>${cnt}</b><small>Orders</small></span><span><b>${cnt ? money(Math.round(tot / cnt)) : '—'}</b><small>Avg. order</small></span>`;
    const to = $('#soTo');
    if (salesSince && to) { const d = new Date(salesSince); d.setDate(d.getDate() + days - 1); to.value = d.toISOString().slice(0, 10); }
    drawSalesChart(so);
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
    else { const an = $('#anChart'); if (an) drawSalesChart(an, { days: r === '90' ? 90 : 30, color: '#0D47A1' }); }
  };

  const drawAdminCharts = () => {
    $$('.k-spark').forEach(spark);
    if (!orders.length) return;
    const so = $('#soChart');
    if (so) { updateSalesSummary(); }
    const dm = $('#dmChart');
    if (dm) {
      const cod = orders.filter(o => o.payment === 'COD').length, upi = orders.length - cod;
      donutChart(dm, [[upi, '#2196F3'], [cod, '#FF7043']], String(orders.length), Math.round((cod / orders.length) * 100) + '% COD');
    }
    const an = $('#anChart');
    if (an) drawSalesChart(an, { days: 30, color: '#0D47A1' });
  };

  const animateCounters = () => {
    $$('[data-count]').forEach(el => {
      const target = Number(el.getAttribute('data-count'));
      const moneyF = el.getAttribute('data-money');
      const set = v => { el.textContent = moneyF ? money(v) : v.toLocaleString('en-IN'); };
      if (reduceMotion || target === 0) { set(target); return; }
      const t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      const dur = 850;
      const step = () => {
        const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
        const p = Math.min(1, (now - t0) / dur);
        set(Math.round(target * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  };
  const updateBellUI = () => {
    $$('[data-bell-badge]').forEach(b => { const n = bellUnread(); b.textContent = n || ''; b.style.display = n ? '' : 'none'; });
  };

  const switchAdminPanel = p => {
    adminPanel = p;
    const shell = $('#adminShell');
    if (!shell) return;
    shell.querySelectorAll('.as-item[data-stab]').forEach(x => x.classList.toggle('active', x.getAttribute('data-stab') === p));
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
  const renderAdmSearch = q => {
    const box = $('#admSearchBox');
    if (!box) return;
    if (!q) { box.innerHTML = ''; box.classList.remove('open'); return; }
    const prods = allProducts().filter(p => (p.shortName + ' ' + p.name).toLowerCase().includes(q)).slice(0, 4);
    const ords = orders.filter(o => (o.code + ' ' + (o.customer.name || '')).toLowerCase().includes(q)).slice(0, 4);
    const uxs = Object.entries(users).filter(([e, u]) => (e + ' ' + (u.name || '')).toLowerCase().includes(q)).slice(0, 3);
    if (!prods.length && !ords.length && !uxs.length) { box.innerHTML = `<div class="gs-empty">No matches for “${esc(q)}”.</div>`; box.classList.add('open'); return; }
    box.innerHTML = `
      ${ords.length ? `<b class="gs-h">Orders</b>${ords.map(o => `<button type="button" class="gs-item" data-gs="order" data-id="${o.id}">${I2.sheet}<span>${esc(o.code)}<small>${esc(o.customer.name || '')} · ${money(o.totals.total)}</small></span></button>`).join('')}` : ''}
      ${prods.length ? `<b class="gs-h">Products</b>${prods.map(p => `<button type="button" class="gs-item" data-gs="product" data-id="${p.id}">${I2.box}<span>${esc(p.shortName)}<small>${money(priceOf(p))}</small></span></button>`).join('')}` : ''}
      ${uxs.length ? `<b class="gs-h">Users</b>${uxs.map(([e, ux]) => `<button type="button" class="gs-item" data-gs="user" data-id="${e}">${I2.user}<span>${esc(ux.name || '')}<small>${esc(e)}</small></span></button>`).join('')}` : ''}`;
    box.classList.add('open');
  };

  let analyticsRange = 30;
  let avCloseBound = false;
  const wireAdmin = () => {
    const u = currentUser();
    if (!u || !['admin', 'staff'].includes(u.role)) return;
    const shell = $('#adminShell');
    if (!shell) return;
    shell.setAttribute('data-admtheme', admPrefs.theme === 'dark' ? 'dark' : 'light');

    const switchP = b => switchAdminPanel(b.getAttribute('data-panel'));
    shell.querySelectorAll('[data-panel]').forEach(b => b.onclick = () => switchP(b));
    const st = shell.querySelector('[data-side-toggle]');
    if (st) st.onclick = () => shell.classList.toggle('side-collapsed');
    const tb = shell.querySelector('[data-theme-btn]');
    if (tb) tb.onclick = () => setAdmTheme(admPrefs.theme === 'dark' ? 'light' : 'dark');
    const tb2 = shell.querySelector('[data-theme-btn2]');
    if (tb2) tb2.onclick = () => setAdmTheme(admPrefs.theme === 'dark' ? 'light' : 'dark');
    shell.querySelectorAll('[data-theme-set]').forEach(b => b.onclick = () => setAdmTheme(b.getAttribute('data-theme-set')));
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
      gs.addEventListener('keydown', e => { if (e.key === 'Escape') { gsb.innerHTML = ''; gsb.classList.remove('open'); } });
      document.addEventListener('click', e => { if (gsb && !e.target.closest('.at-search')) { gsb.innerHTML = ''; gsb.classList.remove('open'); } });
    }

    wireDynamicPanel();
    wireStaffTables();
    animateCounters();
    updateBellUI();
    drawAdminCharts();
    startFeed();
  };

  let wireDynBound = false;
  const wireDynamicPanel = () => {
    const refresh = html => { const sp = $('#staffPanel'); if (sp && html !== undefined) sp.innerHTML = html; wireAdmin(); };
    const reRender = () => refresh(panelOf(adminPanel));
    const bindSearch = (id, stateSetter) => {
      const inp = $(id);
      if (inp) inp.oninput = () => { stateSetter(inp.value.trim()); reRender(); };
    };
    if (adminPanel === 'orders') {
      bindSearch('#admOrderQ', q => { admQ = q; });
      const f = $('#admOrderF');
      if (f) f.onchange = () => { admOrderFilter = f.value; admQ = ''; reRender(); };
    } else if (adminPanel === 'products') {
      bindSearch('#admPq', q => { admQ = q; });
      $$('[data-del-prod]').forEach(b => b.onclick = () => {
        const id = Number(b.getAttribute('data-del-prod'));
        extraProducts = extraProducts.filter(p => p.id !== id);
        save(); toast('Product removed'); reRender();
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
        const name = ($('#apName').value || '').trim();
        const price = Number($('#apPrice').value);
        const cat = $('#apCat').value;
        const stock = clamp(Number($('#apStock').value) || 0, 0, 999);
        if (name.length < 2) return toast('Enter a product name', 'err');
        if (!(price >= 0)) return toast('Enter a valid price', 'err');
        const id = Date.now();
        const p = {
          id, isExtra: true, slug: 'p-' + id,
          name, shortName: name.length > 34 ? name.slice(0, 33).trim() + '…' : name,
          sku: ($('#apSku').value || 'CM-' + id.toString().slice(-4)).toUpperCase(),
          price, compareAt: Number($('#apCmp').value) || 0,
          stock, inStock: stock > 0,
          featured: !!$('#apFeat').checked,
          cats: [cat], primary: cat,
          image: ($('#apImg').value || '').trim(),
          note: ($('#apNote').value || '').trim(),
          rating: clamp(Number($('#apRate').value) || 4.5, 0, 5), reviews: 0, salesCount: 0,
        };
        extraProducts.unshift(p);
        save();
        activity.unshift({ id: Date.now() + 1, type: 'log', msg: `${p.sku} — new product added by admin`, at: new Date().toISOString(), read: true });
        activity = activity.slice(0, 40); save();
        toast(`Added ${name}`);
        admQ = ''; switchAdminPanel('products');
      };
    } else if (adminPanel === 'pos') {
      const pq = $('#posQ');
      if (pq) pq.oninput = () => { posQ = pq.value.trim(); const box = $('#posProds'); if (box) box.innerHTML = posProdsHTML(); };
      $$('[data-pos-add]').forEach(b => b.onclick = () => {
        const id = Number(b.getAttribute('data-pos-add'));
        const line = posCart.find(l => l.id === id);
        if (line) line.qty = Math.min(line.qty + 1, 99); else posCart.push({ id, qty: 1 });
        const pp = $('#posProds'); if (pp) pp.innerHTML = posProdsHTML();
        refreshPosBill();
      });
      const refreshPosBill = () => {
        const lines = $('#posLines'); if (lines) lines.innerHTML = posLinesHTML();
        const tot = $('#posTotal'); if (tot) tot.textContent = money(posTotal());
        const place = $('#posPlace'); if (place) place.style.display = posCart.length ? '' : 'none';
      };
      refreshPosBill();
      const qty = op => {
        const btn = op === 'inc' ? '[data-pos-inc]' : '[data-pos-dec]';
        $$(btn).forEach(b => b.onclick = () => {
          const id = Number(b.getAttribute(op === 'inc' ? 'data-pos-inc' : 'data-pos-dec'));
          const l = posCart.find(x => x.id === id);
          if (!l) return;
          if (op === 'inc') l.qty = Math.min(l.qty + 1, 99); else { l.qty -= 1; if (l.qty <= 0) posCart = posCart.filter(x => x.id !== id); }
          refreshPosBill();
        });
      };
      qty('inc'); qty('dec');
      $$('[data-pos-del]').forEach(b => b.onclick = () => { posCart = posCart.filter(x => x.id !== Number(b.getAttribute('data-pos-del'))); refreshPosBill(); });
      const place = $('#posPlace');
      if (place) place.onclick = () => {
        const u = currentUser();
        const name = ($('#posName') ? $('#posName').value.trim() : '') || u.name || 'Walk-in';
        const phone = $('#posPhone') ? $('#posPhone').value.trim() : '';
        if (!/^[6-9]\d{9}$/.test(phone)) return toast('Enter a valid 10-digit mobile number', 'err');
        if (!posCart.length) return toast('Bill is empty', 'err');
        const lines = posCart.map(l => { const p = allProducts().find(x => x.id === l.id); return p ? { id: p.id, sku: p.sku || '', name: p.shortName, image: p.image || '', qty: l.qty, price: priceOf(p), compareAt: p.compareAt || 0 } : null; }).filter(Boolean);
        const subtotal = lines.reduce((a, l) => a + l.price * l.qty, 0);
        const saving = lines.reduce((a, l) => a + Math.max(0, (l.compareAt - l.price) * l.qty), 0) || 0;
        const now = new Date().toISOString();
        const code = orderCode();
        const cust = { name, phone, email: u.email, address: 'Walk-in · POS counter', area: '', city: 'Counter sale', pincode: '' };
        const o = {
          id: uid(), code, placedAt: now, status: 'confirmed', email: u.email,
          log: [{ status: 'placed', at: now }, { status: 'confirmed', at: now }],
          items: lines,
          totals: { subtotal, festiveAmt: 0, festivePct: 0, saving, delivery: 0, total: subtotal - saving },
          customer: cust, shipping: {}, payment: $('#posPay') ? $('#posPay').value : 'COD',
        };
        orders.unshift(o);
        posCart = [];
        save();
        activity.unshift({ id: Date.now() + 2, type: 'order', msg: `${o.code} · ${name} · ${money(o.totals.total)} (POS)`, at: now, read: false, oid: o.id });
        activity = activity.slice(0, 40); save();
        toast(`Order ${o.code} placed · ${money(o.totals.total)}`);
        updateBellUI();
        const sp = $('#staffPanel'); if (sp) { sp.innerHTML = panelPos(); wireAdmin(); }
      };
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
        const paintEmoji = () => { ctx.filter = flt; ctx.font = '150px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#2196F3'; ctx.fillText(p ? catLabel(p).icon : '🎇', cv.width / 2, cv.height / 2); ctx.filter = 'none'; };
        if (p && p.image) {
          const im = new Image();
          im.onload = () => { ctx.filter = flt; const k = Math.min(cv.width / im.width, cv.height / im.height); const w = im.width * k, h = im.height * k; ctx.drawImage(im, (cv.width - w) / 2, (cv.height - h) / 2, w, h); ctx.filter = 'none'; };
          im.onerror = paintEmoji;
          im.src = p.image;
        } else paintEmoji();
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

  let feedStarted = false;
  const startFeed = () => {
    clearInterval(feedTimer);
    feedTimer = setInterval(() => {
      if (document.hidden) return;
      if (orders.length > lastOrderCount) {
        const fresh = orders.slice(0, orders.length - lastOrderCount);
        lastOrderCount = orders.length;
        fresh.forEach(o => activity.unshift({ id: Date.now() + Math.random(), type: 'order', msg: `${o.code} · ${o.customer.name} · ${money(o.totals.total)}`, at: o.placedAt, read: false, oid: o.id }));
        activity = activity.slice(0, 40);
        save(); updateBellUI();
        toast('New order received');
        if (adminPanel === 'dashboard') {
          const sp = $('#staffPanel');
          if (sp) { sp.innerHTML = panelOf('dashboard'); wireAdmin(); }
        }
      }
    }, 4000);
    feedStarted = true;
  };

  const wireStaffTables = () => {
    $$('[data-status]').forEach(s => s.onchange = () => {
      const o = orders.find(x => x.id === s.getAttribute('data-status'));
      if (o) {
        o.status = s.value;
        o.log = o.log.filter(l => statusIndex(l.status) <= statusIndex(s.value));
        if (!o.log.some(l => l.status === s.value)) o.log.push({ status: s.value, at: new Date().toISOString() });
        save(); toast(`Order ${o.code} → ${(STATUSES.find(x => x.key === s.value) || {}).label}`);
        if (adminPanel === 'orders') { const sp = $('#staffPanel'); if (sp) { sp.innerHTML = staffOrders(); wireAdmin(); } }
      }
    });
    $$('[data-stock]').forEach(s => s.onchange = () => {
      const id = Number(s.getAttribute('data-stock'));
      stockOverrides[id] = Number(s.value);
      save();
      toast('Stock updated');
    });
    $$('[data-price]').forEach(i => i.onchange = () => {
      const id = Number(i.getAttribute('data-price'));
      priceOverrides[id] = Number(i.value) || 0;
      save();
      toast('Price updated');
      const cell = i.closest('tr') ? i.closest('tr').querySelector('.p-display') : null;
      if (cell) cell.textContent = money(priceOf(allProducts().find(x => x.id === id)));
    });
    $$('[data-feat]').forEach(c => c.onchange = () => {
      const id = Number(c.getAttribute('data-feat'));
      featOn[id] = c.checked;
      save();
      toast(c.checked ? 'Marked as featured' : 'Removed from featured');
    });
  };

  views.notFound = () => `
    <div class="page-head reveal"><h1>Page not found</h1></div>
    <div class="empty-state reveal"><div class="e-emoji">🤔</div><h3>This spark fizzled</h3><p>The page you're looking for doesn't exist.</p><a class="btn btn-primary" href="#/">${I.gift} Back to home</a></div>`;

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
    const hashOnly = raw.replace(/^#/, '#').split('?')[0];
    const query = raw.includes('?') ? raw.split('?')[1] : '';
    const m = ROUTES.find(r => r.re.test('#' + hashOnly.replace(/^#/, '')));
    const view = document.getElementById('view');

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
          ? `${esc((PRODUCTS.find(p => p.slug === params[0]) || {}).shortName || 'Product')} · CrackersMela`
          : `${({ products: 'Shop Fireworks', cart: 'Cart', checkout: 'Checkout', track: 'Track Order', myOrders: 'My Orders', wishlist: 'Wishlist', priceList: 'Price List', staff: 'Staff Hub' }[m.name] || 'CrackersMela')} · CrackersMela`;
    } else {
      out = views.notFound();
      document.title = 'Not found · CrackersMela';
    }
    if (typeof out === 'string' && out.startsWith('location.')) {
      const target = out.slice('location.'.length);
      location.hash = target;
      return route();
    }
    const au = currentUser();
    document.body.classList.toggle('admin-mode', !!(m && m.name === 'staff' && au && ['admin', 'staff'].includes(au.role)));
    view.innerHTML = out || '';
    window.scrollTo(0, 0);
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
      if (heroForm) heroForm.onsubmit = e => { e.preventDefault(); const q = encodeURIComponent($('#heroSearchInput').value.trim()); location.hash = q ? '#/products?q=' + q : '#/products'; };
      const nl = $('#nlForm');
      if (nl) nl.onsubmit = e => { e.preventDefault(); const v = $('#nlEmail').value.trim(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return toast('Enter a valid email', 'err'); toast("You're subscribed! 🎉"); nl.reset(); };
    }
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

  /* ==================== canvas sparks ==================== */
  let sparkCtx = null, sparkRaf = null;
  const initSparks = () => {
    const cv = document.getElementById('heroCanvas');
    if (!cv || reduceMotion) return;
    const ctx = cv.getContext('2d');
    sparkCtx = ctx;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => { cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr; };
    resize();
    window.addEventListener('resize', resize);
    const parts = [];
    const ensure = () => { while (parts.length < 46) { parts.push(mk()); } };
    const mk = () => {
      const c = ['#2196F3', '#90CAF9', '#0D47A1', '#FFFFFF', '#03A9F4'][Math.floor(Math.random() * 5)];
      return { x: Math.random(), y: 1 + Math.random() * 0.3, s: 0.6 + Math.random() * 1.6, v: 0.0006 + Math.random() * 0.0018, c, w: 1 + Math.random() * 2 };
    };
    let last = 0;
    const draw = t => {
      sparkRaf = requestAnimationFrame(draw);
      if (t - last < 40) return; last = t;
      if (document.hidden) return;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ensure();
      const cx = cv.width / 2, cy = cv.height;
      for (const p of parts) {
        p.y -= p.v * (t / 16.6);
        p.x += Math.sin(p.y * 40 + p.w) * 0.0012;
        if (p.y < 0) { Object.assign(p, mk()); p.y = 1 + Math.random() * 0.3; }
        const a = Math.max(0, Math.min(1, (p.y - 0.12) * 2)) * 0.85;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(cx + (p.x - 0.5) * cv.width * 0.9, cy - (1 - p.y) * cy, p.s * dpr, 0, Math.PI * 2);
        ctx.fillStyle = p.c;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    cancelAnimationFrame(sparkRaf);
    sparkRaf = requestAnimationFrame(draw);
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAnimationFrame(sparkRaf); });

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
    rail.innerHTML = pill('all', 'All Categories', PRODUCTS.length)
      + `<button class="cat-pill ${location.hash.includes('sort=discount') ? 'active' : ''}" data-railsort="discount">Deals<span class="cp-n">${PRODUCTS.filter(p => discountOf(p) >= 25).length}</span></button>`
      + CATS.map(c => pill(c.id, c.name, PRODUCTS.filter(p => p.cats.includes(c.id)).length)).join('')
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
        const pct = n => ((n - PRICE_FLOOR) / (PRICE_CEIL - PRICE_FLOOR)) * 100;
        const paint = () => {
          const a = Math.min(+rMin.value, +rMax.value), b = Math.max(+rMin.value, +rMax.value);
          $('#rvMin').textContent = money(a);
          $('#rvMax').textContent = money(b);
          if (rsFill) { rsFill.style.left = pct(a) + '%'; rsFill.style.right = (100 - pct(b)) + '%'; }
          return [a, b];
        };
        [rMin, rMax].forEach(r => {
          r.addEventListener('input', paint);
          r.addEventListener('change', () => { const [a, b] = paint(); go({ min: a === PRICE_FLOOR ? '' : a, max: b === PRICE_CEIL ? '' : b }); });
        });
      }

      $$('[data-fcat]').forEach(cb => cb.addEventListener('change', () =>
        go({ cats: $$('[data-fcat]').filter(x => x.checked).map(x => x.value).join(',') })));
      $$('[data-frating]').forEach(r => r.addEventListener('change', () => go({ rating: r.value })));
      $$('[data-foff]').forEach(r => r.addEventListener('change', () => go({ off: r.value })));
      $$('[data-favail]').forEach(r => r.addEventListener('change', () => go({ avail: r.value })));
      $$('[data-fdelivery]').forEach(b => b.addEventListener('click', () =>
        go({ delivery: b.getAttribute('data-fdelivery') === 'express' ? 'express' : '' })));
      const fship = $('[data-ffreeship]');
      if (fship) fship.addEventListener('change', () => go({ freeship: fship.checked ? '1' : '' }));

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
      const p = PRODUCTS.find(x => x.slug === (currentRoute.params[0] || ''));
      const btnQ = $('#pdQty'), min = $('#pdMinus'), plu = $('#pdPlus'), add = $('#pdAdd'), buy = $('#pdBuyNow'), wish = $('#pdWish');
      const setQ = n => { if (btnQ) btnQ.textContent = n; };
      if (min) min.onclick = () => { let n = Math.max(1, (parseInt(btnQ.textContent) || 1) - 1); setQ(n); };
      if (plu) plu.onclick = () => { let n = Math.min(50, (parseInt(btnQ.textContent) || 1) + 1); setQ(n); };
      if (add) add.onclick = () => { const n = parseInt(btnQ.textContent) || 1; addToCart(p.id, n); add.innerHTML = I.check + ' Added'; add.classList.add('added'); setTimeout(() => { add.innerHTML = I.cart + ' Add to cart'; add.classList.remove('added'); }, 1200); };
      if (buy) buy.onclick = () => { const n = parseInt(btnQ.textContent) || 1; addToCart(p.id, n); location.hash = '#/checkout'; };
      if (wish) wish.onclick = () => toggleWish(p.id);
    }
    if (v === 'cart') {
      const go = $('#goCheckout');
      if (go) go.onclick = () => { location.hash = '#/checkout'; };
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
      $$('[data-demotrack]').forEach(b => b.onclick = () => { $('#trackCode').value = b.getAttribute('data-demotrack'); trackRender(b.getAttribute('data-demotrack')); });
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
      if (m.name === 'contact') {
        const f = $('#contactForm');
        if (f) f.onsubmit = e => { e.preventDefault();
          const n = $('#cfName').value.trim(), p = $('#cfPhone').value.trim(), msg = $('#cfMsg').value.trim();
          if (n.length < 2) return toast('Please enter your name', 'err');
          if (!/^[6-9]\d{9}$/.test(p)) return toast('Enter a valid 10-digit mobile number', 'err');
          if (msg.length < 5) return toast('Tell us a little more', 'err');
          toast('Message sent — we\'ll get back soon!'); f.reset();
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
    $$('[data-pay]').forEach(el => el.onclick = () => { st.payment = el.getAttribute('data-pay'); $$('[data-pay]').forEach(x => x.classList.toggle('selected', x === el)); });
    const place = $('#ckPlace');
    if (place) place.onclick = () => {
      const errs = checkoutValidate(st);
      if (errs.length) return toast(errs[0], 'err');
      const order = placeOrder(st.data, st.data, st.payment);
      save();
      toast(`Order ${order.code} placed! 🎉`);
      location.hash = '#/order/' + order.id;
    };
  };

  const transition = (name, html) => {
    document.getElementById('view').innerHTML = html;
    setupReveal();
  };

  /* ---------- global listeners ---------- */
  const bindGlobals = () => {
    window.addEventListener('hashchange', route);

    const drawerEls = ['cartDrawer'];
    document.addEventListener('click', e => {
      const t = e.target;
      if (t.closest && t.closest('[data-close-cart]')) { closeCart(); return; }
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
    $('#cartCheckoutBtn').addEventListener('click', () => { closeCart(); location.hash = '#/checkout'; });
    $('#cartViewBtn').addEventListener('click', () => { closeCart(); location.hash = '#/cart'; });
    $('#wishBtn').addEventListener('click', () => location.hash = '#/wishlist');
    $('#accountChip').addEventListener('click', () => { currentUser() ? (location.hash.startsWith('#/staff') ? route() : location.hash = '#/my-orders') : authModal('login'); });
    $('#userIconBtn').addEventListener('click', () => { currentUser() ? (location.hash = '#/my-orders') : authModal('login'); });
    $('#mobileToggle').addEventListener('click', () => { const d = $('#mobileDrawer'); d.classList.add('open'); d.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; });
    $('#searchTrigger').addEventListener('click', openSearch);
    $('#searchOverlay').addEventListener('click', e => { if (e.target.id === 'searchOverlay') closeSearch(); });
    $('#searchInput').addEventListener('input', e => renderSearchResults(e.target.value));
    $('#searchInput').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.value.trim()) { const q = encodeURIComponent(e.target.value.trim()); closeSearch(); location.hash = '#/products?q=' + q; } });

    document.addEventListener('keydown', e => {
      if ((e.key === '/' ) && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); }
      if (e.key === 'Escape') { closeSearch(); closeCart(); closeAuth(); openFilters(false); $('#mobileDrawer').classList.remove('open'); document.body.style.overflow = ''; }
    });

    // categories mega-menu
    const ncm = $('#navCatMenu');
    if (ncm) ncm.innerHTML = CATS.map(c => `<a href="#/products?cat=${c.id}" role="menuitem"><span class="mi">${esc(c.icon || '✦')}</span><span><b>${esc(c.name)}</b><small>${PRODUCTS.filter(p => p.cats.includes(c.id)).length} products</small></span></a>`).join('')
      + `<a href="#/price-list" role="menuitem" class="nav-drop__all"><span class="mi">${I.print}</span><span><b>Full Price List</b><small>Every item, one page</small></span></a>`;

    // footer categories
    const fc = $('#footerCats');
    if (fc) fc.innerHTML = CATS.slice(0, 6).map(c => `<a href="#/products?cat=${c.id}">${esc(c.name)}</a>`).join('');
    const fe = $('#footEmail');
    if (fe) fe.textContent = STORE.email;

    const promo = (() => {
      const track = $('#promoTrack');
      if (!track) return;
      const items = STORE.promo.map(p => `<span class="promo-bar__item">${I.bolt}<span>${esc(p.text)}</span></span><span class="promo-bar__item" aria-hidden="true">✦</span>`).join('');
      track.innerHTML = items + items;
    })();

    $('#fabUp').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    window.addEventListener('scroll', () => {
      $('#navbar').classList.toggle('scrolled', window.scrollY > 10);
      $('#fabUp').classList.toggle('show', window.scrollY > 600);
    }, { passive: true });

    /* first paint — called directly (not via rAF) so a background tab still renders */
    route();
    accountUI(); cartUI(); wishUI();
    $('#navbar').classList.toggle('scrolled', window.scrollY > 10);
  };

  /* logged-out staff link cleanup */
  const cleanupStaffLink = () => {
    const link = document.querySelector('a[href="#/staff"]');
    if (link && !currentUser()) link.classList.add('hidden');
  };
  document.addEventListener('DOMContentLoaded', cleanupStaffLink);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindGlobals);
  else bindGlobals();
})();