import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Patch the current recovered files in place. Latin-1 provides a byte-preserving
// round trip for all untouched content, including historical encoding artifacts.
const root = new URL('../', import.meta.url);
const files = {
  css: fileURLToPath(new URL('audit-evidence/home-showcase-20261013/candidate/css/styles.css', root)),
  app: fileURLToPath(new URL('audit-evidence/home-showcase-20261013/candidate/js/app.js', root)),
  home: fileURLToPath(new URL('audit-evidence/home-showcase-20261013/candidate/cm-home.php', root)),
  maintainedHome: fileURLToPath(new URL('visual-editor/cm-home.php', root)),
};
const check = process.argv.includes('--check');
const replaceOnce = (text, before, after, label) => {
  const beforeCount = text.split(before).length - 1;
  const afterCount = text.split(after).length - 1;
  if (!beforeCount) { assert.equal(afterCount, 1, `${label}: expected original or applied content`); return text; }
  assert.equal(beforeCount, 1, `${label}: original content must be unique`);
  assert.equal(afterCount, 0, `${label}: mixed original and patched state`);
  return text.replace(before, after);
};

const originalCards = `/* ---------- Why choose cards ---------- */
.why-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 20px;
}

.why-card {
  padding: 26px 22px 24px;
  border-radius: var(--r-card);
  background: var(--glass-med-bg);
  backdrop-filter: var(--glass-med-blur);
  -webkit-backdrop-filter: var(--glass-med-blur);
  border: 1px solid var(--glass-med-border);
  box-shadow: var(--el-1);
  transition: transform 0.26s var(--ease), box-shadow 0.26s var(--ease),
    background 0.26s var(--ease), border-color 0.26s var(--ease);
}

.why-card:hover {
  transform: translateY(-6px);
  background: rgba(255, 255, 255, 0.92);
  border-color: #fff;
  box-shadow: var(--el-3);
}

.why-card__ic {
  width: 54px;
  height: 54px;
  border-radius: 17px;
  display: grid;
  place-items: center;
  color: #fff;
  margin-bottom: 18px;
  background: linear-gradient(140deg, var(--primary-deep), var(--primary));
  box-shadow: var(--el-blue);
}

.why-card__ic svg {
  width: 24px;
  height: 24px;
}

.why-card :is(h3, h4) {
  font-size: 16px;
  font-weight: 750;
  color: var(--primary-deep);
  margin-bottom: 8px;
}

.why-card p {
  font-size: 13.5px;
  color: var(--muted);
  line-height: 1.66;
}`;
const solidCards = `/* ---------- Why choose cards: solid service information ---------- */
#why .why-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-auto-rows: 1fr;
  align-items: stretch;
  gap: 16px;
}

#why .why-card {
  min-width: 0;
  padding: 20px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid #dce6f0;
  box-shadow: 0 2px 6px rgba(18, 59, 112, .035);
  transition: border-color 180ms ease;
}

#why .why-card:hover {
  border-color: #b8cde4;
}

#why .why-card__ic {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  color: #fff;
  margin-bottom: 14px;
  background: #1769d2;
}

#why .why-card__ic svg {
  width: 22px;
  height: 22px;
}

#why .why-card :is(h3, h4) {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.35;
  color: #123b70;
  margin-bottom: 8px;
  overflow-wrap: anywhere;
}

#why .why-card p {
  font-size: 14px;
  color: var(--muted);
  line-height: 1.6;
}

@media (prefers-reduced-motion: reduce) {
  #why .why-card { transition: none; }
}`;

const before = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, readFileSync(file).toString('latin1')]));
const after = { ...before };
const eol = before.css.includes('\r\n') ? '\r\n' : '\n';
const solidCardsWithTag = solidCards.replace('#why .why-grid {', `#why .why-section-tag {
  display: inline-block;
  margin-bottom: 10px;
  color: var(--primary-deep);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: 1.2px;
  text-transform: uppercase;
}

#why .why-grid {`);
const originalBlock = originalCards.replaceAll('\n', eol);
const solidBlock = solidCards.replaceAll('\n', eol);
const completeBlock = solidCardsWithTag.replaceAll('\n', eol);
after.css = after.css.includes(originalBlock)
  ? replaceOnce(after.css, originalBlock, completeBlock, 'service card rules')
  : replaceOnce(after.css, solidBlock, completeBlock, 'service card rules and plain section tag');

// Keep the shared glass declarations intact for every other component. These
// exact lists are the two additional places where why cards opted into glass.
const glassListBefore = ['.contact-card,', '.benefit,', '.why-card,', '.order-item {'].join(eol);
const glassListAfter = ['.contact-card,', '.benefit,', '.order-item {'].join(eol);
const glassMatches = after.css.split(glassListBefore).length - 1;
assert.ok(glassMatches === 0 || glassMatches === 2, 'Expected both original shared glass selector lists or neither');
if (glassMatches === 2) after.css = after.css.replaceAll(glassListBefore, glassListAfter);
else assert.equal(after.css.split(glassListAfter).length - 1, 2, 'Expected both patched shared glass selector lists');

// Increase specificity in the existing responsive groups, preserving their
// existing 1080px tablet and 560px phone breakpoints and all sibling selectors.
const gridBefore = '  .why-grid,';
const gridAfter = '  #why .why-grid,';
const gridMatches = after.css.split(gridBefore).length - 1;
assert.ok(gridMatches === 0 || gridMatches === 2, 'Expected two responsive why grid selectors');
if (gridMatches === 2) after.css = after.css.replaceAll(gridBefore, gridAfter);
else assert.equal(after.css.split(gridAfter).length - 1, 2, 'Expected two patched responsive why grid selectors');

const headingBefore = 'Why Choose <span class="grad-text">Crackers Mela?</span>';
const headingAfter = 'Why Choose <span>Crackers Mela?</span>';
for (const key of ['app', 'home', 'maintainedHome']) after[key] = replaceOnce(after[key], headingBefore, headingAfter, `${key} why heading`);
const tagBefore = '<span class="section__tag">The CrackersMela promise</span>';
const tagAfter = '<span class="why-section-tag">The CrackersMela promise</span>';
for (const key of ['app', 'home', 'maintainedHome']) after[key] = replaceOnce(after[key], tagBefore, tagAfter, `${key} plain why section tag`);
after.app = replaceOnce(after.app, '<div class="why-card reveal">', '<div class="why-card">', 'service card entrance class');

assert.doesNotMatch(after.css.slice(after.css.indexOf('/* ---------- Why choose cards:'), after.css.indexOf('/* ---------- Filter drawer trigger')), /gradient\(|backdrop-filter|translate|scale\(|--glass|--el-/i);
assert.doesNotMatch(after.css, /^\.why-card,/m, 'Why cards must no longer opt into shared glass lists');
assert.doesNotMatch(after.app, /class="why-card reveal"/);

const changed = Object.keys(files).filter(key => before[key] !== after[key]);
if (check) assert.equal(changed.length, 0, `Trust card patch is not applied: ${changed.join(', ')}`);
else for (const key of changed) writeFileSync(files[key], Buffer.from(after[key], 'latin1'));
console.log(JSON.stringify({ mode: check ? 'check' : 'apply', changed, files: Object.values(files) }));
