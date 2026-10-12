# Frontend privacy and output-encoding review

Scope: only `review/public/js/app.js`, the locally reviewed copy of the recovered current frontend. No production data, original downloaded evidence, or source folders were changed. The deployed PHP backend remains unavailable.

## Local fixes

| Finding | Cause and risk | Local change | Verification |
| --- | --- | --- | --- |
| Private records persisted across visits and sign-out | The client read complete orders, account records, activity containing customer/order details, and held POS bills from localStorage. Its shared save function wrote private records back; logout reset only its local session. This exposed retained data to subsequent users of the same browser and any script running on the origin. | Order/account/activity/held-bill data now starts empty and stays in current-page memory. Legacy `cm2.orders`, `cm2.activity`, `cm2.session`, `cm2.users`, and `cm2.heldBills` keys are removed without reading their contents. Logout stops the feed, clears private memory and checkout/POS drafts, and removes the legacy keys again. Anonymous cart and wishlist preferences remain available. | VM tests prepopulate synthetic private caches, then run actual initialization, save, and logout code. They verify private caches are not read or rewritten and the cart remains intact. |
| A pending order request could restore data after sign-out | An asynchronous order response could complete after memory had been cleared. Stopping a polling timer alone does not cancel an already-running response handler. | A private-data revision is captured before a read and checked before applying its response. Logout advances the revision, so earlier requests cannot repopulate cleared order memory. | A deferred mock response is completed after running actual logout. No order is restored or persisted. A separate accepted-response test confirms current-session data remains memory-only. |
| Public tracking suggested recent customer orders | The tracking page listed recent order codes and customer names from the shared order collection. | Removed the recent/demo-order suggestions and their click handler. The manual order-code form remains. | Rendered tracking output is checked with a synthetic private order in memory; its name and code are absent while the manual lookup form remains. |
| Order IDs, quantities and an account email entered HTML without contextual encoding | Several order data attributes, history links, invoice/detail quantities, live-feed IDs and the admin-search account-email attribute interpolated raw values. Rendering synthetic quote/tag input demonstrated unsafe output contexts. Production exploitability depends on backend validation, which cannot be inspected. | Data attributes/text now use HTML encoding. Order/history/reorder links encode IDs as URL components and decode them when resolving routes. Order-detail controls locate their target by exact attribute-value comparison instead of interpolating an ID into a CSS selector. | Actual view functions render synthetic quote/tag values in VM tests. They remain encoded text/attribute values, and encoded order IDs still resolve correctly. No payload was sent to production. |
| Obsolete client password/token helpers remained | Unused salted SHA-256 password helpers and Math.random-based salt/token helpers suggested a client-only authentication fallback that no longer exists in the reviewed client. | Removed these unused helpers. The client continues to report that real authentication is unavailable. | JavaScript syntax and existing authentication regression checks pass; no replacement authentication scheme was introduced. |

Privacy persistence and public suggestions are **Medium** findings in this frontend review. Unsafe output contexts are confirmed locally; their production exploitability and resulting severity require the actual backend validation and authorization code. The exposed production shared key and server authorization issues are covered separately in the security audit.

## Tests

Run `node --test tests/privacy.test.mjs`. Nine VM regression tests exercise the actual relevant functions with synthetic records, a mock browser storage implementation, and deferred mock network responses. All nine passed when this report was written.

These tests verify local behavior only. They do not establish production authorization, record ownership, session security, storage encryption, API response schemas, or safe production payment/order processing.

## Backend work still required

- Implement and verify real server-side authentication and role/record authorization. The local preview identity is not authentication.
- Load only orders/accounts authorized for the active server session, with no unauthenticated bulk customer-data endpoint.
- Revoke the exposed production shared credential and remove shared client-controlled authorization.
- Recalculate prices, discounts and quantities on the server; validate and normalize all persisted fields.
- Provide an authenticated session lifecycle, including real logout/session invalidation and a safe order-tracking lookup design.
- Review the deployed PHP source and test the completed integration against an isolated backend before deployment.

No production build or deployment was performed. Reloading this preview deliberately clears page-memory orders; durable order history requires the missing authenticated backend.
