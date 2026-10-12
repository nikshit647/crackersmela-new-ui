// Editorial copy is authored in js/page-content.js. This refreshes its derived
// price-list shell and SVG icons from app.js without maintaining a second copy.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
const root=path.resolve(process.argv[2]||'audit-evidence/product-experience-20261010/source');
const appPath=path.join(root,'js/app.js'),resourcePath=path.join(root,'js/page-content.js');
let app=await readFile(appPath,'utf8');
const iconStart=app.indexOf('  const I = {'),iconEnd=app.indexOf('\n  };',iconStart)+5;
const icons=vm.runInNewContext(app.slice(iconStart,iconEnd)+'\nI;',{});
let resource;
try{const source=await readFile(resourcePath,'utf8');resource=JSON.parse(source.slice(source.indexOf('=')+1).trim().replace(/;$/,''));}catch{}
const contentStart=app.indexOf('  const CONTENT = {'),contentEnd=app.indexOf('\n  views.content',contentStart);
const I=new Proxy({},{get:(_,key)=>`{{CM:icon.${String(key)}}}`});
if(contentStart!==-1){
 const STORE={email:'{{CM:store.email}}',hours:'{{CM:store.hours}}',address:{line1:'{{CM:store.address.line1}}',line2:'{{CM:store.address.line2}}'}};
 resource={schemaVersion:1,pages:vm.runInNewContext(app.slice(contentStart,contentEnd)+'\nCONTENT;',{STORE,I})};
 await mkdir('audit-evidence/product-experience-20261010',{recursive:true});
 await writeFile('audit-evidence/product-experience-20261010/editorial-source-before-extraction.txt',app.slice(contentStart,contentEnd));
 const replacement="  const CONTENT = Object.fromEntries(Object.entries(window.CM_PAGE_CONTENT.pages).map(([page, fields]) => [page, Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.replace(/\\{\\{CM:(icon|store)\\.([a-zA-Z0-9.]+)\\}\\}/g, (_, type, name) => type === 'icon' ? I[name] || '' : esc(name.split('.').reduce((value, part) => value?.[part], STORE) || ''))]))]));\n\n";
 app=app.slice(0,contentStart)+replacement+app.slice(contentEnd);await writeFile(appPath,app);
}
if(!resource?.pages)throw Error('Missing canonical editorial resource');
const priceStart=app.indexOf('  views.priceList = () =>'),priceEnd=app.indexOf('\n  const priceListRows',priceStart);
const context={I,CATS:{map:()=>['{{CM:priceCategories}}']},priceListRows:()=>'{{CM:priceRows}}',views:{}};
resource.priceList=vm.runInNewContext(app.slice(priceStart,priceEnd)+'\nviews.priceList();',context);
const needed=[...JSON.stringify(resource).matchAll(/\{\{CM:icon\.([a-zA-Z0-9]+)\}\}/g)].map(m=>m[1]);
resource.icons=Object.fromEntries([...new Set(needed)].map(key=>[key,icons[key]]));
const runtime=await readFile(path.join(root,'js/cms-runtime.js'),'utf8');
const cmsIcons=runtime.match(/const iconPaths = (\{[^\r\n]+\});/);
if(!cmsIcons)throw Error('CMS icon definitions are missing');
resource.cmsIcons=vm.runInNewContext('('+cmsIcons[1]+')',{});
await writeFile(resourcePath,'/* Shared public editorial copy. STORE tokens use current catalog store details. */\nwindow.CM_PAGE_CONTENT = '+JSON.stringify(resource,null,2)+';\n');
console.log(`Shared ${Object.keys(resource.pages).length} editorial pages; derived price-list and ${Object.keys(resource.icons).length} icons.`);
