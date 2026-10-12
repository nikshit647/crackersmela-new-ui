# PHP 8.1 compatibility verification

5 October 2026. All checks used isolated synthetic data on loopback, with mail disabled or recorded by a fake transport. No production request, deployment, real order or email was made.

The official Windows PHP 8.1.34 NTS x64 archive was downloaded from <https://windows.php.net/downloads/releases/archives/php-8.1.34-nts-Win32-vs16-x64.zip>. Its SHA-256 matches the official <https://windows.php.net/downloads/releases/releases.json> metadata:

`9cfe246cb144076c16f5913a3ef88a474c3dd7e60f0f0c8bb95faf68674016cc`

The executable reports PHP 8.1.34. It was extracted only into the local audit tools folder; no server or system PHP installation was replaced.

| Existing suite | PHP 8.1.34 result |
|---|---:|
| CMS backend, including Promo validation | PASS 234/234 |
| Staff role and permission boundaries | PASS 183/183 |
| Customer authentication integration, invoked by staff suite | PASS 25/25 |
| Backend security | PASS 95/95 |
| Session bootstrap, races and ownership | PASS 35/35 |
| Notification behavior with fake transport | PASS 73/73; 11 recorded messages |
| Production-candidate PHP syntax | PASS, all 28 files |

`audit/run-php81-compat-test.py` runs the existing suites with exactly two syntax-tree substitutions: the PHP executable assignment and the output-report destination. The assertions, fixture setup and application source remain unchanged. Original test files and their earlier result reports are preserved. Runtime metadata records the original test-file hash and selected runtime for each invocation.

New JSON results and runtime metadata are in `audit-evidence/php81-verification/`. The CMS report records no PHP warnings, notices, fatal or parse errors. Each suite exited successfully.

The wrapper annotates copied result reports with the actual executable version and runtime-evidence filename. Two older suites contain a hardcoded PHP 8.3 label; that historical string is preserved under `originalSuiteRuntimeLabel` instead of being misreported as this run's runtime.

This verifies the tested application paths under local PHP 8.1.34. It does not attest to the live host's exact patch version, enabled extensions, configuration, filesystem permissions or third-party packages. Invoice rendering is covered separately because it depends on mPDF and fonts absent from the original local workspace.
