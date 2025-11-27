-- =============================================================
-- PENDING MIGRATIONS FOR TRAVELCHAT AI (LOCALLEY)
-- Run these in order in Supabase SQL Editor
-- =============================================================

-- ================================
-- 1. Add subtitle column to itineraries
-- ================================
ALTER TABLE itineraries
ADD COLUMN IF NOT EXISTS subtitle TEXT;

COMMENT ON COLUMN itineraries.subtitle IS 'Brief tagline/description for the itinerary';

-- ================================
-- 2. Create saved_spots table
-- ================================
CREATE TABLE IF NOT EXISTS saved_spots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT NOT NULL,
  spot_id UUID NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clerk_user_id, spot_id)
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_saved_spots_user ON saved_spots(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_saved_spots_spot ON saved_spots(spot_id);

-- RLS Policies for saved_spots
ALTER TABLE saved_spots ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view own saved spots" ON saved_spots;
DROP POLICY IF EXISTS "Users can save spots" ON saved_spots;
DROP POLICY IF EXISTS "Users can unsave spots" ON saved_spots;

-- Users can view saved spots
CREATE POLICY "Users can view own saved spots" ON saved_spots
  FOR SELECT USING (true);

-- Users can insert their own saved spots
CREATE POLICY "Users can save spots" ON saved_spots
  FOR INSERT WITH CHECK (true);

-- Users can delete their own saved spots
CREATE POLICY "Users can unsave spots" ON saved_spots
  FOR DELETE USING (true);

-- ================================
-- 3. Fix users table - allow auto-generated UUID
-- ================================
-- Modify users table to allow auto-generated UUIDs if not already
ALTER TABLE users
ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- ================================
-- 4. Add missing indexes for performance
-- ================================
CREATE INDEX IF NOT EXISTS idx_itineraries_clerk_user_id ON itineraries(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_itineraries_city ON itineraries(city);
CREATE INDEX IF NOT EXISTS idx_spots_category ON spots(category);
CREATE INDEX IF NOT EXISTS idx_spots_localley_score ON spots(localley_score);

-- ================================
-- VERIFICATION QUERIES
-- Run these after migration to verify success
-- ================================
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'itineraries';
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'saved_spots';
-- SELECT count(*) FROM spots;
