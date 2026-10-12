// Only public JavaScript GETs. Proofs use isolated synthetic contexts, never the live app.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const evidenceDir = new URL('../audit-evidence/security-live/', import.meta.url);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const normalize = value => value.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\n+$/, '');
const facts = value => ({ bytes: Buffer.byteLength(value), sha256: sha(value), bom: value.startsWith('\uFEFF'), crlf: (value.match(/\r\n/g) || []).length, lf: (value.match(/\n/g) || []).length, trailingNewlines: value.match(/\n*$/)[0].length });
const report = {
  checkedAt: new Date().toISOString(),
  scope: 'Two bounded public JavaScript GETs, comparison with the earlier public snapshot, and isolated VM proofs. No production writes, API collection reads, authentication attempts, uploaded payloads, or customer data.',
  fetchedAssets: [], proofs: [],
};

async function publicAsset(url, filename) {
  assert.equal(new URL(url).pathname, '/js/app.js');
  const response = await fetch(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(12000), headers: { 'user-agent': 'CrackersMela-Owner-Review/1.0' } });
  assert.equal(response.status, 200, 'Public JavaScript request must succeed');
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    assert.ok(bytes < 2_000_000, 'Public asset exceeds review limit');
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);
  const text = body.toString('utf8');
  await fs.writeFile(new URL(filename, evidenceDir), body);
  report.fetchedAssets.push({ url, status: response.status, ...facts(text), contentEncoding: response.headers.get('content-encoding') });
  return text;
}

const run = (source, context = {}) => vm.runInNewContext(source, context, { timeout: 1000 });
function result(id, detail) { report.proofs.push({ id, result: 'PASS', detail }); }

async function main() {
  await fs.mkdir(evidenceDir, { recursive: true });
  const original = await fs.readFile(new URL('../live-app.js', import.meta.url), 'utf8');
  const [current, admin] = await Promise.all([
    publicAsset('https://crackersmela.com/js/app.js?v=20260925b', 'current-public-app.js'),
    publicAsset('https://admin.crackersmela.com/js/app.js?v=20260925b', 'current-admin-app.js'),
  ]);
  report.originalSnapshot = facts(original);
  report.comparison = {
    domainsByteIdentical: current === admin,
    rawOriginalIdentical: current === original,
    originalIsCurrentPlusTrailingCrLf: original === current + '\r\n',
    equalAfterBomRemoval: current.replace(/^\uFEFF/, '') === original.replace(/^\uFEFF/, ''),
    equalAfterLineEndingNormalization: normalize(current) === normalize(original),
    normalizedSha256: sha(normalize(current)),
  };
  const source = normalize(current);
  const lines = source.split('\n');
  const lineAt = pattern => { const index = lines.findIndex(line => pattern.test(line)); return index < 0 ? null : index + 1; };
  // Never serialize the matched key or demo values. Detection names must match the actual source.
  const keyDeclaration = source.match(/const\s+CM_SYNC_KEY\s*=\s*(['"])([^'"\r\n]+)\1/);
  report.staticEvidence = {
    privilegedKeyDeclarationPresent: !!keyDeclaration,
    actualCredentialIdentifier: 'CM_SYNC_KEY',
    credentialDeclarationLine: lineAt(/const\s+CM_SYNC_KEY\s*=/),
    credentialReferencedByPrivilegedRequests: /JSON\.stringify\(\{[^\n]*key:\s*CM_SYNC_KEY/.test(source),
    credentialIncludedInAnalyticsQuery: /key=\$\{encodeURIComponent\(CM_SYNC_KEY\)/.test(source),
    inlineImageHandlerLines: lines.flatMap((line, index) => /onerror=/.test(line) ? [index + 1] : []),
    authenticationFunctionLine: lineAt(/const\s+currentUser\s*=/),
    localLoginFunctionLine: lineAt(/const\s+login\s*=/),
    localRegisterFunctionLine: lineAt(/const\s+register\s*=/),
    autoPromotionLine: lineAt(/email\s*===\s*OWNER_EMAIL\s*\?\s*['"]admin/),
    ownerRegistrationPromotionLine: lineAt(/const\s+role\s*=\s*email\s*===\s*OWNER_EMAIL/),
    demoCredentialDeclarationLine: lineAt(/const\s+DEMO\s*=/),
    previewClientDeployed: /window\.CM_PREVIEW/.test(source),
  };
  // Earlier line references are reused only after exact normalized equality has been established.
  if (!report.comparison.equalAfterLineEndingNormalization) {
    const oldLines = normalize(original).split('\n');
    report.comparison.differentLineCount = lines.reduce((count, line, i) => count + (line !== oldLines[i]), Math.max(0, oldLines.length - lines.length));
    report.comparison.changedLineNumbers = lines.flatMap((line, i) => line !== oldLines[i] ? [i + 1] : []).slice(0, 40);
    report.proofStatus = 'REQUIRES_CURRENT_SOURCE_MAPPING';
    return;
  }
  const excerpt = (first, last) => lines.slice(first - 1, last).join('\n');
  const forged = run(`${excerpt(155, 156)}\n${excerpt(161, 162)}\n${excerpt(947, 947)}\n({role:currentUser().role, canWrite:canSyncPush()})`, {
    users: { 'audit@example.invalid': { role: 'admin', tok: 'synthetic-local-token', name: 'Audit' } },
    session: { email: 'audit@example.invalid', tok: 'synthetic-local-token' },
  });
  assert.equal(forged.role, 'admin');
  assert.equal(forged.canWrite, true);
  result('CURRENT-AUTH-01', 'Matching synthetic browser account/session objects pass the current client admin write guard. No server identity is consulted.');

  const registration = await run(`${excerpt(609, 626)}\n${excerpt(161, 161)}\n${excerpt(706, 719)}\nregister('Synthetic audit account', OWNER_EMAIL, 'isolated-test-only-123')`, {
    crypto: crypto.webcrypto, TextEncoder, users: {}, ls: { set() {} }, save() {},
  });
  assert.equal(registration.ok, true);
  assert.equal(registration.role, 'admin');
  result('CURRENT-AUTH-02', 'Current registration grants administrator role to the owner identifier without mailbox verification. Identifier and credential values are never output.');

  const rendered = run(`${excerpt(28, 28)}\n${excerpt(56, 65)}\n${excerpt(2389, 2394)}\n({card:imgOf(product), thumbnail:thumb(product)})`, {
    catIcon: () => '*', catLabel: () => ({}),
    product: { image: "images/products/synthetic-missing.png';globalThis.__auditMarker=true;//", shortName: 'Synthetic audit image' },
  });
  const decodeEntities = text => text.replace(/&(amp|lt|gt|quot|#39);/g, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[name]));
  for (const [kind, html] of Object.entries(rendered)) {
    const context = { __auditMarker: false };
    run(decodeEntities(html.match(/onerror="([^"]*)"/)[1]), context);
    assert.equal(context.__auditMarker, true);
    result(`CURRENT-XSS-${kind}`, 'Synthetic image URL makes the decoded current image error handler set a local boolean marker. No payload was sent to production.');
  }

  const row = run(`${excerpt(27, 28)}\n${excerpt(2380, 2387)}\norderRow(order)`, {
    order: { id: 'synthetic" data-audit-injected="yes', code: 'AUDIT', customer: { name: 'Synthetic', phone: '0000000000' }, totals: { total: 0 }, payment: 'COD', status: 'placed', placedAt: '2026-01-01T00:00:00Z' },
    STATUS_PILL: {}, STATUSES: [], fmtDate: () => '',
  });
  assert.match(row, /data-audit-injected="yes/);
  result('CURRENT-ORDER-ENCODING', 'Current order-row renderer accepts raw order ID attribute markup. Server schema enforcement and cross-user exploitability remain unverified.');

  const roles = ['customer', 'packer', 'billing', 'sales', 'mod', 'staff', 'admin'];
  const parity = run(`${excerpt(155, 156)}\nroles.map(role=>({role,staff:isStaffRole(role)}))`, { roles });
  assert.equal(parity.find(item => item.role === 'customer').staff, false);
  for (const role of roles.slice(1)) assert.equal(parity.find(item => item.role === role).staff, true);
  result('CURRENT-ROLE-PARITY', 'An ordinary customer fails the unmodified client role check; all six staff labels share it. The first proof independently demonstrates the editable-state bypass.');

  const pushed = [];
  await run(`${excerpt(898, 916)}\nsyncPull()`, {
    ORDERS_API: 'disabled-test-api', orders: [{ id: 'SYNTHETIC-LOCAL-ONLY', placedAt: '2026-01-01T00:00:00Z' }],
    fetch: async () => ({ json: async () => ({ ok: true, orders: [] }) }),
    syncPushOrders: list => pushed.push(...list), save() {},
  });
  assert.equal(pushed.length, 1);
  result('CURRENT-READ-SIDE-EFFECT', 'Current order pull attempts to push a synthetic local-only order when the stubbed server list is empty. Both network and push are stubs.');
  report.proofStatus = 'PASS';
}

try { await main(); }
catch (error) {
  // VM stacks may quote source containing credentials; never print them or error messages.
  report.proofStatus = 'FAILED';
  report.errorType = error.name;
  process.exitCode = 1;
}
await fs.writeFile(new URL('./live-frontend-revalidation-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
