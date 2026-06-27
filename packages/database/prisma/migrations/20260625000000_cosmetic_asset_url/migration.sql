-- Route A+：頭像框/勳章可用圖檔配件（電競軍階 PNG）。加回 asset_url（與 icon_key 並存）。
ALTER TABLE "cosmetic_items" ADD COLUMN "asset_url" TEXT;
