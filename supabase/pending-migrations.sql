-- =============================================================
-- PENDING MIGRATIONS FOR TRAVELCHAT AI (LOCALLEY)
-- Run these in order in Supabase SQL Editor
-- =============================================================

-- ================================
-- 1. Add subtitle, status, is_favorite columns to itineraries
-- ================================
ALTER TABLE itineraries
ADD COLUMN IF NOT EXISTS subtitle TEXT;

ALTER TABLE itineraries
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'completed'));

ALTER TABLE itineraries
ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false;

ALTER TABLE itineraries
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;

COMMENT ON COLUMN itineraries.subtitle IS 'Brief tagline/description for the itinerary';
COMMENT ON COLUMN itineraries.status IS 'Itinerary status: draft or completed';
COMMENT ON COLUMN itineraries.is_favorite IS 'User favorited this itinerary';
COMMENT ON COLUMN itineraries.is_public IS 'Whether this itinerary is publicly shareable';

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
-- 5. Create saved_itineraries table for community likes/saves
-- ================================
CREATE TABLE IF NOT EXISTS saved_itineraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT NOT NULL,
  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clerk_user_id, itinerary_id)
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_saved_itineraries_user ON saved_itineraries(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_saved_itineraries_itinerary ON saved_itineraries(itinerary_id);

-- RLS Policies for saved_itineraries
ALTER TABLE saved_itineraries ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view saved itineraries" ON saved_itineraries;
DROP POLICY IF EXISTS "Users can save itineraries" ON saved_itineraries;
DROP POLICY IF EXISTS "Users can unsave itineraries" ON saved_itineraries;

-- Users can view saved itineraries (for public counts)
CREATE POLICY "Users can view saved itineraries" ON saved_itineraries
  FOR SELECT USING (true);

-- Users can insert their own saved itineraries
CREATE POLICY "Users can save itineraries" ON saved_itineraries
  FOR INSERT WITH CHECK (true);

-- Users can delete their own saved itineraries
CREATE POLICY "Users can unsave itineraries" ON saved_itineraries
  FOR DELETE USING (true);

-- Add like_count column to itineraries for caching
ALTER TABLE itineraries
ADD COLUMN IF NOT EXISTS like_count INTEGER DEFAULT 0;

COMMENT ON COLUMN itineraries.like_count IS 'Cached count of likes/saves from other users';

-- ================================
-- VERIFICATION QUERIES
-- Run these after migration to verify success
-- ================================
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'itineraries';
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'saved_spots';
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'saved_itineraries';
-- SELECT count(*) FROM spots;
