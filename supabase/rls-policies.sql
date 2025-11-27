-- Row Level Security Policies for Localley App
-- This ensures users can only access their own data

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Users table policies
CREATE POLICY "Users can view their own profile"
    ON users FOR SELECT
    USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can update their own profile"
    ON users FOR UPDATE
    USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can insert their own profile"
    ON users FOR INSERT
    WITH CHECK (clerk_user_id = auth.jwt() ->> 'sub');

-- User progress policies
CREATE POLICY "Users can view their own progress"
    ON user_progress FOR SELECT
    USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can update their own progress"
    ON user_progress FOR UPDATE
    USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can insert their own progress"
    ON user_progress FOR INSERT
    WITH CHECK (clerk_user_id = auth.jwt() ->> 'sub');

-- Itineraries policies
CREATE POLICY "Users can view their own itineraries"
    ON itineraries FOR SELECT
    USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can create their own itineraries"
    ON itineraries FOR INSERT
    WITH CHECK (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can update their own itineraries"
    ON itineraries FOR UPDATE
    USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can delete their own itineraries"
    ON itineraries FOR DELETE
    USING (clerk_user_id = auth.jwt() ->> 'sub');

-- User challenges policies
CREATE POLICY "Users can view their own challenges"
    ON user_challenges FOR SELECT
    USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can update their own challenges"
    ON user_challenges FOR UPDATE
    USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can insert their own challenges"
    ON user_challenges FOR INSERT
    WITH CHECK (clerk_user_id = auth.jwt() ->> 'sub');

-- Conversations policies
CREATE POLICY "Users can view their own conversations"
    ON conversations FOR SELECT
    USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can create their own conversations"
    ON conversations FOR INSERT
    WITH CHECK (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can update their own conversations"
    ON conversations FOR UPDATE
    USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can delete their own conversations"
    ON conversations FOR DELETE
    USING (clerk_user_id = auth.jwt() ->> 'sub');

-- Messages policies
CREATE POLICY "Users can view messages in their conversations"
    ON messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = messages.conversation_id
            AND conversations.clerk_user_id = auth.jwt() ->> 'sub'
        )
    );

CREATE POLICY "Users can create messages in their conversations"
    ON messages FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = messages.conversation_id
            AND conversations.clerk_user_id = auth.jwt() ->> 'sub'
        )
    );

CREATE POLICY "Users can update messages in their conversations"
    ON messages FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = messages.conversation_id
            AND conversations.clerk_user_id = auth.jwt() ->> 'sub'
        )
    );

CREATE POLICY "Users can delete messages in their conversations"
    ON messages FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = messages.conversation_id
            AND conversations.clerk_user_id = auth.jwt() ->> 'sub'
        )
    );

-- Spots table - public read access, no write access for users
CREATE POLICY "Anyone can view spots"
    ON spots FOR SELECT
    TO authenticated, anon
    USING (true);

-- Challenges table - public read access
CREATE POLICY "Anyone can view challenges"
    ON challenges FOR SELECT
    TO authenticated, anon
    USING (true);
