-- P幣競猜 prod 加固 SQL（go-live 前手動跑一次；規格 §10 加固清單）
-- ⚠️ 為什麼是手動 SQL：Prisma schema 表達不了 partial unique / CHECK；
--    已實測 db push --accept-data-loss 不會抹掉這些物件（2026-07-07，三情境），
--    但「新環境不會自帶」——重建 DB / 新環境要記得重跑本檔。冪等：全部 IF NOT EXISTS 式寫法。

-- 1) OddsQuote：同組合只能一筆 active（Codex 下注複審 H3：跨 instance 併發寫盤的最後防線；
--    單 instance 期間由行程內互斥 + updateMany 自癒頂著，此索引是縱深）
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS odds_quotes_active_combo
  ON odds_quotes (match_id, bookmaker_id, market, selection, COALESCE(line, -1))
  WHERE active = true;

-- 2) Bet 基本約束（應用層已守；DB 層縱深）
DO $$ BEGIN
  ALTER TABLE bets ADD CONSTRAINT chk_bets_stake_positive CHECK (stake > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE bets ADD CONSTRAINT chk_bets_payout_positive CHECK (potential_payout >= stake * 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) 錢包餘額不為負（debitInTx 條件式扣款已守；縱深）
DO $$ BEGIN
  ALTER TABLE wallet_accounts ADD CONSTRAINT chk_wallet_balance_non_negative CHECK (balance >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 驗證（跑完應各回一列）：
-- SELECT indexname FROM pg_indexes WHERE indexname = 'odds_quotes_active_combo';
-- SELECT conname FROM pg_constraint WHERE conname LIKE 'chk_bets%' OR conname LIKE 'chk_wallet%';
