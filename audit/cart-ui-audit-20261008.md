# Cart presentation audit and focused verification plan

Read-only source audit for the owner's cart UI/UX request in the 2026-10-08 attachment. Source is `audit-evidence/production-release`; no store records, localhost:4316 state, source, or frozen release were changed by this audit. The earlier `20261008-editor4` package is immutable and predates the current category-ghost/cart work; create a new release after verification.

## Existing integration points

| Surface | Source | Existing shared behavior |
| --- | --- | --- |
| Header cart icon | `index.html` `#cartBtn`, `#cartCount`; `js/app.js` `cartUI()` | Sum of valid product quantities; hidden for zero. |
| Global drawer | `index.html` `#cartDrawer`; `js/app.js` `cartDrawerRender()` and `cartLine()` | `#cartDrawerBody` currently contains both product lines and `couponSurface('drawer')`; `#cartDrawerSummary` and actions are in the footer. |
| Full cart | `js/app.js` `views.cart` | Same `cartLine()` controls; coupon slot and shared summary in a sticky side panel; Clear cart and Continue shopping controls. |
| Checkout, every step | `js/app.js` `checkoutSummaryPanel()` called from address, payment, and review steps | Products in an internal scroller, `couponSurface('checkout')`, then the same coupon summary renderer. |
| Offers, applied state and totals | `js/coupons.js` `component()`, `summary()`, `bind()` | One controller instance created in `app.js`; delegated actions apply everywhere. |
| Styling | `css/styles.css`, `css/controls.css`, `css/coupons.css` | Multiple late overrides exist. Scope the cart presentation so invoice/history/POS components are not unintentionally restyled. `coupons.css` loads after base/controls styles. |

There is no need for a second cart or coupon state. The available-offers list already exists below the manual code field, collapsed by default. Moving and restyling that list addresses discoverability. Removing the shared `summary()` Delivery/Free markup removes it from drawer, full cart and all checkout steps while keeping `delivery: 0` in the calculation and stored order.

## Business invariants to preserve

- **Cart identity and persistence:** `cm2.cart` stores only `{id, qty}`. Bootstrap accepts integer positive IDs/quantities and caps each quantity at 50. `save()` persists current cart, and reorder-from-history uses the same state. Product prices and facts come from the existing catalog/overrides.
- **Count:** `cartTotals().count` is the sum of quantities of valid products, not distinct lines. Drawer and header badge must stay in agreement after add, increase, decrease, remove, clear and refresh. A `99+` visual cap may retain the exact count in an accessible label; it must not cap cart state.
- **Quantity limits:** `addToCart()` and `setQty()` use `min(50, floor(stock))`. Disabled/out-of-stock items cannot be added; zero removes a line. Preserve delegated `data-add`, `data-qty`, `data-d`, and `data-del` actions and product-card synchronization.
- **Subtotal:** `sum(priceOf(product) * quantity)`. Client `cartTotals()` is the fallback/display/minimum gate; checkout money is accepted from the server quote, which resolves current canonical catalog prices.
- **Minimum:** exactly **₹2,500 of pre-coupon subtotal**. Below it the drawer and full-cart checkout controls are disabled and the direct checkout route returns to cart. `orders-api.php` independently enforces 250000 paise. A valid coupon may lower the payable total below ₹2,500 without invalidating this gate.
- **Savings:** comparison-price saving is `sum(max(compareAt - price, 0) * quantity)`. The shared summary adds the accepted server `totalDiscount` once. Do not subtract savings again from the payable total.
- **Delivery/festive:** client and canonical orders currently retain delivery zero and festive discount zero. Remove the requested visual row only.
- **Coupon data:** `CM_DATA_DIR/coupons.json`, public `coupons-api.php?a=offers`, quote `?a=quote`, and existing `cmCouponEvaluate()/cmCouponApplyAll()` are authoritative. Never use the legacy browser `couponConfig` fallback as a customer offer. The server's supported legacy coupon remains a manual hidden offer (`showInCartOffers:false`).
- **Offer visibility:** public offers require active + `showInCartOffers`; expired/future/exhausted/audience-ineligible/scope-mismatched offers are excluded. Below-minimum offers stay visible with server unlock/progress figures. Provisional guest offers remain unconfirmed until the checkout phone is known.
- **Stacking:** by default one offer; stacking only when all accepted/candidate coupons support it. Existing offers are evaluated independently of applied codes, so a candidate can look ready before Apply returns `stacking_blocked`. Any presentation improvement here should get the verdict from the existing evaluator, not reproduce eligibility rules in JavaScript.
- **Discount calculation:** server integer paise, fixed/percentage rules, qualifying product/category subtotal, caps and cumulative per-product/subtotal cap remain unchanged. Frontend must not calculate an alternative discount.
- **Coupon persistence:** `cm2.couponCodes` and `cm2.excludedAutomaticCodes` store code preferences only, never amounts. Applied manual codes restore and revalidate on refresh; removed automatic codes remain excluded. Invalid manual codes stay editable but cannot enter order payload. A below-minimum selected code retains intent and can become valid after adding items.
- **Asynchronous safety:** controller quote signature includes items, customer identity, catalog price/stock, checkout phone and code preferences. Old requests cannot overwrite a newer cart. Pending/error quotes cannot expose stale discount/total as payable. Existing quote and offer requests run independently; an offers failure need not destroy a successful quote.
- **Checkout:** changing coupon slots must preserve address/billing/payment data, input caret/focus and selected checkout step. `paintCoupons()` only repaints slots and Place order label/readiness. Place order revalidates stock and forces a fresh quote; if items, accepted codes or total changed, it asks for review instead of submitting. Successful order clears the cart only after confirmed backend creation. Failure retains it. Backend idempotency/stock/coupon usage remains unchanged.

## Focused implementation verification

Use an isolated PHP fixture with fake/disabled mail and a separate browser namespace/session; never seed coupons or write orders into localhost:4316 or live data. Seed test offers only in that fixture through the existing coupon API. Capture before/after product/catalog records to establish that presentation tests do not edit merchandise. Reuse the existing fixture/server setup patterns in `tests/coupons-backend-test.py` and `tests/coupon-completion-test.py`.

| Case | Expected result |
| --- | --- |
| Empty cart | Empty-state call to action, zero/hidden badges consistent, checkout disabled, no stale coupon total. |
| One item, then quantity two | Header/drawer count tracks 1 then 2; line total/subtotal/savings agree; refresh restores quantity. |
| Two distinct items | Both visible once; counts reflect summed quantity; remove/decrease updates drawer, full cart and product-card controls. |
| Quantities 10, 99 and over 99 across products | Count presentation stays aligned and uncut; accessible exact count matches state; stock/per-item cap preserved. |
| Stock limit and zero | Increasing at limit leaves state capped; decrement to zero removes item and updates all totals. |
| Many lines with long names/prices | Product area scrolls; coupon section and totals/actions remain reachable; no overlap or horizontal scrolling. |
| Subtotal ₹2,499, ₹2,500 and above | Exact remainder below threshold; Shop More works; warning disappears at threshold; direct route and buttons preserve gate. |
| Qualifying subtotal with discount taking total below ₹2,500 | Checkout remains allowed and uses discounted server total. |
| Available offers, none/one/many | Only real fixture API records; no placeholder coupons; cards above manual entry, scroll/collapse does not hide controls. |
| Eligible percentage and fixed coupons | Apply uses existing path; one clear applied state, correct discount/total/savings, then Remove restores total. |
| Invalid manual code | Clear error, input preserved, no applied state/discount/order payload. |
| Below-minimum offer | Server minimum/remainder explained, no broken Apply action; Shop More works; it unlocks when cart qualifies. |
| Ineligible/inactive/expired/not-started/used-up/hidden offer | API visibility respected; manual attempt stays rejected by existing evaluator. |
| Non-stackable and stackable pairs | Incompatible second offer cannot appear successfully applied; accepted pair honors server caps and totals. |
| Provisional guest offer | Explanation and no unconfirmed discount; adding checkout phone revalidates via same quote flow. |
| Automatic offer removal | Removed state persists across refresh; total and order payload exclude that offer. |
| Repaint and route transitions | Coupon input caret/draft, offer expansion, relevant list scroll and checkout address/payment entries remain usable; cart/coupon state shared through drawer/full cart/checkout. |
| Delayed/out-of-order/failed quote | Pending controls clear, stale total not payable, retry recovers; latest cart wins. |
| Final checkout in isolated fixture | Confirm correct backend quote, one order on repeated submission, stored price/discount unchanged, cart clears only on success. |

Layout matrix: desktop 1440×900, laptop 1280×720, tablet 768×1024, mobile 390×844, narrow/short 360×640 and 320×568, landscape 844×390. For each key case verify drawer bounds, internal scroll behavior, total/actions visibility, at least 44px mobile touch targets, focus-visible controls, badge alignment, product/coupon content wrapping and zero horizontal overflow. Check full cart and all three checkout steps at desktop/mobile. Open the same global drawer from Home, products/category, product detail and checkout. Inspect browser console errors and failed relevant API responses.

## Existing checks to reuse

- `node --test tests/coupon-controller.test.mjs`: quote/persistence/race/invalid-code/provisional/escaping behavior. **Baseline ran 2026-10-08: 12/12 passed.**
- `python tests/coupons-backend-test.py`: canonical fixed/percentage discounts, caps, scopes, stacking, client-money rejection, minimum order, usage and order snapshots; isolated fixture.
- `python tests/coupon-completion-test.py`: additional automatic offer, storefront quote/order equivalence and edge cases; isolated fixture.
- New focused browser coverage should exercise the layout and actual clicks described above, without adding implementation-mirroring assertions for purely decorative CSS.

This is an audit/plan, not a claim that the forthcoming cart UI has passed these cases or is deployed.
