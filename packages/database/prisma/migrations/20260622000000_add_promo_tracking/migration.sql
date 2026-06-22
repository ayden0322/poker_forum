-- CreateEnum
CREATE TYPE "PromoStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "promo_partners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "note" TEXT,
    "status" "PromoStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promo_partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "channel" TEXT,
    "status" "PromoStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_visits" (
    "id" TEXT NOT NULL,
    "code_id" TEXT NOT NULL,
    "visitor_id" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "is_bot" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_referrals" (
    "id" TEXT NOT NULL,
    "code_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "visitor_id" TEXT,
    "reg_ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_referrals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "promo_codes_code_key" ON "promo_codes"("code");

-- CreateIndex
CREATE INDEX "promo_codes_partner_id_idx" ON "promo_codes"("partner_id");

-- CreateIndex
CREATE INDEX "promo_visits_code_id_created_at_idx" ON "promo_visits"("code_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "promo_visits_code_id_visitor_id_key" ON "promo_visits"("code_id", "visitor_id");

-- CreateIndex
CREATE UNIQUE INDEX "promo_referrals_user_id_key" ON "promo_referrals"("user_id");

-- CreateIndex
CREATE INDEX "promo_referrals_code_id_created_at_idx" ON "promo_referrals"("code_id", "created_at");

-- AddForeignKey
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "promo_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_visits" ADD CONSTRAINT "promo_visits_code_id_fkey" FOREIGN KEY ("code_id") REFERENCES "promo_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_referrals" ADD CONSTRAINT "promo_referrals_code_id_fkey" FOREIGN KEY ("code_id") REFERENCES "promo_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_referrals" ADD CONSTRAINT "promo_referrals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

