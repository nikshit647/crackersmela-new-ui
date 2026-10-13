/* Featured products use the storefront catalog; this module owns only card rotation. */
(() => {
  'use strict';
  if (window.CMHeroShowcase) return;
  const slots = ['main', 'a', 'b'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const selected = products => {
    const seen = new Set();
    return (Array.isArray(products) ? products : []).filter(product => {
      if (!product || !product.featured || product.disabled || product.id == null || seen.has(String(product.id))) return false;
      seen.add(String(product.id)); return true;
    });
  };
  const empty = '<span class="hero-shot__content hero-shot__empty"><span aria-hidden="true">✦</span><b>Discover our crackers</b><span>Explore the collection</span></span>';
  const content = product => `<span class="hero-shot__content">${product.imageMarkup || '<span class="prod-img-fallback" role="img" aria-label="Product image unavailable">✦</span>'}<span class="hero-shot__tag">${product.brandMarkup || ''}${product.category ? `<span class="hero-shot__category">${esc(product.category)}</span>` : ''}<span class="hero-shot__details"><b>${esc(product.shortName || product.name)}</b><span>${esc(product.priceText)}</span></span></span></span>`;
  function render(products) {
    const items = selected(products);
    return slots.map((slot, index) => {
      const product = items[index];
      return `<a class="hero-shot hero-shot--${slot}" data-hero-slot="${index}"${product ? ` data-hero-product="${esc(product.id)}" href="${esc(product.href)}" aria-label="${esc(product.name || product.shortName)}"` : !items.length && index === 0 ? ' href="/products" aria-label="Explore our crackers"' : ' hidden'}>${product ? content(product) : index === 0 && !items.length ? empty : ''}</a>`;
    }).join('');
  }
  let active = null;
  function destroy() {
    if (!active) return;
    active.stop(); active = null;
  }
  function mount(stage, products) {
    if (!stage) { destroy(); return; }
    if (active?.stage === stage) { active.refresh(products, true); return; }
    destroy();
    const cards = slots.map((slot, index) => {
      let card = stage.querySelector(`[data-hero-slot="${index}"]`);
      if (!card) { card = document.createElement('a'); card.className = 'hero-shot hero-shot--' + slot; card.dataset.heroSlot = index; stage.insertBefore(card, stage.querySelector('.hero-chip')); }
      return card;
    });
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let items = [], signature = '', offset = 0, timer = null, fading = null, stopped = false, suspended = false, hovering = false, focused = false;
    const preload = new Set();
    const cancel = () => {
      clearInterval(timer); clearTimeout(fading); timer = fading = null;
      cards.forEach(card => card.querySelector('.hero-shot__content')?.classList.remove('is-changing'));
    };
    const warmNext = () => {
      // Browser caching coalesces these image loads; rotation never fetches an API.
      for (let index = 1; index <= 3 && index < items.length; index++) {
        const product = items[(offset + index + 2) % items.length];
        if (!product.imageSrc || preload.has(product.imageSrc)) continue;
        preload.add(product.imageSrc);
        const image = new Image(); image.decoding = 'async'; image.src = product.imageSrc;
      }
    };
    const paint = (fadeIn = false) => {
      cards.forEach((card, index) => {
        const product = index < items.length ? items[(offset + index) % items.length] : null;
        card.hidden = !product && (items.length > 0 || index > 0);
        if (product) {
          card.dataset.heroProduct = product.id;
          card.setAttribute('href', product.href);
          card.setAttribute('aria-label', product.name || product.shortName);
          card.innerHTML = content(product);
          if (fadeIn) card.querySelector('.hero-shot__content').classList.add('is-changing');
        } else {
          delete card.dataset.heroProduct;
          if (!items.length && index === 0) { card.setAttribute('href', '/products'); card.setAttribute('aria-label', 'Explore our crackers'); card.innerHTML = empty; }
          else { card.removeAttribute('href'); card.removeAttribute('aria-label'); card.innerHTML = ''; }
        }
      });
      if (fadeIn) {
        // Commit the replacement at zero opacity before revealing its content.
        void stage.offsetWidth;
        cards.forEach(card => card.querySelector('.hero-shot__content')?.classList.remove('is-changing'));
      }
      warmNext();
    };
    const resume = () => {
      cancel();
      if (stopped || suspended || items.length < 2 || media.matches || document.hidden || hovering || focused || window.CM_EDITOR_PREVIEW) return;
      timer = setInterval(() => {
        if (!stage.isConnected) { destroy(); return; }
        cards.forEach(card => { if (!card.hidden) card.querySelector('.hero-shot__content')?.classList.add('is-changing'); });
        fading = setTimeout(() => { fading = null; offset = (offset + 1) % items.length; paint(true); }, 180);
      }, 3500);
    };
    const refresh = (products, force = false) => {
      const next = selected(products), nextSignature = JSON.stringify(next);
      if (!force && nextSignature === signature) return;
      cancel();
      if (nextSignature !== signature) offset = 0;
      signature = nextSignature; items = next; paint(); resume();
    };
    const enter = () => { hovering = true; cancel(); };
    const leave = () => { hovering = false; resume(); };
    const focus = () => { focused = true; cancel(); };
    const blur = event => { if (!stage.contains(event.relatedTarget)) { focused = false; resume(); } };
    stage.addEventListener('mouseenter', enter); stage.addEventListener('mouseleave', leave);
    stage.addEventListener('focusin', focus); stage.addEventListener('focusout', blur);
    document.addEventListener('visibilitychange', resume); media.addEventListener('change', resume);
    active = { stage, refresh,
      suspend() { suspended = true; cancel(); },
      restore() { suspended = false; resume(); },
      stop() {
      stopped = true; cancel();
      stage.removeEventListener('mouseenter', enter); stage.removeEventListener('mouseleave', leave);
      stage.removeEventListener('focusin', focus); stage.removeEventListener('focusout', blur);
      document.removeEventListener('visibilitychange', resume); media.removeEventListener('change', resume);
    } };
    refresh(products);
  }
  // Back/Forward Cache retains this page and its cards. Pause its timers while
  // frozen, then resume through the same motion, focus and visibility guards.
  window.addEventListener('pagehide', event => { if (event.persisted) active?.suspend(); else destroy(); });
  window.addEventListener('pageshow', event => { if (event.persisted) active?.restore(); });
  window.CMHeroShowcase = Object.freeze({ render, mount, refresh: products => active?.refresh(products), destroy });
})();
