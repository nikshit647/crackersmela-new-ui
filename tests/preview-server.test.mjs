import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { after, test } from 'node:test';

const results = [];
function check(name, run) {
  test(name, async () => {
    const started = performance.now();
    try {
      await run();
      results.push({ name, status: 'PASS', durationMs: Math.round(performance.now() - started) });
    } catch (error) {
      results.push({ name, status: 'FAIL', message: error.message, durationMs: Math.round(performance.now() - started) });
      throw error;
    }
  });
}

function request(port, path = '/', method = 'GET', host = `localhost:${port}`) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers: { Host: host }, timeout: 5000 }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('timeout', () => req.destroy(new Error('Local preview request timed out.')));
    req.on('error', reject);
    req.end();
  });
}

for (const port of [4173, 4174]) {
  check(`${port}: labeled preview, isolated identity, and browser boundary`, async () => {
    const page = await request(port);
    assert.equal(page.status, 200);
    assert.ok(page.body.includes('Local UI preview'));
    assert.ok(page.body.includes(`"isAdmin":${port === 4174}`));
    assert.equal(page.body.includes('"email":"review@example.test"'), port === 4174);
    assert.ok(page.body.includes('Object.freeze(window.CM_PREVIEW.user)'));
    assert.ok(!/<script\b[^>]*\bsrc=["']https?:\/\//i.test(page.body));
    assert.ok(page.headers['content-security-policy'].includes("connect-src 'self'"));
    assert.ok(page.headers['content-security-policy'].includes("form-action 'self'"));
    assert.ok(page.headers['content-security-policy'].includes("frame-ancestors 'none'"));
    assert.equal(page.headers['cache-control'], 'no-store');
    assert.equal(page.headers['x-content-type-options'], 'nosniff');
    assert.ok(page.headers['x-robots-tag'].includes('noindex'));
  });
  for (const api of ['products-api.php', 'catalog-api.php']) {
    check(`${port}: ${api} permits a public snapshot read`, async () => {
      const result = await request(port, `/${api}?a=pull`);
      assert.equal(result.status, 200);
      assert.equal(JSON.parse(result.body).ok, true);
      assert.equal(result.headers['cache-control'], 'no-store');
    });
    check(`${port}: ${api} rejects writes disguised as GET`, async () => {
      const result = await request(port, `/${api}?a=push`);
      assert.equal(result.status, 503);
      assert.equal(JSON.parse(result.body).error, 'PREVIEW_BACKEND_UNAVAILABLE');
    });
  }
  for (const api of ['orders-api.php', 'email-api.php', 'upload-api.php', 'analytics-api.php', 'unknown.php']) {
    check(`${port}: ${api} does not fabricate backend data`, async () => {
      const result = await request(port, `/${api}`);
      assert.equal(result.status, 503);
      assert.equal(JSON.parse(result.body).ok, false);
      assert.equal(JSON.parse(result.body).error, 'PREVIEW_BACKEND_UNAVAILABLE');
    });
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    check(`${port}: ${method} cannot mutate catalog snapshots`, async () => {
      const result = await request(port, '/products-api.php', method);
      assert.equal(result.status, 503);
      assert.equal(JSON.parse(result.body).preview, true);
    });
  }
  for (const path of ['/../package.json', '/images/%2e%2e/%2e%2e/package.json', '/%2eenv', '/images/%5c..%5cpackage.json', '/js/app.js:secret', '/%ZZ']) {
    check(`${port}: malformed or private path ${path} is rejected`, async () => {
      const result = await request(port, path);
      assert.ok([400, 403].includes(result.status), `Unexpected status ${result.status}`);
    });
  }
  for (const path of ['/package.json', '/fixtures/products.json', '/server.mjs', '/js/config.js', '/missing-page', '/js/app.js.map']) {
    check(`${port}: nonpublic path ${path} is not served`, async () => {
      assert.equal((await request(port, path)).status, 404);
    });
  }
  check(`${port}: hostile Host header is rejected`, async () => {
    assert.equal((await request(port, '/', 'GET', 'attacker.example')).status, 421);
  });
  check(`${port}: JavaScript is served with its safe MIME type`, async () => {
    const result = await request(port, '/js/app.js');
    assert.equal(result.status, 200);
    assert.ok(result.headers['content-type'].startsWith('text/javascript'));
  });
  check(`${port}: HEAD provides metadata without response content`, async () => {
    const result = await request(port, '/', 'HEAD');
    assert.equal(result.status, 200);
    assert.equal(result.body, '');
    assert.ok(Number(result.headers['content-length']) > 0);
  });
}

after(async () => {
  const directory = new URL('../audit/', import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL('test-preview.json', directory), JSON.stringify({
    generatedAt: new Date().toISOString(),
    scope: 'Isolated local preview HTTP harness only; not a production build or backend security verification.',
    command: 'node --test tests/preview-server.test.mjs',
    status: results.some(result => result.status === 'FAIL') ? 'FAIL' : 'PASS',
    tests: results.length,
    passed: results.filter(result => result.status === 'PASS').length,
    failed: results.filter(result => result.status === 'FAIL').length,
    results,
  }, null, 2) + '\n');
});
