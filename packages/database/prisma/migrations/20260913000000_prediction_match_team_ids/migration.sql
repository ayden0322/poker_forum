-- 競猜賽事卡顯示隊徽：保存 API-Sports 主客隊 id（nullable，舊資料由 cron 同步時自然補齊）
ALTER TABLE "prediction_matches" ADD COLUMN "home_team_id" INTEGER;
ALTER TABLE "prediction_matches" ADD COLUMN "away_team_id" INTEGER;
