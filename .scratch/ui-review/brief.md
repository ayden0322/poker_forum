# 競猜頁 UI 審查簡報（給 Codex，2026-09-13）

截圖：`.scratch/ui-review/predictions-2026-09-13.png`（正式站 goboka.net/predictions，桌機 Chrome，登入狀態）。
程式碼：`apps/web/src/app/predictions/PredictionsClient.tsx`、`apps/web/src/components/predictions/`（BetSlip.tsx / TeamLabel.tsx / Leaderboard.tsx / RecordChip.tsx / CompetitionRecord.tsx）、`apps/web/tailwind.config.ts`。

## 產品與品牌前提
- 定位：PTT 風格運彩社群論壇（Reddit / Hacker News / PTT 現代化版）。調性：資訊密度優先、標題是視覺主角。
- 主色青綠 #39B8BE（tailwind 的 `blue-*` 色階整組被覆寫成青綠，`bg-blue-500` 是青綠不是藍）、強調橘/琥珀 #d97706。字體 Antonio（標題）/ Manrope（內文）/ mono-stadium（數字）。
- NOT-DO：全寬輪播、賽博龐克配色、大量裝飾動效、emoji（全站已移除 emoji，圖示用 lucide 線性 icon）。
- 去賭場化三鐵律（規格 §7.5）：1. 語彙用「競猜 / 命中 / 未命中 / 拿回」，不用「下注 / 投注 / 派彩 / 贏錢」，P 幣單位「P」永不出現 $；2. 不引入紅綠漲跌色，贏＝青綠、輸＝中性灰、僅榜單前三用琥珀；3. 榜單主角＝風險調整報酬分，金額與連勝為輔。金額快捷鍵限 100 / 500 / 1000 / 我的上限；動畫上限青綠打勾 + count-up ≤600ms，無 confetti 無金光。
- 2026-09-12 Ayden 拍板：這期首要目標＝**提高回訪與討論**；NBA 10 月首版做勝負＋大小；讓分盤延後。不做快速投注面板、幸運輪盤、更多盤口 12+、參與人數/熱度數字。

## 現況數據（重要脈絡）
- 正式站近 30 天登入 2 人、注單 0 筆、回覆 0 則；競猜板塊昨天剛從 3 個開到 10 個（7 個足球聯盟新開，Pinnacle 莊家，勝負＋大小分）。
- 足球隊伍目前沒有中文名與隊徽（TeamLabel 對足球走縮寫圓徽 fallback），棒球有。
- 業主原話：「競猜畫面顯示有點單薄，希望多加一點資訊，還有競猜的選項」。

## 顧問圓桌已定的方向（可挑戰）
- 卡片分兩層：賽事帶（隊徽＋中文隊名＋時間＋討論數槽位）為主角，盤口壓成一列 outline chip，選中才青綠 solid。
- 社群數字用「槽位」不用「計數器」：討論 ≥5 才顯示數字，否則「還沒人討論，開第一串」；不顯示參與人數。
- 右欄改「我的競猜進度」（我已猜場次的粗粒度比分＋「更新於 N 分鐘前」），不做即時比分脈衝。
- 每張卡加「追蹤這場」「討論這場」文字按鈕（無 emoji）。
