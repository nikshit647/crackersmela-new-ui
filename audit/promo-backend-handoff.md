# Promo Bar CMS validation

Implemented only in `visual-editor/cm-cms.php` and its exact production-candidate mirror. No API, authentication, session, storage or commerce implementation was changed for this follow-up.

Only a `native` section whose `source` is `global:promo` may contain shared `content.promoMessages` or `content.showPromoIcons`. Messages are an ordered list of at most 20 entries with unique valid `id`, required plain `text` of at most 300 UTF-8 bytes, optional boolean `enabled` (default true), and optional `icon` (default auto). Supported icons are auto, tag, truck, shield, cash, bolt and none. Explicit null values and unsupported properties are rejected. An empty list remains an explicit empty list; omission stays omitted so the runtime can use its original STORE.promo fallback.

`showPromoIcons` is a boolean allowed in the Promo Bar's shared content and exact-device content overrides. It is rejected on other native sources, other section types and element overrides. `promoMessages` is rejected in every device override because message/order content is shared. Existing validated style/effect overrides provide the visual controls.

The first real HTTP regression failed because the pre-change CMS rejected Promo content. After implementation, `python tests/cms-backend-test.py` passes 234/234: 203 existing cases plus 31 Promo cases covering defaults, order, independent overrides, private drafts, reload, publication, intentional empty content, missing legacy content, all supported icons and 19 invalid payloads. Rejected payloads leave saved draft/version unchanged, and the complete suite confirms commerce stores are byte-identical.

`audit/cms-promo-backend-results.json` records the 31 Promo checks and schema SHA-256; both source mirrors match and PHP diagnostics are absent. PHP 8.3.35 lint passes on both copies. A fresh `tests/staff-permissions-test.py` run passes 183/183 plus the unchanged customer integration 25/25 after this validation change.

Browser UI/rendering, marquee behavior, viewport checks and any live publication belong to the Promo integration agent/root. This work used only isolated synthetic fixture publication and made no production request.
