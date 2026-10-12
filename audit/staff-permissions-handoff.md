# Staff directory and permissions handoff

Implemented in the ignored production candidate `audit-evidence/production-release`; no deployment, production account change, live order, or real email was made.

The configured owner retains its external credential file and valid pre-upgrade session, now reporting `super_admin`. The owner row is protected against all directory edits. Additional accounts are stored in private `CM_DATA_DIR/staff-users.json` with slow password hashes; creating accounts uses a 15–128 character password because no invitation mechanism exists in this application. Passwords and hashes are never returned by the API. Google staff sign-in verifies the signed token and requires an active known staff account; the configured owner additionally retains its existing Google allowlist requirement.

Every authenticated request resolves the active account and version from the server. Account changes increment the version, invalidating previously issued managed sessions. A locked update protects the final active Super Admin and rejects stale edits. Customer and staff logout paths clear the same staff identity fields and guest order capabilities.

Session startup is now lazy. Public catalog/product pulls, published CMS reads, clean pages and sitemaps do not create session cookies. Identity, CSRF and order-ownership checks start the session explicitly; the customer session endpoint loads it before reading the identity. This fixes a reproduced first-login race in which concurrent public reads overwrote the cookie associated with the authentication bootstrap's CSRF token. See `audit/session-bootstrap-handoff.md`.

## API contract

- GET `staff-users.php?a=list` returns `users`, `roles`, `counts`, and `csrfToken`.
- POST `?a=create`: `{name,email,role,active,password}`; returns 201 with `user`.
- POST `?a=update`: `{id,expectedVersion,name?,email?,role?,password?}`; returns 200 with `user`. Omit an unchanged password.
- POST `?a=activate`: `{id,expectedVersion,active}`; returns 200 with `user`.
- User projection: `{id,name,email,role,active,protected,createdAt,updatedAt,version}`. Owner ID is `staff_owner`.
- The staff session adds `{id,name,permissions}` and keeps `{authenticated,email,role,csrfToken}`. Errors use 401 unauthenticated, 403 forbidden, 409 protected/stale/duplicate, 422 invalid input.

## Fixed permissions

Super Admin receives every permission; Admin receives every operational permission except `users.manage`. Billing receives `orders.read`, `orders.payment`, `pos.create`, `invoices.read`. Inventory Manager receives `products.manage`, `media.manage`. Order Manager receives `customers.read`, `orders.read`, `orders.status`, `orders.notify`, `invoices.read`. Every role also receives `dashboard.read`; the frontend must show role-appropriate summary data or choose an operational landing panel. Full analytics uses `analytics.read`; store settings use `settings.manage`; CMS including its media library uses `website.manage`. Product image uploads use `media.manage`.

Server helpers are `cmStaffAccount()`, `cmStaffPublic($account)`, `cmHasPermission($permission)`, and `cmRequirePermission($permission, $mutation = false)`. `cmRequireStaff()` continues to mean an actual active staff session. The helpers remain inside `cm-security.php`, so existing fixture include lists do not need a new library.

Product/settings fields and order status/payment fields are checked separately before writing. Inventory product saves must omit `settings`. A forbidden mixed-field payload performs no partial mutation. Restricted roles must not unconditionally load the customer list during frontend authentication.

## Verification

- `python tests/staff-permissions-test.py`: 183/183 checks. It also runs the existing customer authentication assertions against its random-port isolated fixture: 25/25. Cases include every role's direct API access, owner and final-Super protections, stale edits, deactivation/reactivation, immediate role/password revocation, long Unicode passwords, CSRF, safe response projections, legacy cookies, signed Google identity mapping, unprovisioned/inactive rejection, customer separation, and invoice bypass rejection.
- `python audit/backend-security-test.py`: 95/95 existing backend checks.
- `python audit/notification-test.py`: 73/73 checks, 11 captured fake messages, no mail server contacted.
- `python tests/session-bootstrap-test.py`: 35/35 checks, including real concurrent HTTP cookie races, first login, CSRF enforcement, customer persistence and ownership expiry.
- `python tests/cms-backend-test.py`: 203/203 checks after lazy session startup.
- `node tests/customer-google-verification.mjs`: 30/30 signature/claims/certificate-cache checks.
- `audit-evidence/tools/php-8.3.35/php.exe audit/notification-template-test.php`: 152/152 template checks.
- Changed PHP files pass local PHP 8.3.35 syntax checks.

The first role test failed against the baseline because the owner still reported generic `admin`; the completed implementation passes. A focused self-review traced authentication, private storage, role lookup, session invalidation, mixed-field payloads, and alternate API paths without finding a confirmed remaining authorization bypass in this change.

Actual PDF rendering was not exercised: the local candidate lacks the external mPDF autoload/font runtime. Invoice authentication, role checks, CSRF, missing-record behavior, and customer-endpoint bypass prevention were exercised. Production PHP 8.1 runtime verification and live browser validation remain integration/release checks.

Run `python audit/build-staff-permissions-patch.py` to regenerate `audit-evidence/staff-permissions-change.patch` and `staff-permissions-manifest.json` from the explicit 12 backend files and the saved baseline. `git -c core.safecrlf=false apply --check --directory=audit-evidence/three-area-baseline-20261005 audit-evidence/staff-permissions-change.patch` passes. The patch does not include live credentials, private stores, frontend changes, or the CMS changes owned by the editor integration.
