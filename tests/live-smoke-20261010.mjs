import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const binary = path.join(process.env.APPDATA, 'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const session = 'live-smoke-20261010';
const output = path.resolve('audit-evidence/live-smoke-20261010');
mkdirSync(output, { recursive: true });
const raw = (...a) => execFileSync(binary, ['--session', session, ...a, '--json'], { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 120000 });
const run = (...a) => { const v = JSON.parse(raw(...a)); assert.equal(v.success, true, v.error || a[0]); return v.data; };
const ev = c => run('eval', '-b', Buffer.from(c).toString('base64')).result;
const wait = c => run('wait', '--fn', c);

await new Promise((res, rej) => {
  const ch = spawn(binary, ['--session', session, 'open', 'https://crackersmela.com/', '--json'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; ch.stdout.on('data', c => { out += c; if (out.includes('"success":true')) res(); });
  ch.once('error', rej); ch.once('exit', c => c === 0 ? res() : rej(new Error('launch')));
});
run('set', 'viewport', '1440', '900');
wait("document.readyState==='complete'");
await new Promise(r => setTimeout(r, 2500));

console.log('title      :', ev("document.title"));
console.log('h1         :', ev("document.querySelector('#view h1')?.textContent?.trim().slice(0,60)"));
console.log('cards      :', ev("document.querySelectorAll('.prod-card').length"));
console.log('brand pills:', ev("document.querySelectorAll('.product-brand-pill,[class*=brand]').length"));
console.log('cms runtime:', ev("typeof window.CMCms + ' / page=' + (window.CMCms?.page?.() ?? 'n/a')"));
console.log('gallery bnd:', ev("!!document.querySelector('[data-product-gallery],.prod-detail')"));
console.log('viewport ok:', ev("document.documentElement.scrollWidth <= window.innerWidth + 2"));
console.log('console err:', JSON.stringify(run('errors').errors || []));
run('screenshot', path.join(output, 'live-home-desktop.png'));

run('set', 'viewport', '390', '844');
await new Promise(r => setTimeout(r, 1500));
console.log('mobile overflow:', ev("document.documentElement.scrollWidth <= window.innerWidth + 2"));
run('screenshot', path.join(output, 'live-home-mobile.png'));
console.log('console err (after mobile):', JSON.stringify(run('errors').errors || []));
run('close');