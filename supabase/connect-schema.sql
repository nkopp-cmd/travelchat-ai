-- Stripe Connect: Guide/Creator Revenue Sharing Schema
-- Run this in your Supabase SQL editor

-- ===========================================
-- GUIDE PROFILES
-- ===========================================

-- Guide profiles with Stripe Connect account info
CREATE TABLE IF NOT EXISTS guide_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    clerk_user_id TEXT NOT NULL UNIQUE,

    -- Application
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    approved_by TEXT, -- Admin clerk_user_id

    -- Stripe Connect
    stripe_account_id TEXT UNIQUE,
    stripe_onboarding_complete BOOLEAN DEFAULT FALSE,
    stripe_charges_enabled BOOLEAN DEFAULT FALSE,
    stripe_payouts_enabled BOOLEAN DEFAULT FALSE,

    -- Profile
    bio TEXT,
    specialties TEXT[], -- e.g., {'food', 'culture', 'nightlife'}
    cities TEXT[], -- e.g., {'seoul', 'tokyo'}

    -- Revenue share settings
    revenue_share_percent NUMERIC(5, 2) DEFAULT 20.00, -- Default 20% of attributed revenue
    minimum_payout NUMERIC(10, 2) DEFAULT 10.00, -- Minimum $10 payout threshold

    -- Stats (denormalized for quick access)
    total_earned NUMERIC(10, 2) DEFAULT 0,
    total_paid_out NUMERIC(10, 2) DEFAULT 0,
    pending_balance NUMERIC(10, 2) DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- CONTENT ENGAGEMENT TRACKING
-- ===========================================

-- Tracks paid subscriber engagement with guide content
-- Used for monthly revenue share calculation
CREATE TABLE IF NOT EXISTS content_engagement (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- Who engaged
    viewer_clerk_user_id TEXT NOT NULL,
    viewer_tier TEXT NOT NULL CHECK (viewer_tier IN ('pro', 'premium')), -- Only paid subscribers count

    -- What content
    content_type TEXT NOT NULL CHECK (content_type IN ('itinerary_view', 'itinerary_save', 'spot_view', 'spot_save')),
    content_id TEXT NOT NULL, -- Itinerary or Spot ID

    -- Who created the content (the guide who earns)
    creator_clerk_user_id TEXT NOT NULL,

    -- Engagement value (weighted)
    -- itinerary_view=1, itinerary_save=3, spot_view=1, spot_save=2
    engagement_points INTEGER NOT NULL DEFAULT 1,

    -- Period tracking
    engagement_date DATE NOT NULL DEFAULT CURRENT_DATE,
    engagement_month DATE NOT NULL DEFAULT DATE_TRUNC('month', CURRENT_DATE)::DATE,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Deduplicate: max 1 engagement per user per content per type per day
    UNIQUE(viewer_clerk_user_id, content_type, content_id, engagement_date)
);

-- ===========================================
-- GUIDE EARNINGS
-- ===========================================

-- Monthly earnings records
CREATE TABLE IF NOT EXISTS guide_earnings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    guide_clerk_user_id TEXT NOT NULL,

    -- Period
    earning_month DATE NOT NULL, -- First day of the month

    -- Calculation details
    total_engagement_points INTEGER DEFAULT 0,
    platform_engagement_points INTEGER DEFAULT 0, -- Total points across all guides that month
    subscription_revenue NUMERIC(10, 2) DEFAULT 0, -- Total subscription revenue that month
    revenue_pool NUMERIC(10, 2) DEFAULT 0, -- 20-30% of subscription revenue

    -- Guide's share
    share_percent NUMERIC(8, 6) DEFAULT 0, -- guide_points / platform_points
    gross_amount NUMERIC(10, 2) DEFAULT 0, -- Before Stripe fees
    stripe_fee NUMERIC(10, 2) DEFAULT 0,
    net_amount NUMERIC(10, 2) DEFAULT 0, -- After Stripe fees

    -- Payout status
    status TEXT NOT NULL DEFAULT 'calculated' CHECK (status IN (
        'calculated',  -- Monthly calculation done
        'approved',    -- Admin approved for payout
        'processing',  -- Stripe transfer initiated
        'paid',        -- Successfully transferred
        'failed',      -- Transfer failed
        'below_minimum' -- Below minimum payout threshold, rolls over
    )),

    stripe_transfer_id TEXT,
    paid_at TIMESTAMPTZ,

    -- Rollover from previous months (if below minimum)
    rollover_amount NUMERIC(10, 2) DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(guide_clerk_user_id, earning_month)
);

-- ===========================================
-- INDEXES
-- ===========================================

-- Guide profiles
CREATE INDEX IF NOT EXISTS idx_guide_profiles_status ON guide_profiles(status);
CREATE INDEX IF NOT EXISTS idx_guide_profiles_stripe ON guide_profiles(stripe_account_id);

-- Content engagement
CREATE INDEX IF NOT EXISTS idx_engagement_creator ON content_engagement(creator_clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_engagement_month ON content_engagement(engagement_month);
CREATE INDEX IF NOT EXISTS idx_engagement_creator_month ON content_engagement(creator_clerk_user_id, engagement_month);
CREATE INDEX IF NOT EXISTS idx_engagement_date ON content_engagement(engagement_date);

-- Guide earnings
CREATE INDEX IF NOT EXISTS idx_earnings_guide ON guide_earnings(guide_clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_earnings_month ON guide_earnings(earning_month);
CREATE INDEX IF NOT EXISTS idx_earnings_status ON guide_earnings(status);

-- ===========================================
-- ROW LEVEL SECURITY
-- ===========================================

ALTER TABLE guide_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_engagement ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_earnings ENABLE ROW LEVEL SECURITY;

-- Guides can view their own profile
CREATE POLICY "Guides can view own profile"
    ON guide_profiles FOR SELECT
    USING (clerk_user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Content engagement: service role only (tracked server-side)
CREATE POLICY "Service role only for engagement"
    ON content_engagement FOR ALL
    USING (false);

-- Guides can view their own earnings
CREATE POLICY "Guides can view own earnings"
    ON guide_earnings FOR SELECT
    USING (guide_clerk_user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- ===========================================
-- FUNCTIONS
-- ===========================================

-- Track engagement (with deduplication)
CREATE OR REPLACE FUNCTION track_content_engagement(
    p_viewer_clerk_user_id TEXT,
    p_viewer_tier TEXT,
    p_content_type TEXT,
    p_content_id TEXT,
    p_creator_clerk_user_id TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_points INTEGER;
BEGIN
    -- Only track paid subscribers
    IF p_viewer_tier NOT IN ('pro', 'premium') THEN
        RETURN FALSE;
    END IF;

    -- Don't track self-engagement
    IF p_viewer_clerk_user_id = p_creator_clerk_user_id THEN
        RETURN FALSE;
    END IF;

    -- Assign engagement points by type
    v_points := CASE p_content_type
        WHEN 'itinerary_view' THEN 1
        WHEN 'itinerary_save' THEN 3
        WHEN 'spot_view' THEN 1
        WHEN 'spot_save' THEN 2
        ELSE 1
    END;

    -- Insert with deduplication (unique constraint handles conflicts)
    INSERT INTO content_engagement (
        viewer_clerk_user_id, viewer_tier, content_type, content_id,
        creator_clerk_user_id, engagement_points, engagement_date, engagement_month
    ) VALUES (
        p_viewer_clerk_user_id, p_viewer_tier, p_content_type, p_content_id,
        p_creator_clerk_user_id, v_points, CURRENT_DATE, DATE_TRUNC('month', CURRENT_DATE)::DATE
    )
    ON CONFLICT (viewer_clerk_user_id, content_type, content_id, engagement_date) DO NOTHING;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Calculate monthly earnings for all guides
CREATE OR REPLACE FUNCTION calculate_monthly_earnings(
    p_month DATE, -- First day of the month to calculate
    p_subscription_revenue NUMERIC, -- Total subscription revenue for that month
    p_revenue_share_percent NUMERIC DEFAULT 20.0 -- Platform gives 20% to guide pool
)
RETURNS INTEGER AS $$ -- Returns number of guides with earnings
DECLARE
    v_revenue_pool NUMERIC;
    v_total_points INTEGER;
    v_guide_count INTEGER := 0;
    v_guide RECORD;
BEGIN
    -- Calculate the revenue pool
    v_revenue_pool := p_subscription_revenue * (p_revenue_share_percent / 100.0);

    -- Get total engagement points for the month
    SELECT COALESCE(SUM(engagement_points), 0) INTO v_total_points
    FROM content_engagement
    WHERE engagement_month = p_month;

    IF v_total_points = 0 THEN
        RETURN 0;
    END IF;

    -- Calculate each guide's earnings
    FOR v_guide IN
        SELECT
            ce.creator_clerk_user_id,
            SUM(ce.engagement_points) as guide_points
        FROM content_engagement ce
        INNER JOIN guide_profiles gp ON gp.clerk_user_id = ce.creator_clerk_user_id
        WHERE ce.engagement_month = p_month
          AND gp.status = 'approved'
          AND gp.stripe_onboarding_complete = TRUE
        GROUP BY ce.creator_clerk_user_id
    LOOP
        -- Get any rollover from previous month
        DECLARE
            v_rollover NUMERIC := 0;
            v_gross NUMERIC;
            v_min_payout NUMERIC;
            v_status TEXT;
        BEGIN
            SELECT COALESCE(rollover_amount, 0) + COALESCE(net_amount, 0)
            INTO v_rollover
            FROM guide_earnings
            WHERE guide_clerk_user_id = v_guide.creator_clerk_user_id
              AND status = 'below_minimum'
            ORDER BY earning_month DESC
            LIMIT 1;

            v_rollover := COALESCE(v_rollover, 0);

            -- Calculate gross amount
            v_gross := (v_guide.guide_points::NUMERIC / v_total_points::NUMERIC) * v_revenue_pool + v_rollover;

            -- Get minimum payout for this guide
            SELECT COALESCE(minimum_payout, 10.00)
            INTO v_min_payout
            FROM guide_profiles
            WHERE clerk_user_id = v_guide.creator_clerk_user_id;

            -- Determine status
            IF v_gross < v_min_payout THEN
                v_status := 'below_minimum';
            ELSE
                v_status := 'calculated';
            END IF;

            -- Upsert earnings record
            INSERT INTO guide_earnings (
                guide_clerk_user_id, earning_month,
                total_engagement_points, platform_engagement_points,
                subscription_revenue, revenue_pool,
                share_percent, gross_amount, net_amount,
                rollover_amount, status
            ) VALUES (
                v_guide.creator_clerk_user_id, p_month,
                v_guide.guide_points, v_total_points,
                p_subscription_revenue, v_revenue_pool,
                v_guide.guide_points::NUMERIC / v_total_points::NUMERIC,
                v_gross, v_gross, -- net_amount updated after Stripe fee deduction
                v_rollover, v_status
            )
            ON CONFLICT (guide_clerk_user_id, earning_month)
            DO UPDATE SET
                total_engagement_points = EXCLUDED.total_engagement_points,
                platform_engagement_points = EXCLUDED.platform_engagement_points,
                subscription_revenue = EXCLUDED.subscription_revenue,
                revenue_pool = EXCLUDED.revenue_pool,
                share_percent = EXCLUDED.share_percent,
                gross_amount = EXCLUDED.gross_amount,
                net_amount = EXCLUDED.net_amount,
                rollover_amount = EXCLUDED.rollover_amount,
                status = EXCLUDED.status,
                updated_at = NOW();

            v_guide_count := v_guide_count + 1;
        END;
    END LOOP;

    RETURN v_guide_count;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- TRIGGERS
-- ===========================================

CREATE OR REPLACE FUNCTION update_guide_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    CREATE TRIGGER guide_profiles_updated_at
        BEFORE UPDATE ON guide_profiles
        FOR EACH ROW
        EXECUTE FUNCTION update_guide_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TRIGGER guide_earnings_updated_at
        BEFORE UPDATE ON guide_earnings
        FOR EACH ROW
        EXECUTE FUNCTION update_guide_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ===========================================
-- COMMENTS
-- ===========================================

COMMENT ON TABLE guide_profiles IS 'Guide/creator profiles with Stripe Connect account info';
COMMENT ON TABLE content_engagement IS 'Tracks paid subscriber engagement with guide content for revenue sharing';
COMMENT ON TABLE guide_earnings IS 'Monthly earnings calculations and payout records for guides';
