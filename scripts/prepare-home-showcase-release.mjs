import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.argv[2] || 'audit-evidence/home-showcase-20261013/candidate');
const version = '20261013-home-showcase3';
for (const name of ['index.html', 'visual-preview.php']) {
  const file = path.join(root, name);
  let source = readFileSync(file, 'utf8');
  for (const asset of ['app.js', 'cms-runtime.js', 'hero-showcase.js']) source = source.replace(new RegExp('(js/' + asset.replace('.', '\\.') + '\\?v=)[A-Za-z0-9_-]+', 'g'), '$1' + version);
  if (!source.includes('js/hero-showcase.js')) source = source.replace(/(<script[^>]+src=["']\/?js\/app\.js)/, '<script src="/js/hero-showcase.js?v=' + version + '"></script>\n$1');
  if (!source.includes('css/hero-showcase.css')) source = source.replace('</head>', '<link rel="stylesheet" href="/css/hero-showcase.css?v=' + version + '">\n</head>');
  // The preview shell reads index.html dynamically; it inherits these assets.
  writeFileSync(file, source);
}
const file = path.join(root, '.htaccess');
let rewrite = readFileSync(file, 'utf8');
if (!rewrite.includes('# CM_HOME_ENTRY')) {
  rewrite = rewrite.replace('RewriteRule ^$ cms-page.php [L]', '# CM_HOME_ENTRY: alternate homepage URL uses the same published entry.\nRewriteRule ^(?:index\\.html)?$ cms-page.php [L]');
  rewrite += '\n# CM_HOME_ENTRY: revalidate HTML; versioned static assets keep their cache policy.\n<IfModule mod_headers.c>\n  <FilesMatch "^(index\\.html|cms-page\\.php)$">\n    Header always set Cache-Control "no-cache, must-revalidate, max-age=0"\n  </FilesMatch>\n</IfModule>\n';
  rewrite = rewrite.replace('(?:cm-cms|editor-shell)', '(?:cm-cms|cm-cms-render|editor-shell)');
}
writeFileSync(file, rewrite);
console.log('Prepared versioned homepage assets and entry-point revalidation.');
