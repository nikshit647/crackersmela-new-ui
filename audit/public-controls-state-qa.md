# Public control state QA

Local only: `http://localhost:4173/?qa=public-controls-20260927`. Browser session: `cm-controls-public`. No application-source edits, messages, account creation, payment or order submissions.

## Findings and fix verification

1. **Header icon specificity (Low, visual) — FIXED / VERIFIED:** Initial `#cartBtn` and `#userIconBtn` used radius 50%, a white/blue linear gradient and five inset/outer shadows. After the parent fix and fresh reload, cart/menu/search buttons compute 8px, no gradient or shadow.
2. **Sort affordance (Low, usability) — FIXED / VERIFIED:** The initial new `.sort-select` styling removed its SVG chevron while leaving `appearance:none`. Parent restored `appearance:auto`; fresh reload confirms the native select indicator and combobox semantics.
3. **Cart close exception (Low, visual consistency) — FIXED / VERIFIED:** Initial `#cartDrawer .drawer__close` used radius 999px and an old shadow. Parent corrected close to 44×44 with radius 8px, delete to 44×44 with radius 6px, both without shadow. Original evidence: `audit-evidence/controls-public-drawer-qa.png`.
4. **Homepage collection specificity (Medium, requested visual scope) — FIXED / VERIFIED:** `.chip-row .chip` initially retained radius 999px, weight 700, layered gradient/glow and active hover `translateY(-2px)`. Parent corrected the ID-scoped recipe. Final fresh load: inactive weight 500, active weight 600, radius 6px, height 44px, no gradient/shadow/transform even on active hover; `aria-pressed` updates correctly. Original evidence: `audit-evidence/controls-public-chips-residual.png`.
5. **Floating support/top controls (Low, visual) — FIXED / VERIFIED:** `.fab-wa` and `.fab-up` initially retained gradients and `0 24px 70px rgba(13,71,161,.18)` shadows. Final fresh load: solid fills, radius 12px, restrained `0 3px 10px rgba(18,43,72,.14)` shadow, no hover transform or filter. Their meaningful channel/navigation icons remain.
6. **Password toggle state label (Low, accessibility) — FIXED / VERIFIED:** Initial accessible name stayed Show password when the input was visible. Final fresh load toggles correctly between Hide password/text and Show password/password. Tested with local placeholder text only; no sign-in request was submitted.
7. **Section navigation pill (Low, visual hierarchy) — FIXED / VERIFIED:** `.section__link` (View all) initially retained a 48px-high capsule, weight 700 and two shadows. Final fresh load: radius 6px, height 36px, weight 500, no gradient/shadow/transform; it now reads as quiet section navigation.

All seven reported residual findings were fixed by the parent task and rechecked locally. No unresolved blocker was found in this assigned public-control state scope.

## Checks completed

- Catalog, 1264px wide: no document horizontal overflow. Product Add button has 8px radius, weight 600, no gradient, shadow, transform or cart icon. Sold-out state is muted and disabled.
- Card Add → quantity 1 → increase to 2 → Remove → Add again succeeds. Product footers switch correctly between Add and quantity/remove states.
- Card quantity controls have no gradient, glow or scale; plus/minus remain identifiable. Remove uses quiet red styling with a meaningful trash icon.
- Cart drawer at a subtotal below minimum: Checkout correctly disabled, gray, 8px radius and no shadow; View Full Cart and Shop More are restrained secondary actions. Tab stays in the drawer and focus shows a visible 2px outline; Escape closes it.
- Sign-in modal opens from Account. Login/Register mode switching works. Blank login is blocked by validation; no authentication request was intentionally submitted. Active/inactive auth tabs, provider action and submit button use distinct states without gradient/shadow. Google identity icon remains.
- Contact at 390×844: no horizontal overflow; Send message is text-only, 44px high with 8px radius; WhatsApp retains its useful channel icon. No message submitted.
- Product detail at 390×844: Add feedback restores to text-only Add to cart after 1.2 seconds, without a cart icon or old gradient/shadow. Quantity increments and additions work. No document overflow.
- Checkout at 390×844: entered controlled test details, moved Details → Payment → Review → Payment → Details → Payment. Details and the selected UPI payment persist; Space activates the focused payment radio. Ordered-list stepper exposes current/completed states and `aria-current=step`. Back/Place order are 44px high without gradient/shadow; no document overflow. Place order was never pressed.
- Invalid coupon shows Invalid coupon code with the compact inline action retained. No valid-coupon success state was available from visible local UI data.
- Cart checkout hover: enabled and disabled states retain `transform:none`, `filter:none`, no gradient or shadow. Disabled uses an opaque gray surface rather than misleading hover emphasis.
- Tablet 768×1024 category navigation: Gift Boxes updates the heading, result set, active category and filter count. Selected category has radius 0, no gradient/glow, and 44px target height. Sold-out buttons remain disabled without hover transformation.
- Tablet filter drawer: visible controls, keyboard focus remains inside with a 2px outline; Escape closes it. No document overflow.
- Mobile search: opens/closes with no document overflow; field is 10px radius and no gradient/shadow. Its close icon is 28×28, a possible future target-size improvement but not part of the repeated CTA recipe.
- Browser error/console checks after the main interaction pass were empty. A QA-only evaluation queried the old `.stepper` selector after it had been renamed and failed; this was an inspection error, not an application runtime error.
- Final wishlist check uses an actually visible card after the collection filter: `aria-pressed=true`, `.active`, subtle selected fill, no gradient/shadow/transform. Hidden filtered cards remain in the DOM, so style inspection must exclude zero-size elements.
- Final homepage checks at 1366×768 and 390×844: no document overflow. Final browser error and console output were empty. Resource timing on the local homepage showed successful 200 responses from the fixture catalog/products endpoints.

## Limits

- Authenticated customer account state and successful auth require the missing backend; only logged-out modal behavior can be verified with the supplied preview.
- Consent is intentionally absent in the local fixture preview, as confirmed by the parent task. Browser-state validation of consent is unavailable here; its styles are covered by source inspection.
- The parent owns the complete matched before/after screenshot set and application fixes; this pass only captures focused residual issues.

Final fresh-load marker: `?qa=public-controls-final5`. The isolated browser session was closed after the verification pass.
