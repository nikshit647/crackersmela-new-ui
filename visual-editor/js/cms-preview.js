/* Authenticated preview bridge. Editing runs on the real storefront DOM. */
(() => {
  'use strict';
  window.CM_EDITOR_PREVIEW = true;
  window.CM_EDITOR_INTERACTIVE = false;
  const origin = location.origin;
  const send = (type, data = {}) => { if (parent !== window) parent.postMessage({ channel: 'cm-editor', type, ...data }, origin); };
  const allowedPages = new Set(['home', 'products', 'product', 'price-list', 'about', 'contact', 'faq', 'wholesale', 'shipping', 'returns', 'safety', 'terms', 'privacy']);
  const previewParams = new URLSearchParams(location.search), page = previewParams.get('page') || 'home';
  const customPage = /^custom-[a-f0-9]{32}$/.test(page);
  const templatePage = document.head.querySelector('meta[name="cm-page-template"]')?.content || page;
  const pageSlug = document.head.querySelector('meta[name="cm-page-slug"]')?.content || '';
  const baseRoute = customPage && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pageSlug) ? '#/page/'+pageSlug : page === 'home' ? '#/' : page === 'product' ? '#/product/p-26' : '#/'+page;
  const productsPage = templatePage === 'products';
  const categoryPattern = /^[a-z0-9][a-z0-9_-]{0,79}$/;
  const currentCategory = () => productsPage ? new URLSearchParams(location.hash.split('?')[1] || '').get('cat') || 'all' : 'all';
  const categoryAllowed = category => category === 'all' || categoryPattern.test(category) && [...document.querySelectorAll('[data-cat]')].some(node=>node.dataset.cat===category);
  const categoryRoute = category => baseRoute + (category && category !== 'all' ? '?cat='+encodeURIComponent(category) : '');
  if (!location.hash && (allowedPages.has(page) || customPage)) {
    const requested = previewParams.get('route') || baseRoute, routePath = requested.split('?')[0];
    const matches = routePath === baseRoute || page === 'product' && /^#\/product\/[a-z0-9][a-z0-9_-]{0,159}$/.test(routePath);
    const category = productsPage && matches ? new URLSearchParams(requested.split('?')[1] || '').get('cat') : '';
    const safeRoute = matches ? routePath + (category && category !== 'all' && categoryPattern.test(category) ? '?cat='+encodeURIComponent(category) : '') : baseRoute;
    history.replaceState(null, '', location.pathname + location.search + safeRoute);
  }
  const devices = ['desktop', 'tablet', 'mobile'];
  const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
  const round = value => Math.round(value * 10) / 10;
  const expandedDetails = new Map();
  let selected = null, hovered = null, selection = null, device = 'desktop', chrome = null, box = null, label = null, guides = null, hoverLabel = null, actions = null, pendingFrame = 0, gesture = null, inline = null, incoming = null;
  // A drag or move finishes by synthesising a click. Only that one click is
  // unwanted: a time window would also swallow a deliberate follow-up click,
  // such as pressing a reorder arrow straight after dropping a card.
  let swallowNextClick = false;
  let productMode = null, productDrag = null, productFrame = 0, productScrollFrame = 0;
  let productCategorySequence = 0, pendingProductCategory = null;
  const productAnimations = new Map();
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  // Category cards reuse the tested pointer, insertion, keyboard and touch
  // controls. IDs remain typed: categories are strings, products are numbers.
  const categoryCardId = card => card.dataset.categoryId || card.querySelector('[data-image-category]')?.dataset.imageCategory || '';
  // Three category surfaces share one reorder engine. The target, never a selector
  // match on the container, decides what counts as an item, so a decorated
  // mega-menu link or filter row still enumerates exactly as it does undecorated.
  const CATEGORY_TARGETS = new Set(['grid','menu','filter']);
  const ORDER_CHROME = '[data-cms-chrome],.cms-product-reorder-toolbar,.cms-category-reorder-toolbar,.cms-category-handle,.cms-category-reorder-start';
  const categoryFilterCard = () => [...document.querySelectorAll('#filterCol .filter-card')].find(node => (node.querySelector('h4')?.textContent || '').trim() === 'Category') || null;
  const gridForTarget = target => target === 'menu' ? document.getElementById('navCatMenu')
    : target === 'filter' ? (categoryFilterCard()?.querySelector('.filter-body') || null)
    : document.querySelector('.home-category-grid');
  const targetNoun = target => target === 'menu' ? 'menu item' : target === 'filter' ? 'filter row' : 'card';
  // Decorated mega-menu anchors lose role=menuitem, so they are matched by tag.
  const isReorderItem = (node, target) => target === 'menu' ? node.tagName === 'A' && !!node.dataset.catId
    : target === 'filter' ? node.matches('label.check-row') && !!(node.dataset.catId || node.querySelector(':scope>input[data-fcat]'))
    : target === 'product' ? node.matches('.prod-card[data-id]') && Number.isSafeInteger(Number(node.dataset.id)) && Number(node.dataset.id) > 0
    : node.matches('.home-category-card') && categoryPattern.test(categoryCardId(node));
  const productCards = (grid, target) => grid ? [...grid.children].filter(node => isReorderItem(node, target)) : [];
  const orderCardId = card => card.matches('.home-category-card') ? categoryCardId(card)
    : card.matches('[data-cat-id]') ? (card.dataset.catId || card.querySelector(':scope>input[data-fcat]')?.value || '')
    : Number(card.dataset.id);
  // A filter row names itself in its own span; the injected position badge and
  // arrow controls are chrome siblings and must never leak into the label.
  const rowName = card => [...card.children].find(node => node.tagName === 'SPAN' && !node.hasAttribute('data-cms-chrome') && !node.matches('.mi,.cms-product-position,.cms-product-order-controls'))?.textContent.trim() || '';
  const orderCardName = card => card.matches('label.check-row') ? (rowName(card) || 'Category')
    : card.matches('[data-cat-id]') ? (card.querySelector('b')?.textContent.trim() || 'Category')
    : card.matches('.home-category-card') ? (card.querySelector('.prod-card__name,h3')?.textContent.trim() || 'Category')
    : card.querySelector('.prod-card__name,h3')?.textContent.trim() || 'Product';
  const productIds = () => productMode ? productCards(productMode.grid, productMode.target).map(orderCardId) : [];
  const reorderType = mode => mode?.kind === 'category' ? 'category' : 'product';
  function categoryRefreshFailed(message, reason = 'refresh-error') {
    pendingProductCategory = null;
    send('product-reorder-state',{active:false,reason});
    send('error',{message});
  }
  async function changeProductCategory(message) {
    if (!productsPage) return;
    const sequence = ++productCategorySequence;
    const category = typeof message.category === 'string' && message.category ? message.category : 'all';
    if (!categoryAllowed(category)) { categoryRefreshFailed('Choose one of the product categories shown on this page.','category-unavailable'); return; }
    endProductMode('category'); finishGesture(false); finishInline(true);
    pendingProductCategory = {sequence,category,awaiting:message.refresh===true};
    try {
      if (message.refresh) {
        if (typeof window.CMStorefront?.refreshProducts !== 'function' || typeof window.CMStorefront?.refreshProductView !== 'function') throw new Error('Reload the editor to refresh the product catalog.');
        await window.CMStorefront.refreshProducts();
      }
      if (sequence !== productCategorySequence || pendingProductCategory?.sequence !== sequence) return;
      pendingProductCategory.awaiting = false;
      const route = categoryRoute(category);
      if (location.hash !== route) location.hash = route;
      else if (message.refresh) window.CMStorefront.refreshProductView();
      else {
        pendingProductCategory = null; const baseline = window.CMCms?.baseline();
        if (baseline) send('ready',{page:window.CMCms.page(),document:baseline,category});
      }
    } catch (error) {
      if (sequence === productCategorySequence) categoryRefreshFailed(error?.message || 'Products could not be refreshed. Try again.');
    }
  }
  /* One small Reorder control per category surface. Every injected node carries
     data-cms-chrome so identify() skips it and it never joins the reorder item
     set; the header control is anchored beside #navCatMenu so it can never
     become one of the menu's own a[role=menuitem] children. */
  const clearCategoryReorderControls = () => document.querySelectorAll('.cms-category-reorder-start').forEach(node => node.remove());
  function categoryReorderControl(target, label) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'cms-category-reorder-start'; button.dataset.cmsChrome = '';
    button.dataset.cmsCategoryReorderStart = ''; button.dataset.cmsCategoryTarget = target;
    button.textContent = 'Reorder Categories'; button.title = label; button.setAttribute('aria-label', label);
    return button;
  }
  function injectCategoryReorderControls() {
    clearCategoryReorderControls();
    if (window.CM_EDITOR_INTERACTIVE || productMode) return;
    const grid = gridForTarget('grid');
    if (grid) {
      const panel = grid.closest('.home-categories__panel') || grid.parentElement;
      if (panel) {
        const button = categoryReorderControl('grid', 'Reorder the category cards on the home page');
        button.dataset.cmsCategoryReorderStart = grid.closest('[data-cms-section]')?.dataset.cmsSection || '';
        panel.insertBefore(button, grid);
      }
    }
    const menu = gridForTarget('menu');
    if (menu) {
      const button = categoryReorderControl('menu', 'Reorder the categories in the header menu');
      button.dataset.cmsCategoryReorderStart = menu.closest('[data-cms-section]')?.dataset.cmsSection || '';
      // Inside the dropdown, never beside it: an absolutely positioned button
      // under the header would cover the sticky #catRail on the shop page, and
      // it must not become one of the menu's own a[role=menuitem] children.
      menu.append(button);
    }
    const body = gridForTarget('filter');
    if (body) {
      const card = body.closest('.filter-card') || body.parentElement;
      if (card) {
        // Beside .filter-body, never inside it: refreshFilterCategories relies
        // on that subtree, and app.js locates the card through its h4.
        const button = categoryReorderControl('filter', 'Reorder the category filters on the shop page');
        button.dataset.cmsCategoryReorderStart = body.closest('[data-cms-section]')?.dataset.cmsSection || '';
        card.insertBefore(button, body);
      }
    }
  }
  function productNotice(text) { if (productMode?.status) productMode.status.textContent = text; }
  function productRects() {
    if (!productMode) return new Map();
    return new Map(productCards(productMode.grid, productMode.target).map(node => [node,node.getBoundingClientRect()]));
  }
  function updateProductNumbers() {
    if (!productMode) return;
    const cards = productCards(productMode.grid, productMode.target);
    cards.forEach((card,index) => {
      const badge = card.querySelector(':scope>.cms-product-position'); if (badge) badge.textContent = String(index+1);
      const name = orderCardName(card);
      card.setAttribute('aria-label',`${name}, position ${index+1} of ${cards.length}. Use arrow keys to reorder.`);
      const up = card.querySelector('[data-cms-product-move="-1"]'), down = card.querySelector('[data-cms-product-move="1"]');
      if (up) up.disabled = index === 0; if (down) down.disabled = index === cards.length-1;
    });
  }
  function rememberProductLayout() {
    if (productMode) { productMode.rects = productRects(); productMode.scrollX = scrollX; productMode.scrollY = scrollY; }
  }
  function reorderProductNode(card, index, animate = true) {
    if (!productMode) return false;
    const cards = productCards(productMode.grid, productMode.target), old = cards.indexOf(card); index = clamp(index,0,cards.length-1);
    if (old < 0 || old === index) return false;
    const before = productRects();
    for (const animation of productAnimations.values()) animation.cancel(); productAnimations.clear();
    cards.splice(old,1); cards.splice(index,0,card); productMode.grid.insertBefore(card,cards[index+1] || null);
    updateProductNumbers(); rememberProductLayout();
    if (animate && !reducedMotion()) for (const [node,after] of productMode.rects) {
      const previous = before.get(node); if (!previous || node === productDrag?.card || after.bottom < -100 || after.top > innerHeight+100) continue;
      const dx = previous.left-after.left, dy = previous.top-after.top; if (Math.abs(dx)+Math.abs(dy) < 1) continue;
      const animation = node.animate([{translate:`${dx}px ${dy}px`},{translate:'0px 0px'}],{duration:180,easing:'cubic-bezier(.2,.7,.25,1)'});
      productAnimations.set(node,animation); animation.onfinish = () => { if (productAnimations.get(node) === animation) productAnimations.delete(node); };
    }
    return true;
  }
  function sendProductOrder() {
    if (!productMode) return;
    const payload = {sectionId:productMode.sectionId,category:productMode.category,ids:productIds()};
    if (productMode.kind === 'category') payload.target = productMode.target;
    send(reorderType(productMode)+'-reorder-operation',payload);
  }
  function restoreProductDecorations(mode) {
    if (!mode) return;
    mode.toolbar?.remove(); mode.grid?.classList.remove('cms-product-reorder-grid','cms-category-reorder-grid');
    for (const [card,original] of mode.originals) {
      card.classList.remove('cms-product-reorder-card','cms-category-reorder-card','cms-product-drag-placeholder');
      card.querySelectorAll(':scope>.cms-product-position,:scope>.cms-product-order-controls,:scope>.cms-product-insertion-marker,:scope>.cms-category-handle').forEach(node=>node.remove());
      for (const [key,value] of Object.entries(original.attributes)) { if (value === null) card.removeAttribute(key); else card.setAttribute(key,value); }
    }
    const cards = mode.grid?.isConnected ? productCards(mode.grid, mode.target) : [];
    cards.forEach((card,index)=>{card.hidden=index>=mode.visibleCount;});
  }
  function refreshProductMode() {
    if (!productMode) return;
    const mode = productMode, sectionNode = mode.sectionId ? document.querySelector(`[data-cms-section="${CSS.escape(mode.sectionId)}"]`) : null;
    // The home grid is section scoped; the header menu and the shop filter are
    // shared storefront chrome, so they are located directly instead.
    const grid = mode.kind === 'category'
      ? (mode.target === 'grid' && sectionNode ? sectionNode.querySelector('.home-category-grid') : null) || gridForTarget(mode.target)
      : sectionNode?.matches('.prod-grid') ? sectionNode : sectionNode?.querySelector('.prod-grid');
    if (!grid) { endProductMode('section-unavailable'); return; }
    if (grid !== mode.grid) { restoreProductDecorations(mode); mode.grid = grid; mode.originals = new Map(); mode.visibleCount = productCards(grid, mode.target).filter(card=>!card.hidden).length; }
    mode.grid.classList.add('cms-product-reorder-grid');
    mode.grid.classList.toggle('cms-category-reorder-grid',mode.kind === 'category');
    if (!mode.toolbar?.isConnected) {
      const toolbar = document.createElement('div'); toolbar.dataset.cmsChrome = ''; toolbar.className = 'cms-product-reorder-toolbar';
      const message = document.createElement('p'); message.textContent = mode.kind === 'category' ? `${productCards(grid, mode.target).length} categories — drag ${targetNoun(mode.target) === 'card' ? 'a card' : 'a ' + targetNoun(mode.target)} to its new position, or use the arrows.` : 'Drag products to rearrange — customers will see this exact order after publishing.';
      const done = document.createElement('button'); done.type = 'button'; done.dataset.cmsProductDone = ''; done.textContent = '✓ Done reordering';
      const status = document.createElement('span'); status.className = 'cms-product-order-status'; status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
      if (mode.kind === 'category') {
        toolbar.classList.add('cms-category-reorder-toolbar');
        // Cancel, Undo and Save order. Only the editor shell may write the
        // draft, so these ask for the same work the sidebar buttons do.
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'cms-category-cancel'; cancel.dataset.cmsCategoryCancel = ''; cancel.textContent = 'Cancel';
        const undo = document.createElement('button'); undo.type='button'; undo.dataset.cmsCategoryUndo=''; undo.textContent='↶ Undo'; undo.className='cms-category-undo'; undo.disabled = true;
        const save = document.createElement('button'); save.type = 'button'; save.className = 'cms-category-save'; save.dataset.cmsCategorySave = ''; save.dataset.cmsProductDone = ''; save.textContent = 'Save order';
        toolbar.append(message,cancel,undo,save,status);
      } else toolbar.append(message,done,status);
      grid.before(toolbar); mode.toolbar = toolbar; mode.status = status;
    }
    for (const card of productCards(grid, mode.target)) {
      if (!mode.originals.has(card)) mode.originals.set(card,{attributes:Object.fromEntries((mode.kind === 'category' ? ['tabindex','aria-label','href','role'] : ['tabindex','aria-label']).map(key=>[key,card.getAttribute(key)]))});
      card.hidden = false; card.classList.add('cms-product-reorder-card'); card.tabIndex = 0;
      if (mode.kind === 'category') { card.classList.add('cms-category-reorder-card'); card.removeAttribute('href'); card.setAttribute('role','group'); }
      if (!card.querySelector(':scope>.cms-product-position')) {
        const badge = document.createElement('span'); badge.className = 'cms-product-position'; badge.dataset.cmsChrome = ''; badge.setAttribute('aria-hidden','true');
        const controls = document.createElement('span'); controls.className = 'cms-product-order-controls'; controls.dataset.cmsChrome = '';
        const name = orderCardName(card);
        if (mode.kind === 'category') {
          badge.classList.add('cms-category-position'); controls.classList.add('cms-category-order-controls');
          // A visible handle, so it is obvious the whole card is the drag target.
          if (!card.querySelector(':scope>.cms-category-handle')) {
            const handle = document.createElement('span'); handle.className = 'cms-category-handle'; handle.dataset.cmsChrome = ''; handle.setAttribute('aria-hidden','true');
            handle.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
            card.insertBefore(handle, card.firstChild);
          }
        }
        for (const [delta,arrow,word] of [[-1,'↑','up'],[1,'↓','down']]) { const button = document.createElement('button'); button.type = 'button'; button.dataset.cmsProductMove = String(delta); if (mode.kind === 'category') button.dataset.cmsCategoryMove=String(delta); button.textContent = mode.kind === 'category' && mode.target === 'filter' ? arrow : `${arrow} Move ${word}`; button.setAttribute('aria-label',`Move ${name} ${word}`); button.title = `Move ${word}`; controls.append(button); }
        card.append(badge,controls);
      }
    }
    updateProductNumbers(); rememberProductLayout(); scheduleDraw();
  }
  function startProductMode(message) {
    if (window.CM_EDITOR_INTERACTIVE || !message.sectionId) return;
    endProductMode('switch',false); finishGesture(false); finishInline(true);
    clearCategoryReorderControls();
    const sectionNode = document.querySelector(`[data-cms-section="${CSS.escape(message.sectionId)}"]`), grid = sectionNode?.matches('.prod-grid') ? sectionNode : sectionNode?.querySelector('.prod-grid');
    const definition = window.CMCms?.document()?.sections.find(section=>section.id===message.sectionId);
    const cards = productCards(grid, 'product');
    const homeSection=templatePage==='home'&&(definition?.type==='productGrid'||definition?.content?.limit!==undefined);
    if ((!homeSection && (!productsPage || definition?.type !== 'native' || definition.source !== 'products:shop-layout')) || !grid || cards.length < 2 || new Set(cards.map(card=>Number(card.dataset.id))).size !== cards.length) { send('notice',{message:'Choose the shop section with at least two products to reorder.'}); send('product-reorder-state',{active:false,reason:'unavailable'}); return; }
    const category = typeof message.category === 'string' && message.category ? message.category : 'all';
    if(homeSection?category!=='section:'+message.sectionId:category!==currentCategory()||!categoryAllowed(category)){send('notice',{message:'Open the category you want to reorder first.'});send('product-reorder-state',{active:false,reason:'category'});return;}
    productMode = {kind:'product',target:'product',sectionId:message.sectionId,category,grid,visibleCount:cards.filter(card=>!card.hidden).length,originals:new Map(),toolbar:null,status:null,rects:new Map(),scrollX,scrollY};
    selected?.classList.remove('cms-selected'); hovered?.classList.remove('cms-hovered'); if (hoverLabel) hoverLabel.hidden = true;
    document.body.classList.add('cms-product-reordering'); refreshProductMode();
    send('product-reorder-state',{active:true,sectionId:message.sectionId,category,count:cards.length,ids:cards.map(card=>Number(card.dataset.id))});
  }
  function startCategoryMode(message) {
    const target = CATEGORY_TARGETS.has(message.target) ? message.target : 'grid';
    if (window.CM_EDITOR_INTERACTIVE) return;
    if (target === 'grid' && templatePage !== 'home') return;
    endProductMode('switch'); finishGesture(false); finishInline(true);
    clearCategoryReorderControls();
    // The header menu and the shop filter are shared chrome, so the editor may
    // address them without a section: the located container is the proof.
    const sectionId = typeof message.sectionId === 'string' && message.sectionId ? message.sectionId : null;
    const definition = sectionId ? window.CMCms?.document()?.sections.find(section=>section.id===sectionId) : null;
    const sectionNode = sectionId ? document.querySelector(`[data-cms-section="${CSS.escape(sectionId)}"]`) : null;
    const grid = (target === 'grid' && sectionNode ? sectionNode.querySelector('.home-category-grid') : null) || gridForTarget(target);
    const cards = productCards(grid, target);
    const supported = target === 'grid' ? definition?.type === 'native' && definition.source === 'home:shop-categories' : !!gridForTarget(target);
    if (!supported || cards.length < 2 || new Set(cards.map(orderCardId)).size !== cards.length) {
      send('notice',{message:'Choose Shop by Categories with at least two categories to reorder.'});
      send('category-reorder-state',{active:false,target,reason:'unavailable'}); return;
    }
    productMode = {kind:'category',target,sectionId,grid,visibleCount:cards.filter(card=>!card.hidden).length,originals:new Map(),toolbar:null,status:null,rects:new Map(),scrollX,scrollY};
    if(target==='menu'){
      // The menu normally floats over the page. Give its larger editing
      // controls their own space, then restore the exact original position.
      const anchor=document.createComment('category-menu-position');grid.before(anchor);
      const host=document.createElement('div');host.className='cms-category-menu-editor';host.dataset.cmsChrome='';
      document.getElementById('navbar').after(host);host.append(grid);
      productMode.menuHost=host;productMode.menuAnchor=anchor;
    }
    selected?.classList.remove('cms-selected'); hovered?.classList.remove('cms-hovered'); if (hoverLabel) hoverLabel.hidden=true;
    document.body.classList.toggle('cms-category-filter-editing',target==='filter');
    document.body.classList.add('cms-product-reordering','cms-category-reordering'); refreshProductMode();
    send('category-reorder-state',{active:true,sectionId,target,count:cards.length,ids:cards.map(orderCardId)});
  }
  function endProductMode(reason = 'done', notify = true) {
    if (!productMode) return;
    finishProductDrag(false); const mode = productMode; productMode = null;
    for (const animation of productAnimations.values()) animation.cancel(); productAnimations.clear();
    restoreProductDecorations(mode);
    if(mode.menuAnchor){mode.menuAnchor.replaceWith(mode.grid);mode.menuHost.remove();}
    document.body.classList.remove('cms-product-reordering','cms-product-dragging','cms-category-reordering','cms-category-filter-editing'); if(templatePage==='home')window.CMCms?.apply(window.CMCms.document());scheduleDraw();
    injectCategoryReorderControls();
    if (notify) send(reorderType(mode)+'-reorder-state',{active:false,sectionId:mode.sectionId,category:mode.category,reason});
  }
  function productPointerDown(event) {
    if (!productMode) return false;
    if (event.target.closest?.('[data-cms-product-done],[data-cms-product-move],[data-cms-category-undo],[data-cms-category-save],[data-cms-category-cancel]')) { event.stopImmediatePropagation(); return true; }
    const card = event.target.closest?.('.cms-product-reorder-card'); if (!card || card.parentElement !== productMode.grid || event.button !== 0 || event.isPrimary === false) return false;
    finishProductDrag(false);
    const rect = card.getBoundingClientRect();
    productDrag = {card,pointerId:event.pointerId,pointerType:event.pointerType,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,offsetX:event.clientX-rect.left,offsetY:event.clientY-rect.top,width:rect.width,height:rect.height,original:productCards(productMode.grid, productMode.target),ids:productIds(),moved:false,ghost:null};
    card.focus({preventScroll:true}); event.preventDefault(); event.stopImmediatePropagation(); return true;
  }
  function updateProductDrag() {
    productFrame = 0; const drag = productDrag; if (!drag || !productMode) return;
    if (!drag.moved && Math.hypot(drag.x-drag.startX,drag.y-drag.startY) < (drag.pointerType==='touch'?8:4)) return;
    if (!drag.moved) {
      drag.moved = true; createChrome();
      const ghost = drag.card.cloneNode(true); ghost.classList.remove('cms-product-reorder-card','cms-product-drag-placeholder'); ghost.classList.add('cms-product-drag-ghost'); ghost.dataset.cmsChrome = ''; ghost.setAttribute('aria-hidden','true'); ghost.removeAttribute('tabindex');
      if(productMode.kind==='category'&&productMode.target==='menu')ghost.classList.add('cms-category-menu-drag-ghost');
      ghost.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id')); ghost.querySelectorAll('button,a,input').forEach(node=>node.setAttribute('tabindex','-1')); ghost.querySelector('.cms-category-handle')?.remove();
      const appearance=getComputedStyle(drag.card);Object.assign(ghost.style,{width:drag.width+'px',height:drag.height+'px',fontFamily:appearance.fontFamily,color:appearance.color,lineHeight:appearance.lineHeight}); chrome.append(ghost); drag.ghost = ghost;
      drag.card.classList.add('cms-product-drag-placeholder'); const marker=document.createElement('span');marker.className='cms-product-insertion-marker';marker.dataset.cmsChrome='';marker.setAttribute('aria-hidden','true');marker.textContent=productMode.kind==='category'?'':'Drop here';drag.card.append(marker); document.body.classList.add('cms-product-dragging');
      try { document.documentElement.setPointerCapture(drag.pointerId); } catch { /* Capture may be unavailable on an older browser. */ }
      rememberProductLayout();
    }
    Object.assign(drag.ghost.style,{left:drag.x-drag.offsetX+'px',top:drag.y-drag.offsetY+'px'});
    let closest = -1, distance = Infinity; const cards = productCards(productMode.grid, productMode.target);
    cards.forEach((card,index)=>{const r=productMode.rects.get(card);if(!r)return;const x=r.left+r.width/2-(scrollX-productMode.scrollX),y=r.top+r.height/2-(scrollY-productMode.scrollY);const d=(x-drag.x)**2+(y-drag.y)**2;if(d<distance){distance=d;closest=index;}});
    if (closest >= 0 && reorderProductNode(drag.card,closest)) { const badge=drag.ghost.querySelector('.cms-product-position');if(badge)badge.textContent=String(closest+1); }
    if (!productScrollFrame) productScrollFrame = requestAnimationFrame(scrollProductDrag);
  }
  function scrollProductDrag() {
    productScrollFrame = 0; const drag = productDrag; if (!drag?.moved) return;
    const edge=64,dy=drag.y<edge?-Math.ceil((edge-drag.y)/5):drag.y>innerHeight-edge?Math.ceil((drag.y-(innerHeight-edge))/5):0;
    if (dy) { const before=scrollY;window.scrollBy(0,clamp(dy,-22,22));if(scrollY!==before)updateProductDrag(); }
    if (productDrag?.moved && !productScrollFrame) productScrollFrame=requestAnimationFrame(scrollProductDrag);
  }
  function productPointerMove(event) {
    if (!productDrag || event.pointerId !== productDrag.pointerId) return false;
    productDrag.x=event.clientX;productDrag.y=event.clientY;if(!productFrame)productFrame=requestAnimationFrame(updateProductDrag);event.preventDefault();event.stopImmediatePropagation();return true;
  }
  function finishProductDrag(commit) {
    if (!productDrag) return;
    if (productFrame) { cancelAnimationFrame(productFrame);productFrame=0;if(commit)updateProductDrag(); }
    if (productScrollFrame) cancelAnimationFrame(productScrollFrame);productScrollFrame=0;
    const drag=productDrag;productDrag=null;drag.ghost?.remove();drag.card.classList.remove('cms-product-drag-placeholder');drag.card.querySelector(':scope>.cms-product-insertion-marker')?.remove();document.body.classList.remove('cms-product-dragging');
    try { document.documentElement.releasePointerCapture(drag.pointerId); } catch { /* Capture may have ended already. */ }
    if (!productMode) return;
    if (!commit) { for(const card of drag.original)if(card.parentElement===productMode.grid)productMode.grid.append(card);updateProductNumbers();rememberProductLayout(); }
    else if (drag.moved) {
      swallowNextClick=true;const ids=productIds();if(JSON.stringify(ids)!==JSON.stringify(drag.ids))sendProductOrder();
      productNotice(`Moved ${orderCardName(drag.card)} to position ${ids.indexOf(orderCardId(drag.card))+1}.`);
    }
  }
  function productClick(event) {
    if (!productMode) return false;
    if(event.target.closest?.('[data-cms-category-undo]')){event.preventDefault();event.stopImmediatePropagation();finishProductDrag(false);send('shortcut',{action:'undo'});return true;}
    // Both buttons ask the editor shell: only it writes the draft and history.
    if(event.target.closest?.('[data-cms-category-save]')){event.preventDefault();event.stopImmediatePropagation();finishProductDrag(false);send('category-reorder-save',{sectionId:productMode.sectionId,target:productMode.target});return true;}
    if(event.target.closest?.('[data-cms-category-cancel]')){event.preventDefault();event.stopImmediatePropagation();finishProductDrag(false);send('category-reorder-cancel',{sectionId:productMode.sectionId,target:productMode.target});return true;}
    const done=event.target.closest?.('[data-cms-product-done]');if(done){event.preventDefault();event.stopImmediatePropagation();endProductMode('done');return true;}
    const button=event.target.closest?.('[data-cms-product-move]'),card=event.target.closest?.('.cms-product-reorder-card');
    if(!card||card.parentElement!==productMode.grid)return false;
    event.preventDefault();event.stopImmediatePropagation();if(swallowNextClick){swallowNextClick=false;return true;}
    if(button){const cards=productCards(productMode.grid, productMode.target);if(reorderProductNode(card,cards.indexOf(card)+Number(button.dataset.cmsProductMove))){sendProductOrder();productNotice(`Moved to position ${productCards(productMode.grid, productMode.target).indexOf(card)+1}.`);}}
    else card.focus({preventScroll:true});return true;
  }
  function productKey(event) {
    if (!productMode) return false;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();endProductMode('escape');return true;}
    const card=event.target.closest?.('.cms-product-reorder-card');if(!card||card.parentElement!==productMode.grid)return false;
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return false;
    event.preventDefault();event.stopImmediatePropagation();finishProductDrag(false);
    const cards=productCards(productMode.grid, productMode.target),index=cards.indexOf(card),first=cards[0]?.getBoundingClientRect();
    const columns=first?cards.filter(node=>Math.abs(node.getBoundingClientRect().top-first.top)<5).length:1;
    const next=event.key==='Home'?0:event.key==='End'?cards.length-1:index+({ArrowLeft:-1,ArrowRight:1,ArrowUp:-columns,ArrowDown:columns}[event.key]);
    if(reorderProductNode(card,next)){sendProductOrder();productNotice(`Moved to position ${productCards(productMode.grid, productMode.target).indexOf(card)+1}.`);card.focus({preventScroll:true});card.scrollIntoView({block:'nearest',behavior:'instant'});}return true;
  }
  function info() {
    const detail = selection && window.CMCms?.selectionInfo(selection.sectionId, selection.elementId); if (!detail || !selected) return detail;
    const css = getComputedStyle(selected); const computed = {};
    for (const key of ['fontFamily','fontSize','fontWeight','color','textAlign','opacity','width','height','paddingTop','paddingRight','paddingBottom','paddingLeft','gap','display','flexDirection']) computed[key] = css[key];
    if (selected.id === 'promoBar') {
      const item = selected.querySelector('.promo-bar__item'), group = selected.querySelector('.promo-bar__group');
      if (item) { const text = getComputedStyle(item); for (const key of ['fontFamily','fontSize','fontWeight','color','textAlign']) computed[key] = text[key]; }
      if (group) { const spacing = getComputedStyle(group); for (const key of ['paddingTop','paddingBottom','paddingLeft','paddingRight']) computed[key] = spacing[key]; }
      computed.minHeight = css.minHeight; computed.backgroundColor = css.backgroundColor;
      computed.gradientStart = css.getPropertyValue('--primary-deep').trim(); computed.gradientEnd = css.getPropertyValue('--primary').trim();
    }
    computed.fontFamily = computed.fontFamily.split(',')[0].trim().replace(/["']/g,'');
    return {...detail,computed};
  }
  const identify = node => {
    if (!(node instanceof Element) || node.closest('[data-cms-chrome]')) return null;
    const section = node.closest('[data-cms-section]'); if (!section) return null;
    if (section.id === 'promoBar' || node.closest('.prod-card')) return {sectionId:section.dataset.cmsSection,elementId:null,node:section};
    const element = node.closest('[data-cms-element]');
    const leaf = element && element !== section && section.contains(element) ? element : section;
    return { sectionId: section.dataset.cmsSection, elementId: leaf === section ? null : leaf.dataset.cmsElement, node: leaf };
  };
  function createChrome() {
    if (chrome) return;
    chrome = document.createElement('div'); chrome.dataset.cmsChrome = ''; chrome.className = 'cms-canvas-chrome';
    box = document.createElement('div'); box.className = 'cms-selection-box'; box.hidden = true;
    label = document.createElement('button'); label.type = 'button'; label.className = 'cms-selection-label'; label.dataset.cmsMove = ''; label.title = 'Drag to move'; box.append(label);
    for (const edge of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) { const handle = document.createElement('button'); handle.type = 'button'; handle.className = 'cms-resize-handle cms-handle-' + edge; handle.dataset.cmsResize = edge; handle.setAttribute('aria-label', 'Resize ' + ({nw:'top left',n:'top',ne:'top right',e:'right',se:'bottom right',s:'bottom',sw:'bottom left',w:'left'}[edge])); handle.title = 'Drag to resize · arrows also work'; box.append(handle); }
    // Compact actions for the current selection, pinned just above it. Editor
    // chrome only: it is never part of the page a visitor receives.
    actions = document.createElement('div'); actions.className = 'cms-action-bar'; actions.dataset.cmsChrome = ''; actions.hidden = true;
    guides = document.createElement('div'); guides.className = 'cms-alignment-guides'; guides.setAttribute('aria-hidden', 'true');
    hoverLabel = document.createElement('div'); hoverLabel.className = 'cms-hover-label'; hoverLabel.hidden = true; hoverLabel.setAttribute('aria-hidden', 'true');
    chrome.append(box, actions, guides, hoverLabel); document.body.append(chrome);
  }
  const actionDefs = () => {
    const detail = selection ? info() : null, isSection = !selection?.elementId;
    const global = /^global:(promo|header|footer)$/.test(window.CMCms.document()?.sections.find(item => item.id === selection?.sectionId)?.source || '');
    const kind = isSection ? (document.querySelector(`[data-cms-section="${CSS.escape(selection.sectionId)}"]`)?.dataset.cmsType || 'section') : (detail?.descriptor?.kind || 'element');
    const label = detail?.readOnlyText ? 'Product count' : (isSection ? 'Section' : ({text:'Text',heading:'Text',image:'Image',button:'Button',container:'Container',video:'Video',divider:'Divider',icon:'Icon'})[kind] || 'Element');
    const items = [{ tag: global ? 'Global · ' + label : label, plain: true }];
    if (isSection) {
      const section = document.querySelector(`[data-cms-section="${CSS.escape(selection.sectionId)}"]`);
      const region = section?.closest('[data-cms-region]')?.dataset.cmsRegion;
      const movable = !global && region !== 'header' && region !== 'footer';
      if (movable) items.push({ action: 'up', text: '↑', title: 'Move section up' }, { action: 'down', text: '↓', title: 'Move section down' }, { action: 'duplicate', text: 'Duplicate', title: 'Duplicate section' });
      items.push({ action: 'visibility', text: 'Hide', title: 'Hide section' });
      if (movable) items.push({ action: 'delete', text: 'Delete', title: 'Delete section', danger: true });
    } else if (!detail?.readOnlyText && (kind === 'text' || kind === 'heading' || kind === 'button')) {
      items.push({ action: 'edit-text', text: 'Edit', title: 'Edit this text' });
    } else if (kind === 'image') {
      items.push({ action: 'replace-image', text: 'Replace', title: 'Choose another image' });
    }
    return items;
  };
  function drawActions(rect) {
    if (!selection || !selected?.isConnected) { if (actions) actions.hidden = true; return; }
    const items = actionDefs();
    actions.hidden = items.length < 2;
    if (actions.hidden) return;
    actions.replaceChildren(...items.map(item => {
      if (item.plain) { const tag = document.createElement('span'); tag.className = 'cms-action-tag'; tag.textContent = item.tag; return tag; }
      const button = document.createElement('button'); button.type = 'button'; button.className = 'cms-action' + (item.danger ? ' is-danger' : '');
      button.dataset.cmsAction = item.action; button.textContent = item.text; button.title = item.title; button.setAttribute('aria-label', item.title);
      return button;
    }));
    const width = actions.offsetWidth || 240;
    // Keep the bar on screen when the selection sits against an edge.
    actions.style.left = clamp(rect.left + rect.width / 2 - width / 2, 4, Math.max(4, innerWidth - width - 4)) + 'px';
    actions.style.top = (rect.top < 40 ? rect.bottom + 8 : rect.top - 36) + 'px';
  }
  function draw() {
    pendingFrame = 0; createChrome();
    if (!selected?.isConnected || window.CM_EDITOR_INTERACTIVE || productMode) { box.hidden = true; if (actions) actions.hidden = true; return; }
    const rect = selected.getBoundingClientRect();
    box.hidden = !rect.width || !rect.height; box.classList.toggle('is-section', !selection.elementId); box.classList.toggle('is-text-editing', !!inline);
    Object.assign(box.style, {left:rect.left + 'px',top:rect.top + 'px',width:rect.width + 'px',height:rect.height + 'px'});
    const global = /^global:(promo|header|footer)$/.test(window.CMCms.document()?.sections.find(item => item.id === selection.sectionId)?.source || '');
    label.textContent = (global ? 'Global · ' : '') + (selected.dataset.cmsName || info()?.descriptor.name || 'Section').slice(0, 60);
    label.style.top = rect.top < 32 ? '4px' : '-27px';
    label.setAttribute('aria-label', global && !selection.elementId ? 'Global component — changes apply to all pages' : selection.elementId ? 'Move ' + label.textContent : 'Reorder ' + label.textContent);
    drawActions(rect);
  }
  function scheduleDraw() { if (!pendingFrame) pendingFrame = requestAnimationFrame(draw); }
  // The node the pointer actually hit is authoritative. Re-deriving it from the
  // {sectionId, elementId} pair alone resolves first-match-in-document-order,
  // so whenever a key is not unique inside its section the outline, the action
  // bar and the drag all bind to a different element than the one clicked.
  // Callers that only hold a stored selection (the cm:cms-applied handler, the
  // parent's select message, the mode handler) pass no node and still fall back
  // to the query.
  function resolveNode(target, hint) {
    if (hint instanceof Element && hint.isConnected) {
      const owner = hint.closest('[data-cms-section]');
      const claims = target.elementId && target.elementId !== 'eroot' ? hint.dataset.cmsElement === target.elementId : hint === owner;
      if (owner?.dataset.cmsSection === target.sectionId && claims) return hint;
    }
    const section = document.querySelector(`[data-cms-section="${CSS.escape(target.sectionId)}"]`);
    if (!target.elementId || target.elementId === 'eroot') return section;
    return section?.querySelector(`[data-cms-element="${CSS.escape(target.elementId)}"]`) || null;
  }
  function select(item, scroll = false, notify = false) {
    if (productMode && item?.sectionId !== productMode.sectionId) endProductMode('selection');
    if (inline && (item?.sectionId !== selection?.sectionId || item?.elementId !== selection?.elementId)) finishInline(true);
    selected?.classList.remove('cms-selected'); selected = null; selection = item?.sectionId ? {sectionId:item.sectionId, elementId:item.elementId || null} : null;
    if (selection) {
      selected = resolveNode(selection, item?.node);
      if (selection.elementId === 'eroot') selection.elementId = null;
      if (selected) {
        selected.classList.add('cms-selected');
        const details = selected.closest('details');
        if (details && !window.CM_EDITOR_INTERACTIVE) { if (!expandedDetails.has(details)) expandedDetails.set(details,details.open); details.open = true; }
        if (scroll) selected.scrollIntoView({behavior:'smooth',block:'center'});
      }
    }
    scheduleDraw(); if (notify) send('select', info() || selection || {sectionId:null,elementId:null});
  }
  function positionFor(descriptor) {
    const merged = window.CMResponsive.resolve(descriptor,device).effects.position || {};
    return {x:Number(merged.x) || 0,y:Number(merged.y) || 0,scale:Number(merged.scale) || 1};
  }
  function containerFor(node, descriptor) {
    const section = node.closest('[data-cms-section]');
    if (node === section) return section.parentElement || section;
    if (descriptor?.added && descriptor.parentId && descriptor.parentId !== 'eroot') return section.querySelector(`[data-cms-element="${CSS.escape(descriptor.parentId)}"]`) || section;
    return section;
  }
  function operation(action, extra = {}) { const detail = info(); if (detail) send('operation', {...detail,action,device,...extra}); }
  const inlineStyles = node => ['translate','scale','width','height','max-width','min-height','transition','display'].map(key => [key,node.style.getPropertyValue(key),node.style.getPropertyPriority(key)]);
  function restoreStyles(node, styles) { for (const [key,value,priority] of styles) { if (value) node.style.setProperty(key,value,priority); else node.style.removeProperty(key); } }
  function clearGuides() { guides?.replaceChildren(); document.querySelector('.cms-drop-target')?.classList.remove('cms-drop-target'); }
  function line(axis, value, start, end, reorder = false) {
    const node = document.createElement('div'); node.className = 'cms-alignment-line ' + (axis === 'x' ? 'is-vertical' : 'is-horizontal') + (reorder ? ' is-reorder' : '');
    Object.assign(node.style, axis === 'x' ? {left:value+'px',top:start+'px',height:Math.max(1,end-start)+'px'} : {top:value+'px',left:start+'px',width:Math.max(1,end-start)+'px'}); guides.append(node);
  }
  function snap(rect, container, axis) {
    const horizontal = axis === 'x', start = horizontal ? 'left' : 'top', end = horizontal ? 'right' : 'bottom', size = horizontal ? 'width' : 'height';
    const candidates = [container[start],container[start]+container[size]/2,container[end]];
    for (const node of gesture.siblings) { const r = node.getBoundingClientRect(); if (r.width && r.height) candidates.push(r[start],r[start]+r[size]/2,r[end]); }
    let best = null;
    for (const value of candidates) for (const edge of [rect[start],rect[start]+rect[size]/2,rect[end]]) { const delta = value-edge; if (Math.abs(delta) <= 6 && (!best || Math.abs(delta) < Math.abs(best.delta))) best = {value,delta}; }
    if (best) line(axis,best.value,Math.min(container[horizontal?'top':'left'],rect[horizontal?'top':'left']),Math.max(container[horizontal?'bottom':'right'],rect[horizontal?'bottom':'right']));
    return best?.delta || 0;
  }
  function beginGesture(event, kind, edge = '') {
    if (!selected || inline || window.CM_EDITOR_INTERACTIVE || event.button !== 0) return;
    const details = info(); if (!details) return;
    if (!selection.elementId && kind !== 'resize') {
      const section = window.CMCms.document()?.sections.find(item => item.id === selection.sectionId);
      if (/^global:(promo|header|footer)$/.test(section?.source || '') || (section?.region || 'main') !== 'main') { send('notice',{message:'Global components stay in place. Select an element inside them to move it.'}); return; }
      kind = 'reorder';
    }
    const rect = selected.getBoundingClientRect(), container = containerFor(selected, details.descriptor);
    gesture = {kind,edge,node:selected,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,rect,container,position:positionFor(details.descriptor),styles:inlineStyles(selected),width:selected.offsetWidth || rect.width,height:selected.offsetHeight || rect.height,moved:false,siblings:[...container.querySelectorAll('[data-cms-element]')].filter(node => node !== selected && !selected.contains(node) && !node.contains(selected) && node.getBoundingClientRect().width).slice(0,100)};
    document.body.classList.add('cms-manipulating');
    event.preventDefault(); event.stopImmediatePropagation();
  }
  function moveGesture(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const g = gesture, dx = event.clientX-g.startX, dy = event.clientY-g.startY;
    if (!g.moved && Math.hypot(dx,dy) < 3) return;
    if (!g.moved) { try { document.documentElement.setPointerCapture(event.pointerId); } catch { /* Mouse capture is optional in older browsers. */ } }
    g.moved = true; clearGuides(); g.node.style.setProperty('transition','none','important'); if (g.node.hasAttribute('data-cms-inline')) g.node.style.setProperty('display','inline-block','important');
    if (g.kind === 'reorder') {
      const sections = [...document.querySelectorAll('#view>[data-cms-section]')].filter(node => node !== selected);
      const before = sections.find(node => event.clientY < node.getBoundingClientRect().top + node.getBoundingClientRect().height/2);
      g.beforeSectionId = before?.dataset.cmsSection || null;
      const r = before?.getBoundingClientRect() || sections.at(-1)?.getBoundingClientRect() || g.rect;
      line('y',before?r.top:r.bottom,Math.max(8,r.left),Math.min(innerWidth-8,r.right),true);
      if (event.clientY < 50) window.scrollBy(0,-12); else if (event.clientY > innerHeight-50) window.scrollBy(0,12);
    } else if (g.kind === 'move') {
      const c = g.container.getBoundingClientRect();
      let mx = clamp(dx,c.left-g.rect.left,c.right-g.rect.right), my = clamp(dy,c.top-g.rect.top,c.bottom-g.rect.bottom);
      const r = {left:g.rect.left+mx,right:g.rect.right+mx,top:g.rect.top+my,bottom:g.rect.bottom+my,width:g.rect.width,height:g.rect.height};
      if (!event.altKey) { mx += snap(r,c,'x'); my += snap(r,c,'y'); }
      mx = clamp(mx,c.left-g.rect.left,c.right-g.rect.right); my = clamp(my,c.top-g.rect.top,c.bottom-g.rect.bottom);
      g.result = {position:{...g.position,x:round(clamp(g.position.x+mx,-1000,1000)),y:round(clamp(g.position.y+my,-1000,1000))}};
      g.node.style.setProperty('translate',`${g.result.position.x}px ${g.result.position.y}px`,'important');
    } else {
      const c = g.container.getBoundingClientRect(); const scale = g.position.scale;
      const horizontal = /[ew]/.test(g.edge), vertical = /[ns]/.test(g.edge);
      let width = horizontal ? Math.max(16,g.width+(g.edge.includes('w')?-dx:dx)/scale) : g.width;
      let height = vertical ? Math.max(16,g.height+(g.edge.includes('n')?-dy:dy)/scale) : g.height;
      const keepRatio = /^(IMG|VIDEO)$/.test(g.node.tagName) && horizontal && vertical && !event.shiftKey;
      if (keepRatio) { if (Math.abs(dx) >= Math.abs(dy)) height = width*g.height/g.width; else width = height*g.width/g.height; }
      width = Math.min(width,Math.max(16,c.width/scale)); height = Math.min(height,Math.max(16,c.height/scale));
      if (keepRatio) { const ratio = Math.min(width/g.width,height/g.height); width = g.width*ratio; height = g.height*ratio; }
      const movedX = g.edge.includes('w') ? (g.width-width)*scale : 0, movedY = g.edge.includes('n') ? (g.height-height)*scale : 0;
      const p = {...g.position,x:round(clamp(g.position.x+movedX,-1000,1000)),y:round(clamp(g.position.y+movedY,-1000,1000))};
      const styles = {width:round(width)+'px',height:round(height)+'px'};
      g.node.style.setProperty('width',styles.width,'important'); g.node.style.setProperty('height',styles.height,'important'); g.node.style.setProperty('max-width','none','important'); g.node.style.setProperty('min-height','0','important'); g.node.style.setProperty('translate',`${p.x}px ${p.y}px`,'important');
      const after = g.node.getBoundingClientRect(); p.x = round(p.x+clamp(0,c.left-after.left,c.right-after.right)); p.y = round(p.y+clamp(0,c.top-after.top,c.bottom-after.bottom));
      g.node.style.setProperty('translate',`${p.x}px ${p.y}px`,'important');
      g.result = selection.elementId ? {position:p,styles:{...styles,maxWidth:styles.width,minHeight:'0px'}} : {styles:{height:styles.height,minHeight:'0px'}};
    }
    scheduleDraw(); event.preventDefault();
  }
  function finishGesture(commit) {
    if (!gesture) return;
    const g = gesture; gesture = null; clearGuides(); document.body.classList.remove('cms-manipulating');
    try { document.documentElement.releasePointerCapture(g.pointerId); } catch { /* The browser may have released it already. */ }
    restoreStyles(g.node,g.styles);
    if (commit && g.moved) { swallowNextClick = true; if (g.kind === 'reorder') operation('reorder',{beforeSectionId:g.beforeSectionId}); else if (g.result) operation(g.kind,g.result); }
    scheduleDraw();
  }
  function beginInline(replace = null) {
    if (info()?.readOnlyText) return;
    const detail = info(); if (!selected || !detail || !['text','heading','button'].includes(detail.descriptor.kind) || !selection.elementId || inline) return;
    inline = {node:selected,text:selected.textContent,children:[...selected.childNodes].map(node=>node.cloneNode(true)),editable:selected.getAttribute('contenteditable'),tabindex:selected.getAttribute('tabindex')};
    selected.setAttribute('contenteditable','plaintext-only'); selected.setAttribute('tabindex','0'); selected.classList.add('cms-inline-editing'); selected.focus({preventScroll:true});
    const range = document.createRange(); range.selectNodeContents(selected); const selectionRange = window.getSelection(); selectionRange.removeAllRanges(); selectionRange.addRange(range);
    if (replace !== null) { selected.textContent = replace; range.selectNodeContents(selected); range.collapse(false); selectionRange.removeAllRanges(); selectionRange.addRange(range); }
    scheduleDraw();
  }
  function finishInline(commit) {
    if (!inline) return;
    const editing = inline; inline = null; const text = editing.node.innerText.replace(/\r\n/g,'\n').slice(0,20000);
    editing.node.classList.remove('cms-inline-editing');
    for (const [name,value] of [['contenteditable',editing.editable],['tabindex',editing.tabindex]]) { if (value === null) editing.node.removeAttribute(name); else editing.node.setAttribute(name,value); }
    if (!commit) editing.node.replaceChildren(...editing.children); else if (text !== editing.text) operation('text',{text});
    scheduleDraw();
  }
  function nudge(dx,dy,resize = false) {
    if (!selected || !selection.elementId || inline) return;
    const details = info(), p = positionFor(details.descriptor), rect = selected.getBoundingClientRect(), c = containerFor(selected,details.descriptor).getBoundingClientRect();
    if (resize) operation('resize',{position:p,styles:{width:round(clamp(selected.offsetWidth+dx,16,c.width/p.scale))+'px',height:round(clamp(selected.offsetHeight+dy,16,c.height/p.scale))+'px'}});
    else operation('move',{position:{...p,x:round(clamp(p.x+clamp(dx,c.left-rect.left,c.right-rect.right),-1000,1000)),y:round(clamp(p.y+clamp(dy,c.top-rect.top,c.bottom-rect.bottom),-1000,1000))},group:'nudge'});
  }
  document.addEventListener('cm:cms-ready', event => {
    if (pendingProductCategory?.awaiting) return;
    endProductMode('page'); expandedDetails.clear(); document.body.classList.add('cms-editing'); document.body.classList.toggle('cms-products-editing',productsPage); createChrome(); select(null); injectCategoryReorderControls();
    if(productsPage&&!categoryAllowed(currentCategory())){if(pendingProductCategory)categoryRefreshFailed('This category is no longer available. Choose another category.','category-unavailable');location.hash=baseRoute;return;}
    pendingProductCategory = null;
    send('ready',{...event.detail,category:currentCategory()});
  });
  document.addEventListener('cm:cms-applied', () => { if (!gesture && !inline && selection) select(selection); if(productMode)refreshProductMode(); else injectCategoryReorderControls(); scheduleDraw(); });
  window.addEventListener('message', event => {
    if (event.origin !== origin || event.source !== parent || event.data?.channel !== 'cm-editor') return;
    const message = event.data;
    if (message.type === 'apply') { finishProductDrag(false); if (gesture) finishGesture(false); if (inline) finishInline(false); window.CMCms?.apply(message.document); }
    if (message.type === 'select') select(message,true);
    if (message.type === 'device' && devices.includes(message.device)) { endProductMode('device'); finishGesture(false); finishInline(true); device = message.device; injectCategoryReorderControls(); scheduleDraw();requestAnimationFrame(()=>{if(selected)send('select',info()||{});}); }
    if (message.type === 'product-reorder') { if(message.active===true)startProductMode(message);else endProductMode('done'); }
    if (message.type === 'category-reorder') { if(message.active===true)startCategoryMode(message);else if(productMode?.kind==='category')endProductMode('done'); }
    if (message.type === 'category-order-preview' && Array.isArray(message.ids)) {
      window.CMApplyCategoryOrder?.(message.ids);
      if(productMode?.kind==='category')refreshProductMode();
      const grid=document.querySelector('.home-category-grid');
      if(grid){const cards=new Map([...grid.children].map(card=>[card.dataset.categoryId,card]));for(const id of message.ids)if(cards.has(id))grid.append(cards.get(id));}
    }
    if (message.type === 'category-reorder-state' && productMode?.kind === 'category' && message.active === true) { const undo=productMode.toolbar?.querySelector('[data-cms-category-undo]'); if(undo)undo.disabled=message.undo!==true; }
    if (message.type === 'product-category') void changeProductCategory(message);
    if (message.type === 'edit-text') beginInline();
    if (message.type === 'nudge') { const amount = clamp(Number(message.amount)||10,1,100), directions = {left:[-amount,0],right:[amount,0],up:[0,-amount],down:[0,amount]}; const [x,y] = directions[message.direction] || [Number(message.x)||0,Number(message.y)||0]; nudge(x,y,message.resize===true); }
    if (message.type === 'mode') {
      endProductMode('preview');
      finishGesture(false); finishInline(true); window.CM_EDITOR_INTERACTIVE = message.interactive === true;
      if (window.CM_EDITOR_INTERACTIVE) clearCategoryReorderControls(); else injectCategoryReorderControls();
      document.body.classList.toggle('cms-editing',!window.CM_EDITOR_INTERACTIVE); document.body.classList.toggle('cms-products-editing',productsPage&&!window.CM_EDITOR_INTERACTIVE); hovered?.classList.remove('cms-hovered'); if (hoverLabel) hoverLabel.hidden = true;
      if (window.CM_EDITOR_INTERACTIVE) { for (const [node,wasOpen] of expandedDetails) if (node.isConnected) node.open = wasOpen; expandedDetails.clear(); }
      else if (selection) select(selection);
      scheduleDraw();
    }
    if (message.type === 'drag-payload') incoming = message.payload || null;
  });
  // Registered before the other pointer handlers, so a stale flag from an
  // earlier gesture can never survive into a new interaction.
  window.addEventListener('hashchange', clearCategoryReorderControls);
  window.addEventListener('popstate', clearCategoryReorderControls);
  document.addEventListener('pointerdown', () => { swallowNextClick = false; }, true);
  document.addEventListener('pointerdown', event => {
    if(productPointerDown(event))return;
    if (window.CM_EDITOR_INTERACTIVE || inline?.node.contains(event.target)) return;
    if (inline) finishInline(true);
    const handle = event.target.closest?.('[data-cms-resize]');
    if (handle) { beginGesture(event,'resize',handle.dataset.cmsResize); return; }
    if (event.target.closest?.('[data-cms-move]')) { beginGesture(event,'move'); return; }
    const item = identify(event.target); if (!item || event.button !== 0) return;
    select(item,false,true); if (item.elementId) beginGesture(event,'move');
  },true);
  document.addEventListener('pointermove',event=>{if(!productPointerMove(event))moveGesture(event);},true);
  document.addEventListener('pointerup',event=>{if(productDrag&&event.pointerId===productDrag.pointerId){finishProductDrag(true);event.preventDefault();event.stopImmediatePropagation();return;}if(gesture&&event.pointerId===gesture.pointerId)finishGesture(true);},true);
  document.addEventListener('pointercancel',()=>{finishProductDrag(false);finishGesture(false);},true);
  window.addEventListener('blur',()=>{finishProductDrag(false);finishGesture(false);if(inline)finishInline(true);});
  document.addEventListener('focusout',event=>{if(inline&&event.target===inline.node)finishInline(true);},true);
  document.addEventListener('input',event=>{if(inline?.node.contains(event.target))scheduleDraw();},true);
  document.addEventListener('dblclick',event=>{if(window.CM_EDITOR_INTERACTIVE||productMode)return;const item=identify(event.target);if(item){event.preventDefault();event.stopImmediatePropagation();select(item,false,true);beginInline();}},true);
  document.addEventListener('pointerover',event=>{
    if(window.CM_EDITOR_INTERACTIVE||gesture||inline||productMode)return;const item=identify(event.target);hovered?.classList.remove('cms-hovered');hovered=item?.node;
    if(hovered&&hovered!==selected){hovered.classList.add('cms-hovered');createChrome();const r=hovered.getBoundingClientRect();hoverLabel.textContent=hovered.dataset.cmsName||'Section';hoverLabel.style.left=clamp(r.left,4,innerWidth-224)+'px';hoverLabel.style.top=Math.max(4,r.top-26)+'px';hoverLabel.hidden=false;}else if(hoverLabel)hoverLabel.hidden=true;
  },true);
  document.addEventListener('pointerout',event=>{if(!event.relatedTarget&&hoverLabel)hoverLabel.hidden=true;},true);
  window.addEventListener('scroll',()=>{if(hoverLabel)hoverLabel.hidden=true;scheduleDraw();},{passive:true});
  window.addEventListener('resize',scheduleDraw,{passive:true});
  document.addEventListener('load',scheduleDraw,true);
  document.addEventListener('keydown',event=>{
    const command=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();
    const action=command?(key==='s'?'save':key==='y'||key==='z'&&event.shiftKey?'redo':key==='z'?'undo':''):'';
    if(action){finishProductDrag(false);finishInline(true);event.preventDefault();event.stopImmediatePropagation();send('shortcut',{action});return;}
    if(window.CM_EDITOR_INTERACTIVE)return;
    const categoryControl=productsPage&&!event.target.closest?.(ORDER_CHROME)&&event.target.closest?.('[data-cat],[data-fcat],[data-fclear="cats"],[data-fclear="all"]');
    if(categoryControl&&(event.key==='Enter'||event.key===' ')){event.preventDefault();event.stopImmediatePropagation();categoryControl.click();return;}
    if(productKey(event))return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(gesture)finishGesture(false);else if(inline)finishInline(false);else select(null,false,true);return;}
    if(inline){if(event.key==='Enter'&&(command||inline.node.tagName==='A')){event.preventDefault();finishInline(true);}return;}
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)&&selected){event.preventDefault();const step=event.shiftKey?10:1;const dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0;if(!selection.elementId){if(dy)operation('reorder',{delta:Math.sign(dy)});}else nudge(dx,dy,!!event.target.closest?.('[data-cms-resize]'));return;}
    if((event.key==='Enter'||event.key==='F2')&&selected){event.preventDefault();beginInline();return;}
    if((event.key==='Delete'||event.key==='Backspace')&&selected){event.preventDefault();operation('delete');return;}
    if(event.key.length===1&&!command&&!event.altKey&&selected){event.preventDefault();beginInline(event.key);}
  },true);
  // The per-section Reorder control asks the editor shell to switch on the
  // existing sortable mode for exactly this surface.
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-cms-category-reorder-start]');
    if (!button || window.CM_EDITOR_INTERACTIVE || productMode) return;
    event.preventDefault(); event.stopImmediatePropagation();
    send('category-reorder-request',{sectionId:button.dataset.cmsCategoryReorderStart || null,target:button.dataset.cmsCategoryTarget});
  }, true);
  // The floating action bar reuses the parent's existing handlers; the preview
  // never edits the document itself.
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-cms-action]');
    if (!button || window.CM_EDITOR_INTERACTIVE || productMode || !selection) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const action = button.dataset.cmsAction;
    if (action === 'edit-text') { send('edit-text'); return; }
    if (action === 'replace-image') { send('open-media', { scope: 'element' }); return; }
    send('section-action', { action, sectionId: selection.sectionId });
  }, true);
  document.addEventListener('click',event=>{
    if(productClick(event))return;
    if(!window.CM_EDITOR_INTERACTIVE&&productsPage&&!event.target.closest?.(ORDER_CHROME)){
      const category=event.target.closest?.('[data-cat]'),checkbox=event.target.closest?.('[data-fcat]')||event.target.closest?.('.check-row')?.querySelector('[data-fcat]'),clear=event.target.closest?.('[data-fclear="cats"],[data-fclear="all"]');
      if(category||checkbox||clear){event.preventDefault();event.stopImmediatePropagation();endProductMode('category');const id=category?category.dataset.cat||'all':checkbox?(checkbox.value===currentCategory()?'all':checkbox.value):'all';send('product-category',{category:id});return;}
    }
    if(!window.CM_EDITOR_INTERACTIVE){if(inline?.node.contains(event.target))return;event.preventDefault();event.stopImmediatePropagation();if(swallowNextClick){swallowNextClick=false;return;}if(event.target.closest?.('[data-cms-chrome]'))return;const item=identify(event.target);if(item)select(item,false,true);return;}
    const link=event.target.closest?.('a[href]');if(!link)return;const url=new URL(link.href,location.href),hash=url.hash;
    if(url.origin!==origin||!hash.startsWith('#/')){event.preventDefault();event.stopImmediatePropagation();send('notice',{message:'External links are available on the live website.'});return;}
    const route=hash.slice(2).split(/[/?]/)[0]||'home';event.preventDefault();event.stopImmediatePropagation();if(allowedPages.has(route))send('navigate',{page:route,hash});else send('notice',{message:'Checkout and account actions remain on the live storefront.'});
  },true);
  const dropContainer = event => {
    const item=identify(event.target);if(!item)return null;const section=event.target.closest('[data-cms-section]');let node=item.node;
    while(node&&node!==section){const detail=window.CMCms?.selectionInfo(item.sectionId,node.dataset.cmsElement);if(detail?.descriptor.kind==='container'&&/^(DIV|SECTION|HEADER)$/.test(node.tagName))break;node=node.parentElement?.closest('[data-cms-element]');}
    node=node&&section.contains(node)?node:section;const r=node.getBoundingClientRect(),containerId=node===section?'eroot':node.dataset.cmsElement;return{sectionId:item.sectionId,elementId:item.elementId,parentId:containerId,containerId,x:round(event.clientX-r.left),y:round(event.clientY-r.top),node};
  };
  document.addEventListener('dragover',event=>{if(window.CM_EDITOR_INTERACTIVE)return;if(!incoming&&!Array.from(event.dataTransfer?.types||[]).includes('application/x-cm-element'))return;event.preventDefault();event.dataTransfer.dropEffect='copy';clearGuides();const target=dropContainer(event);target?.node.classList.add('cms-drop-target');},true);
  document.addEventListener('dragleave',event=>{if(!event.relatedTarget)clearGuides();},true);
  document.addEventListener('drop',event=>{
    if(window.CM_EDITOR_INTERACTIVE)return;let payload=incoming;try{const raw=event.dataTransfer?.getData('application/x-cm-element');if(raw)payload=JSON.parse(raw);}catch{payload=null;}if(!payload)return;event.preventDefault();event.stopImmediatePropagation();clearGuides();incoming=null;
    const target=dropContainer(event);if(target){const {node,...location}=target;send('drop',{...location,device,payload});}
  },true);
  document.addEventListener('dragstart',event=>{if(productMode&&event.target.closest?.('.cms-product-reorder-card')){event.preventDefault();event.stopImmediatePropagation();}},true);
  document.addEventListener('dragend',()=>{incoming=null;clearGuides();},true);
  document.addEventListener('submit',event=>{event.preventDefault();event.stopImmediatePropagation();send('notice',{message:'Forms are available on the live storefront.'});},true);
  // Preview may read existing content. All writes go through the authenticated editor.
  const originalFetch=window.fetch.bind(window);
  window.fetch=(input,options={})=>{const method=String(options.method||(input instanceof Request?input.method:'GET')).toUpperCase();if(!['GET','HEAD'].includes(method))return Promise.resolve(new Response(JSON.stringify({ok:false,error:'EDITOR_PREVIEW_READ_ONLY'}),{status:403,headers:{'Content-Type':'application/json'}}));return originalFetch(input,options);};
})();
