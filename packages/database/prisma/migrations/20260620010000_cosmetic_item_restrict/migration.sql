-- 有人擁有的裝飾品項不可被硬刪：把 user_cosmetics.item_id FK 從 CASCADE 改為 RESTRICT
-- （Codex Phase1 #3：count+delete 非原子，併發購買會被 cascade 刪；改 RESTRICT 由 DB 保證）
ALTER TABLE "user_cosmetics" DROP CONSTRAINT "user_cosmetics_item_id_fkey";
ALTER TABLE "user_cosmetics" ADD CONSTRAINT "user_cosmetics_item_id_fkey"
  FOREIGN KEY ("item_id") REFERENCES "cosmetic_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
