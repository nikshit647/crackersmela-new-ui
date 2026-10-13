/* Structured overrides for the existing storefront. No editor UI or private drafts. */
(() => {
  'use strict';
  const pageNames = new Set(['home', 'products', 'product', 'price-list', 'about', 'contact', 'faq', 'wholesale', 'shipping', 'returns', 'safety', 'terms', 'privacy']);
  const styleNames = new Set('fontFamily fontSize fontWeight lineHeight letterSpacing textAlign color backgroundColor paddingTop paddingRight paddingBottom paddingLeft marginTop marginRight marginBottom marginLeft width maxWidth minHeight height borderRadius borderWidth borderColor borderStyle boxShadow display gap gridTemplateColumns flexDirection alignItems justifyContent objectFit objectPosition opacity zIndex'.split(' '));
  // Account controls and signed-in identity stay owned by the live storefront.
  const commerce = '.prod-card,.prod-toolbar,.shop-sidebar,.filter-card,.chip-row,.prod-price-big,.savings-note,.stock-line,.qty-stepper,.rating-row,.hero-stats,.hero-shot,.hero-shot__tag,#plTable tbody,form,input,select,textarea,[data-add],[data-wish],[data-qty],[data-del],#pdQty,#cartBtn,#wishBtn,#userIconBtn,#cartCount,#wishCount,#accountChip,#accountArea,#navCatMenu';
  const state = { page: '', templatePage: '', baseline: null, sources: new Map(), instances: new Map(), documents: new Map(), published: new Map(), request: 0, style: null, cardOrders: new WeakMap(), categoryOrders: new WeakMap(), blockOrders: new WeakMap() };
  const clone = value => JSON.parse(JSON.stringify(value));
  const safeId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value);
  const cssId = value => CSS.escape(String(value));
  const emptyStyles = () => ({ desktop: {}, tablet: {}, mobile: {} });
  const safeUrl = (value, image = false) => {
    if (typeof value !== 'string' || /[\u0000-\u001f\\]/.test(value)) return '';
    const raw = value.trim();
    if (!raw || raw.startsWith('//')) return '';
    if (/^(?:https?:|mailto:|tel:)/i.test(raw)) {
      if (image && !/^https:\/\/(?:admin\.)?crackersmela\.com\/(?:images|uploads)\//i.test(raw)) return '';
      return raw;
    }
    if (image && !/^\/?(?:images|uploads)\//.test(raw)) return '';
    return /^[#/?A-Za-z0-9._-]/.test(raw) && !/^[^/?#]*:/.test(raw) && !/(?:^|\/)\.\.(?:\/|$)/.test(raw) ? raw : '';
  };
  const videoUrl = value => { const url = safeUrl(value); if (!url) return ''; try { const parsed = new URL(url, location.origin); return /\.(?:mp4|webm|ogv)$/i.test(parsed.pathname) && (url.startsWith('https://') || /^\/?uploads\//.test(url)) ? url : ''; } catch { return ''; } };
  const iconPaths = { star: 'm12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.2-5.7-3-5.7 3 1.1-6.2L3.2 9.6l6.3-.9Z', heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z', sparkle: 'm12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8Z', check: 'm4 12 5 5L20 6', gift: 'M3 9h18v4H3zM5 13v8h14v-8M12 9v12M12 9H7a3 3 0 1 1 3-3l2 3Zm0 0h5a3 3 0 1 0-3-3l-2 3Z', phone: 'M5 3h4l2 5-3 2a15 15 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A18 18 0 0 1 3 5a2 2 0 0 1 2-2Z', mail: 'M3 5h18v14H3zM3 5l9 7 9-7', location: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z', 'arrow-right': 'M3 12h18m-7-7 7 7-7 7' };
  const pageContext = () => ({ id: metaValue('meta[name="cm-page-id"]'), templatePage: metaValue('meta[name="cm-page-template"]'), name: metaValue('meta[name="cm-page-name"]'), slug: metaValue('meta[name="cm-page-slug"]') });
  const customId = value => /^custom-[a-f0-9]{32}$/.test(value || '');
  const pageId = route => route?.cmsId || (route?.name === 'content' ? route.params?.[0] : route?.name === 'priceList' ? 'price-list' : route?.name);
  function resolveRoute(raw, routes) {
    const context = pageContext();
    const requestedSlug = /^#\/page\/([a-z0-9-]+)$/.exec(raw.split('?')[0])?.[1];
    if (requestedSlug && requestedSlug !== context.slug && !window.CM_EDITOR_PREVIEW) { location.assign('/' + requestedSlug); return { name: 'cmsRedirect', re: /[\s\S]*/, view: () => '' }; }
    if (customId(context.id) && raw === '#/' && location.hash === '#/' && !window.CM_EDITOR_PREVIEW) { location.assign('/'); return { name: 'cmsRedirect', re: /[\s\S]*/, view: () => '' }; }
    if (!customId(context.id) || (raw !== '#/' && requestedSlug !== context.slug)) return null;
    const templatePage = pageNames.has(context.templatePage) ? context.templatePage : 'custom';
    const path = templatePage === 'home' ? '#/' : templatePage === 'product' ? window.CMStorefront?.firstProductRoute() || '#/product/p-26' : '#/' + templatePage;
    const template = routes.find(route => new RegExp('^' + route.re.source + '$').test(path));
    const params = template ? new RegExp('^' + template.re.source + '$').exec(path).slice(1) : [];
    return { name: template?.name || 'cms', re: /[\s\S]*/, cmsId: context.id, templatePage, cmsParams: params, view: route => template ? template.view(route) : '' };
  }
  const titleOf = node => node.getAttribute('aria-label') || node.querySelector('h1,h2,h3')?.textContent.trim() || node.id || node.classList[0] || node.tagName.toLowerCase();
  const attr = (node, name, value) => { if (value === null || value === undefined) node.removeAttribute(name); else if (node.getAttribute(name) !== String(value)) node.setAttribute(name, String(value)); };
  function setText(node, value) {
    if (typeof value !== 'string') return;
    if (!node.matches('.hero-lede')) { if (node.textContent !== value) node.textContent = value; return; }
    // Home's server and storefront render authored paragraph newlines as BRs.
    // Match that layout with text nodes, keeping saved copy out of HTML parsing.
    const lines = value.split(/\r\n?|\n/), children = [...node.childNodes];
    if (children.length === lines.length * 2 - 1 && children.every((child, index) => index % 2 ? child.nodeName === 'BR' : child.nodeType === Node.TEXT_NODE && child.textContent === lines[index / 2])) return;
    node.replaceChildren(...lines.flatMap((line, index) => [...(index ? [document.createElement('br')] : []), document.createTextNode(line)]));
  }
  // Keep category/search copy current while retaining the heading containers for layout edits.
  const listingText = node => state.routeSeo && state.page === 'products' && node.closest('.page-head>h1,.page-head>p');
  const heroStatistic = node => node.matches('.hero-stats > .stat');
  function editable(node) {
    // Category illustrations are decorative for visitors but still editable.
    if (node.matches('.home-category-card__art img[data-image-category]')) return true;
    if (node.closest('svg,canvas,script,style,[aria-hidden="true"]')) return false;
    if (node.closest(commerce)) return false;
    if (listingText(node)) return false;
    if (state.templatePage === 'product' && node.closest('.prod-detail__media,.prod-detail__info>h1,.desc-note,.prod-card__cat,.badge-row,.crumbs')) return false;
    return true;
  }
  function record(node, descriptor) {
    return { node, descriptor, original: { text: descriptor.text, children: descriptor.text === undefined ? [] : [...node.childNodes].map(child => child.cloneNode(true)), src: node.getAttribute('src'), alt: node.getAttribute('alt'), href: node.getAttribute('href'), target: node.getAttribute('target'), rel: node.getAttribute('rel'), hidden: node.hidden } };
  }
  function collectElements(root) {
    const entries = new Map();
    function walk(node, path) {
      if (!(node instanceof HTMLElement)) return;
      // Existing product documents style the media container at e0. The
      // gallery wrapper and its catalog-owned controls must not change that ID.
      if (state.templatePage === 'product' && node.matches('[data-product-gallery]')) {
        const stage = node.querySelector('[data-gallery-stage]');
        if (stage) walk(stage, path);
        return;
      }
      const key = node.matches('.home-category-card__art img[data-image-category]') ? 'category:' + node.dataset.imageCategory + ':image' : `e${path.length ? path.join('.') : 'root'}`;
      const isImage = node.tagName === 'IMG';
      const isLink = node.tagName === 'A';
      const permitted = editable(node);
      const statistic = heroStatistic(node);
      let kind = 'container';
      if (permitted && isImage) kind = 'image';
      else if (permitted && (isLink || node.tagName === 'BUTTON')) kind = 'button';
      else if (permitted && /^(H[1-6]|P|SPAN|STRONG|B|SMALL|LI|SUMMARY|LABEL)$/.test(node.tagName) && !node.children.length && node.textContent.trim()) kind = 'text';
      // Text that shares a heading with an accent or an icon gets its own span.
      // This leaves the current typography and inline markup intact.
      if (permitted && node.children.length && /^(H[1-6]|P|SPAN|STRONG|SMALL|SUMMARY|LI)$/.test(node.tagName)) {
        [...node.childNodes].forEach(child => {
          if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
            const span = document.createElement('span'); span.dataset.cmsText = ''; child.replaceWith(span); span.appendChild(child);
          }
        });
      }
      // Register the existing pill and statistic wrappers without inserting any
      // nodes: saved child-index IDs and independent text positions stay valid.
      const allowContainer = node === root || node.matches('.hero-shot') || permitted && (/^(DIV|SECTION|HEADER|H[1-6]|P|UL|DETAILS)$/.test(node.tagName) || node.matches('.hero-eyebrow')) || statistic || state.templatePage === 'product' && node.matches('.prod-detail__media,.prod-detail__info,.prod-detail__info>h1,.desc-note') || listingText(node) && node.matches('h1,p');
      if (kind !== 'container' || allowContainer) {
        const descriptor = { kind, name: (node.dataset.cmsText !== undefined ? 'Text' : titleOf(node)).slice(0, 160), styles: emptyStyles(), hover: {}, animation: {} };
        if (statistic) descriptor.name = ((node.querySelector('.lbl')?.textContent.trim() || 'Hero') + ' statistic').slice(0, 160);
        if (kind === 'text') descriptor.name = node.textContent.trim().slice(0, 80);
        if (kind === 'text' || kind === 'button' && !node.querySelector('img')) descriptor.text = node.textContent;
        if (kind === 'image') { descriptor.src = node.getAttribute('src') || ''; descriptor.alt = node.getAttribute('alt') || ''; }
        if (kind === 'button' && isLink) {
          let href = node.getAttribute('href') || '';
          try { const url = new URL(href, location.href); if (['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:') href = url.hash || url.pathname + url.search; } catch { /* Keep existing valid links. */ }
          descriptor.href = href; descriptor.newTab = node.target === '_blank';
        }
        node.dataset.cmsElement = key;
        node.dataset.cmsName = descriptor.name;
        if (kind === 'text' && /^(SPAN|STRONG|B|SMALL)$/.test(node.tagName)) node.dataset.cmsInline = '';
        entries.set(key, record(node, descriptor));
      }
      // Catalog items and dynamic order values stay owned by the existing app.
      if (kind === 'button' && !node.querySelector('img') || statistic) return;
      // Enter the statistics row only far enough to register each layout unit.
      // Its live numbers and labels remain owned by the storefront.
      if (root.id !== 'promoBar' && (!node.matches(commerce) || node.matches('.hero-stats')) && !node.matches('svg,canvas,script,style')) [...node.children].forEach((child, index) => walk(child, [...path, index]));
    }
    walk(root, []);
    return entries;
  }
  function sectionKey(node, index) {
    if (node.classList.contains('hero')) return 'hero';
    if (node.classList.contains('benefits-strip')) return 'benefits';
    if (node.id) return node.id;
    const names = ['page-head', 'content-copy', 'shop-layout', 'prod-detail', 'table-wrap'];
    return names.find(name => node.classList.contains(name)) || `section-${index + 1}`;
  }
  function register(node, source, region) {
    node.dataset.cmsSection = source;
    const elements = collectElements(node);
    const descriptor = { id: source, type: 'native', source, region, name: titleOf(node).slice(0, 160), hidden: false, content: {}, elements: Object.fromEntries([...elements].map(([key, value]) => [key, value.descriptor])), styles: emptyStyles(), hover: {}, animation: {} };
    if (source === 'global:promo') { descriptor.name = 'Promo Bar'; descriptor.content.promoMessages = window.CMStorefront?.promoMessages?.() || []; }
    node.dataset.cmsName = descriptor.name;
    const grid = node.querySelector('.prod-grid');
    if (grid) {
      descriptor.content = { limit: Math.min(60, grid.querySelectorAll('.prod-card').length || 12), columns: Math.max(1, Math.min(6, getComputedStyle(grid).gridTemplateColumns.split(' ').length)), cardStyle: 'default', imageRatio: 'auto', showPrice: true, showSalePrice: true, showCart: true, showBadge: true };
    }
    const item = { node, elements, descriptor, originalParent: node.parentNode, originalNext: node.nextSibling, template: node.cloneNode(true) };
    state.sources.set(source, item); state.instances.set(source, item);
    return descriptor;
  }
  function metaValue(selector, attribute = 'content') { return document.head.querySelector(selector)?.getAttribute(attribute) || ''; }
  function capture(route) {
    const page = pageId(route);
    state.sharedOnly = !(pageNames.has(page) || customId(page));
    state.page = !state.sharedOnly ? page : window.CM_EDITOR_PREVIEW ? '' : 'shared';
    state.templatePage = route.templatePage || page;
    // Template layout is shared; product and filtered-list metadata belongs to
    // the actual route and its catalog record. Custom editorial pages retain SEO.
    state.routeSeo = !customId(page) && (page === 'product' || (page === 'products' && !!route.query));
    if (!state.page) return null;
    const sections = [];
    for (const [selector, key] of [['#promoBar', 'promo'], ['#navbar', 'header']]) {
      const node = document.querySelector(selector); if (node) sections.push(register(node, `global:${key}`, 'header'));
    }
    const sourcePage = route.templatePage || page;
    if (!state.sharedOnly) [...document.querySelector('#view').children].forEach((node, index) => sections.push(register(node, `${sourcePage}:${sectionKey(node, index)}`, 'main')));
    const footer = document.querySelector('footer.footer'); if (footer) sections.push(register(footer, 'global:footer', 'footer'));
    state.baseline = { schemaVersion: 1, id: state.page, sections, seo: { title: document.title, description: metaValue('meta[name="description"]'), keywords: metaValue('meta[name="keywords"]'), canonical: metaValue('link[rel="canonical"]', 'href'), ogTitle: metaValue('meta[property="og:title"]'), ogDescription: metaValue('meta[property="og:description"]'), ogImage: metaValue('meta[property="og:image"]'), robots: metaValue('meta[name="robots"]') }, design: {} };
    if (customId(page)) state.baseline.templatePage = route.templatePage || 'custom';
    return clone(state.baseline);
  }
  function restoreElements(instance) {
    for (const entry of instance.elements.values()) {
      const { node, original, descriptor } = entry;
      if (descriptor.added) { node.remove(); continue; }
      if (descriptor.kind === 'text' || descriptor.kind === 'button') restoreText(node, original, original.text);
      if (descriptor.kind === 'image') { attr(node, 'src', original.src); attr(node, 'alt', original.alt); }
      if (descriptor.kind === 'button' && node.tagName === 'A') { attr(node, 'href', original.href); attr(node, 'target', original.target); attr(node, 'rel', original.rel); }
      node.hidden = original.hidden;
    }
  }
  function restoreText(node, original, value) {
    if (typeof value !== 'string') return;
    const paragraph = node.matches('.hero-lede');
    // A plaintext edit may already contain the saved newlines but still need
    // BRs after editing ends. Keep the canonical children on subsequent applies.
    if (paragraph && value !== original.text) { setText(node, value); return; }
    if (node.textContent === value && !(paragraph && node.querySelector('br'))) return;
    if (value === original.text) node.replaceChildren(...original.children.map(child => child.cloneNode(true)));
    else setText(node, value);
  }
  const mobileHeaderOriginals = new Map();
  function rememberMobileHeader(node) {
    if (!mobileHeaderOriginals.has(node)) mobileHeaderOriginals.set(node, {
      text: node.textContent, children: [...node.childNodes].map(child => child.cloneNode(true)),
      href: node.getAttribute('href'), target: node.getAttribute('target'), rel: node.getAttribute('rel'),
      src: node.getAttribute('src'), alt: node.getAttribute('alt'), hidden: node.hidden,
    });
    return mobileHeaderOriginals.get(node);
  }
  function restoreMobileHeader() {
    for (const [node, original] of mobileHeaderOriginals) {
      if (node.tagName === 'IMG') { attr(node, 'src', original.src); attr(node, 'alt', original.alt); }
      else { restoreText(node, original, original.text); attr(node, 'href', original.href); attr(node, 'target', original.target); attr(node, 'rel', original.rel); }
      node.hidden = original.hidden;
    }
  }
  function navigationPath(href) {
    try {
      const url = new URL(href, location.href);
      if (url.origin !== location.origin) return null;
      return url.hash.startsWith('#/') ? url.hash.slice(1) : url.pathname + url.search;
    } catch { return null; }
  }
  function projectMobileHeader(instance, section) {
    restoreMobileHeader();
    const links = [...document.querySelectorAll('#mobileDrawer .mobile-nav-link')];
    for (const [key, entry] of instance.elements) {
      const node = entry.node;
      if (node.matches('.nav-link[data-nav]')) {
        const route = navigationPath(entry.original.href);
        if (route === null) continue;
        for (const mobile of links) {
          const original = rememberMobileHeader(mobile);
          if (navigationPath(original.href) !== route) continue;
          // Keep intentional mobile labels such as All Products until the
          // corresponding desktop navigation label is actually edited.
          const changedText = node.textContent.trim() !== (entry.original.text || '').trim();
          restoreText(mobile, original, changedText ? node.textContent.trim() : original.text);
          attr(mobile, 'href', node.getAttribute('href')); attr(mobile, 'target', node.getAttribute('target')); attr(mobile, 'rel', node.getAttribute('rel'));
          mobile.hidden = window.CMResponsive.resolve(section.elements?.[key] || entry.descriptor, 'mobile').hidden || original.hidden;
        }
      }
      if (node.matches('.logo-img')) for (const mobile of document.querySelectorAll('#mobileDrawer .drawer-head .logo-img')) {
        rememberMobileHeader(mobile); attr(mobile, 'src', node.getAttribute('src')); attr(mobile, 'alt', node.getAttribute('alt'));
      }
    }
  }
  function beforeRoute() {
    flushCategoryOrder();
    restoreMobileHeader();
    state.request++;
    window.CMStorefront?.renderPromo?.();
    for (const [id, instance] of state.instances) {
      if (instance.descriptor.region === 'main') continue;
      if (instance.descriptor.type !== 'native' || id !== instance.descriptor.source) instance.node.remove();
      else { restoreElements(instance); instance.node.hidden = false; if (!instance.node.isConnected) instance.originalParent.insertBefore(instance.node, instance.originalNext?.isConnected ? instance.originalNext : null); }
    }
    state.sources.clear(); state.instances.clear(); state.baseline = null;
    if (state.style) state.style.textContent = '';
  }
  function makeNode(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; }
  function makeIcon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'})) svg.setAttribute(key, value);
    const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', iconPaths[name] || iconPaths.star); svg.append(path); return svg;
  }
  function contentNode(tag, className, text, key) { const node = makeNode(tag, className, text); node.dataset.cmsContent = key; return node; }
  function contentValue(content, key) { return key.split('.').reduce((value, part) => value?.[part], content); }
  function fillAdded(node, section) {
    const content = section.content || {};
    const signature = JSON.stringify({ type: section.type, content });
    if (node.dataset.cmsSignature === signature) return;
    node.dataset.cmsSignature = signature; node.replaceChildren();
    if (section.type === 'productGrid') {
      if (content.heading) node.appendChild(contentNode('h2', 'section__title', content.heading, 'heading'));
      const grid = makeNode('div', 'prod-grid cms-product-grid');
      window.CMStorefront?.renderProducts(grid, content);
      node.appendChild(grid);
    } else if (section.type === 'faq') {
      if (content.heading) node.appendChild(contentNode('h2', 'section__title', content.heading, 'heading'));
      for (const [index, item] of (content.items || []).slice(0, 60).entries()) {
        const details = makeNode('details', 'cms-faq-item'); details.append(contentNode('summary', '', item.question, `items.${index}.question`), contentNode('p', '', item.answer, `items.${index}.answer`)); node.append(details);
      }
    } else if (['features', 'testimonials'].includes(section.type)) {
      if (content.heading) node.appendChild(contentNode('h2', 'section__title', content.heading, 'heading'));
      if (content.text) node.appendChild(contentNode('p', 'cms-copy', content.text, 'text'));
      const grid = makeNode('div', 'cms-entry-grid');
      for (const [index, item] of (content.entries || []).slice(0, 30).entries()) {
        const article = makeNode(section.type === 'testimonials' ? 'blockquote' : 'article', 'cms-entry');
        if (item.src && safeUrl(item.src, true)) { const image = contentNode('img', 'cms-entry-image', '', `entries.${index}.src`); image.src = safeUrl(item.src, true); image.alt = item.alt || ''; image.loading = 'lazy'; article.append(image); }
        if (item.title) article.appendChild(contentNode('h3', '', item.title, `entries.${index}.title`));
        if (item.text) article.appendChild(contentNode('p', '', item.text, `entries.${index}.text`));
        grid.append(article);
      }
      node.append(grid);
    } else if (section.type === 'divider') node.append(contentNode('hr', 'cms-divider', '', 'divider'));
    else if (section.type === 'icon') { const icon = contentNode('span', 'cms-icon', '', 'icon'); icon.append(makeIcon(content.icon)); node.append(icon); }
    else if (section.type === 'video') { const video = contentNode('video', 'cms-video', '', 'src'); video.controls = true; video.preload = 'metadata'; video.playsInline = true; if (videoUrl(content.src)) video.src = videoUrl(content.src); node.append(video); }
    else {
      if (content.heading) node.appendChild(contentNode(section.type === 'hero' ? 'h1' : 'h2', 'section__title', content.heading, 'heading'));
      if (content.text) node.appendChild(contentNode('p', 'cms-copy', content.text, 'text'));
      if (content.src && safeUrl(content.src, true)) { const image = contentNode('img', 'cms-image', '', 'src'); image.src = safeUrl(content.src, true); image.alt = content.alt || ''; image.loading = 'lazy'; image.decoding = 'async'; node.appendChild(image); }
      if (content.buttonText || section.type === 'button') {
        const button = contentNode('a', 'btn btn-primary', content.buttonText || '', 'buttonText'); button.href = safeUrl(content.href) || '#'; if (content.newTab) { button.target = '_blank'; button.rel = 'noopener noreferrer'; } node.appendChild(button);
      }
      if (section.type === 'imageText' || section.type === 'hero') {
        const image = node.querySelector(':scope>.cms-image');
        const copy = makeNode('div', 'cms-section-copy');
        [...node.childNodes].filter(child => child !== image).forEach(child => copy.append(child));
        node.append(copy); if (image) node.append(image);
      }
    }
  }
  function instanceFor(section) {
    const existing = state.instances.get(section.id); if (existing) return existing;
    let node, elements = new Map();
    if (section.type === 'native') {
      const source = state.sources.get(section.source); if (!source || source.descriptor.region !== (section.region || 'main')) return null;
      node = source.template.cloneNode(true);
      // Duplicate presentation sections keep delegated cart actions. IDs stay unique.
      node.querySelectorAll('[id]').forEach(child => child.removeAttribute('id')); node.removeAttribute('id');
      for (const [key, entry] of source.elements) {
        const child = node.dataset.cmsElement === key ? node : node.querySelector(`[data-cms-element="${cssId(key)}"]`);
        if (child) elements.set(key, record(child, clone(entry.descriptor)));
      }
    } else { node = makeNode('section', `section cms-section cms-section--${section.type}`); }
    node.dataset.cmsSection = section.id;
    const instance = { node, elements, descriptor: section };
    state.instances.set(section.id, instance); return instance;
  }
  function generatedElements(instance, section) {
    const map = instance.elements;
    for (const [key, entry] of map) if (!entry.node.isConnected && !instance.node.contains(entry.node)) map.delete(key);
    const add = (node, key, kind, contentKey) => {
      if (map.get(key)?.node === node) return;
      const descriptor = { kind, name: kind === 'container' ? section.name || 'Section' : node.textContent.trim().slice(0, 80) || kind, styles: emptyStyles(), hover: {}, animation: {} };
      if (['text', 'button'].includes(kind)) descriptor.text = node.textContent;
      if (['image', 'video'].includes(kind)) { descriptor.src = node.getAttribute('src') || ''; descriptor.alt = node.getAttribute('alt') || ''; }
      if (kind === 'button') { descriptor.href = node.getAttribute('href') || '#'; descriptor.newTab = node.target === '_blank'; }
      node.dataset.cmsElement = key; node.dataset.cmsName = descriptor.name;
      map.set(key, { ...record(node, descriptor), contentKey });
    };
    add(instance.node, 'eroot', 'container', null);
    instance.node.querySelectorAll('[data-cms-content]').forEach(node => {
      const contentKey = node.dataset.cmsContent;
      const kind = node.tagName === 'IMG' ? 'image' : node.tagName === 'VIDEO' ? 'video' : node.tagName === 'A' ? 'button' : node.tagName === 'HR' ? 'divider' : contentKey === 'icon' ? 'icon' : 'text';
      const key = 'content-' + ({src:kind === 'video' ? 'video' : 'image',buttonText:'button'}[contentKey] || contentKey);
      add(node, key, kind, contentKey);
    });
  }
  function addedElements(instance, section) {
    const valid = new Set(['text', 'heading', 'image', 'button', 'video', 'divider', 'icon', 'container']);
    instance.node.removeAttribute('data-cms-added-container'); instance.node.querySelectorAll('[data-cms-added-container]').forEach(node => node.removeAttribute('data-cms-added-container'));
    for (const [key, entry] of instance.elements) if (entry.descriptor.added && !section.elements?.[key]?.added) { entry.node.remove(); instance.elements.delete(key); }
    let pending = Object.entries(section.elements || {}).filter(([key, value]) => safeId(key) && key !== 'eroot' && value?.added === true && valid.has(value.kind));
    // Resolve parent containers in passes; malformed or cyclic references are omitted.
    for (let pass = 0; pending.length && pass < 21; pass++) {
      const next = [];
      for (const [key, value] of pending) {
        const parentEntry = instance.elements.get(value.parentId);
        const parent = value.parentId === 'eroot' || !value.parentId ? instance.node : ['container','button'].includes(parentEntry?.descriptor.kind) ? parentEntry.node : null;
        if (!parent) { next.push([key, value]); continue; }
        let entry = instance.elements.get(key);
        if (entry && !entry.descriptor.added) continue;
        if (!entry || entry.descriptor.kind !== value.kind) {
          entry?.node.remove();
          const tag = {text:'p',heading:'h2',image:'img',button:'a',video:'video',divider:'hr',icon:'span',container:'div'}[value.kind];
          const node = makeNode(tag, 'cms-added-element cms-added-' + value.kind, ['text','heading','button'].includes(value.kind) ? value.text || '' : '');
          node.dataset.cmsElement = key; node.dataset.cmsAdded = '';
          if (value.kind === 'image') { node.loading = 'lazy'; node.decoding = 'async'; }
          if (value.kind === 'video') { node.controls = true; node.preload = 'metadata'; node.playsInline = true; }
          entry = record(node, clone(value)); instance.elements.set(key, entry);
        }
        // Images inserted beside existing copy keep that exact location. The
        // anchor may live in a generated wrapper beneath the named container.
        const anchor = safeId(value.beforeId) && value.beforeId !== key ? instance.elements.get(value.beforeId)?.node : null;
        const before = anchor && anchor !== parent && parent.contains(anchor) && !entry.node.contains(anchor) ? anchor : null;
        const destination = before ? before.parentNode : parent;
        if (entry.node !== destination && !entry.node.contains(destination)) {
          if (before && entry.node.nextSibling !== before) destination.insertBefore(entry.node, before);
          else if (!before && entry.node.parentNode !== destination) destination.append(entry.node);
        }
        // Palette drops use free positioning; an anchored insertion participates
        // in its content area's flow so it cannot cover the following copy.
        const flow = !!before || value.flow === true;
        entry.node.style.position = flow ? 'relative' : '';
        entry.node.style.left = flow ? 'auto' : '';
        entry.node.style.top = flow ? 'auto' : '';
        entry.node.dataset.cmsName = value.name || value.kind;
        if (value.kind === 'icon' && entry.node.dataset.cmsIcon !== value.icon) { entry.node.replaceChildren(makeIcon(value.icon)); entry.node.dataset.cmsIcon = value.icon || 'star'; }
      }
      if (next.length === pending.length) break; pending = next;
    }
  }
  function selectionInfo(sectionId, elementId) {
    const instance = state.instances.get(sectionId); if (!instance) return null;
    const documentData = state.documents.get(state.page) || state.baseline;
    const section = documentData?.sections.find(item => item.id === sectionId);
    if (!section) return null;
    const entry = elementId && instance.elements.get(elementId);
    // Stale/missing element identities cannot become an operation on a section.
    if (elementId && !entry) return null;
    const readOnlyText = !!entry && (heroStatistic(entry.node) || section.type === 'native' && section.source === 'home:shop-categories'
      && !!entry.node.closest('.home-category-card') && entry.descriptor.kind !== 'image');
    let parentId = 'eroot';
    for (let parent = entry?.node.parentElement; parent && instance.node.contains(parent); parent = parent.parentElement) {
      const id = parent.dataset.cmsElement;
      if (id && ['container','button'].includes(instance.elements.get(id)?.descriptor.kind)) { parentId = id; break; }
      if (parent === instance.node) break;
    }
    let lockOwnerId = section.locked ? null : undefined;
    for (let node = entry?.node; node && instance.node.contains(node); node = node.parentElement) {
      const id = node.dataset.cmsElement, value = section.elements?.[id] || instance.elements.get(id)?.descriptor;
      if (value?.locked === true) { lockOwnerId = id; break; }
      if (node === instance.node) break;
    }
    const locked = lockOwnerId !== undefined;
    const canEditContent = !readOnlyText && (!entry || editable(entry.node) && !entry.node.matches(commerce));
    const canInsertImage = !locked && canEditContent;
    return { sectionId, elementId: elementId || null, descriptor: clone(entry ? { ...entry.descriptor, ...section.elements?.[elementId] } : section), contentKey: entry?.contentKey || null, parentId, beforeId: elementId && elementId !== 'eroot' ? elementId : null, canInsertImage, canEditContent, readOnlyText, locked, lockOwnerId };
  }
  function safeStyles(values) {
    return Object.entries(values || {}).filter(([key, value]) => styleNames.has(key) && ['string', 'number'].includes(typeof value) && String(value).length <= 200 && !/[<>;{}\\]|url\s*\(|expression\s*\(|@|\/\*/i.test(value)).map(([key, value]) => `${key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase())}:${value}!important`).join(';');
  }
  function rulesFor(selector, item, basePosition = '') {
    const responsive = window.CMResponsive;
    let rules = '';
    // Keep legacy CSS in its original cascade. Native CSS is never snapshotted.
    for (const [device, condition] of [['desktop', ''], ['tablet', '(max-width:1024px)'], ['mobile', '(max-width:767px)']]) {
      let declarations = safeStyles(item.styles?.[device]);
      if (['text','heading','button'].includes(item.kind) && item.styles?.[device]?.color) declarations += ';-webkit-text-fill-color:currentColor!important';
      if (declarations) rules += condition ? `@media ${condition}{${selector}{${declarations}}}` : `${selector}{${declarations}}`;
    }
    for (const device of responsive.devices) {
      const resolved = responsive.resolve(item, device), override = item.overrides?.[device] || {};
      const wrap = css => css ? `@media ${responsive.media[device]}{${css}}` : '';
      let declarations = safeStyles(override.styles);
      if (resolved.styles.zIndex !== undefined && basePosition === 'static') declarations += ';position:relative!important';
      if (['text','heading','button'].includes(item.kind) && override.styles?.color) declarations += ';-webkit-text-fill-color:currentColor!important';
      const effects = effectStyles(resolved.effects, item.kind, resolved.styles.color);
      if (effects) declarations += ';' + effects;
      if (declarations) rules += wrap(`${selector}{${declarations}}`);
      if ((resolved.effects.position || resolved.styles.width || resolved.styles.height) && !resolved.styles.display) rules += wrap(`${selector}[data-cms-inline]{display:inline-block!important}`);
      // New moves can explicitly keep native inline text in its existing line
      // boxes. Older snapshots retain their original inline-block behavior.
      if (resolved.styles.display === 'inline' && resolved.effects.position && Number(resolved.effects.position.scale || 1) === 1) {
        const offset = value => Number.isFinite(Number(value)) ? Math.max(-1000,Math.min(1000,Number(value))) : 0;
        rules += wrap(`${selector}[data-cms-inline]{position:relative!important;left:${offset(resolved.effects.position.x)}px!important;top:${offset(resolved.effects.position.y)}px!important;translate:none!important;scale:none!important}`);
      } else if (resolved.styles.display === 'inline' && resolved.effects.position) {
        rules += wrap(`${selector}[data-cms-inline]{display:inline-block!important;left:0!important;top:0!important}`);
      }
      if (resolved.styles.display === 'inline-block' && resolved.effects.position) rules += wrap(`${selector}[data-cms-inline]{left:0!important;top:0!important}`);
      // A saved position or size adds the higher-specificity [data-cms-inline]
      // display rule above. `hidden` must out-specify it, otherwise a deleted or
      // hidden text box stays on the canvas after it was dragged or resized.
      if (resolved.hidden) rules += wrap(`${selector}{display:none!important}`) + wrap(`${selector}[data-cms-inline]{display:none!important}`);
      const hover = safeStyles(resolved.hover);
      if (hover) rules += wrap(`@media(hover:hover){${selector}:hover{${hover}}}`);
      const animation = resolved.animation;
      if (animation && ['fade', 'slide', 'scale'].includes(animation.type)) {
        const duration = Math.max(100, Math.min(3000, Number(animation.duration) || 500));
        const delay = Math.max(0, Math.min(3000, Number(animation.delay) || 0));
        const easing = ['ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear'].includes(animation.easing) ? animation.easing : 'ease';
        rules += wrap(`@media(prefers-reduced-motion:no-preference){${selector}{animation:cm-content-${animation.type} ${duration}ms ${easing} ${delay}ms both}}`);
      }
    }
    return rules;
  }
  function productRules(selector, content, responsiveShop = false) {
    let css = '';
    if (Number.isInteger(content.columns)) {
      const columns=`${selector} .prod-grid{grid-template-columns:repeat(${Math.max(1, Math.min(6, content.columns))},minmax(0,1fr))}`;
      css += responsiveShop ? `@media(min-width:768px){${columns}}` : columns;
    }
    if (content.showPrice === false) css += `${selector} .price-now{display:none}`;
    if (content.showSalePrice === false) css += `${selector} .price-cmp,${selector} .price-off{display:none}`;
    if (content.showCart === false) css += `${selector} .prod-card__foot{display:none}`;
    if (content.showBadge === false) css += `${selector} .prod-card__badges{display:none}`;
    const ratios = { square: '1', portrait: '3/4', landscape: '4/3' };
    if (ratios[content.imageRatio]) css += `${selector} .prod-card__media{aspect-ratio:${ratios[content.imageRatio]}}`;
    if (content.cardStyle === 'compact') css += `${selector} .prod-card__desc,${selector} .rating-row{display:none}${selector} .prod-card__body{padding:12px}`;
    if (content.cardStyle === 'outlined') css += `${selector} .prod-card{box-shadow:none;border:1px solid var(--primary)}`;
    return css;
  }
  // Padding belongs to each repeated track group, not the outer clipping bar.
  // Keep one saved style map and project it onto the native markup.
  function promoContainer(item) {
    const clean = clone(item);
    for (const map of [...Object.values(clean.styles || {}),...Object.values(clean.overrides || {}).map(value => value.styles || {})]) {
      for (const key of ['paddingTop','paddingBottom','paddingLeft','paddingRight']) delete map[key];
    }
    return clean;
  }
  function promoRules(selector, item) {
    let css = '';
    for (const device of window.CMResponsive.devices) {
      const value = window.CMResponsive.resolve(item,device), styles = value.styles;
      const pick = keys => Object.fromEntries(keys.filter(key => styles[key] !== undefined).map(key => [key,styles[key]]));
      const text = safeStyles(pick(['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','color','textAlign']));
      let group = safeStyles(pick(['paddingTop','paddingBottom','paddingLeft','paddingRight']));
      if (['left','center','right'].includes(styles.textAlign)) group += ';justify-content:' + ({left:'flex-start',center:'center',right:'flex-end'})[styles.textAlign] + '!important';
      let rules = '';
      if (value.effects.gradient?.enabled === false || styles.backgroundColor && !value.effects.gradient?.enabled) rules += `${selector}{background-image:none!important}`;
      if (text) rules += `${selector} .promo-bar__item{${text}}`;
      if (group) rules += `${selector} .promo-bar__group{${group}}`;
      if (value.content.showPromoIcons === false) rules += `${selector} .promo-bar__message-icon{display:none!important}`;
      if (rules) css += `@media ${window.CMResponsive.media[device]}{${rules}}`;
    }
    return css;
  }
  function effectStyles(effects, kind, color) {
    if (!effects || typeof effects !== 'object') return '';
    const declarations = [];
    const text = kind === 'text' || kind === 'button';
    const gradient = effects.gradient; const layers = [];
    const validColor = value => typeof value === 'string' && /^#(?:[a-f0-9]{3}|[a-f0-9]{6}|[a-f0-9]{8})$/i.test(value);
    if (gradient?.enabled && validColor(gradient.start) && validColor(gradient.end)) {
      const angle = Math.max(0, Math.min(360, Number(gradient.angle) || 0));
      layers.push(`linear-gradient(${angle}deg,${gradient.start},${gradient.end})`);
      if (text) declarations.push('background-clip:text', '-webkit-background-clip:text', 'color:transparent', '-webkit-text-fill-color:transparent');
    } else if (gradient?.enabled === false && text) declarations.push('background-image:none', '-webkit-text-fill-color:currentColor', 'background-clip:border-box', `color:${validColor(color) ? color : 'inherit'}`);
    if (effects.backgroundImage && safeUrl(effects.backgroundImage, true) && !text) {
      const url = new URL(safeUrl(effects.backgroundImage, true), location.origin).href.replace(/["'()\\]/g, character => '%' + character.charCodeAt(0).toString(16));
      layers.push(`url("${url}")`); declarations.push('background-size:cover', 'background-position:center');
    }
    if (layers.length) declarations.push('background-image:' + layers.join(','));
    if (effects.backgroundImage === '' && !layers.length) declarations.push('background-image:none');
    if (effects.position && typeof effects.position === 'object') {
      const bound = (value, low, high, fallback) => Number.isFinite(Number(value)) ? Math.max(low, Math.min(high, Number(value))) : fallback;
      declarations.push(`translate:${bound(effects.position.x, -1000, 1000, 0)}px ${bound(effects.position.y, -1000, 1000, 0)}px`, `scale:${bound(effects.position.scale, .1, 5, 1)}`);
    }
    return declarations.map(value => value + '!important').join(';');
  }
  function applySeo(seo, documentData) {
    if (window.CMSeoManager) {
      if (window.CM_EDITOR_PREVIEW) { if (!state.routeSeo) window.CMSeoManager.applyEditorSeo(seo, documentData); }
      else window.CMSeoManager.applyPublishedDocument(documentData);
      return;
    }
    if (state.routeSeo) return;
    if (seo.title) document.title = seo.title;
    for (const [key, name, property] of [['description', 'description', false], ['keywords', 'keywords', false], ['ogTitle', 'og:title', true], ['ogDescription', 'og:description', true], ['ogImage', 'og:image', true], ['robots', 'robots', false]]) {
      if (!seo[key] && !(key === 'keywords' && seo[key] === '')) continue; let node = document.head.querySelector(`meta[${property ? 'property' : 'name'}="${name}"]`);
      if (!node) { node = document.createElement('meta'); node.setAttribute(property ? 'property' : 'name', name); document.head.appendChild(node); }
      node.content = seo[key];
    }
    if (seo.canonical && safeUrl(seo.canonical)) { const canonical = document.querySelector('link[rel="canonical"]'); if (canonical) canonical.href = seo.canonical; }
  }
  /* CM_PRODUCT_BLOCKS: existing native nodes, stored on their existing section. */
  function productBlockGroups(root) {
    if (!root?.matches('.shop-layout')) return [];
    const filters = root.querySelector(':scope > #filterCol');
    const products = root.querySelector(':scope > .shop-main');
    const cards = filters ? [...filters.querySelectorAll(':scope > .filter-card')] : [];
    const card = selector => cards.find(node => node.querySelector(selector));
    const groups = [
      {id:'layout',name:'Page columns',parent:root,items:[['filters','Category filters',filters],['products','Product grid',products]]},
      {id:'filters',name:'Sidebar filters',parent:filters,items:[['price','Price range',card('#rangeMin')],['category','Category',card('[data-fcat]')],['availability','Availability',card('[data-favail]')],['clear','Clear all filters',filters?.querySelector(':scope > [data-fclear="all"]')]]},
      {id:'products',name:'Product area',parent:products,items:[['toolbar','Search and sort',products?.querySelector(':scope > .shop-bar')],['results','Results summary',products?.querySelector(':scope > .result-count, :scope > .active-filters')],['grid','Product grid',products?.querySelector(':scope > .prod-grid, :scope > .empty-state')]]},
    ];
    return groups.filter(group => group.parent).map(group => {
      const positions = [...group.parent.children];
      return {...group,items:group.items.filter(([, , node]) => node && node.parentElement === group.parent)
        .map(([id,name,node]) => { node.dataset.cmsBlock = id; node.dataset.cmsBlockGroup = group.id; return {id,name,node}; })
        .sort((a,b) => positions.indexOf(a.node) - positions.indexOf(b.node))};
    });
  }
  function productBlocks() {
    const doc = state.documents.get(state.page) || state.baseline;
    const section = doc?.sections.find(item => item.type === 'native' && item.source === 'products:shop-layout');
    const instance = section && state.instances.get(section.id);
    return {sectionId:section?.id || null,groups:productBlockGroups(instance?.node).map(({id,name,items}) => ({id,name,items:items.map(({id,name}) => ({id,name}))}))};
  }
  function applyProductBlocks(instance, section, selector) {
    if (section.type !== 'native' || section.source !== 'products:shop-layout') return '';
    const orders = section.content?.blockOrders || {};
    const groups = productBlockGroups(instance.node);
    let productFirst = false;
    for (const group of groups) {
      const current = group.items.map(item => item.node);
      if (!state.blockOrders.has(group.parent)) state.blockOrders.set(group.parent, current);
      const baseline = state.blockOrders.get(group.parent);
      const canonical = baseline.filter(node => current.includes(node)).concat(current.filter(node => !baseline.includes(node)));
      const nodes = new Map(group.items.map(item => [item.id,item.node]));
      const requested = Array.isArray(orders[group.id]) ? orders[group.id] : [];
      const ordered = [];
      for (const id of requested) if (nodes.has(id) && !ordered.includes(nodes.get(id))) ordered.push(nodes.get(id));
      for (const node of canonical) if (!ordered.includes(node)) ordered.push(node);
      // Leave drawer headings, backdrops and other helper nodes in their slots.
      let index = 0;
      const slots = [...group.parent.children].map(node => current.includes(node) ? ordered[index++] : node);
      let cursor = group.parent.firstElementChild;
      for (const node of slots) { if (node !== cursor) group.parent.insertBefore(node,cursor); cursor = node.nextElementSibling; }
      if (group.id === 'layout') productFirst = ordered[0] === nodes.get('products');
    }
    // Keep the products column wide when the sidebar moves right. At the
    // existing mobile breakpoint the sidebar remains its working filter drawer.
    return productFirst ? `@media(min-width:981px){${selector}{grid-template-columns:minmax(0,1fr) 276px!important}}@media(min-width:981px) and (max-width:1180px){${selector}{grid-template-columns:minmax(0,1fr) 248px!important}}` : '';
  }
  /* END_CM_PRODUCT_BLOCKS */
  // Return references to the existing products. Orders belong to one page and
  // one category; customer-selected sorts keep their original behavior.
  function orderProducts(products, shop, route, documentData) {
    if (!Array.isArray(products) || !shop || (shop.sort && shop.sort !== 'featured') || shop.cats?.length > 1) return products;
    const id = route ? pageId(route) : state.page;
    const sectionScope = typeof shop.sectionId === 'string' && safeId(shop.sectionId) && (route?.templatePage || route?.name || state.templatePage) === 'home';
    if (!sectionScope && (route?.templatePage || route?.name || state.templatePage) !== 'products') return products;
    const doc = documentData || (window.CM_EDITOR_PREVIEW ? state.documents.get(id) : state.published.get(id));
    const scope = sectionScope ? 'section:' + shop.sectionId : shop.cats?.length === 1 ? shop.cats[0] : 'all';
    const ids = doc?.productOrders?.[scope];
    if (!Array.isArray(ids) || !ids.length) return products;
    const ranks = new Map(ids.map((value, index) => [Number(value), index]));
    return products.map((product, index) => ({product,index})).sort((a,b) =>
      (ranks.get(Number(a.product.id)) ?? Infinity) - (ranks.get(Number(b.product.id)) ?? Infinity) || a.index - b.index
    ).map(entry => entry.product);
  }
  function categoryCardId(card) {
    return card.dataset.categoryId || card.querySelector('[data-image-category]')?.dataset.imageCategory || '';
  }
  function applyCategoryOrder(instance, section, documentData) {
    if (section.type !== 'native' || section.source !== 'home:shop-categories') return;
    const grid = instance.node.querySelector('.home-category-grid'); if (!grid) return;
    const cards = [...grid.children].filter(card => card.matches('.home-category-card'));
    let original = state.categoryOrders.get(grid);
    if (!original) { original = [...cards]; state.categoryOrders.set(grid, original); }
    // Capture IDs before any movement. CMS element IDs and styles stay attached
    // to the original card nodes, independent of their displayed position.
    const canonical = [...original.filter(card => cards.includes(card)), ...cards.filter(card => !original.includes(card))];
    // The grid reads the same one global order as every other category surface.
    // Without the document, an empty order is the documented canonical default.
    const saved = homeCategoryOrder(documentData) ?? [];
    const ranks = new Map();
    saved.forEach((id,index) => { if (typeof id === 'string' && !ranks.has(id)) ranks.set(id,index); });
    const ordered = canonical.map((card,index) => ({card,index})).sort((a,b) =>
      (ranks.get(categoryCardId(a.card)) ?? Infinity) - (ranks.get(categoryCardId(b.card)) ?? Infinity) || a.index-b.index
    );
    let cursor = grid.firstElementChild;
    for (const {card} of ordered) { if (card !== cursor) grid.insertBefore(card,cursor); cursor=card.nextElementSibling; }
  }
  function applyProductOrder(documentData) {
    if (state.templatePage === 'home') {
      for (const [sectionId, instance] of state.instances) {
        const grid = instance.node.querySelector('.prod-grid'); if (!grid) continue;
        const cards = [...grid.children].filter(node => node.matches('.prod-card[data-id]'));
        let originals = state.cardOrders.get(grid);
        if (!originals || originals.length !== cards.length || cards.some(card => !originals.includes(card))) { originals = [...cards]; state.cardOrders.set(grid, originals); }
        const ordered = orderProducts(originals.map(card => ({id:Number(card.dataset.id),card})), {sort:'featured',cats:[],sectionId}, null, documentData);
        let cursor=grid.firstElementChild;
        for (const entry of ordered) { if(entry.card!==cursor)grid.insertBefore(entry.card,cursor);cursor=entry.card.nextElementSibling; }
        // Preserve the existing Home filter and visible-card cutoff after movement.
        const filter = instance.node.querySelector('[data-pillgroup][aria-pressed="true"]')?.dataset.pill || 'all';
        const cap = Number(grid.getAttribute('data-cap')) || Infinity; let shown=0;
        for(const {card} of ordered){const match=filter==='all'||(card.getAttribute('data-keys')||'').split(' ').includes(filter);card.hidden=!match||shown>=cap;if(!card.hidden)shown++;}
      }
      return;
    }
    if (state.templatePage !== 'products') return;
    const context = window.CMStorefront?.productContext?.();
    if (!context || context.shop.sort !== 'featured' || context.shop.cats.length > 1) return;
    const ordered = orderProducts(context.ids.map(id => ({id})), context.shop, context.route, documentData);
    const ranks = new Map(ordered.map((item,index) => [Number(item.id),index]));
    for (const grid of document.querySelectorAll('#view .shop-layout .shop-main .prod-grid')) {
      const cards = [...grid.children].filter(node => node.matches('.prod-card[data-id]'));
      const visibleCount=cards.filter(card=>!card.hidden).length;
      cards.sort((a,b) => (ranks.get(Number(a.dataset.id)) ?? Infinity) - (ranks.get(Number(b.dataset.id)) ?? Infinity));
      let cursor = grid.firstElementChild;
      for (const card of cards) { if (card !== cursor) grid.insertBefore(card,cursor); cursor=card.nextElementSibling; }
      cards.forEach((card,index)=>{card.hidden=index>=visibleCount;});
    }
  }
  /* CM_CATEGORY_ORDER_FORWARD: the home document is the only owner of the saved
     category order. Deliveries are deduplicated and wait for the storefront
     hook, so either script may load first without losing the order. */
  let categoryOrderSignature = null;
  let pendingCategoryOrder;
  function homeCategoryOrder(documentData) {
    if (!documentData || documentData.id !== 'home') return undefined;
    // The document root owns the order. A section value is only read for drafts
    // saved before the order moved there, so those pages keep working.
    if (Array.isArray(documentData.categoryOrder)) return documentData.categoryOrder;
    if (!Array.isArray(documentData.sections)) return undefined;
    for (const section of documentData.sections) {
      if (!section || section.type !== 'native' || section.source !== 'home:shop-categories') continue;
      return Array.isArray(section.content?.categoryOrder) ? section.content.categoryOrder : undefined;
    }
    return undefined;
  }
  function flushCategoryOrder() {
    if (pendingCategoryOrder === undefined) return;
    const applyOrder = window.CMApplyCategoryOrder;
    if (typeof applyOrder !== 'function') return;
    const order = pendingCategoryOrder;
    pendingCategoryOrder = undefined;
    try { applyOrder(order); } catch { /* Ordering never blocks the storefront. */ }
  }
  function forwardCategoryOrder(documentData) {
    const order = homeCategoryOrder(documentData);
    if (order === undefined) return;
    const signature = JSON.stringify(order);
    if (signature === categoryOrderSignature) return;
    categoryOrderSignature = signature;
    pendingCategoryOrder = order;
    flushCategoryOrder();
  }
  /* END_CM_CATEGORY_ORDER_FORWARD */
  function apply(documentData) {
    if (!documentData || documentData.id !== state.page || documentData.schemaVersion !== 1 || !Array.isArray(documentData.sections)) return false;
    state.documents.set(state.page, clone(documentData));
    const used = new Set(); const ordered = { header: [], main: [], footer: [] }; let css = '';
    for (const section of documentData.sections.slice(0, 80)) {
      if (!safeId(section.id) || used.has(section.id)) continue;
      const instance = instanceFor(section); if (!instance) continue;
      used.add(section.id); const { node, elements } = instance;
      node.dataset.cmsName = section.type === 'native' && section.source === 'global:promo' ? 'Promo Bar' : section.name || section.type;
      const region = section.type === 'native' ? state.sources.get(section.source)?.descriptor.region : 'main';
      if (!ordered[region]) continue; ordered[region].push(node);
      const selector = `[data-cms-section="${cssId(section.id)}"]`;
      const promo = section.type === 'native' && section.source === 'global:promo';
      if (promo) window.CMStorefront?.renderPromo?.(section.content?.promoMessages);
      if (section.type !== 'native') { fillAdded(node, section); generatedElements(instance, section); }
      addedElements(instance, section);
      {
        for (const [key, entry] of elements) {
          const value = section.elements?.[key] || entry.descriptor; const { node: target, descriptor, original } = entry;
          const content = entry.contentKey ? section.content || {} : null;
          // Older CMS snapshots contain literal category counts. Keep their
          // existing element IDs and styling, but use the current catalogue's
          // captured text so a saved page cannot freeze inventory totals.
          const categoryIdentity = section.type === 'native' && section.source === 'home:shop-categories'
            && target.closest('.home-category-card');
          if (['text', 'heading', 'button'].includes(descriptor.kind)) restoreText(target, original, categoryIdentity ? original.text : (content ? contentValue(content, entry.contentKey) : value.text) ?? original.text);
          if (descriptor.kind === 'image') { attr(target, 'src', safeUrl(content ? contentValue(content, entry.contentKey) : value.src, true) || (descriptor.added ? null : original.src)); attr(target, 'alt', (content ? contentValue(content, entry.contentKey.replace(/src$/, 'alt')) : value.alt) ?? original.alt); }
          if (descriptor.kind === 'video') attr(target, 'src', videoUrl(content ? content.src : value.src) || null);
          if (descriptor.kind === 'button' && target.tagName === 'A') { const link = content || value; attr(target, 'href', categoryIdentity ? original.href : safeUrl(link.href) || original.href || '#'); attr(target, 'target', link.newTab ? '_blank' : original.target === '_blank' && link.newTab === undefined ? '_blank' : null); attr(target, 'rel', link.newTab ? 'noopener noreferrer' : original.rel); }
          original.position ??= getComputedStyle(target).position;
          css += rulesFor(key === 'eroot' ? selector : `${selector} [data-cms-element="${cssId(key)}"]`, promo && key === 'eroot' ? promoContainer(value) : value, original.position);
          if (promo && key === 'eroot') css += promoRules(selector,value);
        }
      }
      if (section.type === 'native') {
        const grid = node.matches('.prod-grid') ? node : node.querySelector('.prod-grid');
        if (grid && !(state.templatePage === 'products' && node.classList.contains('shop-layout'))) {
          const sourceContent = state.sources.get(section.source)?.descriptor.content || {};
          const keys = ['productIds', 'category', 'limit', 'sort'];
          const configuration = content => JSON.stringify(Object.fromEntries(keys.filter(key => content[key] !== undefined).map(key => [key, content[key]])));
          const baselineConfig = configuration(sourceContent);
          if (!instance.gridState) instance.gridState = { children: [...grid.childNodes], config: baselineConfig };
          const signature = configuration(section.content || {});
          if (instance.gridState.config !== signature) {
            if (signature === baselineConfig) grid.replaceChildren(...instance.gridState.children);
            else window.CMStorefront?.renderProducts(grid, section.content);
            instance.gridState.config = signature;
          }
        }
      }
      applyCategoryOrder(instance, section, documentData);
      css += applyProductBlocks(instance, section, selector);
      if (section.type === 'native' && section.source === 'global:header') projectMobileHeader(instance, section);
      const sourceContent = state.sources.get(section.source)?.descriptor.content || {};
      const productOptions = section.type === 'native' ? Object.fromEntries(Object.entries(section.content || {}).filter(([key, value]) => value !== sourceContent[key])) : section.content || {};
      instance.originalPosition ??= getComputedStyle(node).position;
      css += rulesFor(selector, promo ? promoContainer(section) : section, instance.originalPosition);
      if (promo) css += promoRules(selector,section);
      for (const device of window.CMResponsive.devices) {
        const options = {...productOptions,...section.overrides?.[device]?.content};
        // Legacy native documents captured Desktop column counts as shared content.
        // Keep the storefront's mobile layout unless Mobile explicitly overrides it.
        const preserveNativeMobile = device === 'mobile' && section.type === 'native'
          && (state.templatePage === 'home' || state.templatePage === 'products' && section.source === 'products:shop-layout')
          && !Object.hasOwn(section.overrides?.mobile?.content || {}, 'columns');
        css += `@media ${window.CMResponsive.media[device]}{${productRules(selector, options, preserveNativeMobile)}}`;
      }
      node.querySelectorAll('.reveal:not(.in)').forEach(child => child.classList.add('in'));
    }
    for (const [id, instance] of state.instances) if (!used.has(id)) instance.node.remove();
    // Only move nodes whose position changed. Existing handlers and focus survive.
    const main = document.querySelector('#view'); let cursor = main.firstElementChild;
    for (const node of ordered.main) { if (node !== cursor) main.insertBefore(node, cursor); cursor = node.nextElementSibling; }
    for (const region of ['header', 'footer']) for (const node of ordered[region]) if (!node.isConnected) { const source = state.sources.get(node.dataset.cmsSection); if (source?.originalParent) source.originalParent.insertBefore(node, source.originalNext?.isConnected ? source.originalNext : null); }
    // Measure containing blocks only after insertion, when computed styles exist.
    for (const id of used) for (const entry of state.instances.get(id).elements.values()) {
      if (entry.descriptor.added && entry.node.parentElement && getComputedStyle(entry.node.parentElement).position === 'static') entry.node.parentElement.dataset.cmsAddedContainer = '';
    }
    const design = documentData.design || {}; const tokens = { primary: '--primary', text: '--ink', background: '--bg', fontFamily: '--font-body', headingFont: '--font-display', radius: '--radius' };
    let declarations = '';
    for (const [key, token] of Object.entries(tokens)) if (design[key] && !/[<>;{}\\]|url\s*\(|@/i.test(design[key])) {
      declarations += `${token}:${design[key]};`;
      // These values were originally resolved on body. Resolve them again on
      // the page root so its descendants inherit the edited page appearance.
      if (key === 'fontFamily') declarations += `font-family:${design[key]};`;
      if (key === 'text') declarations += `color:${design[key]};`;
    }
    // Page design must not restyle the shared shell on one route. Global
    // sections own their styles independently of the page content below them.
    if (declarations) css += `#view{${declarations}}`;
    if (design.background && !/[<>;{}\\]|url\s*\(|@/i.test(design.background)) css += `#view{background:${design.background}!important}`;
    if (design.containerWidth && /^(?:\d+(?:\.\d+)?)(?:px|rem|em|%|vw)$/.test(design.containerWidth)) css += `#view.container,#view .container{max-width:${design.containerWidth}!important}`;
    if (!state.style) { state.style = document.createElement('style'); state.style.id = 'cm-published-styles'; document.head.appendChild(state.style); }
    if (state.style.textContent !== css) state.style.textContent = css;
    applySeo(documentData.seo || {}, documentData);
    forwardCategoryOrder(documentData);
    applyProductOrder(documentData);
    document.dispatchEvent(new CustomEvent('cm:cms-applied', { detail: { page: state.page } }));
    return true;
  }
  /* CM_SHARED_NAVIGATION */
  function withSharedNavigation(documentData, globals, baseline) {
    const result = clone(documentData);
    const shell = {};
    const roles = ['promo', 'header', 'footer'];
    const isRole = (section, role) => section.type === 'native' && section.source === 'global:' + role;
    for (const role of roles) {
      // A null global role means native markup, not permission for an old
      // per-page snapshot to become authoritative again. Missing keys retain
      // compatibility with the previous header-only backend during rollout.
      const candidate = globals && Object.hasOwn(globals, role)
        ? globals[role] || baseline?.sections?.find(section => isRole(section, role))
        : result.sections.find(section => isRole(section, role));
      if (candidate && isRole(candidate, role)) {
        shell[role] = clone(candidate);
        shell[role].id = 'global:' + role;
      }
    }
    result.sections = [shell.promo, shell.header,
      ...result.sections.filter(section => !roles.some(role => isRole(section, role))), shell.footer].filter(Boolean);
    if (Array.isArray(globals?.categoryOrder)) {
      // Forward on every route, including direct category/product URLs. Home
      // also receives it in its document so its grid uses the same authority.
      forwardCategoryOrder({id:'home',categoryOrder:globals.categoryOrder});
      if (result.id === 'home') result.categoryOrder = [...globals.categoryOrder];
    }
    return result;
  }
  /* CM_PUBLICATION_BOOTSTRAP: share the HTTP publication with the first
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
  async function afterRoute(route) {
    flushCategoryOrder();
    const baseline = capture(route); if (!baseline) return;
    if (window.CM_EDITOR_PREVIEW) {
      const draft = state.documents.get(state.page); if (draft) apply(draft);
      document.dispatchEvent(new CustomEvent('cm:cms-ready', { detail: { page: state.page, document: baseline } }));
      return;
    }
    const page = state.page; const request = ++state.request;
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
    }
  }
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('load', flushCategoryOrder);
  window.CMCms = Object.freeze({ beforeRoute, afterRoute, prepareRoute, promoMessages: () => publications.get('home')?.globals?.promo?.content?.promoMessages, apply, orderProducts, productBlocks, resolveRoute, pageContext, selectionInfo, document: () => clone(state.documents.get(state.page) || state.baseline), baseline: () => state.baseline ? clone(state.baseline) : null, page: () => state.page, pages: [...pageNames], safeUrl });
})();
