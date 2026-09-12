# Codex(GPT-6 Astra)競猜頁改版實作複審(2026-09-13,commit 3f67176 / 22b684d,唯讀)

結論:三個主要方向已落實,不需要重做;但錯誤／零場狀態、日期狀態與隊徽失敗恢復仍需修正。未發現 dateKey 無限迴圈、teamIds 展開型別錯誤或 Redis 舊 key 永久殘留;另找到「先截取 30 場、再排除無盤賽事」的漏列風險。

## A. 對照建議

| 項目 | 判定 |
|---|---|
| 賠率按鈕(h-11、橫排、aria-pressed、暫無不可點、移除 flash) | 符合 |
| schema 兩個 nullable 欄位 + migration | 符合 |
| parser 取 id、有值才覆寫 | 符合 |
| markets URL 帶 sportType | 符合 |
| TeamLabel 優先序(MLB 官方 → 手工映射 → 後端 URL) | 偏離但合理(是來源選擇,不是失敗鏈) |
| TeamLabel fallback:`broken` 不重置;失敗後有國旗會顯示 emoji | 偏離需修 |
| 彙總端點 + 前端篩選(不做游標) | 偏離但合理;每板 30 場上限不保證日期完整 |
| 日期 chip:key 無年份、跨午夜標籤依賴 matches 變動 | 偏離需修 |
| 聯盟 chip 零場停用 | 偏離但合理;失敗聯盟也呈現 0 需修 |
| unavailableBoards 只列名稱,chip/場數/空狀態未區分未知與零 | 偏離需修 |
| 卡片結構、版面、語彙(本次範圍) | 符合 |

## B. Bug

1. dateKey effect 沒有無限迴圈,但首次資料或所選日期消失時會閃一輪「沒有可競猜賽事」→ 衍生 effectiveDateKey。
2. twDateGroup key 只有月/日,跨年會撞;今天/明天判斷只依賴 matches memo,跨午夜不更新 → 用 formatToParts 組 YYYY-MM-DD。
3. Promise.allSettled 核心正確,但 `boardsCfg.enabled()` 在其之前,失敗整個端點掛;無單板 timeout;前端未處理 isError,初次失敗會落到「沒有可競猜賽事」。
4. TeamLabel `broken` 黏住(確定 bug):失敗後換來源仍不渲染 img。
5. teamIds 展開與 Prisma 型別:未發現錯誤。
6. Redis v2 key:SET EX 30 秒自然過期。
7. 手機長隊名結構合理;lg 寬度兩列、xl 才同列;單一市場時仍固定兩欄只佔左 3/5 → 應 grid-cols-1。
8. 額外:DB 先 take 30 再排除無盤賽事,前 30 場都無盤時會回零場 → 「有報價」條件移到 take 之前。

## C. 鐵律殘留
榜單仍以 profit 排序;TeamLabel 國旗 emoji fallback;44px 未全面(手機視圖切換 min-h-10、看完整排行/看全部聯盟);快捷金額第四顆是自訂無「我的上限」;Leaderboard 語彙(淨賺/只押大熱門);CompetitionRecord「跟這單/有效注數」(刻意未動);Leaderboard.tsx:15 未定義 text-accent-900;進行中收合列青綠裝飾線。

## D. 下一步
P1(先讓列表可信):彙總錯誤/部分失敗 chip/重試(3–5h)、有盤條件移到 take 前(3–5h)、TeamLabel 失敗狀態與移除國旗 emoji(1–2h)、日期 key 補年份/衍生有效日期/跨午夜(2–4h)。
P2:單場討論串(1.5–3 天)、我的競猜含近期結果(4–8h)、足球中文隊名 140 隊(6–10h)、44px 全面/單市場全寬/BetSlip 捲動(3–5h)。
P3:市場列表與賽季解析分離補 timeout(3–6h)、空榜退出右欄與風險調整報酬分。
