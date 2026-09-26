# CrackersMela — UI, browser QA, accessibility, SEO and performance audit

Date: 26 September 2026. Browser: isolated Chromium session `cm-ui-audit`.

## Scope and evidence

The current production UI was inspected at https://crackersmela.com and the logged-out https://admin.crackersmela.com. Production testing used catalog/navigation and local browser state only. No production sign-in, checkout submission, order changes, account creation, messages or uploads were performed. Orders, email and upload requests were blocked before additional flows after the security review identified automatic synchronization risks. A clean-session homepage had made an initial automatic orders GET before that warning; order contents were not deliberately inspected or retained.

Local verification used `http://localhost:4173/` and `http://localhost:4174/#/staff`. These are explicitly labeled UI previews backed by public catalog fixtures. They do not prove database, server authorization, real authentication, email, payment or admin persistence correctness. No deployment was performed.

Evidence is under `audit-evidence/`. Screenshots preserve the existing blue public storefront and existing compact admin design.

## Confirmed important findings and local fixes

| ID | Severity | Finding / cause | Local fix and verification |
|---|---|---|---|
| UI-01 | High | Nine linked information pages rendered “Page not found.” The router called the common content view with `name=content`; the view looked up `CONTENT[route.name]` instead of the captured page. | Root engineer corrected route parameter lookup and contact binding. Verified About, Contact, FAQ, Wholesale, Shipping, Returns, Safety, Terms, Privacy all show the expected H1 at 390px. Live before: `screenshots/live-about-404.png`. |
| UI-02 | Medium | Mobile product filters opened behind the sticky navbar/promo bar, obscuring heading, close control and price label. The filter lived in a low stacking context. Escape/focus behavior did not reliably dismiss or isolate it. | Raised the shell only while filters are open; drawer/backdrop layer above navbar. Added dialog semantics, initial focus, Tab wrapping, Escape, focus return, and closed-state inertness. Filtering retains open state and selected-control focus through rerender. Video: `videos/mobile-filter-overlay.webm`; after: `screenshots/local-filter-final-mobile.png`. |
| UI-03 | Medium | Mobile navigation, cart, account and product-edit dialogs lacked full background focus isolation. Closed mobile admin navigation remained exposed to keyboard/accessibility traversal. | New `js/accessibility.js` handles existing dialogs and mobile admin sidebar. Edit dialog snapshot contains only its controls, Escape returns to the initiating Edit button. Mobile admin Escape returns to Toggle sidebar, closed sidebar is inert. Consent prompt hides during open dialogs so it cannot cover controls. |
| UI-04 | Medium | Shared search wrapper falsely used `role=searchbox` without an accessible name, wrapping the actual labeled input. | Changed wrapper to a named search landmark. Added a keyboard Skip to content link without triggering the hash router. |
| UI-05 | Low | Homepage feature headings skipped H2 to H4; footer benefits used arbitrary H5; footer group titles were H4; contact cards skipped H1 to H4. | Changed semantic levels while preserving all font/spacing styles. Root updated dynamic home/benefit headings. Contact card titles now H2. |
| UI-06 | Medium | Admin text failed contrast: sidebar group labels 2.49:1, version 3.03:1, subtitle 4.44:1. Sales-date controls incorrectly claimed tablist semantics; nested main landmarks existed. | Slightly darkened existing gray labels/subtitles. Root changed date controls to a group and nested admin main to div. Final home/admin axe scans contain no confirmed WCAG violations; the local preview notice still produces one landmark best-practice warning. Gradient backgrounds leave some contrast checks incomplete. |
| UI-07 | Low | Instagram/Facebook/YouTube footer links were `href=#`, navigating back to home instead of social profiles. | Removed the unavailable destinations. Kept the verified WhatsApp link. Did not invent profile URLs. |
| UI-08 | Low | Cart checkout text contained corrupted replacement characters and “??”. | Replaced with the plain label “Checkout.” |
| UI-09 | Medium | Admin product search accepted input but did not filter rows. | Root added debounced rendering with focus restoration. Browser entry “Long Boy” changes 115 rows to one Long Boy Gun row and preserves focus on `admPq`. |
| UI-10 | Medium | Admin Analytics exposed raw `PREVIEW_BACKEND_UNAVAILABLE`; Settings falsely claimed API Operational without a health check. | Root added a humane Analytics unavailable state with Try again, and honest backend status. Analytics error state verified locally; backend functionality remains unavailable. |
| UI-11 | Low | Restored About page had unindented bullets clipped against the mobile viewport, with headings too close to preceding text. | Scoped `.content-copy` typography adds list indentation and heading spacing; existing card layouts remain unchanged. Contact form already stacks its actions correctly at 390px and did not need a change. |
| UI-12 | Medium | FAQ said a ₹50 delivery charge applied below ₹2,500 despite checkout requiring ₹2,500 and adding no fee. Privacy contained demo/future-gateway copy. Safety advice recommended loose clothing. | FAQ now states the actual minimum and no delivery fee. Privacy describes cash/UPI on delivery and no card collection. Safety recommends well-fitting cotton and avoiding loose/synthetic clothing. |

Source changes for this work: `review/public/index.html`, `review/public/css/styles.css`, `review/public/js/accessibility.js`, plus only the delegated content wrapper, Contact headings, FAQ, Privacy and clothing-advice changes in `review/public/js/app.js`. Other functional/security changes in app.js were made by the root engineer.

## Performance

The initially empty main view allowed the footer to paint near the top and then jump when JavaScript rendered the storefront. Added one scoped rule: `#view:empty { min-height: calc(100vh - 100px); }`. It has no effect after real content renders.

Same local browser/session, 1366×768, warm local loads:

| Measurement | Before | After |
|---|---:|---:|
| CLS | 0.60 | 0.01 |
| LCP | 148 ms | 128 ms |
| FCP | 76 ms | 60 ms |
| TTFB | 1.6 ms | 2.0 ms |

The material improvement is CLS. The small timing differences are normal run variation, not evidence of a network-speed optimization. Evidence: `local-home-vitals-before.json` and `local-home-vitals-after.json`. A separate warm production run recorded CLS 0.56, LCP 136 ms, FCP 84 ms, TTFB 24.8 ms. These are single-browser laboratory observations, not CrUX field data. INP was unavailable.

The recovered frontend contains roughly 297 KB app JavaScript, 60 KB catalog JavaScript and 361 KB CSS before compression, plus Firebase compatibility scripts and webfonts. CSS contains many accumulated overrides. Removing large sections blindly would risk the required design preservation; no unsupported bundle-performance claim is made. Loaded product images in sampled views were successful, with no broken loaded images.

## Responsive verification

The local homepage, catalog and admin dashboard were each tested at all four requested sizes:

| Viewport | Home document width | Catalog width | Admin width | Result |
|---|---:|---:|---:|---|
| 390×844 mobile | 390 | 390 | 390 | No horizontal page overflow |
| 768×1024 tablet | 768 | 768 | 768 | No horizontal page overflow |
| 1366×768 laptop | 1366 | 1366 | 1366 | No horizontal page overflow |
| 1920×1080 desktop | 1920 | 1920 | 1920 | No horizontal page overflow |

All twelve sampled views had zero broken loaded images. Screenshots: `local-{home,catalog,admin}-{mobile,tablet,laptop,desktop}.png`. Mobile filter, mobile admin sidebar and mobile product-edit dialogs were additionally tested for visibility/focus. Nine restored information pages were checked at 390×844, with correct heading, document width 390 and zero broken loaded images. Evidence: `info-mobile-results.jsonl` and `local-info-*-mobile.png`.

Admin tabs inspected using read-only fixtures: Dashboard, Analytics error state, Orders empty state, Products, Add Product form, Categories, Price List, Billing/POS, Canvas Editor, Users empty state, Notifications, Settings, Logs. POS is a dedicated layout: Back must be used before returning to sidebar navigation. Initial attempted screenshots after POS did not represent the requested tabs; the corrected `*-verified.png` captures are the authoritative evidence for Canvas, Users, Notifications, Settings and Logs.

## SEO findings and remaining work

- Production homepage has title, description, canonical, Open Graph/Twitter tags and LocalBusiness JSON-LD. The unnatural initial meta phrase “Glass-clean storefront” was removed locally.
- Public `robots.txt`, `sitemap.xml` and the declared `sitemap.php` return HTTP 200. Sitemap includes clean public and product URLs.
- An arbitrary missing clean path returned genuine HTTP 404. Known information hash routes incorrectly showed the application’s not-found screen until the local routing fix.
- Public clean `/products` and product path responses serve the same initial homepage title, canonical and OG metadata with an empty main. Client JavaScript updates rendered metadata, but crawlers/social preview clients that do not run JavaScript see the homepage. Server rendering/prerendering and clean-route fallback behavior cannot be completed or verified from the missing deployment/backend source. Do not claim complete SEO/indexability repair.
- Production admin root serves `index, follow`; no X-Robots-Tag was observed. Its robots file is copied from the public site and allows `/`. The admin host should receive a server-enforced `noindex, nofollow` header and an admin-specific robots policy. Runtime noindex alone is not equivalent to a verified deployment-level policy. Local preview servers use noindex.
- Existing structured data includes business claims/social profiles that require owner verification. No fabricated profiles, keyword stuffing or unsupported rich-result promises were added.

## Tests and limitations

| Check | Result |
|---|---|
| JavaScript syntax, accessibility.js and current app.js | PASS (`node --check`) |
| Homepage/catalog/search/price sort/category filter UI | PASS |
| Admin product search and navigation with fixtures | PASS for inspected views |
| Modal focus containment/Escape/focus return | PASS for mobile filters, admin sidebar and product edit |
| Four viewport home/catalog/admin checks | PASS for inspected states |
| Nine information routes, mobile | PASS |
| Loaded-image check across twelve main viewports | PASS |
| Confirmed axe WCAG violations, home/admin dashboard | None remaining in tested states; contrast on gradients remains partly manual/unverified |
| Preview write guard | PASS: activating Update Product announced “Unavailable: production backend source required. Nothing was saved.” |
| Browser uncaught exceptions in tested local UI | None observed |
| Real admin CRUD, server authorization/non-admin denial, storage, email, checkout persistence | NOT VERIFIED — backend source and isolated test integration unavailable |
| Production build/dependency/lint audit | Handled separately by root; the recovered static frontend is not the complete deployed application |

No overall full-stack PASS is warranted. This report demonstrates specific local UI and reliability improvements while retaining the current visual design, with backend and deployment gaps explicitly outstanding.
