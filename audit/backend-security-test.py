from pathlib import Path
import os, json, time, urllib.request, urllib.error, http.cookiejar, subprocess, tempfile, socket, base64, sys
ROOT=Path(__file__).resolve().parents[1]
PHP=ROOT/'audit-evidence/tools/php-8.3.35/php.exe'
RELEASE=ROOT/'audit-evidence/production-release'
FIXTURE=Path(tempfile.mkdtemp(prefix='php-security-',dir=ROOT/'audit-evidence'))
DATA=FIXTURE/'data'; UPLOAD=FIXTURE/'uploads'; SESSIONS=FIXTURE/'sessions'; DATA.mkdir(); UPLOAD.mkdir(); SESSIONS.mkdir()
staff_email='fixture-admin@example.invalid'
staff_password='Synthetic-test-only-24!'
env=os.environ.copy()
env.update(CM_DATA_DIR=str(DATA),CM_UPLOAD_DIR=str(UPLOAD),CM_STAFF_CONFIG=str(FIXTURE/'staff-config.php'),CM_DISABLE_MAIL='1',CM_TEST_PASSWORD=staff_password)
password_hash=subprocess.check_output([str(PHP),'-r',"echo password_hash(getenv('CM_TEST_PASSWORD'), PASSWORD_DEFAULT);"],env=env,text=True).strip()
(FIXTURE/'staff-config.php').write_text("<?php return "+ "['email'=>'"+staff_email+"','hash'=>'"+password_hash+"'];",encoding='utf-8')
product={'id':9876543210,'name':'Fixture product','shortName':'Fixture product','price':1000,'compareAt':1500,'sku':'FIXTURE-ONLY','cats':['sparklers'],'primary':'sparklers','stock':10,'inStock':True,'featured':False,'image':'images/products/p26.webp'}
(DATA/'products.json').write_text(json.dumps({'extraProducts':[product],'productOverrides':{},'settings':{'maintenance':False,'coupon':{'code':'SAVE50','discount':50}},'rev':0}),encoding='utf-8')
(DATA/'catalog.json').write_text(json.dumps({'priceOverrides':{},'stockOverrides':{},'featOn':{}}),encoding='utf-8')
(BASE_URL,PORT)=('http://127.0.0.1:4181',4181)
results=[]
class Client:
 def __init__(self):
  self.jar=http.cookiejar.CookieJar()
  self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
  self.csrf=None
 def call(self,path,body=None,csrf=True,origin=None,raw=None,content_type=None,method=None):
  headers={'Accept':'application/json'}
  if body is not None:
   data=json.dumps(body).encode(); headers['Content-Type']='application/json'
  else: data=raw
  if content_type: headers['Content-Type']=content_type
  if csrf and self.csrf: headers['X-CSRF-Token']=self.csrf
  if origin is not None: headers['Origin']=origin
  request=urllib.request.Request(BASE_URL+path,data=data,headers=headers,method=method or ('POST' if data is not None else 'GET'))
  try:
   with self.opener.open(request,timeout=15) as response: status=response.status; payload=response.read(); response_headers=dict(response.headers)
  except urllib.error.HTTPError as response: status=response.code; payload=response.read(); response_headers=dict(response.headers)
  try: value=json.loads(payload)
  except Exception: value={'non_json':True}
  return status,value,response_headers
 def session(self):
  status,value,headers=self.call('/staff-auth.php?a=session')
  assert status==200 and value.get('csrfToken'),('session',status,value)
  self.csrf=value['csrfToken']; return value,headers
def check(name,condition,details=None):
 results.append({'name':name,'pass':bool(condition)})
 if not condition: raise AssertionError(name + (': '+str(details) if details else ''))
log=(FIXTURE/'php-server.log').open('w',encoding='utf-8')
server=subprocess.Popen([str(PHP),'-d','display_errors=0','-d','log_errors=1','-d','session.save_path='+str(SESSIONS),'-d','extension_dir='+str(PHP.parent/'ext'),'-d','extension=fileinfo','-d','extension=gd','-S','127.0.0.1:4181','-t',str(RELEASE)],cwd=RELEASE,env=env,stdout=log,stderr=log)
try:
 for attempt in range(100):
  try:
   with socket.create_connection(('127.0.0.1',PORT),timeout=.1): break
  except OSError:
   if server.poll() is not None: raise RuntimeError('Isolated PHP server failed to start')
   time.sleep(.05)
 A=Client(); B=Client(); S=Client()
 session,headers=A.session(); B.session(); S.session()
 cookie=headers.get('Set-Cookie','')
 check('host-only HttpOnly SameSite session cookie', 'HttpOnly' in cookie and 'SameSite=Strict' in cookie and 'domain=' not in cookie.lower())
 check('anonymous session is not staff', session['authenticated'] is False)
 status,data,_=A.call('/orders-api.php?a=pull'); check('anonymous order collection empty',status==200 and data['orders']==[])
 for path,body in [
  ('/products-api.php',{'a':'push','key':'public-key-ignored','rev':0}),
  ('/catalog-api.php',{'a':'push','key':'public-key-ignored','priceOverrides':{str(product['id']):1}}),
  ('/orders-api.php',{'a':'update','id':'fixture-id','status':'delivered','key':'public-key-ignored'}),
  ('/orders-api.php',{'a':'push','order':{},'key':'public-key-ignored'}),
 ]:
  status,_,_=A.call(path,body); check('anonymous privileged action denied '+path+':'+body['a'],status==401,status)
 status,_,_=A.call('/analytics-api.php?a=report'); check('anonymous analytics report denied',status==401,status)
 for path in ['/upload-api.php','/api/upload.php']:
  status,_,_=A.call(path,raw=b'',method='POST'); check('anonymous upload denied '+path,status==401,status)
 status,_,_=S.call('/staff-auth.php?a=login',{'email':staff_email,'password':staff_password},csrf=False); check('login without CSRF denied',status==403,status)
 status,_,_=S.call('/staff-auth.php?a=login',{'email':staff_email,'password':staff_password},origin='https://example.invalid'); check('cross-origin login denied',status==403,status)
 status,_,_=S.call('/staff-auth.php?a=login',{'email':staff_email,'password':'incorrect-local-value'}); check('wrong staff password denied',status==401,status)
 status,data,_=S.call('/staff-auth.php?a=login',{'email':staff_email,'password':staff_password},origin=BASE_URL); check('valid staff login uses server session',status==200 and data['authenticated'] is True,(status,data))
 S.csrf=data['csrfToken']
 status,_,_=S.call('/catalog-api.php',{'a':'push','priceOverrides':{}},csrf=False); check('staff mutation without CSRF denied',status==403,status)
 status,data,_=S.call('/analytics-api.php?a=report'); check('staff analytics report allowed',status==200 and data.get('ok') is True,(status,data))
 order={'id':'client-controlled-id','code':'CLIENT-CODE','status':'delivered','placedAt':'1999-01-01T00:00:00Z','log':[{'status':'delivered','at':'1999'}],'items':[{'id':product['id'],'qty':3,'price':1,'name':'Client value ignored'}],'totals':{'subtotal':3,'total':1,'couponCode':'SAVE50','couponAmt':99999},'customer':{'name':'Local test customer','phone':'9999999999','email':'fixture-customer@example.invalid'},'shipping':{'address':'Local fixture address only','area':'Test area','city':'Fixture city','pincode':'500001'},'payment':'COD','customerUserId':'forged-user'}
 request={'a':'create','requestId':'defensive-create-001','order':order}
 status,_,_=A.call('/orders-api.php',request,csrf=False); check('public order without CSRF denied',status==403,status)
 status,created,_=A.call('/orders-api.php',request,origin=BASE_URL)
 check('canonical order creation succeeds',status==201 and created.get('ok') is True,(status,created))
 saved=created['order']
 check('client prices and discounts replaced by server values',saved['totals']['total']==2950 and saved['items'][0]['price']==1000,saved['totals'])
 check('server owns order identity timestamp status and log',saved['id']!='client-controlled-id' and saved['code']!='CLIENT-CODE' and saved['status']=='placed' and len(saved['log'])==1 and saved['placedAt']!='1999-01-01T00:00:00Z')
 check('internal ownership and request hashes omitted',not any(k in saved for k in ['customerUserId','_requestHash','_requestFingerprint']))
 status,data,_=A.call('/orders-api.php',request); check('identical retry returns same saved order',status==200 and data.get('replayed') is True and data['order']['id']==saved['id'],(status,data))
 changed=json.loads(json.dumps(request)); changed['order']['payment']='UPI'
 status,_,_=A.call('/orders-api.php',changed); check('changed retry cannot overwrite prior order',status==409,status)
 status,data,_=A.call('/orders-api.php?a=pull'); check('creating browser sees its own order',status==200 and len(data['orders'])==1)
 status,data,_=B.call('/orders-api.php?a=pull'); check('different browser cannot list that order',status==200 and data['orders']==[])
 status,_,_=B.call('/orders-api.php',{'a':'lookup','code':saved['code'],'phone':'9999999998'}); check('lookup requires correct phone',status==404,status)
 status,data,_=B.call('/orders-api.php',{'a':'lookup','code':saved['code'],'phone':order['customer']['phone']}); check('code plus phone grants one-order browser access',status==200 and data['order']['code']==saved['code'])
 # The customer tracking lookup returns a minimal projection. Internal identity,
 # items, prices and notification state must never appear there.
 for field in ('id','items','totals','shipping','customer','_emailEvents','_requestHash','customerUserId'):
  check('tracking projection omits '+field,field not in data['order'],sorted(data['order'].keys()))
 check('tracking projection carries the derived quantity',isinstance(data['order'].get('quantity'),int))
 check('tracking projection carries a status timeline',isinstance(data['order'].get('timeline'),list))
 status,data,_=B.call('/orders-api.php?a=pull'); check('verified browser sees the order in its own session',status==200 and len(data['orders'])==1 and '_emailEvents' not in data['orders'][0])
 status,data,_=S.call('/orders-api.php?a=pull'); check('staff can list persisted orders',status==200 and len(data['orders'])==1)
 # ---- Billing address: optional at rest, validated when supplied ----
 def billing_order(rid,billing):
  base=json.loads(json.dumps(order))
  base['billing']=billing
  return {'a':'create','requestId':rid,'order':base}
 C=Client(); C.session()
 status,plain,_=S.call('/orders-api.php',billing_order('billing-absent-001',None)); check('order without a billing block is accepted',status==201,(status,plain))
 status,mirror,_=S.call('/orders-api.php',billing_order('billing-mirror-002',{'sameAsDelivery':True,'name':'Ignored client name','phone':order['customer']['phone'],'address':'Ignored client address','city':'Ignored','pincode':'111111','state':'Telangana'})); check('same-as-delivery billing is accepted',status==201,(status,mirror))
 mb=mirror.get('order',{}).get('billing',{})
 sh=mirror.get('order',{}).get('shipping',{})
 check('same-as-delivery billing mirrors the delivery address server-side',mb.get('address')==sh.get('address') and mb.get('pincode')==sh.get('pincode') and mb.get('city')==sh.get('city') and mb.get('name')==mirror['order']['customer']['name'],(mb,sh))
 check('same-as-delivery flag persisted',mirror.get('order',{}).get('billingSameAsDelivery') is True,mirror.get('order',{}).get('billingSameAsDelivery'))
 check('order without billing carries no billing key','billing' not in plain.get('order',{}),sorted(plain.get('order',{}).keys()))
 status,diffb,_=S.call('/orders-api.php',billing_order('billing-diff-003',{'sameAsDelivery':False,'name':'Billing Person','phone':order['customer']['phone'],'address':'22 Billing Road','area':'Billing Lane','city':'Warangal','state':'Telangana','pincode':'506002'})); check('distinct billing address is accepted',status==201,(status,diffb))
 check('distinct billing address stored verbatim',diffb.get('order',{}).get('billing',{}).get('address')=='22 Billing Road' and diffb.get('order',{}).get('billing',{}).get('city')=='Warangal' and diffb.get('order',{}).get('billingSameAsDelivery') is False,diffb.get('order',{}).get('billing'))
 check('distinct billing does not overwrite the delivery address',diffb.get('order',{}).get('shipping',{}).get('city')==order['shipping']['city'],diffb.get('order',{}).get('shipping'))
 status,_,_=S.call('/orders-api.php',billing_order('billing-bad-004',{'sameAsDelivery':False,'name':'Billing Person','phone':order['customer']['phone'],'address':'22 Billing Road','city':'Warangal','state':'Telangana','pincode':'1'})); check('billing pincode must be six digits',status==422,status)
 status,_,_=S.call('/orders-api.php',billing_order('billing-bad-005',{'sameAsDelivery':False,'name':'Billing Person','phone':order['customer']['phone'],'address':'22 Billing Road','city':'Warangal','state':'','pincode':'506002'})); check('billing state is required when different',status==422,status)
 status,_,_=S.call('/orders-api.php',billing_order('billing-bad-006',{'sameAsDelivery':False,'name':'B','phone':order['customer']['phone'],'address':'22 Billing Road','city':'Warangal','state':'Telangana','pincode':'506002'})); check('billing name is required when different',status==422,status)
 status,_,_=S.call('/orders-api.php',billing_order('billing-bad-007',{'sameAsDelivery':False,'name':'Billing Person','phone':'12345','address':'22 Billing Road','city':'Warangal','state':'Telangana','pincode':'506002'})); check('billing mobile must be a valid 10-digit number',status==422,status)
 for name,qty in [('negative',-1),('fractional',1.5),('stock-excess',11)]:
  bad=json.loads(json.dumps(request)); bad['requestId']='invalid-'+name+'-001'; bad['order']['items'][0]['qty']=qty
  status,_,_=A.call('/orders-api.php',bad); check('reject '+name+' quantity',status in [409,422],status)
 bad=json.loads(json.dumps(request)); bad['requestId']='invalid-coupon-001'; bad['order']['totals']['couponCode']='FORGED'
 status,_,_=A.call('/orders-api.php',bad); check('reject nonexistent coupon',status==422,status)
 bad=json.loads(json.dumps(request)); bad['requestId']='invalid-pos-001'; bad['pos']=True
 status,_,_=A.call('/orders-api.php',bad); check('public cannot claim POS privileges',status==401,status)
 bad=json.loads(json.dumps(request)); bad['requestId']='invalid-card-001'; bad['order']['payment']='CARD'
 status,_,_=A.call('/orders-api.php',bad); check('public cannot choose staff-only payment mode',status==422,status)
 status,data,_=S.call('/orders-api.php',{'a':'update','id':saved['id'],'status':'packed','log':[{'status':'delivered','at':'1999'}]})
 check('staff updates create authoritative audit log',status==200 and data['order']['status']=='packed' and data['order']['log'][-1]['status']=='packed' and data['order']['log'][-1]['at']!='1999',(status,data))
 status,_,_=S.call('/orders-api.php',{'a':'update','id':saved['id'],'status':'unrecognized'})
 check('unknown order status rejected',status==422,status)
 pos=json.loads(json.dumps(request)); pos['requestId']='staff-pos-create-001'; pos['pos']=True; pos['order']['items'][0]['qty']=1; pos['order']['payment']='CARD'; pos['order']['totals']={'posDiscount':100}
 status,data,_=S.call('/orders-api.php',pos); check('staff POS persists canonical counter bill',status==201 and data['order']['totals']['total']==900 and data['order']['status']=='confirmed',(status,data))
 status,data,_=A.call('/email-api.php',{'a':'order-confirmation','order':{'id':saved['id'],'customer':{'email':'forged@example.invalid'}}}); check('owned order notification accepts stored identity with mail disabled',status==200 and data.get('delivery')=='disabled',(status,data))
 status,data,_=A.call('/email-api.php',{'a':'order-confirmation','orderId':saved['id']}); check('frontend orderId notification contract accepted',status==200 and data.get('delivery')=='disabled',(status,data))
 C=Client(); C.session()
 status,_,_=C.call('/email-api.php',{'a':'order-confirmation','id':saved['id']}); check('other browser cannot trigger order notification',status==404,status)
 status,_,_=S.call('/catalog-api.php',{'a':'push','priceOverrides':{str(product['id']):-1}}); check('negative catalog price rejected',status==422,status)
 status,data,_=S.call('/catalog-api.php',{'a':'push','priceOverrides':{str(product['id']):1100},'stockOverrides':{str(product['id']):9},'featOn':{str(product['id']):True}}); check('staff catalog mutation accepted',status==200 and data.get('ok'),(status,data))
 status,data,_=A.call('/catalog-api.php?a=pull'); check('public receives persisted catalog changes',status==200 and data['priceOverrides'][str(product['id'])]==1100)
 status,_,_=S.call('/products-api.php',{'a':'push','rev':-1,'settings':{'maintenance':False,'coupon':None}}); check('stale product revision rejected',status==409,status)
 status,data,_=S.call('/products-api.php',{'a':'push','rev':0,'productOverrides':{str(product['id']):{'name':'Saved fixture product','image':'images/products/p26.webp'}},'settings':{'maintenance':False,'coupon':{'code':'SAVE50','discount':50}}}); check('staff product mutation accepted',status==200 and data.get('rev')==1,(status,data))
 status,_,_=S.call('/products-api.php',{'a':'push','rev':1,'productOverrides':{str(product['id']):{'image':'javascript:local-test-only'}}}); check('unsafe product image scheme rejected',status==422,status)
 status,_,_=S.call('/products-api.php',{'a':'push','rev':1,'productOverrides':{str(product['id']):{'slug':'invalid url fragment'}}}); check('unsafe product URL slug rejected',status==422,status)
 # A valid one-pixel PNG is decoded and re-encoded by both upload routes.
 png=subprocess.check_output([str(PHP),'-d','extension_dir='+str(PHP.parent/'ext'),'-d','extension=gd','-r','$im=imagecreatetruecolor(2,2); imagepng($im); imagedestroy($im);'])+b'CM_FIXTURE_TRAILING_DATA'
 for route,field in [('/upload-api.php','image'),('/api/upload.php','product_image')]:
  boundary='LocalFixtureBoundaryA17'
  multipart=(f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"; filename="../fixture.png"\r\nContent-Type: image/png\r\n\r\n').encode()+png+f'\r\n--{boundary}--\r\n'.encode()
  status,data,_=S.call(route,raw=multipart,content_type='multipart/form-data; boundary='+boundary)
  check('authenticated safe raster upload '+route,status==200 and data.get('ok') and data['url'].startswith('uploads/p-'),(status,data))
  name=data['url'].split('/')[-1]
  check('random upload stays inside fixture directory '+route,(UPLOAD/name).is_file() and '..' not in name and len(name)>30)
  check('upload raster reencoding strips trailing content '+route,b'CM_FIXTURE_TRAILING_DATA' not in (UPLOAD/name).read_bytes())
 sid=next(c.value for c in S.jar if c.name=='cm_staff')
 expiry_env=env.copy(); expiry_env['CM_TEST_SESSION']=sid
 subprocess.check_call([str(PHP),'-d','session.save_path='+str(SESSIONS),'-r',"session_name('cm_staff'); session_id(getenv('CM_TEST_SESSION')); session_start(); $_SESSION['staff_last_seen']=time()-1801; session_write_close();"],env=expiry_env,stdout=subprocess.DEVNULL)
 status,data,_=S.call('/orders-api.php?a=pull'); check('expired staff cannot retain POS order ownership',status==200 and data['orders']==[],(status,data))
 S.session()
 status,data,_=S.call('/staff-auth.php?a=login',{'email':staff_email,'password':staff_password}); check('staff can sign in again after expiry',status==200 and data['authenticated'],(status,data)); S.csrf=data['csrfToken']
 status,data,_=S.call('/staff-auth.php?a=logout',{})
 check('staff logout succeeds',status==200,status)
 S.csrf=data['csrfToken']
 status,_,_=S.call('/analytics-api.php?a=report'); check('logout revokes staff API access',status==401,status)
 statuses=[]
 for attempt in range(12):
  status,_,_=S.call('/staff-auth.php?a=login',{'email':staff_email,'password':'incorrect-local-value'}); statuses.append(status)
 check('repeated staff password failures are rate limited',429 in statuses,statuses)
 D=Client(); D.session()
 customer_password='Local-customer-passphrase-24!'
 customer_email='fixture-customer@example.invalid'
 status,data,_=D.call('/customer-auth.php',{'a':'register','name':'Fixture account','email':customer_email,'password':customer_password,'role':'admin'})
 check('registration cannot claim staff role',status==201 and data.get('user',{}).get('role')=='customer',(status,data)); D.csrf=data['csrfToken']
 status,data,_=D.call('/orders-api.php?a=pull'); check('same email never claims legacy guest orders',status==200 and data['orders']==[],(status,data))
 status,_,_=D.call('/catalog-api.php',{'a':'push','priceOverrides':{}}); check('normal customer cannot modify catalog',status==401,status)
 status,_,_=D.call('/analytics-api.php?a=report'); check('normal customer cannot view admin report',status==401,status)
 status,_,_=D.call('/upload-api.php',raw=b'',method='POST'); check('normal customer cannot upload products',status==401,status)
 owned_request=json.loads(json.dumps(request)); owned_request['requestId']='customer-owned-order-001'
 status,data,_=D.call('/orders-api.php',owned_request); check('customer order is saved',status==201,(status,data)); customer_order=data['order']
 E=Client(); E.session()
 status,data,_=E.call('/customer-auth.php',{'a':'login','email':customer_email,'password':customer_password}); check('customer can sign in from second browser',status==200 and data.get('user',{}).get('role')=='customer',(status,data)); E.csrf=data['csrfToken']
 status,data,_=E.call('/orders-api.php?a=pull'); check('server customer ID scopes cross-browser order history',status==200 and [o['id'] for o in data['orders']]==[customer_order['id']],(status,data))
 F=Client(); F.session()
 status,data,_=F.call('/customer-auth.php',{'a':'register','name':'Separate fixture','email':'separate-fixture@example.invalid','password':customer_password}); check('separate customer registration succeeds',status==201,(status,data)); F.csrf=data['csrfToken']
 status,data,_=F.call('/orders-api.php?a=pull'); check('separate customer cannot read another customer orders',status==200 and data['orders']==[],(status,data))
 status,_,_=F.call('/email-api.php',{'a':'order-confirmation','orderId':customer_order['id']}); check('separate customer cannot mail another customer order',status==404,status)
 sid=next(c.value for c in D.jar if c.name=='cm_staff'); expiry_env=env.copy(); expiry_env['CM_TEST_SESSION']=sid
 subprocess.check_call([str(PHP),'-d','session.save_path='+str(SESSIONS),'-r',"session_name('cm_staff'); session_id(getenv('CM_TEST_SESSION')); session_start(); $_SESSION['customer_last_seen']=time()-7201; session_write_close();"],env=expiry_env,stdout=subprocess.DEVNULL)
 status,data,_=D.call('/orders-api.php?a=pull'); check('customer expiry enforced on direct order API',status==200 and data['orders']==[],(status,data))
 status,data,_=E.call('/customer-auth.php',{'a':'logout'}); check('customer logout succeeds',status==200,(status,data)); E.csrf=data['csrfToken']
 status,data,_=E.call('/orders-api.php?a=pull'); check('customer logout revokes order history access',status==200 and data['orders']==[],(status,data))
 print(json.dumps({'passed':sum(r['pass'] for r in results),'total':len(results),'fixture':'isolated synthetic data; email disabled'},indent=2))
except Exception as error:
 print(type(error).__name__+': '+str(error))
 raise
finally:
 server.terminate()
 try: server.wait(timeout=5)
 except subprocess.TimeoutExpired: server.kill(); server.wait()
 log.close()
 output={'checkedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'runtime':'PHP 8.3.35 Windows; production PHP 8.1 lint remains separate','fixtureOnly':True,'mailDisabled':True,'serverStopped':server.poll() is not None,'passed':sum(r['pass'] for r in results),'total':len(results),'results':results,'serverLog':str(FIXTURE/'php-server.log')}
 (ROOT/'audit/backend-security-test-results.json').write_text(json.dumps(output,indent=2),encoding='utf-8')

