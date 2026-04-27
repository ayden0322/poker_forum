# CPBL Proxy 自動下載 + 設定 — 一行完成
#
# 使用方式（管理員 PowerShell）：
#   iwr https://raw.githubusercontent.com/ayden0322/poker_forum/main/services/cpbl-proxy/windows/bootstrap.ps1 -OutFile $env:TEMP\boot.ps1; & $env:TEMP\boot.ps1

$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "===== CPBL Proxy Bootstrap =====" -ForegroundColor Cyan
Write-Host ""

# 0. 確認管理員權限
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "請以「系統管理員」身份執行此腳本（右鍵 PowerShell → 以系統管理員身份執行）" -ForegroundColor Red
    pause
    exit 1
}

# 1. 建目錄
$installDir = "C:\cpbl-proxy"
Write-Host "[1/3] 建立資料夾 $installDir..."
if (-not (Test-Path $installDir)) {
    New-Item -ItemType Directory -Path $installDir | Out-Null
}
Set-Location $installDir
Write-Host "  完成" -ForegroundColor Green

# 2. 從 GitHub 下載最新檔案
Write-Host "[2/3] 從 GitHub 下載檔案..."
$baseUrl = "https://raw.githubusercontent.com/ayden0322/poker_forum/main/services/cpbl-proxy/windows"
$files = @("server.mjs", "package.json", "setup.ps1")
foreach ($file in $files) {
    Write-Host "  下載 $file..."
    Invoke-WebRequest -Uri "$baseUrl/$file" -OutFile (Join-Path $installDir $file) -UseBasicParsing
}
Write-Host "  下載完成" -ForegroundColor Green

# 3. 執行 setup.ps1
Write-Host "[3/3] 開始執行 setup.ps1（會引導你登入 Cloudflare）..."
Write-Host ""
& "$installDir\setup.ps1"
