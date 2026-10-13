# Production homepage first-paint investigation

Read-only production inspection on 13 October 2026, before this release. No private stores, environment files, credentials or customer records are included.

The active OpenLiteSpeed application document root is `/home/crackersmela.com/public_html` for both `crackersmela.com` and `admin.crackersmela.com`. Their active configurations are `/usr/local/lsws/conf/vhosts/crackersmela.com/vhost.conf` and `/usr/local/lsws/conf/vhosts/admin.crackersmela.com/vhost.conf`. HTTP and HTTPS listener mappings resolve each hostname to those vhosts. Both have `module cache { enabled 0 }` and `rewrite { enable 1; autoloadhtaccess 1 }`.

The live `.htaccess` sends public `/` to `cms-page.php`; admin `/` and admin route families go to `admin-entry.php`. Both use the same current source tree. Historical `index.html.bak-adminmove` and `index.html.bak-epredesign` files exist, but `.htaccess` blocks backup extensions and no active rewrite points to them. No second React root, iframe or alternate homepage deployment was found.

The public HTTP response was `200 OK` with `Cache-Control: no-store, no-cache, must-revalidate, private, max-age=0`, `pragma: no-cache`, and `cf-cache-status: DYNAMIC`. Admin HTML was also dynamic with `Cache-Control: no-store, private, max-age=0`. Cloudflare is in front of the site, but the observed homepage response was not served from its cache. LiteSpeed HTML caching was disabled. No service-worker registration, cache-opening code or PWA worker files were found in the application JavaScript/assets. The Firebase vendor SDK contains generic worker capability checks; these are not a storefront service-worker registration.

The root cause is the rendering sequence within the current build. `cms-page.php` rendered a native homepage using `cmHomeInitialHtml()`, extracting only the hero copy from the published document. It did not apply the saved element visibility, desktop/mobile styles, position, image overrides, shared promo/header settings or full section order before sending HTML. Then `js/app.js` replaced `#view` with another native view. `cms-runtime.js` captured that native view, fetched the published CMS document asynchronously, and only then applied the saved presentation. The current live runtime had already removed an earlier CSRF wait, but still painted native defaults during the public-content fetch. Background session/catalog initialization also called the route renderer again. Thus the native layout could visibly return several times before the saved layout was reapplied.

The reported screenshots are consistent with this sequence: the server/native view still displays a heading span that the published CMS hides, retains native headline sizes before the saved override, starts with an empty/default promotional track, and displays an old category-picked hero product/image before CMS presentation is applied. The browser baseline test independently recorded the visible heading changing from `STANDARD CRACKERS EXCLUSIVE ONLINE STORE` to the published version and the hero height changing from about 707 to 566 pixels. This is not React hydration or a cached old application bundle.

Initial live file SHA-256 fingerprints:

| File | SHA-256 |
|---|---|
| `index.html` | `3f5131d4d45b6d8099a28c318d0b8143a91cc5ca2c6fa4be1550e97b2a2cc2df` |
| `cms-page.php` | `3fc6a3c0a8e415c37e34438eb2b41233ef73176b331f2b7984e2fdbadd2abb6d` |
| `cm-home.php` | `33fdb991e4dd62e43e6ead1afd4bd0fb3f932b326e41b2d6823654e0241d658e` |
| `js/app.js` | `a7e29d49df3101c769669c356cc2db16825db771b3f9b6eff508120351c2094e` |
| `js/cms-runtime.js` | `2fbbf531261ca3185b423b353a9d8f11ab1e59d8ed24e8046c86c9c99bc259da` |
| `.htaccess` | `7aae13d1cf25c6ad7acb60c005414db87d95d4e2ae916ed7322ad9328e67def6` |

The PHP candidate applies the published document's native presentation and shared components in the HTTP response, preserves existing head/script metadata, and sends the same public document as an inert JSON bootstrap for the browser. Featured hero cards read the existing merged public product/catalog source. Tests cover first-response copy/visibility/layout, section order/additions/removal, protected live product/category identity, shared promotion/branding, safe bootstrap encoding, script preservation and featured counts including zero/missing-image/out-of-stock products. Deployment and final live verification are recorded by the release owner separately.
