-- Migration: Fix RLS Policy Column Alignment
-- Purpose: Align RLS policies with actual table column names
--
-- Issues fixed:
-- 1. `users` table: RLS uses `clerk_user_id` but column is `clerk_id`
-- 2. `user_progress` table: RLS uses `clerk_user_id` but table only has `user_id` (UUID FK)
-- 3. `user_challenges` table: Same issue as user_progress
--
-- Solution:
-- - Fix `users` policy to use `clerk_id`
-- - Add `clerk_user_id` column to tables that need it for RLS
-- - Update policies to match actual columns

-- =============================================
-- Step 1: Drop existing policies that reference wrong columns
-- =============================================

-- Users table
DROP POLICY IF EXISTS "Users can view their own profile" ON users;
DROP POLICY IF EXISTS "Users can update their own profile" ON users;
DROP POLICY IF EXISTS "Users can insert their own profile" ON users;

-- User progress table
DROP POLICY IF EXISTS "Users can view their own progress" ON user_progress;
DROP POLICY IF EXISTS "Users can update their own progress" ON user_progress;
DROP POLICY IF EXISTS "Users can insert their own progress" ON user_progress;

-- User challenges table
DROP POLICY IF EXISTS "Users can view their own challenges" ON user_challenges;
DROP POLICY IF EXISTS "Users can update their own challenges" ON user_challenges;
DROP POLICY IF EXISTS "Users can insert their own challenges" ON user_challenges;

-- =============================================
-- Step 2: Add clerk_user_id column to tables that need it
-- =============================================

-- Add clerk_user_id to user_progress if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_progress' AND column_name = 'clerk_user_id'
    ) THEN
        ALTER TABLE user_progress ADD COLUMN clerk_user_id TEXT;

        -- Backfill from users table
        UPDATE user_progress up
        SET clerk_user_id = u.clerk_id
        FROM users u
        WHERE up.user_id = u.id;

        -- Create index for efficient lookups
        CREATE INDEX IF NOT EXISTS idx_user_progress_clerk_user_id
        ON user_progress(clerk_user_id);
    END IF;
END $$;

-- Add clerk_user_id to user_challenges if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_challenges' AND column_name = 'clerk_user_id'
    ) THEN
        ALTER TABLE user_challenges ADD COLUMN clerk_user_id TEXT;

        -- Backfill from users table
        UPDATE user_challenges uc
        SET clerk_user_id = u.clerk_id
        FROM users u
        WHERE uc.user_id = u.id;

        -- Create index for efficient lookups
        CREATE INDEX IF NOT EXISTS idx_user_challenges_clerk_user_id
        ON user_challenges(clerk_user_id);
    END IF;
END $$;

-- =============================================
-- Step 3: Create correct RLS policies
-- =============================================

-- Users table policies (use clerk_id which is the actual column)
CREATE POLICY "Users can view their own profile"
    ON users FOR SELECT
    USING (clerk_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can update their own profile"
    ON users FOR UPDATE
    USING (clerk_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can insert their own profile"
    ON users FOR INSERT
    WITH CHECK (clerk_id = auth.jwt() ->> 'sub');

-- User progress policies (now using clerk_user_id column we added)
CREATE POLICY "Users can view their own progress"
    ON user_progress FOR SELECT
    USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can update their own progress"
    ON user_progress FOR UPDATE
    USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can insert their own progress"
    ON user_progress FOR INSERT
    WITH CHECK (clerk_user_id = auth.jwt() ->> 'sub');

-- User challenges policies (now using clerk_user_id column we added)
CREATE POLICY "Users can view their own challenges"
    ON user_challenges FOR SELECT
    USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can update their own challenges"
    ON user_challenges FOR UPDATE
    USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can insert their own challenges"
    ON user_challenges FOR INSERT
    WITH CHECK (clerk_user_id = auth.jwt() ->> 'sub');

-- =============================================
-- Step 4: Add trigger to auto-populate clerk_user_id
-- =============================================

-- Trigger function to set clerk_user_id on insert
CREATE OR REPLACE FUNCTION set_clerk_user_id_from_user()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.clerk_user_id IS NULL AND NEW.user_id IS NOT NULL THEN
        SELECT clerk_id INTO NEW.clerk_user_id
        FROM users
        WHERE id = NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to user_progress
DROP TRIGGER IF EXISTS set_user_progress_clerk_user_id ON user_progress;
CREATE TRIGGER set_user_progress_clerk_user_id
    BEFORE INSERT ON user_progress
    FOR EACH ROW
    EXECUTE FUNCTION set_clerk_user_id_from_user();

-- Apply trigger to user_challenges
DROP TRIGGER IF EXISTS set_user_challenges_clerk_user_id ON user_challenges;
CREATE TRIGGER set_user_challenges_clerk_user_id
    BEFORE INSERT ON user_challenges
    FOR EACH ROW
    EXECUTE FUNCTION set_clerk_user_id_from_user();

-- =============================================
-- Verification query (run manually to verify)
-- =============================================
-- SELECT
--     'users' as table_name,
--     COUNT(*) as total,
--     COUNT(*) FILTER (WHERE clerk_id IS NOT NULL) as with_clerk_id
-- FROM users
-- UNION ALL
-- SELECT
--     'user_progress',
--     COUNT(*),
--     COUNT(*) FILTER (WHERE clerk_user_id IS NOT NULL)
-- FROM user_progress
-- UNION ALL
-- SELECT
--     'user_challenges',
--     COUNT(*),
--     COUNT(*) FILTER (WHERE clerk_user_id IS NOT NULL)
-- FROM user_challenges;

COMMENT ON COLUMN user_progress.clerk_user_id IS 'Clerk user ID for RLS policy matching. Auto-populated from users.clerk_id via trigger.';
COMMENT ON COLUMN user_challenges.clerk_user_id IS 'Clerk user ID for RLS policy matching. Auto-populated from users.clerk_id via trigger.';
