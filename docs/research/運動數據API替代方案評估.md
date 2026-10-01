# 運動數據 API 替代方案評估（博客邦 goboka.net）

- 查詢日期：2026-09-30（所有價格都是這天在官方頁面看到的，幣別另外標示）
- 調查者：Claude（研究員角色，只讀調查，沒有改程式）
- 證據等級：L0～L1。這份是讀官方頁面和打幾支公開測試請求得出的調查，**沒有**實際付費、串接或壓測任何一家。
- 標記方式：✅ 官方來源找得到｜⚠️ 部分支援或有但條件受限｜❌ 官方來源明確沒有／沒列出｜? 未確認（官方沒公開、要詢價，或頁面擋爬蟲讀不到）

---

## 1. 結論（先看這段）

**目前找不到一家「比 API-Sports 更全面、又買得起」的替代品。問題不是 API-Sports 涵蓋太少，而是我們用的是免費方案。** 打個比方：現在拿的是試吃包，不是店裡沒這道菜。API-Sports 官方覆蓋表明確列出台灣 CPBL，也有日職、韓職、MLB、墨西哥聯盟。付費方案是**每種運動分開買**：棒球 PRO 每月 US$15、籃球 US$15、足球 US$19，三種加起來大約 **US$49/月**，換到的是每種運動每天 7,500 次請求，而且付費方案可以存取全部賽事。這是目前最划算的解法。

API-Sports 真正的缺口有三個：
1. **CPBL 和墨西哥聯盟沒有賠率**。覆蓋表上這兩個聯盟的 Odds 欄是「-」。
2. **棒球 API 沒有球員和傷兵端點**，只有球隊、戰績、比賽、賠率。
3. **授權條款明講不給資料的發佈授權**，而且博弈平台可能要另外向聯盟等權利人取得授權。

依預算分成三級：

| 預算 | 建議組合 | 大約月費 | 白話說明 |
|---|---|---|---|
| **省錢方案** | API-Sports PRO（棒球＋籃球＋足球）＋ 維持現有官方免費源（TPBL 官方 API、CPBL 官網） | ≈ US$49 | 先把「拿不到當季資料」解決。每天 7,500 次請求對論壇夠用。CPBL 賠率先維持 P 幣自訂盤口。 |
| **主力方案** | 上面那組 ＋ The Odds API（US$30～59）補 NPB/KBO/MLB/NBA/足球賠率 ＋ Goalserve 先開 30 天免費試用，驗證 CPBL 即時比分與賠率 | ≈ US$79～110，如果 Goalserve 正式採用，另加 US$100～800 | 用兩家資料源互相備援。Goalserve 官方覆蓋表有列 CPBL，是少數能當第二來源的供應商。 |
| **企業級** | Sportradar（Global Baseball 有 NPB/KBO，CPBL 至少有場館資料），或 Data Sports Group（官方頁列出 CPBL） | 全部要詢價 | 資料最深、有官方授權管道，但價格不公開，也是 B2B 合約制。論壇現在的規模用不到。 |

**MLB 官方 Stats API 不能拿來商用補強**：官方聲明寫明只允許個人、非商業、非大量使用，商用要取得 MLBAM 的書面授權。

---

## 2. 需求 × 供應商比對總表

### 2a. 聯賽覆蓋

| 供應商 | CPBL | NPB | KBO | MLB | 墨西哥 LMB | NBA | P.League+/TPBL | 歐洲籃球 | 足球五大＋歐冠/歐霸 | J 聯賽 | K 聯賽 | 世界盃/資格賽 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **API-Sports（基準）** | ✅ [1] | ✅ [1] | ✅ [1] | ✅ [1] | ✅ [1] | ✅ [R] | ✅ [R] | ✅ [R] | ✅ [R] | ✅ [R] | ? | ✅ 世界盃 [R]／資格賽 ? |
| Sportradar | ⚠️ 只確認有場館資料 [10] | ✅ [11] | ✅ [11] | ✅ [11] | ? | ? | ? | ? | ? | ? | ? | ? |
| Genius Sports | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| Stats Perform (Opta) | ? | ? | ? | ? | ? | ? | ? | ? | ✅ 足球為主 [14] | ? | ? | ? |
| SportsDataIO | ❌ 未列 [16] | ❌ 未列 [16] | ❌ 未列 [16] | ✅ [16] | ❌ 未列 | ✅ [16] | ❌ 未列 | ❌ 未列 | ⚠️ 試用只有歐冠 [17] | ? | ? | ? |
| Sportmonks | ❌ 只做足球 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ [18] | ✅ [20] | ? | ? |
| TheSportsDB | ⚠️ 有，群眾維護 [22] | ✅ [22] | ✅ [22] | ✅ | ? | ✅ | ⚠️ 只找到 SBL [22] | ? | ✅ | ? | ? | ? |
| Goalserve | ✅ [25] | ✅ [25] | ✅ [25] | ✅ [24] | ✅ [25] | ✅ [24] | ❌ 未列 [25] | ? | ⚠️ 歐霸 ✅ [26]，其餘 ? | ? 覆蓋頁沒看到 | ? | ? |
| Entity Sport | ❌ 未列 [28] | ✅ [28] | ✅ [28] | ✅ [28] | ❌ 未列 | ✅ [28] | ? | ? | ✅ [28] | ? | ? | ? |
| The Odds API（只有賠率） | ❌ 未列 [30] | ✅ [30] | ✅ [30] | ✅ [30] | ❌ 未列 | ✅ [30] | ❌ 未列 | ⚠️ 只有 Euroleague [30] | ✅ [30] | ✅ [30] | ✅ [30] | ✅ 歐洲、南美資格賽 [30] |
| BetsAPI | ? 頁面擋爬蟲 | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| SportDevs | ? 官網 DNS 解析失敗 [34] | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| Highlightly | ❌ 棒球只有 MLB＋NCAA [35] | ❌ | ❌ | ✅ [35] | ❌ | ✅ [35] | ? | ✅ Euroleague/ACB [35] | ✅ [35] | ? | ? | ? |
| balldontlie | ❌ 未列 [36] | ❌ | ❌ | ✅ [36] | ❌ | ✅ [36] | ❌ | ❌ | ✅ 五大＋歐冠 [36] | ❌ 未列 | ❌ 未列 | ✅ 世界盃 [36] |
| MLB Stats API（官方） | ❌ | ⚠️ 有分類但 2026 年 0 場 [38] | ⚠️ 有分類但 2026 年 0 場 [38] | ✅ [38] | ✅ 2026 年 1,048 場 [38] | — | — | — | — | — | — | — |
| Data Sports Group | ✅ [40] | ✅ [40] | ✅ [40] | ✅ [40] | ? | ✅ [41] | ? 未列 [41] | ✅ Euroleague [41] | ? | ? | ? | ? |
| iSports API | ❌ 首頁只列足球和籃球 [42] | ❌ | ❌ | ❌ | ❌ | ? | ? | ? | ✅ 2,000+ 足球聯賽 [42] | ? | ? | ? |
| Sofascore / FlashScore | 條款禁止爬取 [44][45] | — | — | — | — | — | — | — | — | — | — | — |

> [R]＝本專案程式實際使用的 API-Sports 聯賽 ID（`apps/api/src/sports/sports.config.ts`：NBA=12、P.League+=403、TPBL=427、Euroleague=120、英超=39、歐冠=2、J 聯賽=98、世界盃=1）。這是「專案裡已經在呼叫」的證據，不是官方覆蓋表的截圖。另外 `籃球聯賽補齊計畫-能力驅動板塊系統.md` 有記錄 P.League+ 本季 57 場。K 聯賽、歐霸、世界盃資格賽，本次沒有在 API-Sports 覆蓋頁逐頁查證。

### 2b. 資料深度與商業面

| 供應商 | 即時比分延遲 | 棒球逐局＋H/E | 球員數據 | 傷兵 | 賠率（大小／讓分） | 可以公開商用 | 博弈用途 | 價格公開 | 免費試用 |
|---|---|---|---|---|---|---|---|---|---|
| **API-Sports** | 棒球每 15 秒 [3] | ✅ innings/hits/errors [3] | ⚠️ 棒球沒有 players 端點 [3]；足球、籃球有 [R] | ⚠️ 棒球沒有；足球有 [R] | ⚠️ NPB/KBO/MLB ✅，CPBL/LMB ❌ [1] | ⚠️ 不提供發佈授權 [4] | ⚠️ 條款寫博弈平台「可能需要」權利人授權 [4] | ✅ [1][2] | 免費 100 次/天，賽季受限 |
| Sportradar | Live Timelines Delta 每 10 秒 [11] | ✅「有的話」提供逐局 [11] | ? | ? | ⚠️ 機率是加購 [11] | 需合約 | 需合約 | ❌ 需詢價 | 有 Trial（Marketplace）[12] |
| Genius Sports | 官方只說「超低延遲」[13] | ? | ? | ? | ✅ 有 Odds 產品 [13] | 需合約 | 目標客戶含博弈 [13] | ❌ 需詢價 | ? |
| Stats Perform | ? | ? | ✅ | ? | ? | 需合約 | ? | ❌ 需詢價 [14] | ❌ 沒看到自助方案 |
| SportsDataIO | ? | ✅ MLB | ✅ | ✅ | ✅ 有 Odds API | 條款沒寫細節 [15] | 條款沒提 [15] | ❌ 官網沒找到公開價 | ✅ 有試用 [17] |
| Sportmonks | 秒級（官方行銷頁用語） | — | ✅ | ✅ | ✅ 加購 €24/月 [18] | ✅ 可以用來賺錢，但不能轉賣 [19] | 條款只寫不負責輸贏 [19] | ✅ | ✅ 14 天 [18] |
| TheSportsDB | 付費版 2 分鐘，只限足球/NFL/NBA/MLB/NHL [21] | ? | ⚠️ | ❌ | ❌ | ✅ 可以，但付費用戶要標示來源 [23] | 條款沒提 | ✅ | 免費 key |
| Goalserve | 2～4 秒（官網首頁）[27] | ✅ MLB box score [24] | ✅ | ✅ 足球 [27] | ✅ 賽前＋走地，全套方案 [24] | ? 條款頁找不到 | 官網把博弈 App 列成使用情境 [27] | ✅ | ✅ 30 天 [24] |
| Entity Sport | ? | ? | ? | ? | ? | ? 條款頁 404 | ? | ✅ [28] | 官網沒寫 |
| The Odds API | 比分約 30 秒 [31] | ❌ | ❌ | ❌ | ✅，但讓分/大小「主要是美國運動」[31] | ✅ 可以 [32] | ✅ 推廣博弈要加負責任博弈警語 [32] | ✅ [29] | 每月 500 credits 免費 |
| BetsAPI | 走地每 3～5 秒 [33] | ? | ? | ? | ✅ 來自 bet365 等博彩公司 [33] | ? 條款頁擋爬蟲 | ? | ✅ [33] | US$1～8 的短期試用 [33] |
| Highlightly | 「接近即時」[35] | ? | ✅ MLB | ? | ✅ 只有付費方案 | ? | ? | ✅ 起價 US$5.99 [35] | 100 次/天 [35] |
| balldontlie | 「即時」 | ? | ✅ | ? | ✅ 美國博彩公司 [36] | ✅ [37] | ✅ 明文允許合法博彩產品 [37] | ✅ [36] | 5 次/分 |
| MLB Stats API | 即時 | ✅ | ✅ | ✅ | ❌ | ❌ 只能非商業 [39] | ❌ | 免費 | — |
| Data Sports Group | ? | ? | ✅ | ? | ? | ? | ? | ❌ 需詢價 [40] | 要聯絡業務 [40] |
| iSports API | ? | ❌ | ✅ 足球 | ✅ 足球/籃球 [42] | ✅ 賽前/走地/歷史 [42] | ? | ? | ⚠️ 起價 US$49 [42] | ✅ [42] |

---

## 3. 各家簡介

### 3.1 API-Sports（基準，現用）
- **涵蓋**：棒球 77 個聯賽、20 年資料、30 家博彩公司 [1]。官方覆蓋表的「Taiwan」區列出 **CPBL** 和 **CPBL Minor League**，Schedule、Historical、Standings 都打勾，**Odds 是「-」**。NPB、KBO、MLB 四欄全打勾。墨西哥 LMB/LMP 沒有賠率 [1]。
- **深度**：棒球只有 Timezone、Seasons、Countries、Leagues、Teams、Standings、Games、Odds 這幾個端點，**沒有 Players 和 Injuries** [3]。Games 裡有 `innings`、`hits`、`errors`，文件寫「Games are updated every 15 seconds」[3]。
- **價格**（1 個月方案，USD）[1][2]：

  | 方案 | 每日請求 | 棒球 | 籃球 | 足球 |
  |---|---|---|---|---|
  | Free | 100 | 0 | 0 | 0 |
  | PRO | 7,500 | 15 | 15 | 19 |
  | ULTRA | 75,000 | 25 | 25 | 29 |
  | MEGA | 150,000 | 35 | 35 | 39 |

  - 每種運動分開訂閱，額度每天 00:00 UTC 重置，用不完不累積。官網寫最高可以談到每天 150 萬次 [1]。
  - 官網原文：「All our paid plans give you access to all endpoints and all competitions」[1]。
  - 在官方 dashboard 訂閱屬於預付，**不能退款**；升級後**不能降級**；到期會自動回到免費方案 [4]。
- **授權**（條款最後更新 2025-05-21）[4]：
  - 禁止轉賣資料，可以用來做 App 或網站。
  - 「We do not provide a "license" for the use and publication of the data」：不提供發佈授權，要由使用者自己向權利人取得。
  - 用於 betting platforms、fantasy 等用途，「may require additional licenses from the relevant rights holders」。
  - 隊徽和圖片只供識別用途，API-Sports 不擁有這些圖的權利。
  - 如果聯盟、協會正式投訴，可以立即停權，而且不退款。
- **優點**：價格最低、覆蓋最符合我們的需求（CPBL＋日韓＋台灣籃球），專案已經串好。
- **缺點**：CPBL 沒有賠率、棒球沒有球員和傷兵資料、沒有 SLA、不提供發佈授權。

### 3.2 Sportradar
- **涵蓋**：Global Baseball API 的 Tier 1 是 MLB、NPB、KBO [11]。2024-05-08 的 changelog 寫「We have added venue information for ... Chinese Professional Baseball League (CPBL)」[10]。**這只能證明有 CPBL 的場館資料，不能證明有完整即時比分**，官方要求到 Coverage Matrix 查每個賽事的深度。
- **即時性**：資料由現場 scout 和內部人員輸入，Live Timelines Delta 每 10 秒更新 [11]。
- **價格**：官方沒公開，要詢價。官方文件寫明是 B2B 服務，不能讓前端直接呼叫 [12]。試用要到 Marketplace 申請 [12]，但這個頁面本次被瀏覽器安全限制擋住，沒讀到。
- **授權**：合約制，博弈用途要在合約裡談。
- **評估**：資料最權威，但對論壇來說成本和流程都太重。只有在 CPBL 需要「官方級」資料時才值得詢價。

### 3.3 Genius Sports
- 官方頁寫自己是 NFL、NCAA 的官方資料夥伴，客戶類型包括「Betting & Fantasy Providers」。價格要「Contact Sales」[13]。本次沒找到亞洲棒球或台灣籃球的覆蓋證據，標 ?。

### 3.4 Stats Perform（Opta）
- 官方說有 20+ 運動、3,900+ 賽事，強項是足球深度數據。沒有自助方案，價格要聯絡業務 [14]。對我們來說強在足球、弱在亞洲棒球，只適合日後做深度足球內容時考慮。

### 3.5 SportsDataIO
- API 清單是 NFL、MLB、NBA、NHL、大學運動、高爾夫、NASCAR、Soccer、UFC、網球、奧運 [16]。**沒有 NPB/KBO/CPBL**。官方有提到 2026 年要推出 Global API [16]。
- 試用的足球只開放歐冠，其他賽事要聯絡業務 [17]。官網本次沒找到公開價格頁，標「需詢價」。服務條款沒有寫到博弈或出處標示 [15]。
- **評估**：適合美國運動，不適合我們的亞洲重點。

### 3.6 Sportmonks（只做足球）
- **價格**（EUR/月，年繳價在括號內）[18]：
  - Starter €29（€24）：任選 5 個聯賽
  - Growth €99（€79）：30 個聯賽
  - Pro €249（€199）：120 個聯賽
  - Enterprise：詢價，2,300+ 聯賽
  - 加購：Odds & Predictions €24/月、Premium Odds Feed €129/月、每多一個聯賽 €4/月
  - 14 天免費試用
- **涵蓋**：官方有 J1 League 專頁 [20]。K 聯賽本次沒查到官方證據。
- **授權** [19]：
  - 「If you use our data to create something ... and start earning money ... everything is fine」，可以商用，但不能轉賣。
  - **按網域授權**：「Our data is exclusively available per domain」。
  - 隊徽和照片要自己處理智慧財產權，並標示權利人。
  - 對第三方網站的輸贏不負責。
- **評估**：足球品質好，但不能解決棒球和籃球。只有在 API-Sports 足球不夠用時才考慮。

### 3.7 TheSportsDB
- **價格**（USD/月）：免費、Single Developer $9、Small Business $20 [21]。
- **CPBL 查證**：用官方公開測試 key 查 `search_all_leagues.php?c=Taiwan`，回傳 `5111 Baseball Chinese Professional Baseball League`，currentSeason=2026，最新一筆是 2026-09-30 TSG Hawks vs CTBC Brothers [22]。另外也有 Korean KBO League（4830）、Nippon Baseball League（4591）、Taiwan SBL（5267）。
- **限制**：
  - 資料由社群維護（有「Contribute Guide」和編輯申請）。
  - Livescore 付費版也只有 2 分鐘更新，而且只限足球、NFL、NBA、MLB、NHL [21]，**所以 CPBL 沒有即時比分**。
- **授權**：可以用 API 做 App，付費用戶要標示資料來源。圖片只有 TheSportsDB 自製的才是 CC 授權，第三方隊徽和照片不包含在內 [23]。
- **評估**：可以當「補資料的百科」（球隊介紹、場館、圖片），不能當即時比分或競猜的資料源。

### 3.8 Goalserve（最值得試用的第二來源）
- **CPBL 查證**：官方 Full Package 覆蓋頁有「Taiwan | Cpbl」，也列出 Japan Npb、South Korea Kbo、Mexico Lmb [25]。台灣籃球（P.League+、TPBL、SBL）沒找到。足球覆蓋頁有歐霸，J 聯賽、K 聯賽、世界盃資格賽沒在頁面上看到 [26]。
- **價格**（USD）[24][26]：

  | 方案 | 1 個月 | 6 個月 | 12 個月 |
  |---|---|---|---|
  | Live Score（50+ 聯賽，含賠率比較、H2H） | 100 | 550 | 900 |
  | MLB Live Data | 250 | 1,200 | 1,500 |
  | US Sports | 400 | 1,850 | 3,100 |
  | 足球 Live Score | 150 | 800 | 1,000 |
  | 足球賽前賠率 | 250 | 1,000 | 1,500 |
  | 足球全套 | 550 | 2,550 | 3,100 |
  | **全運動全套（含所有運動的走地賠率）** | **800** | 3,550 | 5,100 |

  30 天免費試用 [24]。
- **即時性**：官網寫每 2～4 秒更新，資料從 2010 年開始，99% uptime，24/7 客服 [27]。
- **授權**：本次找不到條款頁（`/en/terms` 回傳的是首頁內容），標「官方未公開，需索取合約」。官網把「Sports betting applications」列為可以開發的應用 [27]。
- **待確認**：CPBL 是包含在 US$100 的 Live Score 方案，還是只在 US$800 的全套裡？CPBL 有沒有賠率和逐局比分？這些都要試用時實測，或寫信問。

### 3.9 Entity Sport
- **價格**（USD/月）[28]：
  - 棒球：MLB $500、KBO $250、NPB $250
  - 籃球：NBA $500
  - 足球：$250、$450、$750、$1,600（分別是 10、35、65、100+ 個聯賽）
  - 年繳送 2 個月
- 定價頁沒有 CPBL。條款頁 404。
- **評估**：按聯賽計價，對我們的組合比 API-Sports 貴 10 倍以上。

### 3.10 The Odds API（專做賠率）
- **價格**（USD/月）[29]：
  - 免費：500 credits
  - $30：2 萬 credits
  - $59：10 萬 credits
  - $119：500 萬 credits
  - $249：1,500 萬 credits
- **計費方式**：每次請求的 credits＝市場數 × 地區數 [31]。
- **涵蓋**：棒球有 MLB、NPB（`baseball_npb`）、KBO（`baseball_kbo`），**沒有 CPBL** [30]。足球有 J 聯賽、K 聯賽 1、歐冠、歐霸、世界盃、歐洲和南美資格賽。籃球有 NBA、Euroleague [30]。
- **限制**：「spreads and totals markets are mainly available for US sports」[31]，也就是讓分和大小分在亞洲聯賽不一定有。比分約 30 秒更新 [31]。
- **授權**（2026-08-31 更新）[32]：
  - 可以在網站或 App 顯示，包含商業用途。
  - 不要求標示來源。
  - 不能把原始資料當成獨立資料產品轉賣。
  - 推廣博弈時要自行加上負責任博弈警語。
- **評估**：條款對競猜站最友善。適合補 NPB、KBO、MLB、NBA、足球的賠率當 P 幣開盤參考。

### 3.11 BetsAPI
- **價格**（USD/月）[33]：
  - 賠率：Bet365 API $150，BWin、Betfair、Sbobet、1xBet 各 $100
  - 賽事：Events API $150，單一運動 $10～30
  - Everything API $300
  - 試用：1 天 $1～2、3 天 $5～8
- 走地資料每 3～5 秒更新 [33]。
- **風險**：資料來源是各家博彩公司的盤口，版權歸屬不明。條款頁和棒球聯賽頁都被 Cloudflare 驗證擋住，本次沒讀到，CPBL 覆蓋標 ?。

### 3.12 SportDevs
- **2026-09-30 當天 `sportdevs.com` 無法解析 DNS**（WebFetch 回傳 ENOTFOUND，reader proxy 回傳「Could not resolve hostname」，瀏覽器也打不開）[34]。搜尋摘要提到 €19 和 €69 的方案，但無法用官方頁面證實，所以不列入比較。供應商的網站打不開，本身就是服務穩定性的警訊。

### 3.13 Highlightly
- 棒球只有「MLB & NCAA API · 2 leagues」[35]，所以沒有 CPBL、NPB、KBO。籃球有 340+ 聯賽，足球 950+。免費每天 100 次，付費起價 US$5.99/月，年繳最多 6 折 [35]。
- 特色是比賽精華影片。可以考慮當「精華影片」的補充來源，不能當主力。

### 3.14 balldontlie
- **價格**（USD/月）[36]：
  - 免費：5 次/分
  - All-Star $9.99、GOAT $39.99：都只含 1 個運動
  - All-Access $299.99：20+ 聯賽
- **涵蓋**：NBA、MLB、五大聯賽、歐冠、世界盃，**沒有亞洲棒球** [36]。
- **授權** [37]：明文允許「lawful betting or wagering products」，不需要標示來源，只禁止原樣轉賣。
- **評估**：條款最寬鬆。如果 NBA 或 MLB 想換一個便宜的第二來源可以考慮，但不能取代 API-Sports。

### 3.15 MLB 官方 Stats API（statsapi.mlb.com）
- **實測**（2026-09-30）[38]：
  - `sportId=1`（MLB）9/27 當天有 15 場。
  - 墨西哥聯盟 `sportId=23&leagueId=125`，2026 年 4～9 月有 1,048 場。
  - NPB（31）和 KBO（32）雖然有分類，但 2026 年 **0 場**。
- **授權**：每個回應都附上 copyright 聲明，連到 gdx.mlb.com，原文：「Only individual, non-commercial, non-bulk use of the Materials is permitted」[39]。
- **結論**：goboka 是商業網站，還有競猜，**沒有 MLBAM 書面授權就不應該用**。專案目前 `mlb-stats` 模組如果呼叫這個 API，要重新評估，詳見第 5 節。

### 3.16 CPBL／NPB／KBO 官方網站
- **CPBL**：沒有公開 API。官網標示「版權所有」[46]。專案目前的 `cpbl-stats` 是模擬官網行為去呼叫內部的 `/box` 端點（要帶 CSRF token），而且 HiNet CDN 對非台灣 IP 會回 404（見 `apps/api/src/sports/cpbl-stats/cpbl-stats.service.ts` 的註解）。**這屬於未經授權的爬取**，法律和穩定性都有風險。
- **TPBL**：專案使用 `https://api.tpbl.basketball/api`，不需要 key（`tpbl-stats.service.ts`）。本次沒有找到這個 API 的公開使用條款，標「未確認」。
- **NPB／KBO**：本次搜尋沒有找到官方對外開放的 API。NPB 的官方資料由 NPB Enterprises 體系經營，要詢問 [47]。

### 3.17 Data Sports Group（DSG）
- 官方棒球覆蓋頁列出 MLB、KBO League、NPB、**「Chinese Taipei - CPBL」**[40]。籃球有 104 個賽事，頁面列了 NBA、EuroLeague 等，沒列亞洲籃球 [41]。價格和試用都要聯絡業務 [40]。
- **評估**：是少數明確列出 CPBL 的中型供應商，可以作為企業級之外的第二個詢價對象。

### 3.18 iSports API
- 首頁只列足球（2,000+ 聯賽）和籃球（800+ 聯賽），有賽前、走地、歷史賠率，起價 US$49/月，年繳 5 折，提供試用 [42]。
- 付款方式包含 USDT [42]，可以看出客群偏博彩業。
- 沒有棒球，所以不能解決 CPBL。

### 3.19 Sofascore／FlashScore 這類網站
- 都沒有對外的官方 API。Sofascore 條款禁止用 robots、scripts、scraping 自動存取，也禁止未經授權的商業使用 [44]。FlashScore（Livesport）條款同樣禁止未經同意的抓取和商業利用 [45]。
- **結論**：不要爬。被封鎖、被求償和資料突然中斷的風險都很高。

---

## 4. 混搭建議

像「主菜、配菜、醬料」分開買，每一家只負責自己最強的部分：

| 角色 | 建議 | 理由 |
|---|---|---|
| 主力（比分、賽程、戰績、H2H） | **API-Sports PRO**：棒球＋籃球＋足球，≈US$49/月 | 唯一在官方覆蓋表同時列出 CPBL、日韓職、台灣籃球的平價來源，專案也已經串好 |
| 賠率 | **The Odds API**（US$30～59/月），CPBL 維持自訂盤口 | 條款明文允許商業顯示，對博弈用途最友善。API-Sports 本身也有 NPB/KBO/MLB 賠率，可以先用它，不夠再加 |
| CPBL 第二來源和備援 | **Goalserve 30 天試用** → 驗證後再決定 | 官方覆蓋頁有 CPBL，更新 2～4 秒。可以降低對 CPBL 官網爬取的依賴 |
| 台灣籃球 | 維持 **TPBL 官方 API ＋ API-Sports**（P.League+、SBL） | 目前沒有其他供應商證實有覆蓋 |
| NBA 補強 | 維持專案現有的 ESPN/NBA 免費源；想合規化可以改成 **balldontlie**（US$9.99 起） | balldontlie 條款明文允許商用和博彩用途 |
| 精華影片（選用） | Highlightly | 資料加影片放在同一個訂閱 |
| MLB 官方 Stats API | **不建議用於正式站** | 條款限定非商業使用 |

---

## 5. 待 Ayden 詢價或確認的事項

1. **要不要馬上升級 API-Sports PRO**：三種運動加起來約 US$49/月。在官方 dashboard 買的預付款不能退、升級後不能降級，建議先買 1 個月驗證。
2. **P 幣競猜算不算「博弈用途」**：建議寫信問 API-Sports，說明 P 幣是虛擬點數、不能兌現、沒有真錢，請對方書面回覆。條款原文只說博弈平台「may require」權利人授權，沒有直接禁止。台灣法規面（例如刑法賭博罪的界線）建議另外請法律顧問確認，這不在本報告範圍。
3. **CPBL 賠率來源**：API-Sports 覆蓋表寫 CPBL 沒有 Odds。但專案有 `apps/api/_verify-ou-pinnacle.ts` 用 league id 抓 odds，**請實測 CPBL（league=29）付費後的 odds 回應是不是空的**，用實測結果確認覆蓋表是否正確。
4. **Goalserve 詢價**：CPBL 在哪個方案？有沒有逐局比分和 H/E？有沒有 CPBL 賠率？授權條款全文？博弈用途（虛擬點數）是否允許？
5. **Sportradar／DSG 詢價**（企業級選項才需要）：CPBL 在 Coverage Matrix 裡是什麼深度（只有賽果，還是有即時和逐球）？最低年約金額？
6. **MLB Stats API 的使用狀況**：專案有 `mlb-stats` 模組，如果正式站在呼叫 statsapi.mlb.com，就違反它的非商業條款，要決定改用 API-Sports，或向 MLBAM 申請授權。
7. **CPBL 官網爬取的合規性**：目前 `cpbl-stats` 模擬官網的 CSRF 呼叫，建議評估是否向中華職棒洽談資料授權，或改以 API-Sports／Goalserve 為主、官網只作補充。
8. **隊徽和球員照片**：API-Sports、Sportmonks、TheSportsDB 的條款都說圖片權利屬於聯盟或球隊，**沒有一家給授權**。公開顯示前要決定是自己取得授權，還是改用文字或自製圖示。
9. **K 聯賽、歐霸、世界盃資格賽的 API-Sports 覆蓋**：本次沒有在覆蓋頁逐項查證，付費後可以用 `/leagues?search=` 確認。

---

## 6. 來源清單（查詢日 2026-09-30）

**API-Sports**
- [1] API-Sports Baseball 資訊頁（覆蓋表、價格）：https://api-sports.io/sports/baseball
- [2] API-Sports Basketball／Football 資訊頁（價格）：https://api-sports.io/sports/basketball 、https://api-sports.io/sports/football
- [3] API-Sports Baseball v1 文件：https://api-sports.io/documentation/baseball/v1
- [4] API-Sports 服務條款：https://api-sports.io/terms
- [R] 本專案程式：`apps/api/src/sports/sports.config.ts`、`籃球聯賽補齊計畫-能力驅動板塊系統.md`

**Sportradar／Genius Sports／Stats Perform**
- [10] Sportradar changelog（CPBL venue）：https://developer.sportradar.com/sportradar-updates/changelog/global-baseball-api-3
- [11] Sportradar Global Baseball Overview：https://developer.sportradar.com/baseball/reference/global-baseball-overview
- [12] Sportradar Get Started：https://developer.sportradar.com/getting-started/docs/get-started
- [13] Genius Sports Official Sports Data API：https://www.geniussports.com/engage/official-sports-data-api/
- [14] Stats Perform Opta：https://www.statsperform.com/opta/

**SportsDataIO／Sportmonks／TheSportsDB**
- [15] SportsDataIO 服務條款：https://sportsdata.io/terms-of-service
- [16] SportsDataIO API 清單：https://sportsdata.io/developers/apis
- [17] SportsDataIO 足球文件、試用頁：https://sportsdata.io/developers/api-documentation/soccer 、https://sportsdata.io/free-trial
- [18] Sportmonks 價格：https://www.sportmonks.com/football-api/plans-pricing/
- [19] Sportmonks 服務條款：https://www.sportmonks.com/terms-of-service/
- [20] Sportmonks J1 League 頁：https://www.sportmonks.com/football-api/japan/
- [21] TheSportsDB 價格：https://www.thesportsdb.com/pricing
- [22] TheSportsDB 官方 API（公開測試 key）實測：https://www.thesportsdb.com/api/v1/json/123/search_all_leagues.php?c=Taiwan 、`lookupleague.php?id=5111`、`eventspastleague.php?id=5111`
- [23] TheSportsDB 使用條款：https://www.thesportsdb.com/docs_terms_of_use.php

**Goalserve／Entity Sport／The Odds API**
- [24] Goalserve MLB 價格：https://www.goalserve.com/en/sport-data-feeds/MLB-api/prices
- [25] Goalserve Full Package 覆蓋：https://www.goalserve.com/contact-us/sport-data-feeds/full-package-api/coverage
- [26] Goalserve 足球覆蓋、價格：https://www.goalserve.com/en/sport-data-feeds/soccer-api/coverage 、https://www.goalserve.com/en/sport-data-feeds/soccer-api/prices
- [27] Goalserve 官網首頁（2～4 秒、使用情境）：https://www.goalserve.com/en
- [28] Entity Sport 價格：https://www.entitysport.com/pricing/
- [29] The Odds API 首頁（價格）：https://the-odds-api.com/
- [30] The Odds API 運動清單：https://the-odds-api.com/sports-odds-data/sports-apis.html
- [31] The Odds API v4 文件：https://the-odds-api.com/liveapi/guides/v4/
- [32] The Odds API 條款：https://the-odds-api.com/terms-and-conditions.html

**BetsAPI／SportDevs／Highlightly／balldontlie**
- [33] BetsAPI 價格：https://betsapi.com/mm/pricing_table
- [34] SportDevs（DNS 解析失敗）：https://sportdevs.com/pricing
- [35] Highlightly 首頁：https://highlightly.net/
- [36] balldontlie 首頁：https://www.balldontlie.io/
- [37] balldontlie 條款：https://www.balldontlie.io/terms

**MLB 官方／DSG／iSports**
- [38] MLB Stats API 實測：https://statsapi.mlb.com/api/v1/sports 、`/api/v1/schedule?sportId=...`
- [39] MLBAM copyright 聲明：http://gdx.mlb.com/components/copyright.txt
- [40] DSG 棒球覆蓋：https://datasportsgroup.com/coverage/baseball/
- [41] DSG 籃球覆蓋：https://datasportsgroup.com/coverage/basketball/
- [42] iSports API 首頁：https://www.isportsapi.com/

**Sofascore／FlashScore／官方網站**
- [44] Sofascore 服務條款：https://torneo.sofascore.com/terms-of-service
- [45] Livesport／FlashScore 條款：https://www.livesport.eu/terms/flashscore_ae/
- [46] 中華職棒官網：https://www.cpbl.com.tw/
- [47] NPB 官網：https://npb.jp/

> 二手比較文章（例如 sportsapi.com、sharpapi.io、lsports.eu）本次只當作線索，沒有當成證據。表格中所有「需詢價」的項目，就是在官方頁面上找不到價格。
