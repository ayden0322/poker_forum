# CPBL Proxy 一次性設定腳本（Windows 桌機）
#
# 使用方式：右鍵此檔案 → 用 PowerShell 執行（需管理員權限）
#
# 此腳本會：
# 1. 下載 cloudflared.exe 到此資料夾
# 2. 引導你登入 Cloudflare（會自動開啟瀏覽器）
# 3. 在 Cloudflare 建立名為 cpbl-proxy 的 tunnel
# 4. 自動設定 DNS：cpbl-proxy.goboka.net → 此桌機
# 5. 把 cloudflared 安裝為 Windows 服務（開機自動啟動）

$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot

Write-Host ""
Write-Host "===== CPBL Proxy Windows 設定腳本 =====" -ForegroundColor Cyan
Write-Host ""

# 0. 確認管理員權限
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "請以「系統管理員」身份執行此腳本（右鍵 PowerShell → 以系統管理員身份執行）" -ForegroundColor Red
    pause
    exit 1
}

# 1. 確認 Node.js 已安裝
Write-Host "[1/6] 檢查 Node.js..."
try {
    $nodeVersion = node --version
    Write-Host "  Node.js 已安裝：$nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "  ⚠ 找不到 Node.js！請先到 https://nodejs.org 下載 LTS 版本安裝後再執行此腳本" -ForegroundColor Red
    Start-Process "https://nodejs.org"
    pause
    exit 1
}

# 2. 下載 cloudflared.exe
Write-Host "[2/6] 下載 cloudflared.exe..."
$cloudflaredPath = Join-Path $ScriptDir "cloudflared.exe"
if (-not (Test-Path $cloudflaredPath)) {
    $url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    Invoke-WebRequest -Uri $url -OutFile $cloudflaredPath
    Write-Host "  下載完成" -ForegroundColor Green
} else {
    Write-Host "  已存在 cloudflared.exe，跳過下載" -ForegroundColor Green
}

# 3. 登入 Cloudflare
Write-Host "[3/6] 登入 Cloudflare（會開啟瀏覽器，請選擇 goboka.net 授權）..."
& $cloudflaredPath tunnel login
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ⚠ Cloudflare 登入失敗" -ForegroundColor Red
    pause
    exit 1
}
Write-Host "  登入成功" -ForegroundColor Green

# 4. 建立 tunnel
Write-Host "[4/6] 建立 cpbl-proxy tunnel..."
$tunnelOutput = & $cloudflaredPath tunnel create cpbl-proxy 2>&1
$tunnelOutput | Write-Host
# 從輸出抓 tunnel ID（格式：Created tunnel cpbl-proxy with id <UUID>）
$tunnelId = ($tunnelOutput -join " " | Select-String -Pattern "with id ([a-f0-9-]{36})").Matches.Groups[1].Value
if (-not $tunnelId) {
    # 可能 tunnel 已存在，從 list 抓 ID
    $listOutput = & $cloudflaredPath tunnel list 2>&1
    $tunnelId = ($listOutput | Select-String -Pattern "([a-f0-9-]{36})\s+cpbl-proxy").Matches.Groups[1].Value
}
if (-not $tunnelId) {
    Write-Host "  ⚠ 抓不到 tunnel ID" -ForegroundColor Red
    pause
    exit 1
}
Write-Host "  Tunnel ID: $tunnelId" -ForegroundColor Green

# 5. 寫 config.yml
Write-Host "[5/6] 寫入 cloudflared 設定..."
$cfDir = Join-Path $env:USERPROFILE ".cloudflared"
$configPath = Join-Path $cfDir "config.yml"
$credentialsPath = Join-Path $cfDir "$tunnelId.json"

@"
tunnel: $tunnelId
credentials-file: $credentialsPath

ingress:
  - hostname: cpbl-proxy.goboka.net
    service: http://localhost:8080
  - service: http_status:404
"@ | Out-File -FilePath $configPath -Encoding utf8
Write-Host "  Config 寫入：$configPath" -ForegroundColor Green

# 設定 DNS（自動）
Write-Host "  設定 DNS：cpbl-proxy.goboka.net → tunnel..."
& $cloudflaredPath tunnel route dns cpbl-proxy cpbl-proxy.goboka.net
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ⚠ DNS 設定失敗（可能已存在）" -ForegroundColor Yellow
} else {
    Write-Host "  DNS 設定完成" -ForegroundColor Green
}

# 6. 安裝為 Windows 服務（開機自啟）
Write-Host "[6/6] 安裝 cloudflared 為 Windows 服務..."
& $cloudflaredPath service install 2>&1 | Out-Null

# 設定 Node.js proxy 開機自啟（Task Scheduler）
$taskName = "CpblProxyNodeServer"
$nodeExe = (Get-Command node).Source
$serverScript = Join-Path $ScriptDir "server.mjs"
$action = New-ScheduledTaskAction -Execute $nodeExe -Argument $serverScript -WorkingDirectory $ScriptDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host "  Node.js proxy 已設定為開機自動啟動（Task Scheduler）" -ForegroundColor Green

Write-Host ""
Write-Host "===== 設定完成！=====" -ForegroundColor Cyan
Write-Host ""
Write-Host "✓ Node.js proxy 已啟動於 :8080（每次開機自動啟動）"
Write-Host "✓ Cloudflare Tunnel 已連線（每次開機自動連線）"
Write-Host "✓ 公開網址：https://cpbl-proxy.goboka.net"
Write-Host ""
Write-Host "請等 30 秒讓 Cloudflare DNS 生效，然後在瀏覽器測試："
Write-Host "  https://cpbl-proxy.goboka.net/health" -ForegroundColor Cyan
Write-Host ""
Write-Host "預期看到：OK"
Write-Host ""
Write-Host "之後完全不用再管，桌機開著就會自動運作。" -ForegroundColor Green
Write-Host ""
pause
