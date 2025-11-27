-- ============================================
-- DATABASE FIX SCRIPT
-- Run this on Supabase SQL Editor
-- ============================================

-- 1. Add clerk_user_id column to itineraries table
-- This column is needed to query itineraries by Clerk user ID
ALTER TABLE itineraries
ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;

-- 2. Copy existing user_id data to clerk_user_id (if user_id exists)
-- This ensures existing data isn't lost
UPDATE itineraries i
SET clerk_user_id = u.clerk_id
FROM users u
WHERE i.user_id = u.id AND i.clerk_user_id IS NULL;

-- 3. Create index on clerk_user_id for performance
CREATE INDEX IF NOT EXISTS idx_itineraries_clerk_user_id ON itineraries(clerk_user_id);

-- 4. Create conversations table (if not exists)
-- This table is required for the chat feature
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id TEXT NOT NULL,
    title TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Create messages table (if not exists)
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Create indexes for conversations
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

-- 7. Create function to update conversation timestamp
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations
    SET updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Create trigger to auto-update conversation timestamp
DROP TRIGGER IF EXISTS update_conversation_on_message ON messages;
CREATE TRIGGER update_conversation_on_message
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION update_conversation_timestamp();

-- 9. Add helpful comments
COMMENT ON TABLE conversations IS 'Stores chat conversation sessions';
COMMENT ON TABLE messages IS 'Stores individual chat messages within conversations';
COMMENT ON COLUMN conversations.clerk_user_id IS 'Clerk user ID who owns this conversation';
COMMENT ON COLUMN messages.role IS 'Message role: user, assistant, or system';
COMMENT ON COLUMN itineraries.clerk_user_id IS 'Clerk user ID who owns this itinerary';

-- ============================================
-- VERIFICATION QUERIES
-- Run these to verify the fixes worked
-- ============================================

-- Check if clerk_user_id column exists in itineraries
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'itineraries' AND column_name = 'clerk_user_id';

-- Check if conversations table exists
SELECT table_name
FROM information_schema.tables
WHERE table_name IN ('conversations', 'messages');

-- Check indexes
SELECT indexname
FROM pg_indexes
WHERE tablename IN ('conversations', 'messages', 'itineraries')
ORDER BY tablename, indexname;
