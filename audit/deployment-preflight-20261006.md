# Deployment preflight — 6 October 2026

Read-only preparation. No live files, settings, customer/order/catalog stores, staff accounts or CMS documents were written.

## Access

- Confirmed target: `50.6.45.11`, root SSH, intended document root `/home/crackersmela.com/public_html` (prior verified deployment record).
- Existing OpenSSH known-host entry matched the live server during a strict-host-key connection. ED25519 fingerprint: `SHA256:IetZB9jjvIFwbImIvaVqAKToGo7HO8aFfqerCZ+6fCA`.
- `ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 root@50.6.45.11` reached authentication, then failed with `Permission denied (publickey,password)`.
- No SSH credential/helper was found in the scoped workspace metadata or relevant environment-variable names. No SSH/PuTTY/Pageant process was active. Unrelated credential stores were not searched.
- Existing root password or an authenticated connection is required. Use the existing known-host pin; do not disable host-key verification. A root password must be supplied through an interactive prompt or protected in-memory input, never command arguments or saved release artifacts.
- Because authentication was unavailable, the current remote PHP source, host runtime, invoice dependencies and actual destination before-images remain unverified.

## Public file comparison

Normal unauthenticated HTTPS GET requests checked 25 changed static paths from the October 5 combined manifest. Full raw-response SHA-256 evidence and downloaded public files are retained in `audit-evidence/live-predeploy-public-comparison-20261006/`.

- Four files match the saved production baseline: `css/styles.css`, `index.html`, `js/cms-model.js`, `js/cms-runtime.js`.
- Sixteen planned additions returned 404, as expected for the pending release.
- Five files differ from the manifest production baseline, but **all five exactly match the October 4 deployed archive** at `audit-evidence/deploy-20261004/editor`:
  - `css/cms-content.css`
  - `css/visual-editor.css`
  - `js/app.js`
  - `js/cms-preview.js`
  - `js/visual-editor.js`

The editor CSS and preview files also match the saved `three-area-baseline-20261005/editor-overlay`. The production comparison baseline is incomplete for these earlier deployed editor changes; these observations do not establish new independent live edits after October 4.

## Candidate preservation item

The October 4 `js/app.js` differs from the production baseline only in two auth-field templates: on the admin host the live label is “Username or email” and input type is `text`; storefront fields remain “Email” and type `email`. The current candidate (read at this preflight) had reverted both templates to plain Email/type=email at lines 886 and 891. Its login still accepts raw usernames. Preserve the deployed admin label/type before release. The parent agent has been notified; this preflight did not modify the candidate.

The live `js/visual-editor.js` differs from the saved editor-overlay baseline by lacking the later `revealActiveRow()` scroll fix. Candidate overlay improvements should be retained; the live file is byte-identical to the October 4 archive.

## Deployment handoff

Deploy only an explicit current-source allowlist after obtaining actual remote before-images and comparing remote hashes. Map `production-release/` paths to the shared document root. Preserve all private data, configuration, uploads, product images/catalog snapshots, vendor libraries and invoice assets. The old combined review bundle is historical and does not include later October 6 edits. Do not run `visual-editor/deploy-editor.sh` or broad integration scripts.
