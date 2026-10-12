# Cart UI verification — 2026-10-08

The cart redesign has passed its independent browser checks in **http://localhost:4317**. This is a dedicated synthetic QA fixture, not the owner's 4316 preview or the live website. Its coupon records and boundary-test prices must never be deployed. No order was submitted.

- **103 checks passed** for empty/add/increase/decrease/remove, stock caps, refresh persistence, 101-item badges with exact accessible count, many-item scrolling, ₹2,500 pre-coupon minimum, valid/invalid/ineligible/stackable coupons, backend quote totals, comparison-price plus coupon savings, accepted-coupon refresh, shared full-cart summary, all three checkout steps and preservation of typed delivery details during coupon updates. Browser JavaScript error list was empty.
- **47 final geometry checks passed** after the item-area sizing refinement. Desktop 1440×900, tablet 820×1024, mobile 390×844 and short mobile 390×568 maintain no horizontal overflow, reachable coupon controls and visible totals/actions. Expanded offers retain a complete single-product quantity row at desktop/tablet/mobile-tall sizes. Short screens use a capped item scroller plus a bounded, scrollable middle section.
- **Ten accepted stackable coupons** were checked at 1440×700, 390×568 and 844×390. The shared aggregate Discounts row preserves the backend discount total without allowing the footer to grow per coupon. Total, Checkout and View Full Cart stay visible; individual applied codes/amounts/removal controls remain in the coupon section.
- **Final tap-target checks passed** at 1440×1000, 390×844 and 390×568. View Full Cart now measures 44px high, after correcting the higher-specificity older controls rule.

The 103-check behavioral run preceded the final CSS sizing/tap refinements and aggregate summary label. Those later presentation changes were covered by the focused geometry checks above and the coupon agent's 17 controller checks. Pricing, stock, cart state, minimum-order and checkout submission logic were not modified by these final refinements.

## Findings fixed during verification

1. At short heights, many cart lines expanded the item area to roughly 1,670px and pushed coupons far below the viewport. The item area now has an explicit short-screen height cap and scrolls internally.
2. Expanding desktop offers could shrink a single product area to 120px and clip its quantity controls. The normal minimum is now 168px, with a separate short-screen cap.
3. Ten accepted coupon rows could expand the footer. The shared summary now shows their single server-calculated Discounts total; applied coupon details remain available in the coupon section.
4. An older controls stylesheet overrode the intended 44px View Full Cart target with 40px. The new scoped selector wins at both normal and short heights.

## Evidence

- `audit/cart-ui-browser-20261008/results.json`: 103-check behavioral result.
- `audit/cart-ui-browser-20261008/layout-results.json`: 47 final geometry checks.
- `audit/cart-ui-browser-20261008/ten-coupon-geometry.json`: ten accepted coupon edge case at three sizes.
- `audit/cart-ui-browser-20261008/polished-scenario.json`: final 44px checks and clean presentation scenario.
- `polished-applied-and-progress-1440x1000.png`: desktop with one applied test coupon and one below-minimum offer with progress.
- `polished-applied-and-progress-390x844.png`: the same mobile scenario, with the coupon section scrolled to the complete progress card; the applied card and heading remain reachable above it.
- `polished-applied-and-progress-390x568.png`: short-screen coupon reachability with pinned totals/actions.

All screenshots in that folder are synthetic fixture evidence. Actual coupon codes shown on the live store continue to come from its existing backend.

## Repeat checks

The fixture is currently left in the polished two-active-coupon scenario for inspection. For a behavioral rerun, use `python audit/cart-ui-screenshot-scenarios.py full`, then `node tests/cart-ui-browser-test.mjs`. For geometry only, use `node tests/cart-ui-browser-test.mjs --layout`. Use the `edge` scenario before `tests/cart-ui-layout-edge-test.mjs`, or `polish` before its `--polish` mode. Refresh only the custom `cart-ui-fixture-20261008.json` manifest's source; do not replace `cms-fixture-active.json` or write to port 4316.

Live source deployment and post-deployment checks remain owned by the root task. This report does not claim the cart/editor source is deployed.
