-- CreateEnum
CREATE TYPE "DailyTaskKey" AS ENUM ('LOGIN', 'VIEW_POSTS', 'CREATE_POST', 'REPLY', 'LIKE');

-- CreateTable
CREATE TABLE "daily_task_defs" (
    "task_key" "DailyTaskKey" NOT NULL,
    "label" TEXT NOT NULL,
    "reward_g" INTEGER NOT NULL,
    "reward_exp" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_task_defs_pkey" PRIMARY KEY ("task_key")
);

-- CreateTable
CREATE TABLE "daily_task_progress" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "task_key" "DailyTaskKey" NOT NULL,
    "task_date" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_task_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_task_progress_user_id_task_date_idx" ON "daily_task_progress"("user_id", "task_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_task_progress_user_id_task_key_task_date_key" ON "daily_task_progress"("user_id", "task_key", "task_date");

-- AddForeignKey
ALTER TABLE "daily_task_progress" ADD CONSTRAINT "daily_task_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
