-- Make usernames case-insensitive while maintaining uniqueness

-- First, remove the existing unique constraint on username
ALTER TABLE "users" DROP CONSTRAINT "users_username_key";

-- Create a unique index on the lowercase version of username
CREATE UNIQUE INDEX "users_username_ci_key" ON "users" (LOWER("username"));