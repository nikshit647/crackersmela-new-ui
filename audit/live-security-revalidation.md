# Current production frontend security revalidation

Checked 27 September 2026 at 12:10 UTC. This pass fetched only the public `js/app.js` asset from each owned domain. Executable checks ran in isolated Node VM contexts with synthetic objects and stubbed network functions. No production login, demo credential use, order/customer collection read, upload, mutation, or injected production payload occurred. No application or deployment files were edited.

## The asset hash difference is not a security fix

Both production domains currently serve the same 296,732-byte decoded JavaScript asset, SHA-256 `3f15844d901b4be52b7471377d9b833cd9d23e741fbb0a65aebf543a86256fb0`.

The earlier local `live-app.js` is **exactly the current asset plus one trailing CRLF** (two bytes). Both contain a BOM. There is no substantive source change. Earlier line references remain valid, and the proofs below were rerun against the newly fetched code rather than merely copied from the earlier report. The smaller HTTP Content-Length is the Brotli transfer size, not the decoded source length.

**Detection correction:** the initial bounded-check report's `privilegedKeyDeclarationPresent: false` is a detector error. It checked `SYNC_KEY`; the actual declaration is `CM_SYNC_KEY`, present at line 79. The corrected check returns **true**, and the source still references it in privileged request bodies and the analytics report query. Its value is intentionally omitted.

## Confirmed current frontend findings

Locations below refer to the current production asset, which is identical across both domains.

| Severity | Finding and evidence | Root cause / required remediation |
| --- | --- | --- |
| High | Browser state controls admin identity. `currentUser` at 162 and `canSyncPush` at 947 accept a synthetic administrator account and matching arbitrary session token. An ordinary customer fails the original role check, but changing the editable account/session state passes it. | Roles and identity come from browser storage. Replace this authority with server-verified sessions or verified identity-provider tokens, and enforce permissions per server request. The proof establishes a broken **client** trust boundary; successful unauthorized server operations were not tested or claimed. |
| High | Unverified owner-identifier promotion remains. Registration at 706–719 assigns `admin` at 712 without verifying the email address. The isolated current function returned administrator status for the owner identifier read internally from the source; no identifier or credential was transmitted or printed. | Remove automatic promotion by submitted email. Privileged roles must be assigned through a protected server process. Similar owner checks remain in other login paths. |
| High | A privileged shared credential and demo credentials remain publicly shipped. `CM_SYNC_KEY` is declared at 79; the demo account configuration begins at 616. Privileged JSON calls and the analytics report query still reference the shared key. | Remove these credentials from served assets, replace shared-key browser authorization with individually verified sessions, and rotate exposed server credentials after the replacement is ready. Current server acceptance or credential reuse is unverified; no live credential test occurred. |
| High | Product image URLs still become executable inline error-handler code. Current storefront and admin-thumbnail proofs each set a local boolean marker after rendering a synthetic image URL. Handler locations are 62, 64, 2392, and the matching POS construction at 2932. | HTML escaping is being reused inside a JavaScript string context. Keep URLs in validated data/property values and use one non-inline listener. Control of a product image is required; durable stored/cross-user exploitation depends on the unreviewed backend. No payload was saved or opened in production. |

## Confirmed code behavior with backend impact still unresolved

| Area | Current evidence | Limit / required follow-up |
| --- | --- | --- |
| Order reads have write side effects | `syncPull` at 898–916 attempts to push a local-only synthetic order after receiving an empty stub server list. The current-source proof observed that attempt. | Remove implicit upload reconciliation from reads. Real acceptance, duplicate/resurrection behavior, authorization, and idempotency require the PHP source and isolated server fixtures. |
| Raw order ID attribute markup | Current `orderRow` at 2380–2387 renders a synthetic ID as an additional HTML attribute in the isolated test. | Escape identifiers and validate order schemas server-side. Which lower-trust values the real server accepts, and any cross-customer exploitation, remain unverified. |
| Staff roles share one client guard | Customer is rejected while packer, billing, sales, mod, staff, and admin are all accepted by `isStaffRole` at 155–156. | Define and verify the intended server role matrix. This test does not establish which permissions the real server grants. |
| Cached order privacy | The unchanged source still persists complete orders, retains them at logout, and performs local invoice/tracking lookups without a server ownership decision; see the detailed earlier `audit-security.md` trace. | Use authenticated ownership-scoped APIs and clear private caches at account/logout boundaries. No production order data was inspected. |

## What the bounded HTTP evidence establishes

The separate `audit/live-safe-check-results.json` captured these response-level observations at 12:01 UTC. This workstream reviewed that evidence without repeating the API probes:

- HTTP homepage HEAD requests returned **200**, with no redirect Location. HTTPS HTML responses did not advertise HSTS. An HTTP-to-HTTPS redirect was therefore not observed at the HTTP response level. Use an actual server redirect and validate HSTS rollout.
- HTTPS HTML responses did not advertise CSP, frame restrictions, nosniff, Referrer-Policy, or Permissions-Policy headers. These are response-header observations, not proof that every possible defense is absent; metadata and server configuration still need inspection.
- `/.env`, `/.git/HEAD`, and `/package.json` returned **404** in the bounded checks. This does not certify every sensitive path or backup file.
- Upload HEAD returned **405**. Order/product pull HEAD returned **200**, with JSON content type and no-store headers. **A HEAD 200 does not prove anonymous order disclosure, successful GET authorization, or a successful upload.** Private response bodies were deliberately not retrieved.

## Verification and remaining release requirements

`node audit/live-frontend-revalidation.mjs`: **7/7 isolated proofs PASS** against newly fetched current code. These passing tests reproduce defects; they do **not** mean production passed a security acceptance test. Script syntax check: **PASS**. Corrected credential detection: **present**. Current production preview-client marker: **absent**.

Sanitized machine-readable evidence is in `audit/live-frontend-revalidation-results.json`. Raw public source copies, which contain exposed credentials, are kept only in the Git-ignored `audit-evidence/security-live/` directory. They must not be included in a deployment or published audit attachment.

The deployed PHP implementation, server session/role enforcement, account ownership, server-calculated prices/stock/discounts, upload decoding/storage permissions, CSRF/cookie/CORS behavior, database injection defenses, rate limits, and durable admin/order operations remain **unverified**. None can be certified by a changed frontend or a successful static build. The locally repaired frontend and isolated preview are not a substitute for recovering and testing that backend before treating the application as secured.
