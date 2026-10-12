$ErrorActionPreference = 'Continue'
$bin = Join-Path $env:APPDATA "npm\node_modules\agent-browser\bin\agent-browser-win32-x64.exe"
$S = 'cm-wishcheck'
function Ev($js) {
  $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($js))
  (& $bin --session $S eval -b $b64 --json 2>&1 | Out-String)
}

& $bin --session $S open 'http://localhost:4297/#/products' --json | Out-Null
& $bin --session $S set viewport 390 844 --json | Out-Null
& $bin --session $S wait --fn 'document.querySelectorAll(".shop-main .prod-card").length>0' --json | Out-Null

Write-Output '=== baseline wishBtn state ==='
Ev "(()=>{const b=document.querySelector('#wishBtn');if(!b)return 'MISSING';const r=b.getBoundingClientRect();const s=getComputedStyle(b);const el=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return JSON.stringify({rect:[r.left,r.top,r.width,r.height],display:s.display,vis:s.visibility,op:s.opacity,hit:el&&(el.id||el.className||el.tagName),inner:[innerWidth,innerHeight],scrollY})})()"

Write-Output '=== header context ==='
Ev "(()=>{const b=document.querySelector('#wishBtn');const h=b&&b.closest('header');return JSON.stringify({headerClass:h&&h.className,btnHTML:b&&b.outerHTML.slice(0,220),headerHTML:h&&h.outerHTML.slice(0,400)})})()"

Write-Output '=== replicate search flow ==='
& $bin --session $S click '#navSearchOpenBtn' --json 2>&1 | Out-String
Start-Sleep -Seconds 1
Write-Output 'after opening search - wishBtn:'
Ev "(()=>{const b=document.querySelector('#wishBtn');if(!b)return 'MISSING';const r=b.getBoundingClientRect();const el=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return JSON.stringify({rect:[r.left,r.top,r.width,r.height],hit:el&&(el.id||el.className||el.tagName),searchOpen:!!document.querySelector('#navSearchPanel,#navSearch')&&(document.querySelector('#navSearchPanel')||document.querySelector('#navSearch')).className})})()"

& $bin --session $S fill '#navSearchInput' 'sparklers' --json 2>&1 | Out-String
& $bin --session $S press Enter --json 2>&1 | Out-String
Start-Sleep -Seconds 2
Write-Output 'after search enter - hash + wishBtn:'
Ev "JSON.stringify({hash:location.hash})"
Ev "(()=>{const b=document.querySelector('#wishBtn');if(!b)return 'MISSING';const r=b.getBoundingClientRect();const s=getComputedStyle(b);const el=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return JSON.stringify({rect:[r.left,r.top,r.width,r.height],display:s.display,hit:el&&(el.id||el.className||el.tagName),contains:b.contains(el),scrollY,inner:[innerWidth,innerHeight]})})()"
Write-Output 'done'
