# Shop by Categories styling

The final user correction governs this change: solid blue actions, restrained cards, and stationary interactions.

The existing section uses `#shop-categories`, `.home-category-grid`, and `.home-category-card`. Each complete card is already one anchor; its arrow is a decorative span. The current grid is three columns above 980px, two columns through 601px, and one column at 600px and below. The published CMS configuration has no card/arrow overrides; the only category-section element size override belongs to the Explore label.

`visual-editor/css/category-cards.css` is a static stylesheet scoped entirely to `#shop-categories`. It uses these existing tokens:

- `--bg-inner` (`#F4FAFF`) for the solid card surface.
- `--primary-deep` (`#0D47A1`) for names and keyboard focus.
- `--ink`, `--muted`, `--font-display` (Sora), and `--font-body` (Plus Jakarta Sans).
- `--radius-sm` (12px) for card corners and `--ease` for color transitions.

The arrow is a 44px circle with solid `#1769D2`, a white 18px arrow, and solid `#1256B0` on hover/press. The entire anchor remains the keyboard/touch target. Focus uses a 3px outline with a 4px offset around the card.

Cards retain a pale solid surface, thin blue-gray border and a small natural shadow. Hover changes the border color; card, artwork, arrow and SVG transforms remain `none` in all interaction states. Only border and background colors transition over 210ms. Reduced-motion disables those transitions. Scoped resets remove background images and backdrop filters from category-owned surfaces, including the section and panel; the surrounding page is untouched.

Cards use an 88px illustration area, flexible text column and a 44px arrow column. At narrow widths the illustration area decreases to 72px, then 64px below 360px; the arrow remains 44px. Names can wrap, counts stay secondary with tabular numerals, and the established 3/2/1-column layout is preserved. Existing artwork, names, counts, product data, links and editor markup are unchanged.

The follow-up EXPLORE correction also removes the yellow background from the CMS-generated text span. The old broad eyebrow `span` rule unintentionally treated this text wrapper like its decorative separator siblings. Scoped styles now distinguish the text from the two empty `aria-hidden` separators: transparent text background, dark blue uppercase 11px/600 text, moderate 1.4px spacing, and solid `#B9CBDF` lines. The heading and subtitle remain unchanged. Local public/preview checks pass at desktop and phone sizes.

The release owner must load this stylesheet after the existing base/category styles in both the public shell and visual editor preview, then verify the actual page on desktop, tablet and mobile. No JavaScript initialization is needed, so these styles apply before first paint.
