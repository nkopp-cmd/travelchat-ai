BEGIN;
ALTER TABLE public.story_video_jobs
    DROP CONSTRAINT story_video_jobs_status_check,
    DROP CONSTRAINT story_video_jobs_check1,
    ADD COLUMN processing_token uuid,
    ADD COLUMN processing_lease_until timestamptz,
    ADD COLUMN processing_attempts integer NOT NULL DEFAULT 0 CHECK (processing_attempts BETWEEN 0 AND 3),
    ADD COLUMN render_title text,
    ADD COLUMN render_caption text,
    ADD COLUMN output_object_key text,
    ADD COLUMN output_sha256 text CHECK (output_sha256 ~ '^[a-f0-9]{64}$'),
    ADD COLUMN output_bytes integer CHECK (output_bytes > 0 AND output_bytes <= 33554432),
    ADD CONSTRAINT story_video_processing_status CHECK (status IN
        ('reserved','submitting','queued','running','provider_ready','submission_unknown','failed','cancelled',
         'processing','delivered','processing_failed')),
    ADD CONSTRAINT story_video_private_source CHECK ((status IN
        ('provider_ready','processing','delivered','processing_failed')) = (private_provider_url IS NOT NULL)),
    ADD CONSTRAINT story_video_processing_identity CHECK (status NOT IN ('processing','delivered','processing_failed') OR
        (processing_token IS NOT NULL AND processing_lease_until IS NOT NULL AND processing_attempts > 0
         AND render_title IS NOT NULL AND length(render_title) BETWEEN 1 AND 200
         AND render_caption IS NOT NULL AND length(render_caption) BETWEEN 1 AND 160
         AND output_object_key IS NOT NULL AND output_object_key = id::text || '/' || processing_token::text || '.mp4'
         AND allocation = 'consumed' AND provider_task_id IS NOT NULL)),
    ADD CONSTRAINT story_video_delivered_artifact CHECK
        ((status = 'delivered') = (output_sha256 IS NOT NULL AND output_bytes IS NOT NULL));

-- Restrictive policies defeat pre-existing broad permissive object policies.
DO $$ BEGIN
    IF to_regclass('storage.buckets') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'story-videos' AND public IS DISTINCT FROM false) THEN
            RAISE EXCEPTION 'story-videos must be private';
        END IF;
        INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
            VALUES ('story-videos','story-videos',false,33554432,ARRAY['video/mp4']) ON CONFLICT (id) DO NOTHING;
    END IF;
    IF to_regclass('storage.objects') IS NOT NULL THEN
        CREATE POLICY story_videos_server_only ON storage.objects AS RESTRICTIVE FOR ALL TO anon, authenticated
            USING (bucket_id <> 'story-videos') WITH CHECK (bucket_id <> 'story-videos');
    END IF;
END $$;

CREATE FUNCTION public.story_video_render_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
    IF (OLD.private_provider_url IS NOT NULL AND NEW.private_provider_url IS DISTINCT FROM OLD.private_provider_url)
        OR (OLD.render_title IS NOT NULL AND ROW(NEW.render_title,NEW.render_caption) IS DISTINCT FROM ROW(OLD.render_title,OLD.render_caption))
        OR (OLD.status = 'delivered' AND NEW IS DISTINCT FROM OLD)
        OR (NEW.processing_token IS NOT DISTINCT FROM OLD.processing_token AND NEW.output_object_key IS DISTINCT FROM OLD.output_object_key)
        OR (OLD.status IN ('processing','processing_failed') AND NEW.status NOT IN ('processing','processing_failed','delivered'))
    THEN RAISE EXCEPTION 'Immutable render identity'; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER story_video_render_identity BEFORE UPDATE ON public.story_video_jobs
    FOR EACH ROW EXECUTE FUNCTION public.story_video_render_guard();

CREATE OR REPLACE FUNCTION public.story_video_public_job(j public.story_video_jobs) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = public, pg_temp AS $$
    SELECT jsonb_build_object('jobId',j.id,'status',j.status,
        'statusUrl','/api/itineraries/' || j.itinerary_id || '/story/video/' || j.id,
        'errorCode',CASE WHEN j.status IN ('submitting','submission_unknown') AND j.provider_task_id IS NULL
            THEN 'requires_review' ELSE j.error_code END)
        || CASE WHEN j.status = 'delivered' THEN jsonb_build_object('downloadUrl',
            '/api/itineraries/' || j.itinerary_id || '/story/video/' || j.id || '/download') ELSE '{}'::jsonb END;
$$;

CREATE FUNCTION public.claim_story_video_processing(p_job uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE j public.story_video_jobs; title text; city text; token uuid := gen_random_uuid();
BEGIN
    SELECT * INTO j FROM public.story_video_jobs WHERE id = p_job FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Not found'; END IF;
    SELECT left(btrim(i.title),200), left(btrim(i.city),100) INTO title,city FROM public.itineraries i
        WHERE i.id = j.itinerary_id AND i.clerk_user_id = j.clerk_user_id FOR SHARE;
    IF NOT FOUND OR nullif(title,'') IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Missing owned itinerary title';
    END IF;
    IF j.status NOT IN ('provider_ready','processing','processing_failed')
        OR (j.status = 'processing' AND j.processing_lease_until > clock_timestamp()) THEN RETURN NULL; END IF;
    IF j.processing_attempts >= 3 THEN
        UPDATE public.story_video_jobs SET status='processing_failed' WHERE id=j.id;
        RETURN NULL;
    END IF;
    UPDATE public.story_video_jobs SET status='processing', processing_token=token,
        output_object_key=j.id::text || '/' || token::text || '.mp4',
        processing_attempts=processing_attempts+1, processing_lease_until=clock_timestamp()+interval '15 minutes',
        render_title=coalesce(render_title,title),
        render_caption=coalesce(render_caption,concat(nullif(city,''),CASE WHEN nullif(city,'') IS NOT NULL THEN ' - ' ELSE '' END,'AI-generated travel scene'))
        WHERE id=j.id RETURNING * INTO j;
    RETURN jsonb_build_object('jobId',j.id,'userId',j.clerk_user_id,'itineraryId',j.itinerary_id,
        'token',j.processing_token,'attempt',j.processing_attempts,'duration',j.duration,
        'providerUrl',j.private_provider_url,'title',j.render_title,'caption',j.render_caption,'outputKey',j.output_object_key);
END $$;

CREATE FUNCTION public.finish_story_video_processing(p_job uuid,p_token uuid,p_key text,p_sha256 text,p_bytes integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE j public.story_video_jobs;
BEGIN
    SELECT * INTO j FROM public.story_video_jobs WHERE id=p_job FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Not found'; END IF;
    PERFORM 1 FROM public.itineraries WHERE id=j.itinerary_id AND clerk_user_id=j.clerk_user_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Not found'; END IF;
    IF p_token IS NULL OR p_token IS DISTINCT FROM j.processing_token OR p_key IS NULL
        OR p_key IS DISTINCT FROM j.output_object_key OR p_key <> j.id::text || '/' || p_token::text || '.mp4'
        OR p_sha256 IS NULL OR p_sha256 !~ '^[a-f0-9]{64}$' OR p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND 33554432
    THEN RAISE EXCEPTION 'Invalid render fence or artifact'; END IF;
    IF j.status='delivered' AND j.output_sha256=p_sha256 AND j.output_bytes=p_bytes THEN RETURN public.story_video_public_job(j); END IF;
    IF j.status <> 'processing' OR j.processing_lease_until <= clock_timestamp() THEN RAISE EXCEPTION 'Expired render fence'; END IF;
    UPDATE public.story_video_jobs SET status='delivered',output_sha256=p_sha256,output_bytes=p_bytes WHERE id=j.id RETURNING * INTO j;
    RETURN public.story_video_public_job(j);
END $$;

CREATE FUNCTION public.fail_story_video_processing(p_job uuid,p_token uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
    UPDATE public.story_video_jobs SET status='processing_failed'
        WHERE id=p_job AND processing_token=p_token AND status='processing' AND processing_lease_until > clock_timestamp();
    IF NOT FOUND THEN RAISE EXCEPTION 'Expired render fence'; END IF;
END $$;

CREATE FUNCTION public.get_story_video_delivery(p_user text,p_itinerary uuid,p_job uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE j public.story_video_jobs;
BEGIN
    PERFORM 1 FROM public.itineraries WHERE id=p_itinerary AND clerk_user_id=p_user FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Not found'; END IF;
    SELECT * INTO j FROM public.story_video_jobs WHERE id=p_job AND itinerary_id=p_itinerary AND clerk_user_id=p_user AND status='delivered' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Not found'; END IF;
    RETURN jsonb_build_object('jobId',j.id,'token',j.processing_token,'outputKey',j.output_object_key);
END $$;

REVOKE ALL ON FUNCTION public.story_video_render_guard(),public.claim_story_video_processing(uuid),
    public.finish_story_video_processing(uuid,uuid,text,text,integer),public.fail_story_video_processing(uuid,uuid),
    public.get_story_video_delivery(text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.story_video_render_guard(),public.claim_story_video_processing(uuid),
    public.finish_story_video_processing(uuid,uuid,text,text,integer),public.fail_story_video_processing(uuid,uuid),
    public.get_story_video_delivery(text,uuid,uuid) TO service_role;
COMMIT;
