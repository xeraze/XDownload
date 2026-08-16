param(
  [string]$Token = $env:XDL_BOT_TOKEN
)

if (-not $Token) {
  Write-Error "No token. Usage: .\start.ps1 <bot_token>   (or set the XDL_BOT_TOKEN env var first)"
  exit 1
}

$env:XDL_BOT_TOKEN = $Token
Set-Location "$PSScriptRoot\bot"
bundle exec ruby bot.rb