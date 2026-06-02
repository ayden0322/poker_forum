-- AlterEnum
ALTER TYPE "PostSection" ADD VALUE 'NEWS';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "published_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "posts_is_auto_posted_status_published_at_idx" ON "posts"("is_auto_posted", "status", "published_at");
