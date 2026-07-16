ALTER TABLE public.apify_spot_discovery_runs
  DROP CONSTRAINT IF EXISTS apify_spot_discovery_runs_discovery_date_key,
  ADD COLUMN IF NOT EXISTS run_kind TEXT NOT NULL DEFAULT 'broad'
    CHECK (run_kind IN ('broad', 'social_backfill')),
  ADD COLUMN IF NOT EXISTS daily_slot SMALLINT NOT NULL DEFAULT 1
    CHECK (daily_slot BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS social_week_start DATE,
  ADD COLUMN IF NOT EXISTS max_charge_usd NUMERIC(4, 2) NOT NULL DEFAULT 1
    CHECK (max_charge_usd > 0 AND max_charge_usd <= 1);

ALTER TABLE public.apify_spot_discovery_runs
  ADD CONSTRAINT apify_spot_discovery_runs_date_slot_key
  UNIQUE (discovery_date, daily_slot),
  ADD CONSTRAINT apify_spot_discovery_runs_kind_week_check
  CHECK (
    (run_kind = 'broad' AND social_week_start IS NULL)
    OR (run_kind = 'social_backfill' AND social_week_start IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS apify_spot_discovery_runs_social_budget_idx
  ON public.apify_spot_discovery_runs (social_week_start, discovery_date)
  WHERE run_kind = 'social_backfill';

ALTER TABLE public.weekly_social_spot_leads
  DROP CONSTRAINT IF EXISTS weekly_social_spot_leads_status_check,
  ADD CONSTRAINT weekly_social_spot_leads_status_check
    CHECK (status IN ('pending', 'searching', 'searched', 'no_match', 'ignored')),
  ADD COLUMN IF NOT EXISTS attempt_count SMALLINT NOT NULL DEFAULT 0
    CHECK (attempt_count BETWEEN 0 AND 2),
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT CHECK (char_length(last_error) <= 500),
  ADD COLUMN IF NOT EXISTS matched_candidate_id UUID
    REFERENCES public.apify_spot_candidates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS matched_spot_id UUID
    REFERENCES public.spots(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.claim_social_spot_discovery_run(
  p_discovery_date DATE,
  p_actor_id TEXT,
  p_actor_run_placeholder TEXT,
  p_max_places SMALLINT DEFAULT 15,
  p_max_charge_usd NUMERIC DEFAULT 0.20
)
RETURNS TABLE (
  run_id UUID,
  discovery_date DATE,
  city_slug TEXT,
  social_week_start DATE,
  daily_slot SMALLINT,
  place_hints TEXT[]
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_week_start DATE;
  v_city_slug TEXT;
  v_daily_slot SMALLINT;
  v_run_id UUID;
  v_lead_ids UUID[];
  v_place_hints TEXT[];
BEGIN
  IF p_max_places < 1 OR p_max_places > 15
    OR p_max_charge_usd <= 0 OR p_max_charge_usd > 0.20 THEN
    RAISE EXCEPTION 'Social discovery budget exceeds the hard limit';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('localley-social-spot-discovery', 0));

  IF EXISTS (
    SELECT 1 FROM public.apify_spot_discovery_runs AS broad_run
    WHERE broad_run.discovery_date = p_discovery_date AND broad_run.run_kind = 'broad'
  ) OR (
    SELECT count(*) FROM public.apify_spot_discovery_runs AS daily_run
    WHERE daily_run.discovery_date = p_discovery_date AND daily_run.run_kind = 'social_backfill'
  ) >= 4 THEN
    RETURN;
  END IF;

  SELECT lead.week_start, lead.city_slug
  INTO v_week_start, v_city_slug
  FROM public.weekly_social_spot_leads AS lead
  WHERE lead.status = 'pending'
    AND lead.attempt_count < 2
    AND (lead.next_attempt_at IS NULL OR lead.next_attempt_at <= now())
    AND NOT EXISTS (
      SELECT 1
      FROM public.apify_spot_discovery_runs AS active_run
      WHERE active_run.run_kind = 'social_backfill'
        AND active_run.social_week_start = lead.week_start
        AND active_run.city_slug = lead.city_slug
        AND active_run.state IN ('starting', 'running')
    )
    AND (
      SELECT count(*)
      FROM public.apify_spot_discovery_runs AS weekly_run
      WHERE weekly_run.run_kind = 'social_backfill'
        AND weekly_run.social_week_start = lead.week_start
    ) < 30
  ORDER BY lead.week_start, lead.engagement_score DESC, lead.created_at
  FOR UPDATE OF lead SKIP LOCKED
  LIMIT 1;

  IF v_week_start IS NULL OR v_city_slug IS NULL THEN
    RETURN;
  END IF;

  SELECT slot::SMALLINT
  INTO v_daily_slot
  FROM generate_series(1, 4) AS slot
  WHERE NOT EXISTS (
    SELECT 1 FROM public.apify_spot_discovery_runs
    WHERE apify_spot_discovery_runs.discovery_date = p_discovery_date
      AND apify_spot_discovery_runs.daily_slot = slot
  )
  ORDER BY slot
  LIMIT 1;

  IF v_daily_slot IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.apify_spot_discovery_runs (
    discovery_date,
    city_slug,
    actor_id,
    actor_run_id,
    state,
    max_places,
    run_kind,
    daily_slot,
    social_week_start,
    max_charge_usd
  ) VALUES (
    p_discovery_date,
    v_city_slug,
    p_actor_id,
    p_actor_run_placeholder,
    'starting',
    p_max_places,
    'social_backfill',
    v_daily_slot,
    v_week_start,
    p_max_charge_usd
  )
  RETURNING id INTO v_run_id;

  SELECT array_agg(claimed.id ORDER BY claimed.engagement_score DESC),
         array_agg(claimed.place_hint ORDER BY claimed.engagement_score DESC)
  INTO v_lead_ids, v_place_hints
  FROM (
    SELECT lead.id, lead.place_hint, lead.engagement_score
    FROM public.weekly_social_spot_leads AS lead
    WHERE lead.week_start = v_week_start
      AND lead.city_slug = v_city_slug
      AND lead.status = 'pending'
      AND lead.attempt_count < 2
      AND (lead.next_attempt_at IS NULL OR lead.next_attempt_at <= now())
    ORDER BY lead.engagement_score DESC, lead.created_at
    FOR UPDATE OF lead SKIP LOCKED
    LIMIT 3
  ) AS claimed;

  UPDATE public.weekly_social_spot_leads
  SET status = 'searching',
      discovery_run_id = v_run_id,
      attempt_count = attempt_count + 1,
      next_attempt_at = NULL,
      last_error = NULL,
      updated_at = now()
  WHERE id = ANY(v_lead_ids);

  RETURN QUERY SELECT
    v_run_id,
    p_discovery_date,
    v_city_slug,
    v_week_start,
    v_daily_slot,
    v_place_hints;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_social_spot_discovery_run(
  DATE, TEXT, TEXT, SMALLINT, NUMERIC
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_social_spot_discovery_run(
  DATE, TEXT, TEXT, SMALLINT, NUMERIC
) TO service_role;

COMMENT ON FUNCTION public.claim_social_spot_discovery_run(
  DATE, TEXT, TEXT, SMALLINT, NUMERIC
) IS 'Atomically reserves up to three private social place leads with four-run daily and thirty-run weekly hard limits.';
