import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const fixture = JSON.parse(await readFile(process.env.CM_EDITOR_FIXTURE || 'audit-evidence/product-experience-20261010/editor-fixture.json', 'utf8'));
assert.ok(['localhost', '127.0.0.1'].includes(new URL(fixture.publicUrl).hostname));
const health = await (await fetch(fixture.publicUrl + '/__fixture-health')).json();
assert.equal(health.isolated, true);
const output = path.resolve('audit-evidence/editorial-routes-' + Date.now());
await mkdir(output, { recursive: true });
const results = [];
const pages = ['', 'about', 'contact', 'faq', 'wholesale', 'shipping', 'returns', 'safety', 'terms', 'privacy', 'price-list'];
for (const page of pages) {
  const url = fixture.publicUrl + '/' + page;
  const response = await fetch(url);
  const html = await response.text();
  const title = [...html.matchAll(/<title\b[^>]*>(.*?)<\/title>/gis)];
  const canonical = [...html.matchAll(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"[^>]*>/gi)];
  const row = {
    page: page || 'home', status: response.status,
    title: title.length === 1 && title[0][1].trim().length > 0,
    canonical: canonical.length === 1 && canonical[0][1] === 'https://crackersmela.com/' + page,
    storefront: html.includes('id="view"') && html.includes('id="cm-product-bootstrap"'),
    heroFlags: (html.includes('name="cm-hero-h1"')) === (page === ''),
  };
  const head = await fetch(url, { method: 'HEAD' });
  row.head = head.status === 200 && (await head.text()) === '';
  row.pass = row.status === 200 && row.title && row.canonical && row.storefront && row.heroFlags && row.head;
  results.push(row);
  console.log((row.pass ? 'PASS: ' : 'FAIL: ') + row.page + ' serves its complete page for GET and headers for HEAD');
}
await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ passed: results.filter(row => row.pass).length, total: results.length, output }));
assert.ok(results.every(row => row.pass), 'Every informational route must load without depending on homepage-only helpers');
