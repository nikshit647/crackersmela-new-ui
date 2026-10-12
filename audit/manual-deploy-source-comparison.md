# Manual deployment: frontend source comparison

Checked at **2026-09-28T02:37:01.222Z**. Scope: normal GET requests for both homepages and their public CSS, JavaScript and logo. No credentials, SSH, account/order reads or production writes were used.

## Result

Both domains serve the same frontend. All **18 HTML/asset requests returned 200**. The live `index.html`, `js/app.js`, `js/products-data.js`, and accessibility file are exact matches for `audit-evidence/production-release`. The real API-integrated client has shipped; the disabled preview authentication code has not.

The live client contains same-origin staff/customer authentication, CSRF request headers, server-derived identity, canonical order submission and idempotency identifiers. The preview-disable markers `authUnavailable`, `CM_PREVIEW`, `CM_SYNC_KEY`, and `OWNER_EMAIL` are absent. The downloaded app passes `node --check`. These are client-source observations and do not establish that the corresponding PHP server code is installed or enforced.

## Logo and CSS

The live logo artwork exactly matches `review/public/images/logo.png`. Live `css/styles.css` exactly matches the reviewed preview CSS and differs from the current candidate base stylesheet. The differences are navbar padding, gaps, mobile alignment and base logo sizing. The late-loaded `brand-overrides.css` matches the candidate and specifies **272.25px desktop**, and **min(40.1vw, 178px) at mobile widths**. Thus the larger 302.5px/220px values in the candidate base stylesheet are overridden even in that candidate. The screenshot/visual check should determine the desired final appearance; this comparison cannot substantiate an exact percentage increase from the historical UI.

## Remaining findings

- **Medium — known first-load session race is present in the deployed client.** `js/app.js:4723–4726` starts session refresh and both catalog reads concurrently. `ensureCsrf` at lines 669–673 does not share the session fetch used by `refreshSession`. With a new browser cookie jar, simultaneous session creation can leave a stale CSRF token. This is source-confirmed susceptibility; no production login was attempted or failed in this comparison.
- **Medium — expected response headers are absent from the inspected homepages.** Neither homepage sent `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, or `Strict-Transport-Security`. A CSP meta tag is present in the HTML, but it does not provide response-header-only frame protection. This observation is limited to the two normal homepage responses.
- **Informational — public logo is 653,656 bytes.** The actual PNG is 3318×664 pixels and is used at much smaller CSS widths. Optimization would be an obvious opportunity, while preserving pixels/branding. No before/after performance measurement was performed here.

## SHA-256 evidence

Hashes below are identical on both public and admin domains. “Candidate” means `audit-evidence/production-release`; “preview” means `review/public`.

| File | HTTP | Bytes | Exact local match | SHA-256 |
|---|---:|---:|---|---|
| `index.html` | 200 | 21,694 | candidate | `ac5b8086c6aa40c50daa38a47542f55350f05a9b6fe7e19d063f744e74875cf1` |
| `css/styles.css` | 200 | 352,317 | preview | `98c5ad07d0ceba12e1320b97043a0df7e5d07b93993fc2704e0eb66ee1696662` |
| `css/controls.css` | 200 | 22,172 | candidate, preview | `253b17abf243fbef7584aaa9a9f1c6444180c23dbc3a821aaed5443cad68f0ed` |
| `css/admin-controls.css` | 200 | 16,510 | candidate, preview | `b52066fbbf1d6a726431fce96b7301839adf53538ee0e1ebaeb266f8d02a86ad` |
| `css/brand-overrides.css` | 200 | 527 | candidate | `5b70ee4c36f4a7b55c507feca09d3dbfe2b8733796800a4a0b3ab0fcf6d998be` |
| `js/products-data.js` | 200 | 60,300 | candidate | `0ec38b6fbff8f7d035c0b878b332ad5c8d906944118435e29e73b260aafa3efc` |
| `js/app.js` | 200 | 300,612 | candidate | `55c2823faa6a006ada5833aba10adf5af331995155a5deba901a07a23a0dd849` |
| `js/accessibility.js` | 200 | 7,972 | candidate, preview | `cc3e0ab3027ead72c871cce2642a669f02a2f5aa3331ca0fcbe1a2d77946f3ae` |
| `images/logo.png` | 200 | 653,656 | preview | `936e9ad94ee40eb5b4f6bfe8f34ffd8378d7c5565b6be63ad42c456344c8b60e` |

Machine-readable evidence: `audit-evidence/manual-deploy-comparison/comparison.json` and `logo-comparison.json`. Downloaded public assets are retained beside those files. Exact hashes apply to the responses fetched at the timestamp above.

## Limits

This comparison does not verify PHP source, private storage, authenticated admin/customer workflows, Google sign-in, email delivery, responsive rendering, or the absence of vulnerabilities. No production mutation or authentication attempt was made.
