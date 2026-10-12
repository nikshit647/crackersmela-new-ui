"""Exercise the real email PHP API with isolated auth/data; mail is disabled."""
from pathlib import Path
import http.cookiejar, json, os, socket, subprocess, tempfile, time, urllib.request, urllib.error
ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/'audit-evidence/production-release'
PHP=ROOT/'audit-evidence/tools/php-8.3.35/php.exe'
fixture=Path(tempfile.mkdtemp(prefix='email-editor-api-',dir=ROOT/'audit-evidence'))
data=fixture/'data';data.mkdir();sessions=fixture/'sessions';sessions.mkdir()
env=dict(os.environ,CM_DATA_DIR=str(data),CM_STAFF_CONFIG=str(fixture/'staff.php'),CM_DISABLE_MAIL='1',CM_EMAIL_TRANSPORT='fake',EMAIL_ENABLED='false',SMTP_PASSWORD='LOCAL-SECRET-NOT-PUBLIC',EMAIL_FROM_NAME='Preview sender',EMAIL_FROM_ADDRESS='sender@example.test')
password='Local email test only 2026!'
hashed=subprocess.check_output([str(PHP),'-r',"echo password_hash(getenv('CM_TEST_PASS'), PASSWORD_DEFAULT);"],env=dict(env,CM_TEST_PASS=password),text=True)
(fixture/'staff.php').write_text("<?php return ['email'=>'email-test@example.test','hash'=>'"+hashed+"'];")
with socket.socket() as probe: probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
url='http://127.0.0.1:'+str(port)
log=(fixture/'server.log').open('w')
server=subprocess.Popen([str(PHP),'-d','display_errors=0','-d','session.save_path='+str(sessions),'-S','127.0.0.1:'+str(port),'-t',str(RELEASE)],env=env,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
token='';checks=[]
def call(path,body=None,csrf=True,client=opener):
 global token
 headers={'Content-Type':'application/json'}
 if csrf:headers['X-CSRF-Token']=token
 try:r=client.open(urllib.request.Request(url+path,data=None if body is None else json.dumps(body).encode(),headers=headers),timeout=10)
 except urllib.error.HTTPError as error:r=error
 raw=r.read()
 try:payload=json.loads(raw)
 except ValueError:raise AssertionError('Non-JSON API response: '+raw.decode(errors='replace')[:200])
 token=payload.get('csrfToken',token)
 return r.code,payload
def email(action,body=None,**kw):return call('/email-api.php?a='+action,body,**kw)
def check(name,condition):
 checks.append({'name':name,'pass':bool(condition)})
 assert condition,name
try:
 for attempt in range(80):
  try:call('/staff-auth.php?a=session');break
  except OSError:time.sleep(.05)
 code,_=email('templates');check('Anonymous template read rejected',code in [401,403])
 code,_=call('/staff-auth.php?a=login',{'email':'email-test@example.test','password':password});check('Fixture login',code==200)
 code,p= email('templates');check('Eight real defaults returned without saved overrides',code==200 and len(p['effective'])==8 and len(p['builtIn'])==8 and not p['templates'])
 defaults=p['builtIn'];revision=p['revision']
 check('Internal notification excluded','INTERNAL_NEW_ORDER' not in p['effective'])
 check('Actual sender details exposed without transport secrets',p['sender']['email']=='sender@example.test' and p['sender']['name']=='Preview sender' and 'LOCAL-SECRET-NOT-PUBLIC' not in json.dumps(p))
 for event,template in defaults.items():
  check(event+' has all original fields',all(template[k].strip() for k in ['subject','preheader','heading','body','buttonText','buttonUrl']))
  code,preview=email('preview',{'event':event,'template':template})
  check(event+' preview renders saved order structure',code==200 and 'ORDER ITEMS' in preview['html'] and 'DOWNLOAD INVOICE' in preview['html'] and 'CM-20261008-000042' in preview['html'])
  check(event+' preview carries sender and resolved preheader',preview['sender']['email']=='sender@example.test' and '{ORDER_ID}' not in preview['preheader'])
 check('Original received body recovered','We are checking stock and will confirm shortly.' in defaults['ORDER_PLACED']['body'])
 custom=dict(defaults['ORDER_SHIPPED'],subject='Edited {ORDER_ID}',heading='Parcel update',body='Hi {CUSTOMER_NAME}, **packed** for {CITY}.\n\n[Track]({ORDER_URL}) <script>unsafe()</script>')
 code,p=email('preview',{'event':'ORDER_SHIPPED','template':custom});check('Unsaved draft renders safely and interpolates supported fields',code==200 and 'Parcel update' in p['html'] and '<strong>packed</strong>' in p['html'] and '<script>' not in p['html'] and 'Hyderabad' in p['html'])
 code,p=email('templates');check('Preview does not save draft or change revision',not p['templates'] and p['revision']==revision)
 code,_=email('save-template',{'event':'ORDER_SHIPPED','template':custom,'revision':revision},csrf=False);check('Save requires CSRF',code==403)
 for bad in [dict(custom,subject=''),dict(custom,body=''),dict(custom,heading=''),dict(custom,buttonUrl='javascript:alert(1)'),dict(custom,body='Unsupported {NOT_SUPPORTED}'),dict(custom,buttonText='')]:
  code,_=email('save-template',{'event':'ORDER_SHIPPED','template':bad,'revision':revision});check('Invalid or incomplete draft rejected',code==422)
 code,p=email('save-template',{'event':'ORDER_SHIPPED','template':custom,'revision':revision});check('Custom template persists',code==200)
 code,p=email('templates');check('Refresh returns saved overrides/effective wording',p['effective']['ORDER_SHIPPED']['heading']=='Parcel update' and p['templates']['ORDER_SHIPPED']['body']==custom['body'] and p['revision']==revision+1)
 current=p['revision']
 for action in ['save-template','reset-template']:
  code,_=email(action,{'event':'ORDER_SHIPPED','template':defaults['ORDER_SHIPPED'],'revision':revision});check(action+' rejects stale revision',code==409)
 code,p=email('templates');check('Conflict preserves saved customized content',p['effective']['ORDER_SHIPPED']['heading']=='Parcel update' and p['revision']==current)
 code,_=email('reset-template',{'event':'INTERNAL_NEW_ORDER','revision':current});check('Internal reset rejected',code==422)
 code,_=email('reset-template',{'event':'ORDER_SHIPPED','revision':current});check('Confirmed reset removes only override',code==200)
 code,p=email('templates');check('Reset restores original fields while preserving fallback',p['effective']['ORDER_SHIPPED']==defaults['ORDER_SHIPPED'] and 'ORDER_SHIPPED' not in p['templates'])
 for to in ['', 'invalid', 'one@example.test,two@example.test']:
  code,_=email('send-test',{'event':'ORDER_SHIPPED','to':to,'template':custom});check('Explicit single valid test address required',code==422)
 before_orders=(data/'orders.json').read_bytes() if (data/'orders.json').exists() else None
 code,p=email('send-test',{'event':'ORDER_SHIPPED','to':'explicit@example.test','template':custom});check('Disabled sending reported truthfully',code==200 and p['delivery']=='disabled' and 'No email was sent' in p['message'])
 check('Test leaves orders and outbox untouched',not (data/'.mail-outbox.jsonl').exists() and ((data/'orders.json').read_bytes() if (data/'orders.json').exists() else None)==before_orders)
 code,p=email('log');check('Disabled test does not invent a send log',code==200 and p['log']==[])
finally:
 server.terminate();server.wait(timeout=10);log.close()
 report={'checks':checks,'passed':sum(c['pass'] for c in checks),'total':len(checks),'fixture':str(fixture),'mailDisabled':True}
 (ROOT/'audit/email-template-api-results.json').write_text(json.dumps(report,indent=2))
 print(json.dumps({'passed':report['passed'],'total':report['total']}))
