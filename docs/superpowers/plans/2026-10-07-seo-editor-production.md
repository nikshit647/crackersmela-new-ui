# Crackers Mela SEO and Editor Production Plan

**Goal:** Audit every product/category, persist truthful SEO in the existing admin fields, align public rendering and structured data, verify editor navigation and section order, and deploy only after regression checks and a recoverable backup.

**Architecture:** Extend the recovered PHP and vanilla JavaScript application in `audit-evidence/production-release`. Preserve the existing product IDs, public slugs, commerce APIs, authentication and CMS document model. `review/public` is a preview and must not replace the production application. The current dirty working tree and previous releases are preserved.

**Spec:** User's complete pasted request in the October 7 attachment, plus the explicit clarification that every product's admin SEO fields must be filled and saved.

## Constraints

- Use exactly `STANDARD Licensed dealer` for the requested customer-facing phrase.
- Do not fabricate specifications, effects, certification, ratings, reviews, images, locations, quantities, prices or availability.
- Preserve useful manual content and report conflicting source facts.
- Keep stable product URLs, independent page ordering, responsive overrides, product/category ordering, cart, checkout, auth, coupons and email behavior.
- No real customer order or outbound email is needed for testing; use the isolated backend with mail disabled.
- Deployment requires current live source hashes, verified backups and passing checks. Existing file/DB values are checked again immediately before replacement.

## 1. Establish evidence and backups

- [x] Read complete request; inventory source, deployment history, existing tests and dirty files.
- [x] Compare current public assets to candidate; identify incomplete prior SEO coverage and admin indexability.
- [ ] Capture live desktop/mobile navigation, catalog, cart and checkout baseline plus console/network results.
- [ ] Recover current protected application and catalog source through reconnected hosting session; snapshot only required data/source with private permissions.

## 2. Product/category data and technical SEO

- [ ] Audit all catalog entries including disabled products and all 11 categories. Record field completeness, factual conflicts, duplicates, image URLs and availability.
- [ ] Prepare field-level, idempotent migration with source checks and rollback data for `seoTitle`, `seoDesc`, `seoKeywords`, `seoSlug`, `seoTags`, and missing/weak `desc`. Preserve identifiers, URL slugs, price/stock, useful manual edits and catalog order.
- [ ] Extend `cm-seo.php`, `seo-page.php`, `cms-page.php`, `cms-sitemap.php`, `.htaccess`, robots handling, and the SEO content/runtime assets to use the same catalog facts. Serve accurate initially available Product/Offer and separate BreadcrumbList entities; omit unverified ratings.
- [ ] Keep public pages crawlable, private hosts/routes noindex, sitemap canonical, and filtered/search URLs out of indexing.
- [ ] Validate every product/category output, schema fields, metadata uniqueness, source parity, missing/offline cases, images, sitemap and robots.

## 3. Public frontend

- [ ] Back up `js/app.js`; replace only public copy containing the requested phrase and unsupported generated claims.
- [ ] Integrate the shared SEO resolver into route metadata and visible product/category descriptions; preserve CMS overrides and stable navigation.
- [ ] Verify image alt text, loading/dimensions, product/category links and heading structure without changing commerce event handlers.

## 4. Visual Editor

- [ ] Add visible `← Back to Admin` to the existing header; preserve controls and narrow-screen behavior.
- [ ] Test existing section Move up/down and drag behavior with independent Home/Products draft/published data, refresh, logout/login, undo/redo and preview.
- [ ] Verify desktop/tablet/mobile property isolation, product/category reorder, and public commerce handlers after section reorder.

## 5. Release gates

- [ ] Review exact source/data diff and changed-file allowlist; independently review security and regressions.
- [ ] Run syntax, lint, relevant existing automated tests, API isolation checks and real browser desktop/mobile flows. Record before/after console errors.
- [ ] Create checksum-verified backup, package allowlist and explicit rollback procedure; abort on live source/data conflict.
- [ ] Deploy source and catalog field patch only after all gates pass; verify actual admin field values, public pages, sitemap/robots, editor navigation/order and cart/checkout.
- [ ] Publish concise report with counts, exact files, limitations and deployment result. Google validation/indexing status is reported separately from local schema checks.
