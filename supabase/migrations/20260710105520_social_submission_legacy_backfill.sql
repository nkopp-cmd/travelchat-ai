ALTER TABLE public.social_spot_submissions
  ADD COLUMN IF NOT EXISTS media_finalization_attempt_count INTEGER NOT NULL DEFAULT 0
    CHECK (media_finalization_attempt_count BETWEEN 0 AND 5),
  ADD COLUMN IF NOT EXISTS media_finalization_available_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.reset_social_spot_media_finalization_attempts_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.media_processing_revision IS DISTINCT FROM OLD.media_processing_revision THEN
    NEW.media_finalization_attempt_count := 0;
    NEW.media_finalization_available_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reset_social_spot_media_finalization_attempts
  ON public.social_spot_submissions;
CREATE TRIGGER reset_social_spot_media_finalization_attempts
  BEFORE UPDATE OF media_processing_revision
  ON public.social_spot_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_social_spot_media_finalization_attempts_v1();

CREATE OR REPLACE FUNCTION public.schedule_legacy_social_spot_media_backfill_v1(
  p_submission_ids UUID[],
  p_cutoff TIMESTAMPTZ,
  p_limit INTEGER DEFAULT 1,
  p_include_instagram BOOLEAN DEFAULT FALSE,
  p_include_resolved BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(submission_id UUID)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF p_limit NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Legacy backfill limit must be between 1 and 5'
      USING ERRCODE = '22023';
  END IF;
  IF p_cutoff IS NULL OR p_cutoff > v_now THEN
    RAISE EXCEPTION 'Legacy cutoff must be present and cannot be in the future'
      USING ERRCODE = '22023';
  END IF;
  IF COALESCE(array_length(p_submission_ids, 1), 0) NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Select between 1 and 5 explicit legacy submission IDs'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT submission.id
    FROM public.social_spot_submissions AS submission
    WHERE
      submission.id = ANY(p_submission_ids) AND
      submission.created_at < p_cutoff AND
      submission.media_processing_state = 'not_started' AND
      submission.media_processing_revision = 0 AND
      submission.platform IN ('tiktok', 'instagram') AND
      (submission.platform = 'tiktok' OR p_include_instagram) AND
      (submission.spot_id IS NULL OR p_include_resolved) AND
      submission.status IN ('spot_created', 'spot_reused', 'needs_review', 'research_pending') AND
      char_length(btrim(submission.canonical_url)) > 0 AND
      NOT EXISTS (
        SELECT 1
        FROM public.social_spot_submission_media_jobs AS job
        WHERE
          job.submission_id = submission.id AND
          job.state <> 'cancelled'
      )
    ORDER BY submission.created_at ASC, submission.id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  ), scheduled AS (
    UPDATE public.social_spot_submissions AS submission
    SET
      media_processing_state = 'coverage_retry',
      media_item_count = 0,
      media_succeeded_count = 0,
      media_dead_letter_count = 0,
      media_extraction_attempt_count = 0,
      media_extraction_available_at = v_now,
      media_extraction_token = NULL,
      media_extraction_lease_expires_at = NULL,
      media_finalization_token = NULL,
      media_finalization_lease_expires_at = NULL,
      media_finalization_attempt_count = 0,
      media_finalization_available_at = NULL,
      media_processing_completed_at = NULL,
      media_processing_updated_at = v_now
    FROM candidates
    WHERE
      submission.id = candidates.id AND
      submission.media_processing_state = 'not_started'
    RETURNING submission.id
  )
  SELECT scheduled.id
  FROM scheduled;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_social_spot_media_coverage_v1(
  p_submission_id UUID,
  p_lease_seconds INTEGER DEFAULT 60
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_token UUID := gen_random_uuid();
  v_claimed UUID;
BEGIN
  IF p_lease_seconds NOT BETWEEN 15 AND 300 THEN
    RAISE EXCEPTION 'Coverage lease must be between 15 and 300 seconds'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.social_spot_submissions AS submission
  SET
    media_processing_state = 'coverage_processing',
    media_extraction_token = v_token,
    media_extraction_lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
    media_processing_updated_at = v_now
  WHERE
    submission.id = p_submission_id AND
    submission.media_processing_state = 'coverage_retry' AND
    submission.media_extraction_available_at <= v_now
  RETURNING submission.id INTO v_claimed;

  RETURN CASE WHEN v_claimed IS NULL THEN NULL ELSE v_token END;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_social_spot_media_finalization_v2(
  p_submission_id UUID,
  p_revision BIGINT,
  p_lease_seconds INTEGER DEFAULT 180
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_token UUID := gen_random_uuid();
  v_attempt_count INTEGER;
BEGIN
  IF p_revision <= 0 THEN
    RAISE EXCEPTION 'Revision must be positive' USING ERRCODE = '22023';
  END IF;
  IF p_lease_seconds NOT BETWEEN 30 AND 600 THEN
    RAISE EXCEPTION 'Finalization lease must be between 30 and 600 seconds'
      USING ERRCODE = '22023';
  END IF;

  SELECT submission.media_finalization_attempt_count
  INTO v_attempt_count
  FROM public.social_spot_submissions AS submission
  WHERE
    submission.id = p_submission_id AND
    submission.media_processing_revision = p_revision AND
    submission.media_processing_state = 'succeeded' AND
    (
      submission.media_finalization_available_at IS NULL OR
      submission.media_finalization_available_at <= v_now
    )
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_attempt_count >= 5 THEN
    UPDATE public.social_spot_submissions AS submission
    SET
      status = 'needs_review',
      media_processing_state = 'review_required',
      media_processing_completed_at = v_now,
      media_processing_updated_at = v_now,
      research_summary = 'Place verification could not finish after bounded retries.'
    WHERE submission.id = p_submission_id;
    RETURN NULL;
  END IF;

  UPDATE public.social_spot_submissions AS submission
  SET
    media_processing_state = 'finalizing',
    media_processing_started_at = COALESCE(submission.media_processing_started_at, v_now),
    media_finalization_token = v_token,
    media_finalization_lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
    media_finalization_attempt_count = submission.media_finalization_attempt_count + 1,
    media_finalization_available_at = NULL,
    media_processing_updated_at = v_now
  WHERE submission.id = p_submission_id;

  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_social_spot_media_finalization_v2(
  p_submission_id UUID,
  p_revision BIGINT,
  p_finalization_token UUID,
  p_succeeded BOOLEAN
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_attempt_count INTEGER;
  v_state TEXT;
BEGIN
  SELECT submission.media_finalization_attempt_count
  INTO v_attempt_count
  FROM public.social_spot_submissions AS submission
  WHERE
    submission.id = p_submission_id AND
    submission.media_processing_revision = p_revision AND
    submission.media_processing_state = 'finalizing' AND
    submission.media_finalization_token = p_finalization_token AND
    submission.media_finalization_lease_expires_at > v_now
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Social media finalization token is stale or expired'
      USING ERRCODE = '40001';
  END IF;

  v_state := CASE
    WHEN p_succeeded THEN 'completed'
    WHEN v_attempt_count >= 5 THEN 'review_required'
    ELSE 'succeeded'
  END;

  UPDATE public.social_spot_submissions AS submission
  SET
    status = CASE WHEN v_state = 'review_required' THEN 'needs_review' ELSE submission.status END,
    media_processing_state = v_state,
    media_finalization_token = NULL,
    media_finalization_lease_expires_at = NULL,
    media_finalization_available_at = CASE
      WHEN v_state = 'succeeded'
        THEN v_now + make_interval(secs => LEAST(900, 30 * (2 ^ GREATEST(0, v_attempt_count - 1))::integer))
      ELSE NULL
    END,
    media_processing_completed_at = CASE
      WHEN v_state IN ('completed', 'review_required') THEN v_now
      ELSE NULL
    END,
    media_processing_updated_at = v_now,
    research_summary = CASE
      WHEN v_state = 'review_required'
        THEN 'Place verification could not finish after bounded retries.'
      ELSE submission.research_summary
    END
  WHERE submission.id = p_submission_id;

  RETURN v_state;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_ready_social_spot_media_work_v1(
  p_limit INTEGER DEFAULT 3
)
RETURNS TABLE(submission_id UUID)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT submission.id
  FROM public.social_spot_submissions AS submission
  WHERE
    (
      submission.media_processing_state = 'succeeded' AND
      (
        submission.media_finalization_available_at IS NULL OR
        submission.media_finalization_available_at <= CURRENT_TIMESTAMP
      )
    ) OR (
      submission.media_processing_state = 'coverage_retry' AND
      submission.media_extraction_available_at <= CURRENT_TIMESTAMP
    ) OR (
      submission.media_processing_state IN ('queued', 'processing') AND
      EXISTS (
        SELECT 1
        FROM public.social_spot_submission_media_jobs AS job
        WHERE
          job.submission_id = submission.id AND
          job.revision = submission.media_processing_revision AND
          (
            (job.state IN ('queued', 'retry_wait') AND job.available_at <= CURRENT_TIMESTAMP) OR
            (job.state = 'leased' AND job.lease_expires_at <= CURRENT_TIMESTAMP)
          )
      )
    )
  ORDER BY submission.media_processing_updated_at ASC, submission.id ASC
  LIMIT LEAST(10, GREATEST(1, COALESCE(p_limit, 3)));
$$;

REVOKE ALL ON FUNCTION public.reset_social_spot_media_finalization_attempts_v1()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schedule_legacy_social_spot_media_backfill_v1(UUID[], TIMESTAMPTZ, INTEGER, BOOLEAN, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_social_spot_media_coverage_v1(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_social_spot_media_finalization_v2(UUID, BIGINT, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_social_spot_media_finalization_v2(UUID, BIGINT, UUID, BOOLEAN)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.schedule_legacy_social_spot_media_backfill_v1(UUID[], TIMESTAMPTZ, INTEGER, BOOLEAN, BOOLEAN)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_social_spot_media_coverage_v1(UUID, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_social_spot_media_finalization_v2(UUID, BIGINT, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_social_spot_media_finalization_v2(UUID, BIGINT, UUID, BOOLEAN)
  TO service_role;

COMMENT ON FUNCTION public.schedule_legacy_social_spot_media_backfill_v1(UUID[], TIMESTAMPTZ, INTEGER, BOOLEAN, BOOLEAN) IS
  'Schedules only explicitly reviewed pre-cutoff submissions. State and revision predicates make replay harmless.';
COMMENT ON FUNCTION public.claim_social_spot_media_coverage_v1(UUID, INTEGER) IS
  'Claims provider coverage work with database time and an expiring ownership token.';
COMMENT ON FUNCTION public.claim_social_spot_media_finalization_v2(UUID, BIGINT, INTEGER) IS
  'Claims bounded aggregate place verification with database time and a one-time token.';
COMMENT ON FUNCTION public.settle_social_spot_media_finalization_v2(UUID, BIGINT, UUID, BOOLEAN) IS
  'Settles aggregate verification with bounded exponential retries and terminal review state.';
