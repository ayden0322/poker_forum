-- AlterTable
-- 使用 IF NOT EXISTS 是因為先前 schema 曾加過此欄位但未產生 migration，部分環境可能已存在
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "nickname_changed_at" TIMESTAMP(3);
