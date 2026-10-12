# Crackers Mela — combined implementation and release review

5 October 2026. Continues chat `01a109e0-f44a-7021-b511-b5aaf8cbb410` in its existing workspace.

**Additional verification completed:** PHP 8.1.34 compatibility suites pass. The invoice font-directory bug is fixed; actual PDF rendering and downloads pass on PHP 8.1.34 and 8.3.35. The updated package below supersedes the earlier 11:49 UTC package, which remains unchanged.

**The combined local candidate is implemented and its final regression checks pass. Production has not been deployed or published.** The local preview is available at <http://localhost:4186/?watch=1#/> and refreshes as source changes are saved, including after navigating to another page.

The candidate includes staff role management, independent Desktop/Tablet/Mobile editing, the existing Home/Products reorder workflow, the website-origin console fixes, the contextual Promo Bar editor, the eleven custom category illustrations/cards, and the invoice font-directory correction. The dynamic category-count correction prevents saved CMS text from replacing current catalog counts while retaining count styling and ordinary text editing.

## Requested result matrix

PASS below means the recorded, bounded checks passed; it is not a claim that untested production behavior is verified.

| Area | Local candidate | Production / qualification |
|---|---|---|
| User management | PASS | Synthetic browser create/edit/role/deactivate/reactivate workflows; no production account mutations |
| Roles | PASS | Super Admin, Admin, Billing, Inventory Manager and Order Manager; owner access preserved |
| Server-side permissions | PASS | Fresh 183/183 HTTP permission checks; direct unauthorized calls denied |
| Visual editor | PASS | Existing four-panel editor, selection, draft, preview, publish, undo/redo verified in isolated fixtures |
| Desktop isolation | PASS | Exact-device overrides; existing legacy appearance retained |
| Tablet isolation | PASS | Does not overwrite Desktop or Mobile |
| Mobile isolation | PASS | Does not overwrite Desktop or Tablet |
| Product reorder | PASS | Existing Products and Home paths retained; prior 37 browser checks and fresh runtime tests |
| Promo Bar | PASS | Fresh 27/27 browser checks; real bar, message operations, style controls, all devices, draft/reload/publish |
| Shop by Categories | PASS | All 11 category destinations and required widths in prior design run; fresh editor/commerce 28/28 and count-sync check |
| Add to Cart | PASS | Fresh detail-page and eight-width product-grid/cart checks; earlier live multi-product persistence evidence retained |
| Cart | PASS | Correct product and ₹2,800 total freshly observed; prior quantity/remove/refresh matrix retained |
| Checkout | PASS within tested scope | Form opens above the minimum; backend synthetic order paths tested. No real order submitted |
| Invoices | PASS locally | Real one/five-page PDFs and authenticated single/bulk downloads pass 66/66 on PHP 8.1.34 and 8.3.35; actual production font/library/logo assets remain unverified |
| Mobile | PASS locally; FAIL live Home | Local two-product rows at 360/375/390/412/425; live Home still has four product columns, reproduced at 390 in this session |
| Desktop | PASS | Local 1280 layout; fresh live Products 1280 CMS hydration, four columns and 117 cards verified |
| Admin authentication | PASS | Existing-owner and managed-role fixture workflows; fresh customer auth 25/25 |
| Security | PASS within tested scope | Fresh role/CMS validation plus dated backend/session/ownership evidence; not an exhaustive production security claim |
| Console | PASS locally; FAIL live | Complete local capture: no errors; live exact inline-script CSP error reproduced |
| Network | PASS in observed capture | Local 46 responses with no failures/HTTP errors; live capture also had no HTTP/network failures |
| Regression | PASS within recorded scope | Combined client/runtime 57/57, backend 234/234, Promo 27/27, category/commerce 28/28 |
| Live site | FAIL release acceptance | Mobile Home and CSP defects remain deployed. Prior live editor inheritance defect remains awaiting release/retest |

The fresh local responsive Home/category columns are recorded in `resumed-browser-verification-20261005.md`. The phone requirement passes at every requested width; tablet/desktop use the current document's responsive layout.

## What changed

- Added the protected staff directory, server-defined roles/grants, guarded endpoints, and a usable Users form/table with role/status filtering and search. Managed-account changes revoke stale sessions.
- Fixed new editor changes to apply only to the selected device. Home reordering uses the existing ordering mechanism and preserves product objects, IDs and cart handlers.
- Moved the blocked analytics bootstrap into a same-origin file. Historical CSP permissions remain unchanged. Pinned Firebase 10.12.2 assets are local with license/provenance; only terminal map comments were removed.
- Made the real Promo Bar selectable and editable through the existing CMS. It supports individual text/icons, add/delete/duplicate/reorder/enable controls, simple styling, device overrides and normal save/preview/publish.
- Added eleven lightweight custom SVG firework illustrations, refined horizontal cards, accessible CTA/focus states and reduced-motion handling. Category IDs/routes/filtering/count data sources remain intact.
- Prevented stale saved CMS count text from overwriting automatic catalog counts. Counts retain presentation controls; labels remain editable.
- Connected the existing invoice font-directory setting to mPDF, retaining its default font directories. This fixes rendering when fonts are stored separately and preserves legacy vendor-local font installations. Invoice values, totals, layout and authorization code are unchanged.

## Issues resolved while resuming

1. **Local preview servers had stopped.** Restarted existing isolated fixtures while preserving their data and disabled-mail configuration. The tab's refresh opt-in now survives links that drop the query parameter; actual automatic refresh was verified on a product route.
2. **Category editor test stopped before detail/cart/checkout.** Diagnostic clicks landed on the category span/card body while route scrolling and the card's 450ms reveal animation moved the intended title link. The test now waits for scroll/card stability and checks the destination URL. The full 28-case run passes; no product/cart implementation change was needed.
3. **Release summary hashed different manifest bytes on Windows.** The builder now writes and hashes the same UTF-8 byte string. The frozen original package remains untouched. Its recorded hash `26c1d7b4436331ba0f97ff8986af82a49cbe1961a4b1890a36b550973421b2aa` describes LF-normalized JSON; its actual CRLF manifest SHA-256 is `4f3595224e61940c580f6d50ee031133e77ec539720146cabed846e27df0793c`. Original patch/ZIP hashes and contents remain valid.
4. **Earlier live Products 1280 CMS readiness was incomplete.** The fresh check now confirms the published stylesheet and rendered four-column catalog.
5. **Invoice fonts were configured but ignored.** With stock mPDF and valid fonts in the configured external folder, both PHP versions failed to render. A three-line correction preserves the default lookup and appends the configured directory. The regression fails before the fix and passes all four font-layout/runtime cases afterward; the full render/download suite passes 66/66 and the six reviewed pages remain pixel-identical to the earlier successful legacy-layout rendering.

## Evidence

Fresh checks in the resumed session:

- `category-editor-results.json`: 28/28 PASS, including actual inspector count guards, undo/redo, device styling, draft/public separation, private-fixture publication, eight-width carts, product detail and checkout.
- `category-count-sync-results.json`: PASS, catalog count 10→11 despite stale saved text; filtered listing 11; count styling and editable category label preserved.
- `cms-promo-browser-results.json`: 27/27 PASS.
- `cms-backend-test-results.json`: 234/234 PASS.
- `staff-permissions-results.json`: 183/183 PASS; accompanying customer integration 25/25.
- Combined client, console, responsive, reorder, Promo and category unit/runtime tests: 57/57 PASS.
- ESLint: editor, candidate application and relevant tests pass.
- `resumed-browser-verification-20261005.md`: fresh local/live CUA observations, search/Favourites/detail/cart/checkout, initialization, network and responsive matrix.
- `php81-compatibility-report.md`: official checksum-verified PHP 8.1.34; CMS 234/234, roles 183/183, customer authentication 25/25, backend security 95/95, sessions 35/35 and fake-transport notifications 73/73. All 28 candidate PHP files also pass syntax checks after the invoice fix.
- `invoice-render-verification.md`: real mPDF 8.3.1 tests on PHP 8.1.34 and 8.3.35; font-directory regression 4/4, full render/download suite 66/66, one-page and five-page visual checks, clean logs, unchanged synthetic orders, no email. The test sources and before/after results are retained.

The original evidence in `three-area-original-report.md` remains dated and bounded: backend security 95/95, session bootstrap/ownership 35/35, fake-transport notifications 73/73, Google verifier 30/30, staff browser 55/55 in three launches, responsive browser 14/14, Products reorder 37/37, Canva editor 34/34 and Home-grid browser 9/9. Backend security, session and notification suites were subsequently rerun under PHP 8.1 as recorded above; the older browser and standalone Google-verifier suites were not all repeated. Earlier design/card route/focus/tap/motion evidence is in `category-browser-results.json`. The frontend/backend handoffs and count cross-review remain available.

## Release package and deployment boundary

Use `combined-review-package.json` to locate the timestamped **combined review package**, and `combined-review-change-manifest.json` / `combined-package-integrity.json` for file hashes and verification. It contains the exact changed candidate files, rollback before-images, and a forward/reverse patch. The old original package remains immutable.

Current package: `audit-evidence/combined-review-package-20261005T120636.649388Z`. Independent integrity verification passes **28/28**: 60 candidate entries (45 production and 15 overlay), 41 rollback entries, all 15 matching source mirrors and all 11 exact SVG names. The 19 additions have no rollback before-image. Every archived byte and all three artifact hashes/ZIP CRCs match; forward and reverse patch application reproduce the declared source/baseline bytes. The exact saved manifest SHA-256 is `41bc8d6bd174ac00e2dcf4212708567adb20860c89027ffade33841e77645850`. The original and earlier 11:49 UTC combined package remain byte-identical. The current audit summary/manifest pointers intentionally identify this updated package, which adds the invoice correction.

This is a changed-file review bundle, not a complete installation. Map only `production-release/` contents to the site's deployment root; `visual-editor/` is the source overlay. Do not deploy the old `review/public` preview. Do not rebuild with historical broad integration scripts, `visual-editor/deploy-editor.sh`, or the old `visual-editor/release-manifest.json`, which describe earlier source and would overwrite integrated work.

Preserve current customer/order/catalog/private stores, staff users, authentication/SMTP configuration, uploads, `vendor-lib` and `invoice-assets`. Existing product/logo images and six pre-existing support files are dependencies inventoried separately, not included as new changes. No credentials, customer stores, uploads or local-refresh helper are packaged.

Before any future deployment, take actual destination before-images and account for independent live changes since the saved baseline. The saved production baseline omitted `editor-shell.html`; its editor-overlay snapshot is explicitly a comparison surrogate, so exact production rollback for that file is not established. The rollback ZIP restores modified files but does not remove additions: use the verified reverse patch or the manifest's exact addition list for that step. Preserve any data written since deployment.

## Remaining issues and decisions

- **Production rollout remains pending.** The user-facing candidate can be reviewed locally now; live Home/CSP/editor fixes and live Promo/category publication require deployment followed by live verification.
- **Live host configuration** remains to be checked during deployment. Local PHP 8.1.34 compatibility now passes; the live host's exact patch version, extensions, permissions and configuration were not reproduced.
- **Production invoice dependencies** remain unverified: the local tests use official mPDF 8.3.1 and full DejaVu fonts, with the text-logo fallback. Preserve the existing production library, font and image-logo assets; the release does not replace them.
- **Real external services**: Firebase initialization and signature/claim validation are covered; real Google sign-in and analytics delivery are not proven by these runs. No real email was sent.
- **Floto/FloatingWidget provenance** remains unverified because those messages were not reproduced. No CSP weakening or unrelated site suppression was added.
- **Physical devices and broader live editor matrix** remain narrower than local browser coverage; the earlier safe live section-height test reproduced inheritance and restored its baseline. No live draft was saved or published here.

No further feature-design decision is required for the implemented scope. Production rollout is the next separate action; this report does not claim it has occurred.
