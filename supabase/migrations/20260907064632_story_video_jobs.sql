BEGIN;

-- Operator-owned configuration, not a mutable application counter. All values start closed.
CREATE TABLE public.story_video_budget (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    ceiling_cents integer NOT NULL DEFAULT 0 CHECK (ceiling_cents BETWEEN 0 AND 2000),
    daily_cents_limit integer NOT NULL DEFAULT 0 CHECK (daily_cents_limit BETWEEN 0 AND 2000),
    owner_daily_admissions integer NOT NULL DEFAULT 0 CHECK (owner_daily_admissions BETWEEN 0 AND 1000),
    owner_active_limit integer NOT NULL DEFAULT 0 CHECK (owner_active_limit BETWEEN 0 AND 1000)
);
INSERT INTO public.story_video_budget DEFAULT VALUES;
ALTER TABLE public.story_video_budget ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.story_video_budget FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.story_video_budget TO service_role;

CREATE TABLE public.story_video_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id text NOT NULL CHECK (length(clerk_user_id) BETWEEN 1 AND 256),
    -- Deliberately not a cascading FK: deleting a trip must never delete cash accounting.
    itinerary_id uuid NOT NULL,
    idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{1,128}$'),
    payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
    prompt text NOT NULL CHECK (length(prompt) BETWEEN 1 AND 1000),
    duration integer NOT NULL CHECK (duration BETWEEN 4 AND 6),
    model text NOT NULL DEFAULT 'MiniMax-H3' CHECK (model = 'MiniMax-H3'),
    resolution text NOT NULL DEFAULT '768P' CHECK (resolution = '768P'),
    ratio text NOT NULL DEFAULT '9:16' CHECK (ratio = '9:16'),
    price_revision text NOT NULL DEFAULT 'v1' CHECK (price_revision = 'v1'),
    reserve_cents integer NOT NULL CHECK (reserve_cents = duration * 8),
    allocation text NOT NULL DEFAULT 'held' CHECK (allocation IN ('held','consumed','released')),
    status text NOT NULL DEFAULT 'reserved' CHECK (status IN
        ('reserved','submitting','queued','running','provider_ready','submission_unknown','failed','cancelled')),
    owner_token uuid NOT NULL DEFAULT gen_random_uuid(),
    provider_task_id text UNIQUE CHECK (provider_task_id ~ '^[A-Za-z0-9_-]{1,128}$'),
    private_provider_url text CHECK (length(private_provider_url) <= 8192 AND private_provider_url ~ '^https://'),
    error_code text CHECK (error_code IN ('requires_review','provider_failed','provider_cancelled','reservation_expired')),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    deadline timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '5 minutes'),
    next_poll_at timestamptz NOT NULL DEFAULT '-infinity',
    poll_fence uuid,
    UNIQUE (clerk_user_id, idempotency_key),
    CHECK ((status = 'provider_ready') = (private_provider_url IS NOT NULL)),
    CHECK (status NOT IN ('queued','running','provider_ready') OR provider_task_id IS NOT NULL),
    CHECK (allocation <> 'released' OR (status = 'failed' AND error_code = 'reservation_expired' AND provider_task_id IS NULL))
);
CREATE INDEX story_video_jobs_owner_created ON public.story_video_jobs (clerk_user_id, created_at);
ALTER TABLE public.story_video_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.story_video_jobs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.story_video_jobs TO service_role;

CREATE FUNCTION public.story_video_identity_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
    IF ROW(NEW.id,NEW.clerk_user_id,NEW.itinerary_id,NEW.idempotency_key,NEW.payload_hash,NEW.prompt,
        NEW.duration,NEW.model,NEW.resolution,NEW.ratio,NEW.price_revision,NEW.reserve_cents,NEW.owner_token,NEW.created_at)
        IS DISTINCT FROM ROW(OLD.id,OLD.clerk_user_id,OLD.itinerary_id,OLD.idempotency_key,OLD.payload_hash,OLD.prompt,
        OLD.duration,OLD.model,OLD.resolution,OLD.ratio,OLD.price_revision,OLD.reserve_cents,OLD.owner_token,OLD.created_at)
        OR (OLD.provider_task_id IS NOT NULL AND NEW.provider_task_id IS DISTINCT FROM OLD.provider_task_id)
    THEN RAISE EXCEPTION 'Immutable video identity'; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER story_video_identity BEFORE UPDATE ON public.story_video_jobs
FOR EACH ROW EXECUTE FUNCTION public.story_video_identity_guard();

-- Reservation and advance RPCs take this singleton lock FIRST, then a job lock. No network transaction.
-- Budget writes take the same lock; RPCs need SELECT only, never UPDATE on configuration.
CREATE FUNCTION public.story_video_budget_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(731905, 0);
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Budget singleton cannot be deleted'; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER story_video_budget_write BEFORE INSERT OR UPDATE OR DELETE ON public.story_video_budget
FOR EACH ROW EXECUTE FUNCTION public.story_video_budget_guard();

CREATE FUNCTION public.story_video_public_job(j public.story_video_jobs) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = public, pg_temp AS $$
    SELECT jsonb_build_object('jobId', j.id, 'status', j.status,
        'statusUrl', '/api/itineraries/' || j.itinerary_id || '/story/video/' || j.id,
        'errorCode', CASE WHEN j.status IN ('submitting','submission_unknown') AND j.provider_task_id IS NULL
            THEN 'requires_review' ELSE j.error_code END);
$$;

CREATE FUNCTION public.reserve_story_video_job(p_user text, p_itinerary uuid, p_key text,
    p_payload_hash text, p_prompt text, p_duration integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
    j public.story_video_jobs;
    b public.story_video_budget;
    lifetime bigint;
    daily bigint;
    admissions bigint;
    active bigint;
    day_start timestamptz := date_trunc('day', clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
BEGIN
    PERFORM pg_advisory_xact_lock(731905, 0);
    PERFORM 1 FROM public.itineraries WHERE id = p_itinerary AND clerk_user_id = p_user FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Not found'; END IF;
    SELECT * INTO j FROM public.story_video_jobs WHERE clerk_user_id = p_user AND idempotency_key = p_key FOR UPDATE;
    IF FOUND THEN
        IF j.itinerary_id IS DISTINCT FROM p_itinerary OR j.payload_hash IS DISTINCT FROM p_payload_hash
            OR j.prompt IS DISTINCT FROM p_prompt OR j.duration IS DISTINCT FROM p_duration
        THEN RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Idempotency conflict'; END IF;
        RETURN jsonb_build_object('job', public.story_video_public_job(j), 'ownerToken', NULL);
    END IF;
    IF p_duration IS NULL OR p_duration NOT BETWEEN 4 AND 6 THEN
        RAISE EXCEPTION 'Invalid duration';
    END IF;
    SELECT * INTO STRICT b FROM public.story_video_budget WHERE singleton;
    SELECT coalesce(sum(reserve_cents) FILTER (WHERE allocation <> 'released'),0),
        coalesce(sum(reserve_cents) FILTER (WHERE allocation <> 'released' AND created_at >= day_start),0),
        count(*) FILTER (WHERE clerk_user_id = p_user AND created_at >= day_start),
        count(*) FILTER (WHERE clerk_user_id = p_user AND status IN ('reserved','submitting','queued','running','submission_unknown'))
    INTO lifetime, daily, admissions, active FROM public.story_video_jobs;
    IF lifetime + p_duration * 8 > least(b.ceiling_cents,2000)
        OR daily + p_duration * 8 > b.daily_cents_limit
        OR admissions >= b.owner_daily_admissions OR active >= b.owner_active_limit
    THEN RAISE EXCEPTION USING ERRCODE = 'P0003', MESSAGE = 'Video limit'; END IF;
    INSERT INTO public.story_video_jobs (clerk_user_id,itinerary_id,idempotency_key,payload_hash,prompt,duration,reserve_cents)
    VALUES (p_user,p_itinerary,p_key,p_payload_hash,p_prompt,p_duration,p_duration*8) RETURNING * INTO j;
    RETURN jsonb_build_object('job', public.story_video_public_job(j), 'ownerToken', j.owner_token);
END $$;

CREATE FUNCTION public.claim_story_video_poll(p_user text, p_itinerary uuid, p_job uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE j public.story_video_jobs; fence uuid;
BEGIN
    -- Claims change no accounting: authorization and the job row lock suffice for fencing.
    PERFORM 1 FROM public.itineraries WHERE id = p_itinerary AND clerk_user_id = p_user FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Not found'; END IF;
    SELECT * INTO j FROM public.story_video_jobs
        WHERE id = p_job AND itinerary_id = p_itinerary AND clerk_user_id = p_user FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Not found'; END IF;
    IF j.status IN ('queued','running') AND j.provider_task_id IS NOT NULL AND j.next_poll_at <= clock_timestamp() THEN
        fence := gen_random_uuid();
        UPDATE public.story_video_jobs SET poll_fence = fence, next_poll_at = clock_timestamp() + interval '10 seconds'
            WHERE id = j.id RETURNING * INTO j;
    END IF;
    RETURN jsonb_build_object('job', public.story_video_public_job(j), 'pollFence', fence,
        'taskId', CASE WHEN fence IS NOT NULL THEN j.provider_task_id ELSE NULL END, 'duration', j.duration);
END $$;

CREATE FUNCTION public.advance_story_video_job(p_user text, p_itinerary uuid, p_job uuid, p_action text,
    p_token uuid DEFAULT NULL, p_task text DEFAULT NULL, p_fence uuid DEFAULT NULL,
    p_status text DEFAULT NULL, p_url text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE j public.story_video_jobs;
BEGIN
    PERFORM pg_advisory_xact_lock(731905, 0);
    SELECT * INTO j FROM public.story_video_jobs
        WHERE id = p_job AND itinerary_id = p_itinerary AND clerk_user_id = p_user FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Not found'; END IF;
    IF p_action = 'expire' THEN
        IF j.status = 'reserved' AND j.deadline <= clock_timestamp() THEN
            UPDATE public.story_video_jobs SET status = 'failed', allocation = 'released', error_code = 'reservation_expired'
                WHERE id = j.id RETURNING * INTO j;
        END IF;
    ELSIF p_action IN ('submit','ack','unknown','reject') THEN
        IF p_token IS NULL OR p_token <> j.owner_token THEN RAISE EXCEPTION 'Invalid fence'; END IF;
        IF p_action = 'submit' THEN
            PERFORM 1 FROM public.itineraries WHERE id = p_itinerary AND clerk_user_id = p_user FOR SHARE;
            IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Not found'; END IF;
            IF j.status <> 'reserved' OR j.deadline <= clock_timestamp() THEN RAISE EXCEPTION 'Not submit-ready'; END IF;
            UPDATE public.story_video_jobs SET status = 'submitting' WHERE id = j.id RETURNING * INTO j;
        ELSE
            IF j.status <> 'submitting' THEN RAISE EXCEPTION 'Not submitting'; END IF;
            IF p_action = 'ack' AND (p_task IS NULL OR p_task !~ '^[A-Za-z0-9_-]{1,128}$') THEN
                RAISE EXCEPTION 'Invalid task';
            END IF;
            UPDATE public.story_video_jobs SET
                status = CASE p_action WHEN 'ack' THEN 'queued' WHEN 'reject' THEN 'failed' ELSE 'submission_unknown' END,
                provider_task_id = CASE WHEN p_action = 'ack' THEN p_task ELSE NULL END,
                error_code = CASE p_action WHEN 'ack' THEN NULL WHEN 'reject' THEN 'provider_failed' ELSE 'requires_review' END
                WHERE id = j.id RETURNING * INTO j;
        END IF;
    ELSIF p_action = 'poll' THEN
        IF p_task IS NULL OR p_task IS DISTINCT FROM j.provider_task_id OR p_fence IS NULL
            OR p_fence IS DISTINCT FROM j.poll_fence THEN RAISE EXCEPTION 'Invalid poll fence'; END IF;
        IF p_status IS NULL OR p_status NOT IN ('queued','running','provider_ready','submission_unknown','failed','cancelled') THEN
            RAISE EXCEPTION 'Invalid status';
        END IF;
        IF j.status IN ('queued','running') THEN
            UPDATE public.story_video_jobs SET
                status = CASE WHEN j.status = 'running' AND p_status = 'queued' THEN 'running' ELSE p_status END,
                allocation = CASE WHEN p_status = 'provider_ready' THEN 'consumed' ELSE allocation END,
                private_provider_url = CASE WHEN p_status = 'provider_ready' THEN p_url ELSE NULL END,
                error_code = CASE p_status WHEN 'submission_unknown' THEN 'requires_review'
                    WHEN 'failed' THEN 'provider_failed' WHEN 'cancelled' THEN 'provider_cancelled' ELSE NULL END,
                poll_fence = NULL
                WHERE id = j.id RETURNING * INTO j;
        END IF;
    ELSE RAISE EXCEPTION 'Invalid action'; END IF;
    RETURN public.story_video_public_job(j);
END $$;

REVOKE ALL ON FUNCTION public.story_video_identity_guard(), public.story_video_budget_guard(),
    public.story_video_public_job(public.story_video_jobs),
    public.reserve_story_video_job(text,uuid,text,text,text,integer), public.claim_story_video_poll(text,uuid,uuid),
    public.advance_story_video_job(text,uuid,uuid,text,uuid,text,uuid,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.story_video_identity_guard(), public.story_video_public_job(public.story_video_jobs),
    public.reserve_story_video_job(text,uuid,text,text,text,integer), public.claim_story_video_poll(text,uuid,uuid),
    public.advance_story_video_job(text,uuid,uuid,text,uuid,text,uuid,text,text) TO service_role;
COMMIT;
