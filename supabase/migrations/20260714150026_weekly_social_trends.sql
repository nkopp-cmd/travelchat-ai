CREATE TABLE public.weekly_social_trend_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'youtube')),
  actor_id TEXT NOT NULL,
  actor_run_id TEXT NOT NULL UNIQUE,
  dataset_id TEXT,
  state TEXT NOT NULL DEFAULT 'starting'
    CHECK (state IN ('starting', 'running', 'succeeded', 'failed')),
  error_message TEXT,
  attempt_count SMALLINT NOT NULL DEFAULT 1 CHECK (attempt_count BETWEEN 1 AND 3),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (week_start, platform)
);

CREATE TABLE public.weekly_social_trend_city_builds (
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

CREATE TABLE public.weekly_social_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL,
  city_slug TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'youtube')),
  external_id TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  content_text TEXT NOT NULL DEFAULT '' CHECK (char_length(content_text) <= 4000),
  published_at TIMESTAMPTZ,
  view_count BIGINT NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  like_count BIGINT NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  comment_count BIGINT NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
  share_count BIGINT NOT NULL DEFAULT 0 CHECK (share_count >= 0),
  save_count BIGINT NOT NULL DEFAULT 0 CHECK (save_count >= 0),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '56 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (week_start, platform, external_id, city_slug)
);

CREATE TABLE public.weekly_city_spot_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL,
  city_slug TEXT NOT NULL,
  spot_id UUID NOT NULL REFERENCES public.spots(id) ON DELETE CASCADE,
  rank SMALLINT NOT NULL CHECK (rank BETWEEN 1 AND 5),
  score NUMERIC(7, 3) NOT NULL CHECK (score >= 0 AND score <= 100),
  post_count INTEGER NOT NULL DEFAULT 0 CHECK (post_count >= 0),
  platform_count SMALLINT NOT NULL DEFAULT 0 CHECK (platform_count BETWEEN 0 AND 3),
  signal_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (week_start, city_slug, spot_id),
  UNIQUE (week_start, city_slug, rank)
);

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

CREATE INDEX weekly_social_trend_runs_state_idx
  ON public.weekly_social_trend_runs (week_start, state, processed_at);
CREATE INDEX weekly_social_trend_city_builds_state_idx
  ON public.weekly_social_trend_city_builds (week_start, state, lease_expires_at);
CREATE INDEX weekly_social_content_city_week_idx
  ON public.weekly_social_content (city_slug, week_start DESC);
CREATE INDEX weekly_social_content_expiry_idx
  ON public.weekly_social_content (expires_at);
CREATE INDEX weekly_city_spot_rankings_lookup_idx
  ON public.weekly_city_spot_rankings (city_slug, week_start DESC, rank);

ALTER TABLE public.weekly_social_trend_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_social_trend_city_builds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_social_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_city_spot_rankings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.weekly_social_trend_runs FROM anon, authenticated;
REVOKE ALL ON public.weekly_social_trend_city_builds FROM anon, authenticated;
REVOKE ALL ON public.weekly_social_content FROM anon, authenticated;
REVOKE ALL ON public.weekly_city_spot_rankings FROM anon, authenticated;

GRANT ALL ON public.weekly_social_trend_runs TO service_role;
GRANT ALL ON public.weekly_social_trend_city_builds TO service_role;
GRANT ALL ON public.weekly_social_content TO service_role;
GRANT ALL ON public.weekly_city_spot_rankings TO service_role;
REVOKE ALL ON FUNCTION public.replace_weekly_city_spot_rankings(DATE, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_weekly_city_spot_rankings(DATE, TEXT, JSONB)
  TO service_role;

COMMENT ON TABLE public.weekly_social_trend_runs IS
  'Private Apify orchestration state for bounded weekly social trend discovery.';
COMMENT ON TABLE public.weekly_social_trend_city_builds IS
  'Private retry and lease state for bounded, one-city-at-a-time weekly ranking builds.';
COMMENT ON TABLE public.weekly_social_content IS
  'Private minimal social engagement observations; creator identities and raw payloads are intentionally not retained.';
COMMENT ON COLUMN public.weekly_social_content.content_text IS
  'Private matching evidence only. Never expose or render this text in public application responses.';
COMMENT ON TABLE public.weekly_city_spot_rankings IS
  'Private materialized top-five weekly social rankings for verified Localley spots.';
