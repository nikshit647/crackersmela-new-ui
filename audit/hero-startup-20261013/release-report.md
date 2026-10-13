# Homepage and category release — 13 October 2026

The changes are deployed and verified on https://crackersmela.com and its shared admin application. The homepage uses the published presentation on its first visible frame. The three hero cards cycle products selected by **Admin → All Products → Featured**. Shop by Categories uses solid royal-blue arrows, pale cards and restrained color-only interactions; its EXPLORE label has a transparent background and subtle separators. The four trust/service cards use solid white surfaces and blue icons.

## Cause of the homepage flash

The PHP entry rendered native/default Home markup without all published visibility, typography, positioning, shared components or section order. The browser then replaced it and applied the publication after an asynchronous request; background startup work also rerendered Home. This produced several visible versions of the same current deployment.

The server now projects the published document and embeds that exact public revision as inert JSON. The browser applies it synchronously before revalidating. Home navigation waits for the publication; unnecessary startup rerenders were removed. Matching promo icons, hidden inline text specificity, reduced-motion behavior and scroll anchoring prevent the remaining first-frame shifts. `/index.html` uses the same dynamic Home entry.

A subsequent live publication hid the hero eyebrow and repositioned individual statistics. This exposed missing server registration of those layout wrappers. The final projection correction registers them with the same IDs as the browser and honors saved visibility/positions before scripts run, while keeping live statistic values protected. The updated public layout then passed all six live first-paint scenarios.

Cloudflare returned `DYNAMIC`; HTML already sent `no-store, no-cache, must-revalidate, private, max-age=0`. LiteSpeed HTML caching was disabled. No application service worker or competing homepage deployment was found. Versioned static assets retain caching.

## Featured products

The showcase reads the existing catalog `featOn` overrides and product `featured` fallback, exactly as the product-admin checkbox does. It does not read the visual editor's independent featured section selection. Cards rotate every 3.5 seconds with a short content fade, preserving hero geometry and badges. They show distinct products and current names, prices, images and detail links; zero, one and two selections are handled safely.

An open storefront pulls the catalog every 25 seconds and on focus. A refreshed page sees saved selections immediately. Rotation pauses for reduced motion, hover, focus, hidden pages and editor preview. Back/Forward Cache restoration resumes safely. A guarded copy of the same small module in the app bundle supports older HTML lacking the new script tag, without initializing a second carousel.

The live authenticated checkbox test temporarily removed product 26, verified persisted `false` and first cards `[27,28,29]`, then restored it and verified `[26,27,28]`. No Featured flags differ from the original snapshot.

## Category design

One stylesheet, scoped to `#shop-categories`, uses solid `#1769D2` arrows, white icons and solid `#1256B0` interaction states. Cards keep light surfaces, thin borders, small shadows, existing fonts and illustrations, and consistent 12px corners. There are no gradients, blur, glow, scaling, elevation or arrow movement in the new styling. Hover changes only border/button colors. The surrounding homepage design is preserved.

The entire card remains its original category link. Arrows are decorative 44px circles inside that link. Keyboard focus outlines the card. The existing three/two/one-column layout adapts at desktop, tablet and phone widths, including 320px. Category names, counts, data and filtering are unchanged. The preview loads the same stylesheet through its existing public shell.

The EXPLORE label uses transparent text backing, dark blue uppercase text and light blue-gray separators. A broad existing `span` selector had applied separator backgrounds to the CMS-generated text span too; the new rule distinguishes those elements. Heading and subtitle text remain unchanged.

## Trust and service cards

The original stylesheet's Why choose cards block is rewritten with solid white backgrounds, thin `#DCE6F0` borders, 12px corners and consistent 20px padding. The four existing shield, lock, truck and phone SVGs sit in solid `#1769D2` containers. Headings use `#123B70`; descriptions retain the existing muted token with readable 14px type. Desktop uses four columns, tablet two, phone one; rows remain equal in height.

The icon gradient, glass background/blur, large shadows and hover translation declarations were removed from their original rules. The card selector was removed from both later shared glass-style groups. Only the Why section's gradient-text opt-in and entrance-animation class were removed from its templates. Its eyebrow also uses a plain class without the shared gradient divider. No appended override masks those former effects. Published wording, SVG paths, other sections and data are unchanged.

## Deployed files and backups

The verified document root for both domains is `/home/crackersmela.com/public_html`.

Initial release changed these 10 paths:

- `cm-cms-render.php`, `cm-home.php`, `cms-page.php`
- `js/app.js`, `js/cms-runtime.js`, `js/hero-showcase.js`
- `css/hero-showcase.css`
- `index.html`, `visual-preview.php`, `.htaccess`

The category polish changed only `css/category-cards.css`, `js/hero-showcase.js`, `js/app.js` and `index.html`. The final combined label/service release changes `css/styles.css`, `css/category-cards.css`, `js/app.js`, `cm-home.php` and `index.html`. Final app/runtime/hero URLs use `20261013-home-showcase3`; category CSS uses `20261013-category-cards2`, and base CSS uses `20261013-trust-cards1`.

The final first-paint correction changes only `cm-cms-render.php`. The 12 distinct deployed files across all releases were checked against their final SHA-256 manifests and matched.

Complete backups and rollback scripts are outside the public root:

- `/home/crackersmela.com/codex-releases/home-showcase-20261013-115548/deployment-before.tar.gz`
- `/home/crackersmela.com/codex-releases/category-cards-20261013-121900/deployment-before.tar.gz`
- `/home/crackersmela.com/codex-releases/trust-cards-20261013-123401/deployment-before.tar.gz`
- `/home/crackersmela.com/codex-releases/home-projection-20261013-124024/deployment-before.tar.gz`
- Each release directory contains `manifest.json`, per-file `backup/` copies and `rollback.py`.

Deployment verified expected hashes before writing and used atomic replacements. Environment files and customer/order stores were not deployed or modified.

## Verification

| Check | Result |
|---|---|
| Focused PHP/rendering/CMS/hero regressions, including restored Back navigation and hidden hero wrappers | 60 passed |
| Isolated product-admin selection, 0/1/2/3/6 products, real rotation, cart/listing | 25 passed; fixture catalog restored byte-for-byte |
| Current local normal-motion first paint: fresh + two cache-disabled reloads, desktop/mobile | 6 passed; zero mismatched visible frames |
| Current production normal-motion first paint: same six scenarios | 6 passed; zero mismatched visible frames |
| Earlier production reduced-motion first-paint scenarios | 6 passed; zero mismatched visible frames |
| JavaScript-disabled production Home | Correct published heading and three product slots |
| Old-HTML compatibility with external hero script blocked | Embedded module rotates and return-Home navigation works; no browser errors |
| Local category checks including EXPLORE and preview styling | 69 passed |
| Final production category checks at 1440/768/390/320px | 59 passed; all 11 links, focus/filtering, content preservation, solid colors and stationary interactions |
| Local trust/service card checks including preview | 50 passed |
| Final production trust/service card checks at 1440/768/390/320px | 36 passed; preserved copy/SVGs, equal heights, solid colors, no gradients or motion |
| JavaScript lint and syntax, PHP helper syntax | Passed |

Full live rotation and commerce smoke checks also verify all currently selected 29 products, stable hero/heading nodes, current bundle URLs, product details, product listing, return-Home navigation, mobile overflow and no browser errors. The final run is retained under the live-smoke evidence directory.

Desktop and phone production screenshots were inspected directly. Category tests temporarily hide unrelated fixed help/back-to-top controls only while capturing complete-section screenshots; functional checks run on the normal page.

The isolated preview already counts Rockets and Bombs differently from the live public catalog. Enabling/disabling this stylesheet preserves those existing counts exactly; no catalog or preview-data behavior was changed by the category task.

## Evidence and source reproducibility

Evidence remains Git-ignored under `audit-evidence` to avoid publishing recovered application bundles or private runtime data:

- `home-showcase-20261013/live-admin/result.json`
- `home-showcase-20261013/browser/featured-admin-1791891833227/results.json`
- `home-showcase-20261013/browser/1791892561564/` (production reduced motion)
- `home-showcase-20261013/browser/1791895200721/` (final local normal motion, updated public layout)
- `home-showcase-20261013/browser/1791895254945/` (final production normal motion, updated public layout)
- `home-showcase-20261013/compatibility-result.json`
- `home-showcase-20261013/live-smoke-1791893953484/results.json` (29-product rotation and commerce)
- `home-showcase-20261013/live-smoke-1791894858902/results.json` (final bundle version, 29-product rotation and commerce)
- `home-showcase-20261013/live-no-js/result.json`
- `category-cards-20261013/browser-1791893860803/results.json` (local + preview)
- `category-cards-20261013/browser-1791893953482/results.json` (production)
- `category-cards-20261013/browser-1791894255123/results.json` (69 local/preview checks including EXPLORE)
- `category-cards-20261013/browser-1791894858881/results.json` (final live categories and EXPLORE)
- `trust-cards-20261013/browser-1791894785528/results.json` (local trust cards and preview)
- `trust-cards-20261013/browser-1791894858906/results.json` (final live trust cards)
- `trust-cards-20261013/final-file-verification.json` (12 deployed files match)
- Both release directories contain local manifests and deployment results.

Maintained source lives in `visual-editor`. The unchanged PHP rendering helpers are included for reproducible unit tests. Narrow scripts patch a locally staged, verified production source tree: `apply-hero-showcase.mjs`, `apply-home-startup.mjs`, `apply-trust-cards.mjs` and the three corresponding release-preparation scripts. The full legacy app bundle is deliberately not committed because it contains legacy keys. End-to-end fixtures require the recovered backend under ignored staging, a local PHP binary, Playwright and Chrome. The unit harness stubs backend/catalog boundaries and accepts `PHP_BIN`.

Branch: `codex/home-first-paint-featured-showcase`. The Git commit containing this report records the maintained source, scripts and tests; unrelated workspace changes are excluded.
