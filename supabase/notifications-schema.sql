-- Notifications Schema for Sprint 18
-- Push Notifications System

-- Notification types enum
CREATE TYPE notification_type AS ENUM (
    'achievement',      -- Achievement unlocked
    'level_up',         -- User leveled up
    'new_spot',         -- New spot in saved category/area
    'itinerary_shared', -- Someone shared itinerary with user
    'itinerary_liked',  -- Someone liked user's itinerary
    'review_helpful',   -- Someone found user's review helpful
    'friend_request',   -- Friend request received
    'friend_accepted',  -- Friend request accepted
    'challenge_start',  -- New challenge available
    'challenge_ending', -- Challenge ending soon
    'weekly_digest',    -- Weekly activity summary
    'system'            -- System announcements
);

-- Notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id TEXT NOT NULL,
    type notification_type NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}',  -- Additional payload (spot_id, itinerary_id, etc.)
    read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fetching user notifications
CREATE INDEX idx_notifications_user ON notifications(clerk_user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(clerk_user_id, read) WHERE read = false;

-- Push subscriptions for Web Push
CREATE TABLE push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id TEXT NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,  -- Public key
    auth TEXT NOT NULL,    -- Auth secret
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fetching user subscriptions
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(clerk_user_id);

-- Notification preferences
CREATE TABLE notification_preferences (
    clerk_user_id TEXT PRIMARY KEY,
    push_enabled BOOLEAN DEFAULT true,
    email_enabled BOOLEAN DEFAULT true,

    -- Notification type preferences
    achievements BOOLEAN DEFAULT true,
    level_ups BOOLEAN DEFAULT true,
    new_spots BOOLEAN DEFAULT true,
    social BOOLEAN DEFAULT true,        -- friend requests, likes, etc.
    challenges BOOLEAN DEFAULT true,
    weekly_digest BOOLEAN DEFAULT true,
    system BOOLEAN DEFAULT true,

    -- Quiet hours (optional)
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    timezone TEXT DEFAULT 'UTC',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function to create default preferences for new users
CREATE OR REPLACE FUNCTION create_notification_preferences()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO notification_preferences (clerk_user_id)
    VALUES (NEW.clerk_id)
    ON CONFLICT (clerk_user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-create preferences when user is created
CREATE TRIGGER create_notification_preferences_trigger
    AFTER INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION create_notification_preferences();

-- RLS Policies
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
CREATE POLICY notifications_select ON notifications
    FOR SELECT USING (clerk_user_id = current_setting('app.current_user_id', true));

CREATE POLICY notifications_update ON notifications
    FOR UPDATE USING (clerk_user_id = current_setting('app.current_user_id', true));

-- Users can only manage their own push subscriptions
CREATE POLICY push_subscriptions_all ON push_subscriptions
    FOR ALL USING (clerk_user_id = current_setting('app.current_user_id', true));

-- Users can only see/update their own preferences
CREATE POLICY notification_preferences_all ON notification_preferences
    FOR ALL USING (clerk_user_id = current_setting('app.current_user_id', true));
