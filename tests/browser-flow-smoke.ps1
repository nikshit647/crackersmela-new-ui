$ErrorActionPreference = 'Stop'
$session = 'cm-local-flows-' + (Get-Date -Format 'yyyyMMddHHmmss')
agent-browser --session $session open 'http://localhost:4173/?qa=flow-start'
if ($LASTEXITCODE -ne 0) { throw 'Could not open the local browser.' }

function Invoke-Browser {
  param([string[]]$BrowserArgs)
  $output = & agent-browser --session $session @BrowserArgs
  if ($LASTEXITCODE -ne 0) { throw ('Browser command failed: ' + $BrowserArgs[0]) }
  return $output
}
function Get-BrowserValue {
  param([string]$JavaScript)
  $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($JavaScript))
  $result = Invoke-Browser -BrowserArgs @('--json', 'eval', '-b', $encoded) | ConvertFrom-Json
  if (!$result.success) { throw 'Browser evaluation failed.' }
  return $result.data.result
}
$checks = @()

# Clear only this isolated session's local fixture state, never production data.
$null = Get-BrowserValue 'localStorage.clear()'
$null = Invoke-Browser -BrowserArgs @('open', 'http://localhost:4173/?qa=contact-final#/contact')
$null = Invoke-Browser -BrowserArgs @('fill', '#cfName', 'Local QA')
$null = Invoke-Browser -BrowserArgs @('fill', '#cfPhone', '9000000000')
$null = Invoke-Browser -BrowserArgs @('fill', '#cfMsg', 'Testing the local contact form only.')
$null = Invoke-Browser -BrowserArgs @('click', '#contactForm button[type=submit]')
$contact = Get-BrowserValue "({honest:document.body.innerText.includes('The contact form is unavailable'),draftRetained:document.querySelector('#cfMsg').value.length>0})"
if (!$contact.honest -or !$contact.draftRetained) { throw 'Contact error handling failed.' }
$checks += [pscustomobject]@{Check='Contact reports unavailable and retains draft';Status='PASS'}

$null = Invoke-Browser -BrowserArgs @('open', 'http://localhost:4173/?qa=checkout-final#/product/125-shots-special-1-box-rain-and-thunder-gold-bonanza')
$null = Invoke-Browser -BrowserArgs @('click', '#pdBuyNow')
$null = Invoke-Browser -BrowserArgs @('wait', '#ck_name')
foreach ($field in @(@('name','Local QA'),@('phone','9000000000'),@('email','qa@example.test'),@('address','Local test address only'),@('city','Hyderabad'),@('pincode','500001'))) {
  $null = Invoke-Browser -BrowserArgs @('fill', ('#ck_' + $field[0]), $field[1])
}
$null = Invoke-Browser -BrowserArgs @('click', '#ckNext1')
$null = Invoke-Browser -BrowserArgs @('click', '#ckNext2')
$null = Invoke-Browser -BrowserArgs @('wait', '--fn', "scrollY === 0 && !!document.querySelector('#ckPlace')")
$null = Invoke-Browser -BrowserArgs @('click', '#ckPlace')
$null = Invoke-Browser -BrowserArgs @('wait', '--fn', "document.body.innerText.includes('We could not place your order. Your cart is saved.') && !document.querySelector('#ckPlace').disabled")
$checkout = Get-BrowserValue "({route:location.hash,cart:JSON.parse(localStorage.getItem('cm2.cart')||'[]').length,privateCache:localStorage.getItem('cm2.orders'),honest:document.body.innerText.includes('We could not place your order. Your cart is saved.')})"
if ($checkout.route -ne '#/checkout' -or $checkout.cart -ne 1 -or !$checkout.honest -or $checkout.privateCache) { throw 'Failed checkout lost its cart, cached private data, or reported success.' }
$checks += [pscustomobject]@{Check='503 checkout retains cart, creates no success page or private cache';Status='PASS'}

$null = Invoke-Browser -BrowserArgs @('open', 'http://localhost:4173/?qa=missing-final#/does-not-exist')
$unknown = Get-BrowserValue "({heading:document.querySelector('#view h1')?.textContent,robots:document.querySelector('meta[name=robots]').content})"
if ($unknown.heading -ne 'Page not found' -or !$unknown.robots.Contains('noindex')) { throw 'First-load unknown route failed.' }
$checks += [pscustomobject]@{Check='Unknown initial route renders noindexed 404 UI';Status='PASS'}

$null = Invoke-Browser -BrowserArgs @('open', 'http://localhost:4174/?qa=admin-final#/staff')
$null = Invoke-Browser -BrowserArgs @('click', '[data-stab=products]')
$null = Invoke-Browser -BrowserArgs @('fill', '#admPq', 'Long Boy')
$null = Invoke-Browser -BrowserArgs @('wait', '--fn', "document.querySelectorAll('[data-edit-prod]').length === 1")
$search = Get-BrowserValue "({focused:document.activeElement.id,rows:document.querySelectorAll('[data-edit-prod]').length,text:document.querySelector('#staffPanel').innerText})"
if ($search.focused -ne 'admPq' -or $search.rows -ne 1 -or !$search.text.Contains('Long Boy')) { throw 'Admin product search failed.' }
$checks += [pscustomobject]@{Check='Admin search filters to one row without losing focus';Status='PASS'}
$null = Invoke-Browser -BrowserArgs @('click', '[data-edit-prod]')
$null = Invoke-Browser -BrowserArgs @('click', '[data-save-edit]')
$guard = Get-BrowserValue "({notice:document.querySelector('#cm-preview-message').textContent,saved:JSON.parse(localStorage.getItem('cm2.productOverrides')||'{}')})"
if (!$guard.notice.Contains('Nothing was saved') -or ($guard.saved.PSObject.Properties | Measure-Object).Count -gt 0) { throw 'Admin preview write guard failed.' }
$checks += [pscustomobject]@{Check='Admin edit save blocked without local override or false success';Status='PASS'}

$errors = Invoke-Browser -BrowserArgs @('--json','errors') | ConvertFrom-Json
if ($errors.data.errors.Count -gt 0) { throw 'Uncaught browser errors were recorded.' }
[pscustomobject]@{Scope='Isolated local preview and error paths only; no real server persistence/authentication';Checks=$checks;BrowserErrors=$errors.data} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath 'audit/browser-flows.json' -Encoding utf8
$null = Invoke-Browser -BrowserArgs @('close')
Write-Output ('PASS: ' + $checks.Count + ' local user-flow checks. Details: audit/browser-flows.json')
