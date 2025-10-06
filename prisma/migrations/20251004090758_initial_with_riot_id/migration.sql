-- CreateEnum
CREATE TYPE "BootcamperRole" AS ENUM ('pro', 'streamer', 'rookie');

-- CreateEnum
CREATE TYPE "BootcamperStatus" AS ENUM ('idle', 'in_game');

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('live', 'completed');

-- CreateTable
CREATE TABLE "bootcampers" (
    "id" TEXT NOT NULL,
    "riot_id" TEXT,
    "summoner_name" TEXT NOT NULL,
    "summoner_id" TEXT NOT NULL,
    "puuid" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "twitch_login" TEXT,
    "twitch_user_id" TEXT,
    "role" "BootcamperRole",
    "start_date" DATE NOT NULL,
    "planned_end_date" DATE NOT NULL,
    "actual_end_date" DATE,
    "status" "BootcamperStatus" NOT NULL DEFAULT 'idle',
    "last_game_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bootcampers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" TEXT NOT NULL,
    "riot_game_id" TEXT NOT NULL,
    "bootcamper_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "status" "GameStatus" NOT NULL,
    "match_data" JSONB,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "twitch_streams" (
    "id" TEXT NOT NULL,
    "bootcamper_id" TEXT NOT NULL,
    "twitch_user_id" TEXT NOT NULL,
    "stream_url" TEXT NOT NULL,
    "live" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "last_checked" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "twitch_streams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "team_id" TEXT NOT NULL,
    "bootcamper_id" TEXT NOT NULL,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("team_id","bootcamper_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bootcampers_summoner_id_key" ON "bootcampers"("summoner_id");

-- CreateIndex
CREATE UNIQUE INDEX "bootcampers_puuid_key" ON "bootcampers"("puuid");

-- CreateIndex
CREATE UNIQUE INDEX "games_riot_game_id_bootcamper_id_key" ON "games"("riot_game_id", "bootcamper_id");

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_bootcamper_id_fkey" FOREIGN KEY ("bootcamper_id") REFERENCES "bootcampers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "twitch_streams" ADD CONSTRAINT "twitch_streams_bootcamper_id_fkey" FOREIGN KEY ("bootcamper_id") REFERENCES "bootcampers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_bootcamper_id_fkey" FOREIGN KEY ("bootcamper_id") REFERENCES "bootcampers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
