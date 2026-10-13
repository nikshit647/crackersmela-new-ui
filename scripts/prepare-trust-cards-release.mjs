import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'audit-evidence/home-showcase-20261013/candidate');
const file = path.join(root, 'index.html');
const source = readFileSync(file, 'utf8');
const pattern = /(css\/styles\.css\?v=)[A-Za-z0-9_-]+/g;
if ([...source.matchAll(pattern)].length !== 1) throw new Error('Expected one base stylesheet reference');
writeFileSync(file, source.replace(pattern, '$120261013-trust-cards1'));
console.log('Prepared the versioned stylesheet containing solid service cards.');
