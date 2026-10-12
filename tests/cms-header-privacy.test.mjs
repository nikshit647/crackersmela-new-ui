import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const runtime = readFileSync(new URL('../visual-editor/js/cms-runtime.js', import.meta.url), 'utf8');
const sentinel = 'cms-private-capture@example.invalid';

// A minimal DOM exercises the shipped collector, including its selector and
// child-index behavior. The account values and handlers are entirely synthetic.
class Element {
  constructor(tag, attributes = {}, children = [], text = '') {
    this.tagName = tag.toUpperCase(); this.attributes = attributes;
    this.children = children; this.childNodes = []; this.dataset = {};
    this.hidden = false; this.text = text;
    const classes = (attributes.class || '').split(' ');
    this.classList = Object.assign(classes, { contains: value => classes.includes(value) });
    for (const child of children) child.parentElement = this;
  }
  get id() { return this.attributes.id || ''; }
  get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  matches(selectors) {
    return selectors.split(',').some(value => {
      const selector = value.trim();
      if (selector.startsWith('#')) return this.id === selector.slice(1);
      if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
      const attribute = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
      if (attribute) return this.attributes[attribute[1]] !== undefined && (attribute[2] === undefined || this.attributes[attribute[1]] === attribute[2]);
      return this.tagName === selector.toUpperCase();
    });
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  querySelector(selector) {
    for (const child of this.children) { if (child.matches(selector)) return child; const found = child.querySelector(selector); if (found) return found; }
    return null;
  }
}

function header(signedIn) {
  const node = (tag, attrs, children, text) => new Element(tag, attrs, children, text);
  const email = node('span', { id: 'menuEmail' }, [], sentinel);
  const menu = node('div', { id: 'accountMenu', 'aria-label': 'Account menu', 'aria-hidden': signedIn ? 'false' : 'true' }, [
    node('div', { class: 'account-menu__head' }, [node('div', { class: 'account-menu__meta' }, [email])]),
  ]);
  const chip = node('button', { id: 'accountChip' }, [], 'Synthetic member');
  let clicks = 0; chip.onclick = () => clicks++;
  const account = node('div', { id: 'accountArea', class: 'account-area' }, [node('button', { id: 'userIconBtn' }), chip, menu]);
  const logo = node('a', { href: '#/', 'aria-label': 'Store home' }, [node('img', { src: 'images/logo.png', alt: 'Store logo' })]);
  const navigation = node('a', { href: '#/products' }, [], 'Browse products');
  const categories = node('div', {id:'navCatMenu'}, [node('a', {href:'/category/sparklers'}, [], 'Sparklers 12 products')]);
  const trailing = node('a', { href: '#/contact' }, [], 'Contact');
  const root = node('header', { id: 'navbar' }, [node('div', { class: 'nav-inner' }, [
    node('button', { id: 'mobileToggle' }), logo, node('nav', {}, [navigation,categories]), node('div', { id: 'navSearch' }),
    node('div', { class: 'nav-actions' }, [node('button', { id: 'navSearchOpenBtn' }), node('button', { id: 'wishBtn' }), node('button', { id: 'cartBtn' }), account, trailing]),
  ])]);
  return { root, account, menu, email, chip, trailing, clicks: () => clicks };
}

for (const signedIn of [false, true]) test(`CMS capture excludes the whole account area while ${signedIn ? 'signed in' : 'signed out'}`, () => {
  const fixture = header(signedIn), context = vm.createContext({ window: {}, HTMLElement: Element, Node: { TEXT_NODE: 3 }, CSS: { escape: String } });
  vm.runInContext(runtime.replace('Object.freeze({ beforeRoute,', 'Object.freeze({ collectElements, beforeRoute,'), context);
  const entries = context.window.CMCms.collectElements(fixture.root);
  assert.equal([...entries.keys()].some(key => key === 'e0.4.3' || key.startsWith('e0.4.3.')), false);
  assert.equal(JSON.stringify([...entries.values()].map(entry => entry.descriptor)).includes(sentinel), false);
  assert.equal(entries.get('e0.1.0').descriptor.src, 'images/logo.png');
  assert.equal(entries.get('e0.2.0').descriptor.href, '#/products');
  assert.equal([...entries.keys()].some(key => key === 'e0.2.1' || key.startsWith('e0.2.1.')), false, 'Live category links and counts never use positional CMS header snapshots');
  assert.equal(JSON.stringify([...entries.values()].map(entry => entry.descriptor)).includes('Sparklers 12 products'), false);
  assert.equal(entries.get('e0.4.4').node, fixture.trailing, 'Skipping capture never shifts sibling IDs');
  assert.equal(fixture.email.textContent, sentinel, 'Live account DOM remains application-owned');
  assert.equal(fixture.account.dataset.cmsElement, undefined);
  fixture.chip.onclick(); assert.equal(fixture.clicks(), 1, 'Existing account handlers remain attached');
});

test('the privacy boundary ships identically in both source locations', () => {
  for (const file of ['cm-cms.php', 'js/cms-runtime.js']) assert.equal(
    readFileSync(new URL('../visual-editor/' + file, import.meta.url), 'utf8'),
    readFileSync(new URL('../audit-evidence/production-release/' + file, import.meta.url), 'utf8'),
  );
});
