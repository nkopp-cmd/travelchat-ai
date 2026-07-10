-- Make social submission processing resumable and relational while preserving
-- compatibility with the existing JSON research payload.

ALTER TABLE public.spots
  ADD COLUMN IF NOT EXISTS google_place_id TEXT;

WITH candidate_places AS (
  SELECT DISTINCT ON (candidate.value->>'spotId')
    (candidate.value->>'spotId')::uuid AS spot_id,
    candidate.value->>'placeId' AS place_id
  FROM public.social_spot_submissions AS submission
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(submission.research->'createdCandidates') = 'array'
        THEN submission.research->'createdCandidates'
      ELSE '[]'::jsonb
    END
  ) AS candidate(value)
  WHERE
    candidate.value->>'spotId' IS NOT NULL AND
    candidate.value->>'spotId' <> '' AND
    candidate.value->>'placeId' IS NOT NULL AND
    candidate.value->>'placeId' <> ''
)
UPDATE public.spots AS spot
SET google_place_id = candidate_places.place_id
FROM candidate_places
WHERE
  spot.id = candidate_places.spot_id AND
  spot.google_place_id IS NULL;

DROP INDEX IF EXISTS public.idx_spots_google_place_id;
CREATE UNIQUE INDEX idx_spots_google_place_id
  ON public.spots(google_place_id)
  WHERE google_place_id IS NOT NULL;

COMMENT ON COLUMN public.spots.google_place_id IS
  'Durable Google Places place ID used for exact deduplication, photo provenance, and directions.';

ALTER TABLE public.social_spot_submissions
  ADD COLUMN IF NOT EXISTS processing_state TEXT NOT NULL DEFAULT 'completed'
    CHECK (processing_state IN ('processing', 'retryable', 'completed')),
  ADD COLUMN IF NOT EXISTS processing_attempt INTEGER NOT NULL DEFAULT 0
    CHECK (processing_attempt >= 0),
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

UPDATE public.social_spot_submissions
SET
  processing_state = 'completed',
  completed_at = COALESCE(completed_at, updated_at)
WHERE processing_state = 'completed' AND completed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.social_spot_submission_aliases (
  alias_url TEXT PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES public.social_spot_submissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_spot_submission_aliases_submission
  ON public.social_spot_submission_aliases(submission_id);

INSERT INTO public.social_spot_submission_aliases(alias_url, submission_id)
SELECT canonical_url, id
FROM public.social_spot_submissions
ON CONFLICT (alias_url) DO NOTHING;

INSERT INTO public.social_spot_submission_aliases(alias_url, submission_id)
SELECT metadata->>'finalUrl', id
FROM public.social_spot_submissions
WHERE
  metadata->>'finalUrl' IS NOT NULL AND
  metadata->>'finalUrl' <> ''
ON CONFLICT (alias_url) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.social_spot_submission_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.social_spot_submissions(id) ON DELETE CASCADE,
  candidate_key TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  spot_id UUID REFERENCES public.spots(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (
    status IN ('spot_created', 'spot_reused', 'needs_review', 'research_pending')
  ),
  research JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT social_spot_submission_candidates_key_unique
    UNIQUE (submission_id, candidate_key)
);

CREATE INDEX IF NOT EXISTS idx_social_spot_submission_candidates_order
  ON public.social_spot_submission_candidates(submission_id, ordinal);

CREATE INDEX IF NOT EXISTS idx_social_spot_submission_candidates_spot
  ON public.social_spot_submission_candidates(spot_id)
  WHERE spot_id IS NOT NULL;

ALTER TABLE public.social_spot_submission_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_spot_submission_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages social submission aliases"
  ON public.social_spot_submission_aliases;
CREATE POLICY "Service role manages social submission aliases"
  ON public.social_spot_submission_aliases
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages social submission candidates"
  ON public.social_spot_submission_candidates;
CREATE POLICY "Service role manages social submission candidates"
  ON public.social_spot_submission_candidates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.social_spot_submission_aliases TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.social_spot_submission_candidates TO service_role;

INSERT INTO public.social_spot_submission_candidates (
  submission_id,
  candidate_key,
  ordinal,
  spot_id,
  status,
  research
)
SELECT
  submission.id,
  md5(
    lower(trim(COALESCE(candidate.value->>'spotName', ''))) || '|' ||
    lower(trim(COALESCE(candidate.value->>'address', ''))) || '|' ||
    lower(trim(COALESCE(candidate.value->>'city', ''))) ||
    CASE
      WHEN COALESCE(candidate.value->>'spotName', '') = '' AND
           COALESCE(candidate.value->>'address', '') = '' AND
           COALESCE(candidate.value->>'city', '') = ''
      THEN '|ordinal:' || candidate.ordinality::text
      ELSE ''
    END
  ),
  candidate.ordinality - 1,
  NULLIF(candidate.value->>'spotId', '')::uuid,
  COALESCE(NULLIF(candidate.value->>'status', ''), 'research_pending'),
  candidate.value
FROM public.social_spot_submissions AS submission
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(submission.research->'createdCandidates') = 'array'
      THEN submission.research->'createdCandidates'
    ELSE '[]'::jsonb
  END
) WITH ORDINALITY AS candidate(value, ordinality)
ON CONFLICT (submission_id, candidate_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.award_social_submission_tokens_v1(
  p_submission_id UUID,
  p_contributor_id UUID,
  p_delta INTEGER,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE(awarded INTEGER, total_tokens INTEGER)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_awarded INTEGER := 0;
  v_total_tokens INTEGER;
BEGIN
  IF p_delta <= 0 THEN
    RAISE EXCEPTION 'Token award must be positive';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.social_spot_submissions
    WHERE id = p_submission_id AND contributor_id = p_contributor_id
  ) THEN
    RAISE EXCEPTION 'Submission and contributor do not match';
  END IF;

  INSERT INTO public.contribution_token_ledger (
    contributor_id,
    submission_id,
    delta,
    reason,
    metadata
  )
  VALUES (
    p_contributor_id,
    p_submission_id,
    p_delta,
    'social_spot_submission',
    COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT ON CONSTRAINT contribution_token_ledger_submission_unique DO NOTHING
  RETURNING delta INTO v_awarded;

  IF v_awarded > 0 THEN
    UPDATE public.spot_contributors
    SET
      total_tokens = total_tokens + v_awarded,
      last_submitted_at = NOW()
    WHERE id = p_contributor_id
    RETURNING spot_contributors.total_tokens INTO v_total_tokens;

    UPDATE public.social_spot_submissions
    SET token_awarded = v_awarded
    WHERE id = p_submission_id;
  ELSE
    SELECT sc.total_tokens
    INTO v_total_tokens
    FROM public.spot_contributors sc
    WHERE sc.id = p_contributor_id;
  END IF;

  RETURN QUERY SELECT v_awarded, COALESCE(v_total_tokens, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_social_submission_candidates_v1(
  p_submission_id UUID,
  p_candidates JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  IF jsonb_typeof(COALESCE(p_candidates, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Candidates must be a JSON array';
  END IF;

  INSERT INTO public.social_spot_submission_candidates (
    submission_id,
    candidate_key,
    ordinal,
    spot_id,
    status,
    research,
    updated_at
  )
  SELECT
    p_submission_id,
    md5(
      lower(trim(COALESCE(candidate.value->>'spotName', ''))) || '|' ||
      lower(trim(COALESCE(candidate.value->>'address', ''))) || '|' ||
      lower(trim(COALESCE(candidate.value->>'city', ''))) ||
      CASE
        WHEN COALESCE(candidate.value->>'spotName', '') = '' AND
             COALESCE(candidate.value->>'address', '') = '' AND
             COALESCE(candidate.value->>'city', '') = ''
        THEN '|ordinal:' || candidate.ordinality::text
        ELSE ''
      END
    ),
    candidate.ordinality - 1,
    NULLIF(candidate.value->>'spotId', '')::uuid,
    COALESCE(NULLIF(candidate.value->>'status', ''), 'research_pending'),
    candidate.value,
    NOW()
  FROM jsonb_array_elements(COALESCE(p_candidates, '[]'::jsonb))
    WITH ORDINALITY AS candidate(value, ordinality)
  ON CONFLICT (submission_id, candidate_key) DO UPDATE
  SET
    ordinal = EXCLUDED.ordinal,
    spot_id = EXCLUDED.spot_id,
    status = EXCLUDED.status,
    research = EXCLUDED.research,
    updated_at = NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.award_social_submission_tokens_v1(UUID, UUID, INTEGER, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_social_submission_tokens_v1(UUID, UUID, INTEGER, JSONB)
  TO service_role;

REVOKE ALL ON FUNCTION public.sync_social_submission_candidates_v1(UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_social_submission_candidates_v1(UUID, JSONB)
  TO service_role;

COMMENT ON TABLE public.social_spot_submission_aliases IS
  'Canonical and redirected social URLs that resolve to one idempotent submission.';
COMMENT ON TABLE public.social_spot_submission_candidates IS
  'Relational place candidates extracted from multi-place social posts.';
COMMENT ON FUNCTION public.award_social_submission_tokens_v1(UUID, UUID, INTEGER, JSONB) IS
  'Atomically awards one idempotent token ledger entry and increments contributor balance.';
