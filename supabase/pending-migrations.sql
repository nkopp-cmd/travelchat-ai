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
-- 6. Create spot_reviews table for user reviews
-- ================================
CREATE TABLE IF NOT EXISTS spot_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spot_id UUID NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  clerk_user_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  visit_date DATE,
  helpful_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(spot_id, clerk_user_id)
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_spot_reviews_spot ON spot_reviews(spot_id);
CREATE INDEX IF NOT EXISTS idx_spot_reviews_user ON spot_reviews(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_spot_reviews_rating ON spot_reviews(rating);

-- RLS Policies for spot_reviews
ALTER TABLE spot_reviews ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view reviews" ON spot_reviews;
DROP POLICY IF EXISTS "Users can create reviews" ON spot_reviews;
DROP POLICY IF EXISTS "Users can update own reviews" ON spot_reviews;
DROP POLICY IF EXISTS "Users can delete own reviews" ON spot_reviews;

-- Anyone can view reviews
CREATE POLICY "Anyone can view reviews" ON spot_reviews
  FOR SELECT USING (true);

-- Users can create reviews
CREATE POLICY "Users can create reviews" ON spot_reviews
  FOR INSERT WITH CHECK (true);

-- Users can update their own reviews
CREATE POLICY "Users can update own reviews" ON spot_reviews
  FOR UPDATE USING (true);

-- Users can delete their own reviews
CREATE POLICY "Users can delete own reviews" ON spot_reviews
  FOR DELETE USING (true);

-- ================================
-- 7. Create review_helpful_votes table
-- ================================
CREATE TABLE IF NOT EXISTS review_helpful_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES spot_reviews(id) ON DELETE CASCADE,
  clerk_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(review_id, clerk_user_id)
);

CREATE INDEX IF NOT EXISTS idx_review_votes_review ON review_helpful_votes(review_id);
CREATE INDEX IF NOT EXISTS idx_review_votes_user ON review_helpful_votes(clerk_user_id);

ALTER TABLE review_helpful_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view votes" ON review_helpful_votes;
DROP POLICY IF EXISTS "Users can vote" ON review_helpful_votes;
DROP POLICY IF EXISTS "Users can remove vote" ON review_helpful_votes;

CREATE POLICY "Anyone can view votes" ON review_helpful_votes
  FOR SELECT USING (true);

CREATE POLICY "Users can vote" ON review_helpful_votes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can remove vote" ON review_helpful_votes
  FOR DELETE USING (true);

-- Add review stats columns to spots table for caching
ALTER TABLE spots
ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS average_rating NUMERIC(2,1) DEFAULT 0;

COMMENT ON COLUMN spots.review_count IS 'Cached count of reviews';
COMMENT ON COLUMN spots.average_rating IS 'Cached average rating (1-5)';

-- ================================
-- VERIFICATION QUERIES
-- Run these after migration to verify success
-- ================================
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'itineraries';
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'saved_spots';
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'saved_itineraries';
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'spot_reviews';
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'review_helpful_votes';
-- SELECT count(*) FROM spots;
