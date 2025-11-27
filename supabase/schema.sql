-- Enable PostGIS for location support
CREATE EXTENSION IF NOT EXISTS postgis;

-- Users (via Clerk, synced to Supabase)
CREATE TABLE users (
  id UUID PRIMARY KEY,
  clerk_id TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE,
  email TEXT,
  level INTEGER DEFAULT 1,
  xp INTEGER DEFAULT 0,
  title TEXT DEFAULT 'Tourist',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spots
CREATE TABLE spots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name JSONB NOT NULL, -- Multi-language
  description JSONB NOT NULL,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  address JSONB NOT NULL,
  category TEXT NOT NULL,
  subcategories TEXT[],
  localley_score INTEGER CHECK (localley_score BETWEEN 1 AND 6),
  local_percentage INTEGER DEFAULT 50,
  best_times JSONB,
  photos TEXT[],
  tips JSONB,
  discovered_by UUID REFERENCES users(id),
  verified BOOLEAN DEFAULT false,
  trending_score FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Progress
CREATE TABLE user_progress (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  discoveries INTEGER DEFAULT 0,
  spots_visited INTEGER DEFAULT 0,
  tourist_traps_avoided INTEGER DEFAULT 0,
  current_streak INTEGER DEFAULT 0,
  achievements JSONB DEFAULT '[]',
  unlocked_cities TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Itineraries
CREATE TABLE itineraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  clerk_user_id TEXT, -- Clerk user ID for direct querying
  title TEXT NOT NULL,
  city TEXT NOT NULL,
  days INTEGER NOT NULL,
  activities JSONB NOT NULL,
  local_score FLOAT,
  highlights TEXT[],
  estimated_cost TEXT,
  shared BOOLEAN DEFAULT false,
  share_code TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Challenges
CREATE TABLE challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  city TEXT,
  xp_reward INTEGER NOT NULL,
  requirements JSONB,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Challenges
CREATE TABLE user_challenges (
  user_id UUID REFERENCES users(id),
  challenge_id UUID REFERENCES challenges(id),
  progress JSONB DEFAULT '{}',
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, challenge_id)
);

-- Conversations (Chat feature)
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT NOT NULL,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages (Chat messages)
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
