-- Subscriptions and Affiliate Tracking Schema for Localley
-- Run this in your Supabase SQL editor

-- ===========================================
-- SUBSCRIPTION TABLES
-- ===========================================

-- User subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    clerk_user_id TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'premium')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'trialing')),

    -- Stripe integration
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    stripe_price_id TEXT,

    -- Billing info
    billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'yearly')),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,

    -- Trial info
    trial_start TIMESTAMPTZ,
    trial_end TIMESTAMPTZ,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(clerk_user_id)
);

-- Usage tracking table (for rate limiting and tier enforcement)
CREATE TABLE IF NOT EXISTS usage_tracking (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    clerk_user_id TEXT NOT NULL,
    usage_type TEXT NOT NULL CHECK (usage_type IN (
        'itineraries_created',
        'chat_messages',
        'stories_created',
        'ai_images_generated',
        'spots_saved'
    )),
    count INTEGER DEFAULT 0,
    period_start DATE NOT NULL, -- Start of the tracking period (day/month)
    period_type TEXT NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(clerk_user_id, usage_type, period_start, period_type)
);

-- ===========================================
-- AFFILIATE TRACKING TABLES
-- ===========================================

-- Affiliate clicks/events table
CREATE TABLE IF NOT EXISTS affiliate_clicks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    clerk_user_id TEXT, -- Can be null for anonymous users
    partner TEXT NOT NULL CHECK (partner IN ('viator', 'booking', 'getyourguide', 'klook')),
    tracking_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('view', 'click', 'conversion')),
    activity_name TEXT,
    affiliate_url TEXT,

    -- Fraud prevention
    user_agent TEXT,
    ip_hash TEXT, -- Hashed IP for privacy

    -- Conversion tracking
    conversion_value DECIMAL(10, 2),
    commission_earned DECIMAL(10, 2),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Affiliate earnings summary (aggregated for dashboard)
CREATE TABLE IF NOT EXISTS affiliate_earnings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    partner TEXT NOT NULL,
    period_date DATE NOT NULL,
    clicks INTEGER DEFAULT 0,
    conversions INTEGER DEFAULT 0,
    total_value DECIMAL(10, 2) DEFAULT 0,
    commission_earned DECIMAL(10, 2) DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(partner, period_date)
);

-- ===========================================
-- INDEXES
-- ===========================================

-- Subscriptions indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_clerk_user_id ON subscriptions(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- Usage tracking indexes
CREATE INDEX IF NOT EXISTS idx_usage_tracking_user ON usage_tracking(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_period ON usage_tracking(period_start, period_type);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_composite ON usage_tracking(clerk_user_id, usage_type, period_start);

-- Affiliate clicks indexes
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_partner ON affiliate_clicks(partner);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_user ON affiliate_clicks(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_created ON affiliate_clicks(created_at);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_tracking ON affiliate_clicks(tracking_id);

-- Affiliate earnings indexes
CREATE INDEX IF NOT EXISTS idx_affiliate_earnings_partner_date ON affiliate_earnings(partner, period_date);

-- ===========================================
-- ROW LEVEL SECURITY
-- ===========================================

-- Enable RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_earnings ENABLE ROW LEVEL SECURITY;

-- Subscriptions policies (users can only see their own)
CREATE POLICY "Users can view own subscription"
    ON subscriptions FOR SELECT
    USING (clerk_user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Usage tracking policies
CREATE POLICY "Users can view own usage"
    ON usage_tracking FOR SELECT
    USING (clerk_user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Affiliate clicks - allow inserts from anyone (including anonymous)
CREATE POLICY "Allow affiliate click inserts"
    ON affiliate_clicks FOR INSERT
    WITH CHECK (true);

-- Affiliate earnings - admin only (service role)
CREATE POLICY "Admin only for earnings"
    ON affiliate_earnings FOR ALL
    USING (false);

-- ===========================================
-- FUNCTIONS
-- ===========================================

-- Function to get user's current tier
CREATE OR REPLACE FUNCTION get_user_tier(p_clerk_user_id TEXT)
RETURNS TEXT AS $$
DECLARE
    v_tier TEXT;
BEGIN
    SELECT tier INTO v_tier
    FROM subscriptions
    WHERE clerk_user_id = p_clerk_user_id
    AND status IN ('active', 'trialing');

    RETURN COALESCE(v_tier, 'free');
END;
$$ LANGUAGE plpgsql;

-- Function to increment usage
CREATE OR REPLACE FUNCTION increment_usage(
    p_clerk_user_id TEXT,
    p_usage_type TEXT,
    p_period_type TEXT DEFAULT 'monthly'
)
RETURNS INTEGER AS $$
DECLARE
    v_period_start DATE;
    v_new_count INTEGER;
BEGIN
    -- Calculate period start based on type
    IF p_period_type = 'daily' THEN
        v_period_start := CURRENT_DATE;
    ELSIF p_period_type = 'weekly' THEN
        v_period_start := DATE_TRUNC('week', CURRENT_DATE)::DATE;
    ELSE
        v_period_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
    END IF;

    -- Upsert usage record
    INSERT INTO usage_tracking (clerk_user_id, usage_type, period_start, period_type, count)
    VALUES (p_clerk_user_id, p_usage_type, v_period_start, p_period_type, 1)
    ON CONFLICT (clerk_user_id, usage_type, period_start, period_type)
    DO UPDATE SET
        count = usage_tracking.count + 1,
        updated_at = NOW()
    RETURNING count INTO v_new_count;

    RETURN v_new_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get current usage
CREATE OR REPLACE FUNCTION get_current_usage(
    p_clerk_user_id TEXT,
    p_usage_type TEXT,
    p_period_type TEXT DEFAULT 'monthly'
)
RETURNS INTEGER AS $$
DECLARE
    v_period_start DATE;
    v_count INTEGER;
BEGIN
    -- Calculate period start based on type
    IF p_period_type = 'daily' THEN
        v_period_start := CURRENT_DATE;
    ELSIF p_period_type = 'weekly' THEN
        v_period_start := DATE_TRUNC('week', CURRENT_DATE)::DATE;
    ELSE
        v_period_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
    END IF;

    SELECT count INTO v_count
    FROM usage_tracking
    WHERE clerk_user_id = p_clerk_user_id
    AND usage_type = p_usage_type
    AND period_start = v_period_start
    AND period_type = p_period_type;

    RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to aggregate daily affiliate stats
CREATE OR REPLACE FUNCTION aggregate_affiliate_stats()
RETURNS void AS $$
BEGIN
    INSERT INTO affiliate_earnings (partner, period_date, clicks, conversions, total_value, commission_earned)
    SELECT
        partner,
        DATE(created_at) as period_date,
        COUNT(*) FILTER (WHERE event_type = 'click') as clicks,
        COUNT(*) FILTER (WHERE event_type = 'conversion') as conversions,
        COALESCE(SUM(conversion_value) FILTER (WHERE event_type = 'conversion'), 0) as total_value,
        COALESCE(SUM(commission_earned) FILTER (WHERE event_type = 'conversion'), 0) as commission_earned
    FROM affiliate_clicks
    WHERE DATE(created_at) = CURRENT_DATE - INTERVAL '1 day'
    GROUP BY partner, DATE(created_at)
    ON CONFLICT (partner, period_date)
    DO UPDATE SET
        clicks = EXCLUDED.clicks,
        conversions = EXCLUDED.conversions,
        total_value = EXCLUDED.total_value,
        commission_earned = EXCLUDED.commission_earned,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- TRIGGERS
-- ===========================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER usage_tracking_updated_at
    BEFORE UPDATE ON usage_tracking
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ===========================================
-- INITIAL DATA (Default free subscription for existing users)
-- ===========================================

-- This will create free subscriptions for all existing users who don't have one
-- INSERT INTO subscriptions (clerk_user_id, tier, status)
-- SELECT clerk_id, 'free', 'active'
-- FROM users
-- WHERE clerk_id NOT IN (SELECT clerk_user_id FROM subscriptions);

COMMENT ON TABLE subscriptions IS 'User subscription information linked to Stripe';
COMMENT ON TABLE usage_tracking IS 'Tracks feature usage for tier limit enforcement';
COMMENT ON TABLE affiliate_clicks IS 'Raw affiliate click and conversion events';
COMMENT ON TABLE affiliate_earnings IS 'Aggregated affiliate earnings by partner and date';
