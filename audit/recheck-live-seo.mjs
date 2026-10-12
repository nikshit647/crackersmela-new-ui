/*
 * Independent recheck of the live product SEO fields.
 * Fetches the live products API fresh and verifies every product's five SEO
 * fields against the reviewed enrichment payload. Read-only; never writes to
 * the server.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE = join(ROOT, 'audit-evidence', 'live-seo-enrichment-20261007');
const OUT = join(ROOT, 'audit-evidence', 'live-seo-recheck-20261007');
const FIELDS = ['seoTitle', 'seoDesc', 'seoKeywords', 'seoSlug', 'seoTags'];

mkdirSync(OUT, { recursive: true });

const response = await fetch('https://admin.crackersmela.com/products-api.php?a=pull', {
  headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
});
if (!response.ok) throw new Error('HTTP ' + response.status);
const raw = Buffer.from(await response.arrayBuffer());
const sha256 = createHash('sha256').update(raw).digest('hex');
writeFileSync(join(OUT, 'products.current.json'), raw);

const state = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''));
const rows = JSON.parse(readFileSync(join(EVIDENCE, 'fields.json'), 'utf8').replace(/^\uFEFF/, ''));

const ok = [];
const missing = [];
const empty = [];
const mismatched = [];
for (const row of rows) {
  const saved = state.productOverrides?.[String(row.id)];
  if (!saved) { missing.push(String(row.id)); continue; }
  const bad = [];
  const blanks = [];
  for (const key of FIELDS) {
    if (saved[key] !== row.fields[key]) bad.push(key);
    if (!String(saved[key] ?? '').trim()) blanks.push(key);
  }
  if (blanks.length) empty.push({ id: row.id, blanks });
  else if (bad.length) mismatched.push({ id: row.id, bad });
  else ok.push(String(row.id));
}

const previousAfter = join(EVIDENCE, 'products.after.json');
const previousHash = existsSync(previousAfter)
  ? createHash('sha256').update(readFileSync(previousAfter)).digest('hex') : null;

const extraProducts = Array.isArray(state.extraProducts) ? state.extraProducts : [];
const report = {
  checkedAt: new Date().toISOString(),
  httpStatus: response.status,
  liveRevision: state.rev,
  liveSha256: sha256,
  previousVerifiedSha256: previousHash,
  unchangedSinceVerifiedSave: sha256 === previousHash,
  expectedProducts: rows.length,
  fullyFilled: ok.length,
  missingOverride: missing,
  emptyFields: empty,
  mismatched,
  extraProductCount: extraProducts.length,
  extraProductIdsWithoutCheckedFields: extraProducts
    .map((p) => String(p.id))
    .filter((id) => !rows.some((r) => String(r.id) === id)),
  status: ok.length === rows.length && !empty.length && !mismatched.length && !missing.length ? 'PASS' : 'FAIL',
};
writeFileSync(join(OUT, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
