# MLB 開發經驗報告 — NBA 接續開發指南

> **用途：** 給下一個 Claude Code session 的交接文件，包含 MLB 開發過程中的關鍵決策、踩坑紀錄、以及可直接複用於 NBA 的架構經驗。
>
> **撰寫日期：** 2026-04-16
> **專案路徑：** `/Users/ayden_huang/Documents/SEO專案/博弈論壇`

---

## 一、最重要的經驗：善用官方免費 API

### 背景
本專案原本全部仰賴 **API-Sports**（`api-sports.io`）作為資料來源。但 API-Sports 的棒球（Baseball）模組在免費方案下資料非常有限，且 NBA 的 Basketball 模組目前**尚未開通 Pro 版本**。

### 關鍵突破
在開發 MLB 功能時，發現 **MLB 官方提供完全免費、無需 API Key 的 Stats API**：

```
Base URL: https://statsapi.mlb.com/api/v1
```

這個 API 資料齊全度遠超 API-Sports，包含：
- 即時比分、逐球資料（Game Feed）
- 完整球員統計（打擊、投球、生涯）
- 球隊陣容、排行榜
- 交易與傷兵紀錄
- 歷史對戰記錄

### NBA 的啟示：優先尋找官方免費資源

NBA 同樣有官方（或半官方）的免費資料端點，建議優先調查：

| 資源 | URL | 說明 |
|------|-----|------|
| **NBA Stats API** | `https://stats.nba.com/stats/` | NBA 官方統計，資料最完整，但有 referer/user-agent 限制 |
| **data.nba.net** | `https://data.nba.net/prod/v1/` | 較舊但穩定的 JSON endpoint |
| **cdn.nba.com** | `https://cdn.nba.com/static/json/` | 靜態 JSON，賽程/standings |
| **balldontlie.io** | `https://api.balldontlie.io/v1/` | 第三方免費 API，有 rate limit 但資料夠用 |

**重點：不要一開始就受限於 API-Sports 的付費方案，先確認官方有沒有免費資源可用。**

---

## 二、雙 API 整合策略（已驗證可行）

MLB 的最終架構是 **API-Sports + 官方 API 雙軌並行**：

```
API-Sports (付費)          MLB Stats API (免費)
    │                           │
    ├─ 球隊清單初始化            ├─ 即時比分、賽程
    ├─ 統一的聯賽/球隊 ID        ├─ 詳細統計數據
    └─ 跨運動統一介面            ├─ 球員/陣容/排行
                                ├─ 交易/傷兵
                                └─ 歷史對戰
```

### ID 對應機制
兩套 API 的球隊 ID 不同，需要建立映射：
- 存在 `Translation` 表的 `extra` JSON 欄位：`{ mlbStatsTeamId: 147 }`
- 透過球隊英文名模糊匹配自動建立
- Controller 層負責轉換，Service 層各自使用對應 ID

### NBA 可沿用此模式
如果最終 NBA 也採用「API-Sports + 官方 API」雙軌，`Translation.extra` 欄位已支援擴展，例如 `{ nbaStatsTeamId: "1610612747" }`。

---

## 三、已建好的共用基礎設施（可直接複用）

以下模組是**跨運動共用**的，NBA 開發時不需重建：

### 3.1 翻譯系統 (`apps/api/src/translation/`)
- **Claude Haiku 驅動**，自動翻譯球隊/球員名為台灣繁體中文
- 支援 `entityType`: team / player / league / coach / venue / country
- 支援 `sport`: football / basketball / baseball（加 NBA 只需傳 `basketball`）
- 已有成本追蹤（`TranslationUsage` 表），每月花費一目了然
- 已有 Cron 每小時自動掃描未翻譯實體

### 3.2 Redis 快取層 (`apps/api/src/common/redis.service.ts`)
- `get<T>` / `set` / `del` 已封裝完成
- TTL 常數已定義（`CACHE_TTL`），NBA 可直接套用

### 3.3 後台管理 (`apps/admin/`)
- 翻譯管理頁：列表、編輯、批次翻譯、CSV 匯出、可疑偵測
- 運動設定頁：啟用/停用聯賽、調整快取 TTL
- 一鍵播種（Seed）UI：進度追蹤、成本預估

### 3.4 前端共用元件
- `ScoreWidget`：三欄佈局（昨日/今日/明日），已支援多運動
- 首頁自動隱藏未啟用的分類

---

## 四、MLB 開發的分階段策略（建議 NBA 複製）

MLB 是分 Phase 推進的，事實證明這個節奏很好：

| Phase | 內容 | 耗時 | 說明 |
|-------|------|------|------|
| **Phase 1** | 翻譯基礎建設 | — | TranslationService + 字典 + Cron |
| **Phase 1.5** | 整合官方 Stats API | — | 發現免費資源後立即切換 |
| **Phase 2** | 球員個人頁 + 排行榜 | — | 有統計數據後才有內容 |
| **Phase 3** | 球隊主頁 + 歷史對戰 + 統計 | — | 進階功能 |
| **Phase D1** | 傷兵動態邊欄 | — | 字典翻譯，零 AI 成本 |
| **最後** | 台灣時區適配 + LIVE 提示 | — | UX 打磨 |

### NBA 建議的 Phase 規劃
1. **Phase 0**：確認 NBA 免費 API 來源，寫 PoC 確認可用性
2. **Phase 1**：建立 `nba-stats.service.ts` + `nba-stats.controller.ts`
3. **Phase 2**：球隊/球員頁面 + 翻譯播種
4. **Phase 3**：即時比分 Widget + 台灣時區
5. **Phase 4**：排行榜、對戰、傷兵

---

## 五、踩坑紀錄與解法

### 5.1 路由衝突（500 錯誤）
**問題：** NestJS 路由 `/mlb/teams/:teamId` 和 `/mlb/teams` 的順序問題，導致 `teams` 被當成 `teamId` 參數。
**解法：** 確保靜態路由（`/teams`）在動態路由（`/teams/:id`）之前註冊，或使用更明確的路徑。

### 5.2 Seed 阻塞導致 Token 過期
**問題：** 播種 30 支球隊 × 每隊陣容翻譯，整個 HTTP 請求超過 Zeabur 的 timeout。
**解法：** 改為非同步背景執行（fire-and-forget），提供獨立的 `/status` GET 端點追蹤進度。

### 5.3 時區陷阱
**問題：** MLB 官方 API 回傳的日期是美東時間，台灣使用者看到的「今日比賽」可能差一天。
**解法：** 新增 `/mlb/schedule/tw` 端點，以台灣日期為基準，自動查詢跨日的美東日期範圍。前端也使用 `Asia/Taipei` 時區格式化。

### 5.4 API-Sports 免費方案限制
**問題：** 免費方案的即時比分查詢（live）不可用，帶完整 query 會回傳空陣列。
**解法：** 即時比分改為只帶 `date` 參數查詢當天賽程，從回傳的 `status` 欄位判斷比賽狀態。

### 5.5 tsc 編譯錯誤
**問題：** `seed.ts` 不在 `tsconfig.json` 的 `rootDir` 範圍內，導致編譯失敗。
**解法：** 在 `tsconfig.json` 排除 seed 檔案，或將 seed 邏輯內建到 API controller。

### 5.6 cachedCall 泛型推斷
**問題：** 通用快取函式的泛型推斷讓 `.filter()` 的回傳型別變成 `never[]`。
**解法：** 明確標註泛型參數，或在呼叫端做 type assertion。

---

## 六、檔案結構參考（NBA 可照搬目錄結構）

```
apps/api/src/sports/
├── sports.config.ts              ← 共用配置 + TTL（已有）
├── sports.controller.ts          ← 通用路由（已有）
├── sports.service.ts             ← API-Sports 通用服務（已有）
├── mlb-stats/                    ← ⭐ MLB 專屬模組（參考用）
│   ├── mlb-stats.module.ts
│   ├── mlb-stats.service.ts      ← 核心：API 呼叫 + 快取
│   ├── mlb-stats.controller.ts   ← 路由 + 翻譯整合
│   ├── mlb-seed.controller.ts    ← 一鍵播種
│   └── mlb-injury-dict.ts        ← 傷兵字典翻譯
└── nba-stats/                    ← 🆕 NBA（待建立）
    ├── nba-stats.module.ts
    ├── nba-stats.service.ts
    ├── nba-stats.controller.ts
    ├── nba-seed.controller.ts
    └── nba-injury-dict.ts        ← NBA 傷兵字典

apps/web/src/components/sports/
├── ScoreWidget.tsx               ← 共用（已有）
├── mlb/                          ← MLB 元件（參考用）
│   ├── MLBGamesWidget.tsx
│   ├── InjuriesWidget.tsx
│   ├── HeadToHeadBlock.tsx
│   └── LeadersSidebar.tsx
└── nba/                          ← 🆕 NBA（待建立）
    ├── NBAGamesWidget.tsx
    ├── InjuriesWidget.tsx
    ├── HeadToHeadBlock.tsx
    └── LeadersSidebar.tsx

apps/web/src/app/
├── match/mlb/[gamePk]/           ← MLB 比賽頁（參考用）
├── team/mlb/[teamId]/
├── player/mlb/[playerId]/
├── match/nba/[gameId]/           ← 🆕 NBA（待建立）
├── team/nba/[teamId]/
└── player/nba/[playerId]/
```

---

## 七、快取 TTL 建議（NBA 適用）

| 資料類型 | TTL | 理由 |
|----------|-----|------|
| 球隊基本資料 | 86400s (24h) | 一季很少變 |
| 球員基本資料 | 86400s (24h) | 同上 |
| 陣容名單 | 3600s (1h) | 交易截止前可能變動 |
| 排行榜/統計 | 3600s (1h) | 每天更新 |
| 賽程（非比賽日） | 300s (5min) | 偶爾有延賽/改時間 |
| 即時比分（台灣時間） | 30s | 比賽進行中需要快速刷新 |
| 單場比賽資料 | 60s | Live 資料 |
| 傷兵/交易 | 3600s (1h) | 變動不頻繁 |

---

## 八、翻譯 Prompt 經驗

### 有效的 Prompt 結構
```
你是專業的運動翻譯員，負責將{運動}的{實體類型}英文名稱翻譯為**台灣繁體中文慣用譯名**。
- 使用台灣媒體常用譯名（非中國大陸譯名）
- 球隊提供簡稱（2-3 字），例如「洛杉磯湖人」簡稱「湖人」
- 球員提供暱稱（如有），例如 LeBron James 暱稱「詹皇」
回傳 JSON 格式：{ "1": { "name": "完整中文名", "short": "簡稱", "nickname": "暱稱" } }
```

### 注意事項
- 指定「台灣繁體中文」很重要，否則可能產出中國大陸譯名
- 批次翻譯每次不超過 50 個，避免 token 過長截斷
- 使用 Haiku 模型即可，成本約 $0.33 / 全聯賽（30 隊 + 全部球員）

---

## 九、給下一個 Claude Code 的行動建議

1. **先做 API 調研**：花 10 分鐘確認 NBA 有哪些免費 API 可用，不要直接用 API-Sports
2. **複製 MLB 模組結構**：`mlb-stats/` → `nba-stats/`，改端點和欄位名即可
3. **翻譯系統零改動**：直接傳 `sport: 'basketball'` + `entityType: 'team'/'player'`
4. **時區問題更簡單**：NBA 也在美國打，時區邏輯可直接沿用
5. **傷兵字典需新建**：NBA 的傷勢描述用語不同（ACL、Achilles 等），需建新字典
6. **優先建立 ID 對應**：如果同時用兩套 API，第一步就建好 ID mapping

---

## 十、專案技術棧速覽

| 層級 | 技術 |
|------|------|
| **Monorepo** | pnpm workspace + Turborepo |
| **API** | NestJS (TypeScript) |
| **Web** | Next.js (App Router) + React Query |
| **Admin** | Next.js (App Router) |
| **DB** | PostgreSQL + Prisma ORM |
| **Cache** | Redis |
| **翻譯** | Claude Haiku 4.5 (Anthropic API) |
| **部署** | Zeabur (Docker) |
| **外部 API** | API-Sports + MLB 官方 Stats API |
