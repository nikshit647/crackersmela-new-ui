import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const task = path.resolve('audit-evidence/product-experience-20261010');
const fixture = JSON.parse(await readFile(path.join(task, 'integration-fixture.json'), 'utf8'));
const base = fixture.publicUrl;
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
assert.equal((await (await fetch(base + '/__fixture-health')).json()).isolated, true);
const binary = path.join(process.env.APPDATA,'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const session = 'seo-navigation-20261010';
const output = path.join(task, 'seo-navigation'); await mkdir(output, {recursive:true});
const run = (...args) => { const result = JSON.parse(execFileSync(binary, ['--session',session,...args,'--json'], {encoding:'utf8',windowsHide:true,maxBuffer:8e6})); assert.equal(result.success,true,result.error); return result.data; };
const evaluate = code => run('eval','-b',Buffer.from(code).toString('base64')).result;
const wait = code => run('wait','--fn',code);
const checks = [];
const check = (name, value) => { checks.push({name,pass:!!value}); assert.ok(value,name); console.log('PASS '+name); };
const snapshot = () => evaluate(`(()=>{const all=s=>[...document.querySelectorAll(s)];return {title:document.title,description:document.querySelector('meta[name=description]')?.content,ogTitle:document.querySelector('meta[property="og:title"]')?.content,twitterTitle:document.querySelector('meta[name="twitter:title"]')?.content,canonical:document.querySelector('link[rel=canonical]')?.href,ogUrl:document.querySelector('meta[property="og:url"]')?.content,robots:document.querySelector('meta[name=robots]')?.content,counts:['title','meta[name=description]','meta[property="og:title"]','meta[name="twitter:title"]','link[rel=canonical]'].map(s=>all(s).length),schemas:all('script[type="application/ld+json"]').map(n=>JSON.parse(n.textContent))};})()`);
const nodes = snapshot => snapshot.schemas.flatMap(s => s['@graph'] || [s]);
try {
  await new Promise((resolve,reject)=>{const child=spawn(binary,['--session',session,'open',base+'/about','--json'],{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='';child.stdout.on('data',chunk=>{out+=chunk;if(out.includes('"success":true'))resolve();});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Browser launch failed')));});
  wait("!!window.CMSeoManager&&!!window.CMCms&&document.querySelector('#view h1')");
  const published = await (await fetch(base+'/seo-api.php?a=published')).json();
  for (const id of ['about','contact','privacy','price-list','home']) {
    evaluate('location.hash='+JSON.stringify(id==='home'?'#/':'#/'+id));
    wait('document.title==='+JSON.stringify(published.pages[id].title));
    const result=snapshot();
    check(id+' uses its published title, description and matching social metadata',result.title===published.pages[id].title&&result.description===published.pages[id].description&&result.ogTitle===published.pages[id].ogTitle&&result.twitterTitle===result.ogTitle);
    check(id+' keeps one canonical and one set of metadata',result.canonical===published.pages[id].canonical&&result.ogUrl===result.canonical&&result.counts.every(n=>n===1));
    check(id+' has a single Organization and WebSite graph',nodes(result).filter(n=>n['@type']==='Organization').length===1&&nodes(result).filter(n=>n['@type']==='WebSite').length===1);
  }
  const category=Object.keys(published.categories)[0];
  evaluate('location.hash='+JSON.stringify('#/products?cat='+category));
  wait('document.title==='+JSON.stringify(published.categories[category].title));
  let result=snapshot();
  check('Category keeps independent SEO and schema when Products layout renders',result.description===published.categories[category].description&&nodes(result).some(n=>n['@type']==='CollectionPage'&&n.url===published.categories[category].canonical));
  evaluate('location.hash='+JSON.stringify('#/products?cat='+category+'&q=spark'));
  wait("document.querySelector('meta[name=robots]')?.content.includes('noindex')");
  check('Filtered search cannot inherit indexable category robots',snapshot().robots.includes('noindex'));
  evaluate("location.hash='#/cart'");wait("!!document.querySelector('#view')&&document.querySelector('meta[property=\"og:url\"]')?.content.endsWith('/cart')");
  result=snapshot();check('Private route keeps noindex and clears product or category schema',result.robots.includes('noindex')&&!nodes(result).some(n=>['Product','CollectionPage'].includes(n['@type'])));
  run('open',base+'/about');wait('document.title==='+JSON.stringify(published.pages.about.title));
  check('Published metadata survives full refresh',snapshot().description===published.pages.about.description);
  run('screenshot',path.join(output,'published-about.png'));
} finally { await writeFile(path.join(output,'results.json'),JSON.stringify({checks,passed:checks.filter(c=>c.pass).length,total:checks.length},null,2));run('close'); }
