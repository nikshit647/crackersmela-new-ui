# Promo Bar implementation and verification

The real `#promoBar` / `#promoTrack` is edited through the existing native `global:promo` section. `CMStorefront.renderPromo` is the same renderer used at storefront startup and CMS application. No second settings store or product-data source was introduced.

The contextual **PROMO BAR** inspector supports adding, editing, duplicating, moving, deleting, enabling and disabling messages, with an allowlisted icon choice. The logical message list is shared across devices within the current page document. Desktop, Tablet and Mobile independently control background/gradient/opacity, typography/alignment, minimum height/padding, icon visibility and bar visibility through existing exact-device overrides. Reset, Undo, Redo, autosave, visitor preview and publish keep the established workflow.

Each marquee group has identical geometry for the existing -50% animation. Only one copy is accessible; the duplicate and decorative icons are hidden from assistive technology. Editing pauses movement; visitor preview resumes it. Reduced-motion preferences stop the animation and wrap readable messages. Existing responsive Home grid behavior is preserved.

Frontend text validation matches the server's plain-text and UTF-8 length rules without showing technical limits in the product interface. Invalid input displays a local error and cannot enter the draft.

Validation (isolated local fixture only; no production publication):

- `node tests/cms-promo-browser-test.mjs`: **27/27** — selection; message operations; invalid-input feedback; three-device styling; Undo/Redo/reset; save/reload/preview/publish; fresh public 360/375/390/412/425px loads; no page overflow; equal marquee halves; animation movement; mobile navigation; per-page scope.
- `node --test tests/cms-promo.test.mjs tests/cms-responsive.test.mjs tests/cms-product-order-runtime-test.mjs`: **23/23**.
- `node tests/cms-home-grid-browser-test.mjs`: **9/9**, including fresh mobile loads and explicit-column reset.
- PHP validation: **234/234** CMS backend checks, including **31** new Promo checks (see backend handoff).
- ESLint and syntax checks pass. Scoped security review reports no high-confidence findings.

Evidence: `audit/cms-promo-browser-results.json`, `audit/cms-home-grid-browser-results.json`, `audit/cms-promo-backend-results.json`, `audit/promo-security-review.md`.

Screenshots: `audit-artifacts/promo-message-editor.png`, `audit-artifacts/promo-public-mobile.png`.

Files owned for Promo: overlay and candidate `js/visual-editor.js`, `js/cms-runtime.js`, `js/cms-preview.js`, `css/cms-content.css`, `css/visual-editor.css`; PHP validation by roles agent in both `cm-cms.php` copies. Narrow candidate `js/app.js` renderer/bridge and `index.html` accessibility change. Root owns cache-version changes. No products-data modification.

Subsequent coordinated category-count correction: category agent owns the runtime guard and regression; this agent added automatic-count wording and blocked basic/advanced/direct-inline text editing while retaining styling controls. That check is tracked separately in `audit/category-count-sync-results.json`.
