-- 後台「帳號級」權限：取代純角色層級的授權方式。
-- 每一列 = 某管理員帳號擁有某項權限（perm_key）。
--   page:<key>  頁面存取（與 page-registry 對齊）
--   cap:<...>   敏感能力（member:pii / member:impersonate / member:reset_password / post:batch_delete）
-- SUPER_ADMIN 一律 bypass、不寫列；「0 列」永遠只代表「被刻意清空」。

-- 1. 建表
CREATE TABLE "admin_permissions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "perm_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_permissions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_permissions_user_id_perm_key_key" ON "admin_permissions"("user_id", "perm_key");
CREATE INDEX "admin_permissions_user_id_idx" ON "admin_permissions"("user_id");
ALTER TABLE "admin_permissions" ADD CONSTRAINT "admin_permissions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Backfill（migration 天生只跑一次）：依現行角色矩陣，把每個 MODERATOR/ADMIN
--    能看的頁面與等效敏感能力，補成個人權限列。上線後現有管理員權限完全等價。
--    - news 併入 posts（去重）
--    - 凡擁有 page:members 者補回 PII / 代登入 / 重設密碼三項能力
--    - SUPER_ADMIN 不處理（bypass）；cap:post:batch_delete 不 backfill（現行僅超管）
--    - 全程冪等：ON CONFLICT (user_id, perm_key) DO NOTHING
WITH page_candidates AS (
  SELECT DISTINCT
    u."id" AS user_id,
    'page:' || CASE WHEN app."page_key" = 'news' THEN 'posts' ELSE app."page_key" END AS perm_key
  FROM "users" u
  JOIN "admin_page_permissions" app
    ON (
      (u."role" = 'MODERATOR' AND app."allow_moderator" IS TRUE)
      OR (u."role" = 'ADMIN' AND app."allow_admin" IS TRUE)
    )
  WHERE u."role" IN ('MODERATOR', 'ADMIN')
),
inserted_pages AS (
  INSERT INTO "admin_permissions" ("id", "user_id", "perm_key")
  SELECT gen_random_uuid()::text, pc.user_id, pc.perm_key
  FROM page_candidates pc
  ON CONFLICT ("user_id", "perm_key") DO NOTHING
  RETURNING "user_id", "perm_key"
),
member_users AS (
  SELECT DISTINCT pc.user_id FROM page_candidates pc WHERE pc.perm_key = 'page:members'
  UNION
  SELECT DISTINCT ip."user_id" FROM inserted_pages ip WHERE ip."perm_key" = 'page:members'
  UNION
  SELECT DISTINCT ap."user_id"
  FROM "admin_permissions" ap
  JOIN "users" u ON u."id" = ap."user_id"
  WHERE ap."perm_key" = 'page:members' AND u."role" IN ('MODERATOR', 'ADMIN')
),
cap_candidates AS (
  SELECT mu.user_id, caps.perm_key
  FROM member_users mu
  CROSS JOIN (
    VALUES ('cap:member:pii'), ('cap:member:impersonate'), ('cap:member:reset_password')
  ) AS caps(perm_key)
)
INSERT INTO "admin_permissions" ("id", "user_id", "perm_key")
SELECT gen_random_uuid()::text, cc.user_id, cc.perm_key
FROM cap_candidates cc
ON CONFLICT ("user_id", "perm_key") DO NOTHING;
