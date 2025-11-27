-- ============================================
-- 🔴 RUN THIS SCRIPT IN SUPABASE SQL EDITOR
-- ============================================
-- This fixes all database issues
-- Copy and paste this ENTIRE file into Supabase SQL Editor and click RUN
-- ============================================

-- 1. Add missing columns to itineraries table
ALTER TABLE itineraries
ADD COLUMN IF NOT EXISTS clerk_user_id TEXT,
ADD COLUMN IF NOT EXISTS highlights TEXT[],
ADD COLUMN IF NOT EXISTS estimated_cost TEXT;

-- 2. Copy existing user_id data to clerk_user_id
UPDATE itineraries i
SET clerk_user_id = u.clerk_id
FROM users u
WHERE i.user_id = u.id AND i.clerk_user_id IS NULL;

-- 3. Create index on clerk_user_id
CREATE INDEX IF NOT EXISTS idx_itineraries_clerk_user_id ON itineraries(clerk_user_id);

-- 4. Create conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id TEXT NOT NULL,
    title TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Create messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Create indexes
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

-- 7. Create timestamp update function
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations
    SET updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Create trigger
DROP TRIGGER IF EXISTS update_conversation_on_message ON messages;
CREATE TRIGGER update_conversation_on_message
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION update_conversation_timestamp();

-- ============================================
-- ✅ DONE! Now verify it worked:
-- ============================================

-- Check if clerk_user_id exists
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'itineraries' AND column_name = 'clerk_user_id';

-- Check if conversations table exists
SELECT table_name
FROM information_schema.tables
WHERE table_name IN ('conversations', 'messages');
