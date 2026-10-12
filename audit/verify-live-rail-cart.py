import subprocess, json, base64, os, sys, time

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
BIN = os.path.join(os.environ['APPDATA'], 'npm', 'node_modules', 'agent-browser', 'bin', 'agent-browser-win32-x64.exe')
S = 'cm-verify'

def run(*args, timeout=90):
    p = subprocess.run([BIN, '--session', S, *args, '--json'], capture_output=True, text=True, timeout=timeout)
    try:
        j = json.loads(p.stdout)
        return j
    except Exception:
        return {'raw': p.stdout[:500], 'err': p.stderr[:500], 'code': p.returncode}

def ev(code):
    return run('eval', '-b', base64.b64encode(code.encode()).decode())

def waitfn(code, timeout=60):
    return run('wait', '--fn', code, timeout=timeout)

print('== open products (mobile) ==')
print(json.dumps(run('open', 'https://crackersmela.com/#/products'), ensure_ascii=False)[:200])
run('set', 'viewport', '390', '844')
print(json.dumps(waitfn('document.querySelectorAll(".shop-main .prod-card").length>0&&document.querySelector("#catRail [data-cat]")'), ensure_ascii=False)[:200])

print('== rail categories ==')
cats = ev("(()=>[...document.querySelectorAll('#catRail button[data-cat]')].map(b=>b.dataset.cat).slice(0,8))()")
print(json.dumps(cats, ensure_ascii=False)[:300])

cat_list = (cats.get('result') or [])
target = cat_list[3] if len(cat_list) > 3 else cat_list[-1]

print('== simulate prior interaction: focus a rail button ==')
print(json.dumps(ev("(()=>{const b=document.querySelector('#catRail button[data-cat]');b.focus();return document.activeElement.tagName+':'+(document.activeElement.dataset.cat||'')})()"), ensure_ascii=False)[:200])

print('== same-document hash navigation to ?cat=%s ==' % target)
run('open', 'https://crackersmela.com/#/products?cat=' + str(target))
time.sleep(2)
print('activeElement after hash nav:', json.dumps(ev("document.activeElement.tagName+':'+(document.activeElement.dataset&&document.activeElement.dataset.cat||'')"), ensure_ascii=False)[:200])
visible = ev("(()=>{const r=document.querySelector('#catRail').getBoundingClientRect(),p=document.querySelector('#catRail [data-cat].active')?.getBoundingClientRect();return !!p&&p.left>=r.left-1&&p.right<=r.right+1})()")
print('active pill visible in rail:', json.dumps(visible, ensure_ascii=False)[:200])

print('== cold load of the deep link (reload) ==')
run('reload')
print(json.dumps(waitfn('document.querySelectorAll(".shop-main .prod-card").length>0&&document.querySelector("#catRail [data-cat]")'), ensure_ascii=False)[:200])
time.sleep(1)
print('activeElement after cold load:', json.dumps(ev("document.activeElement.tagName+':'+(document.activeElement.dataset&&document.activeElement.dataset.cat||'')"), ensure_ascii=False)[:200])
visible2 = ev("(()=>{const r=document.querySelector('#catRail').getBoundingClientRect(),p=document.querySelector('#catRail [data-cat].active')?.getBoundingClientRect();return !!p&&p.left>=r.left-1&&p.right<=r.right+1})()")
print('active pill visible after cold load:', json.dumps(visible2, ensure_ascii=False)[:200])

print('== cart check: add first enabled product ==')
add = ev("(()=>{const b=document.querySelector('.shop-main [data-add]:not([disabled])');if(!b)return 'no-add';b.click();return 'clicked:'+b.closest('.prod-card').dataset.id})()")
print(json.dumps(add, ensure_ascii=False)[:250])
time.sleep(1)
cartinfo = ev("(()=>{const c=JSON.parse(localStorage.getItem('cm2.cart')||'[]');return {count:document.querySelector('#cartCount')?.textContent,hidden:document.querySelector('#cartCount')?.classList.contains('hidden'),items:c.length,first:c[0]&&c[0].id}})()")
print('cart:', json.dumps(cartinfo, ensure_ascii=False)[:300])

print('== cleanup (clear local cart, reload) ==')
ev("(()=>{localStorage.removeItem('cm2.cart');return 'cleared'})()")
run('reload')
print('done')
