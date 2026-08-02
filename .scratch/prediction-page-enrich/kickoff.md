# 競猜頁面豐富化 — 開工進度

**風險檔位**：重（讓分盤動到結算＝命脈；幸運輪盤與已拍板設計鐵律衝突；多聯盟開通＝API 月費）
**Tracker**：GitHub issue（`ayden0322/poker_forum`）
**最後更新**：2026-08-02

## 接手盤點（2026-08-02）

**進場點**：階段 1（需求）——業主只給兩張 GPT 生成參考圖，無文字規格。
整個專案的管理基建則卡在階段 3（此次已補齊 tracker 設定）。

**沿用，不重跑**：
- `P幣競猜系統-詳細設計規格.md`（330 行，2026-07-07 拍板）——底層帳務／賠率管線／結算全部照它做完並上線。
  ⚠️ 但 §10 的「✅ 全部完成」是 7/07 的快照，之後至少 8 個 commit 改了它的前提
  （板塊改吃後台 sports_configs、世界盃下線、榮譽計分去重）。**當目標架構讀，別當現況讀。**

**⚠️ 定案可能被推翻的地方**：
- 舊定案 §7.5「去賭場化三鐵律」：不用「下注／投注／派彩」語彙、無 confetti 無金光、輸贏色青綠/中性灰。
- 業主新圖：「立即投注」「投注點數」「幸運輪盤（每日免費抽獎）」「+10/+50/+100/+500/+1000 快速加碼」。
- **這是產品定位反轉，不是視覺調整。未經 Ayden 拍板不得實作。**

**分支殘骸已釐清（結案，別再查）**：
| 分支 | 結論 |
|---|---|
| `feat/promo-referral-tracking`（75 筆） | 工作已全在 main（main 超越它 10,543 行）。唯一獨有：`會員系統-上線手冊.md` |
| `feat/basketball-leagues-expansion`（2 筆） | 工作已全在 main（超越 19,201 行）。籃球 23 聯賽設定都在 `sports.config.ts` |
當時走「乾淨分支自 origin/main 重做」，所以 commit hash 對不上但內容都進去了。

## 階段進度
- [ ] 0 盤點接手 — ✅ 完成，補基建進行中
- [ ] 1 需求 — 待開始（用 grilling 把兩張圖擠成文字規格）
- [ ] 2 選路 — 待開始（圓桌專攻三個方向級衝突）
- [ ] 3 落票
- [ ] 4 開工
- [ ] 5 複審
- [ ] 6 交接

## 補基建進度（2026-08-02）
- [x] 分支殘骸調查 → 兩條都是殘骸，工作已在 main
- [x] `docs/agents/issue-tracker.md` 建立（GitHub issue 模式）
- [x] `.gitignore` 補臨時腳本（`_grant-p.ts` 這類能發點數的腳本不再有誤 commit 風險）；未追蹤檔 25 → 6
- [x] auto-memory 更新（原本停在 33 天前的「進行中 = Lottie 頭像框」，會誤導接手）
- [x] 本狀態檔建立
- [ ] 待 Ayden 拍板：刪 20 條已 merge 分支 + 2 條殘骸分支
- [ ] 待 Ayden 拍板：`design-assets/`、`three-ball-*.png` 進不進版控

## ✅ 已實測定案：大小分／讓分盤的資料源（2026-08-02）

**業主原話**：「我覺得競猜畫面，顯示有點單薄，希望看能不能多加一點資訊，還有競猜的選項」
→ 「多加競猜的選項」是真需求，不是 GPT 填充。幸運輪盤／快速加碼／「立即投注」語彙業主一個字都沒提。

**根因**：正式站只開 kbo/mlb/npb 三個棒球聯盟，且 `prediction_markets` 全部只有 `["WINLOSE"]`、
實測 `overUnder: []`。**每場比賽只有「主勝／客勝」兩顆按鈕**——這就是「單薄」的真相。

**根因的根因**：我們挑的莊家 WilliamHill(22) 是唯一只開勝負盤的那家。實測 API-Sports 同一支
endpoint 底下 13 家莊家：

| 莊家 | 勝負 | 大小分 | 讓分(Asian Handicap) |
|---|---|---|---|
| ★22 WilliamHill（現用） | ✅ | ❌ | ❌ |
| 4 Pinnacle（建議換這家） | ✅ | ✅ | ✅ |
| 2 Bet365 / 1 1xbet / 5 SBO / 10 Marathon / 11 Unibet / 13 Betfair / 28 Betano / 29 Superbet / 30 BetVictor | ✅ | ✅ | ✅ |

MLB／KBO／NPB **三個聯盟都成立**。→ **不必換賠率供應商、不必多花錢**（The Odds API $29~$99/月、
SportsGameOdds $99~$499/月、OpticOdds $5000+/月 全部不需要）。

**驗證證據**（`apps/api/src/predictions/pinnacle-verify.spec.ts`，含反向證明）：
- Pinnacle(4)：MLB/KBO/NPB 全綠，KBO 解出 444 筆、NPB 284 筆大小分報價
- WilliamHill(22)：三聯盟大小分全部 0 筆，測試全紅 ← 反向證明，測試確實有效
- **現有 `odds-parsers.ts` 零改動即可解析** Pinnacle 的 `Over 8` / `Under 8.5` 格式

**讓分盤工期修正：原估 1~2 週 → 3~5 天**。因為實測讓分線只有整數與 .5
（`-3,-2.5,-2,-1.5,-1,+1,+1.5,+2,+2.5,+3`），**無 0.25/0.75 半球盤**，不必處理「贏一半輸一半」
的拆單結算。整數盤走水退本金 = 照抄現有大小分的 PUSH 邏輯。

**執行方式**：Ayden 選 B —— 先在本機 Docker 驗證再上正式站。

### 踩坑備忘
- 專案路徑含中文（`SEO專案/博弈論壇`）會讓 Docker BuildKit 掛掉：
  `header key "x-docker-expose-session-sharedkey" contains value with non-printable ASCII characters`。
  繞法：`DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0`。但接著會撞 Alpine apk TLS 失敗，
  故改為「DB/Redis/MinIO 跑 Docker、API 跑本機」的混合模式驗證。
- `apps/api` 沒有 tsx／ts-node，只有 jest（`jest.config.js` rootDir=src、testMatch `**/*.spec.ts`）。
  一次性驗證要寫成 spec 跑，不能寫成 .ts 腳本。

## ✅ 已實作（2026-08-02，Ayden 選 A：字典與換莊家一起上）

**1. 板塊中文名改由後端供應**（治本，不是補字典）
- `sports_configs.display_name` 本來就存著中文名，前端卻自己寫死一份 `BOARD_LABEL`，
  只有 `world-cup`／`mlb` 兩筆 → 後台每開一個聯盟就漏一個，kbo/npb 因此裸吐 slug。
- 改：`PredictionBoardConfig` 加 `displayName` → `/predictions/boards` 回傳 → 前端刪掉寫死表。
- **以後後台開新聯盟，前台自動有中文名，不用再改前端。**

**2. KBO 10 隊 + NPB 12 隊中文名與隊徽**
- 前端 `lib/team-meta.ts`、後端 `team-display.ts`（結算通知用）雙邊都補。
- key 一律用 API-Sports `/teams` 的原始字串。**NPB 是縮寫格式**（`Fukuoka S. Hawks`、
  `Rakuten Gold. Eagles`），寫全名會對不上。
- `TeamLabel` 加 `apiSportsId` → 隊徽走 `media.api-sports.io/baseball/teams/{id}.png`
  （與 MLB 走 mlbstatic 同慣例）。

**驗證證據**：
- API/Web tsc 全綠；`npx jest` **116 passed**（3 skipped = 預設關閉的莊家實測）
- `NEXT_DIST_DIR=.next-verify next build` 成功，29 頁全過（用 distDir 分離，不污染 dev 的 .next）
- 瀏覽器實測：分類顯示「韓國職棒／MLB／日本職棒」、隊名「KT巫師 vs 韓華鷹」「樂天巨人 vs 三星獅」
  含隊徽、每場 4 格盤口、console 零錯誤

**過程中的額外發現**：
- `prediction_matches.api_status` 實際值是 `IN4`／`IN5`／`IN8`（進行中第幾局）與 `POST`（延期）。
  → **圖二右欄那個「5局下」的即時局數資料已經在 DB 裡了**，不需要另外開發資料源。
- 封盤邏輯經實測正確：UTC 09:00 開打的 KBO 場次在 10:35 已不出現在盤上。

## 上線進度（2026-08-02）

- [x] PR #26 已合併進 main（commit `c21719f`）
- [x] Zeabur **自動部署完成**（服務類型 PREBUILT_V2，CLI 查不到 deployment 記錄，
      改用「正式站 API 是否回傳新欄位 displayName」判斷 → 已回傳＝已部署）
- [x] 正式站分類中文名、KBO/NPB 中文隊名＋隊徽已生效
- [ ] **剩最後一步**：後台 `/sports-settings` 把 mlb / kbo / npb 三筆改
      `bookmakerId: 22 → 4`、`predictionMarkets` 加 `OVER_UNDER`
      → 走後台而不是 SQL，因為 `PUT /:boardSlug` 有 RBAC 與審計 log
      → 改完 5 分鐘內 cron 會抓進大小分，前台自動變 4 格
      → 要還原就改回 `22` + `['WINLOSE']`

## 待拍板（階段 1／2 要處理）
1. **去賭場化鐵律要不要放棄**（幸運輪盤、快速加碼鍵、「投注」語彙）——決定產品定位
2. **讓分盤排第幾期**——動結算＝命脈，要走 dual-dev 命脈雙寫
3. **開哪幾個聯盟**——聯盟設定已齊，但每開一個＝API 月費，且休賽期分類會是空的

## 已知技術缺口（做之前要補）
- web 端 **0 測試**，改的正是 `PredictionsClient.tsx`(432行) / `BetSlip.tsx`(320行)。
  BetSlip 那套「賠率變動強制 acknowledge」是拿真點數在賭的，最容易被順手改壞。
- 圖上這些欄位後端目前沒有：參與人數、熱度、討論數、專家分析數、即時比分。
- `PredictionMarket` enum 只有 `WINLOSE` / `OVER_UNDER`，無讓分盤。
- `Follow` 只能追蹤「人」，不能追蹤球隊／賽事（圖上「只看我追蹤的」需要新表）。

## 下一步
跑階段 1：用 `mattpocock-skills:grilling` 把兩張圖逐題擠成文字規格，先解決上面三個待拍板。
