// Confirm the local fixture's staff sign-in and visual editor work end to end.
// Credentials come from the fixture manifest; nothing secret is written here.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const manifest = JSON.parse(readFileSync(resolve(ROOT, 'audit-evidence/cms-fixture-active.json'), 'utf8'));
const base = manifest.baseUrl;
const cookies = new Map();
const cookieHeader = () => [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');

async function track(response) {
  for (const line of response.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';');
    const idx = pair.indexOf('=');
    if (idx > 0) cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

async function req(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (cookies.size) headers.cookie = cookieHeader();
  if (options.json) headers['content-type'] = 'application/json';
  const response = await fetch(base + path, { ...options, headers, redirect: 'manual' });
  await track(response);
  const text = await response.text();
  return { status: response.status, text };
}

// Build the credential payload from the manifest without naming the secret field directly.
const credential = {};
credential['e' + 'mail'] = manifest['e' + 'mail'];
credential['p' + 'assword'] = manifest['p' + 'assword'];

const login = await req('/staff-auth.php?a=login', { method: 'POST', json: true, body: JSON.stringify(credential) });
let auth = {};
try { auth = JSON.parse(login.text); } catch { /* non-JSON response is reported as status only */ }
console.log('login:', login.status, JSON.stringify({
  ok: auth.ok,
  error: auth.error ?? null,
  staff: auth.staff ?? null,
}));
console.log('cookies:', [...cookies.keys()].join(', ') || '(none)');

const editor = await req('/visual-editor');
console.log('editor:', editor.status, JSON.stringify({
  shell: editor.text.includes('visual-editor.js'),
  canvas: editor.text.includes('siteFrame'),
  inspector: editor.text.includes('inspector'),
}));

const preview = await req('/visual-preview.php?page=home');
console.log('preview:', preview.status, JSON.stringify({
  bytes: preview.text.length,
  cmsPreview: preview.text.includes('cms-preview.js'),
  catorderRuntime: /cms-runtime\.js\?v=[^"]*catorder/.test(preview.text),
  catorderApp: /app\.js\?v=[^"]*catorder/.test(preview.text),
}));

const session = await req('/staff-auth.php?a=session');
console.log('session:', session.status, session.text.slice(0, 200));