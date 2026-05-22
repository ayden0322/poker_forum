-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "status" "PostStatus" NOT NULL DEFAULT 'PUBLISHED';

-- CreateIndex
CREATE INDEX "posts_board_id_status_idx" ON "posts"("board_id", "status");
