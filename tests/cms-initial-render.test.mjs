import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const path = relative => fileURLToPath(new URL(relative, import.meta.url)).replaceAll('\\', '/');
const php = process.env.PHP_BIN || path('../audit-evidence/tools/php-8.1.34/php.exe');
const source = path('../visual-editor/');
const execute = input => {
  const code = `
  function cmCmsColor($value) { return is_string($value) && preg_match('/^#(?:[a-f0-9]{3}|[a-f0-9]{6}|[a-f0-9]{8})$/i',$value); }
  function cmSeoEscape($value) { return htmlspecialchars((string)$value,ENT_QUOTES,'UTF-8'); }
  function cmSafeImage($value) { return preg_match('#^(?:images/|uploads/|https://)#',$value) ? $value : ''; }
  function cmBaseData() { return ['categories'=>[['id'=>'sparklers','name'=>'Sparklers'],['id'=>'fancy','name'=>'Fancy']]]; }
  function cmSeoUrl($p) { return '/product/product-' . $p['id']; }
  function cmProductBrandPill($p,$compact=false) { return ''; }
  `;
  // Load maintained renderer sources, with backend/catalog and brand boundaries
  // stubbed above. These tests do not depend on a prepared deployment candidate.
  const load = ['cm-page-content.php', 'cm-page-products.php', 'cm-cms-render.php', 'cm-home.php'].map(file => source + file)
    .map(file => `eval('?>'.preg_replace('/^require_once[^;]*;/m','',file_get_contents(${JSON.stringify(file)})));`).join('\n');
  const run = `${code}\n${load}\n$input=json_decode(stream_get_contents(STDIN),true); if(($input['action']??'')==='hero') { $selected=cmHomeFeaturedProducts($input['products']); echo json_encode(['ids'=>array_column($selected,'id'),'html'=>cmHomeHeroShowcase($selected)]); } else { $html=cmCmsRenderInitial($input['html'],'home',$input['published']??null,$input['globals']??[]); echo cmCmsRenderBootstrap($html,'home',$input['published']??null,$input['globals']??[],7); }`;
  const result = spawnSync(php, ['-r', run], { input: JSON.stringify(input), encoding: 'utf8', maxBuffer: 4*1024*1024 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.doesNotMatch(result.stdout, /Warning:|Fatal error:/);
  return result.stdout;
};
const document = sections => ({ schemaVersion:1, id:'home', sections });
const native = (id, elements={}, extra={}) => ({ id, source:id, type:'native', region:'main', elements, ...extra });
const shell = body => `<!doctype html><html><head><meta charset="utf-8"><script>window.literal="<&";</script></head><body><div id="promoBar"><div id="promoTrack">OLD SALE</div></div><header id="navbar"><div><img src="images/logo.png" alt="Logo"></div></header><main id="view">${body}</main><script src="/app.js?v=current"></script></body></html>`;

test('initial HTML applies published text, exact device visibility and layout before scripts', () => {
  const html = execute({html:shell('<section class="hero"><canvas></canvas><div><h1>OLD <span>HEADING</span></h1></div></section>'), published:document([native('home:hero', {
    'e1.0.0':{kind:'text',text:'LATEST',hidden:true,styles:{desktop:{width:'415px',height:'133px'}},effects:{desktop:{position:{x:-5.7,y:10.6,scale:1}}},overrides:{mobile:{hidden:false}}},
    'e1.0.1':{kind:'text',text:'STORE',overrides:{desktop:{styles:{fontSize:'38px'},effects:{position:{x:12,y:-4,scale:1}}}}}
  })])});
  assert.match(html, />LATEST<\/span>/); assert.match(html, />STORE<\/span>/);
  assert.doesNotMatch(html.match(/<main[^>]*>(.*?)<\/main>/s)[1], />OLD |HEADING/);
  assert.match(html, /@media \(min-width:1024\.01px\).*?e1\.0\.0.*?display:none!important/);
  assert.match(html, /font-size:38px!important/); assert.match(html, /translate:12px -4px!important/);
  assert.match(html, /e1\.0\.0"\]\[data-cms-inline\]\{display:none!important\}/);
  const style = html.match(/<style data-cm-initial-css>(.*?)<\/style>/s)[1];
  assert.doesNotMatch(style, /@media \(max-width:767px\)\{[^}]*e1\.0\.0[^}]*display:none/);
});

test('a published hidden hero eyebrow hides its wrapper before scripts while retaining child text IDs', () => {
  const html = execute({html:shell('<section class="hero"><canvas></canvas><div><div><span class="hero-eyebrow"><span class="dot"></span>Original eyebrow</span></div></div></section>'),published:document([native('home:hero', {
    'e1.0.0':{kind:'container',hidden:true},
    'e1.0.0.1':{kind:'text',text:'Published eyebrow'}
  })])});
  const main = html.match(/<main[^>]*>(.*?)<\/main>/s)[1];
  const style = html.match(/<style data-cm-initial-css>(.*?)<\/style>/s)[1];
  assert.match(main, /<span class="hero-eyebrow" data-cms-element="e1\.0\.0">/);
  assert.match(main, /<span class="dot"><\/span><span data-cms-text="" data-cms-element="e1\.0\.0\.1" data-cms-inline="">Published eyebrow<\/span>/);
  assert.doesNotMatch(main, /Original eyebrow/);
  for (const media of ['(min-width:1024.01px)','(min-width:767.01px) and (max-width:1024px)','(max-width:767px)']) {
    assert.ok(style.includes(`@media ${media}{[data-cms-section="home:hero"] [data-cms-element="e1.0.0"]{display:none!important}`), `Eyebrow wrapper must be hidden on ${media}`);
  }
});

test('hero statistic layout is published before scripts without replacing catalog counts or labels', () => {
  const html = execute({html:shell('<section class="hero"><canvas></canvas><div><div><span class="hero-eyebrow"><span class="dot"></span>Eyebrow</span><h1>Heading</h1><p>Copy</p><div class="hero-actions"></div><div class="hero-stats"><div class="stat"><div class="num" data-count="143">143</div><div class="lbl">Products</div></div><div class="stat"><div class="num">24</div><div class="lbl">Years</div></div></div></div></div></section>'),published:document([native('home:hero', {
    'e1.0.4.0':{kind:'text',text:'Stale statistic',styles:{desktop:{width:'160px'}},effects:{desktop:{position:{x:12,y:-8,scale:1}}},overrides:{mobile:{hidden:true}}},
    'e1.0.4.0.0':{kind:'text',text:'999'},
    'e1.0.4.0.1':{kind:'text',text:'Stale label'},
    'e1.0.4.1':{kind:'container',hidden:true}
  })])});
  const main = html.match(/<main[^>]*>(.*?)<\/main>/s)[1];
  const style = html.match(/<style data-cm-initial-css>(.*?)<\/style>/s)[1];
  assert.match(main, /<div class="stat" data-cms-element="e1\.0\.4\.0"><div class="num" data-count="143">143<\/div><div class="lbl">Products<\/div><\/div>/);
  assert.match(main, /<div class="stat" data-cms-element="e1\.0\.4\.1"><div class="num">24<\/div><div class="lbl">Years<\/div><\/div>/);
  assert.doesNotMatch(main, /Stale statistic|Stale label|999|data-cms-element="e1\.0\.4\.0\./);
  assert.ok(style.includes('[data-cms-element="e1.0.4.0"]{width:160px!important;}'));
  assert.ok(style.includes('[data-cms-element="e1.0.4.0"]{translate:12px -8px!important;scale:1!important;}'));
  assert.ok(style.includes('[data-cms-element="e1.0.4.1"]{display:none!important}'));
  assert.match(style, /@media \(max-width:767px\)\{(?:(?!@media)[\s\S])*?\[data-cms-element="e1\.0\.4\.0"\]\{display:none!important\}/);
  assert.doesNotMatch(style, /\[data-cms-element="e1\.0\.4\.0\.[01]"\]/);
});

test('published order and added content are rendered while omitted native sections disappear', () => {
  const html = execute({html:shell('<section id="one">Remove this</section><section id="two"><h2>Second</h2></section>'), published:document([
    {id:'added',type:'text',region:'main',content:{heading:'First published',text:'Current copy'},elements:{}}, native('home:two')
  ])});
  assert.doesNotMatch(html, /Remove this/); assert.ok(html.indexOf('First published') < html.indexOf('Second'));
  assert.match(html, /data-cms-section="added"/);
});

test('live hero products and category identity cannot be overwritten by old CMS snapshots', () => {
  const html = execute({html:shell('<section class="hero"><a class="hero-shot" data-hero-slot="0" data-hero-product="9" href="/product/current"><span class="hero-shot__content"><img src="images/current.png"></span></a></section><section id="shop-categories"><a class="home-category-card" href="/category/sparklers"><h3>Sparklers</h3><span>12 items</span></a></section>'),published:document([
    native('home:hero',{'e0':{kind:'button',text:'Old item',href:'/product/old'},'e0.0.0':{kind:'image',src:'images/old.png'}}),
    native('home:shop-categories',{'e0':{kind:'button',text:'Old count',href:'/old-category'}})
  ])});
  assert.match(html, /src="images\/current.png"/); assert.match(html, /href="\/product\/current"/);
  assert.match(html, /12 items/); assert.match(html, /href="\/category\/sparklers"/);
  assert.doesNotMatch(html.match(/<main[^>]*>(.*?)<\/main>/s)[1], /images\/old|Old item|Old count|\/old-category/);
});

test('published global promo and logo styles arrive in the initial response', () => {
  const html=execute({html:shell('<section class="hero"></section>'),globals:{
    promo:{...native('global:promo',{}, {region:'header'}),content:{promoMessages:[{id:'sale',text:'85% current sale',enabled:true,icon:'auto'}]},overrides:{desktop:{styles:{backgroundColor:'#0011ff'}}}},
    header:native('global:header',{'e0.0':{kind:'image',src:'images/current-logo.png',overrides:{mobile:{styles:{width:'206px'}}}}},{region:'header'})
  }});
  assert.doesNotMatch(html,/OLD SALE/); assert.equal((html.match(/>85% current sale</g)||[]).length,2);
  assert.match(html,/images\/current-logo.png/); assert.match(html,/width:206px!important/);
  assert.match(html,/background-color:#0011ff!important/);
  assert.equal((html.match(/class="promo-bar__message-icon"[^>]*><svg/g)||[]).length,2, 'Native icons occupy their final width before the client wraps the promo rows');
});

test('published bootstrap is inert, safely encoded and original executable scripts stay intact', () => {
  const unsafe='</script><script>alert("x & y")</script>';
  const html=execute({html:shell('<section class="hero"></section>'),published:document([native('home:hero',{}, {name:unsafe})])});
  assert.ok(html.includes('<script>window.literal="<&";</script>'));
  const raw=html.match(/<script id="cm-cms-bootstrap" type="application\/json">(.*?)<\/script>/s)[1];
  assert.doesNotMatch(raw,/[<>&']/); assert.equal(JSON.parse(raw).published.sections[0].name,unsafe);
  assert.match(html,/<script src="\/app.js\?v=current"><\/script>/);
});

test('hero SSR selects all featured records and safely handles 0, 1, 2 and many products', () => {
  const fixture=[{id:1,name:'Unfeatured',featured:false},{id:2,name:'Disabled',featured:true,disabled:true},...Array.from({length:4},(_,i)=>({id:i+10,name:'Featured '+i,shortName:'Featured '+i,featured:true,inStock:false,image:i?'images/product.png':'',price:12345,cats:['sparklers']}))];
  for (const size of [0,1,2,4]) {
    const result=JSON.parse(execute({action:'hero',products:fixture.slice(0,size+2)}));
    assert.deepEqual(result.ids,Array.from({length:size},(_,i)=>i+10));
    assert.equal((result.html.match(/data-hero-slot=/g)||[]).length,3);
    assert.equal((result.html.match(/data-hero-product=/g)||[]).length,Math.min(3,size));
    if (!size) assert.match(result.html,/Discover our crackers/);
    else { assert.match(result.html,/prod-img-fallback/); assert.match(result.html,/₹12,345/); assert.match(result.html,/Sparklers/); }
    if (size>1) assert.match(result.html,/src="images\/product.png"/);
  }
});
