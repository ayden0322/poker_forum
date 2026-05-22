-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."EmailVerifyPurpose" AS ENUM ('PHONE_CHANGE');

-- CreateEnum
CREATE TYPE "public"."FeedbackStatus" AS ENUM ('PENDING', 'REVIEWING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."FeedbackType" AS ENUM ('BUG', 'SUGGESTION');

-- CreateEnum
CREATE TYPE "public"."NotificationType" AS ENUM ('REPLY', 'PUSH', 'FOLLOW', 'SYSTEM');

-- CreateEnum
CREATE TYPE "public"."ReportStatus" AS ENUM ('PENDING', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('USER', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "public"."UserStatus" AS ENUM ('ACTIVE', 'BANNED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "public"."VerifyPurpose" AS ENUM ('BIND', 'CHANGE');

-- CreateTable
CREATE TABLE "public"."banned_ips" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "banned_ips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."boards" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."bookmarks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."email_verifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "purpose" "public"."EmailVerifyPurpose" NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."feedback_replies" (
    "id" TEXT NOT NULL,
    "feedback_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."feedbacks" (
    "id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "type" "public"."FeedbackType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "public"."FeedbackStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."follows" (
    "id" TEXT NOT NULL,
    "follower_id" TEXT NOT NULL,
    "following_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."lottery_results" (
    "id" TEXT NOT NULL,
    "game_type" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "draw_date" TIMESTAMP(3) NOT NULL,
    "numbers" JSONB NOT NULL,
    "special_num" JSONB,
    "jackpot" BIGINT,
    "total_sales" BIGINT,
    "prize_detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lottery_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."marquees" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marquees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "public"."NotificationType" NOT NULL,
    "content" TEXT NOT NULL,
    "source_url" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."oauth_providers" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."password_resets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."phone_verifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "purpose" "public"."VerifyPurpose" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."post_tags" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    CONSTRAINT "post_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."posts" (
    "id" TEXT NOT NULL,
    "board_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "is_announce" BOOLEAN NOT NULL DEFAULT false,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "reply_count" INTEGER NOT NULL DEFAULT 0,
    "push_count" INTEGER NOT NULL DEFAULT 0,
    "last_reply_at" TIMESTAMP(3),
    "last_reply_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."pushes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "post_id" TEXT,
    "reply_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pushes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."replies" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "floor_number" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "quoted_reply_id" TEXT,
    "push_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."reports" (
    "id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "post_id" TEXT,
    "reply_id" TEXT,
    "reason" TEXT NOT NULL,
    "status" "public"."ReportStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."sms_provider_configs" (
    "id" TEXT NOT NULL,
    "provider_code" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "api_endpoint" TEXT NOT NULL,
    "api_key_enc" TEXT NOT NULL,
    "api_secret_enc" TEXT,
    "sender_id" TEXT,
    "template_id" TEXT,
    "extra_config" JSONB,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."sports_configs" (
    "id" TEXT NOT NULL,
    "board_slug" TEXT NOT NULL,
    "sport_type" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "api_host" TEXT NOT NULL,
    "league_id" INTEGER NOT NULL,
    "season" TEXT NOT NULL,
    "cache_ttl" JSONB NOT NULL DEFAULT '{}',
    "extra_config" JSONB,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sports_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."translation_usage" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "cost_usd" DOUBLE PRECISION NOT NULL,
    "entity_type" TEXT,
    "item_count" INTEGER NOT NULL,
    "triggered_by" TEXT NOT NULL DEFAULT 'cron',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "translation_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."translations" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "api_id" INTEGER NOT NULL,
    "sport" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_zh_tw" TEXT NOT NULL,
    "short_name" TEXT,
    "nickname" TEXT,
    "logo" TEXT,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "bio" TEXT,
    "bio_zh_tw" TEXT,
    "extra" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_lottery_picks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "game_type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "numbers" JSONB NOT NULL,
    "special_num" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_lottery_picks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "account" TEXT,
    "password_hash" TEXT,
    "email" TEXT,
    "avatar" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "role" "public"."Role" NOT NULL DEFAULT 'USER',
    "status" "public"."UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login_ip" TEXT,
    "last_login_at" TIMESTAMP(3),
    "phone" TEXT,
    "phone_changed_at" TIMESTAMP(3),
    "phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "phone_verified_at" TIMESTAMP(3),
    "phone_verification_bypass" BOOLEAN NOT NULL DEFAULT false,
    "phone_verification_bypass_reason" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."world_cup_matches" (
    "id" SERIAL NOT NULL,
    "match_number" INTEGER NOT NULL,
    "round" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "group_name" TEXT,
    "kickoff_at" TIMESTAMP(3) NOT NULL,
    "venue" TEXT NOT NULL,
    "home_team_id" INTEGER,
    "away_team_id" INTEGER,
    "home_placeholder" TEXT,
    "away_placeholder" TEXT,
    "home_score" INTEGER,
    "away_score" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "live_minute" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "world_cup_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."world_cup_teams" (
    "id" SERIAL NOT NULL,
    "fifa_code" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_zh" TEXT,
    "flag_emoji" TEXT,
    "group_name" TEXT,
    "continent" TEXT,
    "confed" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "world_cup_teams_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "banned_ips_ip_key" ON "public"."banned_ips"("ip" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "boards_slug_key" ON "public"."boards"("slug" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "bookmarks_user_id_post_id_key" ON "public"."bookmarks"("user_id" ASC, "post_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "public"."categories"("slug" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "email_verifications_token_key" ON "public"."email_verifications"("token" ASC);

-- CreateIndex
CREATE INDEX "email_verifications_user_id_purpose_idx" ON "public"."email_verifications"("user_id" ASC, "purpose" ASC);

-- CreateIndex
CREATE INDEX "feedback_replies_feedback_id_idx" ON "public"."feedback_replies"("feedback_id" ASC);

-- CreateIndex
CREATE INDEX "feedbacks_author_id_idx" ON "public"."feedbacks"("author_id" ASC);

-- CreateIndex
CREATE INDEX "feedbacks_status_idx" ON "public"."feedbacks"("status" ASC);

-- CreateIndex
CREATE INDEX "feedbacks_type_idx" ON "public"."feedbacks"("type" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "follows_follower_id_following_id_key" ON "public"."follows"("follower_id" ASC, "following_id" ASC);

-- CreateIndex
CREATE INDEX "lottery_results_game_type_draw_date_idx" ON "public"."lottery_results"("game_type" ASC, "draw_date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "lottery_results_game_type_period_key" ON "public"."lottery_results"("game_type" ASC, "period" ASC);

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "public"."notifications"("user_id" ASC, "is_read" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "oauth_providers_provider_provider_id_key" ON "public"."oauth_providers"("provider" ASC, "provider_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_token_key" ON "public"."password_resets"("token" ASC);

-- CreateIndex
CREATE INDEX "password_resets_user_id_idx" ON "public"."password_resets"("user_id" ASC);

-- CreateIndex
CREATE INDEX "phone_verifications_phone_idx" ON "public"."phone_verifications"("phone" ASC);

-- CreateIndex
CREATE INDEX "phone_verifications_user_id_purpose_idx" ON "public"."phone_verifications"("user_id" ASC, "purpose" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "post_tags_post_id_tag_id_key" ON "public"."post_tags"("post_id" ASC, "tag_id" ASC);

-- CreateIndex
CREATE INDEX "posts_author_id_idx" ON "public"."posts"("author_id" ASC);

-- CreateIndex
CREATE INDEX "posts_board_id_created_at_idx" ON "public"."posts"("board_id" ASC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "posts_board_id_last_reply_at_idx" ON "public"."posts"("board_id" ASC, "last_reply_at" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "pushes_user_id_post_id_key" ON "public"."pushes"("user_id" ASC, "post_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "pushes_user_id_reply_id_key" ON "public"."pushes"("user_id" ASC, "reply_id" ASC);

-- CreateIndex
CREATE INDEX "replies_post_id_floor_number_idx" ON "public"."replies"("post_id" ASC, "floor_number" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "sms_provider_configs_provider_code_key" ON "public"."sms_provider_configs"("provider_code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "sports_configs_board_slug_key" ON "public"."sports_configs"("board_slug" ASC);

-- CreateIndex
CREATE INDEX "sports_configs_sport_type_idx" ON "public"."sports_configs"("sport_type" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "public"."tags"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "tags_slug_key" ON "public"."tags"("slug" ASC);

-- CreateIndex
CREATE INDEX "translation_usage_date_idx" ON "public"."translation_usage"("date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "translations_entity_type_api_id_sport_key" ON "public"."translations"("entity_type" ASC, "api_id" ASC, "sport" ASC);

-- CreateIndex
CREATE INDEX "translations_entity_type_sport_idx" ON "public"."translations"("entity_type" ASC, "sport" ASC);

-- CreateIndex
CREATE INDEX "translations_verified_idx" ON "public"."translations"("verified" ASC);

-- CreateIndex
CREATE INDEX "user_lottery_picks_user_id_game_type_idx" ON "public"."user_lottery_picks"("user_id" ASC, "game_type" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_account_key" ON "public"."users"("account" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_nickname_key" ON "public"."users"("nickname" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "public"."users"("phone" ASC);

-- CreateIndex
CREATE INDEX "world_cup_matches_group_name_idx" ON "public"."world_cup_matches"("group_name" ASC);

-- CreateIndex
CREATE INDEX "world_cup_matches_kickoff_at_idx" ON "public"."world_cup_matches"("kickoff_at" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "world_cup_matches_match_number_key" ON "public"."world_cup_matches"("match_number" ASC);

-- CreateIndex
CREATE INDEX "world_cup_matches_stage_idx" ON "public"."world_cup_matches"("stage" ASC);

-- CreateIndex
CREATE INDEX "world_cup_matches_status_idx" ON "public"."world_cup_matches"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "world_cup_teams_fifa_code_key" ON "public"."world_cup_teams"("fifa_code" ASC);

-- CreateIndex
CREATE INDEX "world_cup_teams_group_name_idx" ON "public"."world_cup_teams"("group_name" ASC);

-- AddForeignKey
ALTER TABLE "public"."boards" ADD CONSTRAINT "boards_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bookmarks" ADD CONSTRAINT "bookmarks_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bookmarks" ADD CONSTRAINT "bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."email_verifications" ADD CONSTRAINT "email_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."feedback_replies" ADD CONSTRAINT "feedback_replies_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."feedback_replies" ADD CONSTRAINT "feedback_replies_feedback_id_fkey" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedbacks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."feedbacks" ADD CONSTRAINT "feedbacks_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."follows" ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."follows" ADD CONSTRAINT "follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."oauth_providers" ADD CONSTRAINT "oauth_providers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."password_resets" ADD CONSTRAINT "password_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."phone_verifications" ADD CONSTRAINT "phone_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."post_tags" ADD CONSTRAINT "post_tags_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."post_tags" ADD CONSTRAINT "post_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."posts" ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."posts" ADD CONSTRAINT "posts_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pushes" ADD CONSTRAINT "pushes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pushes" ADD CONSTRAINT "pushes_reply_id_fkey" FOREIGN KEY ("reply_id") REFERENCES "public"."replies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pushes" ADD CONSTRAINT "pushes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."replies" ADD CONSTRAINT "replies_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."replies" ADD CONSTRAINT "replies_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."replies" ADD CONSTRAINT "replies_quoted_reply_id_fkey" FOREIGN KEY ("quoted_reply_id") REFERENCES "public"."replies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reports" ADD CONSTRAINT "reports_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reports" ADD CONSTRAINT "reports_reply_id_fkey" FOREIGN KEY ("reply_id") REFERENCES "public"."replies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_lottery_picks" ADD CONSTRAINT "user_lottery_picks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."world_cup_matches" ADD CONSTRAINT "world_cup_matches_away_team_id_fkey" FOREIGN KEY ("away_team_id") REFERENCES "public"."world_cup_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."world_cup_matches" ADD CONSTRAINT "world_cup_matches_home_team_id_fkey" FOREIGN KEY ("home_team_id") REFERENCES "public"."world_cup_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

