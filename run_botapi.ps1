param(
  [string]$ApiId = $env:XDL_BOTAPI_ID,
  [string]$ApiHash = $env:XDL_BOTAPI_HASH
)

if (-not $ApiId -or -not $ApiHash) {
  Write-Error "No api credentials. Usage: .\run_botapi.ps1 -ApiId <id> -ApiHash <hash>   (or set XDL_BOTAPI_ID / XDL_BOTAPI_HASH env vars)"
  exit 1
}

$port = 8081
if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
  Write-Output "[$(Get-Date -Format 'HH:mm:ss')] Bot API server already listening on port $port, skipping."
  exit 0
}

$bin = Join-Path $PSScriptRoot 'botapi\telegram-bot-api.exe'
$data = Join-Path $PSScriptRoot 'botapi\data'
$tmp = Join-Path $PSScriptRoot 'botapi\tmp'
New-Item -ItemType Directory -Path $data, $tmp -Force | Out-Null

$args = "--api-id=$ApiId --api-hash=$ApiHash --local --dir=$data --temp-dir=$tmp --http-port=$port --verbosity=1"
$outLog = Join-Path $PSScriptRoot 'botapi\server.log'
$errLog = Join-Path $PSScriptRoot 'botapi\server.err.log'

Write-Output "[$(Get-Date -Format 'HH:mm:ss')] Starting detached Bot API server on 127.0.0.1:$port"
Start-Process -FilePath $bin -ArgumentList $args -WindowStyle Hidden `
  -RedirectStandardOutput $outLog -RedirectStandardError $errLog

Start-Sleep -Seconds 5
if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
  Write-Output "[$(Get-Date -Format 'HH:mm:ss')] Server is up."
} else {
  Write-Output "[$(Get-Date -Format 'HH:mm:ss')] Server did not come up - check botapi\server.err.log"
}