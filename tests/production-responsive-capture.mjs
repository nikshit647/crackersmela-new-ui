import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

const [session,page,widths='320,390,768,1366,1920'] = process.argv.slice(2);
if (!session || !page) throw new Error('Pass an existing agent-browser session and page label.');
const binary=path.join(process.env.APPDATA,'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const dir=path.resolve('audit-evidence/production-responsive');
await mkdir(dir,{recursive:true});
const run=(...args)=>execFileSync(binary,['--session',session,...args],{encoding:'utf8',maxBuffer:4*1024*1024});
const evaluate=code=>JSON.parse(run('eval','-b',Buffer.from(code).toString('base64'),'--json')).data.result;
const measurements=[];
for (const width of widths.split(',').map(Number)) {
  const height=width<768?844:width===768?1024:width===1366?768:1080;
  run('set','viewport',String(width),String(height));
  const measurement=evaluate(`(() => {
    const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'};
    const describe=el=>({tag:el.tagName,id:el.id,class:typeof el.className==='string'?el.className:'',text:(el.innerText||el.getAttribute('aria-label')||'').slice(0,80)});
    const outside=[...document.querySelectorAll('body *')].filter(visible).map(el=>({el,r:el.getBoundingClientRect()})).filter(({r})=>r.left<-1||r.right>innerWidth+1).map(({el,r})=>({...describe(el),left:Math.round(r.left),right:Math.round(r.right),clippedByAncestor:(()=>{let p=el.parentElement;while(p&&p!==document.documentElement){if(['auto','scroll','hidden','clip'].includes(getComputedStyle(p).overflowX))return p.tagName+'.'+p.className;p=p.parentElement;}return null;})()}));
    return {url:location.href,width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,outside:outside.slice(0,60),dialogs:[...document.querySelectorAll('[role=dialog]')].filter(visible).map(el=>{const r=el.getBoundingClientRect();return {...describe(el),x:r.x,y:r.y,width:r.width,height:r.height}}),brokenImages:[...document.images].filter(i=>visible(i)&&i.complete&&i.naturalWidth===0).map(i=>i.getAttribute('src'))};
  })()`);
  measurements.push(measurement);
  run('screenshot',path.join(dir,`${page}-${width}.png`));
  console.log(`${page} ${width}: document ${measurement.documentWidth}, body ${measurement.bodyWidth}, overflow ${measurement.overflow}, broken images ${measurement.brokenImages.length}`);
}
await writeFile(path.join(dir,`${page}.json`),JSON.stringify(measurements,null,2));
await writeFile(path.join(dir,`${page}-errors.txt`),run('errors'));
await writeFile(path.join(dir,`${page}-network.txt`),run('network','requests','--type','xhr,fetch,document'));
