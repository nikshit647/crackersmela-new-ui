import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const output=path.resolve('audit-evidence/customer-email-items');
const binary=path.join(process.env.APPDATA,'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const session='customer-email-visual-01a11104';
const checks=[];
const run=(...args)=>{const r=JSON.parse(execFileSync(binary,['--session',session,...args,'--json'],{encoding:'utf8',windowsHide:true,timeout:45000,maxBuffer:4*1024*1024}));assert.ok(r.success,r.error);return r.data;};
const evaluate=code=>run('eval','-b',Buffer.from(code).toString('base64')).result;
let failure;
try {
  await new Promise((resolve,reject)=>{const child=spawn(binary,['--session',session,'open',pathToFileURL(path.join(output,'placed.html')).href],{stdio:'ignore',windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Browser launch failed')));});
  for(const [file,width,rows,total] of [['placed',740,7,'₹2,275.00'],['placed',360,7,'₹2,275.00'],['placed',390,7,'₹2,275.00'],['single-item',360,1,'₹319.77'],['cancelled',360,7,'₹2,275.00'],['long-name',360,7,'₹2,275.00'],['long-name',740,7,'₹2,275.00']]) {
    run('open',pathToFileURL(path.join(output,file+'.html')).href);run('set','viewport',String(width),'1000');
    run('wait','--fn','[...document.images].every(i=>i.complete&&i.naturalWidth>0)');
    const result=evaluate(`(()=>{const money=[...document.querySelectorAll('.cm-item-money')],buttons=[...document.querySelectorAll('.cm-btn')].map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,href:e.getAttribute('href')};});return {width:innerWidth,pageWidth:document.documentElement.scrollWidth,rows:document.querySelectorAll('.cm-order-items tbody tr').length,money:money.map(e=>{const r=document.createRange();r.selectNodeContents(e);const rects=[...r.getClientRects()],s=getComputedStyle(e);return {text:e.textContent,lines:rects.length,fits:rects.every(r=>r.width<=e.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)+1)};}),total:[...document.querySelectorAll('td')].find(e=>e.textContent==='ORDER TOTAL')?.nextElementSibling?.textContent,buttons};})()`);
    assert.ok(result.pageWidth<=width+1,file+' horizontal page overflow');
    assert.equal(result.rows,rows,file+' line count');assert.equal(result.total,total,file+' stored total');
    assert.ok(result.money.every(x=>x.lines===1&&x.fits),file+' amount wraps or overflows: '+JSON.stringify(result.money));
    assert.ok(result.buttons.length===2&&result.buttons.every(b=>b.left>=0&&b.right<=width+1),'Both actions fit');
    assert.ok(result.buttons[0].href==='https://crackersmela.com/track/CM-TEST-7ITEMS'&&result.buttons[1].href==='https://crackersmela.com/track/CM-TEST-7ITEMS?invoice=1','Tracking/invoice destinations unchanged');
    if(width<480)assert.ok(result.buttons[1].top>=result.buttons[0].bottom,'Mobile actions stack without overlap');
    const screenshot=path.join(output,file+'-'+(width<480?'mobile':'desktop')+'-'+width+'.png');run('screenshot','--full',screenshot);
    checks.push({name:file+' at '+width+'px',status:'PASS',...result,screenshot});console.log('PASS: '+file+' at '+width+'px');
  }
  const errors=run('errors').errors||[];assert.equal(errors.length,0,'Uncaught browser exceptions');
}catch(error){failure=error.stack;throw error;}
finally {
  await writeFile('audit/customer-email-browser-results.json',JSON.stringify({status:failure?'FAIL':'PASS',checks,failure,scope:'Rendered local HTML in Chromium. Real Gmail, Outlook and Apple Mail delivery was not attempted; layout uses tables and inline styles. No SMTP.'},null,2));
  try{run('close');}catch{}
}
