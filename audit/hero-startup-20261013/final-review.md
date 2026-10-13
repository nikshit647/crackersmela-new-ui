# Homepage release review — 2026-10-13

Scope: published first paint, featured hero, prepared homepage integration, and deployment/rollback script. Category redesign was excluded. No production writes, commit, push, or admin-browser changes were performed.

## Findings and disposition

- **P2, fixed in source:** `hero-showcase.js` destroyed its active instance on persisted `pagehide`. Browser Back/Forward Cache restoration therefore left rotation stopped permanently. It now suspends pending timers, preserves cards and selection, and resumes on persisted `pageshow` through the existing reduced-motion, focus, hover, visibility, and editor safeguards. Ordinary page exits still destroy the instance.
- **P2, integration owned by parent:** an old or in-flight HTML document can fetch overwritten `app.js` without the new standalone hero script. The parent is embedding the same hero module in the app as a compatibility fallback. The module now skips duplicate initialization; its regression test confirms the public API still controls existing timers after a second load.
- **Validation reproducibility, fixed:** the PHP renderer tests silently loaded helpers from ignored candidate files. Exact, unchanged `cm-page-content.php` and `cm-page-products.php` are now maintained in `visual-editor`, and the tests use those sources directly. Credential-pattern inspection found no secret literals. Both copies match candidate SHA-256 hashes and pass PHP syntax checks. The test harness deliberately replaces backend/catalog and brand boundaries.

## Evidence

The persisted-restoration and duplicate-load regressions failed before their respective fixes. The final combined renderer and hero test run passed **20/20**, with JavaScript syntax checks passing. Parent-supplied earlier first-paint, admin-feature, and wider regression results were not rerun here.

No additional important issue was identified in published JSON encoding, request cache supersession, DOM/commerce ownership, or reviewed backup/rollback logic. Before release, rebuild the candidate with the updated module and verify the parent's old-HTML compatibility integration.
