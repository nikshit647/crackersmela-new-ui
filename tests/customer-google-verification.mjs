import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Real RSA signatures exercise the production verifier; certificate transport
// is the only stub. Neither Google nor production services are contacted.
const source = await readFile('audit-evidence/production-release/cm-google.php', 'utf8');
assert.match(source, /function cmGoogleIdentity\(/);
assert.match(source, /openssl_verify\(/);
await mkdir('audit-evidence', { recursive: true });
const fixture = await mkdtemp(path.resolve('audit-evidence/google-verifier-'));
for (const name of ['trusted', 'untrusted']) {
  const keys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  await writeFile(path.join(fixture, name + '-private.pem'), keys.privateKey);
  await writeFile(path.join(fixture, name + '-public.pem'), keys.publicKey);
}
const runtime = path.resolve('audit-evidence/tools/php-8.3.35');
const raw = execFileSync(path.join(runtime, 'php.exe'), [
  '-d', 'extension_dir=' + path.join(runtime, 'ext'), '-d', 'extension=openssl',
  path.resolve('tests/google-verifier.php'), fixture,
  path.resolve('audit-evidence/production-release/cm-google.php'),
], { encoding: 'utf8' });
const result = JSON.parse(raw);
await writeFile('audit/customer-google-verification.json', JSON.stringify(result, null, 2) + '\n');
console.log(`PASS: ${result.checks.length} Google identity verification checks`);
