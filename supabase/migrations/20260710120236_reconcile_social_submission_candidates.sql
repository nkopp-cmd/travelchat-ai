CREATE OR REPLACE FUNCTION public.sync_social_submission_candidates_v1(
  p_submission_id UUID,
  p_candidates JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_upserted_count INTEGER := 0;
  v_deleted_count INTEGER := 0;
BEGIN
  IF jsonb_typeof(COALESCE(p_candidates, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Candidates must be a JSON array' USING ERRCODE = '22023';
  END IF;

  WITH incoming AS (
    SELECT
      candidate.value,
      candidate.ordinality - 1 AS ordinal,
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
      ) AS candidate_key
    FROM jsonb_array_elements(COALESCE(p_candidates, '[]'::jsonb))
      WITH ORDINALITY AS candidate(value, ordinality)
  ), upserted AS (
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
      incoming.candidate_key,
      incoming.ordinal,
      NULLIF(incoming.value->>'spotId', '')::uuid,
      COALESCE(NULLIF(incoming.value->>'status', ''), 'research_pending'),
      incoming.value,
      clock_timestamp()
    FROM incoming
    ON CONFLICT (submission_id, candidate_key) DO UPDATE
    SET
      ordinal = EXCLUDED.ordinal,
      spot_id = EXCLUDED.spot_id,
      status = EXCLUDED.status,
      research = EXCLUDED.research,
      updated_at = EXCLUDED.updated_at
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_upserted_count FROM upserted;

  WITH incoming_keys AS (
    SELECT md5(
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
    ) AS candidate_key
    FROM jsonb_array_elements(COALESCE(p_candidates, '[]'::jsonb))
      WITH ORDINALITY AS candidate(value, ordinality)
  )
  DELETE FROM public.social_spot_submission_candidates AS existing
  WHERE
    existing.submission_id = p_submission_id AND
    existing.spot_id IS NULL AND
    existing.status IN ('needs_review', 'research_pending') AND
    NOT EXISTS (
      SELECT 1
      FROM incoming_keys
      WHERE incoming_keys.candidate_key = existing.candidate_key
    );

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_upserted_count + v_deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_social_submission_candidates_v1(UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_social_submission_candidates_v1(UUID, JSONB)
  TO service_role;

COMMENT ON FUNCTION public.sync_social_submission_candidates_v1(UUID, JSONB) IS
  'Atomically upserts the current candidate set, removes obsolete unresolved rows, and preserves resolved spot provenance.';
