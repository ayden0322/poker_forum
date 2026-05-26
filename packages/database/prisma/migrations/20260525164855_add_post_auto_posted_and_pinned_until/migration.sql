-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "is_auto_posted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pinned_until" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "posts_is_auto_posted_is_pinned_pinned_until_idx" ON "posts"("is_auto_posted", "is_pinned", "pinned_until");

-- CreateIndex
CREATE INDEX "posts_is_auto_posted_status_created_at_idx" ON "posts"("is_auto_posted", "status", "created_at");
