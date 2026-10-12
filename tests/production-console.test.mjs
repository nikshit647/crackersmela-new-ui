import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import vm from 'node:vm';

const workspace = path.resolve(import.meta.dirname, '..');
const candidate = path.join(workspace, 'audit-evidence/production-release');
const baseline = fs.readFileSync(path.join(workspace, 'audit-evidence/three-area-baseline-20261005/index.html'), 'utf8');
const digest = text => createHash('sha256').update(text).digest('hex');
const cspOf = html => html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/)[1];
const scriptsOf = html => [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
  .map(match => ({ attrs: match[1], text: match[2], src: match[1].match(/\bsrc="([^"]*)"/)?.[1] }));
const scriptHash = text => "'sha256-" + createHash('sha256').update(text.replace(/\r\n?/g, '\n')).digest('base64') + "'";

test('the original analytics CSP error is exactly the HTML CRLF normalization mismatch', () => {
  const bootstrap = scriptsOf(baseline)[0].text;
  const rawHash = createHash('sha256').update(bootstrap).digest('base64');
  assert.equal(rawHash, 'R8XC8/i4LKA6rxFzVLK6zPKB3slRG3kaIzxgHhCiQIY=');
  assert.equal(scriptHash(bootstrap), "'sha256-M/6Nvy/HHk4XG6z/pcsNCgJXQsJp6qd/x9Njx+sV6ik='");
  assert.ok(cspOf(baseline).includes(rawHash));
  assert.ok(!cspOf(baseline).includes(scriptHash(bootstrap)), 'The old CSP blocks the browser-normalized bootstrap');
});

test('analytics initializes before the app under the unchanged CSP and keeps consent denied', () => {
  const html = fs.readFileSync(path.join(candidate, 'index.html'), 'utf8');
  assert.equal(cspOf(html), cspOf(baseline), 'Console cleanup must not expand any CSP directive or remove hashes');
  const bootstrap = scriptsOf(html)[0];
  const context = vm.createContext({ dataLayer: [['existing-event']] });
  context.window = context;
  if (bootstrap.src && !/^(?:[a-z]+:)?\/\//i.test(bootstrap.src)) {
    assert.doesNotMatch(bootstrap.attrs, /\b(?:async|defer)\b/, 'Consent defaults must initialize synchronously');
    vm.runInContext(fs.readFileSync(path.join(candidate, bootstrap.src.split('?')[0]), 'utf8'), context);
  } else if (cspOf(html).includes(scriptHash(bootstrap.text))) {
    vm.runInContext(bootstrap.text, context);
  }
  assert.equal(typeof context.gtag, 'function', 'The analytics bootstrap must execute under the actual CSP');
  const queue = JSON.parse(JSON.stringify(context.dataLayer)).map(entry => Array.from(Object.values(entry)));
  assert.deepEqual(queue[0], ['existing-event']);
  assert.deepEqual(queue[1], ['consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', wait_for_update: 500 }]);
  assert.deepEqual(queue[3], ['config', 'G-JEW1SZK6SP', { send_page_view: false }]);
  assert.equal(bootstrap.text.trim(), '', 'Executable bootstrap lives in a same-origin external file');
  assert.equal(scriptsOf(html).filter(script => !script.src && !/type="application\/ld\+json"/.test(script.attrs)).length, 0);
});

test('the asset builder preserves historical hashes and authorizes future CRLF inline scripts', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-csp-builder-'));
  try {
    const release = path.join(fixture, 'audit-evidence/production-release');
    fs.mkdirSync(path.join(release, 'css'), { recursive: true });
    fs.mkdirSync(path.join(fixture, 'review/public/css'), { recursive: true });
    fs.mkdirSync(path.join(fixture, 'audit'), { recursive: true });
    fs.writeFileSync(path.join(fixture, 'review/public/css/styles.css'), '/* fixture */');
    fs.writeFileSync(path.join(release, 'css/brand-overrides.css'), '/* fixture */');
    const futureScript = '\r\nwindow.futureCspRegression = true;\r\n';
    fs.writeFileSync(path.join(release, 'index.html'), baseline.replace('</head>', '<script>' + futureScript + '</script>\r\n</head>'));
    const build = spawnSync(process.execPath, [path.join(workspace, 'audit/prepare-production-assets.mjs')], { cwd: fixture, encoding: 'utf8' });
    assert.equal(build.status, 0, build.stderr);
    const builtPolicy = cspOf(fs.readFileSync(path.join(release, 'index.html'), 'utf8'));
    for (const hash of cspOf(baseline).match(/'sha256-[^']+'/g)) assert.ok(builtPolicy.includes(hash), 'Historical CSP hash retained: ' + hash);
    assert.ok(builtPolicy.includes(scriptHash(futureScript)), 'The generated policy must authorize parser-normalized script content');
    assert.ok(builtPolicy.includes("'sha256-M/6Nvy/HHk4XG6z/pcsNCgJXQsJp6qd/x9Njx+sV6ik='"));
  } finally {
    assert.equal(path.dirname(path.resolve(fixture)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(fixture).startsWith('cm-csp-builder-'));
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test('Firebase loads in the same order from pinned local files with only map comments removed', () => {
  const html = fs.readFileSync(path.join(candidate, 'index.html'), 'utf8');
  const firebaseScripts = scriptsOf(html).filter(script => /firebase-(?:app|auth)-compat\.js/.test(script.src || ''));
  assert.equal(firebaseScripts.length, 2);
  assert.deepEqual(firebaseScripts.map(script => script.src), [
    'js/vendor/firebase/10.12.2/firebase-app-compat.js',
    'js/vendor/firebase/10.12.2/firebase-auth-compat.js',
  ]);
  const manifest = JSON.parse(fs.readFileSync(path.join(workspace, 'audit/firebase-10.12.2-provenance.json'), 'utf8'));
  for (const entry of manifest.files) {
    const body = fs.readFileSync(path.join(candidate, entry.path));
    assert.equal(digest(body), entry.vendoredSha256, 'Vendored bytes match reviewed provenance');
    assert.equal(digest(Buffer.concat([body, Buffer.from(entry.removedSuffix)])), entry.upstreamSha256, 'Reattaching only the map comment recreates the exact official SDK');
    assert.doesNotMatch(body.toString('utf8'), /\/\/[#@]\s*sourceMappingURL=/);
  }
  const license = fs.readFileSync(path.join(candidate, manifest.license.path));
  assert.equal(digest(license), manifest.license.upstreamSha256, 'License from the pinned Firebase release is preserved verbatim');
  assert.match(license.toString('utf8'), /Apache-2\.0/);
  assert.match(license.toString('utf8'), /BSD-3-Clause/);
  const context = vm.createContext({ console, setTimeout, clearTimeout, setInterval, clearInterval });
  context.self = context;
  context.window = context;
  for (const script of firebaseScripts) vm.runInContext(fs.readFileSync(path.join(candidate, script.src), 'utf8'), context);
  assert.equal(context.firebase.SDK_VERSION, '10.12.2');
  assert.equal(typeof context.firebase.initializeApp, 'function');
  assert.equal(typeof context.firebase.auth, 'function');
  assert.equal(typeof context.firebase.auth.GoogleAuthProvider, 'function');
});
