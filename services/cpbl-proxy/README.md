# CPBL Proxy

CPBL 中華職棒大聯盟官網（cpbl.com.tw）的反向代理服務。

## 為什麼需要這個

CPBL 官網用 HiNet CDN，**HiNet CDN 對非台灣 IP 一律回 404**。
博客邦的 API 服務跑在 Zeabur 大阪機房，IP 屬於日本，所以無法直接抓 CPBL 資料。

這個 proxy 跑在 Zeabur 台灣（GCP asia-east1）節點上，把請求中繼到 cpbl.com.tw，
讓正式環境後端能取得 CPBL 排行榜、傷兵、賽程等資料。

## 架構

```
[博客邦 API（Zeabur 大阪）]
        ↓ HTTPS
[CPBL Proxy（Zeabur 台灣 GCP）]  ← 35.234.21.88（台灣 IP）
        ↓ HTTPS
[CPBL 官網（HiNet CDN）]         ← 看到台灣 IP 才會回真實內容
```

## 部署

部署到 Zeabur 台灣節點：

```bash
cd services/cpbl-proxy
npx zeabur@latest deploy --project-id 69eee438337f582ae824393f --service-id 69eee43fe870317d12b39e10
```

- Zeabur Project: `cpbl-proxy` (id `69eee438337f582ae824393f`)
- Server: GCP asia-east1 / e2-small（台灣 IP `35.234.21.88`）
- Service: `cpbl-proxy` (id `69eee43fe870317d12b39e10`)
- 公開網域：`https://cpbl-proxy-jh.zeabur.app`

## 設定後端

在博客邦 API service 設定環境變數：

```
CPBL_PROXY_URL=https://<proxy-url>.zeabur.app
```

後端 `cpbl-stats.service.ts` 自動讀取此變數，不需改 code。

## 測試

```bash
# 健康檢查
curl https://<proxy-url>.zeabur.app/health
# 預期：OK

# CPBL /box 頁面
curl -I https://<proxy-url>.zeabur.app/box
# 預期：200 + HTML（含 __RequestVerificationToken）

# CPBL stats action
curl -X POST 'https://<proxy-url>.zeabur.app/stats/recordallaction' \
  -H "RequestVerificationToken: <token>" \
  -d "Year=2026&KindCode=A&Position=01&SortBy=11&Page=1"
```
