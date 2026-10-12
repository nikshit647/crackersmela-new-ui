# Follow-up requests — 5 October 2026

User explicitly requested these after the original roles/editor/regression work.

1. **Promo Bar contextual editor.** Specification: `C:/Users/Nikshit Garje/.codex/attachments/5ea2cb33-96b4-4b1c-87d6-a9dac6934e3c/Pasted text.txt`. Integrate existing real promo bar with individual message edit/add/delete/reorder/duplicate/enable, simple styling/icons, exact-device overrides, live preview and current CMS save/publish. No header rebuild or duplicate data source. Test browser and storefront regression.
2. **Shop by Categories redesign.** Specification: `C:/Users/Nikshit Garje/.codex/attachments/18a3f3c8-31f8-448d-bbc3-a99746a764bc/Pasted text.txt`. Create eleven cohesive custom lightweight SVG firework-product illustrations (blue with restrained accents), refined horizontal cards and blue/white CTA, 150–250ms motion with reduced-motion respect. Preserve all category IDs/routes/dynamic counts/filtering and CMS compatibility. Test every category and all requested widths.

Both screenshots were supplied and inspected in the chat. Do not start these changes until the original work has completed its implementation and regression cycle; keep live-authentication limitations explicit.

## Completion update — resumed 5 October 2026

The original work completed its local implementation/review cycle before these follow-ups began. Both follow-ups are now implemented in the production candidate and verified locally. Promo browser checks pass 27/27; category editor/commerce checks pass 28/28; dynamic category-count synchronization passes. The stale product-detail failure was an automated click during scroll/reveal animation and is corrected in the test without changing commerce code.

See `audit/combined-release-report.md`, `audit/resumed-browser-verification-20261005.md`, and `audit/combined-review-package.json` for the integrated package, fresh evidence and remaining production verification limits. Nothing has been deployed or published to production.

## Follow-ups — 6 October 2026

1. **Category order and mobile navigation.** Brief: `C:/Users/Nikshit Garje/.codex/attachments/13972e49-9d2a-497c-b21b-627ddfcd29ff/Pasted text.txt`. Continue from chat `01a10bd7-5959-7b63-93fd-c1be4c4afbe9`; add direct canvas category reordering through existing CMS draft/preview/publish, and refine the native mobile category rail. Implementation and verification in progress in the existing production candidate.
2. **Customer order email itemization.** User explicitly requested this **after** category work. Brief: `C:/Users/Nikshit Garje/.codex/attachments/761e5133-ad1a-4f63-b468-7a505b62ff1c/Pasted text.txt`. Keep existing email design and workflow; add stored-order item names, quantities, unit prices, line totals, subtotal, applicable discount/shipping and exact stored total to relevant customer order emails. Use historical order snapshots, escape HTML, preserve tracking/invoice links, generate and visually review desktop/mobile test emails without sending real mail. Pending completion of category verification.
