# First-login session-cookie race

The candidate started a PHP session as soon as `cm-security.php` was included. Initial `products-api.php?a=pull` and `catalog-api.php?a=pull` requests ran alongside `staff-auth.php?a=session`. All three arrived without a cookie and created distinct `cm_staff` sessions. If a public response arrived last, its cookie replaced the authentication cookie while the client retained the first session's CSRF token. The first login then correctly failed with `403 / csrf`.

`tests/session-bootstrap-test.py` reproduces the race with real candidate PHP endpoints, concurrent HTTP requests and a shared cookie jar. A local forwarding server delays the public response until the client has consumed the CSRF bootstrap. Before the fix, all six tested public read endpoints set a cookie and all three concurrent catalog/products/published-CMS scenarios caused first-login 403. The initial run had 12 failures; there was no customer registration or fixture setup failure.

The fix removes include-time session startup in `cm-security.php`. Public data reads remain stateless. `customer-auth.php` explicitly starts the session before its GET identity lookup, and `cmOrderOwned()` starts it before checking customer or remembered-order ownership. Existing staff checks and CSRF checks already start the session before the remaining session reads. The cookie settings, CSRF comparison, session rotation, role validation and expiry limits are unchanged.

Verification after the fix:

- Session bootstrap regression: 35/35, including direct ownership helper persistence and expiry, wrong-token rejection and both staff/customer session persistence.
- Staff role boundaries: 183/183; existing customer integration: 25/25.
- Existing backend security: 95/95; notifications: 73/73 with 11 captured fake messages.
- CMS backend: 203/203; Google token verification: 30/30.
- Three changed PHP files lint clean under local PHP 8.3.35; isolated race server logs contained no PHP warnings or fatal errors.

Candidate PHP files changed by this fix: `cm-security.php`, `cm-commerce.php`, `customer-auth.php`. The staff backend patch builder now includes `cm-commerce.php`, for 12 files total. The root/console agent controls refresh of the integrated browser fixture; this work did not refresh it or make any production request.
