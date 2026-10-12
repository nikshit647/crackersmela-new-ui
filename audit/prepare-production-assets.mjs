import fs from 'node:fs';
import crypto from 'node:crypto';

const root = 'audit-evidence/production-release/';
// Preserve the complete reviewed layout/responsive fixes and approved logo sizing.
fs.copyFileSync('review/public/css/styles.css', root + 'css/styles.css');
let html = fs.readFileSync(root + 'index.html', 'utf8');
if (!/<base\b/.test(html)) html = html.replace('<head>', '<head>\n<base href="/">');
// Cache-bust stamp must be NEWER than whatever is live, otherwise returning
// visitors keep the previously cached styles.css/app.js and never receive the
// category section or the mobile trust-strip fix.
html = html.replace(/css\/styles\.css\?v=[^"']+/, 'css/styles.css?v=20261003-nav1');
html = html.replace(/js\/app\.js\?v=[^"']+/, 'js/app.js?v=20261003-nav1');
if (!html.includes('js/accessibility.js')) html = html.replace('</body>', '<script src="js/accessibility.js?v=20261003-nav1"></script>\n</body>');
// Retain previously reviewed hashes, including historical CRLF hashes. Browsers
// normalize CRLF/CR to LF before hashing inline script text during HTML parsing.
const previousHashes = [...html.matchAll(/<meta http-equiv="Content-Security-Policy"[^>]*>/g)]
  .flatMap(match => match[0].match(/'sha256-[A-Za-z0-9+/]+={0,2}'/g) || []);
html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\s*/g, '');
const currentHashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .filter(match => !/\bsrc=/.test(match[0]))
  .map(match => "'sha256-" + crypto.createHash('sha256').update(match[1].replace(/\r\n?/g, '\n')).digest('base64') + "'");
const hashes = [...new Set([...previousHashes, ...currentHashes])];
const csp = [
  "default-src 'self'",
  "script-src 'self' " + hashes.join(' ') + ' https://www.gstatic.com https://www.googletagmanager.com https://apis.google.com',
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.googleapis.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://crackersmela-e1028.firebaseapp.com",
  'frame-src https://crackersmela-e1028.firebaseapp.com https://accounts.google.com',
  "object-src 'none'", "base-uri 'self'", "form-action 'self'",
].join('; ');
html = html.replace('<head>', '<head>\n<meta http-equiv="Content-Security-Policy" content="' + csp + '">');

// Encoding guard: U+FFFD means text was decoded with the wrong codec at some
// point in the pipeline. It renders as a black diamond with a question mark, so
// fail the build rather than shipping a mojibake character to production.
const assertCleanUtf8 = (label, body) => {
  const bad = [...body].filter(c => c === '\uFFFD').length;
  if (bad > 0) throw new Error(`${label} contains ${bad} U+FFFD replacement character(s) - fix the encoding before deploying`);
};
assertCleanUtf8('index.html', html);
fs.writeFileSync(root + 'index.html', html);
fs.writeFileSync(root + '.htaccess', `RewriteEngine On

# Canonical HTTPS for the two application origins.
RewriteCond %{HTTP_HOST} ^www\\.crackersmela\\.com$ [NC]
RewriteRule ^ https://crackersmela.com%{REQUEST_URI} [R=301,L]
RewriteCond %{HTTPS} !=on
RewriteCond %{HTTP_HOST} ^(?:admin\\.)?crackersmela\\.com$ [NC]
RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]

# Never serve source backups, private files, or executable uploaded content.
RewriteRule (^|/)\\.(?!well-known(?:/|$)) - [F,L]
RewriteRule ^(?:cm-security|cm-commerce|cm-email|cm-email-templates|cm-invoice|cm-invoice-pdf)\.php$ - [F,L,NC]
RewriteRule (^|/)(?:data|node_modules|tests|audit|audit-evidence|audit-artifacts)(?:/|$) - [F,L,NC]
RewriteRule (?:\\.(?:bak(?:[-.].*)?|old|orig|save|sql|log|ini|env|conf|zip|tar|gz)|~)$ - [F,L,NC]
RewriteRule ^(?:uploads|images)/.*\\.(?:php[0-9]?|phtml|phar|cgi|pl|py|sh)(?:/|$) - [F,L,NC]

RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(?:product|products|track|about|contact|faq|shipping|safety|wholesale|returns|terms|privacy|price-list)(?:/.*)?$ index.html [L]
RewriteRule ^sitemap\\.xml$ sitemap.php [L]
`);
const responsive = `\n/* Verified order lookup keeps both fields usable on narrow screens. */
.track-form { flex-wrap: wrap; }
.track-form input { min-width: 160px; flex: 1 1 180px; }
@media (max-width: 480px) { .track-form input { flex-basis: 100%; } }
`;
let brand = fs.readFileSync(root + 'css/brand-overrides.css', 'utf8');
if (!brand.includes('Verified order lookup')) fs.writeFileSync(root + 'css/brand-overrides.css', brand + responsive);
brand = fs.readFileSync(root + 'css/brand-overrides.css', 'utf8');
if (!brand.includes('#authBody [hidden]')) fs.appendFileSync(root + 'css/brand-overrides.css', '\n#authBody [hidden] { display: none !important; }\n');
fs.writeFileSync('audit/production-header-policy.json', JSON.stringify({
  'Content-Security-Policy': csp + "; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=86400',
}, null, 2) + '\n');
console.log('Reviewed assets, CSP, responsive lookup, and hosting rules prepared locally.');
