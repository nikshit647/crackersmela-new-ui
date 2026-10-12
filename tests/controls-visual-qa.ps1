param([ValidateSet('before','after')][string]$Phase = 'before',[switch]$MatchedOnly)
$ErrorActionPreference = 'Stop'
$session = 'cm-controls-qa'
$runId = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$root = (Get-Location).Path
$evidence = Join-Path $root ('audit-evidence/controls-' + $Phase)
$null = New-Item -ItemType Directory -Path $evidence -Force
$observations = [Collections.Generic.List[object]]::new()
if ($MatchedOnly -and (Test-Path -LiteralPath (Join-Path $evidence 'observations.json'))) {
  foreach ($existing in (Get-Content -Raw -LiteralPath (Join-Path $evidence 'observations.json') | ConvertFrom-Json)) { $observations.Add($existing) }
}
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
function Save-View {
  param([string]$Name)
  $null = Invoke-Browser -BrowserArgs @('wait','--fn',"[...document.querySelectorAll('#view .reveal')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&Math.max(0,Math.min(r.bottom,innerHeight-40)-Math.max(r.top,0))/r.height>=.08}).every(e=>Number(getComputedStyle(e).opacity)>=.99)")
  $null = Invoke-Browser -BrowserArgs @('wait','--fn',"!document.querySelector('.toast')")
  $null = Get-BrowserValue 'document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))'
  $data = Get-BrowserValue @'
(() => ({url:location.href,width:innerWidth,height:innerHeight,scrollX,scrollY,bodyWidth:document.body.scrollWidth,documentWidth:document.documentElement.scrollWidth,controls:[...document.querySelectorAll('button,a.btn,a[class*=btn],input,select,textarea,[role=tab]')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&r.top<innerHeight&&r.bottom>0}).map(e=>{const c=getComputedStyle(e),r=e.getBoundingClientRect();return {tag:e.tagName,id:e.id,text:(e.innerText||e.getAttribute('aria-label')||e.getAttribute('placeholder')||'').trim().slice(0,90),classes:e.className,color:c.color,background:c.backgroundColor,gradient:c.backgroundImage,radius:c.borderRadius,shadow:c.boxShadow,fontSize:c.fontSize,fontWeight:c.fontWeight,width:Math.round(r.width),height:Math.round(r.height),disabled:e.disabled||false}})}))()
'@
  $file = Join-Path $evidence ($Name + '.png')
  $null = Invoke-Browser -BrowserArgs @('screenshot',$file)
  for ($i = $observations.Count - 1; $i -ge 0; $i--) { if ($observations[$i].name -eq $Name) { $observations.RemoveAt($i) } }
  $observations.Add([pscustomobject]@{name=$Name;screenshot=$file;data=$data;capturedAt=[DateTimeOffset]::UtcNow.ToString('o')})
  $observations | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $evidence 'observations.json') -Encoding utf8
  Write-Output ('Captured ' + $Name)
}
function Open-Public {
  param([string]$Route)
  $null = Invoke-Browser -BrowserArgs @('open',('http://localhost:4173/?qa=controls-' + $Phase + '&run=' + $runId + $Route))
  $null = Invoke-Browser -BrowserArgs @('wait','#view h1')
}
$null = Invoke-Browser -BrowserArgs @('set','viewport','1366','900')
$null = Invoke-Browser -BrowserArgs @('set','media','light')
Open-Public '#/'
$null = Get-BrowserValue 'localStorage.clear()'
$runId = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
Open-Public '#/'
Save-View 'desktop-home'
Open-Public '#/products'
Save-View 'desktop-catalog'
Open-Public '#/product/125-shots-special-1-box-rain-and-thunder-gold-bonanza'
Save-View 'desktop-product'
$null = Invoke-Browser -BrowserArgs @('click','#pdAdd')
Open-Public '#/cart'
Save-View 'desktop-cart'
Open-Public '#/checkout'
foreach ($field in @(@('name','Local QA'),@('phone','9000000000'),@('email','qa@example.test'),@('address','Local test address only'),@('city','Hyderabad'),@('pincode','500001'))) {
  $null = Invoke-Browser -BrowserArgs @('fill',('#ck_' + $field[0]),$field[1])
}
Save-View 'desktop-checkout-address'
$null = Invoke-Browser -BrowserArgs @('click','#ckNext1')
$null = Invoke-Browser -BrowserArgs @('wait','#ckNext2')
Save-View 'desktop-checkout-payment'
$null = Invoke-Browser -BrowserArgs @('click','#ckNext2')
$null = Invoke-Browser -BrowserArgs @('wait','#ckPlace')
Save-View 'desktop-checkout-review'
$null = Invoke-Browser -BrowserArgs @('set','viewport','390','844')
Open-Public '#/products'
Save-View 'mobile-catalog'
$null = Invoke-Browser -BrowserArgs @('click','#filterFab')
$null = Invoke-Browser -BrowserArgs @('wait','#filterClose')
Save-View 'mobile-filter'
$null = Invoke-Browser -BrowserArgs @('set','viewport','1366','900')
$null = Invoke-Browser -BrowserArgs @('open',('http://localhost:4174/?qa=controls-' + $Phase + '#/staff'))
$null = Invoke-Browser -BrowserArgs @('wait','#adminShell')
Save-View 'desktop-admin-dashboard'
$null = Invoke-Browser -BrowserArgs @('click','[data-stab=products]')
$null = Invoke-Browser -BrowserArgs @('wait','#admPq')
Save-View 'desktop-admin-products'
$null = Invoke-Browser -BrowserArgs @('fill','#admPq','Long Boy')
$null = Invoke-Browser -BrowserArgs @('wait','--fn',"document.querySelectorAll('[data-edit-prod]').length === 1")
$null = Invoke-Browser -BrowserArgs @('click','[data-edit-prod]')
$null = Invoke-Browser -BrowserArgs @('wait','[data-save-edit]')
Save-View 'desktop-admin-edit'
if ($Phase -eq 'after' -and !$MatchedOnly) {
  $null = Invoke-Browser -BrowserArgs @('click','.modal__close[data-close-edit]')
  foreach ($panel in @('add-product','pos','settings')) {
    $null = Invoke-Browser -BrowserArgs @('click',('[data-stab="' + $panel + '"]'))
    Save-View ('desktop-admin-' + $panel)
    if ($panel -eq 'pos') { $null = Invoke-Browser -BrowserArgs @('click','.pos-back') }
  }
  $null = Invoke-Browser -BrowserArgs @('set','viewport','1920','1080')
  Open-Public '#/'
  Save-View 'wide-home'
  Open-Public '#/products'
  Save-View 'wide-catalog'
  $null = Invoke-Browser -BrowserArgs @('scrollintoview','.prod-card')
  Save-View 'wide-product-cards'
  foreach ($size in @(@('tablet','768','1024'),@('mobile','390','844'))) {
    $null = Invoke-Browser -BrowserArgs @('set','viewport',$size[1],$size[2])
    Open-Public '#/products'
    Save-View ($size[0] + '-catalog-expanded')
    Open-Public '#/product/125-shots-special-1-box-rain-and-thunder-gold-bonanza'
    Save-View ($size[0] + '-product')
    $null = Invoke-Browser -BrowserArgs @('scrollintoview','#pdAdd')
    Save-View ($size[0] + '-product-actions')
    Open-Public '#/cart'
    Save-View ($size[0] + '-cart')
    Open-Public '#/checkout'
    foreach ($field in @(@('name','Local QA'),@('phone','9000000000'),@('email','qa@example.test'),@('address','Local test address only'),@('city','Hyderabad'),@('pincode','500001'))) {
      $null = Invoke-Browser -BrowserArgs @('fill',('#ck_' + $field[0]),$field[1])
    }
    $null = Invoke-Browser -BrowserArgs @('click','#ckNext1')
    $null = Invoke-Browser -BrowserArgs @('wait','#ckNext2')
    Save-View ($size[0] + '-checkout-payment')
    $null = Invoke-Browser -BrowserArgs @('click','#ckNext2')
    Save-View ($size[0] + '-checkout-review')
    $null = Invoke-Browser -BrowserArgs @('open',('http://localhost:4174/?qa=controls-after&width=' + $size[1] + '&run=' + $runId + '#/staff'))
    $null = Invoke-Browser -BrowserArgs @('wait','#adminShell')
    Save-View ($size[0] + '-admin-dashboard')
    $null = Invoke-Browser -BrowserArgs @('click','[data-side-toggle]')
    Save-View ($size[0] + '-admin-navigation')
    $null = Invoke-Browser -BrowserArgs @('click','[data-stab=products]')
    $null = Invoke-Browser -BrowserArgs @('wait','#admPq')
    Save-View ($size[0] + '-admin-products')
    $null = Invoke-Browser -BrowserArgs @('fill','#admPq','Long Boy')
    $null = Invoke-Browser -BrowserArgs @('wait','--fn',"document.querySelectorAll('[data-edit-prod]').length === 1")
    $null = Invoke-Browser -BrowserArgs @('click','[data-edit-prod]')
    Save-View ($size[0] + '-admin-edit')
    $null = Invoke-Browser -BrowserArgs @('click','.modal__close[data-close-edit]')
    $null = Invoke-Browser -BrowserArgs @('click','[data-side-toggle]')
    $null = Invoke-Browser -BrowserArgs @('wait','--fn',"Math.abs(document.querySelector('.admin-side').getBoundingClientRect().left)<1")
    $null = Invoke-Browser -BrowserArgs @('click','[data-stab=pos]')
    $null = Invoke-Browser -BrowserArgs @('wait','.pos-root')
    Save-View ($size[0] + '-admin-pos-catalog')
    $posBounds = Get-BrowserValue "({height:innerHeight,notice:document.querySelector('.cm-preview-notice').getBoundingClientRect().height,root:document.querySelector('.pos-root').getBoundingClientRect().toJSON(),tabs:document.querySelector('.pos-mtabs').getBoundingClientRect().toJSON()})"
    if ($posBounds.tabs.bottom -gt ([int]$size[2] + 1)) { throw 'POS mobile tabs exceed viewport.' }
    $null = Invoke-Browser -BrowserArgs @('click','[data-mtab=bill]')
    Save-View ($size[0] + '-admin-pos-bill')
  }
  $null = Invoke-Browser -BrowserArgs @('set','viewport','1366','900')
  $null = Invoke-Browser -BrowserArgs @('set','media','light','reduced-motion')
  $runId = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  Open-Public '#/products'
  Save-View 'reduced-motion-catalog'
  Open-Public '#/checkout'
  foreach ($field in @(@('name','Local QA'),@('phone','9000000000'),@('address','Local test address only'),@('city','Hyderabad'),@('pincode','500001'))) {
    $null = Invoke-Browser -BrowserArgs @('fill',('#ck_' + $field[0]),$field[1])
  }
  $null = Invoke-Browser -BrowserArgs @('click','#ckNext1')
  Save-View 'reduced-motion-checkout-payment'
  $null = Invoke-Browser -BrowserArgs @('set','media','light')
}
if ($Phase -eq 'after') {
  $null = Invoke-Browser -BrowserArgs @('set','viewport','1366','900')
  Open-Public '#/'
  $null = Invoke-Browser -BrowserArgs @('scrollintoview','#new-arrivals')
  Save-View 'desktop-home-collection'
}
$errors = Invoke-Browser -BrowserArgs @('--json','errors') | ConvertFrom-Json
$errors | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $evidence 'browser-errors.json') -Encoding utf8
Write-Output ('Finished ' + $observations.Count + ' captures: ' + $evidence)
