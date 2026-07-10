-- Durable, revision-fenced processing for every media item discovered in a
-- social submission. Array position is the authoritative ordinal; mediaKey is
-- the stable identity when a later manifest revision moves an item.

ALTER TABLE public.social_spot_submissions
  ADD COLUMN IF NOT EXISTS media_processing_state TEXT NOT NULL DEFAULT 'not_started'
    CHECK (
      media_processing_state IN (
        'not_started',
        'queued',
        'processing',
        'succeeded',
        'finalizing',
        'completed',
        'dead_letter',
        'coverage_retry',
        'coverage_processing',
        'review_required'
      )
    ),
  ADD COLUMN IF NOT EXISTS media_processing_revision BIGINT NOT NULL DEFAULT 0
    CHECK (media_processing_revision >= 0),
  ADD COLUMN IF NOT EXISTS media_manifest_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS media_item_count INTEGER NOT NULL DEFAULT 0
    CHECK (media_item_count BETWEEN 0 AND 35),
  ADD COLUMN IF NOT EXISTS media_succeeded_count INTEGER NOT NULL DEFAULT 0
    CHECK (media_succeeded_count BETWEEN 0 AND 35),
  ADD COLUMN IF NOT EXISTS media_dead_letter_count INTEGER NOT NULL DEFAULT 0
    CHECK (media_dead_letter_count BETWEEN 0 AND 35),
  ADD COLUMN IF NOT EXISTS media_processing_queued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS media_processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS media_processing_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS media_finalization_token UUID,
  ADD COLUMN IF NOT EXISTS media_finalization_lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS media_extraction_attempt_count INTEGER NOT NULL DEFAULT 0
    CHECK (media_extraction_attempt_count BETWEEN 0 AND 5),
  ADD COLUMN IF NOT EXISTS media_extraction_available_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS media_extraction_token UUID,
  ADD COLUMN IF NOT EXISTS media_extraction_lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS media_processing_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.social_spot_submissions
  ADD CONSTRAINT social_spot_submissions_media_finalization_lease_shape
  CHECK (
    (
      media_processing_state = 'finalizing' AND
      media_finalization_token IS NOT NULL AND
      media_finalization_lease_expires_at IS NOT NULL
    ) OR (
      media_processing_state <> 'finalizing' AND
      media_finalization_token IS NULL AND
      media_finalization_lease_expires_at IS NULL
    )
  );

ALTER TABLE public.social_spot_submissions
  ADD CONSTRAINT social_spot_submissions_media_extraction_lease_shape
  CHECK (
    (
      media_processing_state = 'coverage_processing' AND
      media_extraction_token IS NOT NULL AND
      media_extraction_lease_expires_at IS NOT NULL
    ) OR (
      media_processing_state <> 'coverage_processing' AND
      media_extraction_token IS NULL AND
      media_extraction_lease_expires_at IS NULL
    )
  );

CREATE TABLE public.social_spot_submission_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL
    REFERENCES public.social_spot_submissions(id) ON DELETE CASCADE,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 0 AND 34),
  media_key TEXT NOT NULL CHECK (
    media_key = btrim(media_key) AND
    char_length(media_key) BETWEEN 1 AND 512
  ),
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video', 'unknown')),
  source_url TEXT NOT NULL CHECK (
    source_url = btrim(source_url) AND
    char_length(source_url) BETWEEN 1 AND 8192
  ),
  fingerprint TEXT NOT NULL CHECK (
    fingerprint = btrim(fingerprint) AND
    char_length(fingerprint) BETWEEN 1 AND 512
  ),
  revision BIGINT NOT NULL CHECK (revision > 0),
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT social_spot_submission_media_identity_unique
    UNIQUE (submission_id, media_key),
  CONSTRAINT social_spot_submission_media_submission_id_id_unique
    UNIQUE (submission_id, id)
);

CREATE UNIQUE INDEX social_spot_submission_media_current_ordinal_unique
  ON public.social_spot_submission_media(submission_id, ordinal)
  WHERE is_current;

CREATE INDEX idx_social_spot_submission_media_current_revision
  ON public.social_spot_submission_media(submission_id, revision, ordinal)
  WHERE is_current;

CREATE TABLE public.social_spot_submission_media_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL,
  media_id UUID NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 0 AND 34),
  media_key TEXT NOT NULL CHECK (
    media_key = btrim(media_key) AND
    char_length(media_key) BETWEEN 1 AND 512
  ),
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video', 'unknown')),
  source_url TEXT NOT NULL CHECK (
    source_url = btrim(source_url) AND
    char_length(source_url) BETWEEN 1 AND 8192
  ),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  revision BIGINT NOT NULL CHECK (revision > 0),
  fingerprint TEXT NOT NULL CHECK (
    fingerprint = btrim(fingerprint) AND
    char_length(fingerprint) BETWEEN 1 AND 512
  ),
  state TEXT NOT NULL DEFAULT 'queued' CHECK (
    state IN (
      'queued',
      'leased',
      'retry_wait',
      'succeeded',
      'dead_letter',
      'cancelled'
    )
  ),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claim_token UUID,
  claimed_by TEXT CHECK (claimed_by IS NULL OR char_length(claimed_by) BETWEEN 1 AND 200),
  claimed_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  succeeded_at TIMESTAMPTZ,
  dead_lettered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  last_error TEXT CHECK (last_error IS NULL OR char_length(last_error) <= 8000),
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT social_spot_submission_media_jobs_media_fkey
    FOREIGN KEY (submission_id, media_id)
    REFERENCES public.social_spot_submission_media(submission_id, id)
    ON DELETE CASCADE,
  CONSTRAINT social_spot_submission_media_jobs_media_revision_unique
    UNIQUE (media_id, revision),
  CONSTRAINT social_spot_submission_media_jobs_ordinal_revision_unique
    UNIQUE (submission_id, revision, ordinal),
  CONSTRAINT social_spot_submission_media_jobs_attempt_bound
    CHECK (attempt_count <= max_attempts),
  CONSTRAINT social_spot_submission_media_jobs_lease_shape
    CHECK (
      (
        state = 'leased' AND
        claim_token IS NOT NULL AND
        claimed_by IS NOT NULL AND
        claimed_at IS NOT NULL AND
        lease_expires_at IS NOT NULL
      ) OR (
        state <> 'leased' AND
        claim_token IS NULL AND
        lease_expires_at IS NULL
      )
    ),
  CONSTRAINT social_spot_submission_media_jobs_terminal_timestamp
    CHECK (
      (state <> 'succeeded' OR succeeded_at IS NOT NULL) AND
      (state <> 'dead_letter' OR dead_lettered_at IS NOT NULL) AND
      (state <> 'cancelled' OR cancelled_at IS NOT NULL)
    )
);

CREATE INDEX idx_social_spot_submission_media_jobs_revision
  ON public.social_spot_submission_media_jobs(submission_id, revision, ordinal);

CREATE INDEX idx_social_spot_submission_media_jobs_ready
  ON public.social_spot_submission_media_jobs(
    submission_id,
    revision,
    available_at,
    created_at
  )
  WHERE state IN ('queued', 'retry_wait');

CREATE INDEX idx_social_spot_submission_media_jobs_expired_lease
  ON public.social_spot_submission_media_jobs(
    submission_id,
    revision,
    lease_expires_at,
    created_at
  )
  WHERE state = 'leased';

CREATE UNIQUE INDEX social_spot_submission_media_jobs_claim_token_unique
  ON public.social_spot_submission_media_jobs(claim_token)
  WHERE claim_token IS NOT NULL;

ALTER TABLE public.social_spot_submission_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_spot_submission_media FORCE ROW LEVEL SECURITY;
ALTER TABLE public.social_spot_submission_media_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_spot_submission_media_jobs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages social submission media"
  ON public.social_spot_submission_media;
CREATE POLICY "Service role manages social submission media"
  ON public.social_spot_submission_media
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages social submission media jobs"
  ON public.social_spot_submission_media_jobs;
CREATE POLICY "Service role manages social submission media jobs"
  ON public.social_spot_submission_media_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL PRIVILEGES ON TABLE public.social_spot_submission_media
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.social_spot_submission_media_jobs
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.social_spot_submission_media TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.social_spot_submission_media_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.claim_social_spot_media_finalization_v1(
  p_submission_id UUID,
  p_revision BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_expected_count INTEGER;
  v_current_media_count INTEGER;
  v_job_count INTEGER;
  v_succeeded_count INTEGER;
  v_dead_letter_count INTEGER;
  v_leased_count INTEGER;
  v_matched_succeeded_count INTEGER;
  v_current_state TEXT;
  v_finalized BOOLEAN;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF p_revision <= 0 THEN
    RAISE EXCEPTION 'Revision must be positive' USING ERRCODE = '22023';
  END IF;

  SELECT submission.media_item_count, submission.media_processing_state
  INTO v_expected_count, v_current_state
  FROM public.social_spot_submissions AS submission
  WHERE
    submission.id = p_submission_id AND
    submission.media_processing_revision = p_revision
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission media revision is stale or does not exist'
      USING ERRCODE = '40001';
  END IF;
  IF v_current_state = 'finalizing' THEN
    RETURN FALSE;
  END IF;
  IF v_current_state = 'completed' THEN
    RETURN TRUE;
  END IF;

  SELECT count(*)::integer
  INTO v_current_media_count
  FROM public.social_spot_submission_media AS media
  WHERE
    media.submission_id = p_submission_id AND
    media.revision = p_revision AND
    media.is_current;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE job.state = 'succeeded')::integer,
    count(*) FILTER (WHERE job.state = 'dead_letter')::integer,
    count(*) FILTER (WHERE job.state = 'leased')::integer
  INTO
    v_job_count,
    v_succeeded_count,
    v_dead_letter_count,
    v_leased_count
  FROM public.social_spot_submission_media_jobs AS job
  WHERE
    job.submission_id = p_submission_id AND
    job.revision = p_revision;

  SELECT count(*)::integer
  INTO v_matched_succeeded_count
  FROM public.social_spot_submission_media AS media
  JOIN public.social_spot_submission_media_jobs AS job
    ON job.media_id = media.id
   AND job.submission_id = media.submission_id
   AND job.revision = media.revision
   AND job.fingerprint = media.fingerprint
  WHERE
    media.submission_id = p_submission_id AND
    media.revision = p_revision AND
    media.is_current AND
    job.state = 'succeeded';

  IF
    v_current_media_count <> v_expected_count OR
    v_job_count <> v_expected_count
  THEN
    RAISE EXCEPTION 'Current media/job count does not match manifest count for revision %', p_revision
      USING ERRCODE = '23514';
  END IF;

  v_finalized :=
    v_succeeded_count = v_expected_count AND
    v_matched_succeeded_count = v_expected_count AND
    v_dead_letter_count = 0;

  UPDATE public.social_spot_submissions AS submission
  SET
    media_processing_state = CASE
      WHEN v_finalized THEN 'succeeded'
      WHEN v_dead_letter_count > 0 THEN 'dead_letter'
      WHEN
        v_leased_count > 0 OR
        v_succeeded_count > 0 OR
        submission.media_processing_started_at IS NOT NULL
      THEN 'processing'
      ELSE 'queued'
    END,
    media_succeeded_count = v_succeeded_count,
    media_dead_letter_count = v_dead_letter_count,
    media_processing_started_at = CASE
      WHEN
        v_leased_count > 0 OR
        v_succeeded_count > 0 OR
        v_dead_letter_count > 0
      THEN COALESCE(submission.media_processing_started_at, v_now)
      ELSE submission.media_processing_started_at
    END,
    media_processing_completed_at = CASE
      WHEN v_finalized
        THEN COALESCE(submission.media_processing_completed_at, v_now)
      ELSE NULL
    END,
    media_finalization_token = NULL,
    media_finalization_lease_expires_at = NULL,
    media_processing_updated_at = v_now
  WHERE submission.id = p_submission_id;

  RETURN v_finalized;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_social_spot_media_v1(
  p_submission_id UUID,
  p_manifest JSONB,
  p_max_attempts INTEGER DEFAULT 5,
  p_extraction_token UUID DEFAULT NULL
)
RETURNS TABLE(
  submission_id UUID,
  revision BIGINT,
  manifest_fingerprint TEXT,
  item_count INTEGER,
  processing_state TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_manifest JSONB := COALESCE(p_manifest, '[]'::jsonb);
  v_item_count INTEGER;
  v_current_revision BIGINT;
  v_current_manifest_fingerprint TEXT;
  v_current_processing_state TEXT;
  v_current_extraction_token UUID;
  v_current_extraction_lease_expires_at TIMESTAMPTZ;
  v_manifest_fingerprint TEXT;
  v_revision BIGINT;
  v_current_media_count INTEGER;
  v_manifest_mismatch BOOLEAN;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF jsonb_typeof(v_manifest) <> 'array' THEN
    RAISE EXCEPTION 'Media manifest must be a JSON array' USING ERRCODE = '22023';
  END IF;

  v_item_count := jsonb_array_length(v_manifest);
  IF v_item_count > 35 THEN
    RAISE EXCEPTION 'Media manifest cannot contain more than 35 items'
      USING ERRCODE = '22023';
  END IF;

  IF p_max_attempts NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'max_attempts must be between 1 and 10'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_manifest) AS entry(item)
    WHERE jsonb_typeof(entry.item) <> 'object'
  ) THEN
    RAISE EXCEPTION 'Every media manifest item must be a JSON object'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_manifest) AS entry(item)
    WHERE
      char_length(btrim(COALESCE(entry.item->>'mediaKey', entry.item->>'media_key', '')))
        NOT BETWEEN 1 AND 512 OR
      char_length(btrim(COALESCE(
        entry.item->>'sourceUrl',
        entry.item->>'source_url',
        entry.item->>'mediaUrl',
        entry.item->>'media_url',
        entry.item->>'url',
        ''
      ))) NOT BETWEEN 1 AND 8192 OR
      char_length(btrim(COALESCE(
        entry.item->>'fingerprint',
        entry.item->>'contentFingerprint',
        entry.item->>'content_fingerprint',
        ''
      ))) NOT BETWEEN 1 AND 512 OR
      lower(COALESCE(
        NULLIF(entry.item->>'mediaType', ''),
        NULLIF(entry.item->>'media_type', ''),
        NULLIF(entry.item->>'mediaKind', ''),
        NULLIF(entry.item->>'media_kind', ''),
        'unknown'
      )) NOT IN ('image', 'video', 'unknown')
  ) THEN
    RAISE EXCEPTION 'Each media item needs valid mediaKey, sourceUrl, fingerprint, and mediaType fields'
      USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(*) <> count(DISTINCT btrim(COALESCE(
      entry.item->>'mediaKey',
      entry.item->>'media_key',
      ''
    )))
    FROM jsonb_array_elements(v_manifest) AS entry(item)
  ) THEN
    RAISE EXCEPTION 'Media keys must be unique within a manifest'
      USING ERRCODE = '22023';
  END IF;

  -- Signed CDN query parameters rotate without changing media identity. Hash
  -- only ordered stable identity fields so URL refreshes preserve the revision.
  SELECT md5(COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'ordinal', entry.position - 1,
        'mediaKey', btrim(COALESCE(
          entry.item->>'mediaKey',
          entry.item->>'media_key',
          ''
        )),
        'mediaType', lower(COALESCE(
          NULLIF(entry.item->>'mediaType', ''),
          NULLIF(entry.item->>'media_type', ''),
          NULLIF(entry.item->>'mediaKind', ''),
          NULLIF(entry.item->>'media_kind', ''),
          'unknown'
        )),
        'fingerprint', btrim(COALESCE(
          entry.item->>'fingerprint',
          entry.item->>'contentFingerprint',
          entry.item->>'content_fingerprint',
          ''
        ))
      )
      ORDER BY entry.position
    )::text,
    '[]'
  ))
  INTO v_manifest_fingerprint
  FROM jsonb_array_elements(v_manifest)
    WITH ORDINALITY AS entry(item, position);

  SELECT
    submission.media_processing_revision,
    submission.media_manifest_fingerprint,
    submission.media_processing_state,
    submission.media_extraction_token,
    submission.media_extraction_lease_expires_at
  INTO
    v_current_revision,
    v_current_manifest_fingerprint,
    v_current_processing_state,
    v_current_extraction_token,
    v_current_extraction_lease_expires_at
  FROM public.social_spot_submissions AS submission
  WHERE submission.id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Social submission does not exist' USING ERRCODE = 'P0002';
  END IF;
  IF v_current_processing_state = 'coverage_processing' AND (
    p_extraction_token IS NULL OR
    p_extraction_token <> v_current_extraction_token OR
    v_current_extraction_lease_expires_at <= v_now
  ) THEN
    RAISE EXCEPTION 'Media extraction claim is stale or expired'
      USING ERRCODE = '40001';
  END IF;
  IF v_current_processing_state <> 'coverage_processing' AND p_extraction_token IS NOT NULL THEN
    RAISE EXCEPTION 'Media extraction claim no longer owns this submission'
      USING ERRCODE = '40001';
  END IF;

  IF v_current_manifest_fingerprint = v_manifest_fingerprint THEN
    SELECT count(*)::integer
    INTO v_current_media_count
    FROM public.social_spot_submission_media AS media
    WHERE
      media.submission_id = p_submission_id AND
      media.revision = v_current_revision AND
      media.is_current;

    SELECT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_manifest)
        WITH ORDINALITY AS entry(item, position)
      LEFT JOIN public.social_spot_submission_media AS media
        ON media.submission_id = p_submission_id
       AND media.media_key = btrim(COALESCE(
         entry.item->>'mediaKey',
         entry.item->>'media_key',
         ''
       ))
       AND media.is_current
      WHERE
        media.id IS NULL OR
        media.revision <> v_current_revision OR
        media.ordinal <> entry.position - 1 OR
        media.fingerprint <> btrim(COALESCE(
          entry.item->>'fingerprint',
          entry.item->>'contentFingerprint',
          entry.item->>'content_fingerprint',
          ''
        ))
    )
    INTO v_manifest_mismatch;

    IF v_current_media_count <> v_item_count OR v_manifest_mismatch THEN
      RAISE EXCEPTION 'Stored current media does not match the idempotent manifest revision'
        USING ERRCODE = '23514';
    END IF;

    UPDATE public.social_spot_submission_media AS media
    SET
      source_url = btrim(COALESCE(
        entry.item->>'sourceUrl',
        entry.item->>'source_url',
        entry.item->>'mediaUrl',
        entry.item->>'media_url',
        entry.item->>'url',
        ''
      )),
      payload = entry.item,
      updated_at = v_now
    FROM jsonb_array_elements(v_manifest)
      WITH ORDINALITY AS entry(item, position)
    WHERE
      media.submission_id = p_submission_id AND
      media.revision = v_current_revision AND
      media.is_current AND
      media.media_key = btrim(COALESCE(
        entry.item->>'mediaKey',
        entry.item->>'media_key',
        ''
      ));

    UPDATE public.social_spot_submission_media_jobs AS job
    SET
      source_url = media.source_url,
      payload = media.payload,
      updated_at = v_now
    FROM public.social_spot_submission_media AS media
    WHERE
      job.media_id = media.id AND
      job.submission_id = p_submission_id AND
      job.revision = v_current_revision AND
      media.is_current;

    RETURN QUERY
    SELECT
      submission.id,
      submission.media_processing_revision,
      submission.media_manifest_fingerprint,
      submission.media_item_count,
      submission.media_processing_state
    FROM public.social_spot_submissions AS submission
    WHERE submission.id = p_submission_id;
    RETURN;
  END IF;

  v_revision := v_current_revision + 1;

  UPDATE public.social_spot_submission_media_jobs AS job
  SET
    state = 'cancelled',
    claim_token = NULL,
    lease_expires_at = NULL,
    cancelled_at = v_now,
    updated_at = v_now
  WHERE
    job.submission_id = p_submission_id AND
    job.state IN ('queued', 'leased', 'retry_wait');

  UPDATE public.social_spot_submission_media AS media
  SET
    is_current = FALSE,
    updated_at = v_now
  WHERE media.submission_id = p_submission_id AND media.is_current;

  INSERT INTO public.social_spot_submission_media (
    submission_id,
    ordinal,
    media_key,
    media_type,
    source_url,
    fingerprint,
    revision,
    is_current,
    payload,
    updated_at
  )
  SELECT
    p_submission_id,
    entry.position - 1,
    btrim(COALESCE(entry.item->>'mediaKey', entry.item->>'media_key', '')),
    lower(COALESCE(
      NULLIF(entry.item->>'mediaType', ''),
      NULLIF(entry.item->>'media_type', ''),
      NULLIF(entry.item->>'mediaKind', ''),
      NULLIF(entry.item->>'media_kind', ''),
      'unknown'
    )),
    btrim(COALESCE(
      entry.item->>'sourceUrl',
      entry.item->>'source_url',
      entry.item->>'mediaUrl',
      entry.item->>'media_url',
      entry.item->>'url',
      ''
    )),
    btrim(COALESCE(
      entry.item->>'fingerprint',
      entry.item->>'contentFingerprint',
      entry.item->>'content_fingerprint',
      ''
    )),
    v_revision,
    TRUE,
    entry.item,
    v_now
  FROM jsonb_array_elements(v_manifest)
    WITH ORDINALITY AS entry(item, position)
  ON CONFLICT ON CONSTRAINT social_spot_submission_media_identity_unique DO UPDATE
  SET
    ordinal = EXCLUDED.ordinal,
    media_type = EXCLUDED.media_type,
    source_url = EXCLUDED.source_url,
    fingerprint = EXCLUDED.fingerprint,
    revision = EXCLUDED.revision,
    is_current = TRUE,
    payload = EXCLUDED.payload,
    updated_at = EXCLUDED.updated_at;

  INSERT INTO public.social_spot_submission_media_jobs (
    submission_id,
    media_id,
    ordinal,
    media_key,
    media_type,
    source_url,
    payload,
    revision,
    fingerprint,
    state,
    attempt_count,
    max_attempts,
    available_at,
    created_at,
    updated_at
  )
  SELECT
    media.submission_id,
    media.id,
    media.ordinal,
    media.media_key,
    media.media_type,
    media.source_url,
    media.payload,
    media.revision,
    media.fingerprint,
    'queued',
    0,
    p_max_attempts,
    v_now,
    v_now,
    v_now
  FROM public.social_spot_submission_media AS media
  WHERE
    media.submission_id = p_submission_id AND
    media.revision = v_revision AND
    media.is_current
  ORDER BY media.ordinal;

  UPDATE public.social_spot_submissions AS submission
  SET
    media_processing_state = CASE
      WHEN v_item_count = 0 THEN 'succeeded'
      ELSE 'queued'
    END,
    media_processing_revision = v_revision,
    media_manifest_fingerprint = v_manifest_fingerprint,
    media_item_count = v_item_count,
    media_succeeded_count = 0,
    media_dead_letter_count = 0,
    media_processing_queued_at = v_now,
    media_processing_started_at = NULL,
    media_processing_completed_at = CASE
      WHEN v_item_count = 0 THEN v_now
      ELSE NULL
    END,
    media_finalization_token = NULL,
    media_finalization_lease_expires_at = NULL,
    media_extraction_attempt_count = 0,
    media_extraction_available_at = NULL,
    media_extraction_token = NULL,
    media_extraction_lease_expires_at = NULL,
    media_processing_updated_at = v_now
  WHERE submission.id = p_submission_id;

  RETURN QUERY
  SELECT
    submission.id,
    submission.media_processing_revision,
    submission.media_manifest_fingerprint,
    submission.media_item_count,
    submission.media_processing_state
  FROM public.social_spot_submissions AS submission
  WHERE submission.id = p_submission_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.defer_social_spot_media_coverage_v1(
  p_submission_id UUID,
  p_extracted_count INTEGER,
  p_expected_count INTEGER,
  p_reason TEXT,
  p_extraction_token UUID DEFAULT NULL
)
RETURNS TABLE(
  processing_state TEXT,
  attempt_count INTEGER,
  available_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_attempt_count INTEGER;
  v_state TEXT;
  v_available_at TIMESTAMPTZ;
  v_current_state TEXT;
  v_current_token UUID;
  v_current_lease_expires_at TIMESTAMPTZ;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF p_extracted_count < 0 OR p_expected_count < p_extracted_count THEN
    RAISE EXCEPTION 'Invalid extracted and expected media counts'
      USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Coverage reason must contain between 1 and 120 characters'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    LEAST(submission.media_extraction_attempt_count + 1, 5),
    submission.media_processing_state,
    submission.media_extraction_token,
    submission.media_extraction_lease_expires_at
  INTO
    v_attempt_count,
    v_current_state,
    v_current_token,
    v_current_lease_expires_at
  FROM public.social_spot_submissions AS submission
  WHERE submission.id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Social submission does not exist' USING ERRCODE = 'P0002';
  END IF;
  IF v_current_state = 'coverage_processing' AND (
    p_extraction_token IS NULL OR
    p_extraction_token <> v_current_token OR
    v_current_lease_expires_at <= v_now
  ) THEN
    RAISE EXCEPTION 'Media extraction claim is stale or expired'
      USING ERRCODE = '40001';
  END IF;
  IF v_current_state <> 'coverage_processing' AND p_extraction_token IS NOT NULL THEN
    RAISE EXCEPTION 'Media extraction claim no longer owns this submission'
      USING ERRCODE = '40001';
  END IF;
  IF p_extraction_token IS NULL AND v_current_state IN (
    'queued', 'processing', 'succeeded', 'finalizing', 'completed'
  ) THEN
    RAISE EXCEPTION 'Active media work cannot be replaced by incomplete coverage'
      USING ERRCODE = '40001';
  END IF;

  v_state := CASE WHEN v_attempt_count >= 5 THEN 'review_required' ELSE 'coverage_retry' END;
  v_available_at := CASE
    WHEN v_state = 'review_required' THEN NULL
    WHEN v_attempt_count = 1 THEN v_now
    ELSE v_now + make_interval(
      secs => LEAST(3600, (5 * power(2::numeric, v_attempt_count - 1))::integer)
    )
  END;

  UPDATE public.social_spot_submission_media_jobs AS job
  SET
    state = 'cancelled',
    claim_token = NULL,
    lease_expires_at = NULL,
    cancelled_at = v_now,
    updated_at = v_now
  WHERE
    job.submission_id = p_submission_id AND
    job.state IN ('queued', 'leased', 'retry_wait');

  UPDATE public.social_spot_submissions AS submission
  SET
    media_processing_state = v_state,
    media_manifest_fingerprint = NULL,
    media_item_count = LEAST(35, p_extracted_count),
    media_succeeded_count = 0,
    media_dead_letter_count = 0,
    media_finalization_token = NULL,
    media_finalization_lease_expires_at = NULL,
    media_extraction_attempt_count = v_attempt_count,
    media_extraction_available_at = v_available_at,
    media_extraction_token = NULL,
    media_extraction_lease_expires_at = NULL,
    media_processing_completed_at = CASE
      WHEN v_state = 'review_required' THEN v_now
      ELSE NULL
    END,
    media_processing_updated_at = v_now
  WHERE submission.id = p_submission_id;

  RETURN QUERY SELECT v_state, v_attempt_count, v_available_at;
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
    submission.media_processing_state = 'succeeded' OR
    (
      submission.media_processing_state = 'coverage_retry' AND
      submission.media_extraction_available_at <= CURRENT_TIMESTAMP
    ) OR
    (
      submission.media_processing_state IN ('queued', 'processing') AND
      EXISTS (
        SELECT 1
        FROM public.social_spot_submission_media_jobs AS job
        WHERE
          job.submission_id = submission.id AND
          job.revision = submission.media_processing_revision AND
          (
            (
              job.state IN ('queued', 'retry_wait') AND
              job.available_at <= CURRENT_TIMESTAMP
            ) OR (
              job.state = 'leased' AND
              job.lease_expires_at <= CURRENT_TIMESTAMP
            )
          )
      )
    )
  ORDER BY submission.media_processing_updated_at ASC, submission.id ASC
  LIMIT LEAST(10, GREATEST(1, COALESCE(p_limit, 3)));
$$;

CREATE OR REPLACE FUNCTION public.claim_social_spot_media_jobs_v1(
  p_submission_id UUID,
  p_revision BIGINT,
  p_worker_id TEXT,
  p_limit INTEGER DEFAULT 1,
  p_lease_seconds INTEGER DEFAULT 300,
  p_media_kind TEXT DEFAULT NULL
)
RETURNS TABLE(
  job_id UUID,
  claim_token UUID,
  submission_id UUID,
  revision BIGINT,
  media_id UUID,
  media_key TEXT,
  fingerprint TEXT,
  ordinal INTEGER,
  media_kind TEXT,
  source_url TEXT,
  attempt_count INTEGER,
  max_attempts INTEGER
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_current_revision BIGINT;
BEGIN
  IF p_revision <= 0 THEN
    RAISE EXCEPTION 'Revision must be positive' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(COALESCE(p_worker_id, ''))) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'worker_id must contain between 1 and 200 characters'
      USING ERRCODE = '22023';
  END IF;
  IF p_limit NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'Claim limit must be between 1 and 20'
      USING ERRCODE = '22023';
  END IF;
  IF p_lease_seconds NOT BETWEEN 15 AND 3600 THEN
    RAISE EXCEPTION 'Lease duration must be between 15 and 3600 seconds'
      USING ERRCODE = '22023';
  END IF;
  IF p_media_kind IS NOT NULL AND p_media_kind NOT IN ('image', 'video') THEN
    RAISE EXCEPTION 'media_kind must be image, video, or null'
      USING ERRCODE = '22023';
  END IF;

  SELECT submission.media_processing_revision
  INTO v_current_revision
  FROM public.social_spot_submissions AS submission
  WHERE submission.id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND OR v_current_revision <> p_revision THEN
    RAISE EXCEPTION 'Submission media revision is stale or does not exist'
      USING ERRCODE = '40001';
  END IF;

  -- Defensive cleanup makes stale revisions unclaimable even if a previous
  -- manifest sync was interrupted outside these RPCs.
  UPDATE public.social_spot_submission_media_jobs AS job
  SET
    state = 'cancelled',
    claim_token = NULL,
    lease_expires_at = NULL,
    cancelled_at = v_now,
    updated_at = v_now
  WHERE
    job.submission_id = p_submission_id AND
    job.state IN ('queued', 'leased', 'retry_wait') AND
    (
      job.revision <> p_revision OR
      NOT EXISTS (
        SELECT 1
        FROM public.social_spot_submission_media AS media
        WHERE
          media.id = job.media_id AND
          media.submission_id = job.submission_id AND
          media.revision = job.revision AND
          media.fingerprint = job.fingerprint AND
          media.is_current
      )
    );

  -- A worker that consumed its final attempt and then disappeared must not
  -- leave an expired lease permanently stranded.
  UPDATE public.social_spot_submission_media_jobs AS job
  SET
    state = 'dead_letter',
    claim_token = NULL,
    lease_expires_at = NULL,
    dead_lettered_at = v_now,
    last_error = COALESCE(job.last_error, 'Lease expired after final attempt'),
    updated_at = v_now
  WHERE
    job.submission_id = p_submission_id AND
    job.revision = p_revision AND
    job.attempt_count >= job.max_attempts AND
    (
      job.state IN ('queued', 'retry_wait') OR
      (job.state = 'leased' AND job.lease_expires_at <= v_now)
    );

  RETURN QUERY
  WITH candidates AS (
    SELECT job.id
    FROM public.social_spot_submission_media_jobs AS job
    WHERE
      job.submission_id = p_submission_id AND
      job.revision = p_revision AND
      (p_media_kind IS NULL OR job.media_type = p_media_kind) AND
      job.attempt_count < job.max_attempts AND
      (
        (job.state IN ('queued', 'retry_wait') AND job.available_at <= v_now) OR
        (job.state = 'leased' AND job.lease_expires_at <= v_now)
      ) AND
      EXISTS (
        SELECT 1
        FROM public.social_spot_submission_media AS media
        WHERE
          media.id = job.media_id AND
          media.submission_id = job.submission_id AND
          media.revision = job.revision AND
          media.fingerprint = job.fingerprint AND
          media.is_current
      )
    ORDER BY
      CASE WHEN job.state = 'leased' THEN job.lease_expires_at ELSE job.available_at END,
      job.created_at,
      job.ordinal
    FOR UPDATE OF job SKIP LOCKED
    LIMIT p_limit
  ),
  claimed AS (
    UPDATE public.social_spot_submission_media_jobs AS job
    SET
      state = 'leased',
      attempt_count = job.attempt_count + 1,
      claim_token = gen_random_uuid(),
      claimed_by = btrim(p_worker_id),
      claimed_at = v_now,
      lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
      updated_at = v_now
    FROM candidates
    WHERE job.id = candidates.id
    RETURNING job.*
  )
  SELECT
    claimed.id,
    claimed.claim_token,
    claimed.submission_id,
    claimed.revision,
    claimed.media_id,
    claimed.media_key,
    claimed.fingerprint,
    claimed.ordinal::integer,
    claimed.media_type,
    claimed.source_url,
    claimed.attempt_count,
    claimed.max_attempts
  FROM claimed
  ORDER BY claimed.ordinal;

  PERFORM public.claim_social_spot_media_finalization_v1(
    p_submission_id,
    p_revision
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_social_spot_media_job_v1(
  p_job_id UUID,
  p_claim_token UUID,
  p_result JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE(
  job_id UUID,
  submission_id UUID,
  revision BIGINT,
  job_state TEXT,
  processing_state TEXT,
  finalized BOOLEAN,
  succeeded_count INTEGER,
  item_count INTEGER
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_submission_id UUID;
  v_revision BIGINT;
  v_current_revision BIGINT;
  v_changed INTEGER;
  v_finalized BOOLEAN;
  v_processing_state TEXT;
  v_succeeded_count INTEGER;
  v_item_count INTEGER;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF p_claim_token IS NULL THEN
    RAISE EXCEPTION 'claim_token is required' USING ERRCODE = '22023';
  END IF;

  SELECT job.submission_id
  INTO v_submission_id
  FROM public.social_spot_submission_media_jobs AS job
  WHERE job.id = p_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Media job does not exist' USING ERRCODE = 'P0002';
  END IF;

  SELECT submission.media_processing_revision
  INTO v_current_revision
  FROM public.social_spot_submissions AS submission
  WHERE submission.id = v_submission_id
  FOR UPDATE;

  SELECT job.revision
  INTO v_revision
  FROM public.social_spot_submission_media_jobs AS job
  WHERE job.id = p_job_id
  FOR UPDATE;

  UPDATE public.social_spot_submission_media_jobs AS job
  SET
    state = 'succeeded',
    claim_token = NULL,
    lease_expires_at = NULL,
    succeeded_at = v_now,
    last_error = NULL,
    result = COALESCE(p_result, '{}'::jsonb),
    updated_at = v_now
  WHERE
    job.id = p_job_id AND
    job.submission_id = v_submission_id AND
    job.revision = v_current_revision AND
    job.revision = v_revision AND
    job.state = 'leased' AND
    job.claim_token = p_claim_token AND
    job.lease_expires_at > v_now AND
    EXISTS (
      SELECT 1
      FROM public.social_spot_submission_media AS media
      WHERE
        media.id = job.media_id AND
        media.submission_id = job.submission_id AND
        media.revision = job.revision AND
        media.fingerprint = job.fingerprint AND
        media.is_current
    );

  GET DIAGNOSTICS v_changed = ROW_COUNT;
  IF v_changed <> 1 THEN
    RAISE EXCEPTION 'Media job claim is stale, expired, or already settled'
      USING ERRCODE = '40001';
  END IF;

  v_finalized := public.claim_social_spot_media_finalization_v1(
    v_submission_id,
    v_revision
  );

  SELECT
    submission.media_processing_state,
    submission.media_succeeded_count,
    submission.media_item_count
  INTO
    v_processing_state,
    v_succeeded_count,
    v_item_count
  FROM public.social_spot_submissions AS submission
  WHERE submission.id = v_submission_id;

  RETURN QUERY SELECT
    p_job_id,
    v_submission_id,
    v_revision,
    'succeeded'::text,
    v_processing_state,
    v_finalized,
    v_succeeded_count,
    v_item_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_social_spot_media_job_v1(
  p_job_id UUID,
  p_claim_token UUID,
  p_error TEXT,
  p_retryable BOOLEAN DEFAULT TRUE,
  p_retry_after_seconds INTEGER DEFAULT NULL
)
RETURNS TABLE(
  job_id UUID,
  submission_id UUID,
  revision BIGINT,
  job_state TEXT,
  processing_state TEXT,
  next_available_at TIMESTAMPTZ,
  attempt_count INTEGER,
  max_attempts INTEGER
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_submission_id UUID;
  v_revision BIGINT;
  v_current_revision BIGINT;
  v_attempt_count INTEGER;
  v_max_attempts INTEGER;
  v_backoff_seconds INTEGER;
  v_state TEXT;
  v_available_at TIMESTAMPTZ;
  v_processing_state TEXT;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF p_claim_token IS NULL THEN
    RAISE EXCEPTION 'claim_token is required' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(COALESCE(p_error, ''))) NOT BETWEEN 1 AND 8000 THEN
    RAISE EXCEPTION 'error must contain between 1 and 8000 characters'
      USING ERRCODE = '22023';
  END IF;
  IF p_retry_after_seconds IS NOT NULL AND p_retry_after_seconds NOT BETWEEN 1 AND 3600 THEN
    RAISE EXCEPTION 'retry_after_seconds must be between 1 and 3600'
      USING ERRCODE = '22023';
  END IF;

  SELECT job.submission_id
  INTO v_submission_id
  FROM public.social_spot_submission_media_jobs AS job
  WHERE job.id = p_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Media job does not exist' USING ERRCODE = 'P0002';
  END IF;

  SELECT submission.media_processing_revision
  INTO v_current_revision
  FROM public.social_spot_submissions AS submission
  WHERE submission.id = v_submission_id
  FOR UPDATE;

  SELECT
    job.revision,
    job.attempt_count,
    job.max_attempts
  INTO
    v_revision,
    v_attempt_count,
    v_max_attempts
  FROM public.social_spot_submission_media_jobs AS job
  WHERE
    job.id = p_job_id AND
    job.state = 'leased' AND
    job.claim_token = p_claim_token AND
    job.lease_expires_at > v_now
  FOR UPDATE;

  IF NOT FOUND OR v_revision <> v_current_revision THEN
    RAISE EXCEPTION 'Media job claim is stale, expired, or already settled'
      USING ERRCODE = '40001';
  END IF;

  v_backoff_seconds := COALESCE(
    p_retry_after_seconds,
    LEAST(
      3600,
      (5 * power(2::numeric, GREATEST(v_attempt_count - 1, 0)))::integer
    )
  );

  UPDATE public.social_spot_submission_media_jobs AS job
  SET
    state = CASE
      WHEN NOT p_retryable OR v_attempt_count >= v_max_attempts THEN 'dead_letter'
      ELSE 'retry_wait'
    END,
    claim_token = NULL,
    lease_expires_at = NULL,
    available_at = CASE
      WHEN NOT p_retryable OR v_attempt_count >= v_max_attempts THEN job.available_at
      ELSE v_now + make_interval(secs => v_backoff_seconds)
    END,
    dead_lettered_at = CASE
      WHEN NOT p_retryable OR v_attempt_count >= v_max_attempts THEN v_now
      ELSE NULL
    END,
    last_error = btrim(p_error),
    updated_at = v_now
  WHERE
    job.id = p_job_id AND
    job.submission_id = v_submission_id AND
    job.revision = v_revision AND
    EXISTS (
      SELECT 1
      FROM public.social_spot_submission_media AS media
      WHERE
        media.id = job.media_id AND
        media.submission_id = job.submission_id AND
        media.revision = job.revision AND
        media.fingerprint = job.fingerprint AND
        media.is_current
    )
  RETURNING
    job.state,
    job.available_at
  INTO
    v_state,
    v_available_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Media job fingerprint no longer matches the current manifest'
      USING ERRCODE = '40001';
  END IF;

  PERFORM public.claim_social_spot_media_finalization_v1(
    v_submission_id,
    v_revision
  );

  SELECT submission.media_processing_state
  INTO v_processing_state
  FROM public.social_spot_submissions AS submission
  WHERE submission.id = v_submission_id;

  RETURN QUERY SELECT
    p_job_id,
    v_submission_id,
    v_revision,
    v_state,
    v_processing_state,
    CASE WHEN v_state = 'retry_wait' THEN v_available_at ELSE NULL END,
    v_attempt_count,
    v_max_attempts;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_social_spot_media_finalization_v1(UUID, BIGINT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_social_spot_media_v1(UUID, JSONB, INTEGER, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.defer_social_spot_media_coverage_v1(UUID, INTEGER, INTEGER, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_ready_social_spot_media_work_v1(INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_social_spot_media_jobs_v1(UUID, BIGINT, TEXT, INTEGER, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_social_spot_media_job_v1(UUID, UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_social_spot_media_job_v1(UUID, UUID, TEXT, BOOLEAN, INTEGER)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_social_spot_media_finalization_v1(UUID, BIGINT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_social_spot_media_v1(UUID, JSONB, INTEGER, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.defer_social_spot_media_coverage_v1(UUID, INTEGER, INTEGER, TEXT, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.list_ready_social_spot_media_work_v1(INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_social_spot_media_jobs_v1(UUID, BIGINT, TEXT, INTEGER, INTEGER, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_social_spot_media_job_v1(UUID, UUID, JSONB)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_social_spot_media_job_v1(UUID, UUID, TEXT, BOOLEAN, INTEGER)
  TO service_role;

COMMENT ON TABLE public.social_spot_submission_media IS
  'Authoritative current and historical media identities for a social submission manifest.';
COMMENT ON TABLE public.social_spot_submission_media_jobs IS
  'Immutable per-revision media work snapshots with fenced leases and bounded retries.';
COMMENT ON FUNCTION public.sync_social_spot_media_v1(UUID, JSONB, INTEGER, UUID) IS
  'Atomically syncs an ordered manifest of at most 35 objects. Required item fields: mediaKey, sourceUrl, and fingerprint; mediaType is image, video, or unknown.';
COMMENT ON FUNCTION public.defer_social_spot_media_coverage_v1(UUID, INTEGER, INTEGER, TEXT, UUID) IS
  'Cancels stale media work and schedules bounded provider extraction retries before review is required.';
COMMENT ON FUNCTION public.list_ready_social_spot_media_work_v1(INTEGER) IS
  'Lists only submissions with immediately claimable media, aggregate finalization, or provider coverage work.';
COMMENT ON FUNCTION public.claim_social_spot_media_jobs_v1(UUID, BIGINT, TEXT, INTEGER, INTEGER, TEXT) IS
  'Claims ready current-revision media jobs with FOR UPDATE SKIP LOCKED and expiring claim tokens.';
COMMENT ON FUNCTION public.complete_social_spot_media_job_v1(UUID, UUID, JSONB) IS
  'Completes an unexpired fenced claim and finalizes the parent only when every current-revision job succeeded.';
COMMENT ON FUNCTION public.fail_social_spot_media_job_v1(UUID, UUID, TEXT, BOOLEAN, INTEGER) IS
  'Fails an unexpired fenced claim into bounded exponential retry_wait or dead_letter state.';
