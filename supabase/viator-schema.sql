-- Viator Integration Database Schema
-- Run this in your Supabase SQL Editor after the main schema

-- ============================================
-- VIATOR ACTIVITIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS viator_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  short_description TEXT,
  destination TEXT NOT NULL,
  city TEXT,
  category TEXT,
  subcategories TEXT[],
  duration TEXT,
  duration_minutes INTEGER,
  price_from DECIMAL(10,2),
  price_to DECIMAL(10,2),
  currency TEXT DEFAULT 'USD',
  rating DECIMAL(3,2),
  review_count INTEGER DEFAULT 0,
  images TEXT[],
  thumbnail_url TEXT,
  booking_url TEXT,
  viator_url TEXT,
  cancellation_policy TEXT,
  included TEXT[],
  excluded TEXT[],
  meeting_point TEXT,
  languages TEXT[],
  accessibility TEXT,
  max_travelers INTEGER,
  instant_confirmation BOOLEAN DEFAULT false,
  mobile_ticket BOOLEAN DEFAULT false,
  last_synced TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SPOT-ACTIVITY RELATIONSHIP TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS spot_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spot_id UUID REFERENCES spots(id) ON DELETE CASCADE,
  activity_id UUID REFERENCES viator_activities(id) ON DELETE CASCADE,
  relevance_score DECIMAL(3,2) DEFAULT 0.5,
  distance_km DECIMAL(5,2),
  auto_matched BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(spot_id, activity_id)
);

-- ============================================
-- VIATOR BOOKINGS TRACKING TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS viator_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  clerk_user_id TEXT,
  activity_id UUID REFERENCES viator_activities(id),
  product_code TEXT NOT NULL,
  booking_reference TEXT,
  viator_booking_id TEXT,
  status TEXT DEFAULT 'pending',
  travelers INTEGER DEFAULT 1,
  booking_date DATE,
  amount DECIMAL(10,2),
  currency TEXT DEFAULT 'USD',
  commission_rate DECIMAL(5,2),
  commission_amount DECIMAL(10,2),
  partner_url TEXT,
  utm_source TEXT,
  utm_campaign TEXT,
  booked_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

-- ============================================
-- VIATOR SEARCH CACHE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS viator_search_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_key TEXT UNIQUE NOT NULL,
  destination TEXT,
  category TEXT,
  results JSONB,
  result_count INTEGER,
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_viator_activities_destination ON viator_activities(destination);
CREATE INDEX IF NOT EXISTS idx_viator_activities_city ON viator_activities(city);
CREATE INDEX IF NOT EXISTS idx_viator_activities_category ON viator_activities(category);
CREATE INDEX IF NOT EXISTS idx_viator_activities_rating ON viator_activities(rating DESC);
CREATE INDEX IF NOT EXISTS idx_viator_activities_price ON viator_activities(price_from);
CREATE INDEX IF NOT EXISTS idx_spot_activities_spot_id ON spot_activities(spot_id);
CREATE INDEX IF NOT EXISTS idx_spot_activities_activity_id ON spot_activities(activity_id);
CREATE INDEX IF NOT EXISTS idx_viator_bookings_user_id ON viator_bookings(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_viator_bookings_status ON viator_bookings(status);
CREATE INDEX IF NOT EXISTS idx_viator_search_cache_key ON viator_search_cache(search_key);
CREATE INDEX IF NOT EXISTS idx_viator_search_cache_expires ON viator_search_cache(expires_at);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE viator_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE spot_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE viator_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE viator_search_cache ENABLE ROW LEVEL SECURITY;

-- Viator Activities: Public read access
CREATE POLICY "Public can view activities"
  ON viator_activities FOR SELECT
  USING (true);

-- Spot Activities: Public read access
CREATE POLICY "Public can view spot activities"
  ON spot_activities FOR SELECT
  USING (true);

-- Viator Bookings: Users can only see their own bookings
CREATE POLICY "Users can view own bookings"
  ON viator_bookings FOR SELECT
  USING (auth.uid()::text = clerk_user_id);

CREATE POLICY "Users can insert own bookings"
  ON viator_bookings FOR INSERT
  WITH CHECK (auth.uid()::text = clerk_user_id);

-- Search Cache: Public read access
CREATE POLICY "Public can view search cache"
  ON viator_search_cache FOR SELECT
  USING (true);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to clean expired cache entries
CREATE OR REPLACE FUNCTION clean_expired_viator_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM viator_search_cache
  WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to update activity sync timestamp
CREATE OR REPLACE FUNCTION update_viator_activity_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamp
CREATE TRIGGER update_viator_activity_timestamp
  BEFORE UPDATE ON viator_activities
  FOR EACH ROW
  EXECUTE FUNCTION update_viator_activity_timestamp();

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE viator_activities IS 'Stores Viator tours and activities data';
COMMENT ON TABLE spot_activities IS 'Links Localley spots with Viator activities';
COMMENT ON TABLE viator_bookings IS 'Tracks user bookings for commission attribution';
COMMENT ON TABLE viator_search_cache IS 'Caches Viator API search results to reduce API calls';
