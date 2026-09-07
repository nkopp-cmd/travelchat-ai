BEGIN;

CREATE TABLE public.story_image_jobs (
    clerk_user_id text NOT NULL CHECK (length(clerk_user_id) BETWEEN 1 AND 256),
    idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 256),
    payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
    provider text NOT NULL CHECK (provider IN ('flux', 'seedream', 'gemini', 'gpt-image-2')),
    credits integer NOT NULL CHECK (credits > 0),
    period_start date NOT NULL,
    owner_token uuid NOT NULL DEFAULT gen_random_uuid(),
    state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'submitted', 'succeeded', 'failed')),
    output_prefix text NOT NULL CHECK (output_prefix ~ '^https://[^/?#]+/[^?#]+/background\.$'),
    output_url text,
    created_at timestamptz NOT NULL DEFAULT now(),
    deadline timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (clerk_user_id, idempotency_key),
    CHECK ((state = 'succeeded') = (output_url IS NOT NULL)),
    CHECK (output_url IS NULL OR output_url IN (output_prefix || 'png', output_prefix || 'jpg'))
);
ALTER TABLE public.story_image_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.story_image_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.story_image_jobs TO service_role;
CREATE INDEX story_image_jobs_pending_deadline ON public.story_image_jobs (deadline)
    WHERE state IN ('reserved', 'submitted');

-- All operations lock one job first (two-key namespace), then the existing
-- weighted counter lock (one-key namespace). No transaction spans a network call.
CREATE FUNCTION public.reserve_story_image_job(
    p_user text, p_key text, p_payload_hash text, p_provider text,
    p_credits integer, p_limit integer, p_output_prefix text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
    j public.story_image_jobs;
    usage_result record;
BEGIN
    IF p_user IS NULL OR length(p_user) NOT BETWEEN 1 AND 256
        OR p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 256
        OR p_payload_hash IS NULL OR p_payload_hash !~ '^[a-f0-9]{64}$'
        OR p_provider IS NULL OR p_provider NOT IN ('flux', 'seedream', 'gemini', 'gpt-image-2')
        OR p_credits IS NULL OR p_credits <= 0 OR p_limit IS NULL OR p_limit < 0
        OR p_output_prefix IS NULL OR p_output_prefix !~ '^https://[^/?#]+/[^?#]+/background\.$'
    THEN RAISE EXCEPTION 'Invalid reservation'; END IF;
    PERFORM pg_advisory_xact_lock(731904, hashtext(p_user || ':' || p_key));
    SELECT * INTO j FROM public.story_image_jobs WHERE clerk_user_id = p_user AND idempotency_key = p_key;
    IF FOUND THEN
        IF j.payload_hash <> p_payload_hash OR j.provider <> p_provider
            OR j.credits <> p_credits OR j.output_prefix <> p_output_prefix
        THEN RAISE EXCEPTION 'Reservation identity mismatch'; END IF;
        RETURN jsonb_build_object('state', j.state, 'owner_token', NULL, 'output_url', j.output_url);
    END IF;
    SELECT * INTO STRICT usage_result FROM public.check_and_increment_usage_weighted(
        p_user, 'ai_images_generated', 'monthly', p_limit, p_credits);
    IF usage_result.allowed IS NOT TRUE THEN
        RETURN jsonb_build_object('state', 'limit', 'owner_token', NULL, 'output_url', NULL);
    END IF;
    INSERT INTO public.story_image_jobs (clerk_user_id, idempotency_key, payload_hash, provider, credits, period_start, output_prefix)
    VALUES (p_user, p_key, p_payload_hash, p_provider, p_credits, date_trunc('month', CURRENT_DATE)::date, p_output_prefix)
    RETURNING * INTO j;
    RETURN jsonb_build_object('state', j.state, 'owner_token', j.owner_token, 'output_url', NULL);
END;
$$;

CREATE FUNCTION public.submit_story_image_job(p_user text, p_key text, p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(731904, hashtext(p_user || ':' || p_key));
    UPDATE public.story_image_jobs SET state = 'submitted', updated_at = now(), deadline = now() + interval '15 minutes'
    WHERE clerk_user_id = p_user AND idempotency_key = p_key AND owner_token = p_token
        AND state = 'reserved' AND deadline > clock_timestamp();
    IF NOT FOUND THEN RAISE EXCEPTION 'Reservation is not submit-ready'; END IF;
    RETURN jsonb_build_object('state', 'submitted');
END;
$$;

CREATE FUNCTION public.settle_story_image_job(p_user text, p_key text, p_token uuid, p_output_url text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE j public.story_image_jobs;
BEGIN
    PERFORM pg_advisory_xact_lock(731904, hashtext(p_user || ':' || p_key));
    SELECT * INTO j FROM public.story_image_jobs WHERE clerk_user_id = p_user AND idempotency_key = p_key;
    IF NOT FOUND OR p_token IS NULL OR j.owner_token <> p_token THEN RAISE EXCEPTION 'Invalid reservation owner'; END IF;
    IF j.state IN ('succeeded', 'failed') THEN
        IF j.output_url IS DISTINCT FROM p_output_url THEN RAISE EXCEPTION 'Settlement mismatch'; END IF;
        RETURN jsonb_build_object('state', j.state);
    END IF;
    IF p_output_url IS NOT NULL AND (j.state <> 'submitted' OR p_output_url NOT IN (j.output_prefix || 'png', j.output_prefix || 'jpg'))
    THEN RAISE EXCEPTION 'Invalid output'; END IF;
    IF p_output_url IS NULL THEN
        -- Refund the recorded month, not the settlement month. Match weighted RPC exactly.
        PERFORM pg_advisory_xact_lock(hashtext(p_user || 'ai_images_generated' || 'monthly' || j.period_start::text));
        UPDATE public.usage_tracking SET count = count - j.credits, updated_at = now()
        WHERE clerk_user_id = p_user AND usage_type = 'ai_images_generated'
            AND period_type = 'monthly' AND period_start = j.period_start AND count >= j.credits;
        IF NOT FOUND THEN RAISE EXCEPTION 'Refund counter missing or inconsistent'; END IF;
    END IF;
    UPDATE public.story_image_jobs SET state = CASE WHEN p_output_url IS NULL THEN 'failed' ELSE 'succeeded' END,
        output_url = p_output_url, updated_at = now()
    WHERE clerk_user_id = p_user AND idempotency_key = p_key RETURNING * INTO j;
    RETURN jsonb_build_object('state', j.state);
END;
$$;

-- Reconcile one expired reservation per transaction. Never auto-replay submitted jobs.
-- Operators must review submitted jobs past deadline against provider/storage evidence,
-- then use the recorded token to settle success or confirmed failure. Uncertain jobs stay submitted.
CREATE FUNCTION public.reconcile_story_image_job(p_user text, p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE j public.story_image_jobs;
BEGIN
    PERFORM pg_advisory_xact_lock(731904, hashtext(p_user || ':' || p_key));
    SELECT * INTO j FROM public.story_image_jobs WHERE clerk_user_id = p_user AND idempotency_key = p_key;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown reservation'; END IF;
    IF j.state = 'reserved' AND j.deadline <= clock_timestamp() THEN
        RETURN public.settle_story_image_job(p_user, p_key, j.owner_token, NULL);
    END IF;
    RETURN jsonb_build_object('state', j.state);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_story_image_job(text,text,text,text,integer,integer,text),
    public.submit_story_image_job(text,text,uuid), public.settle_story_image_job(text,text,uuid,text),
    public.reconcile_story_image_job(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_story_image_job(text,text,text,text,integer,integer,text),
    public.submit_story_image_job(text,text,uuid), public.settle_story_image_job(text,text,uuid,text),
    public.reconcile_story_image_job(text,text) TO service_role;
-- Existing application caller: lib/usage-tracking.ts, createSupabaseAdmin (service_role).
REVOKE ALL ON FUNCTION public.check_and_increment_usage_weighted(text,text,text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_increment_usage_weighted(text,text,text,integer,integer) TO service_role;
COMMIT;
