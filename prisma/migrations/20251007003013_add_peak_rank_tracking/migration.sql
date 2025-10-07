-- Add peak rank tracking fields to bootcampers table
ALTER TABLE "bootcampers" ADD COLUMN "peak_solo_tier" TEXT;
ALTER TABLE "bootcampers" ADD COLUMN "peak_solo_rank" TEXT;
ALTER TABLE "bootcampers" ADD COLUMN "peak_solo_lp" INTEGER;
ALTER TABLE "bootcampers" ADD COLUMN "peak_flex_tier" TEXT;
ALTER TABLE "bootcampers" ADD COLUMN "peak_flex_rank" TEXT;
ALTER TABLE "bootcampers" ADD COLUMN "peak_flex_lp" INTEGER;
ALTER TABLE "bootcampers" ADD COLUMN "peak_updated_at" TIMESTAMP(3);
