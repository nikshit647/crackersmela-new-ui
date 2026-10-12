# CrackersMela audit and local review

**26 September 2026 — no deployment performed.**

27 September follow-up: the global control refinement, new UI findings, fresh local checks and before/after screenshots are documented in [UI_REFINEMENT_REPORT.md](<C:/Users/Nikshit Garje/Documents/ChatGPT/crackersmela final/UI_REFINEMENT_REPORT.md>). The backend limitations below still apply.

The current public UI has been recovered, audited and improved in an isolated local copy. The existing branding, blue palette, navigation, storefront layout and admin layout are preserved. The supplied backups do **not** contain the PHP backend used by the live website. Consequently this is a tested **frontend review**, not a completed full-stack repair or a production-ready release.

## Open the local result

- Public storefront: http://localhost:4173/
- Admin UI: http://localhost:4174/#/staff

Both servers bind only to `127.0.0.1`. Run `npm run preview` from this workspace to restart them. The admin uses a clearly labeled local display fixture, not a real authenticated account. Catalog reads use a public snapshot; all backend writes and private-order/email/upload/analytics endpoints return an explicit unavailable response. No requests are proxied to production.

**Login, registration, checkout completion, real orders, saved admin CRUD, uploads, customer management and server authorization are unavailable in this preview.** The public cart, navigation, search, filters, product pages, form drafts and local UI behavior can be reviewed. Trying a blocked operation must not be mistaken for a successful save.

## Which folder has the current UI?

| Source | What was found | Match to live |
|---|---|---|
| `C:\Users\Nikshit Garje\Downloads\crackers remake` | Blue vanilla-JavaScript frontend; older Spring Boot backend and incomplete Python backend; existing local changes | Closest code family, but older than live |
| `C:\Users\Nikshit Garje\Downloads\crackersproject new UI\crackersmela-new-ui` | Earlier blue static frontend/Spring implementation | Older variant |
| `C:\Users\Nikshit Garje\Downloads\crackersproject new UI\crackersproject` | React/Express/Firebase application | Different UI/application, not the observed live deployment |
| Current public assets, stamp `20260925b` | Vanilla-JavaScript app shared by public and admin domains | Basis of this local review |

The supplied folders, relevant archives and available Git history/remotes were checked. The deployed `orders-api.php`, `products-api.php`, `catalog-api.php`, `upload-api.php`, `email-api.php` and `analytics-api.php` implementations were not found. Starting an obsolete backend would not validate the current production application.

The originals in Downloads were left intact. Local work is under `review/` on branch `codex/local-audit`. Original downloaded client evidence contains publicly exposed credentials and is excluded from Git; secret values are not reproduced in this report.

The backups also lacked the live processed product-image variants. Recovered **113 matching public WebP images** (4,185,680 bytes), checking MIME/file signatures and every local URL. All 113 returned HTTP 200; two catalog products have no source image and retain their intended placeholder. This restores the current assets and removes local fallback 404 requests. Provenance and hashes are in `audit/image-recovery.json`.

## Architecture and trust boundaries

The current client consists of `index.html`, `css/styles.css`, `js/app.js`, and `js/products-data.js`, with a hash router and direct DOM rendering. Both domains load the same application; the admin hostname selects the staff console. Public catalog snapshots contain **115 products**, **three price overrides**, and **zero product overrides** at capture time.

| Area | Observed implementation | Verification limit |
|---|---|---|
| Catalog | Embedded product/category seed plus public PHP product and price/stock override reads | Actual DB schema/storage and transaction rules missing |
| Authentication | Original email/password accounts, roles and matching session tokens in browser storage; separate Firebase Google sign-in code | No reviewed server session/token-verification implementation |
| Orders | Browser builds complete orders; PHP collection pull, batch push and status update | Server ownership checks, canonical prices, stock concurrency, idempotency unknown |
| Admin | Dashboard, analytics, orders, products, add/edit, categories, price list, POS, canvas, users, notifications, settings, log views | Several are browser-local or static; visible controls do not establish real server capabilities |
| Images | Relative catalog assets, URL entry, canvas processing, multipart upload to PHP | Upload directory execution policy, actual decoding, ACLs/deletion rules unknown |
| Payments | UI offers cash or UPI on delivery | No integrated online payment gateway/webhook was established from current assets |
| Messaging | PHP email endpoint, `tel:`, `mailto:`, WhatsApp links | Email provider/rate limits and claimed SMS delivery not verified |
| Analytics | GA4 with consent plus first-party PHP events/reports | Reporting persistence/permissions and server privacy retention unknown |
| Fonts/auth SDK | Google Fonts; Firebase compatibility SDK references | Preview permits fonts but blocks remote auth/analytics scripts/connections |
| Deployment | Public/admin domains and PHP routes; same initial HTML on clean product/listing paths | Actual webserver rules, PHP version/dependencies, environment, database and storage configuration absent |

Hostname routing and hiding buttons are interface decisions, not authorization. Same-origin fetch may carry cookies; the absence of a token header alone does **not** prove the PHP server ignores authentication. Backend findings below are therefore explicitly separated from confirmed frontend behavior.

## Bugs found

Locations below refer to `review/public/js/app.js` by function/region because concurrent fixes change line numbers. Detailed original-source references and evidence are in the companion reports.

| ID / severity | Bug and location | Cause | Local fix and status |
|---|---|---|---|
| B01 — High | About, Contact, FAQ, Wholesale, Shipping, Returns, Safety, Terms, Privacy render 404; `views.content` | Looked up `CONTENT[route.name]` where the shared route name is `content` | Uses captured page parameter; fixed contact binding; all nine routes checked |
| B02 — High | Checkout claims success and clears cart before acceptance; `placeOrder`, `wireCheckout` | Fire-and-forget order write, swallowed errors, separate email request | Awaits HTTP/body acknowledgement, keeps cart on failure, disables duplicate submission; real persistence remains blocked |
| B03 — High | Reading orders can upload/resurrect local records; `syncPull` | Pull automatically pushes local-only orders | Removed write-on-read and anonymous startup pull; actual scoped server API still required |
| B04 — Medium | Quantities exceed stock or accept malformed values; cart helpers | Broad upper bound without actual stock/integer validation | Positive integer and actual-stock limits; malformed stored arrays handled; product quantity control respects stock |
| B05 — Medium | Product button shows “Added” when nothing was added | Product handler ignores failed cart addition | Success feedback now depends on successful addition |
| B06 — Medium | Checkout can dereference a removed cart product | Stored cart can outlive the catalog record | Checkout returns to cart with an explanation instead of rendering missing product fields |
| B07 — Medium | Optional email becomes required after focus | Validation treats touched blank email as invalid | Empty remains optional; supplied malformed email rejected |
| B08 — Medium | Contact form pretends to send a message | No actual submission integration | Keeps draft and clearly reports unavailable; real contact delivery is still missing |
| B09 — Medium | Edit-product completion throws `reRender is not defined`; `wireEditModal` | Callback references a function outside its scope | Renders/rebinds current panel using available functions; synthetic handler test |
| B10 — Medium | Invalid Add/Edit Product prices and stock persist | Negative price coerced before validation; missing finite/range checks | Validates raw values, finite non-negative prices and integer stock 0–999 before mutation |
| B11 — Medium | Conflict/failed save can be accepted as success; `syncProductsPush` | Revision field checked before failure and HTTP status ignored | Handles conflict/error before revision; returns result, useful failure message; write callers still need real persistence integration |
| B12 — Medium | Admin product search loses focus/fails to filter; global search mishandles uppercase | Re-rendering and inconsistent normalization | Debounced table update with focus/selection restore; global search normalized |
| B13 — Medium | Admin stock of 17 appears selected as Out of stock | Dropdown only contains 0/3/10/999 | Adds current stock option; visible stock text uses the same effective stock as purchase controls |
| B14 — Medium | Later high-priced catalog products excluded from default listing | Price ceiling computed before asynchronous catalog updates | Ceiling derives from current catalog; explicit filters preserved; late ₹9,250 fixture remains discoverable |
| B15 — Medium | Original image can be decoded before size validation | Background-removal branch checks only processed upload | Validate original type/empty/5 MB limit before decode and dimensions before canvas; revoke object URLs |
| B16 — Medium | Upload accepts error HTTP response or leaks raw error text | Response body treated as success without status validation | Requires successful HTTP, successful body, and safe returned URL; maps errors to useful messages |
| B17 — Low | Broken image fallback/clearing input leaves stale preview | Inline fallback builds escaped SVG and stale widget state | Shared non-executable fallback handler; clear invalid/empty preview; existing icons retained |
| B18 — Medium | Empty admin feed never begins polling; slow calls can overlap | Early return when no historical activity, recurring timer lifecycle tied to rebind | Timer starts independently, binds once, skips hidden/preview/unauthorized states, avoids overlap, stops after leaving/logout and ignores stopped-session results; synthetic tests only |
| B19 — Medium | Repeated admin rebinds retain detached panels | New global click listener added on each search/POS render | Single global dismissal listener queries the current elements |
| B20 — Low | Category/product/store links on admin point to wrong origin | Storefront-relative hashes used on admin hostname | Uses correct public origin, including local preview ports |
| B21 — Medium | Analytics errors expose technical response; dates shift in IST | Raw error string and UTC serialization of local midnight | Humane unavailable/retry state; local-calendar date formatter tested across timezones |
| B22 — Low | Google sign-in failure leaves button disabled / displays SDK setup text | Missing common cleanup and developer-facing error messages | Re-enables button through `finally`; uses understandable unavailable/retry/cancel guidance |
| B23 — Low | Invalid/first-load route handling and SEO | Loose prefix route match and missing route state | Anchored matching, initialized not-found state, noindex for unknown routes/local preview |
| B24 — Low | Absolute image URL corrupted in OG/schema | Origin prepended to already absolute URL | Correct relative resolution and safe absolute URLs; invalid images omitted/fallback |
| B25 — Medium | Checkout next-step button hidden under sticky header | Step replaces content but keeps delivery-form scroll position | Scroll to top on step transition; reproduced in local end-to-end flow and rerun after fix |

The UI defects, copy inconsistencies and measured layout shift are described separately below. Security defects are not downplayed as ordinary UI bugs.

## Security issues

Severity describes the confirmed issue; more severe backend consequences are marked conditional. No destructive payloads, production writes, uploaded test files, real customer modifications, account creation or production emails were used. Original-vulnerability proofs use isolated Node contexts and synthetic data.

| ID / severity | Vulnerability, location and risk | Root cause | Fix/status | Verification |
|---|---|---|---|---|
| S01 — High | Browser-state admin impersonation; `currentUser`, registration, staff write gates | Two editable tokens/roles treated as trusted identity; owner email auto-promoted without verification; browser-held password hashes | Removed demo/password identity and owner promotion. Local authentication fails closed; admin fixture exists only for isolated UI review. **Server auth not implemented/verified.** | Original synthetic forged state passes staff gate; patched non-preview client rejects forged state. No production login attempted |
| S02 — High | Privileged shared write key and demo credentials in publicly served JS | Server-style secret shipped to every browser; key also placed in report URL | Secret/demo values removed locally. **Production credential rotation and server session replacement still required; not performed.** | Static declaration/call-site trace and sanitized-file scan; no exposed credential used against production |
| S03 — High | Product image URL executes JavaScript in inline `onerror`; card/admin/POS renderers | HTML escaping used inside executable JavaScript context | Replaced inline handlers with escaped data attributes and one event listener; safe schemes/credentials validated | Original boolean-marker proof; regression cases for original shape, schemes, fallback lifecycle and upload limits |
| S04 — Medium | Customer/order/account data survives logout in browser caches | Complete orders, local users/password records, activity and held bills persisted; public recent-order suggestions | Private data stays in page memory, legacy private caches cleared, logout clears private drafts/state, stale pull responses discarded; public order suggestions removed. **Server ownership checks still missing/unverified.** | Synthetic cache and logout/in-flight-response regression tests; no customer samples used |
| S05 — Medium | Order IDs/quantities and global-search user attributes inserted as raw markup | Unescaped values assumed to be trusted server/account data | Encodes route components and HTML-escapes attribute/text sinks locally; server schema validation still required | Synthetic breakout values rendered as data; cross-user persistence/exploitability on PHP not claimed |
| S06 — Informational | Local preview must not contact production or impersonate a working backend | Recovered client references live services and original write handlers | Loopback server, strict resource allowlist, no proxy, explicit 503, local fixture identity, independent HTTP write rejection and visible UI guard | 60 HTTP isolation tests plus real-browser blocked-save/failed-checkout checks; this secures the preview, not production |

S01/S02 could have **Critical** operational consequences if PHP endpoints rely solely on the published key or client roles. That condition cannot be confirmed without source/test backend, and is not presented as proven compromise.

### Required backend verification before any release

| Priority | What must be tested in an isolated backend | Present status |
|---|---|---|
| High | Anonymous, normal customer, wrong-role and expired/revoked session access to every admin API; protected roles/claims; separate staff permissions | Blocked — no current PHP/session implementation |
| High | Two synthetic customers cannot read/change each other's orders, invoice, tracking, upload or account data | Blocked — cannot verify BOLA/IDOR on real backend |
| High | Server computes canonical price/discount/stock/status; rejects negative/fractional/oversized quantity, invalid coupon, stale inventory; transactional stock and idempotent order creation | Blocked — client validation is not a security boundary |
| High | Upload authentication, decoded file signature, MIME/extension/size/dimensions, safe random filenames, traversal rejection, non-executable storage, authorized deletion | Blocked — no upload/storage implementation |
| High | Rotate published privileged key; verify no shared browser secret is accepted; review access logs | Production action not taken; needs source and later deployment approval |
| Medium | CSRF, cookies (`Secure`, `HttpOnly`, `SameSite`), CORS allowlist, session expiry/revocation, JWT signature/claims, brute-force/rate limits | Unknown — not inferred from frontend alone |
| Medium | SQL/NoSQL/command injection, SSRF, traversal, debug endpoints, verbose exceptions, database permissions, storage ACLs and secret management | Blocked — code/configuration absent |
| Medium | Email endpoint uses canonical authorized order and fixed templates/recipients; cannot send arbitrary messages; delivery triggered only after accepted order | Blocked |
| Medium | Actual PHP/framework dependency advisory audit, production headers/CSP, server logs, environment and deployment configuration | Blocked; audit-tool dependencies are not production dependencies |

## UI/UX improvements — same design

| Before | Change | Benefit |
|---|---|---|
| Mobile filter heading/close control hidden behind navbar | Correct stacking while drawer is open | All existing controls visible |
| Focus escapes drawers/modals; closed sidebar remains keyboard-reachable | Focus trap, Escape, focus return, background inertness | Keyboard and mobile assistive-technology usability |
| Search wrapper poses as an extra unnamed input | Named search landmark; real input retained | Correct semantics without changing appearance |
| Inconsistent heading hierarchy | Semantic levels corrected with existing styling | Clearer document navigation |
| Faint admin gray text | Small gray contrast adjustments | More readable, same palette |
| Nested main and invalid date-tab semantics | Correct landmarks/control grouping | Removes misleading accessibility structure |
| Fake social links lead home | Removed unavailable destinations, kept WhatsApp | No deceptive navigation or invented profiles |
| Garbled checkout label | “Checkout” | Clear action label |
| About-page bullets clipped at edge | Scoped list indentation and heading spacing | Restored information pages read well on mobile |
| Hardcoded Operational/Server Online claims | Honest backend availability wording | No false system-health assurance |
| FAQ fee conflicts with current minimum-order checkout | Matches ₹2,500 minimum and no delivery fee | Consistent customer expectations |
| Privacy says “demo”; safety recommends loose clothing | Factual cash/UPI wording; well-fitting cotton guidance | Removes template copy and corrects unsafe wording |

No new dashboard widgets, replacement design system, new brand palette or framework rewrite was introduced.

## Performance

| Issue | Change | Evidence/limit |
|---|---|---|
| Empty initial main lets footer jump during first render | Reserve minimum height only while `#view` is empty | Local warm 1366×768 CLS **0.60 → 0.01** |
| Repeated global admin listeners | Bind once and look up current DOM | Ten rebinds install one listener in regression test |
| Empty/duplicate/overlapping order feed | Explicit lifecycle and in-flight guard | Synthetic zero-to-one order, hidden-tab, overlap and logout checks; no backend load benchmark |
| Unbounded original image processing | Reject large/invalid originals and excessive dimensions before canvas | Synthetic rejection occurs before processing/network allocation |
| Local backup lacked processed product images | Recovered the matching live static assets | 113/113 live and local HTTP 200; 4.19 MB total; no invented/replacement imagery |

LCP 148→128 ms and FCP 76→60 ms in the same local run are normal timing variation, not a claimed production speed gain. This is lab evidence, not CrUX field data; INP was not measured. The recovered assets are approximately 297 KB app JS, 60 KB catalog JS and 361 KB CSS before compression (audit snapshot). No blind CSS/framework rewrite or dependency upgrade was used to chase a score.

Unresolved: intended four-second full-order collection polling needs authorized paginated/delta APIs; server query counts, N+1 behavior, slow DB/API calls, CDN caching and server response under load cannot be measured without the backend. Repeated small-catalog merges were noted but not over-engineered for 115 products.

## SEO/public quality

- Titles, descriptions, canonical, Open Graph/Twitter and JSON-LD exist. Fixed image URL resolution, incorrect content routing, heading semantics and unnatural initial description. Unknown pages and the entire local preview are noindex.
- Live `robots.txt`, `sitemap.xml` and declared `sitemap.php` responded 200. A missing clean route returned genuine 404.
- **Unresolved:** clean product/listing requests initially return homepage metadata and empty content; runtime JS updates them. Server/prerender support and clean-route rewrites need the real deployment configuration.
- **Unresolved:** live admin initial HTML says `index, follow`, its robots policy allows crawling, and no X-Robots-Tag was observed. Configure admin noindex at the server; local preview headers are not a live fix.
- Business claims, ratings/review provenance, certifications, delivery guarantees and structured-data social profiles need owner/source verification. No unsupported claims or keyword stuffing were added.

## Remaining functional/code-quality work

These are identified gaps, not operations claimed fixed because the preview blocks them:

| Severity | Location / problem | Required next work |
|---|---|---|
| High | Product updates span independent `catalog-api.php` and `products-api.php` stores; one has revision control and one does not | One canonical atomic/versioned product transaction; partial-failure recovery. Current snapshots have no observed conflicting prices |
| Medium | Product/table/coupon/status/POS handlers can mutate local state or announce success before durable persistence | Integrate all callers with actual server acknowledgements, preserve drafts, handle rollback/conflict, and test failure paths |
| Medium | POS creates a browser-local order instead of a canonical server order | Explicit accepted server submission, inventory/payment validation and idempotency; preview finalization is blocked |
| Medium | Extra-product delete lacks confirmation | Add a confirmation and server-acknowledged deletion when actual persistence is available; no production deletion tested |
| Medium | Edit fields `discountPrice`/`displayOrder` do not drive selling price/default order | Confirm intended schema/business rules before wiring or removing unsupported controls |
| Medium | Positive stock override can still be held unavailable by base `inStock=false` | Define manual-unavailable versus inventory semantics in canonical schema; visible labels now agree with buying controls |
| Medium | Users screen has no real central user-management API | Recover actual identity service; no role editing/blocking/account CRUD claimed tested |
| Informational | Categories view lists seed groups; no category CRUD implementation | Recover intended capability if category management is required |
| Medium | Real contact delivery, notifications/SMS claims, ownership-scoped tracking and reloadable order history | Implement/test against authentic backend; preview reports unavailable and avoids persistent private caches |
| Low | Large single-file client and layered CSS overrides | Correctness fixes applied; avoid broad cleanup until complete source is recovered and regression coverage is available |

Lint uses explicit correctness rules (undefined references, duplicate keys/arguments, unreachable code, unsafe control flow). It is not a claim that every legacy helper, naming inconsistency or CSS override has been removed. No production dependency was upgraded blindly. Audit tooling uses ESLint 10.11.0 on Node 24.19.0 with a lockfile; production PHP dependency versions are unknown.

## Test results

Final results are recorded after the combined regression run in `audit/final-checks.json` and the browser evidence files. All PASS labels below are scoped to the recovered frontend/local harness.

| Requested check | Result | Scope |
|---|---|---|
| Production build | **BLOCKED** | Current production PHP project/build/deployment source missing; no misleading replacement build |
| Lint | **PASS** | `npm run lint` correctness configuration |
| Type check | **N/A** | Recovered application is plain JS with no TypeScript project; syntax check listed separately |
| JavaScript syntax | **PASS** | `npm run check` |
| Automated tests | **PASS — 109/109** | `npm test`; isolated function tests and 60 HTTP boundary checks |
| Public website smoke | **PASS, local frontend** | 20 local routes plus failed-checkout/contact/404 flows |
| Admin smoke | **PASS, local fixture** | Navigation/search/editor and blocked-save state; real CRUD/auth is BLOCKED |
| Responsive | **PASS, sampled states** | Home/catalog/admin at 390×844, 768×1024, 1366×768, 1920×1080; nine information pages at mobile; modal/sidebar checks |
| Accessibility | **PASS for automated checks sampled** | No confirmed WCAG violations on final home/admin scans; gradient contrast has incomplete checks, preview notice landmark best-practice remains |
| Frontend/preview security regressions | **PASS** | Synthetic injection/cache/auth-rejection and isolated HTTP restrictions; not server verification |
| Server security / normal-account admin denial | **BLOCKED** | PHP, real accounts and isolated backend unavailable |
| Tooling dependency audit | **PASS — 0 reported vulnerabilities** | Does not cover deployed PHP or obsolete supplied projects |
| Deployment / production post-change smoke | **NOT RUN** | Explicitly withheld per user instruction |

Expected preview 503 responses are not treated as a working API. No unexpected local uncaught JavaScript exceptions were observed in the inspected UI; failed checkout intentionally exercises a 503 path. Browser checks use Chromium, not a claim of Safari/iOS/Firefox device coverage.

## What you should test now

1. Open the public URL and compare the branding, navigation, category rail and product cards with the current website.
2. Search for **Long Boy**, try categories, price sort and mobile Filters. Close Filters with Escape and check keyboard focus returns.
3. Add items, change quantities, remove items, try wishlist and view the price list. Inspect the minimum-order message.
4. Use synthetic contact details for checkout. The isolated backend is unavailable: submission should show a clear error and **keep the cart**. No real order is created.
5. Open About, Contact, FAQ, Shipping, Returns, Safety, Terms, Privacy and Wholesale. These should show their actual pages.
6. Open Admin preview → Products, search Long Boy, open Edit. Check the form/modal, press Escape, inspect stock values and navigation. Trying Update Product should report **Nothing was saved**.
7. Inspect Orders/Users empty states, Add Product draft, Analytics unavailable/retry, POS draft and Settings. POS has a Back control for returning to the sidebar.
8. Repeat at a narrow mobile width and tablet width, checking overflow, tables and modal close controls.

## What is needed to complete the full audit

Provide the actual hosting/PHP source folder or repository containing the six endpoints listed above, the current server/deployment configuration, dependency manifests, and an isolated test database/storage configuration. Do not paste secrets into chat. With that source, remaining auth/permission, CRUD, price/stock/order, storage, dependency and full production-build checks can be completed locally.

**Do not deploy this review harness or recovered frontend as a finished release.** No deployment is scheduled or authorized. Local review comes first; any eventual deployment still requires your explicit approval after the backend work and full validation.

## Detailed evidence

- `audit-security.md`: original findings, exact original-source references and server questions.
- `audit-security-proof-results.json`: isolated original-vulnerability observations with no credentials/customer data.
- `audit-additional.md`: catalog, image, validation, listener and error-handling work.
- `audit-privacy.md`: private-cache and output-hardening changes.
- `audit-ui.md`: UI/SEO, screenshots, corrected admin-tab coverage, accessibility and viewport observations.
- `audit/browser-smoke.json`, `audit/browser-flows.json`, `audit/final-checks.json`: final machine-readable results.
- `audit-evidence/`: local screenshots/video/vitals; ignored in Git. `*-verified.png` admin captures supersede early POS-loop captures.
- `review/README.md`: preview architecture, commands and limitations.
