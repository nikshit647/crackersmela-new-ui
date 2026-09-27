# Public control-pattern inventory

Audit date: 27 September 2026. Read-only inventory for the requested control refinement. No application source was edited by this audit. The parent task owns public implementation; admin implementation is owned separately.

## Evidence and scope

- Read the complete follow-up at `C:/Users/Nikshit Garje/.codex/attachments/634568ec-d8af-4313-b23e-996a3e69dd07/Pasted text.txt`.
- Inspected public markup in `review/public/index.html`, templates and interaction handlers in `review/public/js/app.js`, and control recipes throughout `review/public/css/styles.css`.
- Visually inspected `audit-evidence/screenshots/local-catalog-tablet.png`: category navigation, Filters, sort/search fields, and Add to Cart visibly share oversized capsule/glass treatment. Category selection and filter opening compete with purchase actions.
- Visually inspected `controls-before/mobile-catalog.png`: the All Categories count was low-contrast inside a gradient capsule with a glow/ring. Initial desktop catalog/checkout captures exposed a reduced-motion visibility bug. Those incomplete frames were replaced with verified visible-content baselines before activation; the reduced-motion failure was retained separately.
- The attachment directory contains the text request only; no supplied bitmap screenshots were available.
- Line numbers below describe the inspected source and may shift during the parallel implementation. Selector, template, and element names are the reliable anchors.

## Root cause

The issue is a shared recipe, compounded by repeated CSS generations. Base `.btn` uses `--r-pill`, weight 700, substantial padding and transform transitions. `.btn-primary` adds a gradient and blue shadow. Later sections reapply glass backgrounds, inset highlights, stronger shadows, rings, hover lifts and scale. Category selectors, filters, quantity increments, repeated product actions and checkout progress reuse similar emphasis despite having different roles.

Changing `--r-pill` globally is unsafe: badges, numeric markers and some compact tags legitimately use round geometry. Changing only `.btn` is insufficient: numerous controls do not use that class, and more specific drawer/product selectors defeat a base override.

## Role inventory

| Actual role | Public source anchors | Existing problem | Intended treatment |
| --- | --- | --- | --- |
| Main action | `.btn-primary`; hero Shop Now; checkout actions; auth/contact submission | Gradient, glow, bold white text, full capsule, hover lift | Solid brand blue, moderate action radius, weight around 600, subtle color/border hover. Keep main-action importance and existing placement. |
| Secondary action | `.btn-glass`, `.btn-white`, `.btn-ghost`; Explore, Back, Continue shopping | Glass blur, bright border, elevation and lift compete with primary | Restrained surface/outline or quiet text treatment according to role; same action geometry and typography. |
| Category navigation/filter | `catRailUI()`; `.cat-pill`, `.cp-n`; `data-cat`, `data-railsort` | Selected item uses CTA gradient/glow; count appears as a faint badge | Selected navigation state with clear text, pale fill/border or indicator. Keep count inline and subordinate without low opacity. It changes the product category/route; it is not a purchase action. |
| Collection filter tabs | `pillsUI()`/`wirePills()`; `.chip`; `role=tab`, `aria-selected` | Normal and active choices use glossy capsule recipes | Compact selector family; clear selected state independent of CTA fill. Preserve tab behavior and state attributes. |
| Repeated product Add | `footNormal()`; `.add-btn.add-btn--round`; `data-add` | Late liquid-glass capsule, shine overlay, redundant bag icon, parent-hover scale | Text-only Add to Cart, moderate radius and normal action size. Distinguish repeated product actions from checkout. Preserve location and all `data-*` hooks. |
| Product in-cart quantity | `footCart()`; `.qty-ctl`, `.qty-btn--minus`, `.qty-btn--plus`, `.qty-num` | Plus becomes a tiny primary gradient/glow CTA; hover scales | Coherent compact quantity editor with neutral/brand-tinted buttons, steady geometry and obvious disabled state. Retain plus/minus and quantity live region. |
| Quiet destructive action | `.qty-remove`, `.cart-line__del`, `#clearCart` | Remove is another full-width capsule with its own shadow/scale | Quiet red text or low-emphasis red surface, no glow. Trash is meaningful, especially when icon-only. Keep confirmation behavior. |
| Wishlist toggle | `.prod-card__wish`, `#pdWish`, `[data-wish]` | Repeated gloss and active scale/drop shadow | Useful heart icon, consistent compact surface, clear selected color/shape and `aria-pressed`. No decorative lift. |
| Product detail actions | `.prod-actions`, `#pdAdd`, `#pdBuyNow` | Add cart icon and Buy now lightning are redundant; same oversized family | Preserve existing action order/flow. Clear main and secondary treatment, normal dimensions. Remove unnecessary text-action icons. |
| Product detail quantity | `.qty-stepper`, `#pdMinus`, `#pdPlus`, `#pdQty` | Shadow/glass wrapper and weight 800 | Same quantity family as cards/cart; modest field-like geometry. Plus/minus remain meaningful. |
| Cart drawer checkout | `#cartCheckoutBtn`; `.drawer__foot .btn-primary:not([disabled])` | Own high-specificity gradient, layered glow and radius 999px | One clear main checkout action; moderate radius, solid color, calm hover. Disabled minimum-order state remains obvious. |
| Cart drawer secondary | `#cartViewBtn`, `.drawer__view-cart`, `.shop-more-btn`, `.start-shopping` | Weight 800 capsule, blur, shadow/lift; shopping icons repeat label | Clear quiet/secondary navigation. Remove redundant shopping icon when text supplies meaning. |
| Full cart checkout | `#goCheckout`; `.btn-block` | Gradient capsule plus decorative arrow | Keep full width where it belongs in summary column; restrained main-action styling. Arrow unnecessary beside Proceed to checkout. |
| Checkout progress | `stepTabs` in `views.checkout`; `.stepper`, `.step-pill`, `.n`, `.step-sep` | Noninteractive spans visually masquerade as primary buttons | Ordered progress structure: marker, text and connector. `aria-current=step` on current step; distinct completed/current/upcoming states. Active marker/text supplies emphasis without filling the whole label like a CTA. |
| Checkout forward/back actions | `#ckNext1`, `#ckNext2`, `#ckBack1`, `#ckBack2`, `#ckPlace` | Review order and Place order use `.btn-block` inside a flex row, stretching across the panel; decorative arrows/lock | Reusable action-row class with sensible content width on desktop and intentional mobile wrapping/full width. Keep one clear forward action and quiet Back. Do not remove navigation meaning or order amount. |
| Payment choice | `.pay-option`, `.radio`; `role=radio`, `aria-checked`, `data-pay` | Selection ring and gradient radio dot reinforce glossy language | Field/selection-row styling, useful selected border and radio marker. Cash/UPI recognition icons may remain if they help distinguish methods. |
| Coupon inline action | `#ckApplyCoupon`, `#ckCouponInput`; `checkoutSummaryPanel()` | Uses main `.btn-primary`, changes to `.btn-ghost` after applying; inline sizing/radius | Small inline secondary action with stable size for Apply/Remove. Preserve state, validation and disabled input behavior. |
| Mobile filter trigger | `#filterFab`, `.filter-fab`, optional count | Blue-gradient capsule with shadow at same emphasis as purchase | Secondary utility button; sliders icon communicates the panel. Compact inline count. Preserve expanded/dialog semantics. |
| Sort/select fields | `.sort-select`, `.filter-select` | Capsule/shadow treatment looks like another CTA | Field radius distinct from action buttons, subtle border, normal weight. Keep chevron because it communicates selection. |
| Search fields/actions | `.nav-search`, `.nav-search-open`, `.prod-toolbar__search`, `#navSearchViewAll` | Glossy icon surface and capsule fields; trailing view-all arrow | Consistent field family. Keep search icon; text-only results navigation is sufficient where clearly labeled. |
| Filter reset and active tokens | `.filter-clear`, `[data-fclear]`, filter-token remove controls | Small reset weight 750; Clear all uses glass button | Quiet text action, moderate weight, clear focus. Compact removable tokens may retain tag geometry; meaningful close icon stays. |
| Primary navigation | `.nav-link`, `.mobile-toggle`, `.mega`/drawer links | Desktop text links also carry repeated decorative icons | Preserve navigation layout and blue selected state. Home/About/Contact label icons optional; category chevron, menu and close remain meaningful. |
| Account menu | `.account-chip`, `.account-menu__item`, logout modifier, `#userIconBtn` | Repeated glass/highlight layers; chip radius and shadow | Practical account trigger and menu rows. Keep avatar/account icon; quiet destructive logout state. Preserve expanded/focus behavior. |
| Auth modes and providers | `.auth-tabs`, `.google-btn`, `#auSubmit`, `.pw-toggle` | Weight 750, shadow on active tab/provider; submit inherits glossy CTA | Distinct mode selector and provider button. Keep Google logo and password eye because they communicate provider/function. Loading/disabled state must survive. |
| Consent choice | `.analytics-consent button`, `[data-analytics-accept]`, `[data-analytics-reject]` | Separate weight 800 and accept gradient/shadow escape shared `.btn` rules | Consistent compact choices with readable text and comparable clarity. Explicitly include this standalone family in the refinement. |
| Contact/support actions | Contact submit, WhatsApp links, `.fab-wa` | Mail icon redundantly repeats Send message; floating control shares action effects | Remove redundant mail icon. Keep WhatsApp identity and icon-only floating support control. Preserve existing green channel color. |
| Order utility/navigation | Track, Reorder, `#printInvoice`, `#copyCode` | Arrow/truck decorations and 32px inline copy sizing | Track/Reorder text can stand alone; print/copy symbols communicate operation and should stay. Preserve sufficient target size without blindly inflating dense rows. |
| Back to top | `.fab-up` | Floating/decorative effects | Keep useful upward navigation icon; calm hover and existing visibility behavior. |

## Specificity and duplicate-recipe traps

These earlier recipes must be removed/consolidated or intentionally superseded for all states, including `:hover`, `:active`, `:disabled` and pseudo-elements:

1. Base `.btn` around line 248 and `.btn-primary`, `.btn-glass`, `.btn-white`, `.btn-ghost`: full-pill token, weight 700, transform/will-change and shadow.
2. `.add-btn`/`.add-btn--round` around 1967: early circular shape, hidden label rules and later label restoration. Preserve visible text and appropriate width after cleanup.
3. `.drawer__foot .btn-primary:not([disabled])` around 3524, hover at 3534, active at 3544, disabled at 3548: higher specificity than generic `.btn-primary`.
4. `.drawer__view-cart` around 3555 and `.shop-more-btn`: separate families with full-pill radius, weight 800, blur and transforms.
5. `.chip` around 2329, `.chip.active` around 2355; `.cat-pill` around 5019 and active 5044; `.filter-fab` around 5178.
6. `.icon-btn`, `.account-chip`, `.nav-search` overrides around 6756, 7093 and 7606 reintroduce gloss, edge highlights and hover states.
7. `.prod-card:hover .add-btn--round, .prod-card:hover .add-btn` around 6836 causes motion even when the button itself is not hovered. A base `.add-btn:hover` change alone cannot fix it.
8. `.prod-card__wish` around 6842, 7115, 7547 and 8767; active svg drop-shadow near 6862. Treat toggle states together.
9. `.chip,.cat-pill,.meta-pill` around 6867; active glow/ring at 6876; more recipes at 7122 and 7557. `meta-pill` may be informative rather than interactive, so do not flatten all three blindly.
10. `.btn-primary:hover` around 6886 and final `.btn-primary` around 7662 reintroduce strong gradient, inset/outer shadow, hover glow and active scale.
11. `.qty-btn`/plus/minus/remove around 8401–8482: transform 1.05/.92, blue gradient/shadow, pill remove action. Preserve the existing coarse-pointer 44px target rule.
12. `.add-btn.add-btn--round` around 8621, its `::before` shine around 8649, `.prod-card .add-btn--round:hover:not(:disabled)` around 8685, active around 8693, disabled around 8699, mobile width/min-height around 8716. This is the final high-specificity card-action recipe.
13. Cart ID-scoped rules near `#cartDrawer` at 9244 onward can outrank generic drawer/button changes.
14. `.analytics-consent` accept/reject styles around 6569–6571 do not use `.btn`, so a generic button refactor misses them.
15. Admin `.admin-shell .btn*` recipes are separate ownership. Shared changes must not accidentally revive old admin styles or override the admin control system.

Avoid overriding every `button`, every radius or every gradient. The goal is a single readable role layer, not another undocumented visual generation. Keep surface/card tokens separate from control tokens.

## Dynamic markup and state traps

| Anchor | Behavior to preserve/check |
| --- | --- |
| `footNormal()` around app.js 378–379 | Both in-stock and sold-out templates contain `I.cart`. Removing it only from the initial product render is insufficient because this helper is reused whenever a quantity returns to zero. |
| `footCart()` around 382–389 | Cart addition swaps the entire card footer to a quantity editor plus Remove. All new control-family styles must cover both footer modes. |
| Product detail `#pdAdd` handler around 4378 | On add, writes `I.check + ' Added'`, then after 1.2 seconds restores `I.cart + ' Add to cart'`. The reset must use the refined label too; otherwise the bag icon returns after interaction. |
| Wishlist handler around 648 | Replaces the icon and updates active class plus `aria-pressed`. Keep meaningful heart states; do not blanket-hide all nested svg. |
| Auth rendering around 740–756 | Renders tabs/forms, sets spinner and Please wait during submit, resets using textContent on error. Preserve progress feedback and disabled interaction. |
| `checkoutSummaryPanel()` around 1731 | Apply/Remove changes modifier class, label and input disabled state after coupon changes. Use stable inline-action treatment in both states. |
| Checkout rendering around 1635–1701 | Every step is re-rendered. Progress semantics and common action-row markup must be generated consistently across all three steps. |
| Empty cart rendering around 587 and 1556 | Dynamic Start Shopping markup carries its own icon and `.start-shopping` class. Include it along with normal cart actions. |
| Category rail around 4255–4258 | Selection is rebuilt after route/filter changes; retain `data-cat`/`data-railsort` and active/current attributes. Count is text, not a separate badge control. |

## Suggested reusable control contract

- Introduce role-specific control variables, without changing the existing brand palette or card/shell geometry. A normal action radius around 8–10px, compact control around 6–8px and field around 10–12px fit the existing rounded language. These are starting points for visual comparison, not a universal reset.
- Use one main-action fill based on existing deeper blue so white labels stay readable. Avoid the bright-blue gradient end as the sole contrast background.
- Normal text action: weight 600, restrained horizontal padding, useful 40–44px target. Quiet/compact actions may be visually smaller with adequate target padding. Keep coarse-pointer sizes where already present.
- Secondary actions use border/surface, quiet actions use text, destructive actions use red appropriately, selectors use a selected state, and progress uses markers/connectors. These should remain distinguishable without shadows.
- Keep essential focus-visible outlines, disabled opacity/cursor, loading spinners and accessible names. Remove decorative lift/scale without disabling focus or spinner animations indiscriminately.
- Do not blanket-remove svg: menu, close, search, cart, password visibility, wishlist, print, copy, expand, sliders, provider/channel and icon-only destructive controls need their symbols.

## Verification checklist for parent implementation

1. Capture settled before/after views for home, catalog/cards, category rail/filter drawer, product detail, cart drawer/full cart, all checkout steps, auth and contact. Wait for content to be visible; an empty reveal container is not valid evidence.
2. On a product card, Add → increase → decrease → remove → Add again. Verify the normal and in-cart footer families, label visibility, disabled limits, no icon restoration and no hover/parent-hover movement.
3. On product detail, Add → wait beyond 1.2 seconds → repeat. Check the restored text, feedback and quantity/wishlist states.
4. Move forward/back through checkout. Confirm stepper semantics and distinguishable completed/current/upcoming states; Review order should not stretch like a landing-page banner on desktop. Check narrow mobile wrapping and long Place order amount.
5. Apply/remove a coupon and test invalid/empty input. Inline action size should remain stable across re-renders.
6. Check menu, account, cart and filter overlays with keyboard and touch; keep close controls visible, focus traps/return behavior and adequate target sizes.
7. Inspect normal/hover/active/disabled/focus styles for base buttons plus the high-specificity card/drawer selectors. Verify the icon-only controls remain comprehensible.
8. Test consent choices and auth loading/error states, which use separate control families. Use safe local fixture behavior; unavailable backend must remain explicit.
9. Check 390px mobile, 768px tablet, 1366px laptop and 1920px desktop for overflow, label clipping, awkward wrapping and inconsistent control heights.
10. Confirm public CSS changes respect separately maintained admin styles. No deployment is authorized.
