-- Friends/Followers System
CREATE TABLE IF NOT EXISTS follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id TEXT NOT NULL,  -- clerk_id of the follower
  following_id TEXT NOT NULL, -- clerk_id of the person being followed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);

-- RLS Policies
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

-- Anyone can view follows
CREATE POLICY "Anyone can view follows" ON follows
  FOR SELECT USING (true);

-- Users can follow others
CREATE POLICY "Users can follow" ON follows
  FOR INSERT WITH CHECK (true);

-- Users can unfollow
CREATE POLICY "Users can unfollow" ON follows
  FOR DELETE USING (true);

-- Seed default challenges if not exists
INSERT INTO challenges (id, name, description, xp_reward, requirements)
SELECT * FROM (VALUES
  (gen_random_uuid(), 'First Steps', 'Create your first itinerary', 50, '{"type": "itinerary_count", "count": 1}'::jsonb),
  (gen_random_uuid(), 'Explorer', 'Create 5 itineraries', 150, '{"type": "itinerary_count", "count": 5}'::jsonb),
  (gen_random_uuid(), 'Pathfinder', 'Create 10 itineraries', 300, '{"type": "itinerary_count", "count": 10}'::jsonb),
  (gen_random_uuid(), 'Collector', 'Save 5 spots', 100, '{"type": "saved_spots", "count": 5}'::jsonb),
  (gen_random_uuid(), 'Curator', 'Save 20 spots', 250, '{"type": "saved_spots", "count": 20}'::jsonb),
  (gen_random_uuid(), 'Social Butterfly', 'Follow 3 explorers', 75, '{"type": "following_count", "count": 3}'::jsonb),
  (gen_random_uuid(), 'Influencer', 'Get 5 followers', 200, '{"type": "followers_count", "count": 5}'::jsonb),
  (gen_random_uuid(), 'Streak Starter', 'Maintain a 3-day streak', 100, '{"type": "streak", "days": 3}'::jsonb),
  (gen_random_uuid(), 'On Fire', 'Maintain a 7-day streak', 250, '{"type": "streak", "days": 7}'::jsonb),
  (gen_random_uuid(), 'Dedicated', 'Maintain a 30-day streak', 1000, '{"type": "streak", "days": 30}'::jsonb)
) AS v(id, name, description, xp_reward, requirements)
WHERE NOT EXISTS (SELECT 1 FROM challenges LIMIT 1);
