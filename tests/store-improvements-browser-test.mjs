import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const fixture=JSON.parse(readFileSync('audit-evidence/cms-fixture-active.json','utf8'));
for(const url of [fixture.baseUrl,fixture.publicUrl])assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname));
const health=await(await fetch(fixture.baseUrl+'/__fixture-health')).json();assert.equal(health.isolated,true);assert.equal(health.mail,'disabled');
const binary=path.join(process.env.APPDATA,'npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe');
const php=path.resolve('audit-evidence/tools/php-8.3.35/php.exe');
const session='store-improvements-'+Date.now(),suffix=Date.now().toString();
const categoryId='browser-qa-'+suffix,categoryName='Browser QA '+suffix;
const order={id:crypto.randomBytes(16).toString('hex'),code:'CM-QA-'+suffix,placedAt:new Date().toISOString(),status:'shipped',payment:'COD',
 customer:{name:'Local Browser Test',phone:'9000000042',email:'browser-qa@example.test'},
 shipping:{address:'42 Test Street',area:'Local fixture',city:'Hyderabad',pincode:'500001'},
 billing:{name:'Local Browser Test',phone:'9000000042',address:'42 Test Street',area:'Local fixture',city:'Hyderabad',state:'Telangana',pincode:'500001'},
 items:[{id:124,name:'Local QA stored product',qty:2,price:1500,compareAt:1500}],
 totals:{subtotal:3000,delivery:0,couponAmt:0,festiveAmt:0,total:3000},
 log:[{status:'placed',at:new Date().toISOString()},{status:'shipped',at:new Date().toISOString()}]};
const output=path.resolve('audit-evidence/store-improvements-browser');mkdirSync(output,{recursive:true});
const checks=[];let failure='';
const run=(...args)=>{const response=JSON.parse(execFileSync(binary,['--session',session,...args,'--json'],{encoding:'utf8',windowsHide:true,timeout:45000,maxBuffer:3e6}));assert.ok(response.success,response.error);return response.data;};
const evaluate=code=>run('eval','-b',Buffer.from(code).toString('base64')).result;
const wait=code=>run('wait','--fn',code);
const activate=selector=>{run('focus',selector);run('press','Enter');};
const check=(name,condition)=>{checks.push({name,pass:!!condition});assert.ok(condition,name);console.log('PASS: '+name);};
const fixtureChange=cleanup=>JSON.parse(execFileSync(php,['-n','-r',`
 require getenv('QA_COMMERCE');
 $record=json_decode(getenv('QA_ORDER'),true);$category=getenv('QA_CATEGORY');$lock=cmLock('commerce');
 $file=cmDataDir().'/orders.json';$store=cmReadJson($file,['orders'=>[]]);$wrapped=isset($store['orders']);$orders=$wrapped?$store['orders']:$store;
 $orders=array_values(array_filter($orders,fn($o)=>($o['id']??'')!==$record['id']));
 if(getenv('QA_CLEANUP')!=='1')$orders[]=$record;
 if($wrapped)$store['orders']=$orders;else $store=$orders;
 cmWriteJson($file,$store);
 if(getenv('QA_CLEANUP')==='1'){$file=cmDataDir().'/categories.json';if(is_file($file)){$store=cmReadJson($file,['categories'=>[]]);$store['categories']=array_values(array_filter($store['categories'],fn($c)=>($c['id']??'')!==$category));cmWriteJson($file,$store);}}
 cmUnlock($lock);echo json_encode(['cleaned'=>getenv('QA_CLEANUP')==='1']);
`],{encoding:'utf8',windowsHide:true,env:{...process.env,CM_DATA_DIR:path.join(fixture.fixture,'data'),CM_DISABLE_MAIL:'1',EMAIL_ENABLED:'false',CM_EMAIL_TRANSPORT:'fake',QA_COMMERCE:path.resolve('audit-evidence/production-release/cm-commerce.php'),QA_ORDER:JSON.stringify(order),QA_CATEGORY:categoryId,QA_CLEANUP:cleanup?'1':'0'}}));

try{
 fixtureChange(false);
 await new Promise((resolve,reject)=>{const child=spawn(binary,['--session',session,'open','about:blank'],{stdio:'ignore',windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Browser launch failed')));});
 run('set','viewport','1440','1000');
 if(process.env.CM_TRACKING_ONLY!=='1') {
 if(process.env.CM_STAFF_BROWSER_SESSION){
  const source=JSON.parse(execFileSync(binary,['--session',process.env.CM_STAFF_BROWSER_SESSION,'cookies','get','--json'],{encoding:'utf8',windowsHide:true}));
  const cookie=source.data?.cookies?.find(c=>c.domain==='127.0.0.1'&&c.name==='cm_staff');assert.ok(cookie,'Existing synthetic staff session available');
  run('cookies','set',cookie.name,cookie.value,'--url',fixture.baseUrl,'--httpOnly','--sameSite','Lax');
 }
 run('open',fixture.baseUrl+'/?watch=0#/staff');run('wait','--load','networkidle');
 if(!process.env.CM_STAFF_BROWSER_SESSION){
  run('wait','--text','Sign in as staff');run('click','#goAuthStaff');wait("document.querySelector('#authModal').getAnimations({subtree:true}).every(a=>a.playState==='finished')");
  run('fill','#auEmail',fixture.email);run('fill','#auPass',fixture.password);activate('#auSubmit');
 }
 run('wait','--text','Dashboard');
 activate('[data-panel="categories"]');run('wait','[data-add-category]');activate('[data-add-category]');run('wait','#categoryForm');
 run('fill','#categoryName',categoryName);
 check('Category name generates a usable slug',evaluate('document.querySelector("#categorySlug").value')===categoryId);
 run('fill','#categoryDescription','Created only by local browser regression testing.');
 run('screenshot',path.join(output,'category-create-desktop.png'));activate('#categorySave');wait('!document.querySelector("#categoryForm")');
 check('Created category appears in category list',evaluate(`document.querySelector('#staffPanel').innerText.includes(${JSON.stringify(categoryName)})`));
 run('reload');run('wait','--load','networkidle');activate('[data-panel="categories"]');run('wait','[data-add-category]');
 check('Category survives page refresh',evaluate(`document.querySelector('#staffPanel').innerText.includes(${JSON.stringify(categoryName)})`));
 activate('[data-add-category]');run('fill','#categoryName',categoryName);activate('#categorySave');wait('document.querySelector("#categoryError").textContent.length>0');
 check('Duplicate category rejected without losing form',evaluate('!!document.querySelector("#categoryForm")&&!document.querySelector("#categorySave").disabled&&document.querySelector("#categoryError").textContent.includes("already exists")'));
 run('press','Escape');run('dialog','accept');wait('!document.querySelector("#categoryForm")');
 activate('[data-panel="add-product"]');run('wait','#apCat');
 check('New category is available for product assignment',evaluate(`!!document.querySelector('#apCat option[value="${categoryId}"]')`));
 run('open',fixture.publicUrl+'/?watch=0#/products');run('wait','--load','networkidle');wait(`!!document.querySelector('#navCatMenu [data-cat-id="${categoryId}"]')`);
 check('Shared public navigation and filters include category',evaluate(`!!document.querySelector('#navCatMenu [data-cat-id="${categoryId}"]')&&!!document.querySelector('[data-fcat][value="${categoryId}"]')`));
 run('open',fixture.publicUrl+'/category/'+categoryId+'?watch=0');run('wait','--load','networkidle');
 check('Direct category URL loads its heading',evaluate(`document.querySelector('h1')?.textContent.includes(${JSON.stringify(categoryName)})`));
 }
 const trackUrl=fixture.publicUrl+'/?watch=0#/track?id='+order.code+'&invoice=1';
 run('open',trackUrl);run('wait','#trackForm');run('wait','--load','networkidle');
 check('Tracking code prefills and no initial lookup occurs',evaluate(`document.querySelector('#trackCode').value===${JSON.stringify(order.code)}&&!performance.getEntriesByType('resource').some(e=>e.name.includes('orders-api.php')&&new URL(e.name).searchParams.get('a')!=='pull')`));
 check('Initial tracking shows mobile prompt without false error',evaluate(`document.querySelector('#trackResult').textContent.includes('Enter your mobile number to continue')&&!document.querySelector('#view').textContent.includes('Order not found')`));
 evaluate("window.__lookupCount=0;const qaFetch=window.fetch;window.fetch=(...args)=>{if(String(args[0]).includes('orders-api.php')&&String(args[1]?.body||'').includes('lookup'))window.__lookupCount++;return qaFetch(...args);};");
 const invoicePath='/customer-invoice-api.php?a=invoice&code='+order.code;
 check('Invoice denied before mobile verification',await evaluate(`(async()=>{const r=await fetch(${JSON.stringify(invoicePath)});return r.status===403;})()`));
 activate('#trackForm button');
 check('Empty mobile validation makes no lookup',evaluate('window.__lookupCount===0&&document.querySelector("#trackMessage").textContent.includes("Enter your registered mobile number")'));
 run('fill','#trackPhone','123');activate('#trackForm button');
 check('Malformed mobile validates before request',evaluate('window.__lookupCount===0&&document.querySelector("#trackMessage").textContent.includes("valid 10-digit")'));
 run('fill','#trackPhone','9000000099');activate('#trackForm button');wait('document.querySelector("#trackMessage").textContent.includes("matching those details")');
 check('Wrong mobile shows neutral failure without details',evaluate('window.__lookupCount===1&&!document.querySelector("#trackResult").textContent.trim()&&!document.querySelector("#trackForm button").disabled'));
 check('Invoice remains denied after wrong mobile',await evaluate(`(async()=>{const r=await fetch(${JSON.stringify(invoicePath)});return r.status===403;})()`));
 run('fill','#trackPhone',order.customer.phone);activate('#trackForm button');wait('!!document.querySelector("#trackResult .order-code")');
 check('Verified order returns its real status and total',evaluate(`document.querySelector('#trackResult .order-code').textContent===${JSON.stringify(order.code)}&&document.querySelector('#trackResult').textContent.includes('Shipped')&&document.querySelector('#trackResult').textContent.includes('3,000')`));
 const invoice=evaluate('document.querySelector("#trackResult a[href*=customer-invoice]").getAttribute("href")');
 const pdf=await evaluate(`(async()=>{const r=await fetch(${JSON.stringify(invoice)});const bytes=await r.arrayBuffer();return {status:r.status,type:r.headers.get('content-type'),head:new TextDecoder().decode(bytes.slice(0,4)),size:bytes.byteLength};})()`);
 if(pdf.status!==200)console.error('Invoice response:',JSON.stringify(pdf));
 check('Verified invoice returns a real PDF',pdf.status===200&&pdf.type.includes('application/pdf')&&pdf.head==='%PDF'&&pdf.size>1000);
 for(const [width,height] of [[1440,1000],[390,844]]){run('set','viewport',String(width),String(height));check('Tracking layout fits '+width+'px',evaluate('document.documentElement.scrollWidth<=innerWidth+1'));run('screenshot',path.join(output,'tracking-'+width+'.png'));}
 run('reload');run('wait','#trackForm');run('wait','--load','networkidle');
 check('Refresh preserves code and returns safe empty state',evaluate(`document.querySelector('#trackCode').value===${JSON.stringify(order.code)}&&document.querySelector('#trackPhone').value===''&&document.querySelector('#trackResult').textContent.includes('Enter your mobile number')`));
 check('No uncaught browser exceptions',(run('errors').errors||[]).length===0);
}catch(error){failure=error.stack||error.message;console.error(error.message);try{run('screenshot',path.join(output,'failure.png'));}catch{}process.exitCode=1;}
finally{
 try{check('Only owned category/order records cleaned up',fixtureChange(true).cleaned);}catch(error){failure+='\nCleanup: '+error.message;process.exitCode=1;}
 writeFileSync('audit/store-improvements-browser-results.json',JSON.stringify({status:failure?'FAIL':'PASS',checks,failure,scope:'Local fixture, native Chromium UI, synthetic order and category; no external email',output},null,2));
 try{run('close');}catch{}
}
console.log(JSON.stringify({passed:checks.filter(c=>c.pass).length,total:checks.length}));
