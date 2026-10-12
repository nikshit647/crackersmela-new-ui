# Resumed browser verification — 5 October 2026

The linked chat was resumed in the existing workspace. The original local fixture servers had stopped; they were restarted with their saved synthetic data intact, mail disabled, and bindings restricted to loopback. Production was not deployed or published. No customer order was submitted or message sent.

## Fresh local verification

Observed through the Codex in-app browser at approximately 11:40–11:49 UTC:

- An uncached Home reload loaded 46 observed responses with **zero HTTP errors, failed requests, browser log errors, or uncaught exceptions**. The event capture was complete (`truncated: false`, `hasMore: false`). An earlier truncated capture was discarded as full-run evidence.
- Firebase 10.12.2 loaded with one initialized app; the analytics function was present; editor-only preview mode was false on the public storefront. This checks initialization, not a real Google sign-in or external analytics delivery.
- Home showed 11 category cards and 41 rendered product-card nodes, with no broken completed images or page overflow. The preview retains the 117-product public snapshot refreshed in the prior chat.
- Header search for `sparrow` returned one matching product. Adding it to Favourites displayed that exact product. Removing it restored an empty wishlist.
- Clicking the Home `60 Shots - standard` title opened its actual product detail. Add to Cart produced one item and a ₹2,800 total. Full Cart allowed checkout and the customer name, phone and delivery-address fields loaded. The test cart was cleared using the normal controls. No checkout submission occurred.

| Width | Home product columns | Category columns | Horizontal overflow |
|---|---:|---:|---|
|360|2|1|No|
|375|2|1|No|
|390|2|1|No|
|412|2|1|No|
|425|2|1|No|
|768|2|2|No|
|1024|3|2|No|
|1280|4|3|No|

These measurements describe the currently restored preview document. Prior fixture/document measurements are retained in the original report and must not replace these values. The user-required two-product mobile layout passes at all five phone widths.

## Fresh production observations

- At 1280px, the live Products page loaded its published CMS stylesheet, showed 117 product cards in four columns, had no horizontal overflow, and had no broken completed product images. This closes the earlier incomplete 1280px Products CMS-readiness check.
- A complete fresh diagnostic capture reproduced the exact production inline-script CSP error. It recorded no HTTP errors, failed requests or uncaught exceptions. The CSP violation itself remains a failure; a clean network result does not remove it.
- Live Home at 390px still rendered **four** product columns after CMS hydration. The local candidate renders two. The live source still loads the old cartfix1 runtime and remote Firebase scripts.
- Floto messages were not reproduced. Their extension provenance remains unverified; no site changes were made merely to suppress them.
- No live CMS edit was made in this resumed session. The prior authenticated inheritance probe and restoration evidence remain in `storefront-cua-verification-20261005.md`.

## Local refresh

The preview at `http://localhost:4186/?watch=1#/` refreshes after source or local public-data changes. The refresh preference now persists for the browser tab when internal links drop the `watch=1` query parameter. `watch=0` disables it. Editor draft changes continue to preserve undo history; only source changes reload the editor shell. All refresh code is restricted to isolated fixture shells and excluded from the production candidate.

This was verified on the product-detail route after its link removed the query parameter: the opt-in remained enabled, and a timestamp-only update to the isolated catalog file triggered a new page time origin while retaining the same product URL. The catalog bytes were unchanged. The homepage was restored and temporary viewport overrides were reset.

## Fresh command verification

- Combined client/console/responsive/reorder/Promo/category tests: **57/57**.
- CMS backend: **234/234**.
- Staff permissions: **183/183**, plus customer authentication integration **25/25**.
- Promo editor browser: **27/27**.
- Category editor/commerce browser: **28/28**. The old failure was a click during route scroll and card reveal animation; the corrected test waits for stable geometry and asserts the requested destination before testing the detail controls.
- Category count sync: **PASS**; a synthetic catalog member changes the baseline/rendered/filter count from 10 to 11, even with stale saved count text, while count styling and editable ordinary labels remain intact.
- ESLint: passed for the editor, candidate application, and relevant browser/unit tests.

Source and archive integrity checks are recorded in the final combined release report. The older broad security, mail, session, reorder and editor evidence remains explicitly dated in the original report; it was not all rerun in this resumed session.
