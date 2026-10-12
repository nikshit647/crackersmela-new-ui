"""Dedicated shared-chrome QA on 4318; preserve the owner's 4316 and other fixtures."""
from pathlib import Path
import contextlib
import http.cookiejar
import importlib.util
import io
import json
import shutil
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'audit-evidence/global-chrome-fixture-20261008.json'
spec = importlib.util.spec_from_file_location('global_fixture', ROOT / 'tests/cms-fixture.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.MANIFEST = MANIFEST
if '--refresh' in sys.argv:
    with contextlib.redirect_stdout(io.StringIO()):
        module.refresh()
    print(json.dumps({'refreshed': True, 'port': 4318, 'existingDataPreserved': True}))
    raise SystemExit(0)
if MANIFEST.exists():
    raise RuntimeError('Dedicated global-chrome fixture exists; use --refresh to preserve test data.')
protected = ROOT / 'audit-evidence/cms-fixture-active.json'
protected_before = protected.read_bytes() if protected.exists() else None
with contextlib.redirect_stdout(io.StringIO()):
    module.start(4318)
fixture = json.loads(MANIFEST.read_text(encoding='utf-8'))
base, web = Path(fixture['fixture']), Path(fixture['documentRoot'])
assert base.parent == ROOT / 'audit-evidence' and web == base / 'public'
snapshot = ROOT / 'audit-evidence/seo-all-fields-20261008'
state = json.loads((snapshot / 'products.json').read_text(encoding='utf-8'))
state.pop('ok', None)
state['settings']['coupon'] = None
# Price/stock support one deterministic quote. This synthetic change stays on 4318.
state['productOverrides']['27'].update(price=1250, compareAt=2000, stock=120, inStock=True, disabled=False)
for pid, row in state['productOverrides'].items():
    candidates = list((web / 'images/products').glob('p' + pid + '.*'))
    if candidates:
        row['image'] = 'images/products/' + candidates[0].name
(base/'data/products.json').write_text(json.dumps(state, ensure_ascii=False), encoding='utf-8')
(base/'data/catalog.json').write_text(json.dumps({'stockOverrides': {}, 'priceOverrides': {}, 'featOn': {}, 'rev': 0}), encoding='utf-8')
shutil.copyfile(snapshot/'seed.js', web/'js/products-data.js')
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
csrf = ''
def call(route, payload=None):
    global csrf
    headers = {'Origin': fixture['baseUrl'], 'Accept': 'application/json', 'X-CSRF-Token': csrf}
    if payload is not None:
        headers['Content-Type'] = 'application/json'
    request = urllib.request.Request(fixture['baseUrl'] + route, data=json.dumps(payload).encode() if payload is not None else None, headers=headers)
    with opener.open(request, timeout=10) as response:
        value = json.load(response)
    if value.get('csrfToken'):
        csrf = value['csrfToken']
    return value
call('/staff-auth.php?a=session')
call('/staff-auth.php?a=login', {'email': fixture['email'], 'password': fixture['password']})
call('/coupons-api.php?a=create', {'code': 'GLOBALQA10', 'discountPercentBps': 1000, 'minimumOrderPaise': 250000, 'description': 'Isolated shared chrome QA offer'})
assert (protected.read_bytes() if protected.exists() else None) == protected_before
print(json.dumps({'status': 'READY', 'publicUrl': fixture['publicUrl'], 'manifest': str(MANIFEST), 'testCoupons': 1, 'syntheticDataOnlyOn4318': True, 'activeFixtureUntouched': True, 'mail': 'disabled'}))
