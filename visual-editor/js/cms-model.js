import './cms-responsive.js?v=20261005-responsive1';
export const responsive = globalThis.CMResponsive;
const objectFields = new Set(['styles','desktop','tablet','mobile','effects','gradient','position','hover','animation','elements','seo','design','content','productOrders','overrides']);
function normalizeMaps(value, key = '') {
  if (Array.isArray(value) && !(value.length === 0 && objectFields.has(key))) return value.map(item => normalizeMaps(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, child]) => [name, normalizeMaps(child, name)]));
  return value;
}
// Old saves may contain [] where an empty object belongs. Convert those fields
// before editing or comparing them; retain real lists and any pending named edits.
export const clone = value => structuredClone(normalizeMaps(value));
export const fingerprint = value => JSON.stringify(clone(value));
export const globalRoles = ['promo', 'header', 'footer'];
export function globalRole(section) {
  const source = section?.source || section?.id;
  return globalRoles.find(role => source === 'global:' + role) || null;
}
const globalSection = (doc, role) => doc?.sections?.find(section => globalRole(section) === role);
// The editor composes a canvas document; only the shared store owns these roles.
// Native baselines fill roles that have never been customized, never stale page copies.
export function applyGlobalComponents(doc, globals = {}, baseline = doc) {
  if (!doc) return doc;
  const result = clone(doc), sections = result.sections || [];
  const shared = Object.fromEntries(globalRoles.map(role => {
    const value = globals?.[role] || globalSection(baseline, role);
    return [role, value ? { ...clone(value), id: 'global:' + role, source: 'global:' + role, type: 'native', region: role === 'footer' ? 'footer' : 'header' } : null];
  }));
  result.sections = [shared.promo, shared.header, ...sections.filter(section => !globalRole(section)), shared.footer].filter(Boolean);
  if (result.id === 'home' && Array.isArray(globals?.categoryOrder)) result.categoryOrder = [...globals.categoryOrder];
  return result;
}
// A slow save may finish after more typing. Accept server normalization without
// replacing those newer edits or leaving untouched global sections out of date.
export function reconcileGlobalSave(current, snapshot, accepted, globals, baseline) {
  const saved = applyGlobalComponents(accepted || snapshot, globals, baseline);
  if (fingerprint(current) === fingerprint(snapshot)) return { document: clone(saved), saved };
  const merged = { ...globals };
  for (const role of globalRoles) {
    merged[role] = fingerprint(globalSection(current, role)) === fingerprint(globalSection(snapshot, role))
      ? globalSection(saved, role) : globalSection(current, role);
  }
  if (current.id === 'home' && fingerprint(current.categoryOrder) !== fingerprint(snapshot.categoryOrder)) merged.categoryOrder = current.categoryOrder;
  return { document: applyGlobalComponents(current, merged, current), saved };
}
export class History {
  constructor(limit = 80) { this.limit = limit; this.past = []; this.future = []; this.group = ''; this.at = 0; }
  commit(before, group = '') {
    if (!group || this.group !== group || Date.now() - this.at > 700) this.past.push(clone(before));
    if (this.past.length > this.limit) this.past.shift();
    this.future = []; this.group = group; this.at = Date.now();
  }
  undo(current) { if (!this.past.length) return current; this.future.push(clone(current)); this.group = ''; return this.past.pop(); }
  redo(current) { if (!this.future.length) return current; this.past.push(clone(current)); this.group = ''; return this.future.pop(); }
}
export function newSection(type) {
  const names = {text:'Text',heading:'Heading',image:'Image',button:'Button',video:'Video',divider:'Divider',icon:'Icon',container:'Container',banner:'Banner',productGrid:'Products',faq:'Questions and answers',hero:'Welcome section',imageText:'Image and text',features:'Highlights',testimonials:'Customer stories',contact:'Contact',custom:'Blank section'};
  if (!Object.hasOwn(names, type)) throw new TypeError('Choose a supported section.');
  const section = { id: 's-' + crypto.randomUUID(), type, region: 'main', name: names[type], hidden: false, content: {}, elements: {}, styles: {desktop:{},tablet:{},mobile:{}}, hover: {}, animation: {}, effects: {} };
  if (type === 'text') section.content = { heading: 'New heading', text: 'Write your content here.' };
  if (type === 'heading') section.content = { heading: 'New heading' };
  if (type === 'image') section.content = { src: '', alt: '' };
  if (type === 'video') section.content = { src: '', alt: 'Video' };
  if (type === 'icon') section.content = { icon: 'star', alt: 'Star' };
  if (type === 'divider') section.styles.desktop = {borderStyle:'solid',borderWidth:'1px',borderColor:'#d9e2ec',height:'0',paddingTop:'0',paddingBottom:'0'};
  if (type === 'container' || type === 'custom') section.styles.desktop = {minHeight:'200px'};
  if (type === 'button') section.content = { buttonText: 'Shop now', href: '#/products', newTab: false };
  if (type === 'banner') section.content = { heading: 'Celebrate with Crackers Mela', text: 'Add your announcement.', buttonText: 'Shop now', href: '#/products', src: '', alt: '' };
  if (type === 'hero') section.content = { heading: 'Make every celebration brighter', text: 'Share your next celebration with Crackers Mela.', buttonText: 'Explore our collection', href: '#/products', src: '', alt: '' };
  if (type === 'imageText') section.content = { heading: 'A story worth sharing', text: 'Add your story here.', src: '', alt: '' };
  if (type === 'features') section.content = { heading: 'Why celebrate with us', entries: [{title:'Quality you can trust',text:'Tell your customers what makes you special.'},{title:'Made for celebrations',text:'Share another reason to choose your store.'}] };
  if (type === 'testimonials') section.content = { heading: 'Customer stories', entries: [{title:'Customer name',text:'Add a real customer quote here.'}] };
  if (type === 'contact') section.content = { heading: 'Let’s plan your celebration', text: 'Add your contact details here.', buttonText: 'Contact us', href: '#/contact' };
  if (type === 'productGrid') section.content = { heading: 'Shop our collection', productIds: [], category: '', limit: 8, columns: 4, cardStyle: 'default', imageRatio: 'square', showPrice: true, showSalePrice: true, showCart: true, showBadge: true, sort: 'featured' };
  if (type === 'faq') section.content = { heading: 'Frequently asked questions', items: [{question:'Add your question',answer:'Write the answer here.'}] };
  return section;
}
export function newElement(kind, options = {}) {
  const names = {text:'Text',heading:'Heading',image:'Image',button:'Button',video:'Video',divider:'Divider',icon:'Icon',container:'Container'};
  if (!Object.hasOwn(names, kind)) throw new TypeError('Choose a supported element.');
  const element = {kind:kind === 'heading' ? 'text' : kind,name:names[kind],added:true,parentId:options.parentId || 'eroot',hidden:false,styles:{desktop:{},tablet:{},mobile:{}},effects:{},hover:{},animation:{}};
  if (kind === 'text' || kind === 'heading') {
    element.text = kind === 'heading' ? 'Your heading' : 'Write your text here.';
    element.styles.desktop = {fontSize:kind === 'heading' ? '40px' : '18px',fontWeight:kind === 'heading' ? '700' : '400',maxWidth:'100%'};
  }
  if (kind === 'image') { element.src = options.src || ''; element.alt = options.alt || ''; element.styles.desktop = {width:'320px',maxWidth:'100%',objectFit:'cover'}; }
  if (kind === 'video') { element.src = options.src || ''; element.alt = options.alt || 'Video'; element.styles.desktop = {width:'480px',maxWidth:'100%'}; }
  if (kind === 'button') { element.text = 'Shop now'; element.href = '#/products'; element.newTab = false; }
  if (kind === 'icon') { element.icon = 'star'; element.alt = 'Star'; element.styles.desktop = {width:'48px',height:'48px',color:'#1565c0'}; }
  if (kind === 'divider') element.styles.desktop = {width:'100%',borderStyle:'solid',borderWidth:'1px',borderColor:'#d9e2ec',height:'0'};
  if (kind === 'container') element.styles.desktop = {width:'100%',minHeight:'160px',paddingTop:'24px',paddingRight:'24px',paddingBottom:'24px',paddingLeft:'24px',borderRadius:'12px',backgroundColor:'#f2f6fb'};
  return element;
}
export function moveSection(doc, id, delta) {
  const index = doc.sections.findIndex(s => s.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= doc.sections.length) return false;
  if (globalRole(doc.sections[index]) || globalRole(doc.sections[target])) return false;
  if ((doc.sections[index].region || 'main') !== (doc.sections[target].region || 'main')) return false;
  const [section] = doc.sections.splice(index, 1); doc.sections.splice(target, 0, section); return true;
}
export function safePreviewUrl(value) {
  if (!value) return '';
  try { const url = new URL(value, location.origin); return ['http:', 'https:'].includes(url.protocol) && url.origin === location.origin ? url.href : ''; } catch { return ''; }
}
