import fs from 'node:fs';
import assert from 'node:assert/strict';

// Assemble the reviewed presentation with the recovered, real PHP API contract.
// This is a local build step; it performs no deployment or network requests.
let source = fs.readFileSync('review/public/js/app.js', 'utf8').replace(/\r\n/g, '\n');
const original = fs.readFileSync('audit-evidence/production-recovery/source/js/app.js', 'utf8');
const replace = (from, to) => {
  assert.ok(source.includes(from), `Missing integration anchor: ${from.slice(0, 100)}`);
  source = source.replace(from, () => to);
};
const region = (start, end, text) => {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `Missing region: ${start}`);
  source = source.slice(0, a) + text + source.slice(b);
};
source = source.replace(/\/\* ={5,}[\s\S]*?\*\//, '/* CrackersMela storefront and admin UI. Identity, permissions, prices and orders are verified by the same-origin PHP services. */');
region('  const PREVIEW =', '  const ORDERS_API =', `  const LOCAL_HOST = ['localhost', '127.0.0.1'].includes(location.hostname);
  const IS_ADMIN_HOST = /(^|\\.)admin\\.crackersmela\\.com$/i.test(location.hostname) || (LOCAL_HOST && location.hostname === '127.0.0.1');
  const ADMIN_ENTRY = LOCAL_HOST ? 'http://127.0.0.1:' + location.port + '/#/staff' : 'https://admin.crackersmela.com/#/staff';
  const PUBLIC_ENTRY = LOCAL_HOST ? 'http://localhost:' + location.port + '/#/' : 'https://crackersmela.com/#/';
  const publicRoute = hash => IS_ADMIN_HOST ? PUBLIC_ENTRY.split('#')[0] + hash : hash;
`);
region('  /* The supplied backups', '  /* Analytics adapter:', `  let authenticatedUser = null;
  let csrfToken = '';
  let csrfPending = null;
  const currentUser = () => authenticatedUser;

`);
const firebaseConfig = original.match(/  const FIREBASE_CONFIG = \{[\s\S]*?\n  \};/)[0];
region('  // Authentication is deliberately', '  const STAFF_MENU_HTML', String.raw`  const authError = status => status === 429 ? 'Too many attempts. Please wait a few minutes and try again.' : status === 401 ? 'Incorrect email or password.' : status === 403 ? 'Your session expired. Refresh this page and sign in again.' : 'The request could not be completed. Please try again.';
  const apiJSON = async (url, body = null) => {
    // Every call waits for the CSRF bootstrap, GETs included. Letting GETs skip
    // it meant several a=session requests could run in parallel on first paint,
    // and the last Set-Cookie could belong to a different session than the
    // token held here, which made the first POST fail with 403.
    if (!csrfToken) await ensureCsrf();
    const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...(body === null ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(body)
    }) });
    const data = await response.json().catch(() => ({}));
    if (data.csrfToken) csrfToken = data.csrfToken;
    if (!response.ok || data.ok !== true) {
      const error = new Error(authError(response.status));
      error.status = response.status;
      error.reason = typeof data.error === 'string' ? data.error : '';
      throw error;
    }
    return data;
  };
  const ensureCsrf = () => {
    if (csrfToken) return Promise.resolve();
    // Deliberately a raw fetch rather than apiJSON: apiJSON awaits ensureCsrf
    // for every call, so routing this through it would recurse.
    if (!csrfPending) csrfPending = fetch('staff-auth.php?a=session', { cache: 'no-store', credentials: 'same-origin' })
      .then(r => r.json())
      .then(d => { const next = d && d.csrfToken ? String(d.csrfToken) : ''; if (next) csrfToken = next; return d; })
      .catch(() => null)
      .finally(() => { csrfPending = null; });
    return csrfPending;
  };
  const setIdentity = user => {
    privateDataRevision++;
    authenticatedUser = user;
    orders = []; users = {}; activity = []; heldBills = []; posCart = [];
    if (user) users[user.email] = user;
    clearPrivateCaches();
  };
  const refreshSession = async () => {
    try {
      const staff = await apiJSON('staff-auth.php?a=session');
      if (staff.authenticated) {
        setIdentity({ id: 'staff', email: staff.email, name: staff.name || 'Staff', role: staff.role || 'admin' });
      } else if (!IS_ADMIN_HOST) {
        const customer = await apiJSON('customer-auth.php?a=session');
        setIdentity(customer.user || null);
      } else setIdentity(null);
      await syncPull();
      if (IS_ADMIN_HOST && currentUser()) {
        const result = await apiJSON('customer-auth.php?a=users');
        users = Object.fromEntries((result.users || []).map(user => [user.email, user]));
      }
    } catch { setIdentity(null); }
  };
` + firebaseConfig + String.raw`
  // Available on both origins: the staff console needs it to drive the Google
  // popup, which the server then verifies before granting a session.
  const firebaseReady = () => !!(window.firebase && window.firebase.auth && FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey);
  const fbInit = () => {
    if (!firebaseReady()) return;
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION).catch(() => {});
  };
  const login = async (email, password) => {
    try {
      const data = await apiJSON((IS_ADMIN_HOST ? 'staff-auth.php' : 'customer-auth.php') + '?a=login', { a: 'login', email: String(email || '').trim(), password });
      await refreshSession();
      if (!currentUser()) return { ok: false, error: 'Sign-in could not be verified. Please try again.' };
      return { ok: true, name: currentUser().name, role: currentUser().role };
    } catch (error) { return { ok: false, error: error.message }; }
  };
  const register = async (name, email, password) => {
    if (IS_ADMIN_HOST) return { ok: false, error: 'Staff access is managed by the store owner.' };
    if (!name.trim() || !isValidEmail(email) || password.length < 15) return { ok: false, error: 'Enter your name, a valid email and a password of at least 15 characters.' };
    try {
      await apiJSON('customer-auth.php?a=register', { a: 'register', name: name.trim(), email: email.trim(), password });
      await refreshSession();
      return { ok: true, name: currentUser().name, role: 'customer' };
    } catch (error) { return { ok: false, error: error.status === 409 ? 'An account already uses this email. Please sign in.' : error.message }; }
  };
  const logout = async () => {
    try {
      await apiJSON((IS_ADMIN_HOST ? 'staff-auth.php' : 'customer-auth.php') + '?a=logout', { a: 'logout' });
    } catch { toast('Sign-out could not be completed. Please try again.', 'err'); return; }
    stopFeed(); setIdentity(null);
    checkoutState.data = {}; checkoutState.touched = {}; checkoutState.step = 1;
    checkoutCoupon = { code: null, discount: 0 };
    if (firebaseReady()) await firebase.auth().signOut().catch(() => {});
    save(); accountUI(); toast('Signed out.', 'info');
    route();
  };

`);
replace("        const result = await authUnavailable();\n        return toast(result.error, 'err');", "        if (!window.firebase || !window.firebase.auth) return toast('Google sign-in could not load. Check your connection, or use email and password.', 'err');\n        return toast('Google sign-in is not available on this site yet. Please use email and password.', 'info');");
replace('        await firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider());', `        const result = await firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider());
        const idToken = await result.user.getIdToken();
        await apiJSON((IS_ADMIN_HOST ? 'staff-auth.php' : 'customer-auth.php') + '?a=google', { a: 'google', idToken });
        await refreshSession();
        closeAuth(); accountUI(); route();`);
replace("    const m = $('#authModal');\n    $('#authBody').innerHTML", "    const m = $('#authModal');\n    if (IS_ADMIN_HOST) tab = 'login';\n    $('#authBody').innerHTML");
replace("    renderForm(tab);\n    $$('#authBody [data-atab]')", `    renderForm(tab);
    if (IS_ADMIN_HOST) {
      $('#authBody .auth-tabs').hidden = true;
      $('#authBody .auth-switch').hidden = true;
      $('#authBody .auth-head p').textContent = 'Sign in with your store staff account.';
    }
    $$('#authBody [data-atab]')`);
source = source.replaceAll('Min 8 characters', 'Min 15 characters');

region('  const placeOrder =', '  const CATALOG_API =', String.raw`  let orderAttempt = null;
  const submitOrder = async (order, pos = false) => {
    const signature = JSON.stringify({ order, pos });
    if (!orderAttempt || orderAttempt.signature !== signature) orderAttempt = { signature, requestId: crypto.randomUUID() };
    const result = await apiJSON(ORDERS_API, { a: 'create', order, pos, requestId: orderAttempt.requestId });
    if (!result.order || !result.order.id) throw new Error('The order service did not confirm your order. Your cart is saved.');
    orderAttempt = null;
    orders = [result.order, ...orders.filter(o => o.id !== result.order.id)];
    return result.order;
  };
  const placeOrder = async (customer, shipping, billing, payment) => {
    if (!cart.length || cart.some(c => { const p = prodById(c.id); return !p || !inStockOf(p) || !Number.isInteger(c.qty) || c.qty < 1 || c.qty > stockOf(p); })) {
      toast('Some items are unavailable in that quantity. Please review your cart.', 'err'); return null;
    }
    const order = { items: cart.map(c => ({ id: c.id, qty: c.qty })), customer, shipping, billing, payment,
      totals: { couponCode: checkoutCoupon.code || '' } };
    try {
      const savedOrder = await submitOrder(order);
      /* No confirmation email is requested from here. The order endpoint
         queues and sends it from the stored order after the commit, so a retry
         or a cached browser cannot produce a duplicate. */
      cart = []; save(); cartUI(); trackPurchaseOnce(savedOrder);
      return savedOrder;
    } catch (error) {
      const message = error.status === 422 ? error.reason : error.status === 400 || error.status === 409 ? 'Your cart or delivery details need to be reviewed. Refresh the catalog and try again.' : 'We could not place your order. Your cart is saved. Please try again.';
      toast(message, 'err'); return null;
    }
  };
  const syncUpdateStatus = async o => {
    const result = await apiJSON(ORDERS_API, { a: 'update', id: o.id, status: o.status, payment: o.payment });
    await syncPull();
    return result;
  };
  let orderPullPending = null;
  const syncPull = () => {
    if (orderPullPending) return orderPullPending;
    const revision = privateDataRevision;
    orderPullPending = apiJSON(ORDERS_API + '?a=pull').then(data => {
      if (revision !== privateDataRevision || !Array.isArray(data.orders)) return;
      orders = data.orders.filter(o => o && o.id && o.customer && o.shipping && Array.isArray(o.items) && o.totals && Array.isArray(o.log));
    }).finally(() => { orderPullPending = null; });
    return orderPullPending;
  };

`);
region('  const syncCatalogPush =', '  const syncCatalogPull =', String.raw`  const syncCatalogPush = async () => {
    if (!IS_ADMIN_HOST || !canSyncPush()) return null;
    try { const result = await apiJSON(CATALOG_API, { a: 'push', priceOverrides, stockOverrides, featOn }); save(); return result; }
    catch { await syncCatalogPull(); toast('The change was not saved. Please try again.', 'err'); return null; }
  };
`);
region('  const syncProductsPush =', '  const syncProductsPull =', String.raw`  const syncProductsPush = async () => {
    if (!canSyncPush()) return null;
    try {
      const data = await apiJSON(PRODUCTS_API, { a: 'push', productOverrides, extraProducts, settings: cmSettings, rev: cmSyncRev });
      if (Number.isInteger(data.rev)) { cmSyncRev = data.rev; ls.set('cmSyncRev', cmSyncRev); }
      return data;
    } catch (error) {
      await syncProductsPull();
      toast(error.status === 409 ? 'The catalog changed elsewhere. Review the latest values before saving again.' : 'Catalog changes could not be saved. Please try again.', 'err');
      return null;
    }
  };
`);
replace("  const uploadFile = (file, opts = {}) => {", "  const uploadFile = async (file, opts = {}) => {");
replace("    return fetch(UPLOAD_API, { method: 'POST', body: fd })", "    await ensureCsrf();\n    return fetch(UPLOAD_API, { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrfToken }, body: fd })");
source = source.replaceAll('&key=${encodeURIComponent(CM_SYNC_KEY)}', '');
replace("    const mine = orders.filter(o => o.email === u.email);", "    const mine = orders;");
replace('Enter the order code from your confirmation (e.g. <b>CMXXXXX</b>) — we\'ll show live status.', 'Enter your order code and the mobile number used at checkout.');
replace('          <button class="btn btn-primary" type="submit">${I.search} Track</button>', '          <input type="tel" id="trackPhone" placeholder="Mobile number" autocomplete="tel" pattern="[6-9][0-9]{9}" maxlength="10" required aria-label="Mobile number used at checkout">\n          <button class="btn btn-primary" type="submit">${I.search} Track</button>');
replace("      if (f) f.onsubmit = e => { e.preventDefault(); trackRender($('#trackCode').value); };", `      if (f) f.onsubmit = async e => {
        e.preventDefault(); const button = f.querySelector('button'); button.disabled = true;
        try {
          const result = await apiJSON(ORDERS_API, { a: 'lookup', code: $('#trackCode').value.trim(), phone: $('#trackPhone').value.trim() });
          if (result.order) orders = [result.order, ...orders.filter(o => o.id !== result.order.id)];
          trackRender($('#trackCode').value);
        } catch { $('#trackResult').textContent = 'No matching order found. Check your code and mobile number, then try again.'; }
        finally { button.disabled = false; }
      };`);
replace('      const placeBill = openWa => {', '      let billPending = false;\n      const placeBill = async openWa => {\n        if (billPending) return;');
replace('        const o = {\n          id: uid(), code, placedAt: now, status:', '        let o = {\n          id: uid(), code, placedAt: now, status:');
replace('        orders.unshift(o);\n        posCart = [];', `        billPending = true;
        try { o = await submitOrder({ items: lines.map(l => ({ id: l.id, qty: l.qty })), customer: cust, shipping: {}, payment: posPayMode || 'COD', totals: { posDiscount: discount } }, true); }
        catch { toast('The bill could not be saved. Your items are still here.', 'err'); return; }
        finally { billPending = false; }
        posCart = [];`);
source = source.replace('CrackersMela bill ${code}', 'CrackersMela bill ${o.code}');
replace("const waLines = lines.map(l =>", "const waLines = o.items.map(l =>");
replace("const payLabel = posPayMode === 'COD' ? 'Cash' : posPayMode === 'CARD' ? 'Card' : 'UPI';", "const payLabel = o.payment === 'COD' ? 'Cash' : o.payment === 'CARD' ? 'Card' : 'UPI';");
replace('Subtotal: ${money(subtotal)}${discount ? `\\nDiscount: - ${money(discount)}` : \'\'}\\nGrand Total: ${money(grand)}', 'Subtotal: ${money(o.totals.subtotal)}${o.totals.posDiscount ? `\\nDiscount: - ${money(o.totals.posDiscount)}` : \'\'}\\nGrand Total: ${money(o.totals.total)}');
replace('toast(`Order ${o.code} placed · ${money(grand)}`)', 'toast(`Order ${o.code} placed · ${money(o.totals.total)}`)');
region("    $$('[data-status]').forEach", "    $$('[data-stock]').forEach", String.raw`    $$('[data-status]').forEach(select => select.onchange = async () => {
      const order = orders.find(o => o.id === select.getAttribute('data-status'));
      if (!order) return;
      const previous = order.status; select.disabled = true;
      try {
        await syncUpdateStatus({ ...order, status: select.value });
        toast('Order status saved.');
        /* The server compares the stored status with the new one and sends the
           single matching customer email itself. */
        if (adminPanel === 'orders') { const panel = $('#staffPanel'); if (panel) { panel.innerHTML = staffOrders(); wireAdmin(); } }
      } catch { select.value = previous; toast('The status could not be saved. Please try again.', 'err'); }
      finally { select.disabled = false; }
    });
`);
replace('const maintReady = Promise.resolve();', 'const maintReady = refreshSession().then(() => { if (currentRoute) { accountUI(); route(); } });');
replace('    // Do not download customer orders to every visitor. Order reads must be\n    // restored through an authenticated, owner-scoped server API.', '    // Order reads are scoped by server session or authenticated customer ID.');
replace("          toast('The contact form is unavailable in this review. Please use the phone or WhatsApp link to contact the store.', 'info');", "          window.open('https://wa.me/' + String(STORE.whatsapp || '').replace(/\\D/g, '') + '?text=' + encodeURIComponent('Website enquiry from ' + n + ' (' + p + '): ' + msg), '_blank', 'noopener');");
source = source.replaceAll('PREVIEW || ', '').replaceAll('!!PREVIEW || ', '');
source = source.replaceAll("PREVIEW ? 'Local preview' : 'Admin console'", "'Admin console'");
source = source.replaceAll("PREVIEW ? 'Unavailable in preview' : 'Status not checked'", "'Server session'");
source = source.replaceAll("PREVIEW ? 'Image uploads are unavailable in this local preview.' : 'Image uploads are temporarily unavailable. Please try again.'", "'Image uploads are temporarily unavailable. Please try again.'");
source = source.replaceAll("PREVIEW ? 'Analytics are unavailable in this local preview because the backend source is missing.' : 'We could not load analytics. Please try again.'", "'We could not load analytics. Please try again.'");
source = source.replace("    if (PREVIEW) return Promise.reject(new Error('Analytics are unavailable in this local preview.'));\n", '');
source = source.replace('const privateRoute = !![', 'const privateRoute = [');
source = source.replace('This demo uses cash/UPI on delivery', 'We accept cash/UPI on delivery');
replace("const prodUrl = p => publicRoute('#/product/' + slugOf(p));", "const prodUrl = p => publicRoute('#/product/' + routePart(slugOf(p)));");
replace("const prodBySlug = slug => allProducts().find(x => x.slug === slug || 'p-' + x.id === slug);", "const prodBySlug = slug => allProducts().find(x => x.slug === readRoutePart(slug) || 'p-' + x.id === readRoutePart(slug));");
replace("    if (!location.hash && location.pathname === '/products') {\n      history.replaceState(null, '', '#/products');", "    if (!location.hash && /^\\/(products|about|contact|faq|shipping|safety|wholesale|returns|terms|privacy|price-list)\\/?$/.test(location.pathname)) {\n      history.replaceState(null, '', '#' + location.pathname.replace(/\\/$/, '') + location.search);");
replace('  const toggleMaint = () => {', '  const toggleMaint = async () => {');
replace("    syncProductsPush();\n    toast(remoteMaint", "    if (!await syncProductsPush()) return;\n    toast(remoteMaint");
replace('  const saveCouponSetting = () => {', '  const saveCouponSetting = async () => {');
replace('    syncProductsPush();\n    if (status)', '    if (!await syncProductsPush()) { if (status) status.textContent = \'The coupon was not saved.\'; return; }\n    if (status)');
source = source.replaceAll('if (saveBtn) saveBtn.onclick = () => {', 'if (saveBtn) saveBtn.onclick = async () => {');
replace('      syncCatalogPush();\n      activity.unshift', '      if (!await syncCatalogPush()) return;\n      activity.unshift');
replace('      syncProductsPush();\n      toast(`Saved', '      if (!await syncProductsPush()) return;\n      toast(`Saved');
replace('        syncProductsPush();\n        toast(`Added', '        if (!await syncProductsPush()) return;\n        toast(`Added');
replace("$$('[data-del-prod]').forEach(b => b.onclick = () => {", "$$('[data-del-prod]').forEach(b => b.onclick = async () => {\n        if (!confirm('Remove this product from the storefront?')) return;");
replace("save(); syncProductsPush(); toast('Product removed from the store'); reRender();", "save(); if (!await syncProductsPush()) return; toast('Product removed from the store'); reRender();");
for (const [attr, variable] of [['stock', 's'], ['price', 'i'], ['feat', 'c']]) {
  replace(`$$('[data-${attr}]').forEach(${variable} => ${variable}.onchange = () => {`, `$$('[data-${attr}]').forEach(${variable} => ${variable}.onchange = async () => {`);
}
source = source.replaceAll('      syncCatalogPush();\n      toast(', '      if (!await syncCatalogPush()) return;\n      toast(');
assert.ok(!/\bPREVIEW\b|CM_SYNC_KEY|authUnavailable|window\.CM_PREVIEW|syncPushOrders/.test(source), 'Preview or shared-key integration remains');
fs.writeFileSync('audit-evidence/production-release/js/app.js', source);
fs.copyFileSync('review/public/js/accessibility.js', 'audit-evidence/production-release/js/accessibility.js');
// The stylesheet is edited in review/public and deployed from production-release,
// so it has to be carried across or the two copies silently drift apart.
fs.copyFileSync('review/public/css/styles.css', 'audit-evidence/production-release/css/styles.css');
console.log('Production client assembled with real session, order, upload and catalog APIs.');
