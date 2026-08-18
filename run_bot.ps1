param(
  [string]$Token = $env:XDL_BOT_TOKEN,
  [string]$ApiUrl = $env:XDL_BOT_API
)

if (-not $Token) {
  Write-Error "No token. Usage: .\run_bot.ps1 -Token <bot_token>   (or set the XDL_BOT_TOKEN env var first)"
  exit 1
}

$already = Get-CimInstance Win32_Process -Filter "Name='ruby.exe'" | Where-Object { $_.CommandLine -match 'bot\.rb' }
if ($already) {
  Write-Output "[$(Get-Date -Format 'HH:mm:ss')] Bot already running (PID $($already.ProcessId -join ', ')), skipping."
  exit 0
}

$env:XDL_BOT_TOKEN = $Token
if ($ApiUrl) { $env:XDL_BOT_API = $ApiUrl }

if ($ApiUrl -and $ApiUrl -notmatch 'api\.telegram\.org') {
  $port = ([uri]$ApiUrl).Port
  if (-not $port) { $port = 80 }
  $deadline = (Get-Date).AddSeconds(60)
  while ((Get-Date) -lt $deadline) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { break }
    Start-Sleep -Seconds 2
  }
}

$env:Path = [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';C:\Ruby33-x64\msys64\ucrt64\bin'
$botDir = Join-Path $PSScriptRoot 'bot'
$outLog = Join-Path $PSScriptRoot 'bot.log'
$errLog = Join-Path $PSScriptRoot 'bot.err.log'

$cmd = "Set-Location -LiteralPath '$botDir'; bundle exec ruby bot.rb"
Write-Output "[$(Get-Date -Format 'HH:mm:ss')] Starting detached bot (log: $outLog)"
Start-Process powershell -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $cmd -WindowStyle Hidden `
  -RedirectStandardOutput $outLog -RedirectStandardError $errLog