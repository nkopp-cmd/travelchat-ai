ALTER TABLE public.weekly_social_trend_runs
  ADD COLUMN IF NOT EXISTS attempt_count SMALLINT NOT NULL DEFAULT 1
  CHECK (attempt_count BETWEEN 1 AND 3);

CREATE TABLE IF NOT EXISTS public.weekly_social_trend_city_builds (
  week_start DATE NOT NULL,
  city_slug TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'running'
    CHECK (state IN ('running', 'succeeded', 'failed')),
  attempt_count SMALLINT NOT NULL DEFAULT 1 CHECK (attempt_count BETWEEN 1 AND 3),
  error_message TEXT,
  lease_expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '10 minutes'),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (week_start, city_slug)
);

CREATE INDEX IF NOT EXISTS weekly_social_trend_city_builds_state_idx
  ON public.weekly_social_trend_city_builds (week_start, state, lease_expires_at);

ALTER TABLE public.weekly_social_trend_city_builds ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.weekly_social_trend_city_builds FROM anon, authenticated;
GRANT ALL ON public.weekly_social_trend_city_builds TO service_role;

CREATE OR REPLACE FUNCTION public.replace_weekly_city_spot_rankings(
  p_week_start DATE,
  p_city_slug TEXT,
  p_rankings JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  inserted_count INTEGER;
BEGIN
  DELETE FROM public.weekly_city_spot_rankings
  WHERE week_start = p_week_start AND city_slug = p_city_slug;

  INSERT INTO public.weekly_city_spot_rankings (
    week_start,
    city_slug,
    spot_id,
    rank,
    score,
    post_count,
    platform_count,
    signal_summary
  )
  SELECT
    p_week_start,
    p_city_slug,
    ranking.spot_id,
    ranking.rank,
    ranking.score,
    ranking.post_count,
    ranking.platform_count,
    ranking.signal_summary
  FROM jsonb_to_recordset(COALESCE(p_rankings, '[]'::jsonb)) AS ranking(
    spot_id UUID,
    rank SMALLINT,
    score NUMERIC,
    post_count INTEGER,
    platform_count SMALLINT,
    signal_summary JSONB
  );

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_weekly_city_spot_rankings(DATE, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_weekly_city_spot_rankings(DATE, TEXT, JSONB)
  TO service_role;

COMMENT ON TABLE public.weekly_social_trend_city_builds IS
  'Private retry and lease state for bounded, one-city-at-a-time weekly ranking builds.';
