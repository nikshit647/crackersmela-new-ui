# Storefront browser verification — 5 October 2026

Observed through the Codex in-app browser at approximately 03:40–03:58 UTC. Production was not deployed or published. Test cart entries were removed through normal controls; no real order was submitted.

## Responsive layouts

Fresh navigation/reload waited for `#cm-published-styles` before recording geometry. Inspecting the native grid before CMS hydration hides the production Home regression.

| Width | Live Home columns | Live Products columns | Local Home columns | Local Products columns |
|---|---:|---:|---:|---:|
|360|4|2|2|2|
|375|4|2|2|2|
|390|4|2|2|2|
|412|4|2|2|2|
|425|4|2|2|2|
|768|4|4|4|2|
|1024|4|4|4|2|
|1280|4|4*|4|4|

No horizontal page overflow at any measured width. No failed loaded product images in the measured grids, except that image completion was not recorded on the final live 1280 Products fallback. Some live newest-product records contain placeholders rather than product photographs; those are data omissions, not broken image requests.

*The final live Products reload exceeded the browser's CMS-readiness wait. Its native four-column layout was inspected, but that final sample is not evidence of CMS application. The later network buffer was truncated and cannot establish the reason. Earlier network/CSP evidence remains in the console report.

Local test origin: `http://localhost:4186`, isolated fixture seeded with the public Home CMS document. Its catalog is an older local snapshot; local and live item counts may differ.

## Commerce interactions

- Live Home: added SPARROW and TWINKLING STAR; two product quantity controls and badge 2 persisted after reload.
- Live cart: subtotal/total ₹140; increasing the ₹20 product gave ₹160; decreasing restored ₹140; removal gave ₹120. Checkout was disabled below ₹2,500.
- Live full cart above the minimum opened Checkout, with name, phone, delivery address, and separate billing fields after toggling the same-address option.
- Live product Add/card/cart verified at 360, 375, 390, 412, 425, 768 and 1024. At 1280 Add/card/badge verified; the earlier full-cart checkout test also used desktop layout.
- Local product Add/card/cart verified at all eight sizes. Three products persisted after reload with badge 3 and three quantity controls.
- Local quantity test: ₹1,225 → ₹1,800 after adding one ₹575 unit → ₹1,225 after decrement → ₹650 after removal. Checkout displayed name, phone and address fields above the minimum.
- Keyboard activation was used for the complete interaction matrix. Pointer activation also succeeded at 360, 375 and 390; this is not a complete physical-touch-device test.
- Checkout was inspected without submitting an order. Backend test coverage is documented separately.

## Live editor probe

The authenticated live editor became available. With the saved Home draft and Desktop selected, category-section height was originally Auto. Setting it to 360 changed Tablet and Mobile fields to 360 and computed `min-height` to `360px` on both. This reproduces the live inheritance defect fixed in the local candidate.

One Undo restored Auto and computed `min-height: 0px`. Save became disabled; saved/published timestamps remained 4 October, 11:54 pm. Nothing was published. This live probe covers section height, not every responsive property. The broader property matrix, save/reload and published isolation were exercised in the isolated editor suites.

## Local preview

`http://localhost:4186/?watch=1#/` is visible and reloads on candidate/overlay saves. A temporary CSS comment changed the page time origin automatically; restoring the exact original bytes triggered another refresh. The watcher is local-only and injects its refresh script only into fixture shells. It does not alter production CSP or publish anything.

## Limits

Local fixes do not change the deployed site. Live Home mobile layout and Desktop-to-other-device inheritance remain failing until a verified release is deployed. Earlier evidence identifies the live inline CSP error. Full invoice PDF rendering, physical-device touch coverage and extension provenance remain outside the completed checks.
