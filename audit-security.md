# CrackersMela security review — deployed frontend snapshot

Reviewed on 26 September 2026. This workstream inspected the downloaded `live-app.js` and `live-index.html`, which represent the current public client and differ from the older supplied source folders. References below are exact lines in the **original downloaded `live-app.js`**, unless another file is named. The PHP implementations and live server configuration were unavailable. A frontend finding must not be interpreted as proof of a backend vulnerability being exploited or fixed.

No production mutation, authentication attempt, customer-order list request, upload, order placement, or email request was performed in this workstream. All executable proofs ran in isolated Node VM contexts using synthetic data and stubbed network functions. Secret values and owner identity are deliberately omitted.

## Architecture and trust boundaries

- The current deployment is a vanilla JavaScript SPA. Both domains use the same application; the hostname controls whether it renders the admin console (77–81, 2140–2150, 3897–3906). Hiding a route by hostname is not authorization.
- Users, password hashes, sessions, roles, cart, complete orders, catalog overrides, preferences, and coupons are read from browser `localStorage` and saved back there (85–107).
- Email/password registration and login run entirely in the browser (608–626, 676–719). Firebase Google login is initialized separately (632–673), but these PHP requests do not obtain or send a Firebase ID token. Firebase's public web configuration is not itself a secret vulnerability.
- The server contracts visible in the client are:

| Endpoint | Observed client contract | Identity data attached by this JavaScript |
| --- | --- | --- |
| `orders-api.php` | GET `a=pull`; POST `a=pushmany`; POST `a=update` | Shared embedded key on writes; no account token on reads |
| `catalog-api.php` | GET `a=pull`; POST `a=push` with all price/stock/featured overrides | Shared embedded key on writes |
| `products-api.php` | GET `a=pull`; POST `a=push` with products, overrides, settings, revision | Shared embedded key on writes |
| `upload-api.php` | POST multipart `image` | No explicit account token or shared key |
| `email-api.php` | POST order confirmation/status email with complete browser-built order | Shared embedded key |
| `analytics-api.php` | POST events; GET report with date range and key | Shared key in report URL |

Same-origin `fetch` can also carry cookies, so absence of an explicit header does **not** prove the server ignores cookies. No PHP login/session creation flow is present in the reviewed frontend. The actual server authorization policy must be inspected before making a definitive backend claim.

## Confirmed security findings

### SEC-01 — Admin identity and privileges are controlled by local browser state

- **Severity:** High; backend impact may be Critical if these client gates are the only protection.
- **Location:** 91–107, 155–162, 623–625, 676–719, 947, 2140–2150, 3362–3364.
- **Cause:** `currentUser()` trusts a matching token stored in two attacker-writable objects. An arbitrary token copied into both objects passes the check; it has no server signature or server session validation. The source comment claiming this prevents forged state is incorrect.
- **Additional direct path:** registration assigns the `admin` role when the submitted email matches the owner email (712). The account is created locally without verifying mailbox ownership. Password hashing is a single salted SHA-256 operation (609–614); hashes and salts remain readable and replaceable in localStorage. Random tokens have no expiry or server revocation, and logout does not revoke the stored user's token.
- **Risk:** anyone can assume an administrator identity within their own browser and reach every admin operation. A normal customer fails the original role check, but changing local state bypasses it. Six staff role labels also share all client capabilities, including settings, product removal, price changes, and status changes.
- **Verification:** `audit-security-proof.cjs` extracts and runs the actual original functions. A synthetic matching user/session passes `canSyncPush()`. A synthetic registration using the owner identifier read internally from the source returns `role: admin`; no identity or credentials are printed or transmitted.
- **Required fix:** use server-authenticated sessions or server-verified Firebase ID tokens; determine roles from a protected server database/claim; verify ownership and individual permissions per request; remove email-based automatic promotion and all browser password authentication. Frontend role checks can remain only for interface behavior.
- **Local mitigation:** the edited client fails closed instead of accepting browser-stored identities; local password authentication and email-based admin promotion were removed. Only the loopback preview has a clearly labeled synthetic UI identity, and its server rejects writes. Regression tests reject forged browser roles and require unavailable authentication to fail honestly. Client-only changes cannot establish server authentication, so backend remediation is still required.

### SEC-02 — Privileged shared credential and demo administrator credentials are publicly shipped

- **Severity:** High; potential Critical operational impact depends on server acceptance and credential reuse.
- **Location:** shared credential declaration 79; demo credentials 616–620; use on writes 876, 887, 895, 924, 954, 3818; report URL 2519.
- **Cause:** a shared key used for order/catalog/settings/email/report operations is included in JavaScript delivered to every visitor. Plaintext administrator demo passwords are also in the public source, including strings assembled from arrays. Splitting a password into fragments does not hide it. The same shared key appears in a GET query string, which can persist in server/proxy request logs.
- **Risk:** source recipients obtain the credential used by privileged client requests. There is no individual identity, revocation, or least-privilege separation inherent in this design. The code also exposes known local administrator login credentials.
- **Verification:** static trace of declaration, login consumption, and all network call sites. No credential was used against production.
- **Required fix:** remove privileged credentials and demo identities from all served assets; replace shared-key browser authorization with verified individual sessions; enforce server role checks; then rotate exposed server secrets and review relevant access logs. Rotation/deployment were not performed because production changes require the user's later approval.
- **Local mitigation:** privileged credential values and demo identities were removed from the served review. Production keys remain a deployment/backend task; they were not rotated and the live assets were not modified.

### SEC-03 — Image URLs are interpolated into executable inline error handlers

- **Severity:** High.
- **Location:** card renderer 56–64; admin thumbnail 2389–2393; POS thumbnail 2928–2934. Input source: image URL form 2597, 2639–2644; persisted by product edit 2878 and add product 3479–3492; catalog refresh loads stored values at 970–971.
- **Cause:** `esc()` is HTML encoding, but the image URL is placed inside a single-quoted JavaScript string in an HTML `onerror` attribute. Browsers decode HTML entities before compiling the handler, so encoded apostrophes become executable JavaScript delimiters again. This also breaks legitimate image names containing apostrophes when the fallback is needed.
- **Attack prerequisite:** a user capable of entering or otherwise controlling a stored product image URL. That is an authenticated staff function in the intended model; SEC-01 undermines the current client gate. Cross-browser persistence still depends on the server accepting that product value.
- **Risk:** script execution in the storefront/admin origin when the failed image fires its error handler; access to browser-held accounts, orders, roles, and credentials follows.
- **Verification:** two original renderers were evaluated in the isolated proof. A synthetic image URL caused a boolean marker to be set when the generated handler was decoded and evaluated. There were no network calls, browser dialogs, or production payloads. The POS renderer contains the same vulnerable construction.
- **Local fix implemented:** `review/public/js/app.js` now validates image schemes, renders fallback URLs only in escaped data attributes, and uses one capture-phase image error listener with property assignment. It tries the original image once and then renders the existing category placeholder. All three product rendering surfaces use this helper. The admin image widget validates preview/upload URLs and clears stale previews when emptied. No layout or branding redesign was introduced.
- **Verification of fix:** `node --test tests/image-security.test.mjs` — **12/12 PASS** in the combined final run. Tests cover the original injection shape, executable URL schemes, credentials in URLs, mixed content, one-time image fallback, accessible placeholder, unrelated image errors, removal of inline image error-handler strings, original file validation before decoding, pathological dimensions, save-time URL validation, HTTP failures, error sanitization, and returned upload URLs. `node --check review/public/js/app.js` — **PASS** at handoff.
- **Limit:** this closes the reviewed image-handler sink locally. It does not certify all server-stored content or deploy a live fix.

### SEC-04 — Cached order details remain available without account/ownership checks

- **Severity:** Medium for the confirmed browser privacy issue; possible High server-side disclosure remains unverified.
- **Location:** complete order persistence 96, 107, 898–914; logout 721–724; invoice route 1736–1790; track suggestions 1804–1807; tracker 1811–1831; email-only history filter 1852–1859; unconditional startup pull 4624.
- **Cause:** complete order records persist in the browser. Logout clears the current session but retains those records. The invoice route selects by order ID without checking identity or ownership. Tracking exposes delivery address and recent order/customer suggestions from the full local order array.
- **Risk:** on a shared browser, a subsequent visitor can access cached previous customer/order details after logout. If the server returns orders belonging to multiple customers from its pull endpoint, the frontend stores and displays that wider dataset too. That server response was deliberately not accessed.
- **Required fix:** fetch order details from an authenticated ownership-scoped API; return only the minimum fields required for any guest tracking flow; use high-entropy guest access tokens or verified contact lookup; clear private cached data at logout and account switch; remove global recent-order suggestions. Do not rely on a client email filter as authorization.
- **Verification:** code trace confirms the persistent cache, logout behavior, and missing route ownership checks. Full cross-customer production disclosure is **not claimed**.

## Backend security checks that remain unverified

These are concrete questions raised by the observed contract, **not confirmed server vulnerabilities**. The PHP application, storage configuration, and an isolated server test environment are needed.

| Priority | Area and evidence | Required verification / remediation |
| --- | --- | --- |
| Critical if confirmed | Shared-key mutations: 887, 895, 924, 954 | Missing, invalid, customer, and wrong-role identities must receive 401/403 for every order/admin operation even if a previously published shared key is supplied. Never test this by mutating production records. |
| High | `orders-api.php?a=pull` requested by every visitor: 898–914, 4624 | Ensure anonymous clients cannot obtain the order collection; customers receive only owned records; admin access is role enforced. Verify with two synthetic accounts locally. |
| High | Browser supplies order prices, quantities, coupon amounts, totals, status, ID, and timestamps: 845–878, 882–895 | Accept SKU/product IDs and positive bounded integer quantities; calculate prices, discounts, tax/delivery, stock, and canonical status on the server in a transaction. Reject non-finite/negative/fractional/oversized values and unknown products. Add idempotency and stock concurrency tests. |
| High | Upload sends no explicit identity; MIME/5 MB checks are client-only: 1027–1058 | Verify server authentication/role, real image decoding/signature checks, dimensions, upload size, random server filenames, traversal rejection, non-executable upload directory, and safe retrieval headers. Client limits now apply before decoding, and upload HTTP errors cannot become success; these do not replace server checks. |
| High | Raw order IDs/quantities reach HTML: 1774, 1867, 2381, 2385, 2425, 2428, 3354 | Server must validate schema and the frontend must still escape IDs and render numeric values after type/range validation. Isolated proof confirms a synthetic order ID becomes an additional HTML attribute; persistence/cross-user exploitability depends on the unreviewed server. |
| Medium | Admin image URL is unrestricted before local fix; export uses simple CSV quoting: 2597, 3461–3463 | Validate image URLs on the server too; do not fetch arbitrary URLs server-side. Guard spreadsheet exports against formula-leading text if lower-trust users can edit exported fields. CSV formula execution was not tested. |
| Medium | All staff labels share access: 155–156, 2142, 3364 | Define the intended role matrix and verify it server-side. A packer should not receive product deletion/settings privileges merely because it is a staff role. |
| Medium | Client-originated complete email contents: 875–876, 3815–3818 | Email service must look up canonical owned/admin-authorized orders; restrict recipients/templates and enforce rate limits so callers cannot send arbitrary confirmation/status mail. |
| Medium | CSRF/cookies/CORS | Inspect actual server cookie flags, session issuance, allowed origins, CSRF checks, and header handling. JSON requests and an unguessable key do not fix a publicly embedded shared credential. No categorical CSRF/CORS finding is asserted from frontend code alone. |
| Medium | IDs and tracking codes generated with `Math.random`: 68–69 | Generate canonical IDs server-side; if a tracking identifier grants access to private data, use a cryptographically strong token and rate limits, not the current five-character random code. |
| Informational | PHP/database/storage/deployment absent | SQL/NoSQL/command injection, server-side path traversal, SSRF, database access, password storage on the server, upload deletion, storage ACLs, server logging, rate limiting, dependency vulnerabilities, and production headers cannot be certified from these assets. |

## Related confirmed reliability bugs

| ID / severity | Location | Cause and effect | Fix and verification |
| --- | --- | --- | --- |
| BUG-SYNC-01 / High | 898–914 | A nominal read automatically uploads every local order absent from the server. An old browser can resurrect deleted records or send arbitrary local records merely by loading the app. | Make reads side-effect free; only explicitly queued, validated order submissions may be retried with server idempotency. Isolated proof with an empty stub response and synthetic local order confirms the push attempt. |
| BUG-CHECKOUT-01 / High | 871–878, 4427–4435 | Checkout clears the cart and shows an order-success page before the server accepts the order; failed fetches are swallowed. Confirmation email is a separate independent request. | Await a canonical server response; preserve the cart on failure; show retry guidance; create notifications from accepted server state. Root workstream owns implementation. |
| BUG-ADMIN-01 / Medium | 921–925, 954–960, 2893–2899, 3503–3507, 3813–3818 | Admin changes show success before persistence; request failures are swallowed. | Await responses, inspect HTTP status, show actionable errors, retain an unsaved draft, and refresh only after successful persistence. |
| BUG-PRODUCT-01 / Medium | 2490–2501, 3446–3450 | Deleting an extra product runs immediately without confirmation and announces success before persistence. The normal interface only exposes this delete action for extra products; base-product deletion is not a confirmed reachable UI bug. | Confirm extra-product deletion and announce completion only after successful server persistence. |
| BUG-PRICE-01 / Medium | 2845–2850, 3823–3835 | The original negative edit price was coerced to zero before the validity check; table inputs also store unvalidated numeric stock/price values. | Add/Edit Product numeric validation is now fixed locally and tested in `tests/admin-quality.test.mjs`; table/server validation still requires follow-up before production integration. |
| BUG-POS-01 / Medium | 3660–3699 | POS reports a placed order after local persistence with no immediate server submission; its eventual persistence depends on the side-effecting order poll. | Submit explicitly and await server acceptance, or identify it clearly as an unsynced local draft. |
| BUG-IMAGE-01 / Low | 60, 63, 2639 | Category SVG was HTML-escaped inside a JavaScript fallback, causing markup text instead of the intended icon; clearing the image URL did not clear its preview. | Local image fix renders the existing trusted icon and clears empty/invalid previews; covered by image tests. |

## Reproducible local checks and artifacts

- `node audit-security-proof.cjs`: original-source findings reproduced in isolated contexts; **PASS**, seven recorded observations. This deliberately demonstrates original vulnerabilities, not the safety of the fixed version.
- `audit-security-proof-results.json`: machine-readable evidence with no credentials or customer data.
- `node --test tests/image-security.test.mjs`: image security regression checks; **12 PASS, 0 FAIL** in the combined final run.
- `node --check review/public/js/app.js`: **PASS** at handoff.
- Server authorization, server price enforcement, real uploads, real order CRUD, and production deployment verification: **NOT VERIFIED — backend source/test environment required**.

The current review is suitable for a local UI demonstration with all production mutations disabled. It is not yet evidence that the deployed application is secure or that the full production backend can safely be released.

Follow-up implementation and verification are recorded in `audit-additional.md`. At the final security-workstream handoff, the combined local suite contained **98 passing tests**, including catalog-sync/admin-quality/frontend-cleanup checks and parent-owned preview, storefront, and feed checks. No production deployment or real backend authentication, order, upload, or CRUD success is implied by those results.
