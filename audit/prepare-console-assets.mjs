import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Narrow, repeatable local preparation. No deployment, policy expansion, or
// changes to application code, styles, hosting rules, or Firebase SDK behavior.
const root = path.resolve(process.argv[2] || 'audit-evidence/production-release');
const indexPath = path.join(root, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
const originalPolicy = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/)?.[1];
assert.ok(originalPolicy, 'Expected existing production CSP');
const sha256 = body => createHash('sha256').update(body).digest('hex');
const bootstrapPath = 'js/analytics-bootstrap.js';
const bootstrapRef = bootstrapPath + '?v=20261005-csp1';
const bootstrapHash = 'M/6Nvy/HHk4XG6z/pcsNCgJXQsJp6qd/x9Njx+sV6ik=';
let bootstrap = null;
for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  if (/\bsrc=/.test(match[1])) continue;
  const normalized = match[2].replace(/\r\n?/g, '\n');
  if (createHash('sha256').update(normalized).digest('base64') !== bootstrapHash) continue;
  bootstrap = normalized;
  html = html.replace(match[0], '<script src="' + bootstrapRef + '"></script>');
  break;
}
if (bootstrap === null) {
  assert.ok(html.includes('<script src="' + bootstrapRef + '"></script>'), 'The reviewed analytics bootstrap was not found');
  bootstrap = fs.readFileSync(path.join(root, bootstrapPath), 'utf8');
  assert.equal(createHash('sha256').update(bootstrap).digest('base64'), bootstrapHash, 'Existing external bootstrap must match the reviewed inline code');
}

const pins = [
  { name: 'firebase-app-compat.js', upstreamSha256: '24a1fd90a9424647636669f59013201ba385eff82a58f88c76a7d400d4d71139' },
  { name: 'firebase-auth-compat.js', upstreamSha256: '277f6ef70525168247921e7a51fe995ecc66f9c3cf56c97f0d2bc262f74b5906' },
];
const files = [];
const artifacts = [];
for (const pin of pins) {
  const url = 'https://www.gstatic.com/firebasejs/10.12.2/' + pin.name;
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, 'Official pinned Firebase SDK must be available');
  const upstream = Buffer.from(await response.arrayBuffer());
  assert.equal(sha256(upstream), pin.upstreamSha256, 'Official SDK bytes must match the independently inspected pin');
  const removedSuffix = '//# sourceMappingURL=' + pin.name + '.map\n';
  assert.ok(upstream.subarray(-Buffer.byteLength(removedSuffix)).equals(Buffer.from(removedSuffix)), 'Only the expected terminal source-map comment may be removed');
  const vendored = upstream.subarray(0, upstream.length - Buffer.byteLength(removedSuffix));
  assert.ok(!/\/\/[#@]\s*sourceMappingURL=/.test(vendored.toString('utf8')), 'No remaining source-map requests');
  const destination = 'js/vendor/firebase/10.12.2/' + pin.name;
  assert.ok(html.includes('src="' + url + '"') || html.includes('src="' + destination + '"'), 'Expected Firebase script reference');
  html = html.replace('src="' + url + '"', 'src="' + destination + '"');
  artifacts.push({ destination, body: vendored });
  files.push({
    path: destination, upstreamUrl: url, upstreamBytes: upstream.length,
    upstreamSha256: pin.upstreamSha256, vendoredBytes: vendored.length,
    vendoredSha256: sha256(vendored), removedSuffix,
  });
}
// The official CDN minified files contain no license block. Include the full
// upstream license from the matching release tag beside the unmodified SDKs.
const license = {
  path: 'js/vendor/firebase/10.12.2/LICENSE.txt',
  upstreamUrl: 'https://raw.githubusercontent.com/firebase/firebase-js-sdk/firebase%4010.12.2/LICENSE',
  upstreamSha256: '065e45b5674f9bf76670496e5472611b3fbd87fbeaf99336725430a9909cb687',
};
const licenseResponse = await fetch(license.upstreamUrl, { signal: AbortSignal.timeout(30000) });
assert.equal(licenseResponse.status, 200, 'Matching Firebase release license must be available');
const licenseBody = Buffer.from(await licenseResponse.arrayBuffer());
assert.equal(sha256(licenseBody), license.upstreamSha256, 'Preserve the complete pinned release license');
artifacts.push({ destination: license.path, body: licenseBody });
assert.equal(html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/)?.[1], originalPolicy, 'CSP must remain byte-for-byte unchanged');
// All downloads, hashes and expected-source checks finish before local writes.
for (const artifact of artifacts) {
  const target = path.join(root, artifact.destination);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, artifact.body);
}
fs.writeFileSync(path.join(root, bootstrapPath), bootstrap);
fs.writeFileSync(indexPath, html);
fs.writeFileSync('audit/firebase-10.12.2-provenance.json', JSON.stringify({
  version: '10.12.2',
  preparation: 'node audit/prepare-console-assets.mjs',
  transformation: 'Remove only each exact terminal sourceMappingURL comment; retain every preceding byte. The CDN files have no license comments, so the complete matching release license is included separately.',
  verification: 'Concatenating the vendored bytes with removedSuffix recreates the exact official upstream SHA-256.',
  files, license,
}, null, 2) + '\n');
console.log('Prepared same-origin analytics and pinned Firebase SDKs locally; CSP unchanged.');
