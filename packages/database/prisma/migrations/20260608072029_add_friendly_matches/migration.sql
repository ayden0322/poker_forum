-- CreateTable
CREATE TABLE "friendly_teams" (
    "id" SERIAL NOT NULL,
    "api_team_id" INTEGER NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_zh" TEXT,
    "logo_url" TEXT,
    "country" TEXT,
    "is_marquee" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "friendly_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friendly_matches" (
    "id" SERIAL NOT NULL,
    "api_fixture_id" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "round" TEXT,
    "kickoff_at" TIMESTAMP(3) NOT NULL,
    "venue" TEXT,
    "venue_city" TEXT,
    "home_team_id" INTEGER NOT NULL,
    "away_team_id" INTEGER NOT NULL,
    "home_score" INTEGER,
    "away_score" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "status_short" TEXT,
    "live_minute" INTEGER,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "friendly_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "friendly_teams_api_team_id_key" ON "friendly_teams"("api_team_id");

-- CreateIndex
CREATE UNIQUE INDEX "friendly_matches_api_fixture_id_key" ON "friendly_matches"("api_fixture_id");

-- CreateIndex
CREATE INDEX "friendly_matches_kickoff_at_idx" ON "friendly_matches"("kickoff_at");

-- CreateIndex
CREATE INDEX "friendly_matches_status_idx" ON "friendly_matches"("status");

-- CreateIndex
CREATE INDEX "friendly_matches_is_featured_idx" ON "friendly_matches"("is_featured");

-- AddForeignKey
ALTER TABLE "friendly_matches" ADD CONSTRAINT "friendly_matches_home_team_id_fkey" FOREIGN KEY ("home_team_id") REFERENCES "friendly_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendly_matches" ADD CONSTRAINT "friendly_matches_away_team_id_fkey" FOREIGN KEY ("away_team_id") REFERENCES "friendly_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
