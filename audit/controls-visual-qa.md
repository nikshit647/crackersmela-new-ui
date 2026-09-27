# Control refinement: visual and interaction verification

Scope: the recovered local public/admin UI at ports 4173 and 4174. No deployment or production write was performed. The admin identity is a preview fixture; real backend authorization, persistence, uploads, and order completion remain outside this UI verification.

## Evidence

- 12 matched before/after areas: home, catalog, product, cart, checkout details/payment/review, mobile catalog/filter drawer, admin dashboard/products/edit dialog.
- 45 final after screenshots in `audit-evidence/controls-after/`, including 1920×1080 desktop, 1366×900 laptop, 768×1024 tablet, 390×844 mobile, homepage collection controls, admin add/settings/POS, and reduced-motion views.
- The full after set was refreshed after the final control, category chip, and product badge changes. `mobile-admin-pos-bill.png` was subsequently refreshed with a synthetic two-item draft after scrolling the action above the tab bar.
- Each capture has viewport/route/computed-style data in `observations.json`. The original reduced-motion failure is preserved as `controls-before/reduced-motion-hidden-checkout.png`.

## Measured differences

| Control, at 1366×900 | Before | After |
|---|---|---|
| Add to cart | 161×48 px; 999 px radius; blue gradient; three shadows; weight 700 | 109×48 px; 8 px radius; solid brand blue; no shadow; weight 600 |
| Review order | 652×64 px; 999 px radius; blue gradient; three shadows; weight 700 | 176×46 px; 8 px radius; solid brand blue; no shadow; weight 600 |
| All Categories | Filled gradient capsule with count | Underlined category navigation with quiet count |
| Checkout progress | Full filled capsules resembling buttons | Ordered steps, numbered circles and connectors, one `aria-current="step"` |

No control in the sampled matched view inventories retains a gradient background. The inventory includes buttons, styled action links, inputs, selects, textareas, and tabs at the viewport's vertical position; it is not a count of every decorative surface in the application. Small floating support controls retain their subdued elevation. White primary-action text against `#1565c0` has a 5.75:1 contrast ratio.

## Defects found during visual QA

| Defect | Cause | Resolution and verification |
|---|---|---|
| Reduced-motion users saw invisible catalog/checkout content | Reveal setup returned while CSS kept sections at opacity 0 | Root corrected reveal handling and reduced-motion styles. Final catalog and payment screenshots display content with reduced motion enabled. |
| Giant lock icon in cart summary | Unconstrained inline SVG inherited excessive dimensions | Root replaced the note with accurate pay-on-delivery text; cart screenshot checked. |
| Product description printed literal `\\r\\n` | Imported text retained escaped line breaks | Root normalized display text; product screenshot shows separate lines. |
| Local POS bottom tabs extended below the viewport | Injected preview notice consumed height above 100dvh containers | `review/server.mjs` now measures notice height with ResizeObserver and scopes viewport compensation to local POS. Mobile tabs end exactly at viewport bottom, including after the guard message changes. |
| Mobile POS Generate Bill overlapped the tab bar | Bill contents exceeded its available height | Admin agent enabled internal bill-panel scrolling. Synthetic two-item draft verified with Generate Bill ending 12 px above the tabs. |

## Results

- All 45 final viewport samples had document width equal to viewport width: no horizontal page overflow.
- Admin edit dialogs fit tablet/mobile screens; close/cancel/save areas remain reachable.
- Desktop/tablet/mobile product, cart and checkout content retained the existing layout and brand treatment.
- 10 automated control-interaction checks passed: quiet primary hover; visible keyboard focus; non-button checkout progress; keyboard payment choice; review/back state retention; POS quantity/payment draft; mobile action/tab separation; notice-resize compensation after a blocked save; canceling an admin edit without changing the catalog.
- No uncaught browser errors were recorded in the screenshot or interaction runs.
- 60 preview HTTP boundary/guard tests passed after the preview layout change.

Repeatable scripts: `tests/controls-visual-qa.ps1 -Phase after` and `tests/controls-interaction-qa.ps1`. Structured results are in `audit/controls-interactions.json` and `audit/controls-style-comparison.json`.

Preview processes remain available at `http://localhost:4173/` and `http://localhost:4174/#/staff` (process session 31692). The preview cannot save backend changes. No real customer information was entered.
