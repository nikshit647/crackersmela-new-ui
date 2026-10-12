$ErrorActionPreference = 'Continue'
$bin = Join-Path $env:APPDATA "npm\node_modules\agent-browser\bin\agent-browser-win32-x64.exe"
$S = 'cm-wishcheck2'

function RunAB {
  param([string[]]$abArgs, [int]$timeoutSec = 30)
  $job = Start-Job -ScriptBlock { param($b, $a) & $b @a --json 2>&1 | Out-String } -ArgumentList $bin, $abArgs
  $out = 'TIMEOUT'
  if (Wait-Job $job -Timeout $timeoutSec) { $out = Receive-Job $job } else { Stop-Job $job }
  Remove-Job $job -Force -ErrorAction SilentlyContinue
  return $out
}
function Ev($js, [int]$timeoutSec = 30) {
  $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($js))
  return (RunAB -abArgs @('eval', '-b', $b64) -timeoutSec $timeoutSec)
}

Write-Output '--- open ---'
RunAB -abArgs @('open', 'http://localhost:4297/#/products') -timeoutSec 45 | Out-String
RunAB -abArgs @('set', 'viewport', '390', '844') -timeoutSec 20 | Out-Null
RunAB -abArgs @('wait', '--fn', 'document.querySelectorAll(".shop-main .prod-card").length>0') -timeoutSec 45 | Out-Null
Write-Output 'opened'

Write-Output '--- baseline wishBtn ---'
Ev "(()=>{const b=document.querySelector('#wishBtn');if(!b)return 'MISSING';const r=b.getBoundingClientRect();const s=getComputedStyle(b);const el=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return JSON.stringify({rect:[r.left,r.top,r.width,r.height],display:s.display,vis:s.visibility,op:s.opacity,hit:el&&(el.id||el.className||el.tagName),inner:[innerWidth,innerHeight],scrollY})})()"

Write-Output '--- open search panel (eval click) ---'
Ev "(()=>{const b=document.querySelector('#navSearchOpenBtn');if(!b)return 'NO-BTN';b.click();return 'clicked'})()"
Start-Sleep -Seconds 1
Ev "(()=>{const b=document.querySelector('#wishBtn');const r=b.getBoundingClientRect();const el=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);const p=document.querySelector('#navSearchPanel')||document.querySelector('#navSearch');return JSON.stringify({wishRect:[r.left,r.top,r.width,r.height],wishHit:el&&(el.id||el.className||el.tagName),panel:p&&p.className,panelHidden:p&&p.hidden})})()"

Write-Output '--- fill + enter ---'
RunAB -abArgs @('fill', '#navSearchInput', 'sparklers') -timeoutSec 30 | Out-String
RunAB -abArgs @('press', 'Enter') -timeoutSec 30 | Out-String
Start-Sleep -Seconds 2
Ev "JSON.stringify({hash:location.hash})"
Ev "(()=>{const b=document.querySelector('#wishBtn');const r=b.getBoundingClientRect();const s=getComputedStyle(b);const el=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return JSON.stringify({rect:[r.left,r.top,r.width,r.height],display:s.display,hit:el&&(el.id||el.className||el.tagName),contains:b.contains(el),scrollY,inner:[innerWidth,innerHeight]})})()"
Write-Output 'done'
