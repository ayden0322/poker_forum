-- CreateEnum
-- 板塊頁分區：FEATURED = 站方推送（上半部）、DISCUSSION = 玩家討論（下半部）
DO $$ BEGIN
  CREATE TYPE "PostSection" AS ENUM ('FEATURED', 'DISCUSSION');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable: 加 section 欄位，預設 DISCUSSION
ALTER TABLE "posts"
  ADD COLUMN IF NOT EXISTS "section" "PostSection" NOT NULL DEFAULT 'DISCUSSION';

-- 資料回填：原本 is_pinned=true 的 9 篇「[新聞分享]」管理員文章
-- 一次性搬到 FEATURED 區，並清掉 is_pinned（依產品決策 B：站方推送本身已是強調，
-- 不需要在小區內再做置頂層次）
UPDATE "posts"
SET "section" = 'FEATURED',
    "is_pinned" = false
WHERE "is_pinned" = true;

-- CreateIndex: 後續 board 查詢會按 section 分流
CREATE INDEX IF NOT EXISTS "posts_board_id_section_idx" ON "posts"("board_id", "section");

-- DropColumn: is_announce 從未被使用過（線上 0 筆 true），移除死碼
ALTER TABLE "posts" DROP COLUMN IF EXISTS "is_announce";
