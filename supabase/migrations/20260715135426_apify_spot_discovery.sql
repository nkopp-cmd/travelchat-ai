CREATE TABLE public.apify_spot_discovery_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discovery_date DATE NOT NULL UNIQUE,
  city_slug TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_run_id TEXT NOT NULL UNIQUE,
  dataset_id TEXT,
  state TEXT NOT NULL DEFAULT 'starting'
    CHECK (state IN ('starting', 'running', 'succeeded', 'failed')),
  max_places SMALLINT NOT NULL CHECK (max_places BETWEEN 1 AND 100),
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.apify_spot_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.apify_spot_discovery_runs(id) ON DELETE CASCADE,
  city_slug TEXT NOT NULL,
  place_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  maps_url TEXT NOT NULL,
  category_name TEXT,
  categories TEXT[] NOT NULL DEFAULT '{}',
  total_score NUMERIC(3, 2) CHECK (total_score BETWEEN 0 AND 5),
  reviews_count INTEGER CHECK (reviews_count >= 0),
  price TEXT,
  primary_image_url TEXT NOT NULL,
  discovery_query TEXT,
  recommended_localley_score SMALLINT NOT NULL DEFAULT 3
    CHECK (recommended_localley_score BETWEEN 3 AND 5),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'importing', 'rejected', 'imported')),
  rejection_reason TEXT,
  imported_spot_id UUID REFERENCES public.spots(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX apify_spot_discovery_runs_city_date_idx
  ON public.apify_spot_discovery_runs (city_slug, discovery_date DESC);
CREATE INDEX apify_spot_discovery_runs_state_idx
  ON public.apify_spot_discovery_runs (state, started_at);
CREATE INDEX apify_spot_candidates_review_idx
  ON public.apify_spot_candidates (status, city_slug, recommended_localley_score DESC, created_at DESC);

ALTER TABLE public.apify_spot_discovery_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apify_spot_discovery_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.apify_spot_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apify_spot_candidates FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.apify_spot_discovery_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.apify_spot_candidates FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.apify_spot_discovery_runs TO service_role;
GRANT ALL ON public.apify_spot_candidates TO service_role;

COMMENT ON TABLE public.apify_spot_discovery_runs IS
  'Private, cost-bounded Google Maps discovery orchestration through Apify.';
COMMENT ON TABLE public.apify_spot_candidates IS
  'Private map-derived place candidates. Rows require explicit admin approval before insertion into spots.';
