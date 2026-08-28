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

  const save = () => { ls.set('cart', cart); ls.set('wish', wish); ls.set('recent', recent); ls.set('orders', orders); ls.set('session', session); ls.set('stockOverrides', stockOverrides); ls.set('priceOverrides', priceOverrides); ls.set('featOn', featOn); };

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
  const productCard = (p, opts = {}) => {
    const off = discountOf(p);
    const img = imgOf(p);
    const hasImg = /<img/.test(img);
    const media = hasImg ? img : `<div class="prod-img-fallback">${esc(catLabel(p).icon)}</div>`;
    return `
    <article class="prod-card reveal" data-id="${p.id}">
      <div class="prod-card__media">
        <a href="${prodUrl(p)}" tabindex="-1" aria-hidden="true">${media}</a>
        ${off >= 25 ? `<div class="prod-card__badges"><span class="badge-off">-${off}% OFF</span>${featuredOf(p) ? '<span class="badge-off badge-hot">HOT</span>' : ''}</div>` : featuredOf(p) ? `<div class="prod-card__badges"><span class="badge-off badge-hot">HOT</span></div>` : ''}
        <button class="prod-card__wish ${saved(p.id) ? 'active' : ''}" data-wish="${p.id}" aria-label="Toggle wishlist" aria-pressed="${saved(p.id)}">${saved(p.id) ? I.heartF : I.heart}</button>
        ${!inStockOf(p) ? `<div class="prod-oos-tint"><span>OUT OF STOCK</span></div>` : ''}
      </div>
      <div class="prod-card__body">
        <span class="prod-card__cat">${esc(catLabel(p).name)}</span>
        <h3 class="prod-card__name"><a href="${prodUrl(p)}">${esc(p.shortName)}</a></h3>
        <div class="rating-row">${stars(p.rating)} <span>${p.rating.toFixed(1)} · ${p.reviews} reviews</span></div>
        <div class="price-row">
          <span class="price-now">${money(priceOf(p))}</span>
          ${p.compareAt && p.compareAt > priceOf(p) ? `<span class="price-cmp">${money(p.compareAt)}</span>` : ''}
        </div>
        <div class="prod-card__foot">
          ${stockLine(p)}
          ${inStockOf(p) ? `<button class="add-btn" data-add="${p.id}" aria-label="Add ${esc(p.shortName)} to cart">${I.cart}<span>Add</span></button>`
          : `<button class="add-btn" disabled aria-label="Sold out">Sold</button>`}
        </div>
      </div>
    </article>`;
  };

  const productGrid = (list, opts = {}) => list.length
    ? `<div class="prod-grid ${opts.cols === 3 ? 'prod-grid--3' : ''}">${list.map(p => productCard(p, opts)).join('')}</div>`
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
    if (u) {
      if (label) label.textContent = u.name.split(' ')[0] + (u.role === 'admin' ? ' · Staff' : '');
      if (avatar) avatar.textContent = (u.name || 'G')[0].toUpperCase();
      $('#userIconBtn').style.display = 'none';
      $('#accountChip').style.display = 'inline-flex';
      if (u.role === 'admin' || u.role === 'staff') { const st = document.querySelector('a[href="#/staff"]'); if (st) { st.classList.remove('hidden'); } }
    } else {
      if (label) label.textContent = 'Sign in';
      if (avatar) avatar.textContent = 'G';
      $('#userIconBtn').style.display = '';
      $('#accountChip').style.display = 'none';
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
    return PRODUCTS.filter(p => {
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

  /* ==================== views ==================== */
  const views = {};

  views.home = () => {
    const featured = PRODUCTS.filter(p => featuredOf(p) && inStockOf(p)).slice(0, 8);
    const best = [...PRODUCTS.filter(inStockOf)].sort((a, b) => b.salesCount - a.salesCount).slice(0, 8);
    const night = PRODUCTS.filter(p => p.cats.includes('night-outs') || p.cats.includes('gift-boxes')).sort((a, b) => (b.compareAt || b.price) - (a.compareAt || a.price)).slice(0, 4);
    const heroPicks = [...PRODUCTS.filter(p => p.inStock && p.image)].sort(() => Math.random() - 0.5).slice(0, 3);
    return `
    <section class="hero">
      <canvas class="hero-canvas" id="heroCanvas" aria-hidden="true"></canvas>
      <div class="hero-grid">
        <div class="hero-copy">
          <span class="hero-badge"><span class="dot"></span>${SALE_LIVE ? 'Diwali Season 2026 — Now Live' : 'Now Live'}</span>
          <h1>The No.1 Fireworks Store — <span class="grad-text">Reimagined</span></h1>
          <p class="lede">Premium, PESO-certified crackers from Sivakasi. Factory prices, doorstep delivery across Hyderabad &amp; Secunderabad, and the safest way to light up your celebrations.</p>
          <form class="hero-search" id="heroSearchForm" autocomplete="off">
            ${I.search}
            <input name="q" id="heroSearchInput" placeholder="Try “1000 wala”, “flower pot”, “sparklers”…" aria-label="Search products">
            <button class="btn btn-primary" type="submit">Search</button>
          </form>
          <div class="hero-cta">
            <a class="btn btn-primary" href="#/products">${I.gift} Shop now</a>
            <a class="btn btn-glass" href="#/price-list">View price list</a>
          </div>
          <div class="hero-stats">
            <div class="stat"><div class="num">${PRODUCTS.length}+</div><div class="lbl">Products</div></div>
            <div class="stat"><div class="num">${CATS.length}</div><div class="lbl">Categories</div></div>
            <div class="stat"><div class="num">${money(STORE.freeDeliveryAbove)}+</div><div class="lbl">Free delivery</div></div>
            <div class="stat"><div class="num">4.7★</div><div class="lbl">Rating</div></div>
          </div>
        </div>
        <div class="hero-visual">
          <div class="hero-card-stack">
            ${heroPicks.map((p, i) => `<a class="hero-card hero-card--${['a', 'b', 'c'][i]}" href="${prodUrl(p)}" aria-label="${esc(p.shortName)}">
              <img src="${esc(p.image)}" alt="" loading="lazy">
              <div class="hero-card__body"><h4>${esc(p.shortName)}</h4>
                <div class="price-row"><span class="hero-card__price">${money(priceOf(p))}</span>${p.compareAt > priceOf(p) ? `<span class="hero-card__cmp">${money(p.compareAt)}</span><span class="hero-card__off">-${discountOf(p)}%</span>` : ''}</div>
              </div></a>`).join('')}
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="trust-strip">
        ${[
          { i: I.shield, t: 'PESO Certified', s: 'Licensed, safety-tested stock' },
          { i: I.truck, t: `Free delivery ${money(STORE.freeDeliveryAbove)}+`, s: 'Hyderabad & Secunderabad' },
          { i: I.cash, t: 'Pay on delivery', s: 'Cash or UPI at your door' },
          { i: I.bolt, t: 'Sivakasi direct', s: 'Freshest batch every season' },
        ].map(x => `<div class="trust-card reveal"><div class="t-icon">${x.i}</div><div><h4>${x.t}</h4><p>${x.s}</p></div></div>`).join('')}
      </div>
    </section>

    <section class="section" id="categories">
      <div class="section__head">
        <div><span class="section__tag">Browse collection</span><h2 class="section__title">Shop by <span class="grad-text">category</span></h2><p class="section__sub">From little sparklers to grand multi-shot shows — find your celebration match.</p></div>
        <a class="section__link" href="#/products">All products ${I.arrow}</a>
      </div>
      <div class="cat-grid">${CATS.map(catCard).join('')}</div>
    </section>

    <section class="section" id="featured">
      <div class="section__head">
        <div><span class="section__tag">Hand-picked</span><h2 class="section__title">Featured <span class="grad-text">best sellers</span></h2><p class="section__sub">Our crowd favourites — the ones that go first every season.</p></div>
        <a class="section__link" href="#/products?sort=rating">Mega deals ${I.arrow}</a>
      </div>
      ${productGrid(featured)}
    </section>

    <section class="section" id="deal">
      <div class="deals-band reveal">
        <div class="deals-band__inner">
          <div>
            <span class="section__tag" style="color:#fff;opacity:.85">Limited period</span>
            <h2>Diwali Mega Sale — up to 50% off</h2>
            <p>Grab the big ones early. Stock is limited and moves fast — order before the sky lights up.</p>
            <div style="margin-top:18px"><a class="btn btn-glass" href="#/products" style="color:var(--primary-deep)">Grab the deal ${I.arrow}</a></div>
          </div>
          <div class="countdown" id="dealClock"></div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section__head">
        <div><span class="section__tag">Auto-applied at checkout</span><h2 class="section__title">Festive <span class="grad-text">offer tiers</span></h2><p class="section__sub">Stack a little extra every time your basket grows. No codes needed.</p></div>
      </div>
      <div class="offer-strip">
        ${OFFER_TIERS.map(o => `<div class="offer-card reveal"><div class="o-emoji">🎁</div><div><b>${o.tag}</b><p>Automatically applied on your total before delivery.</p></div></div>`).join('')}
      </div>
    </section>

    <section class="section" id="best">
      <div class="section__head">
        <div><span class="section__tag">Most ordered</span><h2 class="section__title">Trending <span class="grad-text">right now</span></h2></div>
        <a class="section__link" href="#/products">Explore more ${I.arrow}</a>
      </div>
      ${productGrid(best)}
    </section>

    <section class="section" id="night">
      <div class="deals-band" style="background:linear-gradient(120deg,#0B1B3A,#0D47A1 55%,#2196F3)">
        <div class="deals-band__inner">
          <div>
            <span class="section__tag" style="color:#90CAF9">The grand finale</span>
            <h2>Gift boxes &amp; multi-shot shows</h2>
            <p>Complete hampers for gifting and big aerial collections for the loudest, brightest night.</p>
            <div style="margin-top:18px"><a class="btn btn-glass" href="#/products?cat=gift-boxes" style="color:var(--primary-deep)">Shop gift boxes ${I.arrow}</a></div>
          </div>
        </div>
      </div>
      <div style="margin-top:22px">${productGrid(night, { cols: 4 })}</div>
    </section>

    <section class="section">
      <div class="section__head"><div><span class="section__tag">How it works</span><h2 class="section__title">Celebrate in <span class="grad-text">four steps</span></h2></div></div>
      <div class="steps-grid">
        ${[['Pick your favourites', 'Browse categories or search the collection.'], ['Order in seconds', 'Add to cart and checkout — no codes, no fuss.'], ['Pay on delivery', 'Cash or UPI right at your doorstep.'], ['Light up the sky', 'Verified, safe, certified fun.']].map((s, i) => `<div class="step-card reveal"><div class="s-num">${i + 1}</div><h4>${s[0]}</h4><p>${s[1]}</p></div>`).join('')}
      </div>
    </section>

    <section class="section">
      <div class="section__head"><div><span class="section__tag">Word on the street</span><h2 class="section__title">Customers <span class="grad-text">love</span> us</h2></div></div>
      <div class="testi-grid">
        ${[
          ['Ravi T.', 'Hyderabad', 'Ordered the 1000 wala + flower pots. On time, fresh stock, and the kids had a blast.'],
          ['Sneha K.', 'Secunderabad', 'Easily the cleanest fireworks site. Prices were lower than the mandi and delivery was same day!'],
          ['Imran S.', 'Hitech City', 'My go-to every year now. Gift boxes are lovely and the checkout takes 30 seconds.'],
        ].map(t => `<div class="testi-card reveal"><div class="stars">★★★★★</div><p>“${t[2]}”</p><div class="who"><div class="avatar">${t[0][0]}</div><div><b>${t[0]}</b><span>${t[1]}</span></div></div></div>`).join('')}
      </div>
    </section>

    <section class="section">
      <div class="newsletter-band reveal">
        <div class="newsletter-band__inner">
          <div><h2>Get first access to festive drops</h2><p>New-year launches, restocks alerts and subscriber-only offers. No spam, ever.</p></div>
          <form class="nl-form" id="nlForm">
            <input type="email" id="nlEmail" placeholder="Your email address" aria-label="Email for newsletter" required>
            <button class="btn" type="submit">Subscribe</button>
          </form>
        </div>
      </div>
    </section>`;
  };

  views.products = (route) => {
    const params = new URLSearchParams(route.query || '');
    const cat = params.get('cat');
    const q = (params.get('q') || '').toLowerCase();
    const sort = params.get('sort') || 'featured';

    let list = PRODUCTS.slice();
    if (cat && cat !== 'all') list = list.filter(p => p.cats.includes(cat));
    if (q) list = searchProducts(q);
    list = list.filter(p => inStockOf(p) || !params.get('instock'));

    switch (sort) {
      case 'price-asc': list.sort((a, b) => priceOf(a) - priceOf(b)); break;
      case 'price-desc': list.sort((a, b) => priceOf(b) - priceOf(a)); break;
      case 'discount': list.sort((a, b) => discountOf(b) - discountOf(a)); break;
      case 'rating': list.sort((a, b) => b.rating - a.rating); break;
      case 'name': list.sort((a, b) => a.shortName.localeCompare(b.shortName)); break;
      default: list.sort((a, b) => (featuredOf(b) - featuredOf(a)) || (b.salesCount - a.salesCount));
    }

    const chips = [{ id: 'all', name: 'All', icon: '🎆' }, ...CATS.map(c => ({ id: c.id, name: c.name, icon: c.icon }))];

    return `
      <div class="page-head reveal">
        <div class="crumbs"><a href="#/">Home</a><span class="sep">/</span><span>Products</span></div>
        <h1>${cat && CAT_MAP[cat] ? esc(CAT_MAP[cat].name) : q ? `Results for “${esc(q)}”` : 'All Fireworks'}</h1>
        <p>${cat && CAT_MAP[cat] ? esc(CAT_MAP[cat].blurb) : q ? `${list.length} products matching your search` : 'The full CrackersMela collection — fresh from Sivakasi.'}</p>
      </div>

      <div class="prod-toolbar reveal">
        <div class="prod-toolbar__search">${I.search}<input type="text" id="prodSearch" value="${esc(q)}" placeholder="Search within products…" aria-label="Search products"></div>
        <select class="sort-select" id="prodSort" aria-label="Sort products">
          <option value="featured" ${sort === 'featured' ? 'selected' : ''}>Sort: Featured</option>
          <option value="price-asc" ${sort === 'price-asc' ? 'selected' : ''}>Price: Low → High</option>
          <option value="price-desc" ${sort === 'price-desc' ? 'selected' : ''}>Price: High → Low</option>
          <option value="discount" ${sort === 'discount' ? 'selected' : ''}>Biggest discount</option>
          <option value="rating" ${sort === 'rating' ? 'selected' : ''}>Top rated</option>
          <option value="name" ${sort === 'name' ? 'selected' : ''}>Name (A–Z)</option>
        </select>
      </div>

      <div class="chip-row reveal" style="margin-bottom:20px">
        ${chips.map(c => `<button class="chip ${(cat || 'all') === c.id ? 'active' : ''}" data-chipcat="${c.id}">${c.icon} ${c.name}</button>`).join('')}
      </div>

      <p class="result-count reveal">${list.length} ${list.length === 1 ? 'product' : 'products'}</p>
      ${productGrid(list, { emptyTitle: 'No products found', emptyText: 'Try clearing filters or searching something else.' })}
    `;
  };

  views.product = (route) => {
    const slug = route.params[0];
    const p = PRODUCTS.find(x => x.slug === slug || 'p-' + x.id === slug);
    if (!p) return views.notFound();
    if (!recent.includes(p.id)) { recent = [p.id, ...recent].slice(0, 10); save(); }
    const off = discountOf(p);
    const cat = catLabel(p);
    const qty = cartQty(p.id) || 1;
    const related = PRODUCTS.filter(x => x.id !== p.id && x.cats.some(c => p.cats.includes(c)) && inStockOf(x)).slice(0, 4);

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

  const priceListRows = (filterCat = 'all', q = '') => PRODUCTS.filter(p =>
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

  views.staff = () => {
    const u = currentUser();
    if (!u || !['admin', 'staff'].includes(u.role)) {
      return `<div class="page-head reveal"><h1>Admin panel</h1><p>Restricted — sign in with a staff account.</p></div>
        <div class="glass-panel reveal" style="max-width:520px"><h2>Staff access only</h2><p class="panel-sub">Use <code>${DEMO.find(x => x.role === 'admin').email}</code> / <code>admin123</code> to explore the management console.</p>
        <button class="btn btn-primary" id="goAuthStaff">Sign in as staff</button></div>`;
    }
    const revenue = orders.reduce((a, o) => a + o.totals.total, 0);
    const custCount = Object.keys(users).length;
    return `
      <div class="page-head reveal"><h1>Admin panel</h1><p>Welcome, <b>${esc(u.name)}</b> · ${esc(u.role === 'admin' ? 'Administrator' : 'Staff')}</p></div>
      <div class="kpi-grid reveal">
        <div class="kpi"><div class="k-num">${orders.length}</div><div class="k-lbl">Orders</div></div>
        <div class="kpi"><div class="k-num">${money(revenue)}</div><div class="k-lbl">Order value</div></div>
        <div class="kpi"><div class="k-num">${custCount}</div><div class="k-lbl">Customers</div></div>
        <div class="kpi"><div class="k-num">${PRODUCTS.filter(p => inStockOf(p)).length}</div><div class="k-lbl">In stock</div></div>
      </div>
      <div class="tabs reveal">
        <button class="tab-btn active" data-stab="dashboard">Dashboard</button>
        <button class="tab-btn" data-stab="orders">Orders</button>
        <button class="tab-btn" data-stab="stock">Product control</button>
        <button class="tab-btn" data-stab="customers">Customers</button>
        <button class="tab-btn" data-stab="pl">Price list</button>
        <button class="tab-btn danger-zone" data-stab="danger">Danger zone</button>
      </div>
      <div id="staffPanel">${staffDashboard()}</div>`;
  };

  const staffDashboard = () => {
    const unitsBy = {};
    for (const o of orders) for (const it of o.items || []) unitsBy[it.id] = (unitsBy[it.id] || 0) + it.qty;
    const top = Object.entries(unitsBy).map(([id, qty]) => ({ p: PRODUCTS.find(x => x.id === Number(id)), qty })).filter(x => x.p).sort((a, b) => b.qty - a.qty).slice(0, 5);
    const cod = orders.filter(o => o.payment === 'COD').length;
    const upi = orders.length - cod;
    const low = PRODUCTS.filter(p => inStockOf(p) && stockOf(p) <= 6).sort((a, b) => stockOf(a) - stockOf(b)).slice(0, 5);
    const recentList = [...orders].slice(0, 3);
    return `
      <div class="admin-grid">
        <div class="glass-panel reveal admin-chart-card">
          <div class="panel-row"><h3>Orders · last 14 days</h3><span class="panel-sub">${orders.length ? `${orders.length} orders total` : 'No orders yet'}</span></div>
          ${orders.length ? `<canvas id="dlChart" height="180" aria-label="Orders per day chart"></canvas>` : `<p class="panel-sub">Place an order from the storefront and it appears here as a daily bar.</p>`}
        </div>
        <div class="glass-panel reveal admin-chart-card">
          <div class="panel-row"><h3>Payment split</h3><span class="panel-sub">${orders.length ? `${Math.round((upi / orders.length) * 100)}% UPI` : 'Awaiting orders'}</span></div>
          ${orders.length ? `<canvas id="dmChart" height="180" aria-label="Payment method donut"></canvas>` : `<p class="panel-sub">COD vs UPI once customers start ordering.</p>`}
        </div>
        <div class="glass-panel reveal">
          <h3>Top sellers <span class="panel-sub">by units</span></h3>
          ${top.length ? `<ol class="admin-list">${top.map((t, i) => `<li><b>${i + 1}.</b> <a href="${prodUrl(t.p)}">${esc(t.p.shortName)}</a><span>${t.qty} sold</span></li>`).join('')}</ol>`
            : `<p class="panel-sub">Products will rank here once orders come in.</p>`}
        </div>
        <div class="glass-panel reveal">
          <h3>Low stock <span class="panel-sub">≤ 6 units</span></h3>
          ${low.length ? `<ul class="admin-list">${low.map(p => `<li><a href="${prodUrl(p)}">${esc(p.shortName)}</a><span class="tag ${stockOf(p) > 0 ? 'in' : 'out'}">${stockOf(p)} left</span></li>`).join('')}</ul>`
            : `<p class="panel-sub">Inventory is healthy — no low-stock items.</p>`}
        </div>
        <div class="glass-panel reveal">
          <h3>Recent orders</h3>
          ${recentList.length ? `<ul class="admin-list">${recentList.map(o => `<li><a href="#/staff" data-code-jump="${o.id}"><b>${esc(o.code)}</b></a><span>${money(o.totals.total)} · ${esc(o.customer.name)}</span></li>`).join('')}</ul>`
            : `<p class="panel-sub">Latest orders will show here.</p>`}
        </div>
      </div>`;
  };

  const staffCustomers = () => {
    const rows = Object.entries(users).map(([email, user]) => {
      const mine = orders.filter(o => o.email === email);
      const spent = mine.reduce((a, o) => a + o.totals.total, 0);
      return `<tr>
        <td class="row-name">${esc(user.name || '—')}</td>
        <td>${esc(email)}</td>
        <td>${esc(user.role || 'customer')}</td>
        <td style="font-size:12.5px;color:var(--muted)">${user.createdAt ? fmtDate(user.createdAt) : '—'}</td>
        <td style="text-align:center">${mine.length}</td>
        <td style="text-align:center;font-weight:800;color:var(--primary-deep)">${mine.length ? money(spent) : '—'}</td>
      </tr>`;
    }).join('');
    if (!rows) return `<div class="empty-state reveal"><div class="e-emoji">👥</div><h3>No customers yet</h3><p>People who register on this device will be listed here.</p></div>`;
    return `<div class="table-wrap reveal"><table class="data-table">
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th style="text-align:center">Orders</th><th style="text-align:center">Spent</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
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
    wireStaffTables();
  };

  const staffOrders = (expandId = '') => {
    if (!orders.length) return `<div class="empty-state reveal"><div class="e-emoji">📦</div><h3>No orders yet</h3><p>Orders placed on this device appear here instantly.</p></div>`;
    return `<div class="table-wrap reveal"><table class="data-table">
      <thead><tr><th>Code</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th><th>When</th></tr></thead>
      <tbody>${orders.map(o => `<tr>
        <td class="row-name"><button type="button" class="link-btn" data-code-detail="${o.id}">${esc(o.code)} ${expandId === o.id ? '▴' : '▾'}</button></td>
        <td>${esc(o.customer.name)}<br><span style="font-size:12px;color:var(--muted)">${esc(o.customer.phone)}</span></td>
        <td style="font-weight:800;color:var(--primary-deep)">${money(o.totals.total)}</td>
        <td>${esc(o.payment === 'COD' ? 'COD' : 'UPI')}</td>
        <td><select class="filter-select" style="padding:6px 30px 6px 10px;font-size:12.5px" data-status="${o.id}">${STATUSES.map(s => `<option value="${s.key}" ${s.key === o.status ? 'selected' : ''}>${s.label}</option>`).join('')}</select></td>
        <td style="font-size:12.5px;color:var(--muted)">${fmtDate(o.placedAt)}</td>
      </tr>${expandId === o.id ? orderDetailRow(o) : ''}`).join('')}</tbody>
    </table></div>`;
  };

  const staffStock = () => `<div class="table-wrap reveal"><table class="data-table">
      <thead><tr><th>Item</th><th>Category</th><th style="text-align:right">Price ₹</th><th style="text-align:center">Stock</th><th style="text-align:center">Override</th><th style="text-align:center">Featured</th></tr></thead>
      <tbody>${PRODUCTS.map(p => `<tr>
        <td class="row-name" style="max-width:260px"><a href="${prodUrl(p)}">${esc(p.shortName)}</a></td>
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
      </tr>`).join('')}</tbody>
    </table></div>`;

  const drawStaffCharts = () => {
    const dl = $('#dlChart');
    if (dl && orders.length) {
      const days = 14;
      const buckets = Array.from({ length: days }, () => 0);
      const now = new Date(); now.setHours(0, 0, 0, 0);
      for (const o of orders) { const d = new Date(o.placedAt); const bb = new Date(d); bb.setHours(0, 0, 0, 0); const i = Math.round((now - bb) / 864e5); if (i >= 0 && i < days) buckets[days - 1 - i]++; }
      const max = Math.max(1, ...buckets);
      const ctx = dl.getContext('2d');
      const W = dl.clientWidth || 300, H = dl.height;
      const dpr = window.devicePixelRatio || 1;
      dl.width = W * dpr; dl.height = H * dpr; ctx.scale(dpr, dpr);
      const pad = 6, bw = (W - pad * 2) / days, gap = 3;
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < days; i++) {
        const bh = Math.max(4, (buckets[i] / max) * (H - 30));
        const x = pad + i * bw;
        ctx.fillStyle = i === days - 1 ? '#FF6F91' : '#2196F3';
        ctx.globalAlpha = .85;
        ctx.fillRect(x + gap, H - 18 - bh, bw - gap * 2, bh);
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(255,255,255,.4)';
        ctx.beginPath(); ctx.arc(x + (bw - gap * 2) / 2, H - 18 - bh, 2.5, 0, 7); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = '11px sans-serif';
      ctx.fillText('14d ago', pad, H - 5); ctx.fillText('today', W - 38, H - 5);
    }
    const dm = $('#dmChart');
    if (dm && orders.length) {
      const cod = orders.filter(o => o.payment === 'COD').length, upi = orders.length - cod;
      const ctx = dm.getContext('2d');
      const S = Math.min(dm.clientWidth || 160, dm.clientWidth ? dm.clientHeight : 120);
      const cx = S / 2, cy = S / 2, R = S / 2 - 6;
      const dpr = window.devicePixelRatio || 1;
      dm.width = S * dpr; dm.height = S * dpr; ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, S, S);
      const segs = [[upi, '#2196F3'], [cod, '#FF7043']].filter(s => s[0] > 0);
      let a = 0;
      for (const [v, col] of segs) { const ang = (v / orders.length) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a, a + ang); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); a += ang; }
      ctx.beginPath(); ctx.arc(cx, cy, R * .62, 0, 7); ctx.fillStyle = 'rgba(10,20,40,.9)'; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '700 20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(orders.length), cx, cy - 4);
      ctx.font = '10px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillText('orders', cx, cy + 12);
    }
  };

  const wireStaffTables = () => {
    $$('[data-status]').forEach(s => s.onchange = () => {
      const o = orders.find(x => x.id === s.getAttribute('data-status'));
      if (o) {
        o.status = s.value;
        o.log = o.log.filter(l => statusIndex(l.status) <= statusIndex(s.value));
        if (!o.log.some(l => l.status === s.value)) o.log.push({ status: s.value, at: new Date().toISOString() });
        save(); toast(`Order ${o.code} → ${(STATUSES.find(x => x.key === s.value) || {}).label}`);
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
      if (cell) cell.textContent = money(priceOf(PRODUCTS.find(x => x.id === id)));
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
    view.innerHTML = out || '';
    window.scrollTo(0, 0);
    postRoute(raw, m);
  };

  const postRoute = (raw, m) => {
    // refresh chrome
    accountUI(); cartUI(); wishUI();
    navActive();
    wireView(m);
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

  /* ==================== global wiring ==================== */
  const wireView = (m) => {
    const v = m ? m.name : '';
    if (v === 'products') {
      const sp = $('#prodSearch');
      if (sp) sp.addEventListener('input', debounce(() => {
        const cat = new URLSearchParams(location.hash.split('?')[1] || '').get('cat');
        const hash = `#/products?${new URLSearchParams({ ...(cat ? { cat } : {}), q: sp.value, sort: $('#prodSort').value }).toString()}`;
        if (location.hash !== hash) history.replaceState(null, '', hash);
        route();
      }));
      const so = $('#prodSort');
      if (so) so.addEventListener('change', () => {
        const sp = $('#prodSearch');
        const cat = new URLSearchParams(location.hash.split('?')[1] || '').get('cat');
        const hash = `#/products?${new URLSearchParams({ ...(cat ? { cat } : {}), q: sp ? sp.value : '', sort: so.value }).toString()}`;
        location.hash = hash;
      });
      $$('[data-chipcat]').forEach(b => b.addEventListener('click', () => {
        const hash = `#/products?cat=${b.getAttribute('data-chipcat')}`;
        if (location.hash === hash) route(); else location.hash = hash;
      }));
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
      $$('[data-stab]').forEach(b => b.onclick = () => {
        $$('[data-stab]').forEach(x => x.classList.toggle('active', x === b));
        const tab = b.getAttribute('data-stab');
        $('#staffPanel').innerHTML = tab === 'dashboard' ? staffDashboard() : tab === 'orders' ? staffOrders() : tab === 'stock' ? staffStock() : tab === 'customers' ? staffCustomers() : tab === 'pl' ? `<div class="table-wrap"><table class="data-table">${priceListRows()}</table></div>` : ` <div class="glass-panel"><h2>Danger zone</h2><p class="panel-sub">Reset the demo workspace (this device only).</p><button class="btn" style="background:linear-gradient(135deg,#E0464B,#c0392b);color:#fff" id="resetAll">Reset demo data</button></div>`;
        wireStaffTables();
        if (tab === 'dashboard') drawStaffCharts();
        if (tab === 'danger') { const r = $('#resetAll'); if (r) r.onclick = () => { ['cart', 'wish', 'orders', 'session', 'stockOverrides', 'priceOverrides', 'featOn', 'recent'].forEach(k => localStorage.removeItem('cm2.' + k)); location.hash = '#/'; location.reload(); }; }
      });
      wireStaffTables();
      drawStaffCharts();
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
      if (t.closest && t.closest('[data-cat]')) { location.hash = '#/products?cat=' + t.closest('[data-cat]').getAttribute('data-cat'); return; }
      if (t.closest && t.closest('[data-search-hit]')) { closeSearch(); return; }
      if (t.closest && t.closest('[data-code-detail]')) { toggleOrderDetail(t.closest('[data-code-detail]').getAttribute('data-code-detail')); return; }
      if (t.closest && t.closest('[data-code-jump]')) {
        const id = t.closest('[data-code-jump]').getAttribute('data-code-jump');
        const panel = $('#staffPanel');
        $$('[data-stab]').forEach(x => x.classList.toggle('active', x.getAttribute('data-stab') === 'orders'));
        if (panel) { panel.innerHTML = staffOrders(id); wireStaffTables(); }
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
      if (e.key === 'Escape') { closeSearch(); closeCart(); closeAuth(); $('#mobileDrawer').classList.remove('open'); document.body.style.overflow = ''; }
    });

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

    requestAnimationFrame(() => {
      route();
      accountUI(); cartUI(); wishUI();
      $('#navbar').classList.toggle('scrolled', window.scrollY > 10);
    });
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