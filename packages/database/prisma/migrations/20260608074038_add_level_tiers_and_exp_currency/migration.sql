-- AlterEnum
ALTER TYPE "Currency" ADD VALUE 'EXP';

-- CreateTable
CREATE TABLE "level_tiers" (
    "level" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "min_exp" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "level_tiers_pkey" PRIMARY KEY ("level")
);
