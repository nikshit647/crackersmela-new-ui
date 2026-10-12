# Crackers Mela visual editor

## Inspected architecture

The integration target is `audit-evidence/production-release`, the recovered and subsequently repaired production application. It is a vanilla JavaScript SPA (`js/app.js`, `index.html`) served by PHP/OpenLiteSpeed. Public and admin hosts share source; hostname routing selects the admin dashboard. The isolated `review/public` app is not deployable. Existing unpublished changes are preserved.

Commerce uses private JSON files through `cm-security.php` and `cm-commerce.php`, not a SQL database. Staff authentication, CSRF, session expiry, product overrides, catalog pricing, checkout, order ownership, SMTP event queues, and mPDF invoice generation already exist. Media uploads use the authenticated raster-only `upload-api.php` and `/uploads`. These services remain authoritative.

Existing editable routes: Home, Products, product detail templates, Price list, About, Contact, FAQ, Wholesale, Shipping, Returns, Safety, Terms and Privacy. Categories and offers are existing filtered product views, not invented standalone pages. Cart, checkout, account, tracking and order routes remain application workflows rather than editable content templates.

## Implementation sequence

1. Establish baseline tests and inspect current live public assets; retain the current production candidate and never regenerate it from the older UI-review scripts.
2. Add authenticated CMS endpoints using the current PHP helpers, private drafts/published documents, optimistic concurrency, bounded revisions, and existing media roots.
3. Instrument the real storefront renderer with stable section/element identities. Capture its current content as typed data. Apply published overrides without replacing commerce components or persisting raw HTML.
4. Build an authenticated `/visual-editor` shell with a same-origin preview of that exact storefront. Use origin/source-checked messages for selection, immediate edits and section operations. Keep editor-only code out of normal visitor loads.
5. Add contextual properties, responsive styles, product references, existing media browsing/upload/crop, SEO, undo/redo, autosave, drafts, preview, publish confirmation and revision restore.
6. Validate backend authorization/input boundaries, draft isolation/concurrent saves, public publishing, browser editing, responsive layouts, and preserved storefront/account/commerce/email behavior using isolated local data. Build a deterministic deployable overlay and document rollback.
7. Verify current hosting access and source parity before any deployment. Deploy only after required checks pass, then verify real published content on both domains. Local tests do not establish production deployment or delivery.

## Design

Use the site's Sora headings and Inter utility text, existing blue identity and neutral admin surfaces: ink `#172B4D`, muted `#52647B`, canvas `#E9EEF5`, paper `#FFFFFF`, primary `#1565C0`, selection `#2196F3`. Pages, Elements, Uploads and Sections sit beside a large storefront canvas. A horizontal context toolbar above the canvas follows the selected text, image, button or section; an advanced panel is optional. Text edits in place, and added elements support bounded movement, resizing, snapping and nested containers. The selection breadcrumb and responsive viewport are the main visual cues. The skill search returned unrelated presentation/education recommendations; this design uses the inspected application's tokens and general accessibility guidance instead.

## Shared content contract (version 1)

`{schemaVersion:1, id, templatePage?, sections:[], seo:{}, design:{}, productOrders?}`.

Sections: `{id,type,source?,region?,name,hidden,content:{},elements:{},styles:{desktop:{},tablet:{},mobile:{}},hover:{},animation:{}}`. Types include `native`, `text`, `heading`, `image`, `button`, `video`, `divider`, `icon`, `container`, `banner`, `productGrid`, `faq`, `hero`, `imageText`, `features`, `testimonials`, `contact`, and `custom`. Region defaults to `main`; original header/footer retain their regions. Native `source` references a stable current template section, never stored HTML. Element keys are stable generated IDs, with `{kind,name,text?,src?,alt?,href?,newTab?,hidden?,styles?,hover?,animation?}`. Kinds: `text`, `heading`, `image`, `button`, `container`, `video`, `divider`, and `icon`. Added elements keep an explicit parent ID; visual position and gradients are device-specific effects.

Section content uses typed optional fields: `heading`, `text`, `src`, `alt`, `href`, `buttonText`, `newTab`, `items:[{question,answer}]`, and product options `productIds`, `category`, `limit`, `columns`, `cardStyle`, `imageRatio`, `showPrice`, `showSalePrice`, `showCart`, `showBadge`, `sort`. Product IDs reference the existing catalog. No product record is copied into CMS storage.

Responsive style properties: `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`, `textAlign`, `color`, `backgroundColor`, `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft`, `marginTop`, `marginRight`, `marginBottom`, `marginLeft`, `width`, `maxWidth`, `minHeight`, `height`, `borderRadius`, `borderWidth`, `borderColor`, `borderStyle`, `boxShadow`, `display`, `gap`, `gridTemplateColumns`, `flexDirection`, `alignItems`, `justifyContent`, `objectFit`, `objectPosition`, `opacity`. Values are allowlisted; raw CSS/HTML/JS and CSS URLs are rejected. Hover supports the same safe style properties. Animation: `{type:'none'|'fade'|'slide'|'scale',duration,delay,easing}`. SEO: `title`, `description`, `canonical`, `ogTitle`, `ogDescription`, `ogImage`, `robots`. Design: `primary`, `text`, `background`, `fontFamily`, `headingFont`, `radius`, `containerWidth`.

API: `cms-api.php?a=pages` (staff), `?a=load&page=home` (staff), `?a=published&page=home` (public published only), `?a=revisions&page=home` (staff). POST `?a=save|publish|restore` with `{page,expectedVersion,document? ,revision?}` and the existing CSRF header. Load/save/publish/restore return `{ok,page,version,draft,published,savedAt,publishedAt}`. Pages returns `{ok,pages:[{id,name,hash,path}],csrfToken}`. Revisions returns `{ok,revisions:[{id,at,kind}]}`. A stale version returns 409; restore changes the draft, never auto-publishes.

Media: `cms-media.php?a=list&q=...` returns `{ok,items:[{url,name,alt,width,height,bytes,canDelete}],...}`; POST `?a=update|delete` with `{url,alt}` uses staff+CSRF. Existing upload route is reused. Referenced product/site/CMS images cannot be deleted. Product selector data: `cms-api.php?a=products` returns canonical product summaries, not a second product store.

## Product display ordering

The current product-reordering work is local only. It does not deploy files or write to the production catalog. Reordering stays inside the existing visual editor and uses the real product cards; it has no separate product-management page or table.

Products documents may include an optional `productOrders` object:

```json
{
  "productOrders": {
    "all": [104, 23, 78],
    "rockets": [61, 59, 60],
    "sparklers": []
  }
}
```

The numbers above illustrate the shape; actual saved values must be existing product IDs in the specified category. `all` is the independent All Products order. Every other key must exactly match a category ID from the existing catalog. A category never inherits the All Products order. An omitted or empty list keeps that scope's normal order. Product ordering belongs to Products or Home templates, including independent custom pages duplicated from those templates. Home grids use `section:<section id>` keys in this same `productOrders` map; each section has an independent order, and the original Products category scopes are unchanged.

Each scope contains unique positive numeric safe-integer IDs, with at most 5,000 IDs per scope and 50,000 across the document. The server rejects unknown scope names, duplicate IDs, product-record objects, unknown or disabled products, and products outside the requested category. It stores only display references: product names, prices, stock, images, descriptions, SKUs, IDs and category memberships remain in the existing product/catalog stores.

Ordering uses the existing versioned `save`, `publish`, `load`, and `restore` endpoints. Dragging changes the editor document and shows Unsaved changes. Save (or the existing autosave) persists a private draft; publishing copies that draft to the public document. The public endpoint exposes only published ordering. Restoring a revision changes the draft only. Existing staff authentication, session CSRF tokens, same-origin validation, POST requirements, request limits, atomic private-file writes and optimistic version checks apply to ordering without a separate API path. Tests verify these boundaries and confirm the commerce stores remain byte-identical.

`cms-api.php?a=products` is the authenticated merged catalog used for validation in the editor. Its response is `{ok, products:[{id,name,shortName,image,price,category,cats}], categories:[{id,name}]}`; `category` is the primary category and `cats` contains all memberships. Disabled products are omitted. The public `products-api.php?a=pull` instead returns `{ok,extraProducts,productOverrides,settings,rev}`, while `catalog-api.php?a=pull` returns `{ok,priceOverrides,stockOverrides,featOn}`. Those endpoints must not receive writes from reordering.

Catalog changes can make an older order stale. Rendering must ignore IDs that are no longer eligible and append new eligible products in their existing order. A newly saved or restored document is checked against current membership, so obsolete IDs must be removed using a fresh catalog before saving. A changed catalog must never cause cards to be duplicated or their product data to be copied into the CMS.

PHP response/storage serialization and the editor model preserve `productOrders` as an object, including an empty `{}`. Its per-scope lists remain arrays, including empty `[]`. Clone/fingerprint normalization also repairs legacy empty-map arrays so save detection and undo/redo preserve changes after loading a draft. The backend regression suite exercises category isolation, draft/public separation, stale-write rejection, invalid input, restored ordering, and unchanged commerce records.

`tests/cms-product-order-runtime-test.mjs` executes the shipped runtime with isolated product objects and a minimal card DOM. It checks independent scopes, preserved customer-selected sorting/filtering, missing/new product behavior, draft versus published lookup, stable card identities and cart handlers, repeated-apply stability, optional visible-card cutoffs, and clearing an order. These focused tests complement browser/touch testing; they do not claim to validate pointer geometry or visual appearance.

Preview protocol: all messages use `{channel:'cm-editor',type,...}` and exact origin/source validation. Preview sends `ready` with `{page,document}` from the current template, `select` with `{sectionId,elementId}`, and `navigate` only for editor-controlled pages. Parent sends `apply` with `{document}`, `select` with IDs, and `mode` with `{interactive:boolean}`. `interactive:true` means visitor-like preview; editor selection is otherwise active.


## Exact-device presentation (2026-10-05)

Existing `styles`, `effects`, `content`, `hidden`, `hover` and `animation` remain the saved responsive base. Their legacy Desktop → Tablet → Mobile cascade is preserved exactly. New edits are written to an optional item-level `overrides` map, for sections and elements:

```json
{"overrides":{"desktop":{"styles":{"fontSize":"48px"}},"tablet":{"styles":{"fontSize":"32px"}},"mobile":{"hidden":true,"content":{"columns":2}}}}
```

Each device override supports allowlisted `styles`, `effects`, `hidden`, `hover`, `animation`, and product-presentation `content`. Presentation content is limited to `columns`, `cardStyle`, `imageRatio`, `showPrice`, `showSalePrice`, `showCart` and `showBadge`. Text, image source files, links, product selection, section additions/deletions and section ordering remain shared content; the UI labels this distinction. Image dimensions, fitting, focal point, visual position and opacity are device-specific.

The single helper `js/cms-responsive.js` resolves the saved base plus only the active device's override. The editor imports it through the model; preview and public pages load it before `cms-runtime.js`. The runtime emits disjoint device queries for overrides and does not snapshot computed native CSS. Consequently, changing Desktop or Tablet cannot change an inherited value on another device. Resetting a device removes that device's override and reveals its original saved base and native stylesheet. Undo, drafts, revisions, publishing and reload keep the full structure. The four existing editor panels remain in place, with an explicit Editing Desktop/Tablet/Mobile indicator.

Home reuses the existing numbered-card reorder mode, pointer gestures, keyboard/touch controls, document map and save/publish API. Runtime sorting moves existing card nodes, preserves their identity and handlers, and reapplies the existing Home category filter and visible-card cutoff. Deleted sections remove their order reference; duplicated sections get their own copied order. Reordering never writes to products/catalog endpoints.

Private CMS API, editor, preview and CMS media require `website.manage`; published reads remain public. Product upload permissions are separately managed by the commerce backend. Anonymous editor requests keep the sign-in screen, and authenticated accounts without website permission receive 403.

Verification: `node --test tests/cms-responsive.test.mjs tests/cms-product-order-runtime-test.mjs`; `python tests/cms-backend-test.py`; isolated `tests/cms-responsive-browser-test.mjs`, `tests/cms-product-reorder-browser-test.mjs`, and `tests/cms-canva-browser-test.mjs` (set `CM_CMS_FIXTURE` to a synthetic fixture manifest). Browser tests never point at production or send real mail.


Legacy native Home product sections also retain the storefront's two-column mobile default when old documents contain a captured Desktop `content.columns` value. Only an explicit `overrides.mobile.content.columns` changes Mobile columns. This matches the native Products-grid rule and fixes the narrow four-column Home regression without overriding deliberate Mobile edits. `tests/cms-home-grid-browser-test.mjs` verifies fresh loads at 360, 375, 390, 412 and 425 pixels, Desktop four columns, an explicit Mobile three-column setting, and resetting that override. Fresh loads matter because native baseline values are captured at the initial viewport.
