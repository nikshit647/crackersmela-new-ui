"""Read-only current-catalog backup and exact five-field update proposal."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import copy
import hashlib
import json
import re
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'audit-evidence/live-seo-fields-20261007'
OUT.mkdir(exist_ok=True)
fields=['seoTitle','seoDesc','seoKeywords','seoSlug','seoTags']
plan=json.loads((ROOT/'audit-artifacts/seo-editor-20261007/product-seo-plan.json').read_text('utf-8'))
paths={'products':'products-api.php?a=pull','catalog':'catalog-api.php?a=pull','seed':'js/products-data.js'}
def get(item):
    key,path=item
    with urllib.request.urlopen(urllib.request.Request('https://admin.crackersmela.com/'+path,headers={'Cache-Control':'no-cache'}),timeout=30) as response:
        raw=response.read()
    target=OUT/(key+'.before'+('.js' if key=='seed' else '.json'))
    if target.exists() and target.read_bytes()!=raw:
        target=OUT/(key+'.refresh'+('.js' if key=='seed' else '.json'))
    target.write_bytes(raw)
    return key,raw
raw=dict(ThreadPoolExecutor(max_workers=3).map(get,paths.items()))
state=json.loads(raw['products']);catalog=json.loads(raw['catalog'])
base=json.loads(re.search(r'window\.CM_DATA\s*=\s*(\{.*\})\s*;?\s*$',raw['seed'].decode('utf-8-sig'),re.S)[1])
products={}
for original in base['products']+state.get('extraProducts',[]):
    p={**original,**state.get('productOverrides',{}).get(str(original['id']),{})}
    products[str(original['id'])]=p
assert sorted(products)==sorted(str(r['id']) for r in plan['changes']),'Current catalog differs from reviewed inventory'
overrides=copy.deepcopy(state['productOverrides'])
changes=[];conflicts=[]
facts=['name','shortName','note','desc','brand','sku','slug','primary','cats','image','disabled']
for row in plan['changes']:
    id=str(row['id']);p=products[id];old=row['expectedProduct'];desired={**old,**row['changes']}
    for key in facts+fields:
        if p.get(key)!=old.get(key) and not(key in fields+['desc'] and p.get(key)==desired.get(key)):
            conflicts.append({'id':id,'field':key})
    before=copy.deepcopy(overrides.get(id,{}));after={**before,**{key:desired[key] for key in fields}}
    for key in fields:assert isinstance(after[key],str) and after[key].strip()
    assert all(v==after[k] for k,v in before.items() if k not in fields)
    overrides[id]=after
    changes.append({'id':int(id),'name':p['name'],'fields':{key:after[key] for key in fields}})
report={'products':len(products),'fields':len(products)*len(fields),'revision':state['rev'],
        'conflicts':conflicts,'protectedFieldsPreserved':True,
        'snapshotHashes':{key:hashlib.sha256(value).hexdigest() for key,value in raw.items()}}
(OUT/'preflight.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
if conflicts:
    print(json.dumps(report));raise SystemExit('Source conflicts require review before saving')
request={'a':'push','rev':state['rev'],'productOverrides':overrides}
(OUT/'request.json').write_text(json.dumps(request,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(OUT/'fields.json').write_text(json.dumps(changes,ensure_ascii=False),encoding='utf-8')
print(json.dumps(report))
