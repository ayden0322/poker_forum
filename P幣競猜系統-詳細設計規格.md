# P幣競猜系統 — 詳細設計規格

> 狀態：設計定案（2026-07-07 圓桌討論收斂 + Ayden 拍板），尚未開工。
> 本文件是《會員成長與預測系統-設計規格.md》第二期「預測系統」的詳細展開，經五方圓桌（tech-mentor / red-team / design-mentor / growth-mentor / Codex）兩輪交鋒後定案。
> 本文件為「目標設計」，實作狀態以實作後的對帳為準，勿把本文當完成式。

---

## 0. 定案摘要（Ayden 拍板紀錄）

| 決策點 | 定案 | 日期 |
|---|---|---|
| P 幣來源 | **唯一來源 = G→P 兌換**（100G = 1,000P，比例後台可調），不送首注禮包、不加免費場 | 2026-07-07 |
| 結算口徑 | 投 500P @1.8 → 贏**拿回 900P（含本金，淨賺 400）**；輸失去 500P 本金 | 2026-07-07 |
| 三期方向 | **榮譽版**：高手發預測貼/上精選/平台發獎勵/粉絲追蹤，**不開放會員付費買推薦**；二期戰績頁不留任何付費鉤子 | 2026-07-07 |
| 二期上線範圍 | **足球（含世界盃）+ MLB** 先上；NBA 因 API-Sports basketball 無盤口（實測 odds 端點回空），等 The Odds API 評估後二階段補上 | 2026-07-07 |
| 賠率來源 | API-Sports、William Hill（football `bookmaker=7`、baseball `WilliamHill`），系統不自行算賠率 | 沿用原規格 |

不可逆三件套（schema 開表當天就要定死，事後補是遷移地獄）：
1. **ledger 冪等鍵**（錢的每一步都是一筆 append-only 流水）
2. **bet 單向狀態機**（無回頭箭頭）
3. **每注的賠率/比分快照**（lockedOdds + settledScore，榜單公式賽後可全量重算）

榜單公式**可以**錯著上線再迭代；帳**不行**。

---

## 1. 帳務設計（錢在 ledger，bet 只是狀態機）

### 1.1 原則
- 錢的每一步（扣注、派彩、退款、沖正）都是既有 append-only ledger 的一筆；`balance` 只是快取。
- bet 表**不存任何餘額變化欄位**，只存狀態與結算依據。
- 後台補幣也走 ledger（`ADMIN_ADJUSTMENT`），任何地方不准直接改 balance。
- 每日對帳 cron：`SUM(ledger.PREDICTION_*)` 對 bet 表聚合，不平即告警。

### 1.2 Bet 表（Prisma 概念稿）

```prisma
model Bet {
  id               String    @id @default(cuid())
  userId           String
  matchId          String            // 對內賽事 id（含 sport/league 資訊）
  market           BetMarket         // WINLOSE | OVER_UNDER
  selection        String            // HOME / AWAY / OVER / UNDER
  line             Decimal?          // 大小分盤口線（勝負盤為 null）
  stake            Int               // 投注 P 幣
  lockedOdds       Decimal   @db.Decimal(8, 3)
  potentialPayout  Int               // stake × lockedOdds，下注瞬間定死（含本金）
  quoteId          String            // 引用 OddsQuote（見 §2），賠率溯源
  status           BetStatus @default(PENDING)  // PENDING → WON | LOST | PUSH | VOIDED（單向）
  settledScore     Json?             // 結算當下的最終比分快照
  settledAt        DateTime?
  createdAt        DateTime  @default(now())

  @@index([matchId, status])   // 結算掃描
  @@index([userId, createdAt]) // 個人注單列表
}
```

### 1.3 Ledger reason 與冪等鍵

| reason | 觸發 | 金額 | 冪等鍵 |
|---|---|---|---|
| `PREDICTION_STAKE` | 下注扣款 | −stake | `@@unique([reason, refId])`，refId = betId |
| `PREDICTION_PAYOUT` | 贏派彩 | +potentialPayout | 同上 |
| `PREDICTION_REFUND` | PUSH 平盤退款 / VOIDED 退款 | +stake | 同上 |
| `PREDICTION_REVERSAL` | 事後沖正（比分改判） | ± | refId = 原 ledger entry id |

- 冪等靠 DB unique 擋死：結算 cron 重跑、雙實例同跑、手動補結，同一 betId 的派彩/退款各只能存在一筆。
- ⚠️ **REFUND 與 PAYOUT 是不同 reason，unique 不互斥**（red-team C-1）——「同一注不會既退款又派彩」由**狀態機**承重，不是 unique。chaos test 必須打狀態機（重放 postponed→NS→FT 序列），不能只測 unique 衝突。
- ⚠️ prod 走 `db push` 不走 migration：**關鍵約束一律用 Prisma 能表達的形式**（unique / index）。`CHECK(stake > 0)`、`CHECK(balance_after >= 0)` 等放應用層守（重用裝飾商店已實戰的 `debitInTx`）。上線前花十分鐘實測 db push 是否會抹掉手寫 constraint，實測前不准依賴。
- 不用 advisory lock：unique 冪等鍵 + 樂觀鎖狀態轉移已保證正確性，這個量級不需要為吞吐加複雜度。

---

## 2. 賠率管線（權威 = 有新鮮度約束的 DB snapshot）

### 2.1 三層結構

```
API-Sports ──cron──▶ OddsQuote（DB，不可變快照，權威）
                        │
                        ├──▶ Redis（顯示快取，前端讀這裡）
                        └──▶ 下注時 demand-driven 重驗（見 2.3）
```

```prisma
model OddsQuote {
  id          String   @id @default(cuid())
  matchId     String
  bookmakerId Int                 // 7 = William Hill
  market      String
  selection   String
  line        Decimal?
  odds        Decimal  @db.Decimal(8, 3)
  fetchedAt   DateTime
  payloadHash String              // 原始回應 hash，稽核用
  active      Boolean  @default(true)

  @@index([matchId, market, active])
}
```

### 2.2 cron 抓取（顯示用）
- 沿用 world-cup cron 模式：**只抓未開賽場次**（開賽後 odds 無意義），3–5 分鐘週期，比賽窗 gate（無賽事 skip）。
- `/odds?league=X&season=Y` 一次回整聯賽，非 per-fixture，呼叫量 = 開放聯賽數 × 頻率（常數，與流量無關）。
- 寫入 OddsQuote + 同步 Redis（TTL 略長於週期）；**同一輪 cron 必須同步更新 DB 的 `match.startTime` / status**（封盤依據，不能只活在 Redis）。

### 2.3 下注時 demand-driven 重驗（堵舊線套利 + startTime 漂移）
- 下注請求進來，該場 quote 的 `fetchedAt` 超過 **60–90 秒** → 同步打一次 API-Sports 重抓，拿回的價才是 lockedOdds。
- **per-match single-flight lock**：同場併發的注共用同一次重抓結果。
- 呼叫量跟著實際下注行為走（沒人押的場零成本，熱門場封頂每分鐘一次）；掛**每日重驗預算計數器**，爆了 fail-closed 拒單。
- 副作用即防禦：賽事轉 live 後 pre-match odds 不回線 → 重驗拿到空盤 → 自然拒單。一個機制同時關「舊線套利窗」和「startTime 漂移還在收注」兩個洞。

### 2.4 額度粗算（✅ 已完成 2026-07-07，實測數據）

**關鍵事實（實測 /status）：三個 API 額度各自獨立，各 7500/日**（football / baseball / basketball 都是 Pro）。odds 只吃 football + baseball 額度，與籃球 23 聯賽互不影響——比圓桌假設的「共用 7500」寬鬆得多。

| 實測項 | 數值 |
|---|---|
| football 今日用量（世界盃期間） | 430 / 7500（尖峰雙賽日估 ~3000，含 live cron） |
| baseball 今日用量 | 38 / 7500（幾乎全空） |
| football `/odds?league=1&season=2026` | 10 筆/頁，世界盃現況 3 頁/輪 |
| baseball `/odds?league=1&season=2026` | **單次回全部**（實測 95 筆，約兩週視窗，無分頁）→ MLB 每輪 1 call |
| baseball William Hill bookmaker id | **22**（名稱 `WilliamHill`；football 是 7） |
| ⚠️ 實作注意 | `/odds?league` 回的是「視窗內全部有盤場次」**含已完賽**（MLB 第一筆即 FT），寫入 OddsQuote 前要過濾未開賽場次 |

**新增負擔估算（顯示 cron 用分層頻率：開賽 >6h 前 30 分/輪、6h 內 5 分/輪、開賽後不抓 + 比賽窗 gate）：**

| 情境 | football odds cron | baseball odds cron | demand-driven 重驗 |
|---|---|---|---|
| 7 月現況（世界盃+友誼賽+MLB） | ~450/日 | ~130/日 | 預算封頂 1,000/日（初期實際 <200） |
| 8 月尖峰（歐洲五大+J/中超全開的週六） | ~2,300/日（league 逐一輪詢）；改用 `/odds?date=` 按日混抓可壓到 ~800/日 | 同上 | 同上 |

**結論：過關，但要裝額度守門。** football 最壞情境 ≈ 現有尖峰 3,000 + odds 2,300 + 重驗 1,000 ≈ 6,300 < 7,500（貼近）；採 date-based 方案則 ≈ 4,800（安全）。baseball 完全無壓力。實作要求：odds 呼叫掛每日 counter，超軟上限（建議 2,500）自動降頻為 30 分/輪並告警——寧可賠率變舊（顯示用），不擠壓比分 cron 的額度。前車之鑑：2026-06-19 世界盃額度爆量。

---

## 3. 下注 API

### 3.1 端點
```
POST /predictions/bets
body: { matchId, market, selection, stake, quoteId, clientOdds }
```

### 3.2 收單五道檢查（任一失敗 → fail-closed 拒單，回機器可讀原因碼）

| # | 檢查 | 失敗碼 |
|---|---|---|
| 1 | `match.status == 'NS'`（DB） | `MARKET_LOCKED` |
| 2 | `now < match.startTime − 封盤buffer(2–3分，後台可調)`（DB） | `MARKET_LOCKED` |
| 3 | quote 存在、active、`now − fetchedAt ≤ 新鮮度上限`（超齡觸發 §2.3 重驗） | `STALE_ODDS` |
| 4 | 重驗後的權威賠率 ≠ 使用者確認的 `clientOdds` → 回新價 | `ODDS_CHANGED`（409 帶新 quote） |
| 5 | 餘額足夠 + 單注上下限（綁等級）+ 每日總額上限 + 單場單市場累積曝險上限 | `LIMIT_EXCEEDED` / `INSUFFICIENT_BALANCE` |

- ⚠️ **`clientOdds` 只用於比對，永遠不採信為 lockedOdds**（red-team N2：否則偽造請求可鎖任意賠率）。lockedOdds 一律取 server 端重驗後的權威值。
- cron 掛 / API 掛 / status 不明 / 重驗預算爆 → 一律拒單（`FEED_DOWN`）。stale odds 不是體驗問題，是被刷問題。

### 3.3 下注 transaction（單一 DB transaction 內依序）
1. lock wallet row
2. 五道檢查（封盤判斷必須在 transaction 內，堵開賽瞬間臨界競態）
3. 寫 Bet（PENDING, lockedOdds, potentialPayout, quoteId）
4. 寫 ledger `PREDICTION_STAKE −stake`（unique 冪等鍵）
5. 更新 balance 快取

---

## 4. 結算流程

### 4.1 狀態機（單向，無回頭箭頭）

```
PENDING ──┬─▶ WON    （派彩 +potentialPayout）
          ├─▶ LOST   （不進帳，本金已扣）
          ├─▶ PUSH   （大小分平盤，退回 +stake）
          └─▶ VOIDED （延賽/腰斬/取消，退回 +stake）
```

### 4.2 結算 cron
1. 撈 `status ∈ 可結算白名單` 的賽事（見 4.3），**FT 後延遲 15–30 分（grace period，後台可調）**才結算——吃掉大部分官方比分更正窗口。
2. 對每注：樂觀鎖轉移 `UPDATE bet SET status=?, settledScore=?, settledAt=now() WHERE id=? AND status='PENDING'`，affected rows = 0 → skip。
3. 同 transaction 寫 ledger 派彩/退款（unique 冪等鍵）。
4. 結算當下把最終比分寫進 `settledScore`（回答「當時為什麼這樣判」）。

### 4.3 賽況映射白名單

| API-Sports status | 動作 |
|---|---|
| FT / AET / AOT 等完賽類 | 結算 |
| CANCELLED / ABANDONED / 確認改期 | VOIDED 退款 |
| **POSTPONED** | **先凍結 N 小時（後台可調），確認取消/改日才退**——堵「suspended 當晚恢復、退款已發」的免費保險洞（red-team C-2） |
| **白名單以外任何 status** | **不動作 + 告警**（最容易漏的就是 default case 把沒見過的狀態當完賽結掉） |

### 4.4 事後更正（比分改判）
- 不准 UPDATE 舊帳：走 `PREDICTION_REVERSAL` 沖正 + 重派，狀態機不回頭（新增更正紀錄，不改舊紀錄）。
- Admin 後台提供手動 void / 沖正工具（走 ledger + RBAC 操作審計），客服糾紛用——進二期 scope，不事後補。

---

## 5. 防作弊關卡清單

| # | 攻擊 | 防線 | 層 |
|---|---|---|---|
| 1 | 前端偽造賠率 | lockedOdds 一律 server 權威值，clientOdds 只比對（§3.2） | API |
| 2 | 舊線套利（傷病/先發變動） | demand-driven 60–90 秒重驗（§2.3） | API |
| 3 | 開賽瞬間競態 / startTime 漂移 | 封盤三條件（status==NS + buffer + 新鮮度）in-transaction（§3.2） | DB tx |
| 4 | 重複派彩 / 先退款後派彩 | 狀態機單向 + ledger unique + POSTPONED 凍結（§4） | DB |
| 5 | 1.05 大熱門刷勝率榜 | 榜單公式：投注額加權 ROI（§6），純勝率降級為輔助顯示 | 公式 |
| 6 | 多帳號對沖刷獲利榜 | P 幣無免費入口（拍板）+ 每日總額上限 + 單場曝險上限 + 同 IP/裝置/行為群組降權標記 | 經濟+風控 |
| 7 | 帳號黑市 / 榜單替賣料背書 | 三期榮譽版定案（不開付費）；戰績頁不留付費鉤子；曬單卡**禁一鍵跟注** | 產品 |
| 8 | 平均賠率門檻被尾部墊高繞過 | 不用算術平均當門檻（29注@1.05+1注@15 → 均值1.52 即繞過）；用 per-bet 加權公式 | 公式 |

---

## 6. 排行榜

### 6.1 原始事實優先
bet 表已存 lockedOdds + stake + settledScore → **任何榜單公式都是賽後可重算的純函數**，可全量重算歷史、可 A/B。公式錯了隨時改，不屬於「一次蓋對」清單。

### 6.2 首版公式（Codex 案）
```
單注報酬 r = 命中: lockedOdds − 1 ; 未命中: −1
ROI = Σ(cappedStake × r) / Σ(cappedStake)
Score = ROI × min(1, √(有效注數/30)) × min(1, √(有效投注額/門檻))
```
- 1.05 熱門中 27/30 場 → ROI ≈ −5.5%，負分。度量問的是「你有沒有打贏賠率隱含機率」，不是「你猜中幾次」。
- 純勝率保留為個人頁 vanity stat；榜單每列強制三元組 `勝率 · 平均賠率 · 有效注數`（透明本身是防禦）。
- 週/月獲利榜照原規格保留，加參榜門檻：有效投注額門檻（後台可調）。

### 6.3 重置與揭曉
- 台灣時區；週榜週一 00:00 重置，**「揭曉」與「重置」拆開**：週一早上推「本週預測王出爐」全站通知（榜單重置日是下注低谷，揭曉事件把它變高峰）。

---

## 7. UX 規範（去賭場化）

### 7.1 下注流程：兩步制 Bet Slip
- 入口 = 賽事列表/詳情頁的**賠率格本身**（描邊卡片、mono 數字、觸控區 ≥44px、選中=青綠實心）；不做獨立競猜區當唯一入口。
- 點賠率 → bottom sheet：鎖定賠率 / 金額 chip（100·500·1000·我的上限，自訂才展開鍵盤）/ **算式行「可拿回 900P = 500 × 1.8（含本金）」**（新手教學內建於流程，不做 tour）/ 唯一確認鍵。
- 大小分固定一行：「兩隊總分 > 220.5 即命中，剛好 220.5 退回本金」。

### 7.2 賠率變動：強制 acknowledge，不准靜默換值
- 確認鍵文案 = `確認競猜 @1.85`。
- slip 開著遇刷新 / 後端回 `ODDS_CHANGED`：整顆鍵變 `賠率已更新 1.85 → 1.82 [以 @1.82 繼續] [取消]`，按過「繼續」才可送出。
- 前後端共用同一個 UI 狀態：`STALE_ODDS` 重驗中=「賠率已過期，取得最新中…」→ 接回 acknowledge 畫面。**fail-closed 不是 UX 死路，是 acknowledge 流程的觸發器。**

### 7.3 拒單是狀態，不是錯誤
- 三不准：不准 error toast、不准清空 slip 選擇與金額、不准讓人填完金額才第一次得知停押。
- `FEED_DOWN` → **入口層降級**：全站賠率格變灰保留數字+「暫停受理」小標；slip 確認鍵 disabled「賠率來源暫時中斷，你的選擇會保留」。
- 封盤 → 確認鍵靜態「已封盤」，不彈窗。
- 後端契約：拒單一律回機器可讀原因碼（`STALE_ODDS` / `ODDS_CHANGED` / `FEED_DOWN` / `MARKET_LOCKED` / `LIMIT_EXCEEDED` / `INSUFFICIENT_BALANCE`），不是 400 + 中文字串。

### 7.4 結算情緒
- 贏：青綠打勾 + mono 數字 count-up（0→900，≤600ms，一次不循環）。**無 confetti、無金光、無全螢幕彈窗**。
- 輸：中性灰「未命中」+ 資訊價值（「總分 218，距大分線差 6.5」）+ ghost 按鈕接每日任務回血（不用琥珀 solid 在人剛輸時推銷）。
- 推播：**贏報數字**（「湖人 @1.85 命中 +425P」）、**輸報賽果**（「賽果出爐：湖人 112:105 快艇」），輸家不推損益數字。
- 封盤倒數只在開賽前 10 分鐘出現。

### 7.5 去賭場化三鐵律
1. 語彙：競猜 / 命中 / 未命中 / 拿回；不用下注 / 投注 / 派彩 / 贏錢。P 幣自帶 icon + 單位「P」，永不出現 `$`。
2. 不引入紅綠漲跌色：贏=青綠、輸=中性灰、僅榜單前三用琥珀（金=榮譽不是錢）。
3. 榜單視覺主角 = 風險調整報酬分 + 三元組；金額與連勝降級為輔助。

---

## 8. 成長機制（二期內建）

- **結算 = 回訪事件**：結算後 30 分內站內通知（文案分贏/輸，見 §7.4）；通知落地頁 = 「結算結果 + 週榜排名變化 + 今日可競猜賽事」三合一（入口可分散在內容裡，**回訪落點必須集中**）。
- 「本日競猜 1 次」掛進既有每日任務（一二期互餵）。
- **注單 = 內容**：一鍵曬單到賽事討論串（卡面=賽事、選邊、鎖定賠率、命中與否；**獲利數字預設不顯示**、本人可選開；CTA 只能是「看這場賽事」，**禁一鍵跟注**）。
- **公開戰績頁** `/members/<user>/record`：勝率、平均賠率、有效注數、擅長聯盟 + OG image；**不預留訂閱/付費版位**（三期榮譽版定案）。
- 分析文末嵌競猜入口 + 投注分佈（只給百分比「63% 看好湖人」，**不給總池金額**）；未登入看得到分佈與注單牆、點競猜才撞註冊牆。
- 上線後三指標：①競猜者 vs 非競猜者 D7 回訪差 ②手機驗證→7 日內首猜率 ③週活躍競猜人數 × 人均週注數。

---

## 9. 後台（旋鈕由程式定義、數值後台調）

| 後台可調 | 寫死在程式 |
|---|---|
| G→P 比例、單注上下限（綁等級）、每日總額上限、單場曝險上限 | 玩法類型（勝負/大小分）、結算邏輯、狀態機 |
| 封盤 buffer 分鐘數、賠率新鮮度上限、POSTPONED 凍結時數、grace period | 冪等鍵、快照機制、fail-closed 行為 |
| 聯盟 × 玩法開關 + **各自綁定的 bookmaker id**（足球全玩法=WH(7)；MLB 勝負=WH(22)、MLB 大小分=WH 沒開線，後台選替代家或關閉） | 防刷機制、風控標記邏輯 |
| 榜單參榜門檻（有效投注額）、榜單公式係數 | 榜單原始事實欄位、重算管線 |
| 每日重驗預算上限 | demand-driven 重驗機制、single-flight |

Admin 另需：手動 void/沖正工具（ledger 沖正 + RBAC 審計）、對帳報表（ledger vs bet 聚合）、風控標記檢視。

---

## 10. 開工順序與待驗事項

### 建議順序
1. **額度粗算**（§2.4，不算完不開工）＋ db push 對手寫 constraint 的行為實測
2. Schema：Bet + OddsQuote + ledger reason 擴充（不可逆三件套，先定死）
3. 賠率管線：cron 抓取 → OddsQuote → Redis；世界盃先接（眼前有賽事可實測）
4. 下注 API（五道檢查 + transaction + 原因碼契約）
5. 結算 cron（狀態機 + 白名單 + grace period + POSTPONED 凍結）＋ chaos test（重放 status 抖動序列、kill-between-steps）
6. 對帳 cron + admin 沖正工具
7. 前端：bet slip + acknowledge 流程 + 注單列表/戰績頁
8. 排行榜（公式可後補，先存事實）
9. 成長動線（通知、曬單、分佈）

實作走 dual-dev：Claude 主刀、Codex 獨立複審（結算冪等與狀態機是指定複審重點）。

### 待驗清單（開工前）
- [x] ~~API-Sports 日呼叫量粗算 vs 7500/日~~ → **已完成（§2.4）**：三 API 額度獨立、football 最壞 6,300/7,500、baseball 全空；需實作額度守門 counter
- [x] ~~db push 是否抹掉手寫 CHECK constraint~~ → **已實測（2026-07-07，Prisma 6.19.2 + PG16 拋棄式容器）**：無變更 / 加欄位 / 改型別三情境 `db push --accept-data-loss` 都**不會抹掉** CHECK（走 ALTER 不重建表）。但 CHECK 不在 schema.prisma＝新環境不會自帶 → 定位為 prod 加固層（idempotent bootstrap SQL 補），**應用層驗證仍是第一道防線**，Prisma unique 約束照原計畫
- [x] ~~MLB（baseball API）的 odds 市場覆蓋確認~~ → **已完成（2026-07-07 實測）**：William Hill（bookmaker=22）勝負盤 11/13 穩定有線，**大小分 0/13 沒開**；大小分由 10Bet/Unibet/Betfair/BetVictor/SBO/1xBet/Betano 全覆蓋（4/4）。→ 設計調整：**bookmaker 綁「聯盟 × 玩法」後台可設**（不寫死單一家）：足球全玩法=William Hill(7)；MLB 勝負=WilliamHill(22)、MLB 大小分=後台選一家（建議 Betfair 或 Unibet）或先不開、只上勝負
- [ ] The Odds API free tier 能否取 NBA + William Hill（二階段 NBA 用，不擋二期）
