# CrackersMela local UI preview

**PREVIEW ONLY — the deployed PHP backend source is missing.** This harness shows the recovered current storefront and admin design for local review. It is not a replacement backend, a production build, or evidence that production security issues have been fixed.

Start both local sites from the workspace root with Node.js 20.19+, 22.13+, or 24+ (Node 24.19.0 was used for validation):

```powershell
npm run preview
```

- Storefront: <http://localhost:4173/>
- Admin UI preview: <http://localhost:4174/#/staff>

Both servers bind only to `127.0.0.1`. No dependency installation, database, production account, or secret is needed. Stop the process with Ctrl+C.

## What this preview supports

- Viewing the storefront and admin layouts, navigation, product display, search, filters, cart interactions, responsive behavior, and locally available frontend controls.
- Reading the public catalog snapshots in `fixtures/products.json` and `fixtures/catalog.json`. They are snapshots, not a connection to current production state.
- A clearly labeled admin display identity, `Local review admin` (`review@example.test`), injected only on the local admin port. This fixture is **not authentication** and does not verify real account permissions. It grants no production access.
- A separate local browser-storage origin for each port. Any local browser-state changes do not represent saved server changes.

The admin preview intercepts the specific save/delete/status/price/stock/featured, coupon, maintenance, image-upload, POS-submit/held-bill, and notification-write controls found in the recovered source. These controls are labeled `Unavailable: production backend source required`; attempting them displays that nothing was saved. Product form drafts, search, filters, opening edit dialogs, navigation, theme changes, POS draft calculations, printing, and local exports remain available. This UI guard is only a preview affordance, not an authorization mechanism.

## Unavailable and deliberately blocked

The harness returns HTTP 503 with `PREVIEW_BACKEND_UNAVAILABLE` for all mutation methods, all order/email/upload/analytics endpoints, and all other PHP endpoints. Catalog endpoints allow only read requests (`GET`/`HEAD`, with `a=pull` or no action). A GET that asks a catalog endpoint to push is also blocked.

Checkout completion, real orders, account login and registration, password reset, customer data, saved admin CRUD, image uploads/deletions, delivery email, analytics, synchronization, payment processing, and server-side authorization cannot be validated here. No request is proxied to production and no successful save is fabricated.

The rendered page removes external script tags and sends a Content Security Policy restricting scripts, API connections, and forms to this local origin. Google Fonts styles and font files are the only permitted remote resources. Product images must be local, data URLs, or blobs. Firebase and production analytics connections are blocked. Ordinary external links such as WhatsApp remain links; they should only be followed intentionally.

## Review checklist

1. Compare branding, colors, layout, menus, category navigation, and product cards with the existing website.
2. Try search, category filters, sort controls, product details, cart quantity changes, empty states, and keyboard navigation.
3. Inspect desktop, laptop, tablet, and mobile widths. Check drawers, forms, tables, sticky controls, text wrapping, and horizontal overflow.
4. Inspect the admin navigation and available management forms using the labeled local review identity. Treat unsaved changes and unavailable operations as expected preview limitations.
5. Confirm that an attempted backend operation clearly reports it cannot be completed. Do not treat a visual admin session or a local-state change as evidence that authorization or persistence works.

## Verification status

The harness syntax check (`npm run check:preview`) passed. With both preview servers running, run `npm run test:preview` (or `node --test tests/preview-server.test.mjs`). Sixty automated HTTP checks passed across both ports, covering the injected preview identity, blocked external scripts, security headers, read-only fixtures, rejected mutation requests, blocked backend endpoints, encoded traversal and hidden/config paths, hostile Host headers, JavaScript MIME type, and HEAD responses. The machine-readable report is saved to `audit/test-preview.json`. These checks concern this local HTTP harness only; they do not test browser interactions or backend security. Frontend QA results belong in the main audit report.

**Production backend security: not verified. Production authentication: not verified. Production checkout/admin persistence: not verified. Deployment: not performed.** Full remediation and end-to-end testing require the actual deployed PHP source and an isolated test backend.

The final combined audit is in `../AUDIT_REPORT.md`. Final checks: lint and JavaScript syntax passed, 109 automated tests passed, 20 route smoke checks passed, and five isolated user-flow checks passed. Re-run browser checks with `powershell -NoProfile -File tests/browser-smoke.ps1` and `powershell -NoProfile -File tests/browser-flow-smoke.ps1` from the workspace root. They use only local origins and synthetic data. Private order/account data remains in page memory; legacy private caches are discarded, and order history requires the missing authenticated backend.
