-- AlterEnum: Add 'in_progress' to GameStatus enum
ALTER TYPE "GameStatus" ADD VALUE 'in_progress';

-- Update existing 'live' games to 'in_progress' for consistency
UPDATE "games" SET "status" = 'in_progress' WHERE "status" = 'live';
