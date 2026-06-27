-- CreateEnum
CREATE TYPE "CosmeticType" AS ENUM ('FRAME', 'BADGE', 'TITLE');

-- CreateEnum
CREATE TYPE "Rarity" AS ENUM ('COMMON', 'RARE', 'LEGENDARY');

-- CreateEnum
CREATE TYPE "CosmeticSource" AS ENUM ('SHOP', 'LEVEL', 'EVENT');

-- CreateEnum
CREATE TYPE "EquipSlot" AS ENUM ('FRAME', 'TITLE');

-- CreateTable
CREATE TABLE "cosmetic_items" (
    "id" TEXT NOT NULL,
    "type" "CosmeticType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "asset_url" TEXT,
    "rarity" "Rarity" NOT NULL DEFAULT 'COMMON',
    "price_g" INTEGER,
    "purchasable" BOOLEAN NOT NULL DEFAULT true,
    "level_required" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "available_from" TIMESTAMP(3),
    "available_to" TIMESTAMP(3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cosmetic_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_cosmetics" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "source" "CosmeticSource" NOT NULL DEFAULT 'SHOP',
    "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "equipped_slot" "EquipSlot",
    "is_main_badge" BOOLEAN NOT NULL DEFAULT false,
    "pinned_order" INTEGER,

    CONSTRAINT "user_cosmetics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cosmetic_items_type_enabled_idx" ON "cosmetic_items"("type", "enabled");

-- CreateIndex
CREATE INDEX "user_cosmetics_user_id_idx" ON "user_cosmetics"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_cosmetics_user_id_item_id_key" ON "user_cosmetics"("user_id", "item_id");

-- AddForeignKey
ALTER TABLE "user_cosmetics" ADD CONSTRAINT "user_cosmetics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_cosmetics" ADD CONSTRAINT "user_cosmetics_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "cosmetic_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Partial unique indexes（DB 層守住裝備/釘選不變量，不只靠 API）
-- 每使用者每槽至多 1 件裝備（FRAME/TITLE 各一）
CREATE UNIQUE INDEX "uc_one_equip_per_slot" ON "user_cosmetics"("user_id", "equipped_slot") WHERE "equipped_slot" IS NOT NULL;
-- 每使用者至多 1 枚主勳章
CREATE UNIQUE INDEX "uc_one_main_badge" ON "user_cosmetics"("user_id") WHERE "is_main_badge" = true;
-- 每使用者釘選位不重複（1..3）
CREATE UNIQUE INDEX "uc_unique_pin_slot" ON "user_cosmetics"("user_id", "pinned_order") WHERE "pinned_order" IS NOT NULL;
