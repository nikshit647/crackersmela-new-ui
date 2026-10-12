# Admin permissions, responsive editor and regression plan

> For agentic workers: use focused subagents, test behavior before and after each change, and review the integrated result.

**Goal:** Implement the attached user specification without weakening security or breaking commerce.

**Architecture:** Extend the recovered PHP/vanilla JavaScript production candidate in `audit-evidence/production-release` and the existing `visual-editor` overlay. Preserve the configured owner identity, private JSON stores, CSRF/session mechanisms, native commerce rendering and existing reorder implementation. The older `review/public` preview is not deployment source.

**Spec:** User attachment `47441ab5-fa46-43e4-8f2a-af372294b57e/Pasted text.txt`; priorities are user management, responsive isolation, live regression fixes. Source baseline: `audit-evidence/three-area-baseline-20261005`.

## Constraints

- Do not deploy until local and browser verification is complete; prepare a reviewable release with rollback evidence.
- Never submit a real customer order, send real mail, or expose credentials.
- Server-side permissions are authoritative; role-specific navigation must avoid unnecessary forbidden requests.
- Keep existing CSP hashes; no new unsafe-inline, unsafe-eval or broad origins.
- Preserve native product IDs, cart events, quantity controls, checkout and existing stored CMS documents.

## 1. Staff directory and permissions

- [x] Add real HTTP tests for each role's allowed and denied requests, CSRF, role changes, inactive users, session revocation and owner compatibility.
- [x] Extend `cm-security.php`/`staff-auth.php` with a private staff directory, server-defined role grants and protected configured Super Admin. Add an authenticated user-management API. Resolve active role on every request.
- [x] Gate orders, catalog, product settings, customer records, billing, invoices, email, analytics, uploads and CMS endpoints by specific permissions. Keep customer ownership access unchanged.
- [x] Improve Users in `js/app.js`: creation/edit modal, roles, activation, filters/search, safe errors, sanitized names/email, and counts/spend. Use server grants for navigation, hydration and mutations.
- [x] Run backend, customer-auth, client, and browser tests using isolated data and disabled mail. Staff HTTP 183/183, customer 25/25, backend security 95/95, notification 73/73, cookie-race 35/35, and three fresh staff browser runs at 55/55 each.

## 2. Responsive editor

- [x] Reproduce desktop-to-mobile/tablet cascading and global visibility/grid edits with tests.
- [x] Preserve legacy defaults as a stable base and write only active-device overrides. Use one resolution rule across editor, preview and published runtime.
- [x] Make font, spacing, position, image presentation, grid/flex, visibility, and section dimensions device-specific; label shared content explicitly.
- [x] Show Editing Desktop/Tablet/Mobile clearly, retain four-panel editing, undo/redo, save, preview and publish.
- [x] Extend existing product reorder logic to Home sections without altering Products order or native card identity.
- [x] Verify all three sizes, save/reload, draft/published isolation and cart behavior. Isolated responsive browser 14/14, Products reorder 37/37, Canva editing 34/34, legacy Home grids 9/9, CMS backend 203/203.

## 3. Console and storefront verification

- [x] Fix CRLF/LF CSP hashing; prefer an external same-origin bootstrap while retaining existing hashes. Verify exact script content and policy differences.
- [x] Keep Firebase functionality and remove unnecessary map requests without adding CSP permissions; retain pinned official SDK provenance if self-hosting.
- [ ] Trace Floto provenance from source and browser evidence; do not modify the site for extension-only messages.
- [x] Browser-test live home/products/cart/checkout without submitting orders, then test candidate at 360x800, 375x812, 390x844, 412x915, 425x904, 768, 1024 and 1280. Results and limitations are recorded in `audit/storefront-cua-verification-20261005.md`; deployed Home still fails the mobile column expectation, and final live 1280 Products CMS readiness is unverified.
- [x] Browser-test authenticated live editor only with an available legitimate session; report access gaps honestly. Live section-height inheritance defect reproduced and original draft restored by Undo; no publication. Other responsive properties remain covered by isolated tests.
- [x] Review changes, run relevant regression suites, prepare changed-file manifest and a factual PASS/FAIL/untested report.

Packaging and cross-review are recorded in `audit/three-area-original-report.md` and `audit/three-area-package.json`. The original package remains immutable at its pre-follow-up timestamp; later CUA evidence supplements the report. Promo Bar and Shop by Categories follow-up features are in progress and are not completed by this original-task checklist.
