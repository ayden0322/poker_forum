-- AlterTable
ALTER TABLE "daily_task_defs" ADD COLUMN     "threshold" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "task_event_log" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "task_key" "DailyTaskKey" NOT NULL,
    "ref_id" TEXT NOT NULL,
    "task_date" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_event_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_event_log_user_id_task_key_task_date_idx" ON "task_event_log"("user_id", "task_key", "task_date");

-- CreateIndex
CREATE UNIQUE INDEX "task_event_log_user_id_task_key_ref_id_task_date_key" ON "task_event_log"("user_id", "task_key", "ref_id", "task_date");

-- AddForeignKey
ALTER TABLE "task_event_log" ADD CONSTRAINT "task_event_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 設定各任務達成門檻（既有列補正；新環境由程式 seed 帶入相同值）
UPDATE "daily_task_defs" SET "threshold" = 5 WHERE "task_key" = 'VIEW_POSTS';
UPDATE "daily_task_defs" SET "threshold" = 3 WHERE "task_key" = 'REPLY';
UPDATE "daily_task_defs" SET "threshold" = 5 WHERE "task_key" = 'LIKE';
