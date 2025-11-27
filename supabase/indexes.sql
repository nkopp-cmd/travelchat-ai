-- Performance Optimization: Add indexes for frequently queried columns

-- Spots table indexes
CREATE INDEX IF NOT EXISTS idx_spots_category ON spots(category);
CREATE INDEX IF NOT EXISTS idx_spots_localley_score ON spots(localley_score);
CREATE INDEX IF NOT EXISTS idx_spots_trending_score ON spots(trending_score);
CREATE INDEX IF NOT EXISTS idx_spots_verified ON spots(verified);
CREATE INDEX IF NOT EXISTS idx_spots_created_at ON spots(created_at);

-- Composite index for common filter combinations
CREATE INDEX IF NOT EXISTS idx_spots_category_score ON spots(category, localley_score);

-- GiST index for location-based queries (PostGIS)
CREATE INDEX IF NOT EXISTS idx_spots_location ON spots USING GIST(location);

-- User progress indexes
CREATE INDEX IF NOT EXISTS idx_user_progress_clerk_id ON user_progress(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_level ON user_progress(level);
CREATE INDEX IF NOT EXISTS idx_user_progress_xp ON user_progress(xp);

-- Itineraries indexes
CREATE INDEX IF NOT EXISTS idx_itineraries_clerk_id ON itineraries(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_itineraries_city ON itineraries(city);
CREATE INDEX IF NOT EXISTS idx_itineraries_created_at ON itineraries(created_at);

-- User challenges indexes
CREATE INDEX IF NOT EXISTS idx_user_challenges_clerk_id ON user_challenges(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_user_challenges_completed ON user_challenges(completed);
CREATE INDEX IF NOT EXISTS idx_user_challenges_challenge_id ON user_challenges(challenge_id);

-- Composite index for active challenges
CREATE INDEX IF NOT EXISTS idx_user_challenges_active ON user_challenges(clerk_user_id, completed);

-- Conversations indexes
CREATE INDEX IF NOT EXISTS idx_conversations_clerk_user_id ON conversations(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);

-- Messages indexes
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Add comments for documentation
COMMENT ON INDEX idx_spots_category IS 'Optimize category filtering queries';
COMMENT ON INDEX idx_spots_location IS 'Optimize location-based searches';
COMMENT ON INDEX idx_user_progress_clerk_id IS 'Optimize user progress lookups';
COMMENT ON INDEX idx_itineraries_clerk_id IS 'Optimize user itinerary queries';
COMMENT ON INDEX idx_conversations_clerk_user_id IS 'Optimize conversation lookups by user';
COMMENT ON INDEX idx_messages_conversation_id IS 'Optimize message queries by conversation';
