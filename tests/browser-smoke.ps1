$ErrorActionPreference = 'Stop'
$session = 'cm-regression-public'
agent-browser --session $session open 'http://localhost:4173'
$routes = @('/', '/products', '/products?q=sparkler', '/product/long-boy-gun', '/cart', '/checkout', '/wishlist', '/my-orders', '/track', '/price-list', '/about', '/contact', '/faq', '/wholesale', '/shipping', '/returns', '/safety', '/terms', '/privacy', '/missing-qa-page')
$results = @()
foreach ($route in $routes) {
  $url = 'http://localhost:4173/#' + $route
  agent-browser --session $session open $url | Out-Null
  agent-browser --session $session wait --fn "document.querySelector('#view h1') !== null" | Out-Null
  $script = "({heading:document.querySelector('#view h1')?.textContent,title:document.title,route:location.hash,overflow:document.documentElement.scrollWidth > innerWidth,errorPanel:!!document.querySelector('.err-panel')})"
  $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($script))
  $result = agent-browser --session $session --json eval -b $encoded | ConvertFrom-Json
  if (!$result.success -or !$result.data.result.heading -or $result.data.result.errorPanel) { throw "Smoke test failed for $url" }
  if ($route -ne '/missing-qa-page' -and $result.data.result.heading -eq 'Page not found') { throw "Unexpected not-found page at $url" }
  $expectedRoute = if ($route -eq '/checkout') { '#/cart' } else { '#' + $route }
  if ($result.data.result.route -ne $expectedRoute) { throw "Unexpected redirect at $url" }
  $results += [pscustomobject]@{Requested=$route;Status='PASS';Observed=$result.data.result}
  Write-Output "Verified local route: $route"
}
$errors = agent-browser --session $session --json errors | ConvertFrom-Json
[pscustomobject]@{Scope='Local frontend only; backend operations unavailable';Results=$results;BrowserErrors=$errors.data} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath 'audit/browser-smoke.json' -Encoding utf8
agent-browser --session $session close | Out-Null
Write-Output "PASS: $($results.Count) local routes rendered. Details: audit/browser-smoke.json"
