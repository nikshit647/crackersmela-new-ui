# Original staff/editor/console task — verification report

The original package was frozen at 2026-10-05 03:43:04 UTC before the Promo/Category follow-ups. Original implementation and isolated regressions pass. This report has since been supplemented with the root's actual 5 October live/local CUA evidence; it does not change the immutable package or claim deployment, a production staff mutation, a real order, or a real email. The separate Promo Bar contextual editor and Shop by Categories redesign are now in progress and are not included in that original package.

## Implemented behavior

Staff sessions now carry server-defined roles and grants. The configured owner remains protected, managed accounts can be created/edited/activated with version checks, and account changes invalidate existing managed sessions. Both HTTP permission guards and client navigation/hydration enforce the role matrix. The Users interface handles staff and customer identities separately, validates inputs, preserves modal focus and supports restricted roles without forbidden data requests.

The editor stores new presentation changes in exact Desktop/Tablet/Mobile overrides over legacy defaults. Home product sections reuse the existing ordering controls and preserve native product card identity and cart handlers. The published runtime revalidates page data and rejects stale publication responses.

The analytics bootstrap is now an external same-origin script whose content matches parser-normalized original code. CSP remains unchanged, including historical hashes. Firebase 10.12.2 app/auth compat SDKs are pinned locally; only terminal map comments were removed, with upstream checksums and license retained.

## Verification matrix

| Area | Result | Evidence |
| --- | --- | --- |
| Staff HTTP permissions, lifecycle, owner compatibility | PASS 183/183 | `audit/staff-permissions-results.json` |
| Existing customer authentication | PASS 25/25 | Invoked by `tests/staff-permissions-test.py` |
| Existing backend security | PASS 95/95 | `audit/backend-security-test-results.json` |
| First-login concurrent-cookie race and ownership expiry | PASS 35/35 | `audit/session-bootstrap-results.json` |
| Notifications with fake transport | PASS 73/73; 11 fake messages | `audit/notification-test-results.json` |
| Google signature/claim verification | PASS 30/30 | `audit/customer-google-verification.json` |
| Combined client, console, responsive and ordering unit regressions | PASS 49/49, rerun during packaging | `node --test tests/staff-client.test.mjs tests/staff-api-race.test.mjs tests/production-console.test.mjs audit/test-production-client.mjs tests/cms-responsive.test.mjs tests/cms-product-order-runtime-test.mjs` |
| Real staff browser journeys | PASS 55/55 in three fresh launches; zero page errors | `audit/staff-users-browser-stability.json` |
| Original CMS backend | PASS 203/203 | `audit/editor-responsive-verification.json`; these 203 cases also remain passing in the expanded 234-case Promo suite |
| Responsive editor browser | PASS 14/14 | `audit/cms-responsive-browser-results.json` |
| Products reorder browser | PASS 37/37 | `audit/cms-product-reorder-browser-results.json` |
| Canva editing browser | PASS 34/34 | `audit/cms-canva-browser-results.json` |
| Legacy Home responsive grids | PASS 9/9 | `audit/cms-home-grid-browser-results.json` |
| PHP syntax | PASS, local PHP 8.3.35 | Changed backend files linted; CMS suite also exercises candidate includes |
| Live/local home/products viewport matrix | MIXED: local mobile grids fixed; live Home defect reproduced at all five mobile widths; final live 1280 Products CMS readiness incomplete | `audit/storefront-cua-verification-20261005.md`, 03:40–03:58 UTC |
| Live/local cart and checkout interactions | PASS within recorded keyboard/pointer matrix; no order submitted | Same CUA report: quantities, totals, removal, refresh, minimum-order gate, checkout and separate billing |
| Authenticated current live editor | LIVE INHERITANCE DEFECT REPRODUCED safely; baseline restored with one Undo | Same CUA report: Desktop 360px height also changed Tablet/Mobile; broader property matrix verified locally |
| Actual PDF rendering | UNVERIFIED locally | External mPDF autoload/fonts are absent; permission/CSRF/ownership paths pass |
| Production PHP 8.1 runtime | UNVERIFIED | Local runtime is PHP 8.3.35 |
| Floto/FloatingWidget provenance | UNRESOLVED | No matches in inspected site source; current browser script URL/stack evidence needed for attribution |

## Review findings and resolution

The cross-review reproduced a delayed `staff_required` 401 clearing a newer browser identity at `js/app.js:722–725`. The corrected `apiJSON` captures `privateDataRevision` at dispatch and accepts token updates or expiry teardown only when that revision still matches. Four dedicated API race cases pass, including stale success and stale error responses.

Fresh-browser testing also exposed intermittent first-login CSRF rejection. `cm-security.php` started a session on every include, so simultaneous public product/catalog/CMS reads could replace the cookie issued with the authentication bootstrap's CSRF token. The deterministic real HTTP test failed before the fix. Public reads now remain stateless; the customer identity read and `cmOrderOwned` initialize sessions explicitly. All 35 race/ownership checks and three fresh browser runs pass after the fix.

The root's current CUA observations confirm deployed defects rather than a remaining access gap. Live Home renders four columns after CMS hydration at 360/375/390/412/425px while live Products renders two; the local candidate renders two on both pages at those widths. In the authenticated live editor, changing Desktop category-section height from Auto to 360px also changed Tablet/Mobile fields and computed height to 360px. One Undo restored Auto/0px, disabled Save, and retained the exact saved/published timestamp of 4 October, 11:54 pm. No publication occurred. Local fixes remain undeployed, so these live defects remain present.

The final live 1280px Products reload did not reach observed CMS readiness; its native four-column fallback was usable, but the truncated later network buffer cannot establish a cause. This sample must not be counted as successful CMS application. Other recorded commerce/layout checks and the limited physical-pointer coverage are detailed in the CUA report.

No remaining high-confidence new authorization bypass, injected CMS content, catalog-price/cart mutation or persisted-order corruption was identified. The backend review included self-review by its author; frontend/CMS were cross-reviewed. Server roles, private stores, CSRF, active-account version resolution, customer ownership, CMS override allowlists, exact-origin preview messaging and product-ID validation were traced. This is bounded review evidence, not a claim that production has no vulnerabilities.

## Reviewable package and rollback limits

`audit/three-area-package.json` points to the timestamped package. `audit/three-area-change-manifest.json` records every compared file's baseline/source path and SHA-256, all current overlay mirrors, and the six supporting files omitted from the selective baseline. The package contains the full patch plus exact-byte candidate and rollback ZIPs for changed files; no credentials or private/customer stores are included. Forward patch application reproduces every candidate byte, and reverse application reproduces the declared baseline bytes.

The production baseline omitted `editor-shell.html`. That one production file uses the saved editor-overlay copy as an explicitly labeled comparison surrogate. Its exact pre-task production rollback has not been independently established. The old `visual-editor/release-manifest.json` is historical and does not describe the integrated candidate; use the new manifest for this package. No source rebuild was performed.

The original verification cycle is documented, with live defects, incomplete final live Products CMS readiness, PDF/production-runtime and extension-provenance limits retained explicitly. The original package's pending-storefront label records its state when created; this report and the CUA report supply later evidence without rewriting it. A separate combined package will be needed for the follow-ups. Do not mark the in-progress Promo/Category features complete from this original report.
