// Load one scoped stylesheet in the public shell and its existing editor preview.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'audit-evidence/home-showcase-20261013/candidate');
const version = '20261013-category-cards2';
mkdirSync(path.join(root, 'css'), { recursive: true });
copyFileSync('visual-editor/css/category-cards.css', path.join(root, 'css/category-cards.css'));
const file = path.join(root, 'index.html');
let source = readFileSync(file, 'utf8');
if (source.includes('css/category-cards.css')) {
  source = source.replace(/(css\/category-cards\.css\?v=)[A-Za-z0-9_-]+/g, '$1' + version);
} else {
  if (!source.includes('</head>')) throw new Error('Homepage head not found');
  source = source.replace('</head>', '<link rel="stylesheet" href="/css/category-cards.css?v=' + version + '">\n</head>');
}
writeFileSync(file, source);
console.log('Prepared solid-color category cards for public and editor views.');
