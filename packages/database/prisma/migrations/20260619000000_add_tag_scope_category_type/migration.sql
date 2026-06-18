-- CreateEnum
CREATE TYPE "CategoryType" AS ENUM ('SPORTS', 'LOTTERY', 'GENERAL');

-- CreateEnum
CREATE TYPE "TagScope" AS ENUM ('GLOBAL', 'SPORTS', 'LOTTERY');

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "type" "CategoryType" NOT NULL DEFAULT 'GENERAL';

-- AlterTable
ALTER TABLE "tags" ADD COLUMN     "scope" "TagScope" NOT NULL DEFAULT 'GLOBAL',
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;

-- ============================================================================
-- 資料回填：正式站 entrypoint 只自動跑 `migrate deploy`、不跑 seed，
-- 因此既有分類/標籤的 type/scope 必須在 migration 內回填，
-- 否則新 API 一上線會讀到「全分類 GENERAL → 全站只剩通用標籤」。
-- 對既有資料皆為冪等更新；對全新空庫則命中 0 列、由 seed 補齊。
-- ============================================================================

-- 既有分類依 slug 設定型別
UPDATE "categories" SET "type" = 'SPORTS'  WHERE "slug" IN ('basketball', 'soccer', 'baseball', 'other-sports');
UPDATE "categories" SET "type" = 'LOTTERY' WHERE "slug" = 'lottery';
UPDATE "categories" SET "type" = 'GENERAL' WHERE "slug" IN ('general', 'sports');

-- 既有標籤依 slug 設定 scope / 顯示順序
UPDATE "tags" SET "scope" = 'GLOBAL',  "sort_order" = 1 WHERE "slug" = 'analysis';
UPDATE "tags" SET "scope" = 'GLOBAL',  "sort_order" = 2 WHERE "slug" = 'review';
UPDATE "tags" SET "scope" = 'GLOBAL',  "sort_order" = 3 WHERE "slug" = 'discussion';
UPDATE "tags" SET "scope" = 'GLOBAL',  "sort_order" = 4 WHERE "slug" = 'tutorial';
UPDATE "tags" SET "scope" = 'LOTTERY', "sort_order" = 1 WHERE "slug" = 'show-ticket';
UPDATE "tags" SET "scope" = 'LOTTERY', "sort_order" = 2 WHERE "slug" = 'recommend';
UPDATE "tags" SET "scope" = 'LOTTERY', "sort_order" = 3 WHERE "slug" = 'draw-result';

-- 復活原本 WorldCupTagFilter 寫死、但 DB 不存在的 4 個運動標籤（票務刻意不建，以博弈論壇為導向）。
-- 用 DO UPDATE 而非 DO NOTHING：即使這些 slug 已存在但 scope 錯（如曾被當通用標籤），也會被導正成 SPORTS，確保冪等且自我修復。
INSERT INTO "tags" ("id", "name", "slug", "scope", "sort_order") VALUES
  (gen_random_uuid()::text, '戰報', 'match-thread', 'SPORTS', 1),
  (gen_random_uuid()::text, '預測', 'prediction',   'SPORTS', 2),
  (gen_random_uuid()::text, '球員', 'player',        'SPORTS', 3),
  (gen_random_uuid()::text, '陣容', 'lineup',        'SPORTS', 4)
ON CONFLICT ("slug") DO UPDATE
  SET "name" = EXCLUDED."name", "scope" = EXCLUDED."scope", "sort_order" = EXCLUDED."sort_order";
