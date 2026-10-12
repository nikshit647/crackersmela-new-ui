import {responsive, clone, fingerprint, History, newSection, newElement, moveSection, safePreviewUrl, globalRole, applyGlobalComponents, reconcileGlobalSave } from './cms-model.js?v=20261008-globals1';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = {
  desktop:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>', tablet:'<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M10 18h4"/>', mobile:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M10 18h4"/>',
  pages:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h6"/>', sections:'<rect x="3" y="3" width="18" height="7" rx="1"/><rect x="3" y="14" width="18" height="7" rx="1"/>', add:'<path d="M12 5v14M5 12h14"/>', content:'<path d="M4 5h16M4 10h16M4 15h10M4 20h12"/>', media:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1"/><path d="m3 17 6-6 4 4 3-3 5 5"/>', design:'<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h5a4 4 0 0 0 4-4c0-3-4-6-9-6Z"/><path d="M7 8h.01M6 13h.01M11 6h.01M16 8h.01"/>', typography:'<path d="M4 5V3h16v2M12 3v18M8 21h8"/>', buttons:'<rect x="2" y="6" width="20" height="12" rx="4"/><path d="M8 12h8m-3-3 3 3-3 3"/>', layout:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>', animations:'<path d="m13 2-9 12h7l-1 8 10-12h-8l1-8Z"/>', seo:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>', settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>', undo:'<path d="M3 9h11a6 6 0 0 1 0 12M3 9l5-5M3 9l5 5"/>', redo:'<path d="M21 9H10a6 6 0 0 0 0 12M21 9l-5-5M21 9l-5 5"/>', eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>', hide:'<path d="m3 3 18 18M10 5h2c6 0 10 7 10 7s-1 3-4 5M6 6a24 24 0 0 0-4 6s4 7 10 7h2"/>', copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>', trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>', close:'<path d="M18 6 6 18M6 6l12 12"/>', up:'<path d="m6 14 6-6 6 6"/>', down:'<path d="m6 10 6 6 6-6"/>', drag:'<path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"/>', pointer:'<path d="m4 3 7 18 3-7 7-3L4 3Z"/>', moon:'<path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z"/>', sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>', faq:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5M12 17h.01"/>', banner:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 9h8M6 13h12M6 17h5"/>', paste:'<path d="M9 4H5v17h14V4h-4"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M8 11h8M8 15h6"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.sections}</svg>`;
const navItems = [['pages','Pages'],['elements','Elements'],['uploads','Uploads'],['sections','Sections']];
icons.elements=icons.grid; icons.uploads=icons.media;
const state = {pages:[],page:null,doc:null,version:0,csrf:'',saved:'',savedAt:null,publishedAt:null,history:new History(),sectionId:null,elementId:null,device:'desktop',nav:'pages',tab:'content',preview:false,ready:false,loading:false,saving:null,conflict:false,clipboard:null,products:[],categories:[],media:[],mediaPage:1,mediaTotal:0,mediaSelected:null,mediaApply:null,mediaQuery:'',mediaSequence:0};
state.productCategory='all';state.productReorder=null;state.pendingReorder=null;state.categoryReorder=null;state.startingCategoryReorder=false;
let autosaveTimer, loadSequence = 0;
const dirty = () => state.doc && fingerprint(state.doc) !== state.saved;
const section = () => state.doc?.sections.find(s => s.id === state.sectionId);
const target = () => state.elementId ? section()?.elements?.[state.elementId] : section();
const readOnlyCount = (sectionId=state.sectionId,elementId=state.elementId) => !!(elementId && $('#siteFrame')?.contentWindow.CMCms?.selectionInfo?.(sectionId,elementId)?.readOnlyText);
const countNotice = '<p class="properties-hint">Product count updates automatically from the catalog. You can adjust its appearance here.</p>';
const message = (type, extra = {}) => { if (state.ready) $('#siteFrame').contentWindow.postMessage({channel:'cm-editor',type,...extra},location.origin); };
function toast(text) { const element=document.createElement('div'); element.className='toast';element.textContent=text;$('#toasts').append(element);setTimeout(()=>element.remove(),5000); }
function showError(error) { $('#errorBanner').hidden=false;$('#errorBanner span').textContent=error.message || String(error); }
function clearError() { $('#errorBanner').hidden=true; }
async function api(action, data, endpoint='cms-api.php', pageId=state.page?.id) {
  const query = new URLSearchParams({a:action});
  if (pageId) query.set('page',pageId);
  const response = await fetch('/'+endpoint+'?'+query,{method:data?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:data?{'Content-Type':'application/json','X-CSRF-Token':state.csrf}:{},...(data?{body:JSON.stringify(data)}:{})});
  let result;try{result=await response.json();}catch{throw new Error('The server returned an unreadable response. Your edits are still here.');}
  if(!response.ok || result.ok===false){const error=new Error(result.error||'The request failed. Please try again.');error.status=response.status;throw error;}
  return result;
}
const isProductsPage=()=> (state.doc?.templatePage||state.page?.templatePage||state.page?.id)==='products';
const isShopSection=sec=>isProductsPage()&&sec?.type==='native'&&sec.source==='products:shop-layout';
const isHomePage=()=> (state.doc?.templatePage||state.page?.templatePage||state.page?.id)==='home';
const isReorderSection=sec=>isShopSection(sec)||(isHomePage()&&!!sec&&(sec.type==='productGrid'||sec.content?.limit!==undefined));
const isCategoryReorderSection=sec=>isHomePage()&&sec?.type==='native'&&sec.source==='home:shop-categories';
const sectionScope=id=>'section:'+id;
const validSectionScope=scope=>typeof scope==='string'&&scope.startsWith('section:')&&state.doc?.sections.some(sec=>sectionScope(sec.id)===scope&&isReorderSection(sec));
const categoryName=id=>id==='all'?'All Products':state.categories.find(category=>category.id===id)?.name||'Products';
const validProductCategory=id=>id==='all'||state.categories.some(category=>category.id===id);
async function refreshProductCatalog() {
  const result=await api('products');state.products=result.products||[];state.categories=result.categories||[];
  if(!state.doc?.productOrders)return;
  const products=new Map(state.products.map(product=>[product.id,product]));
  const cleaned={};
  for(const [scope,ids] of Object.entries(state.doc.productOrders)) {
    if((!validProductCategory(scope)&&!validSectionScope(scope))||!Array.isArray(ids))continue;
    cleaned[scope]=[...new Set(ids)].filter(id=>products.has(id)&&(scope==='all'||validSectionScope(scope)||products.get(id).cats.includes(scope)));
  }
  if(JSON.stringify(cleaned)!==JSON.stringify(state.doc.productOrders)) {
    state.history.commit(clone(state.doc));state.doc.productOrders=cleaned;message('apply',{document:state.doc});status();
  }
}
function endProductReorder() {
  state.pendingReorder=null;state.startingReorder=false;
  if(!state.productReorder)return;
  state.productReorder=null;message('product-reorder',{active:false});$('#canvasMode').textContent=state.preview?'Visitor preview':'Click to edit';renderInspector();
}
function validCategoryOrder(ids,expected=null) {
  if(!Array.isArray(ids)||ids.length<2||ids.length>state.categories.length)return false;
  const known=new Set(state.categories.map(category=>category.id));
  if(new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!known.has(id)))return false;
  return !expected||(expected.length===ids.length&&ids.every(id=>expected.includes(id)));
}
/* The three surfaces that can be reordered, and where each one saves to. */
const categoryTargets=['grid','menu','filter'];
const categoryTarget=target=>categoryTargets.includes(target)?target:'grid';
const categoryTargetName=target=>target==='menu'?'Header menu':target==='filter'?'Category filter':'Home page';
function endCategoryReorder(keep=false) {
  const mode=state.categoryReorder;
  if(mode?.saving)return;
  const active=mode||state.startingCategoryReorder||state.categoryPreparation;
  if(mode&&!keep&&mode.startDoc){
    state.doc=mode.startDoc;state.history=mode.startHistory;
    message('apply',{document:state.doc});
    message('category-order-preview',{ids:mode.startIds});
  }
  if(!mode&&state.categorySession){state.doc=state.categorySession.startDoc;state.history=state.categorySession.startHistory;message('apply',{document:state.doc});}
  state.categoryReorder=null;state.startingCategoryReorder=false;
  state.categorySession=null;
  state.categoryPreparation=null;
  if(!active)return;
  // Three surfaces can hold this mode, so the canvas is told which one closed.
  message('category-reorder',{active:false,...(mode?{sectionId:mode.sectionId,target:mode.target}:{})});
  $('#canvasMode').textContent=state.preview?'Visitor preview':'Click to edit';renderInspector();
}
function endReordering() { state.blockPreparation=null;endCategoryReorder();endProductReorder();endProductBlocks(); }
function endProductBlocks(keep=true) {
  const mode=state.blockReorder;if(!mode)return;
  state.blockReorder=null;state.blockDrag=null;
  state.history=mode.startHistory;
  if(keep){if(fingerprint(state.doc)!==fingerprint(mode.startDoc))state.history.commit(mode.startDoc);}
  else{state.doc=mode.startDoc;message('apply',{document:state.doc});}
  renderInspector();status();
}
async function openProductBlocks() {
  if(!state.ready||state.loading||state.busy||state.preview||state.blockReorder||state.blockPreparation||state.categoryReorder?.saving)return;
  endReordering();
  if(!isProductsPage()){state.pendingBlockEntry=true;await loadPage('products');return;}
  const preparing={page:state.page.id};state.blockPreparation=preparing;
  if(!await saveDraft(false)){if(state.blockPreparation===preparing)state.blockPreparation=null;return;}
  if(state.blockPreparation!==preparing||state.page.id!==preparing.page||!state.ready||state.loading)return;
  state.blockPreparation=null;
  const blocks=$('#siteFrame').contentWindow.CMCms?.productBlocks?.();
  if(!blocks?.groups?.length){toast('The Products page blocks are still loading. Try again in a moment.');return;}
  const pageItems=state.doc.sections.filter(sec=>(sec.region||'main')==='main').map(sec=>({id:sec.id,name:sectionLabel(sec)}));
  state.blockReorder={sectionId:blocks.sectionId,groups:[{id:'page',name:'Page sections',items:pageItems},...blocks.groups],startDoc:clone(state.doc),startHistory:state.history};
  state.history=new History();state.sectionId=blocks.sectionId;state.elementId=null;
  $('#editor').classList.remove('show-library');$('#editor').classList.add('show-inspector');
  renderInspector();status();
}
function moveProductBlock(groupId,id,targetId) {
  const mode=state.blockReorder,group=mode?.groups.find(item=>item.id===groupId);
  if(!group||id===targetId||![id,targetId].every(key=>group.items.some(item=>item.id===key)))return;
  const section=state.doc.sections.find(item=>item.id===mode.sectionId);if(!section)return;
  const known=group.items.map(item=>item.id);
  const saved=groupId==='page'?state.doc.sections.filter(item=>known.includes(item.id)).map(item=>item.id):section.content.blockOrders?.[groupId]||known;
  const ids=[...saved.filter(key=>known.includes(key)),...known.filter(key=>!saved.includes(key))];
  const from=ids.indexOf(id),to=ids.indexOf(targetId);if(from<0||to<0)return;
  ids.splice(from,1);ids.splice(to,0,id);
  changed('blocks:'+groupId,doc=>{
    if(groupId==='page'){
      const nodes=new Map(doc.sections.filter(item=>known.includes(item.id)).map(item=>[item.id,item]));let index=0;
      doc.sections=doc.sections.map(item=>nodes.has(item.id)?nodes.get(ids[index++]):item);
    }else{section.content.blockOrders??={};section.content.blockOrders[groupId]=ids;}
  },{inspector:true,tree:true});
}
function renderProductBlocks(root) {
  const mode=state.blockReorder,sec=state.doc.sections.find(item=>item.id===mode.sectionId);
  root.classList.remove('is-advanced');
  root.innerHTML=panelHead('Reorder Products sections','Products layout')+'<p class="block-order-help">Drag the handles or use the arrows. The page previews each move. Filter blocks stay together so mobile filters keep working.</p>'+mode.groups.map(group=>{
    const known=group.items.map(item=>item.id),saved=group.id==='page'?state.doc.sections.filter(item=>known.includes(item.id)).map(item=>item.id):sec.content.blockOrders?.[group.id]||known;
    const ids=[...saved.filter(id=>known.includes(id)),...known.filter(id=>!saved.includes(id))];
    return `<section class="block-order-group"><h3>${esc(group.name)}</h3><div class="block-order-list">${ids.map((id,index)=>`<div class="block-order-row ${state.blockDrag?.id===id?'is-dragging':''}" data-block-group="${esc(group.id)}" data-block-id="${esc(id)}"><button class="block-order-grip" type="button" data-block-handle aria-label="Drag ${esc(group.items.find(item=>item.id===id).name)}">${icon('drag')}</button><span>${esc(group.items.find(item=>item.id===id).name)}</span><button class="block-order-arrow" type="button" data-block-move="${esc(ids[index-1]||'')}" aria-label="Move ${esc(group.items.find(item=>item.id===id).name)} up" ${index===0?'disabled':''}>${icon('up')}</button><button class="block-order-arrow" type="button" data-block-move="${esc(ids[index+1]||'')}" aria-label="Move ${esc(group.items.find(item=>item.id===id).name)} down" ${index===ids.length-1?'disabled':''}>${icon('down')}</button></div>`).join('')}</div></section>`;
  }).join('')+'<div class="block-order-actions"><button class="button button-primary" data-block-save>Save layout draft</button><button class="button button-outline" data-block-cancel>Cancel</button></div><p class="properties-hint">Save &amp; Publish above applies this page layout to the live website.</p>';
}
async function startCategoryReorder(sectionId=state.sectionId, target='grid') {
  const surface=categoryTarget(target);
  const sec=state.doc?.sections.find(item=>item.id===sectionId);
  if(!sec||state.preview||state.loading||!state.ready||state.categoryPreparation||state.startingCategoryReorder||state.categoryReorder)return;
  // Only the Home grid keeps this order in the document that is on screen. The
  // mega-menu and the products filter are edited on the Products page, so they
  // open there and are saved to the Home document instead.
  if(surface==='grid'&&!isCategoryReorderSection(sec))return;
  const preparation={page:state.page.id};state.categoryPreparation=preparation;
  endProductReorder();endProductBlocks();
  if(!await saveDraft(false)){if(state.categoryPreparation===preparation)state.categoryPreparation=null;return;}
  if(state.categoryPreparation!==preparation||state.page.id!==preparation.page)return;
  state.startingCategoryReorder=true;
  try{
    const home=await api('load',null,'cms-api.php','home');
    if(!state.startingCategoryReorder||state.categoryPreparation!==preparation||state.page.id!==preparation.page)return;
    receiveGlobals(home);
    if(state.page.id==='home'&&home.draft){state.doc=clone(home.draft);state.version=home.version;}
    state.doc=withEditorGlobals(state.doc);state.saved=fingerprint(state.doc);
    message('apply',{document:state.doc});
    const order=home.categoryOrder||home.globals?.categoryOrder||home.draft?.categoryOrder;
    if(Array.isArray(order))message('category-order-preview',{ids:order});
    state.categorySession={version:home.version,startDoc:clone(state.doc),startHistory:state.history};
    state.history=new History();
  }catch(error){state.startingCategoryReorder=false;state.categoryPreparation=null;showError(error);return;}
  state.categoryPreparation=null;
  state.sectionId=sectionId;state.elementId=null;state.advanced=false;
  // On narrow screens the sidebar is a drawer over the canvas, so the cards it
  // just opened have to be visible.
  $('#editor').classList.remove('show-library');
  if(!wideLayout.matches)$('#editor').classList.remove('show-inspector');
  message('select',{sectionId,elementId:null});message('category-reorder',{active:true,sectionId,target:surface});
  message('category-reorder-state',{active:true,sectionId,target:surface,undo:state.history.past.length>0});renderLibrary();renderInspector();
}
const categorySectionId=()=>state.doc?.sections.find(isCategoryReorderSection)?.id;
function receiveGlobals(result) {
  if(result.globals){state.globals=result.globals;state.globalVersion=result.globals.version??result.globals.headerVersion;state.headerVersion=result.globals.headerVersion??state.globalVersion;}
}
function withEditorGlobals(doc) {
  return applyGlobalComponents(doc,state.globals,state.baseline||doc);
}
function acceptGlobalSave(result,snapshot) {
  receiveGlobals(result);
  const before=fingerprint(state.doc),accepted=reconcileGlobalSave(state.doc,snapshot,result.draft||snapshot,state.globals,state.baseline||snapshot);
  state.doc=accepted.document;state.saved=fingerprint(accepted.saved);
  if(fingerprint(state.doc)!==before){message('apply',{document:state.doc});renderLibrary();}
}
async function openCategoryReorder() {
  if(state.loading||state.busy||state.preview||state.categoryReorder)return;
  if(isProductsPage()){const sec=state.doc.sections.find(isShopSection);if(sec)await startCategoryReorder(sec.id,'filter');return;}
  if(state.page?.id==='home'){const id=categorySectionId();if(id)await startCategoryReorder(id,'grid');return;}
  state.pendingCategoryEntry=true;await loadPage('home');
}

const sameOrder=(a,b)=>Array.isArray(a)&&a.length===b?.length&&a.every((id,index)=>id===b[index]);
/* One canonical order: the document root owns it, like productOrders. The
   section value is only read for drafts saved before it moved there. */
const savedCategoryOrder=()=>{
  if(Array.isArray(state.doc?.categoryOrder))return state.doc.categoryOrder;
  const legacy=state.doc?.sections?.find(isCategoryReorderSection)?.content?.categoryOrder;
  return Array.isArray(legacy)?legacy:undefined;
};
/* Save order keeps whatever is on the canvas. Drags, arrow keys and the move
   buttons all commit through changed(), so this only closes a gap. */
async function saveCategoryOrder() {
  const mode=state.categoryReorder;if(!mode||mode.saving)return;
  const ids=[...mode.ids];
  if(!validCategoryOrder(ids))return;
  mode.saving=true;clearTimeout(autosaveTimer);renderInspector();
  try{
    const result=await api('category-order',{page:'home',expectedVersion:mode.version,categoryOrder:ids},'cms-api.php','home');
    receiveGlobals(result);state.doc=withEditorGlobals(state.doc);
    if(state.page.id==='home'){
      if(result.draft)state.doc=withEditorGlobals(clone(result.draft));state.doc.categoryOrder=ids;
      for(const sec of state.doc.sections)if(sec.content)delete sec.content.categoryOrder;
      state.version=result.version;state.saved=fingerprint(state.doc);state.savedAt=result.savedAt;state.publishedAt=result.publishedAt;
    }
    else state.saved=fingerprint(state.doc);
    state.history=mode.startHistory||state.history;for(const snapshot of [...state.history.past,...state.history.future])if(snapshot.id==='home'){snapshot.categoryOrder=[...ids];for(const sec of snapshot.sections)if(sec.content)delete sec.content.categoryOrder;}
    mode.saving=false;clearError();endCategoryReorder(true);
    message('category-order-preview',{ids});status();
    toast('Category order saved. The same order is now live across the website.');
  }catch(error){
    mode.saving=false;
    if(error.status===409)error.message='The saved categories changed in another session. Cancel and reopen Reorder Categories to load the latest order.';
    showError(error);renderInspector();
  }
}
/* Cancel puts back the order this session started with, as one edit, so it can
   be undone like any other change. */
function cancelCategoryReorder() {
  const mode=state.categoryReorder;
  if(!mode){endCategoryReorder();return;}
  if(mode.saving)return;
  endCategoryReorder();
  status();toast('Reorder cancelled. Your saved order is unchanged.');
}
/* Reset returns every category to the order the catalog itself ships, committed
   through changed() so it undoes, autosaves and publishes like any other edit. */
function resetCategoryOrder() {
  const mode=state.categoryReorder;if(!mode||mode.saving||state.preview)return;
  const canonical=state.categories.map(category=>category.id);
  if(!validCategoryOrder(canonical,mode.ids)){toast('The category list changed while you were here. Reopen Reorder Categories to reset it.');return;}
  // Reset is always the whole catalog order and never a subset, so it can never
  // be the empty list that the client model turns into an object and drops.
  const local=(mode.target||'grid')==='grid'&&state.page?.id==='home';
  if(local&&sameOrder(savedCategoryOrder(),canonical))return;
  mode.ids=[...canonical];
  if(local)changed('',doc=>{doc.categoryOrder=[...canonical];},{tree:true,inspector:true});
  else message('category-order-preview',{ids:canonical});
  message('category-reorder-state',{active:true,sectionId:mode.sectionId,target:mode.target,ids:mode.ids,count:mode.ids.length,undo:local&&state.history.past.length>0});
  toast('Back to the catalog order. Save order applies it across the website.');
}
function applyCategoryReorder(data) {
  const mode=state.categoryReorder,sec=state.doc?.sections.find(item=>item.id===data.sectionId);
  if(!mode||mode.saving||state.preview||data.sectionId!==mode.sectionId||!validCategoryOrder(data.ids,mode.ids))return;
  // The category records stay canonical; the order itself is global and lives at
  // the Home document root. On Home that is the document on screen, so it enters
  // the same draft and history as any other change. On any other page the write
  // is deferred to that document instead of being copied onto the open page.
  const local=(mode.target||'grid')==='grid'&&state.page?.id==='home';
  if(local&&!isCategoryReorderSection(sec))return;
  mode.ids=[...data.ids];
  if(local)changed('',doc=>{doc.categoryOrder=[...data.ids];},{tree:true,inspector:true});
  else message('category-order-preview',{ids:data.ids});
  // The canvas keeps its Undo honest about what is left to step back through.
  message('category-reorder-state',{active:true,sectionId:mode.sectionId,target:mode.target,ids:mode.ids,count:mode.ids.length,undo:local&&state.history.past.length>0});
}

function switchProductCategory(category,activate=null) {
  if(!isProductsPage()||!validProductCategory(category)||state.loading)return;
  endProductReorder();state.productCategory=category;state.pendingReorder=activate;
  state.loading=true;state.startingReorder=!!activate;renderInspector();
  message('product-category',{category,refresh:!!activate});
}
async function startProductReorder() {
  if(!isReorderSection(section())||state.preview||state.loading||state.startingReorder)return;
  endCategoryReorder();
  const page=state.page.id,sectionId=state.sectionId;state.startingReorder=true;renderInspector();
  try{await refreshProductCatalog();if(state.page.id!==page)return;state.startingReorder=false;if(isHomePage()){message('product-reorder',{active:true,sectionId,category:sectionScope(sectionId)});renderInspector();}else switchProductCategory(state.productCategory,{sectionId,category:state.productCategory});}
  catch(error){state.startingReorder=false;showError(error);renderInspector();}
}
function applyProductReorder(data) {
  const mode=state.productReorder;
  if(!mode||state.preview||(!isProductsPage()&&!isHomePage())||data.sectionId!==mode.sectionId||data.category!==mode.category||!Array.isArray(data.ids)||data.ids.length>5000)return;
  const eligible=new Set(state.products.filter(product=>data.category==='all'||validSectionScope(data.category)||product.cats.includes(data.category)).map(product=>product.id));
  if(new Set(data.ids).size!==data.ids.length||data.ids.some(id=>!Number.isSafeInteger(id)||!eligible.has(id)))return;
  // The preview may only permute the complete set it displayed when mode began.
  const previousIds=mode.ids?new Set(mode.ids):null;
  if(previousIds&&(previousIds.size!==data.ids.length||data.ids.some(id=>!previousIds.has(id))))return;
  mode.ids=[...data.ids];
  changed('',doc=>{doc.productOrders??={};doc.productOrders[data.category]=[...data.ids];});
}
async function confirmAction(title,text,label='Continue') {
  const dialog=$('#confirmDialog');$('#confirmTitle').textContent=title;$('#confirmMessage').textContent=text;$('#confirmAction').textContent=label;
  dialog.returnValue='cancel';dialog.showModal();return new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true}));
}
function timestamp(value) { return value?new Date(value).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):''; }
function status() {
  $('#save').disabled=!state.doc||!dirty()||!!state.saving||state.busy||state.conflict||!!state.categoryReorder;
  $('#publish').disabled=!state.doc||state.loading||!!state.saving||state.busy||state.conflict||!!state.categoryReorder;
  $('#discard').disabled=!dirty()||!!state.saving||state.busy;
  $('#undo').disabled=!state.history.past.length;$('#redo').disabled=!state.history.future.length;
  $('#saveStatus').textContent=state.conflict?'Save conflict · local edits kept':state.saving?'Saving…':dirty()?'● Unsaved changes':state.savedAt?'✓ Saved · '+timestamp(state.savedAt):state.doc?'Current website loaded':'Connecting…';
  $('#saveStatus').style.color=state.conflict?'var(--danger)':dirty()?'var(--muted)':'var(--success)';
  // The bar mirrors the status bar. Only the status bar is a live region, so
  // the same sentence is never announced twice.
  const chip=$('#saveState'),bar=chip&&chip.parentElement;
  if(chip){chip.textContent=$('#saveStatus').textContent;if(bar)bar.dataset.state=state.conflict?'error':state.saving?'saving':dirty()?'dirty':'saved';}
  $('#publishedStatus').textContent=state.publishedAt?'Last published · '+timestamp(state.publishedAt):'Your published site stays live while you edit.';
  $('#save').title='Save this page and shared Promo Bar, Header and Footer as drafts';
  $('#publish').title='Publish this page and apply shared component changes to every page';
}
function changed(group, edit, options={}) {
  if(!state.doc)return;const before=clone(state.doc);edit(state.doc);
  if(fingerprint(before)===fingerprint(state.doc))return;
  state.history.commit(before,group);message('apply',{document:state.doc});status();
  if(options.tree)renderLibrary();if(options.inspector)renderInspector();
  clearTimeout(autosaveTimer);if(!state.conflict&&!state.categoryReorder&&!state.startingCategoryReorder&&!state.blockReorder)autosaveTimer=setTimeout(()=>saveDraft(false),1600);
}
async function saveDraft(notify=true) {
  if(state.busy||state.categoryReorder?.saving)return false;
  if(!notify&&(state.categoryReorder||state.startingCategoryReorder||state.blockReorder))return false;
  if(notify)endReordering();
  clearTimeout(autosaveTimer);
  if(state.saving){await state.saving;return dirty()?saveDraft(notify):!state.conflict;}
  if(!state.doc||state.conflict)return false;
  if(!dirty()){if(notify)toast('Draft is up to date.');return true;}
  state.saving=(async()=>{try{
    if(state.doc.productOrders)await refreshProductCatalog();
    const snapshot=clone(state.doc),page=state.page.id,version=state.version;
    const result=await api('save',{page,expectedVersion:version,expectedGlobalVersion:state.globalVersion,expectedHeaderVersion:state.headerVersion,document:snapshot});
    acceptGlobalSave(result,snapshot);state.version=result.version;state.savedAt=result.savedAt;state.publishedAt=result.publishedAt;clearError();if(notify)toast('Draft saved. Page and global component changes stay private until published.');return true;
  }catch(error){if(error.status===409){state.conflict=true;error.message='A newer version was saved in another session. Your local edits are kept. Download them in Settings before reloading the saved draft.';}showError(error);return false;}finally{state.saving=null;status();}})();
  status();const ok=await state.saving;if(ok&&dirty())autosaveTimer=setTimeout(()=>saveDraft(false),1600);return ok;
}
async function publish() {
  if(!state.doc||state.busy)return;
  endReordering();
  if(!await confirmAction('Publish '+state.page.name+' and global components?','Page content updates '+state.page.name+'. Changes to the shared Promo Bar, Header / Navigation and Footer apply to all pages. Your previous page version remains in revision history.','Publish page & globals'))return;
  if(!await saveDraft(false))return;
  state.busy=true;$('#publish').disabled=true;
  try{const snapshot=clone(state.doc);const result=await api('publish',{page:state.page.id,expectedVersion:state.version,expectedGlobalVersion:state.globalVersion,expectedHeaderVersion:state.headerVersion});acceptGlobalSave(result,snapshot);state.version=result.version;state.publishedAt=result.publishedAt;state.savedAt=result.savedAt;await refreshPages();toast('Published. The website now uses this version. Global components apply to all pages.');clearError();}
  catch(error){if(error.status===409)state.conflict=true;showError(error);}finally{state.busy=false;status();}
}
async function loadPage(id,hash,discard=false) {
  if(state.loading||state.busy||state.categoryReorder?.saving)return;
  endReordering();
  if(dirty()&&!discard&&!await saveDraft(false))return;
  const page=state.pages.find(p=>p.id===id);if(!page)return;
  const sequence=++loadSequence;state.loading=true;state.ready=false;state.page=page;state.sectionId=null;state.elementId=null;state.doc=null;state.baseline=null;state.history=new History();state.conflict=false;state.productCategory=new URLSearchParams((hash||'').split('?')[1]||'').get('cat')||'all';
  clearTimeout(autosaveTimer);clearError();$('#loading').hidden=false;$('#loading strong').textContent='Opening '+page.name;$('#loading>span:last-child').textContent='Loading the current page and saved draft…';$('#pageTitle').textContent=page.name;$('#canvasPath').textContent='crackersmela.com'+(page.path||'/');renderLibrary();renderInspector();status();
  try{const result=await api('load');if(sequence!==loadSequence)return;receiveGlobals(result);state.version=result.version;state.pendingDoc=result.draft||null;state.saved=result.draft?fingerprint(result.draft):'';state.savedAt=result.savedAt;state.publishedAt=result.publishedAt;
    const query=new URLSearchParams({page:id});if(hash)query.set('route',hash);$('#siteFrame').src='/visual-preview.php?'+query;
    setTimeout(()=>{if(sequence===loadSequence&&!state.ready){state.loading=false;$('#loading>span:last-child').textContent='The preview did not respond. Check your connection, then reload the saved draft.';showError(new Error('The website preview could not be opened. Your saved draft is safe.'));status();}},20000);
  }catch(error){state.loading=false;$('#loading strong').textContent='Could not open this page';$('#loading>span:last-child').textContent=error.message;showError(error);status();}
}
function select(sectionId,elementId=null,fromPreview=false) {
  if(state.categoryReorder?.saving)return;
  if(state.productReorder&&(sectionId!==state.productReorder.sectionId||elementId))endProductReorder();
  if((state.categoryReorder||state.startingCategoryReorder)&&(sectionId!==state.sectionId||elementId))endCategoryReorder();
  state.sectionId=sectionId;state.elementId=elementId||null;if(!section())return;
  if(!fromPreview)message('select',{sectionId,elementId});
  state.advanced=false;
  if(globalRole(section())&&!state.preview)$('#editor').classList.add('show-inspector');
  $('#editor').classList.remove('show-library');renderNav();renderLibrary();renderInspector();
  $('#breadcrumb').textContent=(globalRole(section())?'Global / ':state.page.name+' / ')+sectionLabel(section())+(target()!==section()?' / '+(target()?.name||state.elementId):'');
}
function deselect(){if(state.categoryReorder?.saving)return;endReordering();state.sectionId=null;state.elementId=null;state.advanced=false;message('select',{sectionId:null,elementId:null});renderLibrary();renderInspector();status();$('#breadcrumb').textContent='Select an element on the page to edit';}
function renderNav() { $('#nav').innerHTML=navItems.map(([id,name],index)=>`${index===3||index===10?'<div class="nav-separator"></div>':''}<button class="nav-item ${state.nav===id?'active':''}" data-nav="${id}" title="${name}" ${state.nav===id?'aria-current="page"':''}>${icon(id)}<span>${name}</span></button>`).join(''); }
function renderDetailedLibrary() {
  const root=$('#library');
  if(state.nav==='pages') {root.innerHTML=`<div class="panel-title"><h2>Pages</h2><span class="panel-count">${state.pages.length}</span></div><p class="panel-copy">The existing pages of your store.</p><div class="page-list">${state.pages.map(p=>`<button class="page-item ${state.page?.id===p.id?'active':''}" data-page="${esc(p.id)}">${icon('pages')}<span>${esc(p.name)}</span></button>`).join('')}</div><p class="panel-note">Categories and offers use the Products page. Product details share their existing template.</p>`;return;}
  if(state.nav==='add') {root.innerHTML=`<div class="panel-title"><h2>Add section</h2></div><p class="panel-copy">Choose a section, then make it yours.</p><div class="template-list">${[['text','Text','typography'],['image','Image','media'],['button','Button','buttons'],['banner','Banner','banner'],['productGrid','Products','grid'],['faq','FAQ','faq']].map(([type,label,ic])=>`<button class="template-card" data-add-section="${type}">${icon(ic)}<span>${label}</span></button>`).join('')}</div><p class="panel-note">Product grids use your existing catalog and prices.</p>${state.clipboard?`<button class="button button-outline add-section" data-paste>${icon('paste')}Paste section</button>`:''}`;return;}
  const sections=state.doc?.sections||[];
  root.innerHTML=`<div class="panel-title"><div><span class="eyebrow">Layers</span><h2>${esc(state.page?.name||'Sections')}</h2></div><span class="panel-count">${sections.length}</span></div><p class="panel-copy">Edit shared components or this page’s own sections. Drag page sections to reorder.</p>${sectionTree(sections)}<button class="button button-outline add-section" data-nav="add">${icon('add')}Add section</button>${state.clipboard?'<button class="text-button paste-button" data-paste>Paste copied section</button>':''}`;
}
const field=(label,key,value='',options={})=>`<label class="field"><span>${esc(label)}</span>${options.options?`<select data-field="${key}" ${options.scope?`data-scope="${options.scope}"`:''}>${options.options.map(item=>{const [v,t]=Array.isArray(item)?item:[item,item];return `<option value="${esc(v)}" ${String(value??'')===String(v)?'selected':''}>${esc(t)}</option>`;}).join('')}</select>`:options.area?`<textarea data-field="${key}" ${options.scope?`data-scope="${options.scope}"`:''} ${options.rows?`rows="${options.rows}"`:''}>${esc(value)}</textarea>`:`<input data-field="${key}" ${options.scope?`data-scope="${options.scope}"`:''} type="${options.type||'text'}" value="${esc(value)}" ${options.placeholder?`placeholder="${esc(options.placeholder)}"`:''} ${options.min!==undefined?`min="${options.min}"`:''} ${options.max!==undefined?`max="${options.max}"`:''} ${options.step?`step="${options.step}"`:''}>`}</label>`;
const check=(label,key,value,scope='content')=>`<label class="check-field"><input type="checkbox" data-field="${key}" data-scope="${scope}" ${value?'checked':''}>${esc(label)}</label>`;
const group=(title,html)=>`<section class="property-group"><h3>${esc(title)}</h3>${html}</section>`;
const fonts=[['','Inherit from website'],'Inter','Sora','Plus Jakarta Sans','system-ui','Georgia'];
function currentStyles() {const t=target();return state.tab==='hover'?(t?.overrides?.[state.device]?.hover||{}):(t?.overrides?.[state.device]?.styles||{});}
function styleField(label,key,options={}) {return field(label,key,currentStyles()[key]||'',{placeholder:'Inherit',scope:state.tab==='hover'?'hover':'style',...options});}
function renderAdvancedInspector() {
  const root=$('#inspector');if(!state.doc){root.innerHTML=`<div class="inspector-empty">${icon('pointer')}<h2>Your website, editable</h2><p>Open a page to start editing its content and design.</p></div>`;return;}
  if(state.nav==='seo'){root.innerHTML=`<div class="inspector-head"><span class="eyebrow">Page settings</span><h2>Search & sharing</h2><p>${esc(state.page.name)}</p></div>`+group('Search appearance',field('Page title','title',state.doc.seo?.title||'',{scope:'seo',placeholder:'Keep existing page title'})+field('Meta description','description',state.doc.seo?.description||'',{scope:'seo',area:true})+field('SEO keywords','keywords',state.doc.seo?.keywords||'',{scope:'seo',area:true,placeholder:'Comma-separated search phrases for this page'})+field('Canonical URL','canonical',state.doc.seo?.canonical||'',{scope:'seo',placeholder:'https://crackersmela.com/'})+field('Robots','robots',state.doc.seo?.robots||'',{scope:'seo',options:[['','Keep existing settings'],['index, follow','Index and follow'],['noindex, follow','No index, follow'],['noindex, nofollow','No index or follow']]}))+group('Social sharing',field('Open Graph title','ogTitle',state.doc.seo?.ogTitle||'',{scope:'seo'})+field('Open Graph description','ogDescription',state.doc.seo?.ogDescription||'',{scope:'seo',area:true})+field('Open Graph image URL','ogImage',state.doc.seo?.ogImage||'',{scope:'seo'})+'<button class="button button-outline" data-media="seo">Choose image</button><p class="properties-hint">Existing structured data is preserved.</p>');return;}
  if(state.nav==='settings'){root.innerHTML=`<div class="inspector-head"><span class="eyebrow">${esc(state.page.name)}</span><h2>Page settings</h2></div>`+group('Draft & publishing',`<p class="muted">${state.savedAt?'Last saved '+esc(timestamp(state.savedAt)):'This page uses its current website content.'}</p><div class="button-row" style="margin-top:12px"><button class="button button-outline" data-history>Revision history</button><button class="button button-outline" data-export>Download draft</button></div><p class="properties-hint">Drafts stay private until you publish. Downloading keeps a personal copy of the structured content.</p>`)+group('Page design',designFields())+group('Keyboard shortcuts','<p class="muted">Ctrl + Z · Undo<br>Ctrl + Shift + Z · Redo<br>Ctrl + S · Save draft<br>Escape · Clear selection</p>');return;}
  if(state.nav==='design'&&!target()){root.innerHTML='<div class="inspector-head"><span class="eyebrow">Page design</span><h2>Website styles</h2></div>'+group('Design tokens',designFields());return;}
  const t=target(),s=section();if(!t){root.innerHTML=`<div class="inspector-empty">${icon('pointer')}<h2>Click anything editable</h2><p>Select text, an image, a button or a section on your website. Its controls will appear here.</p><p style="margin-top:16px">Use the page structure to select hidden sections.</p></div>`;return;}
  const kind=state.elementId?t.kind:s.type;
  let html=`<div class="inspector-head"><span class="eyebrow">${esc(state.elementId?s.name:state.page.name)}</span><h2>${esc(t.name||kind)}</h2><p>${state.elementId?'Element properties':'Section properties'}</p></div><div class="inspector-tabs">${[['content','Content'],['style','Style'],['hover','Hover']].map(([id,label])=>`<button data-tab="${id}" class="${state.tab===id?'active':''}">${label}</button>`).join('')}</div>`;
  if(state.nav==='animations'){root.innerHTML=html+animationFields(t);return;}
  if(state.tab==='content'&&!['typography','layout','design','buttons'].includes(state.nav)){
    if(!state.elementId)html+=group('Section',field('Section name','name',s.name,{scope:'section'})+check('Hide on '+deviceName(),'hidden',responsive.resolve(s,state.device).hidden,'visibility'));
    if(state.elementId){let content='';if('text'in t)content+=readOnlyCount()?countNotice:field(kind==='button'?'Button text':'Text','text',t.text,{scope:'element',area:kind!=='button'});if(kind==='image')content+=imageFields(t,'element');if(kind==='button'||'href'in t)content+=field('Link URL','href',t.href||'',{scope:'element'})+check('Open in a new tab','newTab',t.newTab,'element');html+=group('Content',content||'<p class="muted">Use Style to adjust this container.</p>');}
    else if(s.type!=='native'){let content='',c=s.content||{};if(['text','banner','productGrid','faq'].includes(s.type))content+=field('Heading','heading',c.heading,{scope:'content'});if(['text','banner'].includes(s.type))content+=field('Text','text',c.text,{scope:'content',area:true});if(['button','banner'].includes(s.type))content+=field('Button text','buttonText',c.buttonText,{scope:'content'})+field('Link URL','href',c.href||'',{scope:'content'})+check('Open in a new tab','newTab',c.newTab);if(['image','banner'].includes(s.type))content+=imageFields(c,'content');if(s.type==='faq')content+=(c.items||[]).map((item,i)=>`<div class="faq-item-editor">${field('Question '+(i+1),'question',item.question,{scope:'faq:'+i})}${field('Answer','answer',item.answer,{scope:'faq:'+i,area:true})}<button class="text-button danger" data-delete-faq="${i}">Remove question</button></div>`).join('')+'<button class="button button-outline" data-add-faq>Add question</button>';html+=group('Content',content);}
    else html+=group('Existing content','<p class="muted">Click the text, image or button you want to edit on the canvas, or select it in the section list.</p>');
    if(s.type==='productGrid'||s.content?.columns!==undefined||s.content?.limit!==undefined)html+=productFields(s);
  }else{
    const responsiveNote=`Editing ${deviceName()} · blank uses saved base`;
    html+='<div class="property-group"><div class="responsive-note">'+icon(state.device)+esc(responsiveNote)+'</div><button class="text-button" data-reset-style>Reset these overrides</button></div>';
    if(!['layout'].includes(state.nav))html+=group('Typography',styleField('Font family','fontFamily',{options:fonts})+'<div class="field-grid">'+styleField('Font size','fontSize',{placeholder:'e.g. 32px'})+styleField('Weight','fontWeight',{options:[['','Inherit'],'300','400','500','600','700','800','900']})+styleField('Line height','lineHeight',{placeholder:'e.g. 1.4'})+styleField('Letter spacing','letterSpacing',{placeholder:'e.g. 0.5px'})+'</div>'+styleField('Alignment','textAlign',{options:[['','Inherit'],'left','center','right','justify']})+styleField('Text color','color',{placeholder:'#172b4d'}));
    if(state.nav!=='typography')html+=group('Background & border',styleField('Background color','backgroundColor',{placeholder:'#ffffff'})+'<div class="field-grid">'+styleField('Corner radius','borderRadius',{placeholder:'e.g. 12px'})+styleField('Border width','borderWidth',{placeholder:'e.g. 1px'})+'</div>'+styleField('Border color','borderColor',{placeholder:'#dce3ed'})+styleField('Border style','borderStyle',{options:[['','Inherit'],'none','solid','dashed','dotted']})+styleField('Shadow','boxShadow',{options:[['','Inherit'],['none','None'],['0 2px 8px #0000001a','Soft'],['0 8px 24px #00000026','Raised'],['0 16px 48px #00000033','Deep']]}));
    if(!['typography'].includes(state.nav))html+=group('Spacing','<div class="field-grid">'+['Top','Right','Bottom','Left'].map(edge=>styleField('Padding '+edge.toLowerCase(),'padding'+edge,{placeholder:'e.g. 24px'})).join('')+'</div><div class="field-grid">'+['Top','Right','Bottom','Left'].map(edge=>styleField('Margin '+edge.toLowerCase(),'margin'+edge,{placeholder:'e.g. 0px'})).join('')+'</div>')+group('Layout','<div class="field-grid">'+styleField('Width','width',{placeholder:'e.g. 100%'})+styleField('Max width','maxWidth',{placeholder:'e.g. 1200px'})+styleField('Height','height',{placeholder:'e.g. auto'})+styleField('Min height','minHeight',{placeholder:'e.g. 300px'})+'</div>'+styleField('Display / visibility','display',{options:[['','Inherit'],['none','Hidden on this size'],'block','flex','grid','inline-flex']})+styleField('Grid columns','gridTemplateColumns',{options:[['','Inherit'],['repeat(1, minmax(0, 1fr))','1 column'],['repeat(2, minmax(0, 1fr))','2 columns'],['repeat(3, minmax(0, 1fr))','3 columns'],['repeat(4, minmax(0, 1fr))','4 columns'],['repeat(5, minmax(0, 1fr))','5 columns'],['repeat(6, minmax(0, 1fr))','6 columns']]})+styleField('Gap','gap',{placeholder:'e.g. 24px'})+styleField('Direction','flexDirection',{options:[['','Inherit'],'row','column','row-reverse','column-reverse']})+styleField('Align items','alignItems',{options:[['','Inherit'],'start','center','end','stretch']})+styleField('Justify content','justifyContent',{options:[['','Inherit'],'start','center','end','space-between','space-around','space-evenly']}));
    if(kind==='image')html+=group('Image position',styleField('Fit','objectFit',{options:[['','Inherit'],'cover','contain','fill','none','scale-down']})+styleField('Focal point','objectPosition',{placeholder:'e.g. 50% 50%'})+styleField('Opacity','opacity',{placeholder:'0 to 1'}));
    html+=animationFields(t);
  }
  root.innerHTML=html;
}
function designFields(){const d=state.doc.design||{};return '<p class="properties-hint">Applies to this page’s content only. Edit Global components to change the Promo Bar, Header or Footer.</p>'+field('Primary color','primary',d.primary||'',{scope:'design',placeholder:'Existing brand color'})+field('Text color','text',d.text||'',{scope:'design',placeholder:'Keep existing'})+field('Page background','background',d.background||'',{scope:'design',placeholder:'Keep existing'})+field('Body font','fontFamily',d.fontFamily||'',{scope:'design',options:fonts})+field('Heading font','headingFont',d.headingFont||'',{scope:'design',options:fonts})+field('Corner radius','radius',d.radius||'',{scope:'design',placeholder:'e.g. 12px'})+field('Container width','containerWidth',d.containerWidth||'',{scope:'design',placeholder:'e.g. 1200px'});}
function animationFields(t){const a=responsive.resolve(t,state.device).animation||{};return group('Animation',field('Entrance','type',a.type||'none',{scope:'animation',options:[['none','Existing / no override'],['fade','Fade'],['slide','Slide'],['scale','Scale']]})+'<div class="field-grid">'+field('Duration (ms)','duration',a.duration??400,{scope:'animation',type:'number',min:0,max:3000})+field('Delay (ms)','delay',a.delay??0,{scope:'animation',type:'number',min:0,max:3000})+'</div>'+field('Easing','easing',a.easing||'ease',{scope:'animation',options:['ease','linear','ease-in','ease-out','ease-in-out']})+'<p class="properties-hint">Reduced-motion preferences are respected.</p>');}
function imageFields(t,scope){return `${t.src&&safePreviewUrl(t.src)?`<img class="mini-preview" src="${esc(safePreviewUrl(t.src))}" alt="${esc(t.alt||'Selected image')}">`:'<div class="empty-mini">Choose an image from your library</div>'}<div class="button-row"><button class="button button-outline" data-media="${scope}">${t.src?'Replace image':'Choose image'}</button>${t.src?`<button class="button button-quiet danger" data-remove-image="${scope}">Remove</button>`:''}</div><div style="height:12px"></div>${field('Alt text','alt',t.alt||'',{scope})}`;}
function productFields(s){const c=responsive.resolve(s,state.device).content||{};return group('Product collection',field('Category','category',c.category||'',{scope:'content',options:[['','All categories'],...state.categories.map(item=>[item.id,item.name])]})+'<div class="field-grid">'+field('Number of products','limit',c.limit??8,{scope:'content',type:'number',min:1,max:48})+field('Grid columns','columns',c.columns??4,{scope:'presentation',type:'number',min:1,max:6})+'</div>'+field('Sort by','sort',c.sort||'featured',{scope:'content',options:[['featured','Featured first'],['newest','Newest first'],['price-asc','Price: low to high'],['price-desc','Price: high to low'],['name','Name']]})+field('Card style','cardStyle',c.cardStyle||'default',{scope:'presentation',options:[['default','Existing style'],['compact','Compact'],['outlined','Outlined']]})+field('Image ratio','imageRatio',c.imageRatio||'square',{scope:'presentation',options:['square','portrait','landscape','auto']})+check('Show price','showPrice',c.showPrice!==false,'presentation')+check('Show sale comparison','showSalePrice',c.showSalePrice!==false,'presentation')+check('Show Add to cart','showCart',c.showCart!==false,'presentation')+check('Show badges','showBadge',c.showBadge!==false,'presentation')+`<p class="properties-hint">Select specific products, or leave all unchecked to use the category and sort order. Product prices and records stay in Product management.</p><div class="product-picker">${state.products.map(p=>`<label class="product-option"><input type="checkbox" data-product="${Number(p.id)}" ${(c.productIds||[]).includes(Number(p.id))?'checked':''}>${p.image&&safePreviewUrl(p.image)?`<img src="${esc(safePreviewUrl(p.image))}" alt="" loading="lazy">`:''}<span>${esc(p.shortName||p.name)}</span></label>`).join('')}</div>`);}
function renderLibraryInner(){
  const root=$('#library');
  if(state.nav==='elements'){root.innerHTML=elementLibrary();return;}
  if(state.nav==='uploads'){root.innerHTML=uploadLibrary();return;}
  if(state.nav==='pages'){
    root.innerHTML=`<div class="panel-title"><h2>Your pages</h2><button class="icon-button" data-page-create title="Add a new page" aria-label="Add a new page">${icon('add')}</button></div><div class="page-list">${state.pages.map(p=>`<div class="simple-page ${state.page?.id===p.id?'active':''}"><button class="page-item ${state.page?.id===p.id?'active':''}" data-page="${esc(p.id)}">${icon('pages')}<span>${esc(p.name)}<small>${p.status==='published'||!p.status?'Published':'Draft'}</small></span></button>${state.page?.id===p.id?`<details class="page-options"><summary>Page options</summary><div><button data-page-action="rename">Rename</button><button data-page-action="duplicate">Duplicate</button>${p.canUnpublish&&p.status==='published'?'<button data-page-action="unpublish">Unpublish</button>':''}${p.canDelete?'<button class="danger" data-page-action="delete">Delete page</button>':''}</div></details>`:''}</div>`).join('')}</div><p class="panel-note">Select a page to edit. New pages are private until published.</p>`;return;
  }
  if(state.nav==='add'){
    const templates=[['hero','Hero','banner'],['text','Text','typography'],['image','Image','media'],['imageText','Image + text','layout'],['productGrid','Products','grid'],['banner','Banner','banner'],['features','Features','grid'],['faq','FAQ','faq'],['testimonials','Testimonials','content'],['contact','Contact','pages'],['custom','Custom section','sections']];
    root.innerHTML=`<div class="panel-title"><h2>Add a section</h2><button class="text-button" data-nav="sections">Back</button></div><p class="panel-copy">Ready to use, in your website’s style.</p><div class="template-list">${templates.map(([type,label,ic])=>`<button class="template-card" data-add-section="${type}">${icon(ic)}<span>${label}</span></button>`).join('')}</div>`;return;
  }
  const sections=state.doc?.sections||[];
  root.innerHTML=`<div class="panel-title"><div><span class="eyebrow">Layers</span><h2>${esc(state.page?.name||'Sections')}</h2></div><span class="panel-count">${sections.length}</span></div><p class="panel-copy">Edit shared components or this page’s own sections. Drag page sections to reorder.</p>${sectionTree(sections)}<button class="button button-outline add-section" data-nav="add">${icon('add')}Add section</button>${state.clipboard?'<button class="text-button paste-button" data-paste>Paste copied section</button>':''}`;
}
function sectionLabel(s){return ({promo:'Promo Bar',header:'Header / Navigation',footer:'Footer'})[globalRole(s)]||(s.name==='benefits-strip'?'Benefits':s.name||s.type);}
function sectionTree(sections){
  const row=s=>{const shared=!!globalRole(s),hidden=responsive.resolve(s,state.device).hidden,movable=!shared&&(s.region||'main')==='main';
    return `<div class="section-row ${shared?'global-section-row ':''}${s.id===state.sectionId?'active':''}" data-section-row="${esc(s.id)}" ${shared?'data-global-component="'+globalRole(s)+'"':''} draggable="${movable}"><div class="section-main"><span class="drag-handle" aria-hidden="true">${shared?icon('pages'):icon('drag')}</span><button class="section-select" data-select-section="${esc(s.id)}"><span>${esc(sectionLabel(s))}</span>${shared||hidden?`<small>${hidden?'Hidden · ':''}${shared?'All pages':''}</small>`:''}</button><button class="icon-button" data-section-action="visibility" data-id="${esc(s.id)}" title="${hidden?'Show':'Hide'} ${shared?'global component':'section'}" aria-label="${hidden?'Show':'Hide'} ${esc(sectionLabel(s))}">${icon(hidden?'hide':'eye')}</button></div>${s.id===state.sectionId&&movable?`<div class="section-actions">${[['up','Move up'],['down','Move down'],['duplicate','Duplicate'],['copy','Copy'],['delete','Delete']].map(([action,label])=>`<button class="icon-button ${action==='delete'?'danger':''}" data-section-action="${action}" data-id="${esc(s.id)}" aria-label="${label} section" title="${label}">${icon(action==='duplicate'?'add':action==='delete'?'trash':action)}</button>`).join('')}</div>`:''}</div>`;};
  const shared=sections.filter(s=>globalRole(s)),page=sections.filter(s=>!globalRole(s));
  return `<section class="layer-group global-layer-group" aria-label="Global components"><div class="layer-group-head"><h3>Global</h3><span>All pages</span></div><p>One shared instance of each component.</p><div class="section-list">${shared.map(row).join('')}</div></section><section class="layer-group page-layer-group" aria-label="Page sections"><div class="layer-group-head"><h3>Page</h3><span>${esc(state.page?.name||'Current page')}</span></div><div class="section-list">${page.map(row).join('')}</div>${!page.length?'<p>No page sections yet.</p>':''}</section>`;
}
/* Keep the selected page or layer inside the scroll area. Without this the
   last row in a long list hangs under the sidebar footer, so its options row
   cannot be reached. */
function revealActiveRow(){
  const root=$('#library'),row=root?.querySelector('.simple-page.active,.section-row.active');
  if(!row)return;
  const box=root.getBoundingClientRect(),rect=row.getBoundingClientRect();
  if(rect.top<box.top+4||rect.bottom>box.bottom-4)row.scrollIntoView({block:'nearest'});
}
function renderLibrary(){renderLibraryInner();revealActiveRow();}
const deviceName=()=>state.device[0].toUpperCase()+state.device.slice(1);
function effectValue(key){return responsive.resolve(target(),state.device).effects[key]||{};}
function simpleStyle(label,key,{unit='',type='number',min=0,max=3000,step=1,defaultValue='',options}={}){
  const raw=inheritedStyle(key,defaultValue);const value=unit&&raw!==''?parseFloat(raw):raw;
  if(options)return field(label,key,raw||'',{scope:'style',options});
  return `<label class="field"><span>${esc(label)}${unit?' <small>'+esc(unit)+'</small>':''}</span><input data-simple-style="${key}" data-unit="${unit}" type="${type}" min="${min}" max="${max}" step="${step}" value="${esc(value)}" placeholder="Auto" autocomplete="off"></label>`;
}
function colorControl(label,key,scope='style',value){let current=value??inheritedStyle(key,'');const rgb=/^rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/.exec(current);if(rgb)current='#'+rgb.slice(1,4).map(n=>Number(n).toString(16).padStart(2,'0')).join('');if(!/^#[0-9a-f]{6}$/i.test(current))current=key==='color'?'#172b4d':'#ffffff';return `<label class="color-control"><span>${esc(label)}</span><input type="color" aria-label="${esc(label)}" data-field="${key}" data-scope="${scope}" value="${current}"><span class="color-value">${current.toUpperCase()}</span></label>`;}
function opacityControl(){const value=Math.round(Number(inheritedStyle('opacity',1))*100);return `<label class="field slider-field"><span>Opacity <output>${value}%</output></span><input data-simple-opacity type="range" min="0" max="100" value="${value}" aria-label="Opacity"></label>`;}
function gradientControls(defaults={}){const g={...defaults,...effectValue('gradient')};return `<div class="gradient-controls">${check('Gradient','enabled',!!g.enabled,'effect-gradient')}<div class="gradient-colors" ${!g.enabled?'hidden':''}>${colorControl('Start color','start','effect-gradient',g.start||'#7c3aed')}${colorControl('End color','end','effect-gradient',g.end||'#ec4899')}${field('Direction','angle',g.angle??90,{scope:'effect-gradient',options:[[0,'Up'],[90,'Right'],[180,'Down'],[270,'Left'],[135,'Diagonal']]})}</div></div>`;}
function inheritedStyle(key, fallback='') {
  return responsive.resolve(target(),state.device).styles[key] ?? state.computed?.[key] ?? fallback;
}
const popover=(label,body,extra='')=>`<details class="context-popover" ${extra}><summary>${label}</summary><div class="context-popover-body">${body}</div></details>`;
const quickField=(label,key,value,options={})=>field(label,key,value,options).replace('class="field"','class="field context-field"');
function quickSize(label,key,max=3000){const value=parseFloat(inheritedStyle(key));return `<label class="field context-field quick-style"><span>${label}</span><input aria-label="${label}" type="number" min="1" max="${max}" data-simple-style="${key}" data-unit="px" value="${Number.isFinite(value)?Math.round(value):''}" placeholder="Auto"></label>`;}
function positionControls(){return `<p class="properties-hint">Drag on the page, or use the arrows for small moves.</p><div class="image-arrows">${[['up','↑'],['left','←'],['right','→'],['down','↓']].map(([dir,label])=>`<button data-nudge="${dir}" aria-label="Move ${dir}" title="Move ${dir}">${label}</button>`).join('')}</div><button class="text-button" data-reset-position>Reset position</button>`;}
/* Panel heading: what is selected right now, and a way to clear the selection. */
const panelHead=(kind,sub='')=>`<div class="panel-head"><div><span class="eyebrow">${esc(sub||state.page?.name||'Page')}</span><h2>${esc(kind)}</h2></div><button class="icon-button" data-deselect title="Deselect" aria-label="Deselect">${icon('close')}</button></div>`;
/* Section actions live here as well as on the canvas toolbar, so every action is
   reachable by keyboard and does not depend on hitting a small target. */
function selectionActions(sec){
  if(!sec)return '';
  if(state.elementId)return '';
  const movable=!globalRole(sec)&&(sec.region||'main')==='main';
  const rows=[['up','Move up','up'],['down','Move down','down'],['duplicate','Duplicate','add'],['visibility',responsive.resolve(sec,state.device).hidden?'Show':'Hide',responsive.resolve(sec,state.device).hidden?'eye':'hide'],['delete','Delete','trash']]
    .map(([action,label,ic])=>`<button class="button button-quiet ${action==='delete'?'danger':''}" data-section-action="${action}" data-id="${esc(sec.id)}" ${!movable&&action!=='visibility'?'disabled':''} aria-label="${label} section" title="${label}">${icon(ic)}<span>${label}</span></button>`).join('');
  const reorder=isReorderSection(sec)?`<button class="button button-primary" data-action="product-reorder" ${state.startingReorder?'disabled':''}>${state.startingReorder?'Opening…':'Reorder Products'}</button>`:'';
  return `<div class="selection-actions">${rows}${reorder}</div>`;
}
const isPromo=()=>section()?.type==='native'&&section()?.source==='global:promo';
function promoMessages(){return section()?.content?.promoMessages ?? $('#siteFrame').contentWindow.CMStorefront?.promoMessages?.() ?? [];}
function promoTextError(value) {
  if (/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) return 'Use plain text without < or >.';
  if (new TextEncoder().encode(value).length > 300) return 'This message is too long. Shorten it to save.';
  return '';
}
function editablePromoMessages(){const sec=section();sec.content??={};return sec.content.promoMessages??=clone(promoMessages());}
function promoGradient(){return {enabled:!responsive.resolve(target(),state.device).styles.backgroundColor,start:state.computed?.gradientStart||'#0d47a1',end:state.computed?.gradientEnd||'#1565c0',angle:90,...effectValue('gradient')};}
function renderPromoInspector(root){
  state.elementId=null;
  const messages=promoMessages(),scope=deviceName();
  root.innerHTML=panelHead('PROMO BAR','Global announcements')+`<div class="editing-scope">${icon(state.device)}<strong>Editing ${scope}</strong><span>Design changes apply to this device on all pages.</span></div><p class="shared-content-note">Messages and their order are shared across every page and device. Publish to update your entire website.</p>`+
    `<section class="promo-message-list"><h3>Messages <span>${messages.length}/20</span></h3>${messages.map((message,index)=>`<article class="promo-message-card" data-promo-card="${index}"><div class="promo-message-head"><strong>Message ${index+1}</strong>${check('Enabled','enabled',message.enabled!==false,'promo:'+index)}</div><label class="field"><span>Message text</span><textarea data-field="text" data-scope="promo:${index}" rows="3" maxlength="300">${esc(message.text)}</textarea></label>${field('Icon','icon',message.icon||'auto',{scope:'promo:'+index,options:[['auto','Automatic'],['tag','Sale tag'],['truck','Delivery truck'],['shield','Safety shield'],['cash','Payment'],['bolt','Spark'],['none','No icon']]})}<div class="promo-message-actions">${[['up','Move up','up',index===0],['down','Move down','down',index===messages.length-1],['duplicate','Duplicate','copy',messages.length>=20],['delete','Delete','trash',false]].map(([action,label,name,disabled])=>`<button class="icon-button ${action==='delete'?'danger':''}" data-promo-action="${action}" data-promo-index="${index}" aria-label="${label} message ${index+1}" title="${label}" ${disabled?'disabled':''}>${icon(name)}</button>`).join('')}</div></article>`).join('')}<button class="button button-outline" data-promo-action="add" ${messages.length>=20?'disabled':''}>${icon('add')}Add message</button>${!messages.length?'<p class="properties-hint">Add a message to show an announcement.</p>':''}</section>`+
    `<div class="context-group promo-design"><h3>Design · ${scope}</h3>${popover('Background',colorControl('Background color','backgroundColor')+gradientControls(promoGradient())+opacityControl())}${popover('Text',colorControl('Text color','color')+simpleStyle('Font size','fontSize',{unit:'px',min:11,max:32,defaultValue:'12.5px',step:.5})+field('Weight','fontWeight',inheritedStyle('fontWeight','600'),{scope:'style',options:[['400','Regular'],['500','Medium'],['600','Semibold'],['700','Bold']]})+field('Alignment','textAlign',inheritedStyle('textAlign','left'),{scope:'style',options:[['left','Left'],['center','Center'],['right','Right']]}))}${popover('Size & spacing',simpleStyle('Minimum height','minHeight',{unit:'px',min:28,max:160})+'<div class="field-grid">'+['Top','Bottom','Left','Right'].map(edge=>simpleStyle('Padding '+edge.toLowerCase(),'padding'+edge,{unit:'px',max:80})).join('')+'</div>')}${check('Show icons','showPromoIcons',responsive.resolve(section(),state.device).content.showPromoIcons!==false,'presentation')}${check('Hide on '+scope,'hidden',responsive.resolve(section(),state.device).hidden,'visibility')}<button class="text-button" data-reset-device>Reset ${scope} styling</button></div>`;
}
function promoAction(action,index){
  if(!isPromo())return;
  changed('',()=>{const list=editablePromoMessages();
    if(action==='add'&&list.length<20)list.push({id:'promo-'+crypto.randomUUID(),text:'New announcement',enabled:true,icon:'auto'});
    else if(action==='duplicate'&&list[index]&&list.length<20)list.splice(index+1,0,{...clone(list[index]),id:'promo-'+crypto.randomUUID()});
    else if(action==='delete'&&list[index])list.splice(index,1);
    else if(['up','down'].includes(action)){const destination=index+(action==='up'?-1:1);if(list[index]&&destination>=0&&destination<list.length){const [message]=list.splice(index,1);list.splice(destination,0,message);}}
  },{inspector:true});
}
function renderInspector(){
  renderInspectorContent();
  const role=globalRole(section());
  if(role&&state.nav!=='settings')$('#inspector').insertAdjacentHTML('afterbegin',`<div class="global-component-note" data-global-scope="${role}"><strong>Global Component</strong><span>Changes apply to all pages</span></div>`);
}
function renderInspectorContent(){
  const root=$('#inspector');root.classList.toggle('is-advanced',!!state.advanced);
  if(isPromo()&&state.nav!=='settings'){root.classList.remove('is-advanced');renderPromoInspector(root);return;}
  if(state.blockReorder){renderProductBlocks(root);return;}
  if(state.categoryReorder){root.classList.remove('is-advanced');root.innerHTML=panelHead('Reorder categories',categoryTargetName(categoryTarget(state.categoryReorder.target)))+`<div class="context-group category-reorder-toolbar"><div class="reorder-actions"><button class="button button-primary" data-action="category-reorder-save" ${state.categoryReorder.saving?'disabled':''}>${state.categoryReorder.saving?'Saving…':'Save order'}</button><button class="button button-outline" data-action="category-reorder-cancel" ${state.categoryReorder.saving?'disabled':''}>Cancel</button><button class="button button-quiet" data-action="category-reorder-reset">Reset to default order</button><button class="button button-quiet" data-action="category-reorder-undo" ${state.history.past.length?'':'disabled'}>${icon('undo')}Undo</button></div><strong>${state.categoryReorder.ids.length} categories</strong><p>Drag a card to its new position. You can also use Move up and Move down on each card.</p><p class="properties-hint">${'Save order updates the live menu, category filters and all other category lists together.'}</p></div>`;return;}
  if(state.productReorder){root.innerHTML=panelHead('Reorder products','Products')+`<div class="context-group product-reorder-toolbar"><button class="button button-primary" data-action="product-reorder-done">✓ Done Reordering</button><strong>${esc(isHomePage()?section()?.name||'Home products':categoryName(state.productCategory))}</strong><span>Drag products on the page to rearrange — customers will see this order after publishing.</span></div>`;return;}
  if(state.advanced){renderAdvancedInspector();root.insertAdjacentHTML('afterbegin','<button class="text-button simple-back" data-basic>← Back to simple controls</button>');return;}
  if(!state.doc){root.innerHTML=panelHead('Editing')+'<div class="context-empty">Choose a page to start designing.</div>';return;}
  if(state.nav==='settings'){
    root.innerHTML=panelHead('Page settings')+`<div class="context-group"><strong class="context-kind">${esc(state.page?.name||'Page')}</strong>${popover('Search & sharing',field('Page title','title',state.doc.seo?.title||'',{scope:'seo'})+field('Description','description',state.doc.seo?.description||'',{scope:'seo',area:true})+field('SEO keywords','keywords',state.doc.seo?.keywords||'',{scope:'seo',area:true,placeholder:'Comma-separated search phrases for this page'})+'<button class="button button-outline" data-media="seo">Sharing image</button>')}${popover('Page colors & fonts · all devices',designFields())}<div class="selection-actions"><button class="button button-quiet" data-history>Version history</button><button class="text-button" data-export>Download draft</button><button class="text-button" data-basic>Done</button></div></div>`;return;
  }
  const t=target(),sec=section();
  if(!t){root.innerHTML=panelHead('Properties')+`<div class="inspector-empty">${icon('pointer')}<h2>Click anything to make it yours</h2><p>Select text, an image, a button or a section on your website. Its controls appear here.</p></div>`;return;}
  const kind=state.elementId?t.kind:'section',isText=['text','heading','button'].includes(kind),isImage=kind==='image';
  const kindName=readOnlyCount()?'Product count':({text:'Text',heading:'Heading',image:'Image',button:'Button',container:'Container',video:'Video',divider:'Divider',icon:'Icon',section:'Section'})[kind]||'Element';
  let html=panelHead(kindName,state.elementId?t.name:sec?.name||'')+`<div class="editing-scope" role="status">${icon(state.device)}<strong>Editing ${deviceName()}</strong><span>${globalRole(sec)?'Style changes apply to this device on all pages.':'Style changes affect this device only.'}</span></div>`+`<div class="context-group"><strong class="context-kind">${esc(kindName)}</strong>`;
  if(isText){
    html+=(readOnlyCount()?countNotice:'<button class="button button-quiet" data-edit-text>Edit text</button>')+`${quickField('Font','fontFamily',inheritedStyle('fontFamily',''),{scope:'style',options:fonts})}${quickSize('Size','fontSize',300)}${colorControl('Color','color','style',inheritedStyle('color','#172b4d'))}`;
    html+=popover('Gradient',gradientControls())+popover('Opacity',opacityControl());
    html+=`<button class="button button-quiet bold-button" data-bold aria-label="Bold" aria-pressed="${Number(inheritedStyle('fontWeight',400))>=600}"><b>B</b></button>`;
    html+=quickField('Align','textAlign',inheritedStyle('textAlign','left'),{scope:'style',options:[['left','Left'],['center','Center'],['right','Right']]});
    if(kind==='button')html+=popover('Link',field('Link','href',t.href||'',{scope:'element'})+check('Open in new tab','newTab',t.newTab,'element'));
  }else if(isImage){
    html+=`<button class="button button-outline" data-media="element">${icon('media')}Replace</button>`+popover('Crop',simpleStyle('Fit','objectFit',{options:[['cover','Fill area'],['contain','Whole image']]})+simpleStyle('Focus','objectPosition',{options:[['50% 50%','Center'],['0% 50%','Left'],['100% 50%','Right'],['50% 0%','Top'],['50% 100%','Bottom']]})+'<button class="button button-outline" data-crop-image>Crop a copy</button>');
    html+=popover('Position',positionControls())+popover('Size',quickSize('Width','width')+quickSize('Height','height'))+popover('Opacity',opacityControl())+popover('Corners',simpleStyle('Radius','borderRadius',{unit:'px',max:500}));
  }else if(kind==='section'||kind==='container'){
    html+=popover('Background',colorControl('Color','backgroundColor')+gradientControls()+'<button class="button button-outline" data-media="background">Choose image</button>');
    html+=popover('Spacing','<div class="field-grid">'+['Top','Bottom','Left','Right'].map(edge=>simpleStyle(edge,'padding'+edge,{unit:'px',max:500})).join('')+'</div>')+quickSize('Height','minHeight')+popover('Layout',simpleStyle('Display','display',{options:[['','Saved base'],'block','flex','grid','none']})+simpleStyle('Direction','flexDirection',{options:[['','Saved base'],'row','column','row-reverse','column-reverse']})+simpleStyle('Gap','gap',{unit:'px',max:500}));
    if(kind==='section'){
      if(sec.type==='productGrid'||sec.content?.limit!==undefined)html+=popover('Grid',field('Columns on '+deviceName(),'columns',responsive.resolve(sec,state.device).content.columns||4,{scope:'presentation',type:'number',min:1,max:6}))+popover('Products',field('Category','category',sec.content.category||'',{scope:'content',options:[['','All categories'],...state.categories.map(c=>[c.id,c.name])]})+field('Show products','limit',sec.content.limit||8,{scope:'content',type:'number',min:1,max:48}));
    }
  }else if(kind==='video')html+=popover('Video',field('Video URL','src',t.src||'',{scope:'element',placeholder:'https://…/video.mp4'}))+popover('Size',quickSize('Width','width')+quickSize('Height','height'));
  else if(kind==='icon')html+=quickField('Icon','icon',t.icon||'sparkle',{scope:'element',options:['star','heart','sparkle','check','gift','phone','mail','location','arrow-right']})+colorControl('Color','color')+quickSize('Size','width',300);
  else html+=colorControl('Color','backgroundColor')+popover('Size',quickSize('Width','width')+quickSize('Height','height'));
  if(state.elementId)html+=popover('More',positionControls()+`<button class="button button-quiet" data-duplicate-element>Duplicate</button><button class="button button-quiet danger" data-delete-element>Delete</button>`);
  html+=check('Hide on '+deviceName(),'hidden',responsive.resolve(t,state.device).hidden,'visibility');
   html+=`<p class="shared-content-note">Text, image files, links, section order and product choices are shared across devices.</p><button class="text-button" data-reset-device>Reset ${deviceName()} styling</button>`;
   html+=selectionActions(sec);
  html+=`<button class="text-button context-advanced" data-advanced>Advanced</button><span class="context-device">Editing ${deviceName()}</span></div>`;
  root.innerHTML=html;
}
function elementLibrary(){return `<div class="panel-title"><h2>Elements</h2></div><p class="panel-copy">Drag onto your page, or click to add to the selected section.</p><div class="element-palette">${[['text','Text','content'],['heading','Heading','typography'],['image','Image','media'],['button','Button','buttons'],['video','Video','banner'],['divider','Divider','sections'],['icon','Icon','animations'],['container','Container','layout']].map(([kind,label,i])=>`<button class="element-card" draggable="true" data-add-element="${kind}">${icon(i)}<span>${label}</span></button>`).join('')}</div>`;}
function uploadLibrary(){return `<div class="panel-title"><h2>Uploads</h2><button class="text-button" data-open-media>Manage</button></div><p class="panel-copy">Drag an image onto the page. Drop it on an image to replace it.</p><label class="button button-primary upload-button">${icon('add')}Upload image<input data-upload-image type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload image"></label><div class="upload-thumbnails">${state.uploads?.length?state.uploads.map((item,index)=>`<button class="upload-tile" draggable="true" data-upload-index="${index}" title="Add ${esc(item.name)}"><img src="${esc(safePreviewUrl(item.url))}" alt="${esc(item.alt||item.name)}" loading="lazy"><span>${esc(item.name)}</span></button>`).join(''):`<p class="panel-note">${esc(state.uploadStatus||'Loading your images…')}</p>`}</div>${state.uploadHasMore?'<button class="button button-outline add-section" data-upload-more>Show more images</button>':''}`;}
async function loadUploads(append=false){
  try{const query=new URLSearchParams({a:'list',page:String(append?(state.uploadPage||1)+1:1),pageSize:'40'}),response=await fetch('/cms-media.php?'+query,{credentials:'same-origin'}),data=await response.json();if(!response.ok)throw new Error(data.error||'Images could not be loaded.');state.uploads=append?(state.uploads||[]).concat(data.items):data.items;state.uploadPage=Number(query.get('page'));state.uploadHasMore=data.hasMore;state.uploadStatus='Upload your first image.';}catch(e){state.uploadStatus=e.message;}if(state.nav==='uploads')renderLibrary();
}
function addElement(kind,options={},drop=null){
  if(!state.doc)return;
  const sec=state.doc.sections.find(s=>s.id===drop?.sectionId)||((section()?.region||'main')==='main'?section():null)||state.doc.sections.find(s=>(s.region||'main')==='main');
  if(!sec){addSection('custom');return addElement(kind,options,drop);}
  let id='a-'+crypto.randomUUID();
  changed('',()=>{
    sec.elements??={};
    const destination=drop?.elementId?sec.elements[drop.elementId]:null;
    if(kind==='image'&&options.src&&(destination?.kind==='image'||drop?.elementId==='content-image')){
      if(!destination)sec.elements[drop.elementId]={kind:'image',name:'Image',src:options.src,alt:options.alt||'',styles:{},effects:{}};
      id=drop.elementId;const image=sec.elements[id];image.src=options.src;image.alt=options.alt||'';image.hidden=false;syncContent(sec,id,'src',options.src);syncContent(sec,id,'alt',options.alt||'');return;
    }
    const parentId=drop?.containerId||drop?.parentId||(state.sectionId===sec.id&&target()?.kind==='container'?state.elementId:'eroot')||'eroot';
    sec.elements[id]=newElement(kind,{...options,parentId});
    if(drop){const override=responsive.override(sec.elements[id],state.device);override.effects={position:{x:Math.min(1000,Math.max(0,Number(drop.x)||0)),y:Math.min(1000,Math.max(0,Number(drop.y)||0)),scale:1}};}
  },{tree:true});select(sec.id,id);
  if(kind==='image'&&!options.src)openMedia('element');
}
function syncContent(sec,id,key,value){
  const mapping={'content-heading':{text:'heading'},'content-text':{text:'text'},'content-image':{src:'src',alt:'alt'},'content-video':{src:'src',alt:'alt'},'content-button':{text:'buttonText',href:'href',newTab:'newTab'}};
  const nested=/^content-(items|entries)\.(\d+)\.(question|answer|title|text|src)$/.exec(id||'');if(nested){const item=sec.content?.[nested[1]]?.[Number(nested[2])];if(item)item[key==='alt'?'alt':nested[3]]=value;return;}
  const contentKey=mapping[id]?.[key];if(contentKey){sec.content??={};sec.content[contentKey]=value;}
}
function applyField(input){const key=input.dataset.field,scope=input.dataset.scope||'content';let value=input.type==='checkbox'?input.checked:input.type==='number'||(scope==='effect-gradient'&&key==='angle')?Number(input.value):input.value;
  if(scope==='element'&&key==='text'&&readOnlyCount())return;
  if(scope.startsWith('promo:')&&key==='text'){
    const error=promoTextError(value);input.setCustomValidity(error);input.setAttribute('aria-invalid',String(!!error));
    let hint=input.parentElement.querySelector('.promo-message-error');
    if(error&&!hint){hint=document.createElement('span');hint.className='promo-message-error';hint.setAttribute('role','status');input.parentElement.append(hint);}
    if(hint){hint.textContent=error;hint.hidden=!error;}if(error)return;
  }
  changed(`${scope}:${state.sectionId}:${state.elementId}:${state.device}:${key}`,doc=>{let object;
    if(scope==='seo'||scope==='design')object=doc[scope]??={};
    else if(scope==='visibility')object=responsive.override(target(),state.device);
    else if(scope==='presentation')object=responsive.override(section(),state.device).content??={};
    else if(scope==='section')object=section();
    else if(scope==='element')object=target();
    else if(scope==='content')object=section().content??={};
    else if(scope==='style')object=responsive.styles(target(),state.device);
    else if(scope==='hover')object=responsive.override(target(),state.device).hover??={};
    else if(scope==='animation')object=responsive.override(target(),state.device).animation??={};
    else if(scope.startsWith('faq:'))object=section().content.items[Number(scope.split(':')[1])];
    else if(scope.startsWith('entry:'))object=section().content.entries[Number(scope.split(':')[1])];
    else if(scope.startsWith('promo:')&&isPromo())object=editablePromoMessages()[Number(scope.split(':')[1])];
    else if(scope==='effect-gradient'&&isPromo()){const effects=responsive.override(target(),state.device).effects??={};object=effects.gradient??=promoGradient();}
    else if(scope.startsWith('effect-'))object=responsive.effect(target(),state.device,scope.slice(7));
    if(scope==='style'&&key==='backgroundColor'&&isPromo()){const effects=responsive.override(target(),state.device).effects??={};effects.gradient={...promoGradient(),enabled:false};const check=$('#inspector [data-scope="effect-gradient"][data-field="enabled"]');if(check)check.checked=false;const colors=$('#inspector .gradient-colors');if(colors)colors.hidden=true;}
    if(!object)return;if(scope==='element')syncContent(section(),state.elementId,key,value);if(value===''&&['seo','design','style','hover'].includes(scope))delete object[key];else object[key]=value;
  },{tree:scope==='section'});if(scope==='effect-gradient'&&key==='enabled'){const colors=input.closest('.gradient-controls')?.querySelector('.gradient-colors');if(colors)colors.hidden=!value;}
}
function undo(redo=false){if(!state.doc||state.categoryReorder?.saving)return;state.doc=redo?state.history.redo(state.doc):state.history.undo(state.doc);if(state.categoryReorder){const ids=savedCategoryOrder()||state.categoryReorder.startIds;state.categoryReorder.ids=[...ids];message('category-order-preview',{ids});}if(!section()){state.sectionId=null;state.elementId=null;/* Keep the preview in step, or it would keep drawing chrome for a
     selection the editor no longer has. */message('select',{sectionId:null,elementId:null});}message('apply',{document:state.doc});renderLibrary();renderInspector();status();clearTimeout(autosaveTimer);if(!state.conflict&&!state.categoryReorder&&!state.startingCategoryReorder&&!state.blockReorder)autosaveTimer=setTimeout(()=>saveDraft(false),1600);}
async function sectionAction(action,id){const s=state.doc.sections.find(x=>x.id===id);if(!s)return;
  if(globalRole(s)&&['copy','duplicate','delete','up','down'].includes(action)){toast('Global components stay shared and keep their site positions. You can hide them instead.');return;}
  if(action==='copy'){state.clipboard={page:state.page.id,section:clone(s)};toast('Section copied.');renderLibrary();return;}
  if(action==='delete'&&!await confirmAction('Delete '+s.name+'?','This removes the section from your draft. You can undo this change.','Delete section'))return;
  if(['delete','duplicate','up','down'].includes(action)&&s.region&&s.region!=='main'){toast('The site header and footer keep their original positions.');return;}
  changed('',doc=>{if(action==='visibility')responsive.override(s,state.device).hidden=!responsive.resolve(s,state.device).hidden;if(action==='up'||action==='down')moveSection(doc,id,action==='up'?-1:1);if(action==='delete'){doc.sections=doc.sections.filter(x=>x.id!==id);if(doc.productOrders)delete doc.productOrders[sectionScope(id)];if(state.sectionId===id){state.sectionId=null;state.elementId=null;}}if(action==='duplicate'){const copy=clone(s);copy.id='s-'+crypto.randomUUID();copy.name+=' copy';if(doc.productOrders?.[sectionScope(s.id)])doc.productOrders[sectionScope(copy.id)]=[...doc.productOrders[sectionScope(s.id)]];doc.sections.splice(doc.sections.indexOf(s)+1,0,copy);state.sectionId=copy.id;state.elementId=null;}},{tree:true,inspector:true});
}
function addSection(type){if(!state.doc)return;const item=newSection(type);changed('',doc=>{const selected=section(),index=selected?.region==='main'?doc.sections.indexOf(selected)+1:doc.sections.findIndex(s=>s.region==='footer');doc.sections.splice(index<0?doc.sections.length:index,0,item);},{tree:true});state.tab='content';state.nav='sections';select(item.id);}
function pasteSection(){if(!state.clipboard||!state.doc)return;const copied=state.clipboard.section;if(globalRole(copied)||(copied.region&&copied.region!=='main')){toast('Global components already exist once across the website.');return;}if(copied.type==='native'&&state.clipboard.page!==state.page.id){toast('Paste an existing section into the page it came from. Added sections can be pasted across pages.');return;}const item=clone(copied);item.id='s-'+crypto.randomUUID();item.name+=' copy';changed('',doc=>{const index=doc.sections.findIndex(s=>s.region==='footer');doc.sections.splice(index<0?doc.sections.length:index,0,item);});state.nav='sections';state.tab='content';select(item.id);}
function setDevice(device){if(state.categoryReorder?.saving||!responsive.devices.includes(device))return;endReordering();state.device=device;state.computed={};message('device',{device});$$('[data-device]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.device===device)));resizeCanvas();renderInspector();}
function resizeCanvas(){const width={desktop:1280,tablet:768,mobile:390}[state.device];const stage=$('#canvasStage'),frame=$('#canvasFrame');const gutter=innerWidth<780?20:innerWidth<1250?32:48;const available=Math.max(150,stage.clientWidth-gutter),scale=Math.min(1,available/width);frame.style.width=width+'px';frame.style.height=Math.max(250,(stage.clientHeight-gutter)/scale)+'px';frame.style.transform=`scale(${scale})`;frame.style.marginBottom=(parseFloat(frame.style.height)*(scale-1))+'px';$('#viewportLabel').textContent=width+' · Editing '+deviceName();}
function setPreview(){if(state.categoryReorder?.saving)return;endReordering();state.preview=!state.preview;const editor=$('#editor');editor.classList.toggle('preview-mode',state.preview);editor.classList.remove('show-library');editor.classList.toggle('show-inspector',!state.preview&&wideLayout.matches);$('#preview').setAttribute('aria-pressed',String(state.preview));$('#modeEdit').setAttribute('aria-pressed',String(!state.preview));$('#canvasMode').textContent=state.preview?'Visitor preview':'Click to edit';message('mode',{interactive:state.preview});requestAnimationFrame(resizeCanvas);}
async function showHistory(){if(!state.page)return;$('#historyDialog').showModal();$('#revisionList').textContent='Loading saved revisions…';try{const result=await api('revisions');$('#revisionList').innerHTML=result.revisions.length?result.revisions.map(r=>`<div class="revision"><div><strong>${esc(r.kind==='publish'?'Published version':r.kind==='restore'?'Restored draft':'Saved draft')}</strong><small>${esc(timestamp(r.at))}</small></div><button class="button button-outline" data-restore="${esc(r.id)}">Restore draft</button></div>`).join(''):'<p class="panel-note">No earlier versions yet. Save or publish this page to create its first revision.</p>';}catch(error){$('#revisionList').textContent=error.message;}}
async function restoreRevision(id){if(state.busy)return;$('#historyDialog').close();if(!await confirmAction('Restore this revision?','The selected page content becomes your draft. Current global Promo Bar, Header and Footer are preserved. The live website stays as it is until you publish.','Restore draft'))return;if(!await saveDraft(false))return;state.busy=true;status();try{const result=await api('restore',{page:state.page.id,expectedVersion:state.version,expectedGlobalVersion:state.globalVersion,expectedHeaderVersion:state.headerVersion,revision:id});state.history.commit(state.doc);receiveGlobals(result);state.doc=withEditorGlobals(result.draft);state.version=result.version;state.saved=fingerprint(state.doc);state.savedAt=result.savedAt;state.publishedAt=result.publishedAt;state.sectionId=null;state.elementId=null;message('apply',{document:state.doc});renderLibrary();renderInspector();status();toast('Page revision restored. Global components preserved.');}catch(error){showError(error);}finally{state.busy=false;status();}}
function downloadDraft(){const blob=new Blob([JSON.stringify(state.doc,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='crackersmela-'+state.page.id+'-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

async function openMedia(scope=null){state.mediaApply=scope;state.mediaSelected=null;state.mediaPage=1;state.mediaQuery='';$('#mediaSearch').value='';$('#chooseMedia').disabled=true;$('#chooseMedia').hidden=!scope;$('#mediaDetails').innerHTML='<p>Select an image to preview it and edit its alt text.</p>';$('#mediaDialog').showModal();await loadMedia();}
async function loadMedia(append=false){const sequence=++state.mediaSequence;$('#mediaStatus').textContent='Loading images…';try{const q=new URLSearchParams({a:'list',q:state.mediaQuery,page:String(state.mediaPage),pageSize:'40'});const response=await fetch('/cms-media.php?'+q,{credentials:'same-origin',cache:'no-store'}),result=await response.json();if(sequence!==state.mediaSequence)return;if(!response.ok)throw new Error(result.error||'Could not load media.');state.media=append?state.media.concat(result.items):result.items;state.mediaTotal=result.total;$('#mediaMore').hidden=!result.hasMore;$('#mediaStatus').textContent=result.total+' images · existing site and uploaded media';renderMedia();}catch(error){$('#mediaStatus').textContent=error.message;}}
function renderMedia(){$('#mediaGrid').innerHTML=state.media.length?state.media.map((item,i)=>`<button class="media-tile ${state.mediaSelected?.url===item.url?'active':''}" data-media-index="${i}" title="${esc(item.name)}"><img src="${esc(safePreviewUrl(item.url))}" alt="${esc(item.alt||item.name)}" loading="lazy"><span>${esc(item.name)}</span></button>`).join(''):'<p class="muted">No matching images. Try a different search or upload an image.</p>';}
function selectMedia(index){const item=state.media[index];if(!item)return;state.mediaSelected=item;$('#chooseMedia').disabled=false;renderMedia();$('#mediaDetails').innerHTML=`<img src="${esc(safePreviewUrl(item.url))}" alt="${esc(item.alt||item.name)}"><h3>${esc(item.name)}</h3><p>${Number(item.width)||'?'} × ${Number(item.height)||'?'} · ${Math.round((Number(item.bytes)||0)/1024)} KB</p><div style="height:14px"></div><label class="field"><span>Alt text</span><textarea id="mediaAlt">${esc(item.alt||'')}</textarea></label><button class="button button-outline" id="saveMediaAlt">Save alt text</button><div style="height:17px"></div><button class="button button-outline" id="showCrop">Crop a copy</button><div id="cropControls" hidden><img class="crop-preview" src="${esc(safePreviewUrl(item.url))}" alt="Crop preview" id="cropPreview"><label class="field"><span>Crop shape</span><select id="cropRatio"><option value="1">Square</option><option value="1.7777777778">Landscape 16:9</option><option value="0.75">Portrait 3:4</option></select></label><label class="field"><span>Horizontal focal point</span><input id="cropX" type="range" min="0" max="100" value="50"></label><label class="field"><span>Vertical focal point</span><input id="cropY" type="range" min="0" max="100" value="50"></label><button id="saveCrop" class="button button-primary">Save cropped copy</button><p class="properties-hint">The original image is preserved.</p></div><div style="height:17px"></div>${item.canDelete?'<button class="text-button danger" id="deleteMedia">Delete image</button>':'<p class="properties-hint">This image is protected because it belongs to the website or a saved version.</p>'}`;}
async function uploadBlob(blob,name){if(blob.size>5*1024*1024)throw new Error('Choose an image smaller than 5 MB.');const form=new FormData();form.append('image',blob,name);const response=await fetch('/upload-api.php',{method:'POST',credentials:'same-origin',headers:{'X-CSRF-Token':state.csrf},body:form});let result;try{result=await response.json();}catch{throw new Error('The image upload could not be completed.');}if(!response.ok||result.ok===false)throw new Error(result.error||'The image upload could not be completed.');return result;}
async function uploadImage(file){if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)){toast('Choose a JPG, PNG or WebP image.');return;}$('#mediaStatus').textContent='Uploading image…';try{const result=await uploadBlob(file,file.name);state.mediaQuery='';state.mediaPage=1;$('#mediaSearch').value='';await loadMedia();const index=state.media.findIndex(item=>new URL(item.url,location.origin).pathname===new URL(result.url,location.origin).pathname);if(index>=0)selectMedia(index);toast('Image uploaded.');}catch(error){$('#mediaStatus').textContent=error.message;}finally{$('#mediaUpload').value='';}}
async function cropImage(){const item=state.mediaSelected;if(!item)return;const button=$('#saveCrop');button.disabled=true;button.textContent='Saving…';try{const image=new Image();image.src=safePreviewUrl(item.url);await image.decode();const ratio=Number($('#cropRatio').value),x=Number($('#cropX').value)/100,y=Number($('#cropY').value)/100;let width=image.naturalWidth,height=image.naturalHeight;if(width/height>ratio)width=height*ratio;else height=width/ratio;const scale=Math.min(1,2048/Math.max(width,height)),canvas=document.createElement('canvas');canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);canvas.getContext('2d').drawImage(image,(image.naturalWidth-width)*x,(image.naturalHeight-height)*y,width,height,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.9));if(!blob)throw new Error('This image could not be cropped.');const result=await uploadBlob(blob,'cropped-image.webp');state.mediaQuery='';state.mediaPage=1;$('#mediaSearch').value='';await loadMedia();const index=state.media.findIndex(entry=>new URL(entry.url,location.origin).pathname===new URL(result.url,location.origin).pathname);if(index>=0)selectMedia(index);toast('Cropped copy saved.');}catch(error){toast(error.message);if(button.isConnected){button.disabled=false;button.textContent='Save cropped copy';}}}
function chooseMedia(){
  const item=state.mediaSelected,scope=state.mediaApply;if(!item||!scope)return;
  changed('',doc=>{
    if(scope==='seo'){doc.seo??={};doc.seo.ogImage=new URL(item.url,location.origin).pathname;}
    else if(scope==='background'){const value=responsive.override(target(),state.device);value.effects??={};value.effects.backgroundImage=item.url;}
    else{const object=scope==='element'?target():section()?.content;if(object){object.src=item.url;object.alt=item.alt||'';object.hidden=false;if(scope==='element'){syncContent(section(),state.elementId,'src',item.url);syncContent(section(),state.elementId,'alt',item.alt||'');}}}
  },{inspector:true});$('#mediaDialog').close();toast('Image replaced.');
}

$('#nav').addEventListener('click',event=>{const button=event.target.closest('[data-nav]');if(button)navigatePanel(button.dataset.nav);});
function navigatePanel(nav){if(nav==='media'){openMedia();return;}state.advanced=false;state.nav=nav;if(['settings','seo'].includes(nav))$('#editor').classList.add('show-inspector');if(['typography','layout','design','buttons'].includes(nav))state.tab='style';else if(nav==='content')state.tab='content';if(innerWidth<=820&&['pages','elements','uploads','sections','add'].includes(nav))$('#editor').classList.toggle('show-library',true);else $('#editor').classList.remove('show-library');renderNav();renderLibrary();renderInspector();if(nav==='uploads')loadUploads();}
$('#library').addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;if(b.dataset.page)loadPage(b.dataset.page);if(b.dataset.nav)navigatePanel(b.dataset.nav);if(b.dataset.selectSection)select(b.dataset.selectSection);if(b.dataset.selectElement)select(state.sectionId,b.dataset.selectElement);if(b.dataset.sectionAction)sectionAction(b.dataset.sectionAction,b.dataset.id);if(b.dataset.addSection)addSection(b.dataset.addSection);if(b.hasAttribute('data-paste'))pasteSection();});
let dragged=null;
// Opening the page options grows the row, so the list is revealed again or
// the buttons end up under the sidebar footer. `toggle` does not bubble, so
// this listens in the capture phase.
$('#library').addEventListener('toggle',event=>{if(event.target.matches?.('.page-options'))revealActiveRow();},true);
$('#library').addEventListener('dragstart',event=>{const row=event.target.closest('[data-section-row]');if(!row||row.draggable!==true)return;dragged=row.dataset.sectionRow;event.dataTransfer.setData('text/plain',dragged);event.dataTransfer.effectAllowed='move';});
$('#library').addEventListener('dragover',event=>{const row=event.target.closest('[data-section-row]');if(row&&dragged){event.preventDefault();$$('.drag-over').forEach(e=>e.classList.remove('drag-over'));row.classList.add('drag-over');}});
$('#library').addEventListener('dragend',()=>{dragged=null;$$('.drag-over').forEach(e=>e.classList.remove('drag-over'));});
$('#library').addEventListener('drop',event=>{event.preventDefault();const row=event.target.closest('[data-section-row]');if(!row||!dragged)return;const from=state.doc.sections.findIndex(s=>s.id===dragged),to=state.doc.sections.findIndex(s=>s.id===row.dataset.sectionRow);if(from!==to&&from>=0&&to>=0&&!globalRole(state.doc.sections[from])&&!globalRole(state.doc.sections[to])&&(state.doc.sections[from].region||'main')===(state.doc.sections[to].region||'main'))changed('',doc=>{const [s]=doc.sections.splice(from,1);doc.sections.splice(to,0,s);},{tree:true});dragged=null;});
$('#inspector').addEventListener('input',event=>{if(event.target.matches('[data-field]')&&!['checkbox'].includes(event.target.type)&&event.target.tagName!=='SELECT')applyField(event.target);});
$('#inspector').addEventListener('click',event=>{
  const move=event.target.closest('[data-block-move]'),row=move?.closest('[data-block-id]');
  if(row&&move.dataset.blockMove)moveProductBlock(row.dataset.blockGroup,row.dataset.blockId,move.dataset.blockMove);
  if(event.target.closest('[data-block-cancel]'))endProductBlocks(false);
  if(event.target.closest('[data-block-save]'))saveDraft();
});
$('#inspector').addEventListener('pointerdown',event=>{
  const handle=event.target.closest('[data-block-handle]'),row=handle?.closest('[data-block-id]');
  if(!row||!state.blockReorder||event.button!==0)return;
  event.preventDefault();state.blockDrag={pointerId:event.pointerId,group:row.dataset.blockGroup,id:row.dataset.blockId};
  $('#inspector').setPointerCapture(event.pointerId);row.classList.add('is-dragging');
});
$('#inspector').addEventListener('pointermove',event=>{
  const drag=state.blockDrag;if(!drag||drag.pointerId!==event.pointerId)return;
  const row=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-block-id]');
  if(row&&row.dataset.blockGroup===drag.group&&row.dataset.blockId!==drag.id)moveProductBlock(drag.group,drag.id,row.dataset.blockId);
  const box=$('#inspector').getBoundingClientRect();if(event.clientY<box.top+55)$('#inspector').scrollTop-=14;else if(event.clientY>box.bottom-55)$('#inspector').scrollTop+=14;
});
for(const type of ['pointerup','pointercancel'])$('#inspector').addEventListener(type,event=>{
  if(state.blockDrag?.pointerId!==event.pointerId)return;
  state.blockDrag=null;if($('#inspector').hasPointerCapture(event.pointerId))$('#inspector').releasePointerCapture(event.pointerId);renderInspector();
});
$('#inspector').addEventListener('click',event=>{const button=event.target.closest('[data-promo-action]');if(button)promoAction(button.dataset.promoAction,Number(button.dataset.promoIndex));});
$('#inspector').addEventListener('change',event=>{if(event.target.matches('[data-field]')&&(event.target.type==='checkbox'||event.target.tagName==='SELECT'))applyField(event.target);if(event.target.matches('[data-product]'))changed('',()=>{const c=section().content;c.productIds??=[];const id=Number(event.target.dataset.product);c.productIds=event.target.checked?[...new Set([...c.productIds,id])]:c.productIds.filter(x=>x!==id);});});
$('#inspector').addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;if(b.dataset.tab){state.tab=b.dataset.tab;if(['typography','layout','design','buttons','animations'].includes(state.nav))state.nav='sections';renderNav();renderInspector();}if(b.dataset.media)openMedia(b.dataset.media);if(b.hasAttribute('data-remove-image'))changed('',()=>{const object=b.dataset.removeImage==='element'?target():section().content;object.src='';object.alt='';if(b.dataset.removeImage==='element')responsive.hideEverywhere(object);},{inspector:true});if(b.hasAttribute('data-reset-style'))changed('',()=>{const value=responsive.override(target(),state.device);if(state.tab==='hover')delete value.hover;else delete value.styles;},{inspector:true});if(b.hasAttribute('data-add-faq'))changed('',()=>section().content.items.push({question:'New question',answer:''}),{inspector:true});if(b.hasAttribute('data-delete-faq'))changed('',()=>section().content.items.splice(Number(b.dataset.deleteFaq),1),{inspector:true});if(b.hasAttribute('data-history'))showHistory();if(b.hasAttribute('data-export'))downloadDraft();});
$$('[data-device]').forEach(b=>{b.innerHTML=icon(b.dataset.device)+'<span>'+b.dataset.device[0].toUpperCase()+b.dataset.device.slice(1)+'</span>';b.onclick=()=>setDevice(b.dataset.device);});
$('#toggleLibrary').onclick=()=>{const open=$('#editor').classList.toggle('show-library');$('#toggleLibrary').setAttribute('aria-expanded',String(open));if(open)$('#editor').classList.remove('show-inspector');};
$('#reorderCategories').onclick=openCategoryReorder;$('#reorderProductBlocks').onclick=openProductBlocks;
$('#undo').innerHTML=icon('undo');$('#redo').innerHTML=icon('redo');$('#undo').onclick=()=>undo();$('#redo').onclick=()=>undo(true);$('#save').onclick=()=>saveDraft();$('#publish').onclick=publish;$('#preview').onclick=setPreview;$('#modeEdit').onclick=()=>{if(state.preview)setPreview();};$('#history').onclick=showHistory;
// Discard only ever throws away local edits; the saved draft is reloaded from
// the server, so nothing a customer can see is affected.
$('#discard').onclick=async()=>{
  if(state.busy||state.saving||!dirty())return;
  if(!await confirmAction('Discard unsaved changes?','Unsaved changes to this page and its shared global components will be discarded. Their saved drafts stay unchanged.','Discard changes'))return;
  await loadPage(state.page.id,undefined,true);
  toast('Unsaved changes discarded.');
};
// The properties rail is a column on wide screens and an overlay on narrow
// ones; this is the only way to reach it there.
$('#toggleInspector').onclick=()=>{const open=$('#editor').classList.toggle('show-inspector');$('#toggleInspector').setAttribute('aria-expanded',String(open));};
// The toggle shows the theme it switches TO, so the way back is never a guess.
const syncTheme=()=>{const dark=document.body.dataset.theme==='dark',b=$('#theme');if(!b)return;b.innerHTML=icon(dark?'sun':'moon');b.title=(dark?'Switch to light':'Switch to dark')+' theme';b.setAttribute('aria-label',b.title);};
$('#theme').onclick=()=>{document.body.dataset.theme=document.body.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem('cm-editor-theme',document.body.dataset.theme);}catch{}syncTheme();};
$('#reloadPage').onclick=async()=>{if(dirty()&&!await confirmAction('Reload saved draft?','This discards unsaved local edits. Download a copy in Settings first if you want to keep them.','Reload draft'))return;state.loading=false;loadPage(state.page.id,undefined,true);};
$('#closeHistory').onclick=()=>$('#historyDialog').close();$('#revisionList').onclick=event=>{const button=event.target.closest('[data-restore]');if(button)restoreRevision(button.dataset.restore);};
$('#closeMedia').onclick=()=>$('#mediaDialog').close();$('#mediaGrid').onclick=event=>{const button=event.target.closest('[data-media-index]');if(button)selectMedia(Number(button.dataset.mediaIndex));};$('#chooseMedia').onclick=chooseMedia;
$('#mediaMore').onclick=()=>{state.mediaPage++;loadMedia(true);};let searchTimer;
$('#mediaSearch').oninput=event=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{state.mediaQuery=event.target.value;state.mediaPage=1;loadMedia();},250);};$('#mediaUpload').onchange=event=>uploadImage(event.target.files[0]);
$('#mediaDetails').onclick=async event=>{const button=event.target.closest('button');if(!button)return;try{if(button.id==='saveMediaAlt'){const alt=$('#mediaAlt').value;await api('update',{url:state.mediaSelected.url,alt},'cms-media.php');state.mediaSelected.alt=alt;toast('Alt text saved.');}if(button.id==='showCrop')$('#cropControls').hidden=!$('#cropControls').hidden;if(button.id==='saveCrop')await cropImage();if(button.id==='deleteMedia'){if(!await confirmAction('Delete this image?','This permanently deletes an unused uploaded image. Images used by products or saved pages are protected.','Delete image'))return;await api('delete',{url:state.mediaSelected.url},'cms-media.php');state.mediaSelected=null;$('#chooseMedia').disabled=true;$('#mediaDetails').textContent='Image deleted.';state.mediaPage=1;await loadMedia();toast('Image deleted.');}}catch(error){toast(error.message);}};
$('#mediaDetails').oninput=event=>{if(['cropX','cropY','cropRatio'].includes(event.target.id)){$('#cropPreview').style.objectPosition=$('#cropX').value+'% '+$('#cropY').value+'%';$('#cropPreview').style.aspectRatio=$('#cropRatio').value;}};
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==$('#siteFrame').contentWindow||event.data?.channel!=='cm-editor')return;const data=event.data;
  if(data.type==='ready'&&data.page===state.page?.id){const first=!state.ready;state.ready=true;state.loading=false;if(first){state.baseline=clone(data.document);const loaded=!!state.pendingDoc;state.doc=withEditorGlobals(clone(state.pendingDoc||data.document));if(loaded)state.saved=fingerprint(state.doc);}else state.doc=clone(state.doc||withEditorGlobals(clone(data.document)));state.pendingDoc=null;if(validProductCategory(data.category))state.productCategory=data.category;$('#loading').hidden=true;message('apply',{document:state.doc});message('mode',{interactive:state.preview});message('device',{device:state.device});const pending=state.pendingReorder?.category===data.category?state.pendingReorder:null;if(pending)state.pendingReorder=null;state.startingReorder=!!state.pendingReorder;if(pending){state.sectionId=pending.sectionId;state.elementId=null;message('product-reorder',{active:true,...pending});}renderLibrary();renderInspector();status();resizeCanvas();if(first&&Array.isArray(state.globals?.categoryOrder))message('category-order-preview',{ids:state.globals.categoryOrder});if(state.pendingBlockEntry){state.pendingBlockEntry=false;openProductBlocks();}else if(state.pendingCategoryEntry){state.pendingCategoryEntry=false;openCategoryReorder();}else if(first&&!state.saved)autosaveTimer=setTimeout(()=>saveDraft(false),1600);}
  if(data.type==='product-category'&&!state.preview)switchProductCategory(data.category);
  if(data.type==='product-reorder-state'){
    if(data.active&&((isProductsPage()&&validProductCategory(data.category)&&data.category===state.productCategory)||(isHomePage()&&data.category===sectionScope(data.sectionId)))&&state.doc.sections.some(sec=>sec.id===data.sectionId&&isReorderSection(sec)))state.productReorder={sectionId:data.sectionId,category:data.category,ids:Array.isArray(data.ids)?data.ids:null};
    else if(!data.active){state.productReorder=null;if(['refresh-error','category-unavailable'].includes(data.reason)){state.pendingReorder=null;state.startingReorder=false;state.loading=false;}}
    $('#canvasMode').textContent=state.productReorder?'Reordering products':state.preview?'Visitor preview':'Click to edit';renderInspector();
  }
  if(data.type==='product-reorder-operation')applyProductReorder(data);
  if(data.type==='category-reorder-request')startCategoryReorder(data.sectionId,data.target);
  if(data.type==='category-reorder-state'){
    if(data.active&&!state.preview&&!state.loading&&(state.startingCategoryReorder||state.categoryReorder)&&data.sectionId===state.sectionId&&(isCategoryReorderSection(section())||categoryTarget(data.target)!=='grid')&&validCategoryOrder(data.ids)){
      // startIds is the order this session opened with. Cancel restores exactly
      // that, and never moves as the cards move.
      state.categoryReorder={...state.categorySession,...state.categoryReorder,sectionId:data.sectionId,target:categoryTarget(data.target),ids:[...data.ids],startIds:[...(state.categoryReorder?.startIds||data.ids)]};state.startingCategoryReorder=false;
    }else if(!data.active){endCategoryReorder();}
    $('#canvasMode').textContent=state.categoryReorder?'Reordering categories':state.productReorder?'Reordering products':state.preview?'Visitor preview':'Click to edit';renderInspector();
  }
  if(data.type==='category-reorder-operation')applyCategoryReorder(data);
  // Save order and Cancel come from the toolbar on the canvas, so the draft and
  // the history are written by the same code the sidebar buttons use.
  if(data.type==='category-reorder-save')saveCategoryOrder();
  if(data.type==='category-reorder-cancel')cancelCategoryReorder();
  // Actions raised by the floating toolbar on the canvas. They re-enter the
  // same handlers the sidebar and rail use, so there is one implementation.
  if(data.type==='section-action'&&!state.preview&&state.doc?.sections.some(s=>s.id===data.sectionId))sectionAction(data.action,data.sectionId);
  if(data.type==='edit-text'&&!state.preview)message('edit-text');
  if(data.type==='open-media'&&!state.preview&&state.elementId)openMedia(data.scope||'element');
  if(data.type==='select'&&!state.preview){const sec=state.doc?.sections.find(s=>s.id===data.sectionId);if(sec&&data.elementId&&data.descriptor){sec.elements??={};sec.elements[data.elementId]??=data.descriptor;}state.computed=data.computed||{};select(data.sectionId,data.elementId,true);}
  if(data.type==='operation'&&!state.preview)applyOperation(data);
  if(data.type==='drop'&&!state.preview&&data.payload?.type)addElement(data.payload.type,{src:data.payload.src,alt:data.payload.alt},data);
  if(data.type==='navigate'&&data.page)loadPage(data.page,data.hash);
  if(data.type==='error')showError(new Error(data.message||'The preview could not apply this change.'));
  if(data.type==='notice')toast(data.message);
  if(data.type==='shortcut'){if(data.action==='undo')undo();if(data.action==='redo')undo(true);if(data.action==='save')saveDraft();}
});
window.addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}});
document.addEventListener('keydown',event=>{if($('dialog[open]'))return;const command=event.ctrlKey||event.metaKey;if(command&&event.key.toLowerCase()==='s'){event.preventDefault();saveDraft();}if(command&&event.key.toLowerCase()==='z'){event.preventDefault();undo(event.shiftKey);}if(event.key==='Escape'){endReordering();state.sectionId=null;state.elementId=null;message('select',{sectionId:null,elementId:null});renderLibrary();renderInspector();}if(command&&event.shiftKey&&event.key.toLowerCase()==='c'&&state.sectionId){event.preventDefault();sectionAction('copy',state.sectionId);}if(command&&event.shiftKey&&event.key.toLowerCase()==='v'){event.preventDefault();pasteSection();}});
new ResizeObserver(()=>resizeCanvas()).observe($('#canvasStage'));
// Toolbar rows wrap with screen width, language and save status. Overlay panels
// must begin below the real toolbar, including on small phones.
new ResizeObserver(()=>document.documentElement.style.setProperty('--chrome-h',Math.ceil($('.toolbar').getBoundingClientRect().height)+'px')).observe($('.toolbar'));
// Dark chrome is the default. The website in the canvas is unaffected.
try{document.body.dataset.theme=localStorage.getItem('cm-editor-theme')||'dark';}catch{}
syncTheme();
// The properties rail is a column on wide screens and an overlay on narrow
// ones. Crossing that boundary must not leave a drawer covering the canvas.
const wideLayout=matchMedia('(min-width: 1001px)'),wideCanvas=matchMedia('(min-width: 821px)');
const applyLayout=()=>{const editor=$('#editor');editor.classList.toggle('show-inspector',wideLayout.matches&&!state.preview);if(!wideCanvas.matches)editor.classList.remove('show-library');};
wideLayout.addEventListener('change',applyLayout);wideCanvas.addEventListener('change',applyLayout);
applyLayout();
renderNav();renderLibrary();renderInspector();
async function init(){try{const data=await api('pages');state.pages=data.pages;state.csrf=data.csrfToken;const products=await api('products');state.products=products.products||[];state.categories=products.categories||[];await loadPage(state.pages.find(p=>p.id===new URLSearchParams(location.search).get('page'))?.id||'home');}catch(error){showError(error);$('#loading strong').textContent='The editor could not connect';$('#loading>span:last-child').textContent=error.message;if(error.status===401){$('#loading>span:last-child').innerHTML='<a class="button button-primary" href="/#/staff">Sign in to admin</a>';}}}
init();

async function refreshPages(){const result=await api('pages');state.pages=result.pages;state.csrf=result.csrfToken;state.page=state.pages.find(p=>p.id===state.page?.id)||state.page;$('#pageTitle').textContent=state.page?.name||'';renderLibrary();}
let pageDialogMode='create',pageSlugEdited=false;
function showPageDialog(mode='create'){
  if(state.busy)return;
  pageDialogMode=mode;pageSlugEdited=false;
  $('#pageDialogTitle').textContent=mode==='rename'?'Rename page':mode==='duplicate'?'Duplicate page':'Add page';
  $('#newPageName').value=mode==='rename'?state.page.name:mode==='duplicate'?state.page.name+' copy':'';
  $('#newPageSlug').value=mode==='duplicate'?(state.page.slug||state.page.id)+'-copy':'';
  $('#slugField').hidden=mode==='rename';$('#newPageSlug').required=mode!=='rename';
  $('#pageFormError').hidden=true;$('#pageFormSubmit').disabled=false;
  $('#pageFormSubmit').textContent=mode==='rename'?'Save name':mode==='duplicate'?'Duplicate page':'Create page';
  $('#pageDialog').showModal();$('#newPageName').focus();
}
async function pageAction(action){
  if(state.busy)return;
  if(['rename','duplicate'].includes(action)){showPageDialog(action);return;}
  if(!['delete','unpublish'].includes(action)||!state.page)return;
  if(!await confirmAction((action==='delete'?'Delete ':'Unpublish ')+state.page.name+'?',action==='delete'?'This page will be removed from your website. Its saved content is retained for recovery.':'Visitors will no longer be able to open this page. You can publish it again any time.',action==='delete'?'Delete page':'Unpublish'))return;
  if(!await saveDraft(false))return;
  state.busy=true;status();try{const result=await api('page-'+action,{page:state.page.id,expectedVersion:state.version});state.version=result.version;await refreshPages();if(action==='delete'){state.busy=false;state.saved=fingerprint(state.doc);await loadPage('home',undefined,true);}else{status();}toast(action==='delete'?'Page deleted.':'Page unpublished.');}catch(e){showError(e);}finally{state.busy=false;status();}
}
$('#newPageName').addEventListener('input',()=>{if(!pageSlugEdited&&pageDialogMode==='create')$('#newPageSlug').value=$('#newPageName').value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);});
$('#newPageSlug').addEventListener('input',()=>pageSlugEdited=true);
$('#closePageDialog').onclick=$('#cancelPageDialog').onclick=()=>$('#pageDialog').close();
$('#pageForm').addEventListener('submit',async event=>{
  event.preventDefault();const button=$('#pageFormSubmit');button.disabled=true;$('#pageFormError').hidden=true;
  try{
    if(!await saveDraft(false))throw new Error('Save the current page before continuing.');
    const body={name:$('#newPageName').value.trim()};
    if(pageDialogMode!=='rename')body.slug=$('#newPageSlug').value.trim();
    if(pageDialogMode!=='create'){body.page=state.page.id;body.expectedVersion=state.version;}
    state.busy=true;status();const result=await api(pageDialogMode==='rename'?'page-update':pageDialogMode==='duplicate'?'page-duplicate':'page-create',body);
    if(pageDialogMode==='rename')state.version=result.version;
    await refreshPages();$('#pageDialog').close();state.busy=false;
    if(pageDialogMode!=='rename')await loadPage(result.page);else renderInspector();
    toast(pageDialogMode==='rename'?'Page renamed.':'Your page is ready to edit.');
  }catch(e){$('#pageFormError').textContent=e.message;$('#pageFormError').hidden=false;}finally{state.busy=false;button.disabled=false;status();}
});
function applyOperation(data){
  if(data.action==='text'&&readOnlyCount(data.sectionId,data.elementId))return;
  const sec=state.doc?.sections.find(s=>s.id===data.sectionId);if(!sec)return;
  if(data.action==='delete'){state.sectionId=data.sectionId;state.elementId=data.elementId||null;if(!data.elementId){sectionAction('delete',data.sectionId);return;}confirmAction('Delete this element?','You can undo this change.','Delete element').then(ok=>{if(ok)changed('',()=>{responsive.hideEverywhere(sec.elements[data.elementId]);state.elementId=null;},{inspector:true});});return;}
  const device=['desktop','tablet','mobile'].includes(data.device)?data.device:state.device;
  changed(data.action==='text'?'inline:'+data.sectionId+':'+data.elementId:'',doc=>{
    sec.elements??={};if(data.elementId&&!sec.elements[data.elementId]&&data.descriptor)sec.elements[data.elementId]=clone(data.descriptor);
    const node=data.elementId?sec.elements[data.elementId]:sec;if(!node)return;
    if(['move','resize'].includes(data.action)){
      const override=responsive.override(node,device);override.effects??={};
      if(data.position)override.effects.position={...responsive.resolve(node,device).effects.position,...data.position};
      if(data.styles){const styles=responsive.styles(node,device);for(const key of ['width','height','maxWidth','minHeight'])if(data.styles[key])styles[key]=data.styles[key];}
    }
    if(data.action==='text'){node.text=String(data.text||'');syncContent(sec,data.elementId,'text',node.text);}
    if(data.action==='reorder'&&!globalRole(sec)&&(sec.region||'main')==='main'){
      if(data.delta){moveSection(doc,sec.id,Math.sign(data.delta));return;}
      const before=doc.sections.find(s=>s.id===data.beforeSectionId);
      if(before===sec)return;
      if(before&&(globalRole(before)||(before.region||'main')!=='main'))return;
      doc.sections=doc.sections.filter(s=>s!==sec);
      const index=before?doc.sections.indexOf(before):doc.sections.findIndex(s=>s.region==='footer');
      doc.sections.splice(index<0?doc.sections.length:index,0,sec);
    }
  },{tree:data.action==='reorder'});
  state.sectionId=data.sectionId;state.elementId=data.elementId||null;renderInspector();
}
document.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.action==='product-reorder')startProductReorder();
  if(b.dataset.action==='product-reorder-done')endProductReorder();
  if(b.dataset.action==='category-reorder-save')saveCategoryOrder();
  if(b.dataset.action==='category-reorder-cancel')cancelCategoryReorder();
  if(b.dataset.action==='category-reorder-reset')resetCategoryOrder();
  if(b.dataset.action==='category-reorder-undo')undo();
  if(b.hasAttribute('data-page-create'))showPageDialog();
  if(b.dataset.pageAction)pageAction(b.dataset.pageAction);
  if(b.hasAttribute('data-open-media'))openMedia();
  if(b.hasAttribute('data-page-settings'))navigatePanel('settings');
  if(b.hasAttribute('data-add-element'))addElement(b.dataset.addElement);
  if(b.hasAttribute('data-upload-index')){const item=state.uploads[Number(b.dataset.uploadIndex)];if(item)addElement('image',{src:item.url,alt:item.alt});}
  if(b.hasAttribute('data-upload-more'))loadUploads(true);
  if(!b.closest('#inspector'))return;
  if(b.hasAttribute('data-advanced')){state.advanced=true;renderInspector();}
  if(b.hasAttribute('data-basic')){state.advanced=false;if(state.nav==='settings')state.nav='pages';renderNav();renderLibrary();renderInspector();}
  if(b.hasAttribute('data-deselect'))deselect();
  if(b.dataset.sectionAction)sectionAction(b.dataset.sectionAction,b.dataset.id);
  if(b.hasAttribute('data-edit-text'))message('edit-text');
  if(b.hasAttribute('data-bold'))changed('',()=>{const t=target();responsive.styles(t,state.device).fontWeight=Number(inheritedStyle('fontWeight',400))>=600?'400':'700';},{inspector:true});
  if(b.dataset.nudge)message('nudge',{direction:b.dataset.nudge,amount:10});
  if(b.hasAttribute('data-reset-device'))changed('',()=>{if(target().overrides)delete target().overrides[state.device];},{tree:true,inspector:true});
  if(b.hasAttribute('data-reset-position'))changed('',()=>{responsive.effect(target(),state.device,'position');responsive.override(target(),state.device).effects.position={x:0,y:0,scale:1};},{inspector:true});
  if(b.hasAttribute('data-delete-element'))confirmAction('Delete this element?','You can undo this change.','Delete element').then(ok=>{if(ok)changed('',()=>{responsive.hideEverywhere(target());state.elementId=null;},{tree:true,inspector:true});});
  if(b.hasAttribute('data-duplicate-element')){
    const original=target();if(!original)return;const copy=clone(original),sec=section(),id='a-'+crypto.randomUUID();copy.added=true;copy.parentId=original.parentId||'eroot';copy.name=(original.name||'Element')+' copy';
    changed('',()=>{
      sec.elements[id]=copy;
      if(original.kind==='container'){
        const keys=new Map([[state.elementId,id]]),descendants=Object.entries(sec.elements).filter(([key,node])=>key!==id&&node.added);
        for(let pass=0;pass<21;pass++)for(const [key,node]of descendants)if(!keys.has(key)&&keys.has(node.parentId))keys.set(key,'a-'+crypto.randomUUID());
        for(const [key,newId]of keys)if(key!==state.elementId){const child=clone(sec.elements[key]);child.parentId=keys.get(child.parentId);sec.elements[newId]=child;}
      }
    },{tree:true});select(sec.id,id);
  }
  if(b.hasAttribute('data-crop-image')){
    const src=target()?.src;openMedia('element').then(()=>{const index=state.media.findIndex(item=>item.url===src);if(index>=0){selectMedia(index);$('#cropControls').hidden=false;}else toast('Choose the image you want to crop.');});
  }
});
$('#inspector').addEventListener('input',event=>{
  const input=event.target;
  if(input.matches('[data-simple-style]')){const value=input.value;changed('size:'+state.sectionId+':'+state.elementId+':'+state.device+':'+input.dataset.simpleStyle,()=>{const t=target();const styles=responsive.styles(t,state.device);if(t.kind==='icon'&&input.dataset.simpleStyle==='width')styles.height=value+'px';if(value==='')delete styles[input.dataset.simpleStyle];else if(Number.isFinite(Number(value)))styles[input.dataset.simpleStyle]=value+(input.dataset.unit||'');});}
  if(input.matches('[data-simple-opacity]')){changed('opacity:'+state.sectionId+':'+state.elementId+':'+state.device,()=>{const t=target();responsive.styles(t,state.device).opacity=String(Number(input.value)/100);});const output=input.parentElement.querySelector('output');if(output)output.textContent=input.value+'%';}
  if(input.type==='color'){const display=input.parentElement.querySelector('.color-value');if(display)display.textContent=input.value.toUpperCase();}
});
$('#library').addEventListener('change',async event=>{
  if(!event.target.matches('[data-upload-image]'))return;
  const file=event.target.files[0];if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){toast('Choose a JPG, PNG or WebP image.');return;}
  event.target.disabled=true;try{await uploadBlob(file,file.name);await loadUploads();toast('Image uploaded. Drag it onto your page.');}catch(e){toast(e.message);}finally{if(event.target.isConnected){event.target.value='';event.target.disabled=false;}}
});
$('#library').addEventListener('dragstart',event=>{
  const item=event.target.closest('[data-add-element],[data-upload-index]');if(!item)return;
  const payload=item.hasAttribute('data-add-element')?{type:item.dataset.addElement}:{type:'image',src:state.uploads[Number(item.dataset.uploadIndex)]?.url,alt:state.uploads[Number(item.dataset.uploadIndex)]?.alt};
  event.dataTransfer.setData('application/x-cm-element',JSON.stringify(payload));event.dataTransfer.effectAllowed='copy';
});
