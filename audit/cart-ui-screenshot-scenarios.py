"""Switch synthetic coupon scenarios only inside the dedicated port-4317 fixture."""
from pathlib import Path
import argparse
import http.cookiejar
import json
import urllib.request

root=Path(__file__).resolve().parents[1]
fixture=json.loads((root/'audit-evidence/cart-ui-fixture-20261008.json').read_text(encoding='utf-8'))
assert fixture['publicUrl']=='http://localhost:4317'
parser=argparse.ArgumentParser();parser.add_argument('mode',choices=['edge','polish','full']);args=parser.parse_args()
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));csrf=''
def call(route,payload=None):
    global csrf
    headers={'Origin':fixture['baseUrl'],'Accept':'application/json','X-CSRF-Token':csrf}
    if payload is not None:headers['Content-Type']='application/json'
    with opener.open(urllib.request.Request(fixture['baseUrl']+route,data=json.dumps(payload).encode() if payload is not None else None,headers=headers),timeout=10) as response:value=json.load(response)
    if value.get('csrfToken'):csrf=value['csrfToken']
    return value
assert call('/__fixture-health').get('isolated')
call('/staff-auth.php?a=session');call('/staff-auth.php?a=login',{'email':fixture['email'],'password':fixture['password']})
coupons=call('/coupons-api.php?a=list')['coupons'];by_code={row['code']:row for row in coupons}
if args.mode=='edge':
    for index in range(1,9):
        code='QAMULTI'+str(index)
        if code not in by_code:call('/coupons-api.php?a=create',{'code':code,'discountType':'fixed','discountAmountPaise':10000,'stackingEnabled':True})
else:
    for row in coupons:
        active=row['code'] in ['QASTACKA','QA500'] if args.mode=='polish' else row['code']!='QAINACTIVE' and not row['code'].startswith('QAMULTI')
        if row['active']!=active:call('/coupons-api.php?a=set-active',{'id':row['id'],'expectedVersion':row['version'],'active':active})
print(json.dumps({'mode':args.mode,'dedicatedFixtureOnly':True,'liveWrites':False}))
