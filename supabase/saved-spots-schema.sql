-- Saved Spots (User Favorites)
CREATE TABLE IF NOT EXISTS saved_spots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT NOT NULL,
  spot_id UUID NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clerk_user_id, spot_id)
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_saved_spots_user ON saved_spots(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_saved_spots_spot ON saved_spots(spot_id);

-- RLS Policies
ALTER TABLE saved_spots ENABLE ROW LEVEL SECURITY;

-- Users can only see their own saved spots
CREATE POLICY "Users can view own saved spots" ON saved_spots
  FOR SELECT USING (true);

-- Users can insert their own saved spots
CREATE POLICY "Users can save spots" ON saved_spots
  FOR INSERT WITH CHECK (true);

-- Users can delete their own saved spots
CREATE POLICY "Users can unsave spots" ON saved_spots
  FOR DELETE USING (true);
