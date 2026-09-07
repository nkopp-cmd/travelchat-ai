BEGIN;

-- Match JavaScript trim() and the server's bounded render text. No retrospective snapshots.
CREATE FUNCTION public.story_video_text_snapshot(p_title text,p_city text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
    whitespace text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
    title text := left(btrim(coalesce(p_title,''),whitespace),200);
    city text := left(btrim(coalesce(p_city,''),whitespace),100);
    prompt_title text;
    prompt_city text;
BEGIN
    prompt_title := btrim(regexp_replace(regexp_replace(title,'https?://[^' || whitespace || ']+','','gi'),'[\x01-\x1f\x7f]',' ','g'),whitespace);
    prompt_city := btrim(regexp_replace(regexp_replace(city,'https?://[^' || whitespace || ']+','','gi'),'[\x01-\x1f\x7f]',' ','g'),whitespace);
    RETURN jsonb_build_object('title',title,'caption',CASE WHEN city <> '' THEN city || ' - ' ELSE '' END || 'AI-generated travel scene',
        'prompt','Create a short cinematic travel scene. City: ' || prompt_city || '. Trip: ' || prompt_title || '. Vertical composition, natural motion, no text or logos.');
END $$;

-- Read-only advisory result. Reservation calls this same policy under the accounting lock.
CREATE FUNCTION public.get_story_video_eligibility(p_user text,p_itinerary uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE b public.story_video_budget; durations jsonb;
    day_start timestamptz := date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
BEGIN
    PERFORM 1 FROM public.itineraries WHERE id=p_itinerary AND clerk_user_id=p_user;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Not found'; END IF;
    SELECT * INTO b FROM public.story_video_budget WHERE singleton;
    IF NOT FOUND THEN RAISE EXCEPTION 'Video budget unavailable'; END IF;
    WITH totals AS (
        SELECT coalesce(sum(reserve_cents) FILTER (WHERE allocation <> 'released'),0) AS lifetime,
            coalesce(sum(reserve_cents) FILTER (WHERE allocation <> 'released' AND created_at >= day_start),0) AS daily,
            count(*) FILTER (WHERE clerk_user_id=p_user AND created_at >= day_start) AS admissions,
            count(*) FILTER (WHERE clerk_user_id=p_user AND status IN
                ('reserved','submitting','queued','running','submission_unknown','provider_ready','processing')) AS active
        FROM public.story_video_jobs
    ) SELECT coalesce(jsonb_agg(d ORDER BY d),'[]'::jsonb) INTO durations
        FROM totals CROSS JOIN generate_series(4,6) d
        WHERE lifetime+d*8 <= least(b.ceiling_cents,2000) AND daily+d*8 <= b.daily_cents_limit
            AND admissions < b.owner_daily_admissions AND active < b.owner_active_limit;
    RETURN jsonb_build_object('eligibleDurations',durations);
END $$;

-- No optional parameters or old overload: old callers must fail closed before provider submission.
DROP FUNCTION public.reserve_story_video_job(text,uuid,text,text,text,integer);
CREATE FUNCTION public.reserve_story_video_job(p_user text,p_itinerary uuid,p_key text,
    p_payload_hash text,p_prompt text,p_duration integer,p_render_title text,p_render_caption text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE j public.story_video_jobs; snapshot jsonb;
BEGIN
    PERFORM pg_advisory_xact_lock(731905,0);
    SELECT public.story_video_text_snapshot(i.title,i.city) INTO snapshot FROM public.itineraries i
        WHERE i.id=p_itinerary AND i.clerk_user_id=p_user FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Not found'; END IF;
    SELECT * INTO j FROM public.story_video_jobs WHERE clerk_user_id=p_user AND idempotency_key=p_key FOR UPDATE;
    IF FOUND THEN
        IF j.itinerary_id IS DISTINCT FROM p_itinerary OR j.payload_hash IS DISTINCT FROM p_payload_hash
            OR j.prompt IS DISTINCT FROM p_prompt OR j.duration IS DISTINCT FROM p_duration
            OR j.render_title IS DISTINCT FROM p_render_title OR j.render_caption IS DISTINCT FROM p_render_caption
        THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='Idempotency conflict'; END IF;
        RETURN jsonb_build_object('job',public.story_video_public_job(j),'ownerToken',NULL);
    END IF;
    IF p_duration IS NULL OR p_duration NOT BETWEEN 4 AND 6 THEN RAISE EXCEPTION 'Invalid duration'; END IF;
    IF p_render_title IS DISTINCT FROM snapshot->>'title' OR p_render_caption IS DISTINCT FROM snapshot->>'caption'
        OR p_prompt IS DISTINCT FROM snapshot->>'prompt' THEN
        RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='Owned story text changed';
    END IF;
    IF NOT ((public.get_story_video_eligibility(p_user,p_itinerary)->'eligibleDurations') @> to_jsonb(p_duration)) THEN
        RAISE EXCEPTION USING ERRCODE='P0003', MESSAGE='Video limit';
    END IF;
    INSERT INTO public.story_video_jobs(clerk_user_id,itinerary_id,idempotency_key,payload_hash,prompt,duration,reserve_cents,render_title,render_caption)
        VALUES(p_user,p_itinerary,p_key,p_payload_hash,p_prompt,p_duration,p_duration*8,p_render_title,p_render_caption) RETURNING * INTO j;
    RETURN jsonb_build_object('job',public.story_video_public_job(j),'ownerToken',j.owner_token);
END $$;

CREATE FUNCTION public.story_video_insert_snapshot_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.render_title IS NULL OR length(NEW.render_title) NOT BETWEEN 1 AND 200
        OR NEW.render_caption IS NULL OR length(NEW.render_caption) NOT BETWEEN 1 AND 160 THEN
        RAISE EXCEPTION 'Initial render snapshot required';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER story_video_initial_snapshot BEFORE INSERT ON public.story_video_jobs
    FOR EACH ROW EXECUTE FUNCTION public.story_video_insert_snapshot_guard();

CREATE OR REPLACE FUNCTION public.claim_story_video_processing(p_job uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE j public.story_video_jobs; snapshot jsonb; token uuid := gen_random_uuid();
BEGIN
    SELECT * INTO j FROM public.story_video_jobs WHERE id=p_job FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Not found'; END IF;
    SELECT public.story_video_text_snapshot(i.title,i.city) INTO snapshot FROM public.itineraries i
        WHERE i.id=j.itinerary_id AND i.clerk_user_id=j.clerk_user_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Missing owned itinerary title'; END IF;
    -- Only genuine legacy rows read current text at claim time. New rows always use their reserved snapshot.
    IF j.render_title IS NULL AND nullif(snapshot->>'title','') IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Missing owned itinerary title';
    END IF;
    IF j.status NOT IN ('provider_ready','processing','processing_failed')
        OR (j.status='processing' AND j.processing_lease_until > clock_timestamp()) THEN RETURN NULL; END IF;
    IF j.processing_attempts >= 3 THEN
        UPDATE public.story_video_jobs SET status='processing_failed' WHERE id=j.id;
        RETURN NULL;
    END IF;
    UPDATE public.story_video_jobs SET status='processing',processing_token=token,
        output_object_key=j.id::text || '/' || token::text || '.mp4',
        processing_attempts=processing_attempts+1,processing_lease_until=clock_timestamp()+interval '15 minutes',
        render_title=coalesce(render_title,snapshot->>'title'),render_caption=coalesce(render_caption,snapshot->>'caption')
        WHERE id=j.id RETURNING * INTO j;
    RETURN jsonb_build_object('jobId',j.id,'userId',j.clerk_user_id,'itineraryId',j.itinerary_id,
        'token',j.processing_token,'attempt',j.processing_attempts,'duration',j.duration,
        'providerUrl',j.private_provider_url,'title',j.render_title,'caption',j.render_caption,'outputKey',j.output_object_key);
END $$;

REVOKE ALL ON FUNCTION public.story_video_text_snapshot(text,text),public.get_story_video_eligibility(text,uuid),
    public.reserve_story_video_job(text,uuid,text,text,text,integer,text,text),public.story_video_insert_snapshot_guard()
    FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.story_video_text_snapshot(text,text),public.get_story_video_eligibility(text,uuid),
    public.reserve_story_video_job(text,uuid,text,text,text,integer,text,text),public.story_video_insert_snapshot_guard() TO service_role;
COMMIT;
