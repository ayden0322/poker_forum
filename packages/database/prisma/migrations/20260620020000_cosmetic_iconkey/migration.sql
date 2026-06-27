-- Route A：頭像框=CSS環、勳章=lucide icon、稱號=有色文字，全部不生圖。
-- 廢除 asset_url（不再用上傳圖檔），改用 icon_key 存勳章的 lucide 名稱。
ALTER TABLE "cosmetic_items" DROP COLUMN "asset_url";
ALTER TABLE "cosmetic_items" ADD COLUMN "icon_key" TEXT;
