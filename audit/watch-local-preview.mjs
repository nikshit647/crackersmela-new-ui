import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=process.cwd();
const fixture=JSON.parse(fs.readFileSync(path.join(root,'audit-evidence/cms-fixture-active.json'),'utf8'));
const destination=path.resolve(fixture.documentRoot);
if(!destination.startsWith(path.join(root,'audit-evidence','cms-fixture-'))||!fixture.publicUrl.startsWith('http://localhost:'))throw new Error('Only an isolated local fixture can be watched.');
const candidate=path.join(root,'audit-evidence/production-release');
const overlay=path.join(root,'visual-editor');
const hashes=new Map();
let sourceVersion=Date.now().toString();
const reloadTag='<script src="/__dev-reload.js"></script>';
const client=`(()=>{if(window.top!==window.self)return;const preference=new URLSearchParams(location.search).get('watch');if(preference==='1')sessionStorage.setItem('cm.dev.watch','1');if(preference==='0')sessionStorage.removeItem('cm.dev.watch');if(sessionStorage.getItem('cm.dev.watch')!=='1')return;const editor=/\\/visual-editor(?:\\.php)?$/.test(location.pathname);let version=null;const tick=async()=>{try{const r=await fetch('/__dev-version.json',{cache:'no-store'});if(!r.ok)return;const data=await r.json(),next=editor?data.sourceVersion:data.version;if(version&&next!==version){location.reload();return;}version=next;}catch{}};tick();setInterval(tick,1000);})();`;
fs.writeFileSync(path.join(destination,'__dev-reload.js'),client);
function files(dir,prefix=''){
  const result=[];
  for(const item of fs.readdirSync(dir,{withFileTypes:true})){
    const rel=path.join(prefix,item.name);
    if(item.isDirectory()&&(prefix||['js','css'].includes(item.name)))result.push(...files(path.join(dir,item.name),rel));
    else if(item.isFile()&&(/\.(?:php|html|js|css|json|svg|txt)$/i.test(item.name)||item.name==='.htaccess'))result.push(rel);
  }
  return result;
}
function sync(){
  const sources=new Map();
  for(const rel of files(candidate))sources.set(rel,path.join(candidate,rel));
  const categoryArt=path.join(candidate,'images','categories');
  if(fs.existsSync(categoryArt))for(const rel of files(categoryArt))sources.set(path.join('images','categories',rel),path.join(categoryArt,rel));
  for(const rel of files(overlay))if(/\.(?:php|html|js|css)$/i.test(rel))sources.set(rel,path.join(overlay,rel));
  let changed=false;
  for(const [rel,source] of sources){
    let bytes=fs.readFileSync(source);
    const watchedShell=rel==='index.html'||rel==='editor-shell.html';
    if(watchedShell)bytes=Buffer.from(bytes.toString('utf8').replace('</body>',reloadTag+'</body>'));
    const hash=crypto.createHash('sha256').update(bytes).digest('hex');
    const target=path.join(destination,rel);
    // A test fixture refresh may replace index.html; reattach local-only refresh.
    const needsReloadTag=watchedShell&&fs.existsSync(target)&&!fs.readFileSync(target,'utf8').includes(reloadTag);
    if(hashes.get(rel)!==hash||needsReloadTag){fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);hashes.set(rel,hash);changed=true;}
  }
  const dataDir=path.join(path.dirname(destination),'data');
  const cmsDir=path.join(dataDir,'cms-pages');
  const cmsFiles=fs.existsSync(cmsDir)?fs.readdirSync(cmsDir).filter(n=>n.endsWith('.json')).map(n=>path.join(cmsDir,n)):[];
  const publicDataFiles=['products.json','catalog.json'].map(n=>path.join(dataDir,n)).filter(n=>fs.existsSync(n));
  const cmsVersion=[...cmsFiles,...publicDataFiles].map(n=>n+':'+fs.statSync(n).mtimeMs).join('|');
  const contentChanged=hashes.get('cmsData')!==cmsVersion;
  if(contentChanged)hashes.set('cmsData',cmsVersion);
  if(changed||contentChanged){const version=Date.now().toString();if(changed)sourceVersion=version;fs.writeFileSync(path.join(destination,'__dev-version.json'),JSON.stringify({version,sourceVersion}));console.log(new Date().toISOString()+' Local preview updated');}
}
sync();
setInterval(()=>{try{sync();}catch(error){console.error('Preview sync: '+error.message);}},750);
console.log('Watching '+fixture.publicUrl+' with isolated data. No production files are changed by this watcher.');
