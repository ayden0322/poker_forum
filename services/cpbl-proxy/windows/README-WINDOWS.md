# CPBL Proxy — Windows 桌機部署指南

## 為什麼跑在你家桌機？

CPBL 官網用 HiNet CDN，**對非台灣 ISP（HiNet/中華/遠傳/台灣大）的 IP 一律回 404**。
所有雲端機房（GCP/AWS/Vultr/Azure 等）即使在台灣 region 也屬於 Google/Amazon 等 ASN，被 HiNet 擋。

**唯一可行**：在你家用 HiNet 的設備（如桌機）跑 proxy，透過 Cloudflare Tunnel 暴露到公網。

## 架構

```
[博客邦 API（Zeabur 大阪）]
        ↓ HTTPS
[https://cpbl-proxy.goboka.net]   ← Cloudflare Tunnel
        ↓ 自動連線
[Win10 桌機（HiNet IP）]
        ↓
[cpbl.com.tw] ✅ HiNet ASN 通過
```

## 前置條件

- Win10 / Win11 桌機，24/7 開機
- 接 HiNet 網路
- goboka.net 的 DNS 由 Cloudflare 管理（已確認 ✅）

## 安裝步驟（一次性，約 10 分鐘）

### 1. 安裝 Node.js LTS

到 [https://nodejs.org](https://nodejs.org) 下載 LTS 版本，一直按「Next」安裝完畢。

驗證：開 PowerShell 跑 `node --version`，應顯示 `v22.x.x` 或更新。

### 2. 把這個資料夾複製到桌機

把 `services/cpbl-proxy/windows/` 整個資料夾複製到桌機的 `C:\cpbl-proxy\`。

最後桌機應該有：
```
C:\cpbl-proxy\
  ├── server.mjs
  ├── package.json
  ├── setup.ps1
  └── README-WINDOWS.md（這個檔案）
```

### 3. 執行 setup.ps1（管理員權限）

1. **右鍵 PowerShell** → **「以系統管理員身分執行」**
2. 在 PowerShell 中輸入：
   ```powershell
   cd C:\cpbl-proxy
   .\setup.ps1
   ```

   如果跳出「執行原則」錯誤，先跑：
   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   ```

3. 腳本會自動：
   - 下載 cloudflared.exe
   - **跳出瀏覽器**（請點選 `goboka.net` 授權給 Cloudflare）
   - 建立名為 `cpbl-proxy` 的 tunnel
   - 設定 DNS：`cpbl-proxy.goboka.net` → 此桌機
   - 把 cloudflared 安裝為 Windows 服務（開機自動連線）
   - 把 Node.js proxy 加入 Task Scheduler（開機自動啟動）

4. 出現 `===== 設定完成！=====` 就 OK。

### 4. 驗證

打開瀏覽器到 [https://cpbl-proxy.goboka.net/health](https://cpbl-proxy.goboka.net/health)，應該看到 `OK`。

如果看到 OK，就完成了！告訴 Claude 已完成，Claude 會接手設正式環境環境變數並驗證。

## 常見問題

### Q: setup.ps1 跑到一半失敗？

重新跑一次即可（腳本是 idempotent，可以重複執行）。

### Q: 怎麼知道服務有沒有跑？

開 PowerShell 跑：
```powershell
# 看 cloudflared 服務狀態
Get-Service Cloudflared

# 看 Node.js proxy 是否在跑
Get-Process node
```

### Q: 桌機要重啟一次才生效嗎？

**不用**，setup.ps1 會直接啟動服務。但重啟後也會自動啟動，零維運。

### Q: 想停止這個服務？

```powershell
# 停 cloudflared
Stop-Service Cloudflared

# 停 Node.js proxy
Stop-ScheduledTask -TaskName CpblProxyNodeServer
Get-Process node | Stop-Process

# 永久解除
Unregister-ScheduledTask -TaskName CpblProxyNodeServer -Confirm:$false
sc.exe delete cloudflared
```

### Q: 想改埠號？

編輯 `server.mjs` 第一行 `PORT = 8080`，並改 `~/.cloudflared/config.yml` 的 service URL 同步。

### Q: 桌機沒插網路或停電會怎樣？

正式環境的 CPBL 排行榜會 graceful fallback 顯示「敬請期待」（不會壞畫面）。
桌機恢復連線後資料自動恢復更新。

## 資源占用

- Node.js proxy：~50 MB RAM
- cloudflared service：~30 MB RAM
- CPU：幾乎零（除非有大量請求）
- 網路流量：每天 ~10-50 MB（依後端抓資料頻率）

對任何能跑 Win10 的桌機都不算負擔。
