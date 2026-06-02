-- CreateTable
CREATE TABLE "admin_page_permissions" (
    "id" TEXT NOT NULL,
    "page_key" TEXT NOT NULL,
    "allow_moderator" BOOLEAN NOT NULL DEFAULT false,
    "allow_admin" BOOLEAN NOT NULL DEFAULT false,
    "allow_super_admin" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_page_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_page_permissions_page_key_key" ON "admin_page_permissions"("page_key");
