param(
  [string]$ApiId = $env:XDL_BOTAPI_ID,
  [string]$ApiHash = $env:XDL_BOTAPI_HASH
)

if (-not $ApiId -or -not $ApiHash) {
  Write-Error "No api credentials. Usage: .\run_botapi.ps1 -ApiId <id> -ApiHash <hash>   (or set XDL_BOTAPI_ID / XDL_BOTAPI_HASH env vars)"
  exit 1
}

$port = 8081
$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  Write-Output "[$(Get-Date -Format 'HH:mm:ss')] Bot API server already listening on port $port, skipping."
  exit 0
}

$bin = Join-Path $PSScriptRoot 'botapi\telegram-bot-api.exe'
$data = Join-Path $PSScriptRoot 'botapi\data'
$tmp = Join-Path $PSScriptRoot 'botapi\tmp'
New-Item -ItemType Directory -Path $data, $tmp -Force | Out-Null

Write-Output "[$(Get-Date -Format 'HH:mm:ss')] Starting local Bot API server on 127.0.0.1:$port"
& $bin "--api-id=$ApiId" "--api-hash=$ApiHash" --local "--dir=$data" "--temp-dir=$tmp" "--http-port=$port" "--verbosity=1"