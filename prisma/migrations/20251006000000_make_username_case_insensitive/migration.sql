-- Make usernames case-insensitive while maintaining uniqueness

-- Drop the unique constraint if it exists
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_username_key'
    ) THEN
        ALTER TABLE "users" DROP CONSTRAINT "users_username_key";
    END IF;
END $$;

-- Create a unique index on the lowercase version of username
CREATE UNIQUE INDEX IF NOT EXISTS "users_username_ci_key" ON "users" (LOWER("username"));