-- Migration: Atomic Usage Tracking Functions
-- Purpose: Replace read-modify-write patterns with atomic operations
-- to prevent race conditions in usage limit enforcement

-- Function: Atomically check limit and increment usage in one transaction
-- Returns: { allowed: boolean, new_count: integer, limit: integer }
-- This ensures concurrent requests cannot bypass limits
CREATE OR REPLACE FUNCTION check_and_increment_usage(
    p_clerk_user_id TEXT,
    p_usage_type TEXT,
    p_period_type TEXT,
    p_limit INTEGER
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

    -- Check if already at or over limit
    IF v_current_count >= p_limit THEN
        RETURN QUERY SELECT FALSE, v_current_count, TRUE;
        RETURN;
    END IF;

    -- Atomically upsert and increment
    INSERT INTO usage_tracking (clerk_user_id, usage_type, period_start, period_type, count)
    VALUES (p_clerk_user_id, p_usage_type, v_period_start, p_period_type, 1)
    ON CONFLICT (clerk_user_id, usage_type, period_start, period_type)
    DO UPDATE SET
        count = usage_tracking.count + 1,
        updated_at = NOW()
    RETURNING count INTO v_new_count;

    -- Return result
    RETURN QUERY SELECT TRUE, v_new_count, FALSE;
END;
$$ LANGUAGE plpgsql;

-- Function: Get current usage count without incrementing
-- Uses server-calculated period start (no client-supplied dates)
CREATE OR REPLACE FUNCTION get_current_usage_safe(
    p_clerk_user_id TEXT,
    p_usage_type TEXT,
    p_period_type TEXT
)
RETURNS INTEGER AS $$
DECLARE
    v_period_start DATE;
    v_count INTEGER;
BEGIN
    -- Calculate period start based on type (server-side)
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

COMMENT ON FUNCTION check_and_increment_usage IS
'Atomically checks usage limit and increments count. Uses advisory lock to prevent race conditions.';

COMMENT ON FUNCTION get_current_usage_safe IS
'Gets current usage with server-calculated period start. Safe from period manipulation.';
