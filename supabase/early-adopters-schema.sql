-- ============================================================================
-- Early Adopters Schema
-- ============================================================================
-- Tracks the first 100 users who sign up during launch.
-- These users get permanent premium access as a thank you for being early.
--
-- Run this in Supabase SQL Editor to create the table.
-- ============================================================================

-- Create early_adopters table
CREATE TABLE IF NOT EXISTS early_adopters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id TEXT NOT NULL UNIQUE,
    email TEXT,
    position INTEGER NOT NULL,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,

    -- Constraints
    CONSTRAINT early_adopters_position_check CHECK (position > 0 AND position <= 100)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_early_adopters_clerk_user_id
    ON early_adopters(clerk_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_early_adopters_position
    ON early_adopters(position);

-- Add RLS (Row Level Security)
ALTER TABLE early_adopters ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything
CREATE POLICY "Service role full access on early_adopters"
    ON early_adopters
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Policy: Users can read their own early adopter status
CREATE POLICY "Users can read own early adopter status"
    ON early_adopters
    FOR SELECT
    TO authenticated
    USING (clerk_user_id = auth.jwt() ->> 'sub');

-- Add helpful comment
COMMENT ON TABLE early_adopters IS 'First 100 users get permanent premium access';
COMMENT ON COLUMN early_adopters.position IS 'Position in the early adopter queue (1-100)';
COMMENT ON COLUMN early_adopters.registered_at IS 'When the user became an early adopter';
