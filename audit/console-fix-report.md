# Console fix verification — 5 October 2026

Local production candidate only. No deployment or production writes were performed.

The blocked `sha256-M/6Nvy/HHk4XG6z/pcsNCgJXQsJp6qd/x9Njx+sV6ik=` identifies the existing analytics/consent bootstrap after HTML parsing normalizes CRLF to LF. The old generator hashed raw CRLF bytes (`sha256-R8XC8/i4LKA6rxFzVLK6zPKB3slRG3kaIzxgHhCiQIY=`). The candidate now loads exactly the normalized bootstrap text synchronously from `js/analytics-bootstrap.js?v=20261005-csp1` at its original position. Consent remains denied by default, and automatic page views remain disabled.

The candidate's complete CSP meta value is byte-for-byte unchanged. Both historical script hashes remain present. No source-map URL, origin, wildcard, unsafe-inline, or unsafe-eval permission was added. The existing asset builder now retains historical hashes and hashes future inline scripts using parser-normalized line endings. The broad legacy builder was exercised only in temporary fixtures; it was not run against the release because it also rewrites unrelated styles, versions, and hosting rules.

Firebase remains pinned to 10.12.2. Official app/auth compat files are served from `js/vendor/firebase/10.12.2/`, in their original order. Only the final `sourceMappingURL` comment was removed from each file. Reattaching the recorded suffix reproduces each exact upstream SHA-256, proving all preceding bytes are preserved. The CDN files contain no license comments; the complete LICENSE from the matching Firebase release tag is included beside them. `audit/firebase-10.12.2-provenance.json` records download URLs, byte lengths, upstream/output hashes, suffixes, and the license checksum. `node audit/prepare-console-assets.mjs` reproduces this narrow preparation after validating every upstream checksum.

`node --test tests/production-console.test.mjs` passed 4 tests after three expected baseline failures: bootstrap blocked by CSP, future CRLF scripts incorrectly hashed, and Firebase references still remote. Coverage verifies denied consent/default analytics behavior, exact policy preservation, retained historical hashes, future normalized hashes, byte-level SDK provenance, license preservation, and successful evaluation exposing SDK 10.12.2 and GoogleAuthProvider. Browser sign-in and integrated storefront checks belong to the root agent's broader verification.

The index also includes the editor agent's requested `cms-responsive.js?v=20261005-responsive1` immediately before `cms-runtime.js`. That helper's implementation and responsive verification belong to the editor workstream.

No Floto/FloatingWidget text was found in the inspected candidate, recovered source, archived live downloads, or October 4 deployed HTML/JS/CSS. Source absence alone does not establish extension provenance; browser script URLs/stack evidence remain necessary before attribution.
