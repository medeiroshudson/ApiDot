# ApiDot Agent Installation Script for Windows
# Injected server URL or override via environment variable
$ErrorActionPreference = "Stop"

$ServerUrl = $env:APIDOT_SERVER_URL
if ([string]::IsNullOrWhiteSpace($ServerUrl)) {
    $ServerUrl = "__SERVER_URL__"
}

Write-Host "==> Target platform: win/x64"

$DownloadUrl = "$ServerUrl/api/agent/download/win/x64"
$InstallDir = Join-Path $env:USERPROFILE ".apidot\bin"
$TargetFile = Join-Path $InstallDir "apidot-agent.exe"

Write-Host "==> Downloading ApiDot Agent from: $DownloadUrl"

if (-not (Test-Path -Path $InstallDir)) {
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
}

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
Invoke-WebRequest -Uri $DownloadUrl -OutFile $TargetFile -UseBasicParsing

Write-Host ""
Write-Host "==> ApiDot Agent installed successfully to: $TargetFile"
Write-Host ""
Write-Host "To connect your agent to ApiDot Server:"
Write-Host "  & `"$TargetFile`" connect --token <YOUR_DEVICE_TOKEN>"
Write-Host ""
Write-Host "To add apidot-agent to your PATH permanently, run in PowerShell:"
Write-Host "  `$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')"
Write-Host "  [Environment]::SetEnvironmentVariable('Path', `"`$userPath;`$env:USERPROFILE\.apidot\bin`", 'User')"
Write-Host ""
