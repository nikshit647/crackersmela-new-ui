/* Keyboard support for the existing drawers. The storefront owns their content
 * and open/close actions; this module manages focus and accessibility state. */
(() => {
  'use strict';
  const mobileFilters = window.matchMedia('(max-width: 980px)');
  const mobileAdmin = window.matchMedia('(max-width: 820px)');
  const focusable = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])';
  const panels = [
    { id: 'mobileDrawer', panel: '.mobile-drawer__panel', label: 'Main menu', close: 'button[data-close-drawer]' },
    { id: 'cartDrawer', panel: '.drawer__panel', label: 'Your cart', close: 'button[data-close-cart]' },
    { id: 'authModal', panel: '.modal__card', label: 'Account sign in', close: 'button[data-close-auth]' },
    { id: 'filterCol', label: 'Product filters', close: '#filterClose', filter: true },
    { id: 'adminSidebar', selector: '.admin-side', label: 'Admin navigation', close: '[data-side-dismiss]', side: true },
    { id: 'productEdit', selector: '[data-edit-modal]', label: 'Edit product', close: 'button[data-close-edit]' }
  ];
  let active = null;
  let scheduled = false;
  let overflowBeforeOpen = '';
  const blocked = new Map();
  const usable = element => !!element && !element.disabled &&
    !element.closest('[inert],[hidden]') && element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== 'hidden';
  const choices = panel => [...panel.querySelectorAll(focusable)].filter(usable);

  function releaseBackground() {
    blocked.forEach((wasInert, node) => { if (node.isConnected) node.inert = wasInert; });
    blocked.clear();
  }

  function blockBackground(root) {
    // Exclude ancestors of the active panel and its scrim, including when the
    // filter lives inside main. Do not hide the page's live status messages.
    let branch = root;
    while (branch && branch !== document.body) {
      [...branch.parentElement.children].forEach(node => {
        if (node === branch || node.id === 'filterBackdrop' || node.id === 'toastWrap' || node.matches('.as-scrim') ||
            node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return;
        blocked.set(node, node.inert);
        node.inert = true;
      });
      branch = branch.parentElement;
    }
  }

  function restoreFilterFocus(oldElement, panel) {
    if (!oldElement) return null;
    if (oldElement.id) return panel.querySelector('#' + CSS.escape(oldElement.id));
    for (const attr of ['data-fcat', 'data-favail', 'data-fclear']) {
      if (!oldElement.hasAttribute(attr)) continue;
      return [...panel.querySelectorAll('[' + attr + ']')].find(node =>
        node.getAttribute(attr) === oldElement.getAttribute(attr) && node.value === oldElement.value);
    }
    return null;
  }

  function sync() {
    scheduled = false;
    releaseBackground();
    // Filter changes replace main's DOM. Retain the open drawer and focused
    // control through that replacement, rather than stranding keyboard users.
    const newFilter = document.getElementById('filterCol');
    if (active?.config.filter && !active.root.isConnected && newFilter && mobileFilters.matches) {
      newFilter.classList.add('open');
      document.getElementById('filterBackdrop')?.classList.add('open');
    }
    let next = null;
    for (const config of panels) {
      const root = config.selector ? document.querySelector(config.selector) : document.getElementById(config.id);
      if (!root) continue;
      const panel = config.panel ? root.querySelector(config.panel) : root;
      if (!panel) continue;
      const isDialog = config.side ? mobileAdmin.matches : !config.filter || mobileFilters.matches;
      const isOpen = isDialog && (config.side ?
        root.closest('.admin-shell').classList.contains('side-collapsed') && !document.body.classList.contains('pos-mode') :
        root.classList.contains('open'));
      root.inert = isDialog && !isOpen;
      if (isDialog) {
        root.setAttribute('aria-hidden', String(!isOpen));
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', config.label);
        panel.setAttribute('aria-modal', 'true');
        panel.tabIndex = -1;
      } else {
        root.removeAttribute('aria-hidden');
        root.removeAttribute('aria-modal');
        root.removeAttribute('role');
        root.removeAttribute('tabindex');
        if (config.filter) {
          if (root.classList.contains('open')) root.classList.remove('open');
          const backdrop = document.getElementById('filterBackdrop');
          if (backdrop?.classList.contains('open')) backdrop.classList.remove('open');
        }
      }
      if (isOpen) next = { root, panel, config };
    }
    const filterOpen = !!next?.config.filter;
    if (document.body.classList.contains('cm-dialog-open') !== !!next) {
      document.body.classList.toggle('cm-dialog-open', !!next);
    }
    if (document.body.classList.contains('cm-filter-open') !== filterOpen) {
      document.body.classList.toggle('cm-filter-open', filterOpen);
    }
    if (next) {
      const changed = !active || active.root !== next.root;
      const replacing = active?.config.id === next.config.id;
      next.returnFocus = replacing ? active.returnFocus : document.activeElement;
      next.lastFocus = replacing ? active.lastFocus : null;
      if (!active) overflowBeforeOpen = document.body.style.overflow === 'hidden' ? '' : document.body.style.overflow;
      active = next;
      document.body.style.overflow = 'hidden';
      blockBackground(next.root);
      if (changed || !next.panel.contains(document.activeElement)) {
        const preferred = replacing ? restoreFilterFocus(next.lastFocus, next.panel) : null;
        (preferred && usable(preferred) ? preferred : choices(next.panel)[0] || next.panel).focus({ preventScroll: true });
      }
    } else if (active) {
      const prior = active;
      active = null;
      document.body.style.overflow = overflowBeforeOpen;
      const target = usable(prior.returnFocus) ? prior.returnFocus :
        (prior.config.filter ? document.getElementById('filterFab') : null);
      if (usable(target)) target.focus({ preventScroll: true });
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(sync);
  }

  document.addEventListener('keydown', event => {
    if (!active) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      (active.config.side ? document : active.root).querySelector(active.config.close)?.click();
      schedule();
    } else if (event.key === 'Tab') {
      const items = choices(active.panel);
      const first = items[0] || active.panel;
      const last = items[items.length - 1] || active.panel;
      if (!items.length || (event.shiftKey && (document.activeElement === first || document.activeElement === active.panel))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }, true);

  document.addEventListener('focusin', event => {
    if (!active) return;
    if (active.panel.contains(event.target)) active.lastFocus = event.target;
    else (choices(active.panel)[0] || active.panel).focus({ preventScroll: true });
  });
  document.addEventListener('click', event => {
    const skip = event.target.closest('.skip-link');
    if (!skip) return;
    // A real fragment navigation would otherwise enter the storefront router.
    event.preventDefault();
    const view = document.getElementById('view');
    view?.focus();
    view?.scrollIntoView({ block: 'start' });
  });
  new MutationObserver(schedule).observe(document.body, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['class']
  });
  mobileFilters.addEventListener('change', schedule);
  mobileAdmin.addEventListener('change', schedule);
  schedule();
})();
