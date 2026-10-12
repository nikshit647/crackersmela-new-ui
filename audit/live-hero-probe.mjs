import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';

const binary = path.join(process.env.APPDATA, 'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const session = 'live-hero-probe';
const raw = (...a) => execFileSync(binary, ['--session', session, ...a, '--json'], { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 120000 });
const run = (...a) => { const v = JSON.parse(raw(...a)); assert.equal(v.success, true, v.error || a[0]); return v.data; };
const ev = c => run('eval', '-b', Buffer.from(c).toString('base64')).result;
const wait = c => run('wait', '--fn', c);

await new Promise((res, rej) => {
  const ch = spawn(binary, ['--session', session, 'open', 'https://crackersmela.com/', '--json'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; ch.stdout.on('data', c => { out += c; if (out.includes('"success":true')) res(); });
  ch.once('error', rej); ch.once('exit', c => c === 0 ? res() : rej(new Error('launch')));
});
run('set', 'viewport', '1440', '900');
wait("document.readyState==='complete'");
await new Promise(r => setTimeout(r, 3000));

const probe = `(()=>{
  const h1=document.querySelector('#view h1');
  if(!h1) return 'no h1';
  const parts=[];
  h1.childNodes.forEach(n=>{
    const txt=(n.textContent||'').replace(/\\s+/g,' ').trim();
    const el=n.nodeType===3?n.parentElement:n;
    const cs=getComputedStyle(el);
    parts.push({node:n.nodeType===3?'text':n.nodeName, text:txt.slice(0,40), display:cs.display, opacity:cs.opacity, vis:cs.visibility, rect:Math.round(el.getBoundingClientRect().height), cmsEl:n.dataset? (n.dataset.cmsElement||(el.dataset&&el.dataset.cmsElement)||'') : ''});
  });
  return JSON.stringify({h1Text:(h1.textContent||'').replace(/\\s+/g,' ').trim(), h1Rect:Math.round(h1.getBoundingClientRect().height), parts},null,1);
})()`;
console.log(ev(probe));

console.log('\n--- does the CMS runtime have the document applied? ---');
console.log(ev(`JSON.stringify({sections:(window.CMCms?.document?.()?.sections||[]).length, heroHidden:(()=>{const s=(window.CMCms?.document?.()?.sections||[]).find(x=>x.id==='home:hero');const e=s&&s.elements&&s.elements['e1.0.1.0'];return e?{hidden:!!e.hidden,text:e.text}:'element missing';})()})`));

console.log('\n--- inline <style> rules mentioning e1.0.1.0 ---');
console.log(ev(`(()=>{const out=[];document.querySelectorAll('style').forEach(s=>{(s.textContent||'').split('}').forEach(r=>{if(r.includes('e1.0.1.0'))out.push(r.slice(0,240)+'}');});});return out.length?JSON.stringify(out,null,1):'(none)';})()`));

run('close');