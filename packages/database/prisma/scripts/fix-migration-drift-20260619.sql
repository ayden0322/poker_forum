-- ============================================================================
-- 修復 migration drift：20260619000000_add_tag_scope_category_type
-- ============================================================================
-- 背景：
--   本機 dev DB 在早期套用了該 migration 的「修改前」版本，_prisma_migrations
--   存下的 checksum 為 d18a89dd…，而最終 committed 的 migration.sql 檔案 checksum
--   為 a91aaa72…。兩者不一致 → 本機 `prisma migrate dev` 會誤判「已套用的 migration
--   被改過」並要求 reset（drop 整個 dev DB）。手滑按下去就會清掉本機資料。
--
-- 影響範圍：
--   - 🔴 只影響「曾套用過舊版本的本機 dev DB」。
--   - 🟢 正式環境不受影響：fresh `migrate deploy` 套用的是 committed 檔案，
--        checksum 本就與檔案一致，無 drift。故此腳本「不需」在正式環境執行。
--
-- 安全性（已驗證）：
--   DB 實際 schema（categories.type / tags.scope / tags.sort_order + CategoryType /
--   TagScope 兩個 enum）與 committed 檔案的 DDL 完全相符，因此把 checksum 對齊到
--   檔案，並不會藏匿任何「未套用的 DDL」。Prisma checksum = lowercase-hex
--   sha256(migration.sql)，已用未漂移的 migration 對照驗證演算法無誤。
--
-- 冪等：只在 checksum 仍為已知漂移值（d18a89dd…）時才更新，重複執行無副作用。
--
-- 執行：在受影響的本機 dev DB 上跑一次即可，例如：
--   docker exec betting-forum-db psql \
--     "postgresql://postgres:postgres@localhost:5432/betting_forum" \
--     -f - < packages/database/prisma/scripts/fix-migration-drift-20260619.sql
-- ============================================================================

UPDATE "_prisma_migrations"
SET checksum = 'a91aaa724613a81125316058e5800a256bc4de88b4eb82f4d2ad72becb8b3de9'
WHERE migration_name = '20260619000000_add_tag_scope_category_type'
  AND checksum = 'd18a89dd9e92fe51345495f46410b8980a36e41c9fde6af5f0dc5eb2c3c8bfe6';
