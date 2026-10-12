"""Dedicated cart QA copy on port 4317; never touches the owner's 4316 preview."""
from pathlib import Path
import contextlib
import http.cookiejar
import importlib.util
import io
import json
import shutil
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'audit-evidence/cart-ui-fixture-20261008.json'
spec = importlib.util.spec_from_file_location('cart_fixture', ROOT / 'tests/cms-fixture.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.MANIFEST = MANIFEST
if MANIFEST.exists():
    raise RuntimeError('A dedicated cart fixture already exists; inspect and refresh it instead.')
with contextlib.redirect_stdout(io.StringIO()):
    module.start(4317)
fixture = json.loads(MANIFEST.read_text(encoding='utf-8'))
base, web = Path(fixture['fixture']), Path(fixture['documentRoot'])
assert base.parent == ROOT / 'audit-evidence' and web == base / 'public'
snapshot = ROOT / 'audit-evidence/seo-all-fields-20261008'
state = json.loads((snapshot / 'products.json').read_text(encoding='utf-8'))
state.pop('ok', None)
state['settings']['coupon'] = None
for pid, price, compare, stock in [(26,650,1729,120),(27,1250,2000,120),(28,100,250,3)]:
    state['productOverrides'][str(pid)].update(price=price,compareAt=compare,stock=stock,inStock=True,disabled=False)
# All scenarios retain recognisable catalog copy; prices/stock exist only here.
images = web / 'images/products'
for pid, row in state['productOverrides'].items():
    candidates = list(images.glob('p' + pid + '.*'))
    if candidates:
        row['image'] = 'images/products/' + candidates[0].name
(base/'data/products.json').write_text(json.dumps(state,ensure_ascii=False),encoding='utf-8')
(base/'data/catalog.json').write_text(json.dumps({'stockOverrides':{},'priceOverrides':{},'featOn':{},'rev':0}),encoding='utf-8')
shutil.copyfile(snapshot/'seed.js',web/'js/products-data.js')
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
csrf=''
def call(route,payload=None):
    global csrf
    headers={'Origin':fixture['baseUrl'],'Accept':'application/json','X-CSRF-Token':csrf}
    if payload is not None:headers['Content-Type']='application/json'
    request=urllib.request.Request(fixture['baseUrl']+route,data=json.dumps(payload).encode() if payload is not None else None,headers=headers)
    with opener.open(request,timeout=10) as response:value=json.load(response)
    if value.get('csrfToken'):csrf=value['csrfToken']
    return value
call('/staff-auth.php?a=session')
call('/staff-auth.php?a=login',{'email':fixture['email'],'password':fixture['password']})
coupons=[
 ('QA10',{'discountPercentBps':1000,'minimumOrderPaise':250000,'description':'Fixture percentage offer'}),
 ('QA500',{'discountType':'fixed','discountAmountPaise':50000,'minimumOrderPaise':500000,'description':'Fixture fixed offer'}),
 ('QASTACKA',{'discountType':'fixed','discountAmountPaise':10000,'stackingEnabled':True}),
 ('QASTACKB',{'discountType':'fixed','discountAmountPaise':20000,'stackingEnabled':True}),
 ('QAEXPIRED',{'discountPercentBps':1000,'expiresAt':'2020-01-01T00:00:00Z'}),
 ('QAINACTIVE',{'discountPercentBps':1000,'active':False}),
 ('QAHIDDEN',{'discountPercentBps':1000,'showInCartOffers':False}),
]
for index in range(1,7):coupons.append(('QAMORE'+str(index),{'discountPercentBps':index*100,'minimumOrderPaise':(index+2)*100000}))
for code,values in coupons:call('/coupons-api.php?a=create',{'code':code,**values})
print(json.dumps({'status':'READY','publicUrl':fixture['publicUrl'],'manifest':str(MANIFEST),'testCoupons':len(coupons),'syntheticPricesOnlyInDedicatedFixture':True,'mail':'disabled'}))
