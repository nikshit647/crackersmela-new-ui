$ErrorActionPreference = 'Continue'
$bin = Join-Path $env:APPDATA "npm\node_modules\agent-browser\bin\agent-browser-win32-x64.exe"

function Ev($js) {
  $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($js))
  $out = & $bin --session cm-verify eval -b $b64 --json 2>&1
  $out | Out-String
}

Write-Output '=== STEP: open products ==='
& $bin --session cm-verify open 'https://crackersmela.com/#/products' --json | Out-Null
& $bin --session cm-verify set viewport 390 844 --json | Out-Null
& $bin --session cm-verify wait --fn 'document.querySelectorAll(".shop-main .prod-card").length>0&&document.querySelector("#catRail [data-cat]")' --json | Out-Null
Write-Output 'opened + rendered'

Write-Output '=== STEP: rail categories ==='
Ev "(()=>[...document.querySelectorAll('#catRail button[data-cat]')].map(b=>b.dataset.cat).slice(0,8))()"

Write-Output '=== STEP: simulate prior interaction - focus first rail button ==='
Ev "(()=>{const b=document.querySelector('#catRail button[data-cat]');b.focus();return document.activeElement.tagName+':'+(document.activeElement.dataset.cat||'');})()"

Write-Output '=== STEP: same-document hash navigation to another category ==='
$catsJson = & $bin --session cm-verify eval -b ([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("(()=>[...document.querySelectorAll('#catRail button[data-cat]')].map(b=>b.dataset.cat).slice(0,8))()"))) --json 2>&1 | Out-String
$cats = ($catsJson | ConvertFrom-Json).data.result
$target = $cats[3]
Write-Output "target category: $target"
& $bin --session cm-verify open "https://crackersmela.com/#/products?cat=$target" --json | Out-Null
Start-Sleep -Seconds 2
Write-Output 'activeElement after hash nav:'
Ev "document.activeElement.tagName+':'+((document.activeElement.dataset&&document.activeElement.dataset.cat)||'')"
Write-Output 'active pill visible in rail:'
Ev "(()=>{const r=document.querySelector('#catRail').getBoundingClientRect();const a=document.querySelector('#catRail [data-cat].active');const p=a&&a.getBoundingClientRect();return !!p&&p.left>=r.left-1&&p.right<=r.right+1})()"

Write-Output '=== STEP: cold load of the deep link (reload) ==='
& $bin --session cm-verify reload --json | Out-Null
& $bin --session cm-verify wait --fn 'document.querySelectorAll(".shop-main .prod-card").length>0&&document.querySelector("#catRail [data-cat]")' --json | Out-Null
Start-Sleep -Seconds 1
Write-Output 'activeElement after cold load:'
Ev "document.activeElement.tagName+':'+((document.activeElement.dataset&&document.activeElement.dataset.cat)||'')"
Write-Output 'active pill visible after cold load:'
Ev "(()=>{const r=document.querySelector('#catRail').getBoundingClientRect();const a=document.querySelector('#catRail [data-cat].active');const p=a&&a.getBoundingClientRect();return !!p&&p.left>=r.left-1&&p.right<=r.right+1})()"

Write-Output '=== STEP: cart check - add first enabled product ==='
Ev "(()=>{const b=document.querySelector('.shop-main [data-add]:not([disabled])');if(!b)return 'no-add';b.click();return 'clicked:'+b.closest('.prod-card').dataset.id})()"
Start-Sleep -Seconds 1
Write-Output 'cart state:'
Ev "(()=>{const c=JSON.parse(localStorage.getItem('cm2.cart')||'[]');const cc=document.querySelector('#cartCount');return JSON.stringify({count:cc&&cc.textContent,hidden:!!(cc&&cc.classList.contains('hidden')),items:c.length})})()"

Write-Output '=== STEP: cleanup local cart ==='
Ev "(()=>{localStorage.removeItem('cm2.cart');return 'cleared'})()"
& $bin --session cm-verify reload --json | Out-Null
Write-Output 'done'
