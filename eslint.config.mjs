import globals from 'globals';

// Correctness checks for the recovered plain-JavaScript client and review tools.
// Unused legacy helpers are documented separately, rather than deleted in bulk.
const correctness = {
  'no-undef': 'error',
  'no-dupe-args': 'error',
  'no-dupe-keys': 'error',
  'no-duplicate-case': 'error',
  'no-unreachable': 'error',
  'valid-typeof': 'error',
  'constructor-super': 'error',
  'no-unsafe-finally': 'error',
};
export default [
  { ignores: ['node_modules/**', 'live-*', 'audit-security-proof.cjs', 'audit-evidence/**'] },
  { files: ['review/public/js/*.js'], languageOptions: { ecmaVersion: 'latest', sourceType: 'script', globals: { ...globals.browser, gtag: 'readonly', firebase: 'readonly' } }, rules: correctness },
  { files: ['review/*.mjs', 'tests/*.mjs', 'eslint.config.mjs'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node }, rules: correctness },
  // These functions are serialized and injected into the browser by the local server.
  { files: ['review/server.mjs'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
];
