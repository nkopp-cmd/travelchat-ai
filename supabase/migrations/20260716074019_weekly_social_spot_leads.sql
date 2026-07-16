ALTER TABLE public.weekly_social_content
  ADD COLUMN IF NOT EXISTS place_hint TEXT CHECK (char_length(place_hint) <= 160);

CREATE TABLE IF NOT EXISTS public.weekly_social_spot_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL,
  city_slug TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'youtube')),
  external_id TEXT NOT NULL,
  place_hint TEXT NOT NULL CHECK (char_length(place_hint) BETWEEN 3 AND 160),
  normalized_hint TEXT NOT NULL CHECK (char_length(normalized_hint) BETWEEN 3 AND 160),
  canonical_url TEXT NOT NULL,
  engagement_score BIGINT NOT NULL DEFAULT 0 CHECK (engagement_score >= 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'searching', 'searched', 'ignored')),
  discovery_run_id UUID REFERENCES public.apify_spot_discovery_runs(id) ON DELETE SET NULL,
  searched_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '56 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (week_start, city_slug, platform, external_id),
  UNIQUE (week_start, city_slug, normalized_hint)
);

CREATE INDEX IF NOT EXISTS weekly_social_spot_leads_queue_idx
  ON public.weekly_social_spot_leads (status, engagement_score DESC, created_at);
CREATE INDEX IF NOT EXISTS weekly_social_spot_leads_run_idx
  ON public.weekly_social_spot_leads (discovery_run_id)
  WHERE discovery_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS weekly_social_spot_leads_expiry_idx
  ON public.weekly_social_spot_leads (expires_at);

ALTER TABLE public.weekly_social_spot_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_social_spot_leads FORCE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_social_trend_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_social_content FORCE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_city_spot_rankings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_social_trend_city_builds FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.weekly_social_spot_leads FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.weekly_social_spot_leads TO service_role;

ALTER TABLE public.apify_spot_candidates
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'map_discovery'
    CHECK (source_type IN ('map_discovery', 'social_trend')),
  ADD COLUMN IF NOT EXISTS social_source_url TEXT,
  ADD COLUMN IF NOT EXISTS social_week_start DATE;

COMMENT ON TABLE public.weekly_social_spot_leads IS
  'Private structured place hints from high-engagement social results. Leads are searched through the bounded Apify Google Places workflow before admin review.';
COMMENT ON COLUMN public.weekly_social_spot_leads.canonical_url IS
  'Private evidence URL for admin provenance only; never expose it in public spot responses.';
