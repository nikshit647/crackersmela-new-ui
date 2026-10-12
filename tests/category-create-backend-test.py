"""Real PHP category persistence against an isolated local data directory."""
from pathlib import Path
import http.cookiejar,json,os,socket,subprocess,tempfile,time,urllib.request,urllib.error
ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/'audit-evidence/production-release'
PHP=ROOT/'audit-evidence/tools/php-8.3.35/php.exe'
fixture=Path(tempfile.mkdtemp(prefix='category-create-',dir=ROOT/'audit-evidence'))
data=fixture/'data';data.mkdir();sessions=fixture/'sessions';sessions.mkdir()
env=dict(os.environ,CM_DATA_DIR=str(data),CM_STAFF_CONFIG=str(fixture/'staff.php'),CM_DISABLE_MAIL='1',CM_EMAIL_TRANSPORT='fake',EMAIL_ENABLED='false')
password='Local category test only 2026!'
hashed=subprocess.check_output([str(PHP),'-r',"echo password_hash(getenv('CM_TEST_PASS'), PASSWORD_DEFAULT);"],env=dict(env,CM_TEST_PASS=password),text=True)
(fixture/'staff.php').write_text("<?php return ['email'=>'category-test@example.test','hash'=>'"+hashed+"'];")
with socket.socket() as probe:
 probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
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
 except urllib.error.HTTPError as e:r=e
 try:payload=json.loads(r.read())
 except ValueError:payload={}
 token=payload.get('csrfToken',token)
 return r.code,payload
def check(name,condition):
 checks.append({'name':name,'pass':bool(condition)})
 assert condition,name
try:
 for attempt in range(80):
  try:call('/staff-auth.php?a=session');break
  except OSError:time.sleep(.05)
 code,_=call('/categories-api.php',{'a':'create','name':'Category QA','slug':'category-qa','blurb':'Created in a local test'})
 check('Anonymous category creation rejected',code in [401,403])
 code,_=call('/staff-auth.php?a=login',{'email':'category-test@example.test','password':password});check('Fixture login',code==200)
 code,_=call('/categories-api.php',{'a':'create','name':'Category QA','slug':'category-qa'},csrf=False);check('CSRF required',code==403)
 code,p=call('/categories-api.php',{'a':'create','name':'Category QA','slug':'category-qa','blurb':'Local category description'})
 check('Category created through PHP',code==201 and p.get('category',{}).get('id')=='category-qa')
 check('Persisted in existing data directory',(data/'categories.json').is_file())
 code,p=call('/products-api.php?a=pull');check('New category is in public product feed',any(c['id']=='category-qa' for c in p.get('categories',[])))
 for fields in [{'name':'Another','slug':'category-qa'},{'name':'CATEGORY QA','slug':'other-qa'},{'name':'New name','slug':'sparklers'},{'name':'','slug':'empty'},{'name':'Bad slug','slug':'../bad'}]:
  code,_=call('/categories-api.php',dict(a='create',**fields));check('Invalid or duplicate category rejected '+str(fields),code in [409,422])
 code,p=call('/categories-api.php?a=pull');check('Refresh returns saved category',any(c['id']=='category-qa' for c in p.get('categories',[])))
 code,p=call('/products-api.php',{'a':'push','extraProducts':[{'id':99001,'name':'Category assignment QA','price':100,'stock':10,'cats':['category-qa'],'primary':'category-qa'}],'rev':0})
 check('Created category accepted for product assignment',code==200)
finally:
 server.terminate();server.wait(timeout=10);log.close()
 report={'checks':checks,'passed':sum(c['pass'] for c in checks),'total':len(checks),'fixture':str(fixture),'mailDisabled':True}
 (ROOT/'audit/category-create-results.json').write_text(json.dumps(report,indent=2))
 print(json.dumps({'passed':report['passed'],'total':report['total']}))
