-- Migration: Weighted Usage Increment
-- Purpose: Allow incrementing usage by a variable amount (credits)
-- instead of always +1, for AI image model credit costs.

CREATE OR REPLACE FUNCTION check_and_increment_usage_weighted(
    p_clerk_user_id TEXT,
    p_usage_type TEXT,
    p_period_type TEXT,
    p_limit INTEGER,
    p_amount INTEGER DEFAULT 1
)
RETURNS TABLE(allowed BOOLEAN, new_count INTEGER, was_at_limit BOOLEAN) AS $$
DECLARE
    v_period_start DATE;
    v_current_count INTEGER;
    v_new_count INTEGER;
BEGIN
    -- Calculate period start based on type (server-side, not client-supplied)
    IF p_period_type = 'daily' THEN
        v_period_start := CURRENT_DATE;
    ELSIF p_period_type = 'weekly' THEN
        v_period_start := DATE_TRUNC('week', CURRENT_DATE)::DATE;
    ELSE
        v_period_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
    END IF;

    -- Use advisory lock to prevent race conditions for this user+type+period
    PERFORM pg_advisory_xact_lock(
        hashtext(p_clerk_user_id || p_usage_type || p_period_type || v_period_start::TEXT)
    );

    -- Get current usage (or 0 if no record)
    SELECT COALESCE(count, 0) INTO v_current_count
    FROM usage_tracking
    WHERE clerk_user_id = p_clerk_user_id
    AND usage_type = p_usage_type
    AND period_type = p_period_type
    AND period_start = v_period_start;

    -- If we haven't found a record, current count is 0
    v_current_count := COALESCE(v_current_count, 0);

    -- Check if adding p_amount would exceed the limit
    IF v_current_count + p_amount > p_limit THEN
        RETURN QUERY SELECT FALSE, v_current_count, (v_current_count >= p_limit);
        RETURN;
    END IF;

    -- Atomically upsert and increment by p_amount
    INSERT INTO usage_tracking (clerk_user_id, usage_type, period_start, period_type, count)
    VALUES (p_clerk_user_id, p_usage_type, v_period_start, p_period_type, p_amount)
    ON CONFLICT (clerk_user_id, usage_type, period_start, period_type)
    DO UPDATE SET
        count = usage_tracking.count + p_amount,
        updated_at = NOW()
    RETURNING count INTO v_new_count;

    -- Return result
    RETURN QUERY SELECT TRUE, v_new_count, FALSE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_and_increment_usage_weighted IS
'Atomically checks usage limit and increments count by a variable amount. Used for weighted AI model credits.';
