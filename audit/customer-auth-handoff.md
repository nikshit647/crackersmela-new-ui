# Customer authentication handoff

## Scope

Implemented and verified `audit-evidence/production-release/customer-auth.php` against isolated local PHP fixtures. No production accounts, orders, or data were modified by these checks. The recovered/staged source remains ignored by Git and is not a public artifact.

## Endpoint contract

- `GET /customer-auth.php?a=session`: current customer or `null`, plus `csrfToken`.
- `GET /customer-auth.php?a=users`: staff-only sanitized customer list, plus `csrfToken`.
- `POST /customer-auth.php`: JSON action `register`, `login`, `google`, or `logout`; requires same-origin request and `X-CSRF-Token`.
- Email registration accepts `name`, `email`, and `password`; login accepts `email` and `password`. Registration passwords require 15–128 Unicode characters, at most 512 bytes.
- Google exchange accepts a Firebase `idToken`. It does not trust submitted identity, role, or email fields.
- Successful authentication returns `{ok:true,user:{id,name,email,role:'customer'},csrfToken}`. Registration returns HTTP 201; other successful actions return HTTP 200. Logout returns `user:null`.

## Security properties

- Server creates random immutable customer IDs. Customer identities never authorize staff routes.
- Account data lives in `CM_DATA_DIR/customers.json`, outside the public document root, with atomic writes and file locking.
- Passwords use Argon2id when available, or a tagged SHA-384/base64 plus bcrypt fallback that avoids password truncation. Plaintext passwords are not persisted.
- Registration/login have IP and account-based throttling. Unknown-account password failures use generic messages and perform password-hashing work.
- Sign-in rotates the PHP session ID and CSRF token. Logout clears customer and staff identity on the same host, clears guest order capabilities, rotates the order idempotency nonce, and rotates the session ID/CSRF token.
- Shared middleware enforces a two-hour idle and 24-hour absolute customer session lifetime. Public/admin cookies remain host-only.
- Google identity is established only after a successful request to the fixed official HTTPS Firebase accounts-lookup service for the configured project. TLS checks remain enabled, redirects are disabled, and time/body limits are enforced. Untrusted JWT claims only allow early rejection.
- Google responses must contain one non-disabled account with verified email, the Google provider, and the expected subject. Provider-returned identity is used. Matching email never silently links a password account.

## Verification

| Check | Result | Evidence |
|---|---|---|
| PHP syntax | PASS | PHP 8.3.35 local lint |
| Local HTTP integration | PASS: 25 checks | `audit/customer-auth-integration.json` |
| Offline Google verifier tests | PASS: 17 checks | `audit/customer-google-verification.json` |

HTTP coverage includes CSRF/origin enforcement, malformed input, password validation/hashing, role/ID injection rejection, session rotation, customer denial of staff account list, generic login failure, Unicode password suffix integrity, logout capability/nonce revocation, same-host staff logout, sanitized staff account listing, and account throttling.

Google tests use offline provider-response stubs and exercise the actual extracted verifier functions. They cover malformed/wrong-project/expired/wrong-provider claims, response identity selection, fixed HTTPS/TLS settings, outbound token-only payload, unverified/disabled/mismatched/ambiguous responses, provider rejection, outage, and transport failure. They make no request to Google.

## Remaining limits and checks

- A genuine Google account sign-in has not been performed. Confirm it interactively with an authorized account and the final hostname before calling the Google flow fully verified.
- Historical browser-local accounts and historical orders cannot safely be reassigned to a new server identity solely by matching an email address. This change does not claim to migrate them.
- Password reset, email verification, and explicit account linking are not implemented. Email/password registration must not grant access to historical orders by submitted email.
- The production server uses a different PHP version; repeat syntax/runtime checks there through the deployment owner before publishing.
- The shared local QA server remains available on port 4180. Its fixture data and synthetic credentials are separate from production.

## Ownership

The root agent owns the JavaScript client integration and deployment decisions. The backend security agent owns the shared helper, order endpoints, staff endpoints, and storage. This handoff modifies only customer authentication and its local tests.
