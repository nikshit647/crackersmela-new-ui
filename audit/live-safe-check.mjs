// Bounded, read-only production review. Never submit payloads or retrieve order lists.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const origins = ['https://crackersmela.com', 'https://admin.crackersmela.com'];
const headerNames = ['content-type', 'content-length', 'server', 'location', 'strict-transport-security', 'content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy', 'x-robots-tag', 'access-control-allow-origin', 'access-control-allow-credentials', 'cache-control'];
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const normalizedSha = s => sha(s.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trimEnd());
const report = { checkedAt: new Date().toISOString(), scope: 'Public assets and bounded HEAD requests only. No login, production writes, uploaded payloads, private API response bodies, or orders.', checks: [], assets: [] };

async function probe(url, { method = 'HEAD', headers = {}, publicText = false } = {}) {
  const started = performance.now();
  try {
    const response = await fetch(url, { method, headers: { 'user-agent': 'CrackersMela-Owner-Review/1.0', ...headers }, redirect: 'manual', signal: AbortSignal.timeout(12000) });
    const item = { url, method, status: response.status, ms: Math.round(performance.now() - started), headers: Object.fromEntries(headerNames.flatMap(key => response.headers.has(key) ? [[key, response.headers.get(key)]] : [])) };
    report.checks.push(item);
    let text = '';
    if (publicText && response.ok && response.body) {
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 2_000_000) { await reader.cancel(); throw new Error('Public asset exceeds review size limit'); }
        chunks.push(part.value);
      }
      text = Buffer.concat(chunks).toString('utf8');
    } else await response.body?.cancel();
    return { item, text };
  } catch (error) {
    report.checks.push({ url, method, error: error.name, message: error.message.slice(0, 180) });
    return { item: { status: null }, text: '' };
  }
}

const original = await fs.readFile(new URL('../live-app.js', import.meta.url), 'utf8').catch(() => '');
for (const origin of origins) {
  const { item, text: html } = await probe(origin + '/', { method: 'GET', publicText: true });
  item.title = html.match(/<title>([^<]*)<\/title>/i)?.[1];
  item.robots = html.match(/<meta\s+name=["']robots["']\s+content=["']([^"']+)/i)?.[1];
  item.sameOriginScripts = [...html.matchAll(/<script\b[^>]*src=["']([^"']+)["']/gi)]
    .map(match => new URL(match[1], origin)).filter(url => url.origin === origin).map(url => url.href);
  const appUrl = item.sameOriginScripts.find(url => new URL(url).pathname === '/js/app.js');
  if (appUrl) {
    const { text: app } = await probe(appUrl, { method: 'GET', publicText: true });
    if (app) report.assets.push({
      url: appUrl, bytes: Buffer.byteLength(app), sha256: sha(app),
      matchesPreviouslyAuditedOriginal: !!original && sha(app) === sha(original),
      matchesPreviousAfterLineEndingNormalization: !!original && normalizedSha(app) === normalizedSha(original),
      privilegedKeyDeclarationPresent: /const\s+CM_SYNC_KEY\s*=\s*['"][^'"]+['"]/.test(app),
      inlineImageErrorHandlersPresent: /onerror=/.test(app),
      clientAuthenticationFunctionPresent: /const\s+currentUser\s*=/.test(app),
      previewClientDeployed: /window\.CM_PREVIEW|Local preview authentication is unavailable/.test(app),
    });
  }
  await probe(origin + '/robots.txt', { method: 'GET', publicText: true });
  await probe(origin + '/sitemap.xml');
  await probe(origin + '/cm-owner-audit-missing-page-20260927');
  for (const pathname of ['/.env', '/.git/HEAD', '/package.json']) await probe(origin + pathname);
  // HEAD checks do not download customer data or prove GET authorization.
  for (const pathname of ['/orders-api.php?a=pull', '/upload-api.php', '/products-api.php?a=pull']) {
    await probe(origin + pathname, { headers: { Origin: 'https://owner-audit.invalid' } });
  }
  await probe(origin.replace('https:', 'http:') + '/');
}
await fs.writeFile(new URL('./live-safe-check-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
