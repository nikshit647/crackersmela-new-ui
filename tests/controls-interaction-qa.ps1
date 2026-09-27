$ErrorActionPreference = 'Stop'
$session = 'cm-controls-qa'
$checks = [Collections.Generic.List[object]]::new()
function Invoke-Browser {
  param([string[]]$BrowserArgs)
  $output = & agent-browser --session $session @BrowserArgs
  if ($LASTEXITCODE -ne 0) { throw ('Browser command failed: ' + ($BrowserArgs -join ' ')) }
  return $output
}
function Get-BrowserValue {
  param([string]$JavaScript)
  $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($JavaScript))
  $result = Invoke-Browser -BrowserArgs @('--json','eval','-b',$encoded) | ConvertFrom-Json
  if (!$result.success) { throw 'Browser evaluation failed.' }
  return $result.data.result
}
function Assert-Check {
  param([string]$Name,[string]$JavaScript)
  $value = Get-BrowserValue $JavaScript
  if (!$value) { throw ('FAIL: ' + $Name) }
  $checks.Add([pscustomobject]@{name=$Name;status='PASS'})
}
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$null = Invoke-Browser -BrowserArgs @('set','viewport','1366','900')
$null = Invoke-Browser -BrowserArgs @('set','media','light')
$null = Invoke-Browser -BrowserArgs @('open',('http://localhost:4173/?qa=controls-state&run=' + $stamp + '#/product/125-shots-special-1-box-rain-and-thunder-gold-bonanza'))
$null = Invoke-Browser -BrowserArgs @('wait','#pdAdd')
$null = Invoke-Browser -BrowserArgs @('hover','#pdAdd')
Assert-Check 'Primary hover has no gradient, glow or movement' "(()=>{const c=getComputedStyle(document.querySelector('#pdAdd'));return c.backgroundImage==='none'&&c.boxShadow==='none'&&c.transform==='none'})()"
$null = Invoke-Browser -BrowserArgs @('focus','#pdAdd')
$null = Invoke-Browser -BrowserArgs @('press','Tab')
$null = Invoke-Browser -BrowserArgs @('press','Shift+Tab')
Assert-Check 'Product primary action has visible keyboard focus' "(()=>{const e=document.activeElement,c=getComputedStyle(e);return e.id==='pdAdd'&&e.matches(':focus-visible')&&parseFloat(c.outlineWidth)>=2})()"
$null = Invoke-Browser -BrowserArgs @('click','#pdBuyNow')
$null = Invoke-Browser -BrowserArgs @('wait','#ck_name')
foreach ($field in @(@('name','Local QA'),@('phone','9000000000'),@('email','qa@example.test'),@('address','Local test address only'),@('city','Hyderabad'),@('pincode','500001'))) { $null = Invoke-Browser -BrowserArgs @('fill',('#ck_' + $field[0]),$field[1]) }
$null = Invoke-Browser -BrowserArgs @('click','#ckNext1')
$null = Invoke-Browser -BrowserArgs @('wait','#ckNext2')
Assert-Check 'Checkout progress exposes one current non-button step' "document.querySelectorAll('.checkout-steps [aria-current=step]').length===1&&document.querySelector('.checkout-steps [aria-current=step]').textContent.includes('Payment')&&!document.querySelector('.checkout-steps button')"
$null = Invoke-Browser -BrowserArgs @('focus','[data-pay=UPI]')
$null = Invoke-Browser -BrowserArgs @('press','Enter')
Assert-Check 'Payment choice supports keyboard selection' "document.querySelector('[data-pay=UPI]').getAttribute('aria-checked')==='true'&&document.querySelector('[data-pay=COD]').getAttribute('aria-checked')==='false'"
$null = Invoke-Browser -BrowserArgs @('click','#ckNext2')
Assert-Check 'Review retains payment choice and presents current review step' "document.querySelector('#view').innerText.includes('UPI on Delivery')&&document.querySelector('.checkout-steps [aria-current=step]').textContent.includes('Review')"
$null = Invoke-Browser -BrowserArgs @('click','#ckBack2')
Assert-Check 'Back retains the selected payment method' "document.querySelector('[data-pay=UPI]').getAttribute('aria-checked')==='true'"

$null = Invoke-Browser -BrowserArgs @('set','viewport','390','844')
$null = Invoke-Browser -BrowserArgs @('open',('http://localhost:4174/?qa=controls-pos-final&run=' + $stamp + '#/staff'))
$null = Invoke-Browser -BrowserArgs @('wait','#adminShell')
$null = Invoke-Browser -BrowserArgs @('click','[data-side-toggle]')
$null = Invoke-Browser -BrowserArgs @('wait','--fn',"Math.abs(document.querySelector('.admin-side').getBoundingClientRect().left)<1")
$null = Invoke-Browser -BrowserArgs @('click','[data-stab=pos]')
$null = Invoke-Browser -BrowserArgs @('wait','.pos-root')
$null = Invoke-Browser -BrowserArgs @('fill','#posQ','Long Boy')
$null = Invoke-Browser -BrowserArgs @('wait','--fn',"document.querySelectorAll('[data-pos-add]').length===1")
$null = Invoke-Browser -BrowserArgs @('click','[data-pos-add]')
$null = Invoke-Browser -BrowserArgs @('click','[data-mtab=bill]')
$null = Invoke-Browser -BrowserArgs @('wait','--fn',"getComputedStyle(document.querySelector('.pos-billpanel')).overflowY==='auto'")
$null = Invoke-Browser -BrowserArgs @('fill','#posName','Local QA')
$null = Invoke-Browser -BrowserArgs @('fill','#posPhone','9000000000')
$null = Invoke-Browser -BrowserArgs @('click','[data-pos-inc]')
$null = Invoke-Browser -BrowserArgs @('click','[data-pos-pay=UPI]')
Assert-Check 'POS draft quantity and payment selection work locally' "document.querySelector('#posBillCount').textContent.includes('2')&&document.querySelector('[data-pos-pay=UPI]').classList.contains('on')"
$null = Invoke-Browser -BrowserArgs @('scrollintoview','#posPlace')
Assert-Check 'POS primary action clears the mobile tab bar' "(()=>{const b=document.querySelector('#posPlace').getBoundingClientRect(),t=document.querySelector('.pos-mtabs').getBoundingClientRect();return b.bottom<=t.top&&t.bottom<=innerHeight+1&&document.documentElement.scrollWidth===innerWidth})()"
$null = Invoke-Browser -BrowserArgs @('screenshot',(Join-Path (Get-Location).Path 'audit-evidence/controls-after/mobile-admin-pos-bill.png'))
$null = Invoke-Browser -BrowserArgs @('click','#posPlace')
$null = Invoke-Browser -BrowserArgs @('wait','--fn',"document.querySelector('#cm-preview-message').textContent.includes('Nothing was saved')")
Assert-Check 'Blocked POS save keeps tabs visible after notice resizes' "Math.abs(document.querySelector('.pos-mtabs').getBoundingClientRect().bottom-innerHeight)<1&&Math.abs(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cm-preview-notice-height'))-document.querySelector('.cm-preview-notice').getBoundingClientRect().height)<1"
$null = Invoke-Browser -BrowserArgs @('click','.pos-back')
$null = Invoke-Browser -BrowserArgs @('click','[data-side-toggle]')
$null = Invoke-Browser -BrowserArgs @('wait','--fn',"Math.abs(document.querySelector('.admin-side').getBoundingClientRect().left)<1")
$null = Invoke-Browser -BrowserArgs @('click','[data-stab=products]')
$null = Invoke-Browser -BrowserArgs @('fill','#admPq','Long Boy')
$null = Invoke-Browser -BrowserArgs @('wait','--fn',"document.querySelectorAll('[data-edit-prod]').length===1")
$null = Invoke-Browser -BrowserArgs @('click','[data-edit-prod]')
$null = Invoke-Browser -BrowserArgs @('fill','#epName','Local QA draft only')
$null = Invoke-Browser -BrowserArgs @('click','.modal__close[data-close-edit]')
Assert-Check 'Admin product draft closes without saving or changing catalog' "!document.querySelector('[data-edit-modal]')&&!document.querySelector('#staffPanel').innerText.includes('Local QA draft only')"
$errors = Invoke-Browser -BrowserArgs @('--json','errors') | ConvertFrom-Json
if ($errors.data.errors.Count -gt 0) { throw 'Uncaught browser errors recorded.' }
[pscustomobject]@{scope='Local UI only; synthetic drafts; no production writes or real authentication';checks=$checks;uncaughtErrors=$errors.data.errors;capturedAt=[DateTimeOffset]::UtcNow.ToString('o')} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath 'audit/controls-interactions.json' -Encoding utf8
Write-Output ('PASS: ' + $checks.Count + ' control interaction checks')
