# Promo Bar scoped security review

Review date: 5 October 2026. No high-confidence vulnerabilities identified in the reviewed Promo schema, renderer, runtime projection, inspector actions or preview-selection changes. This is a bounded review of the follow-up, not a new repository-wide security audit or a production deployment approval.

## Evidence

- `cmCmsPromoMessages` restricts saved messages to an ordered list of at most 20 objects with unique validated IDs, plain text of at most 300 UTF-8 bytes, boolean visibility and an enumerated icon. Explicit nulls and unsupported fields fail validation. Promo fields are limited to the native `global:promo` section; message lists cannot be placed in device or element overrides.
- The renderer escapes both ID attributes and visible text using the application's full `esc` helper. It chooses icons from fixed trusted SVG names. It does not render message text, IDs or icon names as raw markup.
- Device typography and spacing are projected through the existing `safeStyles` allowlist. Alignment is selected from fixed values and breakpoints come from the established responsive helper.
- Existing CMS draft and publication writes still require `website.manage` and CSRF validation. The follow-up introduced no authorization, session, API-storage or commerce implementation changes. Public CMS loading continues to return only published content.
- Editor and preview message handlers retain exact origin and source checks. Route reset restores native Promo defaults before applying the current page's CMS document. The inspector identifies message order as shared across devices on that page.
- The saved live Home document examined for compatibility contains only the Promo root element with empty style maps and empty content; it has no legacy child text/style edits. No current-data loss from changed descendant registration was confirmed.

## Verification

- Promo backend real-HTTP tests: 31/31, included in the complete CMS suite at 234/234. Invalid saves leave the draft and version unchanged; commerce stores remain byte-identical. Evidence: `audit/cms-promo-backend-results.json` and `audit/promo-backend-handoff.md`.
- Fresh read-only regression command: `node --test tests/cms-promo.test.mjs tests/cms-responsive.test.mjs tests/cms-product-order-runtime-test.mjs` — 22/22 passed.
- A separate read-only VM check extracted the actual application `esc` helper and actual `CM_PROMO_RENDERER` block. Five assertions passed for attribute escaping, HTML text escaping, ampersand/quote escaping, refusal to render an arbitrary icon payload, and selection of a trusted fallback icon. This check made no API or production request.

Browser interaction and viewport verification remain owned by the frontend integration agent. At this review snapshot, its font-size browser investigation and the UI's character-count versus backend UTF-8-byte-limit alignment were still being completed; neither is a confirmed security finding. Final integration results should be read with this report.

Follow-up review: the editor now validates the same forbidden plain-text character range and 300-byte UTF-8 limit before changing the document. Invalid input receives an inline status and `aria-invalid` while the previous valid message remains saved. The focused Promo suite passes 5/5, including 100 rupee characters accepted and 101 rejected. The updated editor and candidate mirror match SHA-256 `fd8ebd308e8dcf7b944cbe0eb8c439574e580c9ffe7b3ae51802c3a730a13d29`. No additional security finding was identified. The frontend agent continues to own final browser verification.

## Reviewed snapshots

These hashes identify files at the end of this pass. Frontend integration work was still active, so later changes require their own verification.

| File | SHA-256 |
| --- | --- |
| `visual-editor/cm-cms.php` | `3fa44e3aa6430ef95ac8ab94a00d39d0a014b93543b860510d02fa899274ce86` |
| `visual-editor/js/cms-runtime.js` | `5baff1bbef94497ca2542d3bacce7d2a53d492bd49efa6f86d29f36fd1ff727a` |
| `visual-editor/js/cms-preview.js` | `7db821047aa99e44aa94809f03a2cb2ee233f4f096a471f5ce3f91d28251a73e` |
| `visual-editor/js/visual-editor.js` | `c0a63b83a6f87ecf76489ee3c857941e493432e5d7a2f50569ee519eca362dfc` |
| `visual-editor/css/cms-content.css` | `64b7dfca9cb14997f6849481e8ca32dcb21f9de941e2801e34b7a2b62e8011b6` |
| `audit-evidence/production-release/js/app.js` | `f3ea557603bf99a04daac99fda8f27ece6c52f1c00d3b4b66fa1b3c897a11804` |
