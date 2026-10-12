# Category count and final Promo validation cross-review

Review date: 5 October 2026. No blocking findings identified in the dynamic category-count fix or final Promo text validation. The review was read-only with respect to candidate and overlay implementation files.

The category renderer still derives each count by filtering its current selling catalogue for the original category ID. The fix introduces no data source, API call or hardcoded count. Runtime application recognizes the native `home:shop-categories` count node and restores its `original.text`, captured from that renderer, instead of trusting literal text in an older CMS document. The native element keeps its existing registration, ID, descriptor kind and styling path. Other category labels continue to use their saved editable text.

`selectionInfo.readOnlyText` is computed from the native section and actual count node. It is not persisted in or trusted from the saved CMS payload. Basic and advanced inspectors explain that counts update from the catalogue while retaining appearance controls. The preview Edit action and inline-edit entry point are guarded, as are direct inspector text changes and text operations. Existing count style, visibility and responsive processing remains in place.

## Evidence

- Reviewed `audit/category-count-sync-results.json` from the category agent's isolated real-browser regression. Before: rendered/baseline/saved count all 10. After adding one current catalogue member: baseline/rendered/listing all 11, while the saved snapshot remains 10. Deliberately saved text `999 stale items` is ignored. A count font size of 15px still applies, an ordinary category label remains editable, and the runtime read-only flag is true only for the count.
- Independently ran `node --test tests/home-categories.test.mjs tests/cms-promo.test.mjs tests/cms-responsive.test.mjs tests/cms-product-order-runtime-test.mjs`: 26/26 passed.
- Final Promo UI validation uses the same forbidden angle/control-character range as PHP and checks the 300 UTF-8 byte limit using `TextEncoder`. Validation occurs before the document-changing callback. PHP validates UTF-8 and uses `strlen` for the same byte limit. The tests accept 100 rupee characters and reject 101.
- PHP source/candidate copies remain identical at SHA-256 `3fa44e3aa6430ef95ac8ab94a00d39d0a014b93543b860510d02fa899274ce86`.

The count-specific editor guards were source reviewed. The recorded count browser regression exercises runtime count, styling, label and flag behavior; it is not an additional physical keyboard/pointer verification of every inspector control.

## Final reviewed JavaScript snapshots

Each overlay file matches its production-candidate mirror.

| Overlay file | SHA-256 |
| --- | --- |
| `visual-editor/js/cms-runtime.js` | `c279bab361d92b20fd84024778bd4b47bea38a22f9a11987ca0913fddc6350b1` |
| `visual-editor/js/visual-editor.js` | `3eeb1bb1a15bebf029d75b9925450bcff5ec09b738389b88636d7af6f2af051d` |
| `visual-editor/js/cms-preview.js` | `f70b89f28242df6faccd9f70f5e84f8650d824a5f31dda7151b7ae7bbfc7a704` |
