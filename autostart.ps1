# Starts local Bot API (2 GB upload) + XDownloader bot.
# Used manually and by the "XDownloader" scheduled task at logon.
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

$creds = Join-Path $root "botapi\credentials.ps1"
if (Test-Path $creds) {
  . $creds
}

if (-not $env:XDL_BOT_API) { $env:XDL_BOT_API = "http://127.0.0.1:8081" }

& (Join-Path $root "run_botapi.ps1") -ApiId $env:XDL_BOTAPI_ID -ApiHash $env:XDL_BOTAPI_HASH

Start-Sleep -Seconds 2

& (Join-Path $root "run_bot.ps1") -Token $env:XDL_BOT_TOKEN -ApiUrl $env:XDL_BOT_API
