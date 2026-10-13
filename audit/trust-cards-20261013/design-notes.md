# Trust and service cards

The public `#why` section contains four `.why-card` elements with existing shield, lock, truck and phone SVGs in `.why-card__ic`. The live published CMS document supplies the headings and descriptions; it has no style/effect overrides for this section. The native markup has no `.glass` class, but the stylesheet included `.why-card` in two later shared glass-selector lists.

`scripts/apply-trust-cards.mjs` edits the current recovered candidate in place with exact, idempotent replacements. It preserves untouched file bytes and does not load a stale preview stylesheet.

The original Why choose cards rule block now provides:

- Solid white cards, `#DCE6F0` borders, 12px corners, 20px padding, and one minimal shadow.
- A 44px solid `#1769D2` icon box with the existing white SVG, sized to 22px.
- 16px/700 `#123B70` headings and 14px descriptions in the existing `--muted` color.
- Equal grid rows and the existing four/two/one-column breakpoints at 1080px and 560px.
- A border-color-only hover state and reduced-motion support.

The original icon gradient, card glass backgrounds, blur declarations, large shadows and hover translation were removed from that block. `.why-card` was removed from both later shared glass lists while their other selectors/declarations were retained. No appended override masks the removed declarations.

The heading's existing span remains in place, but its `grad-text` class was removed only from the Why Choose heading in candidate `js/app.js`, candidate `cm-home.php` and maintained `visual-editor/cm-home.php`. Other gradient-text uses are unchanged. The app's four trust cards also no longer carry `reveal`, so their content appears without an entrance translation. The existing published copy and all four SVG illustrations remain unchanged.

The section eyebrow now uses `why-section-tag` in those same three templates. This removes its participation in the shared `section__tag::before` gradient line. Its small uppercase text remains, with solid existing primary-deep color and moderate tracking; no decorative pseudo-line is created. The shared tag styles for other sections are untouched.

`node scripts/apply-trust-cards.mjs --check` confirms the applied state without writing. JavaScript/PHP syntax checks pass. The release owner handles actual desktop/tablet/mobile rendering, live verification and deployment of the combined changes.
