-- Migration 006: Multi-city itinerary support
-- Adds transport connections table and extends itineraries for multi-city trips

-- ============================================
-- Transport connections between cities
-- ============================================
CREATE TABLE IF NOT EXISTS city_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_city TEXT NOT NULL,
  to_city TEXT NOT NULL,
  transport_type TEXT NOT NULL CHECK (transport_type IN ('flight', 'train', 'bus', 'ferry')),
  provider TEXT,
  duration_minutes INTEGER,
  price_estimate JSONB,  -- { "currency": "USD", "min": 50, "max": 120 }
  frequency TEXT,        -- 'hourly', 'daily', '3x daily', etc.
  notes TEXT,
  booking_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_city, to_city, transport_type, COALESCE(provider, ''))
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_city_connections_from ON city_connections(from_city);
CREATE INDEX IF NOT EXISTS idx_city_connections_to ON city_connections(to_city);
CREATE INDEX IF NOT EXISTS idx_city_connections_route ON city_connections(from_city, to_city);

-- ============================================
-- Extend itineraries table for multi-city
-- ============================================
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS cities TEXT[];
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS is_multi_city BOOLEAN DEFAULT false;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS transport_plan JSONB;
-- transport_plan format: [{ "day": 2, "fromCity": "tokyo", "toCity": "osaka", "type": "train", "provider": "Shinkansen", "duration": "2h30m", "cost": "$80" }]

-- ============================================
-- RLS policies for city_connections (public read)
-- ============================================
ALTER TABLE city_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "city_connections_public_read" ON city_connections;
CREATE POLICY "city_connections_public_read" ON city_connections
  FOR SELECT USING (true);

-- Only service role can insert/update/delete
DROP POLICY IF EXISTS "city_connections_service_write" ON city_connections;
CREATE POLICY "city_connections_service_write" ON city_connections
  FOR ALL USING (auth.role() = 'service_role');
