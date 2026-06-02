/*
  將 last_reply_at 改為 NOT NULL，語意從「最後回覆時間（可能 null）」轉為「最後活動時間（一定有值）」。
  這樣 ORDER BY last_reply_at 不會再有 NULLS LAST/FIRST 行為差異，新發文也能依時間正確排入序列。

  先 UPDATE 現有的 NULL row 為 created_at，再 ALTER COLUMN SET NOT NULL，避免遷移失敗。
*/

-- 先補齊既有的 NULL row：「最後活動時間」一開始就是發文時間
UPDATE "posts" SET "last_reply_at" = "created_at" WHERE "last_reply_at" IS NULL;

-- AlterTable
ALTER TABLE "posts" ALTER COLUMN "last_reply_at" SET NOT NULL,
ALTER COLUMN "last_reply_at" SET DEFAULT CURRENT_TIMESTAMP;
