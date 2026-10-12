# Deployment source discovery — sanitized findings

27 September 2026. Read-only inspection of the current workspace and the two user-named Downloads folders. This report contains no credentials. No authentication attempt, production mutation, upload, deployment, or release archive was made. Customer exports and unrelated personal credential stores were not opened.

**Later coordination update:** the root agent independently verified the server identity and completed an authorized root SSH login. The actual application document root is `/home/crackersmela.com/public_html` on Ubuntu with OpenLiteSpeed/CyberPanel. Root recovered the live PHP/source with checksum verification into ignored `audit-evidence/production-recovery/source`, and staged a working copy at `audit-evidence/production-release`. The local-backup absence findings below describe the initial discovery and are no longer a source-access blocker. This subagent did not use credentials or connect to the server.

## Verified projects and backups

| Location | Verified identity | Relevance to the live application |
|---|---|---|
| Current workspace | Local Git repository, no remote configured; HEAD `8db3b61` | Recovered current vanilla-JavaScript UI plus an intentionally isolated preview. It is not a complete production project. |
| `Downloads/crackers remake` | `https://github.com/nikshit647/crackersmela-new-ui.git`; HEAD `40596a7` | Older blue vanilla-JavaScript UI, Spring Boot project and incomplete Python backend. Same UI family, earlier application revision. |
| `Downloads/crackersproject new UI/crackersmela-new-ui` | Same GitHub remote; HEAD `0a26306` | Earlier static/Spring variant. |
| `Downloads/crackersproject new UI/crackersproject` | `https://github.com/hecker647/crackers-hyderabad.git`; HEAD `8c491ed` | Different React/Express/Firebase application. Its deployment instructions do not describe the observed live PHP app. |
| `Downloads/crackers remake/crackersmela-files-backup/public_html` | WordPress tree, WordPress/LiteSpeed `.htaccess`, `.ftpquota`, older site archive | Historical hosting backup, not the current vanilla/PHP application. The archive contains a Bluehost WordPress plugin, which supports historical Bluehost use but identifies no current SSH endpoint. |

Current public/admin assets observed during the audit use build stamp `20260925b`, a shared `index.html`, `css/styles.css`, `js/app.js`, and `js/products-data.js`. The hostname selects the public/admin experience. The current backend uses PHP routes rather than the supplied Spring or Express services.

The current implementations of `orders-api.php`, `products-api.php`, `catalog-api.php`, `upload-api.php`, `email-api.php`, and `analytics-api.php` were not found in the supplied relevant source/backups. WordPress/plugin PHP files are present; they are not these custom endpoints. Earlier archive/history inspection is also recorded in `AUDIT_REPORT.md`.

## Bluehost connection discovery

No verified account-specific Bluehost SSH hostname, server IP, port, cPanel endpoint, or SFTP configuration was found in the inspected local project deployment metadata. No `.cpanel.yml`, `.ftpconfig`, or `sftp.json` supplying such an endpoint was located. Public site DNS alone was not treated as an authorized root endpoint. The root agent subsequently resolved and verified hosting access separately; the confirmed runtime is OpenLiteSpeed/CyberPanel, so the old cPanel/Hostinger instructions are not the deployment procedure for this server.

The unrelated React project contains `.github/workflows/deploy-hostinger.yml`. It reads `DEPLOY_HOST` and a deployment token from GitHub Secrets, then sends an archive to an HTTPS `/api/deploy` endpoint. The host value is not stored in the workflow. Its `deploy.sh` assumes an already connected Linux root shell, uses `/var/www/crackershyderabad` and `/root/crackers-deploy/api`, and restarts a PM2 process. It supplies no SSH connection address and must not be applied to the Bluehost PHP site.

Project environment files were inspected for variable names only. They identify email/SMS/Firebase/backend and Vercel tooling configuration, not verified Bluehost SSH settings. No password or token value was printed or used by this discovery task.

## Why the preview cannot be published directly

| Preview location | Current behavior | Production consequence if copied wholesale |
|---|---|---|
| `review/public/js/app.js:107` | Preview identity is accepted only on localhost/127.0.0.1 | The local admin display identity does not become a production session. |
| `review/public/js/app.js:112` | Shared sync key is intentionally empty | Existing key-dependent write/report calls cannot be assumed to function. Restoring the exposed shared key would not remediate security. |
| `review/public/js/app.js:204` | `currentUser()` returns the preview fixture or `null` | Production users and administrators would be treated as signed out. |
| `review/public/js/app.js:663` | Firebase readiness is disabled; login/registration use an unavailable response | Publishing would disable real login/registration. |
| `review/public/js/app.js`, state/sync/contact regions | Private state storage, order reads/writes, acknowledgements, and contact handling differ from the original client | These require genuine backend integration, not visual-only transplantation. |
| `review/server.mjs` | Loopback-only server, fixture reads, rejected writes, injected admin display fixture, local notice and restrictive resource policy | This is an audit harness, not Bluehost runtime or production authorization. |
| `review/fixtures`, audit/test files | Catalog snapshots and synthetic test data | They must not replace current product/order/customer stores. |

Preserving existing production behavior is distinct from fixing its security weaknesses. A UI-only release would not establish server-side authorization, revoke the exposed shared key, or verify pricing/order/upload protections. Those need the actual PHP source and controlled backend testing.

## Narrow UI-only release candidate

This is an integration plan, not a prepared release package. First retrieve the actual current public/admin document roots and baseline assets through verified hosting access, identify whether both hosts share files, and make an owner-accessible rollback snapshot. Apply source hunks to that baseline; do not replace its app or index with the preview versions.

### Existing files suitable for the visual candidate

| Local file | Candidate treatment |
|---|---|
| `review/public/css/controls.css` | Copy as a new CSS asset. Contains visual/interaction-state styling and accessibility utilities, no remote imports/URLs, credentials, API calls, or preview identity. Must load after the existing base stylesheet. |
| `review/public/css/admin-controls.css` | Copy as a new CSS asset after `controls.css`. Includes admin/POS control and narrow-screen bill scrolling improvements. Depends on the existing admin class/token family; verify against the downloaded live baseline. |
| `review/public/images/logo.png` | Existing 851×213 branded image, not a newly generated replacement. Enlargement is CSS-only; no image upload is needed if the hosted asset matches. If missing/different, compare before replacing. |
| `review/public/css/styles.css` | Do not replace the entire 352 KB base sheet for this narrow release. Transfer only the two approved navbar-logo rules below to the existing stylesheet or a small versioned override. Keep drawer/footer/invoice logo sizes unchanged. |
| `review/public/js/products-data.js` and product images | Not part of the control/logo change. Keep current production catalog/assets rather than publishing snapshots. |

Inspected SHA-256 fingerprints:

- `controls.css`: `253B17ABF243FBEF7584AAA9A9F1C6444180C23DBC3A821AAED5443CAD68F0ED`
- `admin-controls.css`: `B52066FBBF1D6A726431FCE96B7301839ADF53538EE0E1EBAEB266F8D02A86AD`
- `images/logo.png`: `936E9AD94EE40EB5B4F6BFE8F34FFD8378D7C5565B6BE63AD42C456344C8B60E`

Approved current logo-only CSS delta:

```css
.navbar .logo-img { width: 302.5px; }
@media (max-width: 900px) {
  .navbar .logo-img { width: min(49.5vw, 220px); }
}
```

### Minimal HTML integration

Add the two stylesheet links immediately after the current base stylesheet, using a fresh asset version. Add a versioned logo override if the two rules are not appended to the live base sheet. Preserve current metadata, auth SDKs/configuration, analytics bootstrap, script order and API configuration. Remove only the four decorative navigation SVGs for Home/Categories/About/Contact; retain category-expand chevrons and meaningful menu/search/cart/account icons. Preserve all existing navigation URLs and IDs. Refresh the application-script cache version only when its audited template patch is ready.

### Minimal JavaScript/template integration

The visual-only reference is the `4e85200..8db3b61` diff for `review/public/js/app.js`; use individual presentation hunks after matching them to the actual live baseline. Do not copy function bodies wholesale where they also include changed business rules.

| Area | Exact presentation changes to transplant | Preserve |
|---|---|---|
| Product card/actions | Use `add-btn--product`, remove decorative cart icon from labeled add/sold buttons, remove redundant HOT/BESTSELLER badge. Keep discount/status information. | `data-add`, product ID, stock/disabled conditions, featured flags/filter behavior. |
| Product detail | Remove decorative icons from Add to cart/Buy now; assign Buy now `btn-secondary`; update only temporary Added/reset text. Normalize escaped line breaks for displayed description text if baseline still needs it. | `pdAdd`, `pdBuyNow`, quantity handling and purchase listeners. Do not transplant cart/order logic. |
| Checkout progress | Replace the `stepper`/`step-pill` display template with `ol.checkout-steps` and `li.checkout-step`; exactly one current item uses `aria-current="step"`; completed steps use `is-complete`. | Existing step number/state and transitions. The display must not become new navigation. |
| Checkout actions/forms | Add `.checkout-actions` wrappers; remove `btn-block` from `ckNext2`/`ckPlace`; remove decorative arrows/lock; use `.phone-entry` and `.coupon-entry`; coupon action gets `btn-secondary`. Replace the giant inline-lock note with `.checkout-note` pay-on-delivery text. | All `ck_*` input IDs, `ckNext1`, `ckNext2`, `ckBack1`, `ckBack2`, `ckPlace`, coupon IDs, amount expressions, validation and submit/API code. |
| Home/cart/other labeled actions | Remove redundant decorative icons; Explore Crackers uses `btn-secondary`. Retain text/destinations and meaningful edit/delete/back/search icons. | Navigation, cart mutation and order behaviors. |
| Category/collection selectors | Preserve existing `.cat-pill`/`.chip` nodes and handlers; add meaningful category count label, hide duplicate count from screen readers; collection toggles use `aria-pressed` with matching state update. | Existing product filters, counts, URLs and selected classes. |
| Admin templates | Add accessible names to icon-only controls; wrap featured checkbox in `.admin-check`; keep file input keyboard reachable via `.sr-only`; remove redundant save/update/hold/generate icons. | `data-feat`, upload IDs, save/delete handlers, request payloads and existing access/session code. |
| POS controls | Add group labels and synchronized `aria-pressed` states to category/payment/view selectors; retain the CSS fix for scrollable bill pane at narrow widths. | Product additions, quantities, totals, payment choice values and finalization handlers. Do not copy preview notice compensation. |
| Reduced motion | In `setupReveal`, mark `.reveal` elements `.in` before returning for reduced motion, alongside the provided reduced-motion CSS. | Routing and data behavior. |
| Password visibility | Change only the button's Show/Hide password accessible label in its visibility toggle. | Real login/register/Firebase/session implementation. |

The stylesheet links alone do not deliver the complete approved UI: the new checkout stepper/action/phone/coupon selectors require their matching markup. Conversely, copying the whole preview `app.js` would break authentication. A focused patch to the actual live source is the required bridge.

Before upload, review the patch to confirm it touches only these presentation areas and contains no secret values; syntax-check it and test the live-baseline copy locally with backend writes disabled. After verified hosting access is available, deployment should update only these selected assets/hunks, then check public/admin rendering and authentic access controls through controlled accounts. Actual backend security changes require a separate source-backed patch and verification.

## Staged UI integration completed

After verified source recovery, this subagent changed only the staged `index.html` and added three stylesheet assets: `css/controls.css`, `css/admin-controls.css`, and `css/brand-overrides.css`. The first two are byte-identical copies of the approved controls; the last contains only the two navbar-logo rules above. The live base `css/styles.css` is byte-identical to recovery. The existing logo image was not replaced.

The staged index adds the three CSS references after the existing base stylesheet with cache version `20260927c`, removes only the four decorative navigation SVGs, and bumps the existing local app-script cache version to `20260927c`. All original script blocks/references remain identical after normalizing that cache suffix, including authentication SDKs/configuration. All element IDs, navigation/form destinations and script ordering were preserved. No preview identity/notice or new remote stylesheet request was introduced.

Nine static preservation checks passed. This is not a full browser or backend validation of the production candidate. Root owns the matching `app.js` presentation/security integration; the backend agent owns PHP. No recovered/staged source was committed and this subagent has not deployed anything.
