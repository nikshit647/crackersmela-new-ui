"""Refresh only the named isolated fixture; never reads private production stores."""
from pathlib import Path
import importlib.util
import json
import shutil
import subprocess
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
MANIFEST=ROOT/'audit-evidence/seo-editor-fixture-20261007.json'
fixture=json.loads(MANIFEST.read_text())
base=Path(fixture['fixture']).resolve();web=Path(fixture['documentRoot']).resolve()
assert base.parent == (ROOT/'audit-evidence').resolve() and base.name.startswith('cms-fixture-')
assert web == base/'public'
with urllib.request.urlopen(fixture['baseUrl']+'/__fixture-health') as response:
    health=json.load(response)
assert health.get('isolated') is True and health.get('mail')=='disabled'
spec=importlib.util.spec_from_file_location('fixture_helper',ROOT/'tests/cms-fixture.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
module.copy_source(web)
before=ROOT/'audit-artifacts/seo-editor-20261007/seo-before'
for source,name in [('products-api.php_a_pull','products.json'),('catalog-api.php_a_pull','catalog.json')]:
    state=json.loads((before/source).read_text(encoding='utf-8-sig'))
    state.pop('ok',None)
    (base/'data'/name).write_text(json.dumps(state,ensure_ascii=False),encoding='utf-8')
# The fixture router must exercise the same PHP entries as the public rewrite rules.
router=base/'router.php';text=router.read_text(encoding='utf-8')
anchor="$target = realpath($root . $route);"
routes="""if (preg_match('~^/(?:product/[^/]+|products|category/[a-z0-9-]+)/?$~D', $route)) { require $root . '/seo-page.php'; return true; }
if ($route === '/sitemap.xml') { require $root . '/sitemap.php'; return true; }
if ($route === '/robots.txt') { require $root . '/robots.php'; return true; }
"""
if routes not in text:text=text.replace(anchor,routes+anchor)
router.write_text(text,encoding='utf-8')
plan=ROOT/'audit-artifacts/seo-editor-20261007/product-seo-plan.json'
result=subprocess.run([str(module.PHP),str(ROOT/'audit/migrate-product-seo.php'),'--root='+str(web),'--data-dir='+str(base/'data'),'--plan='+str(plan),'--backup-dir='+str(base/'seo-backups'),'--apply'],capture_output=True,text=True)
assert result.returncode==0,result.stderr+result.stdout
products=json.loads((before/'merged-products.json').read_text(encoding='utf-8'))
downloaded=0
for p in products:
    image=str(p.get('image','')).lstrip('/')
    if not image or not image.startswith(('images/','uploads/')):continue
    target=((base if image.startswith('uploads/') else web)/image).resolve()
    assert target.is_relative_to(base)
    if target.is_file():continue
    target.parent.mkdir(parents=True,exist_ok=True)
    try:
        with urllib.request.urlopen('https://crackersmela.com/'+image,timeout=15) as response:
            assert response.headers.get_content_type().startswith('image/')
            target.write_bytes(response.read(8_000_000));downloaded+=1
    except Exception as error:print('Image unavailable:',p['id'],type(error).__name__)
print(json.dumps({'fixture':str(base),'publicUrl':fixture['publicUrl'],'adminUrl':fixture['baseUrl'],'migration':json.loads(result.stdout),'downloadedPublicImages':downloaded}))
