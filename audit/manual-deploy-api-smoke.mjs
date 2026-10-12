// Bounded production GET/HEAD verification. No credentials, submitted payloads,
// business mutations, or customer records are saved in the report.
import fs from 'node:fs/promises';

const report = { checkedAt: new Date().toISOString(), scope: 'Anonymous read-only post-deployment checks; no login attempts, order creation, uploads or customer-data retention.', checks: [] };
for (const origin of ['https://crackersmela.com', 'https://admin.crackersmela.com']) {
  for (const pathname of ['/staff-auth.php?a=session', '/customer-auth.php?a=session', '/customer-auth.php?a=users', '/analytics-api.php?a=report', '/orders-api.php?a=pull']) {
    const response = await fetch(origin + pathname, { redirect: 'manual', signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'CrackersMela-Owner-Review/1.0' } });
    const cookie = response.headers.get('set-cookie') || '';
    const item = { url: origin + pathname, method: 'GET', status: response.status, contentType: response.headers.get('content-type'), cacheControl: response.headers.get('cache-control'), reflectedExternalOrigin: response.headers.get('access-control-allow-origin') === 'https://owner-audit.invalid', cookie: cookie ? { secure: /;\s*Secure/i.test(cookie), httpOnly: /;\s*HttpOnly/i.test(cookie), sameSite: cookie.match(/;\s*SameSite=([^;,]+)/i)?.[1], hostOnly: !/;\s*Domain=/i.test(cookie) } : null };
    const reader = response.body.getReader();
    let prefix = '';
    while (prefix.length < 1024) {
      const part = await reader.read();
      if (part.done) break;
      prefix += new TextDecoder().decode(part.value).slice(0, 1024 - prefix.length);
      if (pathname.startsWith('/orders-api.php')) break;
    }
    await reader.cancel();
    if (pathname.startsWith('/orders-api.php')) {
      item.anonymousOrdersEmpty = /"orders"\s*:\s*\[\s*\]/.test(prefix);
      item.pass = response.status === 200 && item.anonymousOrdersEmpty;
    } else if (pathname.endsWith('a=users') || pathname.endsWith('a=report')) {
      item.pass = [401,403].includes(response.status);
    } else {
      try {
        const json = JSON.parse(prefix);
        item.anonymous = json.authenticated === false || json.user === null;
        item.csrfTokenPresent = typeof json.csrfToken === 'string' && json.csrfToken.length >= 32;
        item.pass = response.status === 200 && item.anonymous && item.csrfTokenPresent;
      } catch { item.pass = false; }
    }
    report.checks.push(item);
  }
  const foreign = await fetch(origin + '/customer-auth.php?a=session', { redirect: 'manual', signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'CrackersMela-Owner-Review/1.0', Origin: 'https://owner-audit.invalid' } });
  await foreign.body?.cancel();
  report.checks.push({ url: origin + '/customer-auth.php?a=session', method: 'GET', externalOrigin: true, status: foreign.status, pass: foreign.status === 403 && !foreign.headers.has('access-control-allow-origin') });
}
report.passed = report.checks.filter(check => check.pass).length;
report.total = report.checks.length;
await fs.writeFile('audit/manual-deploy-api-smoke.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
