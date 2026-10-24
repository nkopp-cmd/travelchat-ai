-- Supabase public schema + trigger functions/triggers (llehrhqeolfprutcaopi, catalog read 2026-10-24, no rows).
-- For the gate 2 rollback rehearsal on a local Postgres+PostGIS (scripts/d1-migration/rollback-rehearsal.mjs).
CREATE EXTENSION IF NOT EXISTS postgis;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE ROLE authenticator LOGIN PASSWORD 'rehearsal' NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT anon, authenticated, service_role TO authenticator;
CREATE TABLE public.affiliate_clicks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clerk_user_id text,
  partner text NOT NULL,
  tracking_id text NOT NULL,
  event_type text NOT NULL,
  activity_name text,
  affiliate_url text,
  user_agent text,
  ip_hash text,
  conversion_value numeric(10,2),
  commission_earned numeric(10,2),
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.affiliate_earnings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  partner text NOT NULL,
  period_date date NOT NULL,
  clicks integer DEFAULT 0,
  conversions integer DEFAULT 0,
  total_value numeric(10,2) DEFAULT 0,
  commission_earned numeric(10,2) DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.apify_spot_candidates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  city_slug text NOT NULL,
  place_id text NOT NULL,
  name text NOT NULL,
  address text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  maps_url text NOT NULL,
  category_name text,
  categories text[] NOT NULL DEFAULT '{}'::text[],
  total_score numeric(3,2),
  reviews_count integer,
  price text,
  primary_image_url text NOT NULL,
  discovery_query text,
  recommended_localley_score smallint NOT NULL DEFAULT 3,
  status text NOT NULL DEFAULT 'pending'::text,
  rejection_reason text,
  imported_spot_id uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  source_type text NOT NULL DEFAULT 'map_discovery'::text,
  social_source_url text,
  social_week_start date
);
CREATE TABLE public.apify_spot_discovery_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  discovery_date date NOT NULL,
  city_slug text NOT NULL,
  actor_id text NOT NULL,
  actor_run_id text NOT NULL,
  dataset_id text,
  state text NOT NULL DEFAULT 'starting'::text,
  max_places smallint NOT NULL,
  error_message text,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.challenges (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  city text,
  xp_reward integer NOT NULL,
  requirements jsonb,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.content_engagement (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  viewer_clerk_user_id text NOT NULL,
  viewer_tier text NOT NULL,
  content_type text NOT NULL,
  content_id text NOT NULL,
  creator_clerk_user_id text NOT NULL,
  engagement_points integer NOT NULL DEFAULT 1,
  engagement_date date NOT NULL DEFAULT CURRENT_DATE,
  engagement_month date NOT NULL DEFAULT (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))::date,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.contribution_token_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  contributor_id uuid NOT NULL,
  submission_id uuid NOT NULL,
  delta integer NOT NULL,
  reason text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL,
  title text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  linked_itinerary_id uuid
);
CREATE TABLE public.early_adopters (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL,
  email text,
  "position" integer NOT NULL,
  registered_at timestamp with time zone NOT NULL DEFAULT now(),
  notes text
);
CREATE TABLE public.follows (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  follower_id text NOT NULL,
  following_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.geo_aliases (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  destination_id uuid,
  local_area_id uuid,
  spot_id uuid,
  entity_id uuid GENERATED ALWAYS AS (COALESCE(destination_id, local_area_id, spot_id)) STORED,
  alias text NOT NULL,
  normalized_alias text NOT NULL,
  lang text,
  source text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.geo_countries (
  code character(2) NOT NULL,
  name jsonb NOT NULL,
  default_currency character(3) NOT NULL,
  default_languages text[] NOT NULL DEFAULT '{}'::text[],
  source_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.geo_destinations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name jsonb NOT NULL,
  country_code character(2) NOT NULL,
  center geography(Point,4326) NOT NULL,
  timezone text NOT NULL,
  currency character(3) NOT NULL,
  languages text[] NOT NULL DEFAULT '{}'::text[],
  ring smallint NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  targets jsonb NOT NULL DEFAULT '{}'::jsonb,
  characterization jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.geo_local_area_vibe_scores (
  local_area_id uuid NOT NULL,
  vibe_id uuid NOT NULL,
  score smallint NOT NULL,
  confidence numeric(4,3) NOT NULL,
  evidence jsonb NOT NULL,
  source_type text NOT NULL,
  scored_at timestamp with time zone NOT NULL,
  expires_at timestamp with time zone
);
CREATE TABLE public.geo_local_areas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  destination_id uuid NOT NULL,
  parent_id uuid,
  kind text NOT NULL,
  slug text NOT NULL,
  name jsonb NOT NULL,
  characterization jsonb NOT NULL DEFAULT '{}'::jsonb,
  traveler_types text[] NOT NULL DEFAULT '{}'::text[],
  practical_notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  center geography(Point,4326),
  boundary geometry(MultiPolygon,4326),
  source_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(4,3) NOT NULL,
  review_status text NOT NULL,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.geo_vibe_taxonomy (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  label text NOT NULL,
  version integer NOT NULL,
  rubric jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.guide_earnings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  guide_clerk_user_id text NOT NULL,
  earning_month date NOT NULL,
  total_engagement_points integer DEFAULT 0,
  platform_engagement_points integer DEFAULT 0,
  subscription_revenue numeric(10,2) DEFAULT 0,
  revenue_pool numeric(10,2) DEFAULT 0,
  share_percent numeric(8,6) DEFAULT 0,
  gross_amount numeric(10,2) DEFAULT 0,
  stripe_fee numeric(10,2) DEFAULT 0,
  net_amount numeric(10,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'calculated'::text,
  stripe_transfer_id text,
  paid_at timestamp with time zone,
  rollover_amount numeric(10,2) DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.guide_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  applied_at timestamp with time zone DEFAULT now(),
  approved_at timestamp with time zone,
  approved_by text,
  stripe_account_id text,
  stripe_onboarding_complete boolean DEFAULT false,
  stripe_charges_enabled boolean DEFAULT false,
  stripe_payouts_enabled boolean DEFAULT false,
  bio text,
  specialties text[],
  cities text[],
  revenue_share_percent numeric(5,2) DEFAULT 20.00,
  minimum_payout numeric(10,2) DEFAULT 10.00,
  total_earned numeric(10,2) DEFAULT 0,
  total_paid_out numeric(10,2) DEFAULT 0,
  pending_balance numeric(10,2) DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.itineraries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  title text NOT NULL,
  city text NOT NULL,
  days integer NOT NULL,
  activities jsonb NOT NULL,
  local_score double precision,
  shared boolean DEFAULT false,
  share_code text,
  created_at timestamp with time zone DEFAULT now(),
  clerk_user_id text,
  highlights text[],
  estimated_cost text,
  subtitle text,
  status text DEFAULT 'draft'::text,
  is_favorite boolean DEFAULT false,
  is_public boolean DEFAULT false,
  like_count integer DEFAULT 0,
  view_count integer DEFAULT 0,
  ai_backgrounds jsonb,
  story_slides jsonb
);
CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.review_helpful_votes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL,
  clerk_user_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.saved_itineraries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL,
  itinerary_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.saved_spots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL,
  spot_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.social_spot_submission_aliases (
  alias_url text NOT NULL,
  submission_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.social_spot_submission_candidates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL,
  candidate_key text NOT NULL,
  ordinal integer NOT NULL,
  spot_id uuid,
  status text NOT NULL,
  research jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.social_spot_submission_media (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL,
  ordinal smallint NOT NULL,
  media_key text NOT NULL,
  media_type text NOT NULL,
  source_url text NOT NULL,
  fingerprint text NOT NULL,
  revision bigint NOT NULL,
  is_current boolean NOT NULL DEFAULT true,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.social_spot_submission_media_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL,
  media_id uuid NOT NULL,
  ordinal smallint NOT NULL,
  media_key text NOT NULL,
  media_type text NOT NULL,
  source_url text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision bigint NOT NULL,
  fingerprint text NOT NULL,
  state text NOT NULL DEFAULT 'queued'::text,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  available_at timestamp with time zone NOT NULL DEFAULT now(),
  claim_token uuid,
  claimed_by text,
  claimed_at timestamp with time zone,
  lease_expires_at timestamp with time zone,
  succeeded_at timestamp with time zone,
  dead_lettered_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  last_error text,
  result jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.social_spot_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  contributor_id uuid NOT NULL,
  clerk_user_id text,
  spot_id uuid,
  source_url text NOT NULL,
  canonical_url text NOT NULL,
  platform text NOT NULL,
  status text NOT NULL,
  contributor_credit text NOT NULL,
  token_awarded integer NOT NULL DEFAULT 0,
  notes text,
  city_hint text,
  extracted_name text,
  extracted_address text,
  extracted_city text,
  localley_score integer,
  local_percentage integer,
  research_confidence numeric(3,2),
  research_summary text,
  research jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  processing_state text NOT NULL DEFAULT 'completed'::text,
  processing_attempt integer NOT NULL DEFAULT 0,
  processing_started_at timestamp with time zone,
  completed_at timestamp with time zone,
  last_error text,
  media_processing_state text NOT NULL DEFAULT 'not_started'::text,
  media_processing_revision bigint NOT NULL DEFAULT 0,
  media_manifest_fingerprint text,
  media_item_count integer NOT NULL DEFAULT 0,
  media_succeeded_count integer NOT NULL DEFAULT 0,
  media_dead_letter_count integer NOT NULL DEFAULT 0,
  media_processing_queued_at timestamp with time zone,
  media_processing_started_at timestamp with time zone,
  media_processing_completed_at timestamp with time zone,
  media_finalization_token uuid,
  media_finalization_lease_expires_at timestamp with time zone,
  media_extraction_attempt_count integer NOT NULL DEFAULT 0,
  media_extraction_available_at timestamp with time zone,
  media_extraction_token uuid,
  media_extraction_lease_expires_at timestamp with time zone,
  media_processing_updated_at timestamp with time zone NOT NULL DEFAULT now(),
  media_finalization_attempt_count integer NOT NULL DEFAULT 0,
  media_finalization_available_at timestamp with time zone
);
CREATE TABLE public.spot_contributors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL,
  display_name text,
  public_credit_name text NOT NULL,
  total_tokens integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  last_submitted_at timestamp with time zone
);
CREATE TABLE public.spot_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  spot_id uuid NOT NULL,
  clerk_user_id text NOT NULL,
  rating integer NOT NULL,
  comment text,
  visit_date date,
  helpful_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.spots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name jsonb NOT NULL,
  description jsonb NOT NULL,
  location geography(Point,4326) NOT NULL,
  address jsonb NOT NULL,
  category text NOT NULL,
  subcategories text[],
  localley_score integer,
  local_percentage integer DEFAULT 50,
  best_times jsonb,
  photos text[],
  tips jsonb,
  discovered_by uuid,
  verified boolean DEFAULT false,
  trending_score double precision DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  review_count integer DEFAULT 0,
  average_rating numeric(2,1) DEFAULT 0,
  name_en_normalized text GENERATED ALWAYS AS (lower(TRIM(BOTH FROM (name ->> 'en'::text)))) STORED,
  address_en_normalized text GENERATED ALWAYS AS (lower(TRIM(BOTH FROM (address ->> 'en'::text)))) STORED,
  google_place_id text,
  destination_id uuid,
  local_area_id uuid
);
CREATE TABLE public.story_image_jobs (
  clerk_user_id text NOT NULL,
  idempotency_key text NOT NULL,
  payload_hash text NOT NULL,
  provider text NOT NULL,
  credits integer NOT NULL,
  period_start date NOT NULL,
  owner_token uuid NOT NULL DEFAULT gen_random_uuid(),
  state text NOT NULL DEFAULT 'reserved'::text,
  output_prefix text NOT NULL,
  output_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deadline timestamp with time zone NOT NULL DEFAULT (now() + '00:05:00'::interval),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL,
  tier text NOT NULL DEFAULT 'free'::text,
  status text NOT NULL DEFAULT 'active'::text,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  billing_cycle text,
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  cancel_at_period_end boolean DEFAULT false,
  trial_start timestamp with time zone,
  trial_end timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.transfer_edges (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  from_destination_id uuid NOT NULL,
  to_destination_id uuid NOT NULL,
  mode text NOT NULL,
  duration_min_minutes integer NOT NULL,
  duration_max_minutes integer NOT NULL,
  departure_buffer_minutes integer NOT NULL,
  arrival_buffer_minutes integer NOT NULL,
  hotel_change_minutes integer NOT NULL DEFAULT 45,
  cost_band text NOT NULL,
  booking_hint jsonb NOT NULL DEFAULT '{}'::jsonb,
  schedule_notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_type text NOT NULL,
  source_meta jsonb NOT NULL,
  confidence numeric(4,3) NOT NULL,
  review_status text NOT NULL,
  reviewed_at timestamp with time zone,
  valid_from date,
  valid_until date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.trip_activities (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL,
  day_id uuid NOT NULL,
  "position" smallint NOT NULL,
  spot_id uuid,
  local_area_id uuid,
  kind text NOT NULL,
  start_window tstzrange,
  duration_minutes integer,
  route_from_previous jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(4,3),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.trip_days (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL,
  stop_id uuid NOT NULL,
  day_index smallint NOT NULL,
  local_date date,
  day_type text NOT NULL,
  active_minutes_budget integer NOT NULL,
  theme text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.trip_stops (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL,
  destination_id uuid NOT NULL,
  "position" smallint NOT NULL,
  nights smallint NOT NULL,
  is_locked boolean NOT NULL DEFAULT false,
  arrival_local timestamp with time zone,
  departure_local timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.trip_transfer_legs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL,
  from_stop_id uuid NOT NULL,
  to_stop_id uuid NOT NULL,
  transfer_edge_id uuid NOT NULL,
  "position" smallint NOT NULL,
  normalized_snapshot jsonb NOT NULL,
  confidence numeric(4,3) NOT NULL,
  fetched_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.trips (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL,
  title text NOT NULL,
  start_date date,
  total_days smallint NOT NULL,
  party jsonb NOT NULL,
  preferences jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft'::text,
  legacy_itinerary_id uuid,
  planner_version text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.usage_tracking (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL,
  usage_type text NOT NULL,
  count integer DEFAULT 0,
  period_start date NOT NULL,
  period_type text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.user_challenges (
  user_id uuid NOT NULL,
  challenge_id uuid NOT NULL,
  progress jsonb DEFAULT '{}'::jsonb,
  completed boolean DEFAULT false,
  completed_at timestamp with time zone
);
CREATE TABLE public.user_progress (
  user_id uuid NOT NULL,
  discoveries integer DEFAULT 0,
  spots_visited integer DEFAULT 0,
  tourist_traps_avoided integer DEFAULT 0,
  current_streak integer DEFAULT 0,
  achievements jsonb DEFAULT '[]'::jsonb,
  unlocked_cities text[] DEFAULT '{}'::text[],
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clerk_id text NOT NULL,
  username text,
  email text,
  level integer DEFAULT 1,
  xp integer DEFAULT 0,
  title text DEFAULT 'Tourist'::text,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.weekly_city_spot_rankings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  city_slug text NOT NULL,
  spot_id uuid NOT NULL,
  rank smallint NOT NULL,
  score numeric(7,3) NOT NULL,
  post_count integer NOT NULL DEFAULT 0,
  platform_count smallint NOT NULL DEFAULT 0,
  signal_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.weekly_social_content (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  city_slug text NOT NULL,
  platform text NOT NULL,
  external_id text NOT NULL,
  canonical_url text NOT NULL,
  content_text text NOT NULL DEFAULT ''::text,
  published_at timestamp with time zone,
  view_count bigint NOT NULL DEFAULT 0,
  like_count bigint NOT NULL DEFAULT 0,
  comment_count bigint NOT NULL DEFAULT 0,
  share_count bigint NOT NULL DEFAULT 0,
  save_count bigint NOT NULL DEFAULT 0,
  observed_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + '56 days'::interval),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  place_hint text
);
CREATE TABLE public.weekly_social_spot_leads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  city_slug text NOT NULL,
  platform text NOT NULL,
  external_id text NOT NULL,
  place_hint text NOT NULL,
  normalized_hint text NOT NULL,
  canonical_url text NOT NULL,
  engagement_score bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'::text,
  discovery_run_id uuid,
  searched_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + '56 days'::interval),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.weekly_social_trend_city_builds (
  week_start date NOT NULL,
  city_slug text NOT NULL,
  state text NOT NULL DEFAULT 'running'::text,
  attempt_count smallint NOT NULL DEFAULT 1,
  error_message text,
  lease_expires_at timestamp with time zone NOT NULL DEFAULT (now() + '00:10:00'::interval),
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.weekly_social_trend_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  platform text NOT NULL,
  actor_id text NOT NULL,
  actor_run_id text NOT NULL,
  dataset_id text,
  state text NOT NULL DEFAULT 'starting'::text,
  error_message text,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  processed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  attempt_count smallint NOT NULL DEFAULT 1
);
ALTER TABLE public.affiliate_clicks ADD CONSTRAINT affiliate_clicks_pkey PRIMARY KEY (id);
ALTER TABLE public.affiliate_earnings ADD CONSTRAINT affiliate_earnings_pkey PRIMARY KEY (id);
ALTER TABLE public.apify_spot_candidates ADD CONSTRAINT apify_spot_candidates_pkey PRIMARY KEY (id);
ALTER TABLE public.apify_spot_discovery_runs ADD CONSTRAINT apify_spot_discovery_runs_pkey PRIMARY KEY (id);
ALTER TABLE public.challenges ADD CONSTRAINT challenges_pkey PRIMARY KEY (id);
ALTER TABLE public.content_engagement ADD CONSTRAINT content_engagement_pkey PRIMARY KEY (id);
ALTER TABLE public.contribution_token_ledger ADD CONSTRAINT contribution_token_ledger_pkey PRIMARY KEY (id);
ALTER TABLE public.conversations ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);
ALTER TABLE public.early_adopters ADD CONSTRAINT early_adopters_pkey PRIMARY KEY (id);
ALTER TABLE public.follows ADD CONSTRAINT follows_pkey PRIMARY KEY (id);
ALTER TABLE public.geo_aliases ADD CONSTRAINT geo_aliases_pkey PRIMARY KEY (id);
ALTER TABLE public.geo_countries ADD CONSTRAINT geo_countries_pkey PRIMARY KEY (code);
ALTER TABLE public.geo_destinations ADD CONSTRAINT geo_destinations_pkey PRIMARY KEY (id);
ALTER TABLE public.geo_local_area_vibe_scores ADD CONSTRAINT geo_local_area_vibe_scores_pkey PRIMARY KEY (local_area_id, vibe_id);
ALTER TABLE public.geo_local_areas ADD CONSTRAINT geo_local_areas_pkey PRIMARY KEY (id);
ALTER TABLE public.geo_vibe_taxonomy ADD CONSTRAINT geo_vibe_taxonomy_pkey PRIMARY KEY (id);
ALTER TABLE public.guide_earnings ADD CONSTRAINT guide_earnings_pkey PRIMARY KEY (id);
ALTER TABLE public.guide_profiles ADD CONSTRAINT guide_profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.itineraries ADD CONSTRAINT itineraries_pkey PRIMARY KEY (id);
ALTER TABLE public.messages ADD CONSTRAINT messages_pkey PRIMARY KEY (id);
ALTER TABLE public.review_helpful_votes ADD CONSTRAINT review_helpful_votes_pkey PRIMARY KEY (id);
ALTER TABLE public.saved_itineraries ADD CONSTRAINT saved_itineraries_pkey PRIMARY KEY (id);
ALTER TABLE public.saved_spots ADD CONSTRAINT saved_spots_pkey PRIMARY KEY (id);
ALTER TABLE public.social_spot_submission_aliases ADD CONSTRAINT social_spot_submission_aliases_pkey PRIMARY KEY (alias_url);
ALTER TABLE public.social_spot_submission_candidates ADD CONSTRAINT social_spot_submission_candidates_pkey PRIMARY KEY (id);
ALTER TABLE public.social_spot_submission_media ADD CONSTRAINT social_spot_submission_media_pkey PRIMARY KEY (id);
ALTER TABLE public.social_spot_submission_media_jobs ADD CONSTRAINT social_spot_submission_media_jobs_pkey PRIMARY KEY (id);
ALTER TABLE public.social_spot_submissions ADD CONSTRAINT social_spot_submissions_pkey PRIMARY KEY (id);
ALTER TABLE public.spot_contributors ADD CONSTRAINT spot_contributors_pkey PRIMARY KEY (id);
ALTER TABLE public.spot_reviews ADD CONSTRAINT spot_reviews_pkey PRIMARY KEY (id);
ALTER TABLE public.spots ADD CONSTRAINT spots_pkey PRIMARY KEY (id);
ALTER TABLE public.story_image_jobs ADD CONSTRAINT story_image_jobs_pkey PRIMARY KEY (clerk_user_id, idempotency_key);
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.transfer_edges ADD CONSTRAINT transfer_edges_pkey PRIMARY KEY (id);
ALTER TABLE public.trip_activities ADD CONSTRAINT trip_activities_pkey PRIMARY KEY (id);
ALTER TABLE public.trip_days ADD CONSTRAINT trip_days_pkey PRIMARY KEY (id);
ALTER TABLE public.trip_stops ADD CONSTRAINT trip_stops_pkey PRIMARY KEY (id);
ALTER TABLE public.trip_transfer_legs ADD CONSTRAINT trip_transfer_legs_pkey PRIMARY KEY (id);
ALTER TABLE public.trips ADD CONSTRAINT trips_pkey PRIMARY KEY (id);
ALTER TABLE public.usage_tracking ADD CONSTRAINT usage_tracking_pkey PRIMARY KEY (id);
ALTER TABLE public.user_challenges ADD CONSTRAINT user_challenges_pkey PRIMARY KEY (user_id, challenge_id);
ALTER TABLE public.user_progress ADD CONSTRAINT user_progress_pkey PRIMARY KEY (user_id);
ALTER TABLE public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE public.weekly_city_spot_rankings ADD CONSTRAINT weekly_city_spot_rankings_pkey PRIMARY KEY (id);
ALTER TABLE public.weekly_social_content ADD CONSTRAINT weekly_social_content_pkey PRIMARY KEY (id);
ALTER TABLE public.weekly_social_spot_leads ADD CONSTRAINT weekly_social_spot_leads_pkey PRIMARY KEY (id);
ALTER TABLE public.weekly_social_trend_city_builds ADD CONSTRAINT weekly_social_trend_city_builds_pkey PRIMARY KEY (week_start, city_slug);
ALTER TABLE public.weekly_social_trend_runs ADD CONSTRAINT weekly_social_trend_runs_pkey PRIMARY KEY (id);
ALTER TABLE public.affiliate_earnings ADD CONSTRAINT affiliate_earnings_partner_period_date_key UNIQUE (partner, period_date);
ALTER TABLE public.apify_spot_candidates ADD CONSTRAINT apify_spot_candidates_place_id_key UNIQUE (place_id);
ALTER TABLE public.apify_spot_discovery_runs ADD CONSTRAINT apify_spot_discovery_runs_actor_run_id_key UNIQUE (actor_run_id);
ALTER TABLE public.apify_spot_discovery_runs ADD CONSTRAINT apify_spot_discovery_runs_discovery_date_key UNIQUE (discovery_date);
ALTER TABLE public.content_engagement ADD CONSTRAINT content_engagement_viewer_clerk_user_id_content_type_conten_key UNIQUE (viewer_clerk_user_id, content_type, content_id, engagement_date);
ALTER TABLE public.contribution_token_ledger ADD CONSTRAINT contribution_token_ledger_submission_unique UNIQUE (submission_id, reason);
ALTER TABLE public.early_adopters ADD CONSTRAINT early_adopters_clerk_user_id_key UNIQUE (clerk_user_id);
ALTER TABLE public.follows ADD CONSTRAINT follows_follower_id_following_id_key UNIQUE (follower_id, following_id);
ALTER TABLE public.geo_aliases ADD CONSTRAINT geo_aliases_entity_type_entity_id_normalized_alias_key UNIQUE (entity_type, entity_id, normalized_alias);
ALTER TABLE public.geo_destinations ADD CONSTRAINT geo_destinations_slug_key UNIQUE (slug);
ALTER TABLE public.geo_local_areas ADD CONSTRAINT geo_local_areas_destination_id_slug_key UNIQUE (destination_id, slug);
ALTER TABLE public.geo_local_areas ADD CONSTRAINT geo_local_areas_id_destination_id_key UNIQUE (id, destination_id);
ALTER TABLE public.geo_vibe_taxonomy ADD CONSTRAINT geo_vibe_taxonomy_slug_version_key UNIQUE (slug, version);
ALTER TABLE public.guide_earnings ADD CONSTRAINT guide_earnings_guide_clerk_user_id_earning_month_key UNIQUE (guide_clerk_user_id, earning_month);
ALTER TABLE public.guide_profiles ADD CONSTRAINT guide_profiles_clerk_user_id_key UNIQUE (clerk_user_id);
ALTER TABLE public.guide_profiles ADD CONSTRAINT guide_profiles_stripe_account_id_key UNIQUE (stripe_account_id);
ALTER TABLE public.itineraries ADD CONSTRAINT itineraries_share_code_key UNIQUE (share_code);
ALTER TABLE public.review_helpful_votes ADD CONSTRAINT review_helpful_votes_review_id_clerk_user_id_key UNIQUE (review_id, clerk_user_id);
ALTER TABLE public.saved_itineraries ADD CONSTRAINT saved_itineraries_clerk_user_id_itinerary_id_key UNIQUE (clerk_user_id, itinerary_id);
ALTER TABLE public.saved_spots ADD CONSTRAINT saved_spots_clerk_user_id_spot_id_key UNIQUE (clerk_user_id, spot_id);
ALTER TABLE public.social_spot_submission_candidates ADD CONSTRAINT social_spot_submission_candidates_key_unique UNIQUE (submission_id, candidate_key);
ALTER TABLE public.social_spot_submission_media ADD CONSTRAINT social_spot_submission_media_identity_unique UNIQUE (submission_id, media_key);
ALTER TABLE public.social_spot_submission_media ADD CONSTRAINT social_spot_submission_media_submission_id_id_unique UNIQUE (submission_id, id);
ALTER TABLE public.social_spot_submission_media_jobs ADD CONSTRAINT social_spot_submission_media_jobs_media_revision_unique UNIQUE (media_id, revision);
ALTER TABLE public.social_spot_submission_media_jobs ADD CONSTRAINT social_spot_submission_media_jobs_ordinal_revision_unique UNIQUE (submission_id, revision, ordinal);
ALTER TABLE public.social_spot_submissions ADD CONSTRAINT social_spot_submissions_canonical_unique UNIQUE (canonical_url);
ALTER TABLE public.spot_contributors ADD CONSTRAINT spot_contributors_email_unique UNIQUE (email);
ALTER TABLE public.spot_reviews ADD CONSTRAINT spot_reviews_spot_id_clerk_user_id_key UNIQUE (spot_id, clerk_user_id);
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_clerk_user_id_key UNIQUE (clerk_user_id);
ALTER TABLE public.transfer_edges ADD CONSTRAINT transfer_edges_from_destination_id_to_destination_id_mode_s_key UNIQUE (from_destination_id, to_destination_id, mode, source_type);
ALTER TABLE public.transfer_edges ADD CONSTRAINT transfer_edges_slug_key UNIQUE (slug);
ALTER TABLE public.trip_activities ADD CONSTRAINT trip_activities_day_id_position_key UNIQUE (day_id, "position");
ALTER TABLE public.trip_days ADD CONSTRAINT trip_days_id_trip_id_key UNIQUE (id, trip_id);
ALTER TABLE public.trip_days ADD CONSTRAINT trip_days_trip_id_day_index_key UNIQUE (trip_id, day_index);
ALTER TABLE public.trip_stops ADD CONSTRAINT trip_stops_id_trip_id_key UNIQUE (id, trip_id);
ALTER TABLE public.trip_stops ADD CONSTRAINT trip_stops_trip_id_destination_id_key UNIQUE (trip_id, destination_id);
ALTER TABLE public.trip_stops ADD CONSTRAINT trip_stops_trip_id_position_key UNIQUE (trip_id, "position");
ALTER TABLE public.trip_transfer_legs ADD CONSTRAINT trip_transfer_legs_trip_id_position_key UNIQUE (trip_id, "position");
ALTER TABLE public.usage_tracking ADD CONSTRAINT usage_tracking_clerk_user_id_usage_type_period_start_period_key UNIQUE (clerk_user_id, usage_type, period_start, period_type);
ALTER TABLE public.users ADD CONSTRAINT users_clerk_id_key UNIQUE (clerk_id);
ALTER TABLE public.users ADD CONSTRAINT users_username_key UNIQUE (username);
ALTER TABLE public.weekly_city_spot_rankings ADD CONSTRAINT weekly_city_spot_rankings_week_start_city_slug_rank_key UNIQUE (week_start, city_slug, rank);
ALTER TABLE public.weekly_city_spot_rankings ADD CONSTRAINT weekly_city_spot_rankings_week_start_city_slug_spot_id_key UNIQUE (week_start, city_slug, spot_id);
ALTER TABLE public.weekly_social_content ADD CONSTRAINT weekly_social_content_week_start_platform_external_id_city__key UNIQUE (week_start, platform, external_id, city_slug);
ALTER TABLE public.weekly_social_spot_leads ADD CONSTRAINT weekly_social_spot_leads_week_start_city_slug_normalized_hi_key UNIQUE (week_start, city_slug, normalized_hint);
ALTER TABLE public.weekly_social_spot_leads ADD CONSTRAINT weekly_social_spot_leads_week_start_city_slug_platform_exte_key UNIQUE (week_start, city_slug, platform, external_id);
ALTER TABLE public.weekly_social_trend_runs ADD CONSTRAINT weekly_social_trend_runs_actor_run_id_key UNIQUE (actor_run_id);
ALTER TABLE public.weekly_social_trend_runs ADD CONSTRAINT weekly_social_trend_runs_week_start_platform_key UNIQUE (week_start, platform);
ALTER TABLE public.affiliate_clicks ADD CONSTRAINT affiliate_clicks_event_type_check CHECK ((event_type = ANY (ARRAY['view'::text, 'click'::text, 'conversion'::text])));
ALTER TABLE public.affiliate_clicks ADD CONSTRAINT affiliate_clicks_partner_check CHECK ((partner = ANY (ARRAY['viator'::text, 'booking'::text, 'getyourguide'::text, 'klook'::text])));
ALTER TABLE public.apify_spot_candidates ADD CONSTRAINT apify_spot_candidates_latitude_check CHECK (((latitude >= ('-90'::integer)::double precision) AND (latitude <= (90)::double precision)));
ALTER TABLE public.apify_spot_candidates ADD CONSTRAINT apify_spot_candidates_longitude_check CHECK (((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision)));
ALTER TABLE public.apify_spot_candidates ADD CONSTRAINT apify_spot_candidates_recommended_localley_score_check CHECK (((recommended_localley_score >= 3) AND (recommended_localley_score <= 5)));
ALTER TABLE public.apify_spot_candidates ADD CONSTRAINT apify_spot_candidates_reviews_count_check CHECK ((reviews_count >= 0));
ALTER TABLE public.apify_spot_candidates ADD CONSTRAINT apify_spot_candidates_source_type_check CHECK ((source_type = ANY (ARRAY['map_discovery'::text, 'social_trend'::text])));
ALTER TABLE public.apify_spot_candidates ADD CONSTRAINT apify_spot_candidates_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'importing'::text, 'rejected'::text, 'imported'::text])));
ALTER TABLE public.apify_spot_candidates ADD CONSTRAINT apify_spot_candidates_total_score_check CHECK (((total_score >= (0)::numeric) AND (total_score <= (5)::numeric)));
ALTER TABLE public.apify_spot_discovery_runs ADD CONSTRAINT apify_spot_discovery_runs_max_places_check CHECK (((max_places >= 1) AND (max_places <= 100)));
ALTER TABLE public.apify_spot_discovery_runs ADD CONSTRAINT apify_spot_discovery_runs_state_check CHECK ((state = ANY (ARRAY['starting'::text, 'running'::text, 'succeeded'::text, 'failed'::text])));
ALTER TABLE public.content_engagement ADD CONSTRAINT content_engagement_content_type_check CHECK ((content_type = ANY (ARRAY['itinerary_view'::text, 'itinerary_save'::text, 'spot_view'::text, 'spot_save'::text])));
ALTER TABLE public.content_engagement ADD CONSTRAINT content_engagement_viewer_tier_check CHECK ((viewer_tier = ANY (ARRAY['pro'::text, 'premium'::text])));
ALTER TABLE public.contribution_token_ledger ADD CONSTRAINT contribution_token_ledger_delta_check CHECK ((delta <> 0));
ALTER TABLE public.contribution_token_ledger ADD CONSTRAINT contribution_token_ledger_reason_check CHECK ((reason = ANY (ARRAY['social_spot_submission'::text, 'admin_adjustment'::text, 'token_redemption'::text])));
ALTER TABLE public.early_adopters ADD CONSTRAINT early_adopters_position_check CHECK ((("position" > 0) AND ("position" <= 100)));
ALTER TABLE public.follows ADD CONSTRAINT follows_check CHECK ((follower_id <> following_id));
ALTER TABLE public.geo_aliases ADD CONSTRAINT geo_aliases_alias_check CHECK (((char_length(TRIM(BOTH FROM alias)) >= 1) AND (char_length(TRIM(BOTH FROM alias)) <= 160)));
ALTER TABLE public.geo_aliases ADD CONSTRAINT geo_aliases_entity_type_check CHECK ((entity_type = ANY (ARRAY['destination'::text, 'local_area'::text, 'spot'::text])));
ALTER TABLE public.geo_aliases ADD CONSTRAINT geo_aliases_entity_type_matches_fk CHECK ((((entity_type = 'destination'::text) AND (destination_id IS NOT NULL)) OR ((entity_type = 'local_area'::text) AND (local_area_id IS NOT NULL)) OR ((entity_type = 'spot'::text) AND (spot_id IS NOT NULL))));
ALTER TABLE public.geo_aliases ADD CONSTRAINT geo_aliases_exactly_one_entity CHECK ((num_nonnulls(destination_id, local_area_id, spot_id) = 1));
ALTER TABLE public.geo_aliases ADD CONSTRAINT geo_aliases_normalized_alias_check CHECK (((char_length(TRIM(BOTH FROM normalized_alias)) >= 1) AND (char_length(TRIM(BOTH FROM normalized_alias)) <= 160)));
ALTER TABLE public.geo_countries ADD CONSTRAINT geo_countries_code_check CHECK ((code ~ '^[A-Z]{2}$'::text));
ALTER TABLE public.geo_countries ADD CONSTRAINT geo_countries_default_currency_check CHECK ((default_currency ~ '^[A-Z]{3}$'::text));
ALTER TABLE public.geo_countries ADD CONSTRAINT geo_countries_name_check CHECK (((jsonb_typeof(name) = 'object'::text) AND (name ? 'en'::text)));
ALTER TABLE public.geo_countries ADD CONSTRAINT geo_countries_source_meta_check CHECK ((jsonb_typeof(source_meta) = 'object'::text));
ALTER TABLE public.geo_destinations ADD CONSTRAINT geo_destinations_characterization_check CHECK ((jsonb_typeof(characterization) = 'object'::text));
ALTER TABLE public.geo_destinations ADD CONSTRAINT geo_destinations_currency_check CHECK ((currency ~ '^[A-Z]{3}$'::text));
ALTER TABLE public.geo_destinations ADD CONSTRAINT geo_destinations_name_check CHECK (((jsonb_typeof(name) = 'object'::text) AND (name ? 'en'::text)));
ALTER TABLE public.geo_destinations ADD CONSTRAINT geo_destinations_ring_check CHECK (((ring >= 1) AND (ring <= 3)));
ALTER TABLE public.geo_destinations ADD CONSTRAINT geo_destinations_slug_check CHECK ((slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text));
ALTER TABLE public.geo_destinations ADD CONSTRAINT geo_destinations_source_meta_check CHECK ((jsonb_typeof(source_meta) = 'object'::text));
ALTER TABLE public.geo_destinations ADD CONSTRAINT geo_destinations_targets_check CHECK ((jsonb_typeof(targets) = 'object'::text));
ALTER TABLE public.geo_local_area_vibe_scores ADD CONSTRAINT geo_local_area_vibe_scores_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)));
ALTER TABLE public.geo_local_area_vibe_scores ADD CONSTRAINT geo_local_area_vibe_scores_evidence_check CHECK ((jsonb_typeof(evidence) = ANY (ARRAY['object'::text, 'array'::text])));
ALTER TABLE public.geo_local_area_vibe_scores ADD CONSTRAINT geo_local_area_vibe_scores_score_check CHECK (((score >= 0) AND (score <= 100)));
ALTER TABLE public.geo_local_area_vibe_scores ADD CONSTRAINT geo_local_area_vibe_scores_source_type_check CHECK ((source_type = ANY (ARRAY['curated'::text, 'spot_aggregate'::text, 'social_aggregate'::text, 'survey'::text])));
ALTER TABLE public.geo_local_areas ADD CONSTRAINT geo_local_areas_characterization_check CHECK ((jsonb_typeof(characterization) = 'object'::text));
ALTER TABLE public.geo_local_areas ADD CONSTRAINT geo_local_areas_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)));
ALTER TABLE public.geo_local_areas ADD CONSTRAINT geo_local_areas_kind_check CHECK ((kind = ANY (ARRAY['district'::text, 'neighborhood'::text, 'town'::text, 'island'::text, 'day_trip_area'::text, 'spot_cluster'::text])));
ALTER TABLE public.geo_local_areas ADD CONSTRAINT geo_local_areas_name_check CHECK (((jsonb_typeof(name) = 'object'::text) AND (name ? 'en'::text)));
ALTER TABLE public.geo_local_areas ADD CONSTRAINT geo_local_areas_practical_notes_check CHECK ((jsonb_typeof(practical_notes) = 'object'::text));
ALTER TABLE public.geo_local_areas ADD CONSTRAINT geo_local_areas_review_status_check CHECK ((review_status = ANY (ARRAY['draft'::text, 'machine_checked'::text, 'human_verified'::text, 'needs_review'::text])));
ALTER TABLE public.geo_local_areas ADD CONSTRAINT geo_local_areas_slug_check CHECK ((slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text));
ALTER TABLE public.geo_local_areas ADD CONSTRAINT geo_local_areas_source_meta_check CHECK ((jsonb_typeof(source_meta) = 'object'::text));
ALTER TABLE public.geo_vibe_taxonomy ADD CONSTRAINT geo_vibe_taxonomy_rubric_check CHECK ((jsonb_typeof(rubric) = 'object'::text));
ALTER TABLE public.geo_vibe_taxonomy ADD CONSTRAINT geo_vibe_taxonomy_version_check CHECK ((version > 0));
ALTER TABLE public.guide_earnings ADD CONSTRAINT guide_earnings_status_check CHECK ((status = ANY (ARRAY['calculated'::text, 'approved'::text, 'processing'::text, 'paid'::text, 'failed'::text, 'below_minimum'::text])));
ALTER TABLE public.guide_profiles ADD CONSTRAINT guide_profiles_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'suspended'::text])));
ALTER TABLE public.itineraries ADD CONSTRAINT itineraries_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'completed'::text])));
ALTER TABLE public.messages ADD CONSTRAINT messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])));
ALTER TABLE public.social_spot_submission_candidates ADD CONSTRAINT social_spot_submission_candidates_ordinal_check CHECK ((ordinal >= 0));
ALTER TABLE public.social_spot_submission_candidates ADD CONSTRAINT social_spot_submission_candidates_status_check CHECK ((status = ANY (ARRAY['spot_created'::text, 'spot_reused'::text, 'needs_review'::text, 'research_pending'::text])));
ALTER TABLE public.social_spot_submission_media ADD CONSTRAINT social_spot_submission_media_fingerprint_check CHECK (((fingerprint = btrim(fingerprint)) AND ((char_length(fingerprint) >= 1) AND (char_length(fingerprint) <= 512))));
ALTER TABLE public.social_spot_submission_media ADD CONSTRAINT social_spot_submission_media_media_key_check CHECK (((media_key = btrim(media_key)) AND ((char_length(media_key) >= 1) AND (char_length(media_key) <= 512))));
ALTER TABLE public.social_spot_submission_media ADD CONSTRAINT social_spot_submission_media_media_type_check CHECK ((media_type = ANY (ARRAY['image'::text, 'video'::text, 'unknown'::text])));
ALTER TABLE public.social_spot_submission_media ADD CONSTRAINT social_spot_submission_media_ordinal_check CHECK (((ordinal >= 0) AND (ordinal <= 34)));
ALTER TABLE public.social_spot_submission_media ADD CONSTRAINT social_spot_submission_media_payload_check CHECK ((jsonb_typeof(payload) = 'object'::text));
ALTER TABLE public.social_spot_submission_media ADD CONSTRAINT social_spot_submission_media_revision_check CHECK ((revision > 0));
ALTER TABLE public.social_spot_submission_media ADD CONSTRAINT social_spot_submission_media_source_url_check CHECK (((source_url = btrim(source_url)) AND ((char_length(source_url) >= 1) AND (char_length(source_url) <= 8192))));
ALTER TABLE public.social_spot_submission_media_jobs ADD CONSTRAINT social_spot_submission_media_jobs_attempt_bound CHECK ((attempt_count <= max_attempts));
ALTER TABLE public.social_spot_submission_media_jobs ADD CONSTRAINT social_spot_submission_media_jobs_attempt_count_check CHECK ((attempt_count >= 0));
ALTER TABLE public.social_spot_submission_media_jobs ADD CONSTRAINT social_spot_submission_media_jobs_claimed_by_check CHECK (((claimed_by IS NULL) OR ((char_length(claimed_by) >= 1) AND (char_length(claimed_by) <= 200))));
ALTER TABLE public.social_spot_submission_media_jobs ADD CONSTRAINT social_spot_submission_media_jobs_fingerprint_check CHECK (((fingerprint = btrim(fingerprint)) AND ((char_length(fingerprint) >= 1) AND (char_length(fingerprint) <= 512))));
ALTER TABLE public.social_spot_submission_media_jobs ADD CONSTRAINT social_spot_submission_media_jobs_last_error_check CHECK (((last_error IS NULL) OR (char_length(last_error) <= 8000)));
ALTER TABLE public.social_spot_submission_media_jobs ADD CONSTRAINT social_spot_submission_media_jobs_lease_shape CHECK ((((state = 'leased'::text) AND (claim_token IS NOT NULL) AND (claimed_by IS NOT NULL) AND (claimed_at IS NOT NULL) AND (lease_expires_at IS NOT NULL)) OR ((state <> 'leased'::text) AND (claim_token IS NULL) AND (lease_expires_at IS NULL))));
ALTER TABLE public.social_spot_submission_media_jobs ADD CONSTRAINT social_spot_submission_media_jobs_max_attempts_check CHECK (((max_attempts >= 1) AND (max_attempts <= 10)));
ALTER TABLE public.social_spot_submission_media_jobs ADD CONSTRAINT social_spot_submission_media_jobs_media_key_check CHECK (((media_key = btrim(media_key)) AND ((char_length(media_key) >= 1) AND (char_length(media_key) <= 512))));
ALTER TABLE public.social_spot_submission_media_jobs ADD CONSTRAINT social_spot_submission_media_jobs_media_type_check CHECK ((media_type = ANY (ARRAY['image'::text, 'video'::text, 'unknown'::text])));
ALTER TABLE public.social_spot_submission_media_jobs ADD CONSTRAINT social_spot_submission_media_jobs_ordinal_check CHECK (((ordinal >= 0) AND (ordinal <= 34)));
ALTER TABLE public.social_spot_submission_media_jobs ADD CONSTRAINT social_spot_submission_media_jobs_payload_check CHECK ((jsonb_typeof(payload) = 'object'::text));
ALTER TABLE public.social_spot_submission_media_jobs ADD CONSTRAINT social_spot_submission_media_jobs_revision_check CHECK ((revision > 0));
ALTER TABLE public.social_spot_submission_media_jobs ADD CONSTRAINT social_spot_submission_media_jobs_source_url_check CHECK (((source_url = btrim(source_url)) AND ((char_length(source_url) >= 1) AND (char_length(source_url) <= 8192))));
ALTER TABLE public.social_spot_submission_media_jobs ADD CONSTRAINT social_spot_submission_media_jobs_state_check CHECK ((state = ANY (ARRAY['queued'::text, 'leased'::text, 'retry_wait'::text, 'succeeded'::text, 'dead_letter'::text, 'cancelled'::text])));
ALTER TABLE public.social_spot_submission_media_jobs ADD CONSTRAINT social_spot_submission_media_jobs_terminal_timestamp CHECK ((((state <> 'succeeded'::text) OR (succeeded_at IS NOT NULL)) AND ((state <> 'dead_letter'::text) OR (dead_lettered_at IS NOT NULL)) AND ((state <> 'cancelled'::text) OR (cancelled_at IS NOT NULL))));
ALTER TABLE public.social_spot_submissions ADD CONSTRAINT social_spot_submissions_local_percentage_check CHECK (((local_percentage >= 0) AND (local_percentage <= 100)));
ALTER TABLE public.social_spot_submissions ADD CONSTRAINT social_spot_submissions_localley_score_check CHECK (((localley_score >= 1) AND (localley_score <= 6)));
ALTER TABLE public.social_spot_submissions ADD CONSTRAINT social_spot_submissions_media_dead_letter_count_check CHECK (((media_dead_letter_count >= 0) AND (media_dead_letter_count <= 35)));
ALTER TABLE public.social_spot_submissions ADD CONSTRAINT social_spot_submissions_media_extraction_attempt_count_check CHECK (((media_extraction_attempt_count >= 0) AND (media_extraction_attempt_count <= 5)));
ALTER TABLE public.social_spot_submissions ADD CONSTRAINT social_spot_submissions_media_extraction_lease_shape CHECK ((((media_processing_state = 'coverage_processing'::text) AND (media_extraction_token IS NOT NULL) AND (media_extraction_lease_expires_at IS NOT NULL)) OR ((media_processing_state <> 'coverage_processing'::text) AND (media_extraction_token IS NULL) AND (media_extraction_lease_expires_at IS NULL))));
ALTER TABLE public.social_spot_submissions ADD CONSTRAINT social_spot_submissions_media_finalization_attempt_count_check CHECK (((media_finalization_attempt_count >= 0) AND (media_finalization_attempt_count <= 5)));
ALTER TABLE public.social_spot_submissions ADD CONSTRAINT social_spot_submissions_media_finalization_lease_shape CHECK ((((media_processing_state = 'finalizing'::text) AND (media_finalization_token IS NOT NULL) AND (media_finalization_lease_expires_at IS NOT NULL)) OR ((media_processing_state <> 'finalizing'::text) AND (media_finalization_token IS NULL) AND (media_finalization_lease_expires_at IS NULL))));
ALTER TABLE public.social_spot_submissions ADD CONSTRAINT social_spot_submissions_media_item_count_check CHECK (((media_item_count >= 0) AND (media_item_count <= 35)));
ALTER TABLE public.social_spot_submissions ADD CONSTRAINT social_spot_submissions_media_processing_revision_check CHECK ((media_processing_revision >= 0));
ALTER TABLE public.social_spot_submissions ADD CONSTRAINT social_spot_submissions_media_processing_state_check CHECK ((media_processing_state = ANY (ARRAY['not_started'::text, 'queued'::text, 'processing'::text, 'succeeded'::text, 'finalizing'::text, 'completed'::text, 'dead_letter'::text, 'coverage_retry'::text, 'coverage_processing'::text, 'review_required'::text])));
ALTER TABLE public.social_spot_submissions ADD CONSTRAINT social_spot_submissions_media_succeeded_count_check CHECK (((media_succeeded_count >= 0) AND (media_succeeded_count <= 35)));
ALTER TABLE public.social_spot_submissions ADD CONSTRAINT social_spot_submissions_platform_check CHECK ((platform = ANY (ARRAY['instagram'::text, 'tiktok'::text])));
ALTER TABLE public.social_spot_submissions ADD CONSTRAINT social_spot_submissions_processing_attempt_check CHECK ((processing_attempt >= 0));
ALTER TABLE public.social_spot_submissions ADD CONSTRAINT social_spot_submissions_processing_state_check CHECK ((processing_state = ANY (ARRAY['processing'::text, 'retryable'::text, 'completed'::text])));
ALTER TABLE public.social_spot_submissions ADD CONSTRAINT social_spot_submissions_research_confidence_check CHECK (((research_confidence >= (0)::numeric) AND (research_confidence <= (1)::numeric)));
ALTER TABLE public.social_spot_submissions ADD CONSTRAINT social_spot_submissions_status_check CHECK ((status = ANY (ARRAY['spot_created'::text, 'spot_reused'::text, 'needs_review'::text, 'research_pending'::text])));
ALTER TABLE public.social_spot_submissions ADD CONSTRAINT social_spot_submissions_token_awarded_check CHECK ((token_awarded >= 0));
ALTER TABLE public.spot_contributors ADD CONSTRAINT spot_contributors_email_normalized CHECK ((email = lower(TRIM(BOTH FROM email))));
ALTER TABLE public.spot_contributors ADD CONSTRAINT spot_contributors_total_tokens_check CHECK ((total_tokens >= 0));
ALTER TABLE public.spot_reviews ADD CONSTRAINT spot_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)));
ALTER TABLE public.spots ADD CONSTRAINT spots_local_area_requires_destination CHECK (((local_area_id IS NULL) OR (destination_id IS NOT NULL)));
ALTER TABLE public.spots ADD CONSTRAINT spots_localley_score_check CHECK (((localley_score >= 1) AND (localley_score <= 6)));
ALTER TABLE public.story_image_jobs ADD CONSTRAINT story_image_jobs_check CHECK (((state = 'succeeded'::text) = (output_url IS NOT NULL)));
ALTER TABLE public.story_image_jobs ADD CONSTRAINT story_image_jobs_check1 CHECK (((output_url IS NULL) OR ((output_url = (output_prefix || 'png'::text)) OR (output_url = (output_prefix || 'jpg'::text)))));
ALTER TABLE public.story_image_jobs ADD CONSTRAINT story_image_jobs_clerk_user_id_check CHECK (((length(clerk_user_id) >= 1) AND (length(clerk_user_id) <= 256)));
ALTER TABLE public.story_image_jobs ADD CONSTRAINT story_image_jobs_credits_check CHECK ((credits > 0));
ALTER TABLE public.story_image_jobs ADD CONSTRAINT story_image_jobs_idempotency_key_check CHECK (((length(idempotency_key) >= 1) AND (length(idempotency_key) <= 256)));
ALTER TABLE public.story_image_jobs ADD CONSTRAINT story_image_jobs_output_prefix_check CHECK ((output_prefix ~ '^https://[^/?#]+/[^?#]+/background\.$'::text));
ALTER TABLE public.story_image_jobs ADD CONSTRAINT story_image_jobs_payload_hash_check CHECK ((payload_hash ~ '^[a-f0-9]{64}$'::text));
ALTER TABLE public.story_image_jobs ADD CONSTRAINT story_image_jobs_provider_check CHECK ((provider = ANY (ARRAY['flux'::text, 'seedream'::text, 'gemini'::text, 'gpt-image-2'::text])));
ALTER TABLE public.story_image_jobs ADD CONSTRAINT story_image_jobs_state_check CHECK ((state = ANY (ARRAY['reserved'::text, 'submitted'::text, 'succeeded'::text, 'failed'::text])));
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_billing_cycle_check CHECK ((billing_cycle = ANY (ARRAY['monthly'::text, 'yearly'::text])));
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'canceled'::text, 'past_due'::text, 'trialing'::text])));
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_tier_check CHECK ((tier = ANY (ARRAY['free'::text, 'pro'::text, 'premium'::text])));
ALTER TABLE public.transfer_edges ADD CONSTRAINT transfer_edges_arrival_buffer_minutes_check CHECK ((arrival_buffer_minutes >= 0));
ALTER TABLE public.transfer_edges ADD CONSTRAINT transfer_edges_booking_hint_check CHECK ((jsonb_typeof(booking_hint) = 'object'::text));
ALTER TABLE public.transfer_edges ADD CONSTRAINT transfer_edges_check CHECK ((duration_max_minutes >= duration_min_minutes));
ALTER TABLE public.transfer_edges ADD CONSTRAINT transfer_edges_check1 CHECK ((from_destination_id <> to_destination_id));
ALTER TABLE public.transfer_edges ADD CONSTRAINT transfer_edges_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)));
ALTER TABLE public.transfer_edges ADD CONSTRAINT transfer_edges_cost_band_check CHECK ((cost_band = ANY (ARRAY['budget'::text, 'moderate'::text, 'premium'::text])));
ALTER TABLE public.transfer_edges ADD CONSTRAINT transfer_edges_departure_buffer_minutes_check CHECK ((departure_buffer_minutes >= 0));
ALTER TABLE public.transfer_edges ADD CONSTRAINT transfer_edges_duration_min_minutes_check CHECK ((duration_min_minutes > 0));
ALTER TABLE public.transfer_edges ADD CONSTRAINT transfer_edges_hotel_change_minutes_check CHECK ((hotel_change_minutes >= 0));
ALTER TABLE public.transfer_edges ADD CONSTRAINT transfer_edges_mode_check CHECK ((mode = ANY (ARRAY['flight'::text, 'train'::text, 'bus'::text, 'ferry'::text, 'car'::text, 'taxi'::text, 'rideshare'::text, 'transit'::text])));
ALTER TABLE public.transfer_edges ADD CONSTRAINT transfer_edges_review_status_check CHECK ((review_status = ANY (ARRAY['draft'::text, 'machine_checked'::text, 'human_verified'::text, 'needs_review'::text])));
ALTER TABLE public.transfer_edges ADD CONSTRAINT transfer_edges_schedule_notes_check CHECK ((jsonb_typeof(schedule_notes) = 'object'::text));
ALTER TABLE public.transfer_edges ADD CONSTRAINT transfer_edges_slug_check CHECK ((slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text));
ALTER TABLE public.transfer_edges ADD CONSTRAINT transfer_edges_source_meta_check CHECK ((jsonb_typeof(source_meta) = 'object'::text));
ALTER TABLE public.transfer_edges ADD CONSTRAINT transfer_edges_source_type_check CHECK ((source_type = ANY (ARRAY['curated'::text, 'google_routes'::text, 'gtfs'::text, 'operator'::text])));
ALTER TABLE public.trip_activities ADD CONSTRAINT trip_activities_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)));
ALTER TABLE public.trip_activities ADD CONSTRAINT trip_activities_duration_minutes_check CHECK (((duration_minutes >= 0) AND (duration_minutes <= 720)));
ALTER TABLE public.trip_activities ADD CONSTRAINT trip_activities_kind_check CHECK ((kind = ANY (ARRAY['spot'::text, 'meal'::text, 'rest'::text, 'free_time'::text, 'transfer'::text])));
ALTER TABLE public.trip_activities ADD CONSTRAINT trip_activities_notes_check CHECK ((jsonb_typeof(notes) = 'object'::text));
ALTER TABLE public.trip_activities ADD CONSTRAINT trip_activities_position_check CHECK ((("position" >= 0) AND ("position" <= 20)));
ALTER TABLE public.trip_activities ADD CONSTRAINT trip_activities_route_from_previous_check CHECK ((jsonb_typeof(route_from_previous) = 'object'::text));
ALTER TABLE public.trip_days ADD CONSTRAINT trip_days_active_minutes_budget_check CHECK (((active_minutes_budget >= 0) AND (active_minutes_budget <= 640)));
ALTER TABLE public.trip_days ADD CONSTRAINT trip_days_day_index_check CHECK (((day_index >= 1) AND (day_index <= 21)));
ALTER TABLE public.trip_days ADD CONSTRAINT trip_days_day_type_check CHECK ((day_type = ANY (ARRAY['arrival'::text, 'full'::text, 'transfer'::text, 'rest'::text, 'departure'::text])));
ALTER TABLE public.trip_stops ADD CONSTRAINT trip_stops_nights_check CHECK (((nights >= 0) AND (nights <= 20)));
ALTER TABLE public.trip_stops ADD CONSTRAINT trip_stops_position_check CHECK ((("position" >= 0) AND ("position" <= 4)));
ALTER TABLE public.trip_transfer_legs ADD CONSTRAINT trip_transfer_legs_check CHECK ((from_stop_id <> to_stop_id));
ALTER TABLE public.trip_transfer_legs ADD CONSTRAINT trip_transfer_legs_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)));
ALTER TABLE public.trip_transfer_legs ADD CONSTRAINT trip_transfer_legs_normalized_snapshot_check CHECK ((jsonb_typeof(normalized_snapshot) = 'object'::text));
ALTER TABLE public.trip_transfer_legs ADD CONSTRAINT trip_transfer_legs_position_check CHECK ((("position" >= 0) AND ("position" <= 3)));
ALTER TABLE public.trips ADD CONSTRAINT trips_clerk_user_id_check CHECK (((char_length(clerk_user_id) >= 1) AND (char_length(clerk_user_id) <= 255)));
ALTER TABLE public.trips ADD CONSTRAINT trips_party_check CHECK ((jsonb_typeof(party) = 'object'::text));
ALTER TABLE public.trips ADD CONSTRAINT trips_planner_version_check CHECK (((char_length(planner_version) >= 1) AND (char_length(planner_version) <= 80)));
ALTER TABLE public.trips ADD CONSTRAINT trips_preferences_check CHECK ((jsonb_typeof(preferences) = 'object'::text));
ALTER TABLE public.trips ADD CONSTRAINT trips_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'generated'::text, 'edited'::text, 'archived'::text])));
ALTER TABLE public.trips ADD CONSTRAINT trips_title_check CHECK (((char_length(TRIM(BOTH FROM title)) >= 1) AND (char_length(TRIM(BOTH FROM title)) <= 200)));
ALTER TABLE public.trips ADD CONSTRAINT trips_total_days_check CHECK (((total_days >= 3) AND (total_days <= 21)));
ALTER TABLE public.usage_tracking ADD CONSTRAINT usage_tracking_period_type_check CHECK ((period_type = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text])));
ALTER TABLE public.usage_tracking ADD CONSTRAINT usage_tracking_usage_type_check CHECK ((usage_type = ANY (ARRAY['itineraries_created'::text, 'chat_messages'::text, 'stories_created'::text, 'ai_images_generated'::text, 'spots_saved'::text])));
ALTER TABLE public.weekly_city_spot_rankings ADD CONSTRAINT weekly_city_spot_rankings_platform_count_check CHECK (((platform_count >= 0) AND (platform_count <= 3)));
ALTER TABLE public.weekly_city_spot_rankings ADD CONSTRAINT weekly_city_spot_rankings_post_count_check CHECK ((post_count >= 0));
ALTER TABLE public.weekly_city_spot_rankings ADD CONSTRAINT weekly_city_spot_rankings_rank_check CHECK (((rank >= 1) AND (rank <= 5)));
ALTER TABLE public.weekly_city_spot_rankings ADD CONSTRAINT weekly_city_spot_rankings_score_check CHECK (((score >= (0)::numeric) AND (score <= (100)::numeric)));
ALTER TABLE public.weekly_social_content ADD CONSTRAINT weekly_social_content_comment_count_check CHECK ((comment_count >= 0));
ALTER TABLE public.weekly_social_content ADD CONSTRAINT weekly_social_content_content_text_check CHECK ((char_length(content_text) <= 4000));
ALTER TABLE public.weekly_social_content ADD CONSTRAINT weekly_social_content_like_count_check CHECK ((like_count >= 0));
ALTER TABLE public.weekly_social_content ADD CONSTRAINT weekly_social_content_place_hint_check CHECK ((char_length(place_hint) <= 160));
ALTER TABLE public.weekly_social_content ADD CONSTRAINT weekly_social_content_platform_check CHECK ((platform = ANY (ARRAY['instagram'::text, 'tiktok'::text, 'youtube'::text])));
ALTER TABLE public.weekly_social_content ADD CONSTRAINT weekly_social_content_save_count_check CHECK ((save_count >= 0));
ALTER TABLE public.weekly_social_content ADD CONSTRAINT weekly_social_content_share_count_check CHECK ((share_count >= 0));
ALTER TABLE public.weekly_social_content ADD CONSTRAINT weekly_social_content_view_count_check CHECK ((view_count >= 0));
ALTER TABLE public.weekly_social_spot_leads ADD CONSTRAINT weekly_social_spot_leads_engagement_score_check CHECK ((engagement_score >= 0));
ALTER TABLE public.weekly_social_spot_leads ADD CONSTRAINT weekly_social_spot_leads_normalized_hint_check CHECK (((char_length(normalized_hint) >= 3) AND (char_length(normalized_hint) <= 160)));
ALTER TABLE public.weekly_social_spot_leads ADD CONSTRAINT weekly_social_spot_leads_place_hint_check CHECK (((char_length(place_hint) >= 3) AND (char_length(place_hint) <= 160)));
ALTER TABLE public.weekly_social_spot_leads ADD CONSTRAINT weekly_social_spot_leads_platform_check CHECK ((platform = ANY (ARRAY['instagram'::text, 'tiktok'::text, 'youtube'::text])));
ALTER TABLE public.weekly_social_spot_leads ADD CONSTRAINT weekly_social_spot_leads_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'searching'::text, 'searched'::text, 'ignored'::text])));
ALTER TABLE public.weekly_social_trend_city_builds ADD CONSTRAINT weekly_social_trend_city_builds_attempt_count_check CHECK (((attempt_count >= 1) AND (attempt_count <= 3)));
ALTER TABLE public.weekly_social_trend_city_builds ADD CONSTRAINT weekly_social_trend_city_builds_state_check CHECK ((state = ANY (ARRAY['running'::text, 'succeeded'::text, 'failed'::text])));
ALTER TABLE public.weekly_social_trend_runs ADD CONSTRAINT weekly_social_trend_runs_attempt_count_check CHECK (((attempt_count >= 1) AND (attempt_count <= 3)));
ALTER TABLE public.weekly_social_trend_runs ADD CONSTRAINT weekly_social_trend_runs_platform_check CHECK ((platform = ANY (ARRAY['instagram'::text, 'tiktok'::text, 'youtube'::text])));
ALTER TABLE public.weekly_social_trend_runs ADD CONSTRAINT weekly_social_trend_runs_state_check CHECK ((state = ANY (ARRAY['starting'::text, 'running'::text, 'succeeded'::text, 'failed'::text])));
ALTER TABLE public.apify_spot_candidates ADD CONSTRAINT apify_spot_candidates_imported_spot_id_fkey FOREIGN KEY (imported_spot_id) REFERENCES spots(id) ON DELETE SET NULL;
ALTER TABLE public.apify_spot_candidates ADD CONSTRAINT apify_spot_candidates_run_id_fkey FOREIGN KEY (run_id) REFERENCES apify_spot_discovery_runs(id) ON DELETE CASCADE;
ALTER TABLE public.contribution_token_ledger ADD CONSTRAINT contribution_token_ledger_contributor_id_fkey FOREIGN KEY (contributor_id) REFERENCES spot_contributors(id) ON DELETE CASCADE;
ALTER TABLE public.contribution_token_ledger ADD CONSTRAINT contribution_token_ledger_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES social_spot_submissions(id) ON DELETE CASCADE;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_linked_itinerary_id_fkey FOREIGN KEY (linked_itinerary_id) REFERENCES itineraries(id) ON DELETE SET NULL;
ALTER TABLE public.geo_aliases ADD CONSTRAINT geo_aliases_destination_id_fkey FOREIGN KEY (destination_id) REFERENCES geo_destinations(id) ON DELETE CASCADE;
ALTER TABLE public.geo_aliases ADD CONSTRAINT geo_aliases_local_area_id_fkey FOREIGN KEY (local_area_id) REFERENCES geo_local_areas(id) ON DELETE CASCADE;
ALTER TABLE public.geo_aliases ADD CONSTRAINT geo_aliases_spot_id_fkey FOREIGN KEY (spot_id) REFERENCES spots(id) ON DELETE CASCADE;
ALTER TABLE public.geo_destinations ADD CONSTRAINT geo_destinations_country_code_fkey FOREIGN KEY (country_code) REFERENCES geo_countries(code);
ALTER TABLE public.geo_local_area_vibe_scores ADD CONSTRAINT geo_local_area_vibe_scores_local_area_id_fkey FOREIGN KEY (local_area_id) REFERENCES geo_local_areas(id) ON DELETE CASCADE;
ALTER TABLE public.geo_local_area_vibe_scores ADD CONSTRAINT geo_local_area_vibe_scores_vibe_id_fkey FOREIGN KEY (vibe_id) REFERENCES geo_vibe_taxonomy(id) ON DELETE RESTRICT;
ALTER TABLE public.geo_local_areas ADD CONSTRAINT geo_local_areas_destination_id_fkey FOREIGN KEY (destination_id) REFERENCES geo_destinations(id) ON DELETE CASCADE;
ALTER TABLE public.geo_local_areas ADD CONSTRAINT geo_local_areas_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES geo_local_areas(id) ON DELETE SET NULL;
ALTER TABLE public.itineraries ADD CONSTRAINT itineraries_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE public.messages ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
ALTER TABLE public.review_helpful_votes ADD CONSTRAINT review_helpful_votes_review_id_fkey FOREIGN KEY (review_id) REFERENCES spot_reviews(id) ON DELETE CASCADE;
ALTER TABLE public.saved_itineraries ADD CONSTRAINT saved_itineraries_itinerary_id_fkey FOREIGN KEY (itinerary_id) REFERENCES itineraries(id) ON DELETE CASCADE;
ALTER TABLE public.saved_spots ADD CONSTRAINT saved_spots_spot_id_fkey FOREIGN KEY (spot_id) REFERENCES spots(id) ON DELETE CASCADE;
ALTER TABLE public.social_spot_submission_aliases ADD CONSTRAINT social_spot_submission_aliases_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES social_spot_submissions(id) ON DELETE CASCADE;
ALTER TABLE public.social_spot_submission_candidates ADD CONSTRAINT social_spot_submission_candidates_spot_id_fkey FOREIGN KEY (spot_id) REFERENCES spots(id) ON DELETE SET NULL;
ALTER TABLE public.social_spot_submission_candidates ADD CONSTRAINT social_spot_submission_candidates_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES social_spot_submissions(id) ON DELETE CASCADE;
ALTER TABLE public.social_spot_submission_media ADD CONSTRAINT social_spot_submission_media_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES social_spot_submissions(id) ON DELETE CASCADE;
ALTER TABLE public.social_spot_submission_media_jobs ADD CONSTRAINT social_spot_submission_media_jobs_media_fkey FOREIGN KEY (submission_id, media_id) REFERENCES social_spot_submission_media(submission_id, id) ON DELETE CASCADE;
ALTER TABLE public.social_spot_submissions ADD CONSTRAINT social_spot_submissions_contributor_id_fkey FOREIGN KEY (contributor_id) REFERENCES spot_contributors(id) ON DELETE CASCADE;
ALTER TABLE public.social_spot_submissions ADD CONSTRAINT social_spot_submissions_spot_id_fkey FOREIGN KEY (spot_id) REFERENCES spots(id) ON DELETE SET NULL;
ALTER TABLE public.spot_reviews ADD CONSTRAINT spot_reviews_spot_id_fkey FOREIGN KEY (spot_id) REFERENCES spots(id) ON DELETE CASCADE;
ALTER TABLE public.spots ADD CONSTRAINT spots_destination_id_fk FOREIGN KEY (destination_id) REFERENCES geo_destinations(id) ON DELETE SET NULL;
ALTER TABLE public.spots ADD CONSTRAINT spots_discovered_by_fkey FOREIGN KEY (discovered_by) REFERENCES users(id);
ALTER TABLE public.spots ADD CONSTRAINT spots_local_area_destination_fk FOREIGN KEY (local_area_id, destination_id) REFERENCES geo_local_areas(id, destination_id) ON DELETE SET NULL (local_area_id);
ALTER TABLE public.transfer_edges ADD CONSTRAINT transfer_edges_from_destination_id_fkey FOREIGN KEY (from_destination_id) REFERENCES geo_destinations(id) ON DELETE RESTRICT;
ALTER TABLE public.transfer_edges ADD CONSTRAINT transfer_edges_to_destination_id_fkey FOREIGN KEY (to_destination_id) REFERENCES geo_destinations(id) ON DELETE RESTRICT;
ALTER TABLE public.trip_activities ADD CONSTRAINT trip_activities_day_fk FOREIGN KEY (day_id, trip_id) REFERENCES trip_days(id, trip_id) ON DELETE CASCADE;
ALTER TABLE public.trip_activities ADD CONSTRAINT trip_activities_local_area_id_fkey FOREIGN KEY (local_area_id) REFERENCES geo_local_areas(id) ON DELETE SET NULL;
ALTER TABLE public.trip_activities ADD CONSTRAINT trip_activities_spot_id_fkey FOREIGN KEY (spot_id) REFERENCES spots(id) ON DELETE SET NULL;
ALTER TABLE public.trip_activities ADD CONSTRAINT trip_activities_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
ALTER TABLE public.trip_days ADD CONSTRAINT trip_days_stop_fk FOREIGN KEY (stop_id, trip_id) REFERENCES trip_stops(id, trip_id) ON DELETE CASCADE;
ALTER TABLE public.trip_days ADD CONSTRAINT trip_days_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
ALTER TABLE public.trip_stops ADD CONSTRAINT trip_stops_destination_id_fkey FOREIGN KEY (destination_id) REFERENCES geo_destinations(id) ON DELETE RESTRICT;
ALTER TABLE public.trip_stops ADD CONSTRAINT trip_stops_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
ALTER TABLE public.trip_transfer_legs ADD CONSTRAINT trip_transfer_from_stop_fk FOREIGN KEY (from_stop_id, trip_id) REFERENCES trip_stops(id, trip_id) ON DELETE CASCADE;
ALTER TABLE public.trip_transfer_legs ADD CONSTRAINT trip_transfer_legs_transfer_edge_id_fkey FOREIGN KEY (transfer_edge_id) REFERENCES transfer_edges(id) ON DELETE RESTRICT;
ALTER TABLE public.trip_transfer_legs ADD CONSTRAINT trip_transfer_legs_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
ALTER TABLE public.trip_transfer_legs ADD CONSTRAINT trip_transfer_to_stop_fk FOREIGN KEY (to_stop_id, trip_id) REFERENCES trip_stops(id, trip_id) ON DELETE CASCADE;
ALTER TABLE public.trips ADD CONSTRAINT trips_legacy_itinerary_id_fkey FOREIGN KEY (legacy_itinerary_id) REFERENCES itineraries(id) ON DELETE SET NULL;
ALTER TABLE public.user_challenges ADD CONSTRAINT user_challenges_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES challenges(id);
ALTER TABLE public.user_challenges ADD CONSTRAINT user_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE public.user_progress ADD CONSTRAINT user_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE public.weekly_city_spot_rankings ADD CONSTRAINT weekly_city_spot_rankings_spot_id_fkey FOREIGN KEY (spot_id) REFERENCES spots(id) ON DELETE CASCADE;
ALTER TABLE public.weekly_social_spot_leads ADD CONSTRAINT weekly_social_spot_leads_discovery_run_id_fkey FOREIGN KEY (discovery_run_id) REFERENCES apify_spot_discovery_runs(id) ON DELETE SET NULL;
CREATE INDEX idx_follows_follower ON public.follows USING btree (follower_id);
CREATE INDEX idx_follows_following ON public.follows USING btree (following_id);
CREATE INDEX idx_saved_spots_user ON public.saved_spots USING btree (clerk_user_id);
CREATE INDEX idx_saved_spots_spot ON public.saved_spots USING btree (spot_id);
CREATE INDEX idx_subscriptions_clerk_user_id ON public.subscriptions USING btree (clerk_user_id);
CREATE INDEX idx_subscriptions_stripe_customer ON public.subscriptions USING btree (stripe_customer_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions USING btree (status);
CREATE INDEX idx_affiliate_clicks_partner ON public.affiliate_clicks USING btree (partner);
CREATE INDEX idx_affiliate_clicks_user ON public.affiliate_clicks USING btree (clerk_user_id);
CREATE INDEX idx_affiliate_clicks_created ON public.affiliate_clicks USING btree (created_at);
CREATE INDEX idx_affiliate_clicks_tracking ON public.affiliate_clicks USING btree (tracking_id);
CREATE INDEX idx_affiliate_earnings_partner_date ON public.affiliate_earnings USING btree (partner, period_date);
CREATE INDEX idx_contribution_token_ledger_contributor ON public.contribution_token_ledger USING btree (contributor_id, created_at DESC);
CREATE INDEX idx_usage_tracking_user ON public.usage_tracking USING btree (clerk_user_id);
CREATE INDEX idx_usage_tracking_period ON public.usage_tracking USING btree (period_start, period_type);
CREATE INDEX idx_usage_tracking_composite ON public.usage_tracking USING btree (clerk_user_id, usage_type, period_start);
CREATE INDEX idx_itineraries_view_count ON public.itineraries USING btree (view_count DESC);
CREATE INDEX idx_itineraries_city ON public.itineraries USING btree (city);
CREATE INDEX idx_itineraries_ai_backgrounds ON public.itineraries USING btree (((ai_backgrounds IS NOT NULL)));
CREATE INDEX idx_itineraries_clerk_user_id ON public.itineraries USING btree (clerk_user_id);
CREATE INDEX idx_saved_itineraries_user ON public.saved_itineraries USING btree (clerk_user_id);
CREATE INDEX idx_saved_itineraries_itinerary ON public.saved_itineraries USING btree (itinerary_id);
CREATE INDEX idx_engagement_creator ON public.content_engagement USING btree (creator_clerk_user_id);
CREATE INDEX idx_engagement_month ON public.content_engagement USING btree (engagement_month);
CREATE INDEX idx_engagement_creator_month ON public.content_engagement USING btree (creator_clerk_user_id, engagement_month);
CREATE INDEX idx_engagement_date ON public.content_engagement USING btree (engagement_date);
CREATE INDEX idx_earnings_guide ON public.guide_earnings USING btree (guide_clerk_user_id);
CREATE INDEX idx_earnings_month ON public.guide_earnings USING btree (earning_month);
CREATE INDEX idx_earnings_status ON public.guide_earnings USING btree (status);
CREATE INDEX idx_guide_profiles_status ON public.guide_profiles USING btree (status);
CREATE INDEX idx_guide_profiles_stripe ON public.guide_profiles USING btree (stripe_account_id);
CREATE INDEX idx_conversations_user ON public.conversations USING btree (clerk_user_id);
CREATE INDEX idx_conversations_updated ON public.conversations USING btree (updated_at DESC);
CREATE INDEX idx_conversations_linked_itinerary ON public.conversations USING btree (linked_itinerary_id) WHERE (linked_itinerary_id IS NOT NULL);
CREATE INDEX idx_social_spot_submission_aliases_submission ON public.social_spot_submission_aliases USING btree (submission_id);
CREATE INDEX idx_early_adopters_clerk_user_id ON public.early_adopters USING btree (clerk_user_id);
CREATE UNIQUE INDEX idx_early_adopters_position ON public.early_adopters USING btree ("position");
CREATE UNIQUE INDEX idx_spots_google_place_id ON public.spots USING btree (google_place_id) WHERE (google_place_id IS NOT NULL);
CREATE INDEX idx_spots_category ON public.spots USING btree (category);
CREATE INDEX idx_spots_localley_score ON public.spots USING btree (localley_score);
CREATE UNIQUE INDEX idx_spots_unique_name_address ON public.spots USING btree (name_en_normalized, address_en_normalized) WHERE ((name_en_normalized IS NOT NULL) AND (name_en_normalized <> ''::text));
CREATE INDEX idx_spots_name_en_normalized ON public.spots USING btree (name_en_normalized) WHERE (name_en_normalized IS NOT NULL);
CREATE INDEX spots_destination_id_idx ON public.spots USING btree (destination_id);
CREATE INDEX spots_local_area_id_idx ON public.spots USING btree (local_area_id);
CREATE INDEX idx_spot_reviews_spot ON public.spot_reviews USING btree (spot_id);
CREATE INDEX idx_spot_reviews_user ON public.spot_reviews USING btree (clerk_user_id);
CREATE INDEX idx_spot_reviews_rating ON public.spot_reviews USING btree (rating);
CREATE INDEX idx_review_votes_review ON public.review_helpful_votes USING btree (review_id);
CREATE INDEX idx_review_votes_user ON public.review_helpful_votes USING btree (clerk_user_id);
CREATE INDEX idx_social_spot_submission_candidates_order ON public.social_spot_submission_candidates USING btree (submission_id, ordinal);
CREATE INDEX idx_social_spot_submission_candidates_spot ON public.social_spot_submission_candidates USING btree (spot_id) WHERE (spot_id IS NOT NULL);
CREATE INDEX idx_social_spot_submissions_contributor ON public.social_spot_submissions USING btree (contributor_id, created_at DESC);
CREATE INDEX idx_social_spot_submissions_spot ON public.social_spot_submissions USING btree (spot_id) WHERE (spot_id IS NOT NULL);
CREATE INDEX idx_social_spot_submissions_status ON public.social_spot_submissions USING btree (status, created_at DESC);
CREATE UNIQUE INDEX social_spot_submission_media_current_ordinal_unique ON public.social_spot_submission_media USING btree (submission_id, ordinal) WHERE is_current;
CREATE INDEX idx_social_spot_submission_media_current_revision ON public.social_spot_submission_media USING btree (submission_id, revision, ordinal) WHERE is_current;
CREATE INDEX idx_social_spot_submission_media_jobs_revision ON public.social_spot_submission_media_jobs USING btree (submission_id, revision, ordinal);
CREATE INDEX idx_social_spot_submission_media_jobs_ready ON public.social_spot_submission_media_jobs USING btree (submission_id, revision, available_at, created_at) WHERE (state = ANY (ARRAY['queued'::text, 'retry_wait'::text]));
CREATE INDEX idx_social_spot_submission_media_jobs_expired_lease ON public.social_spot_submission_media_jobs USING btree (submission_id, revision, lease_expires_at, created_at) WHERE (state = 'leased'::text);
CREATE UNIQUE INDEX social_spot_submission_media_jobs_claim_token_unique ON public.social_spot_submission_media_jobs USING btree (claim_token) WHERE (claim_token IS NOT NULL);
CREATE INDEX idx_social_spot_submission_media_jobs_media_fk ON public.social_spot_submission_media_jobs USING btree (submission_id, media_id);
CREATE INDEX geo_destinations_country_enabled_idx ON public.geo_destinations USING btree (country_code, is_enabled, ring);
CREATE INDEX geo_local_areas_destination_review_idx ON public.geo_local_areas USING btree (destination_id, review_status, kind);
CREATE INDEX geo_aliases_destination_idx ON public.geo_aliases USING btree (destination_id, normalized_alias) WHERE (destination_id IS NOT NULL);
CREATE INDEX geo_aliases_local_area_idx ON public.geo_aliases USING btree (local_area_id, normalized_alias) WHERE (local_area_id IS NOT NULL);
CREATE INDEX geo_aliases_spot_idx ON public.geo_aliases USING btree (spot_id, normalized_alias) WHERE (spot_id IS NOT NULL);
CREATE INDEX geo_aliases_lookup_idx ON public.geo_aliases USING btree (normalized_alias, entity_type);
CREATE INDEX transfer_edges_route_idx ON public.transfer_edges USING btree (from_destination_id, to_destination_id, review_status);
CREATE INDEX trips_owner_updated_idx ON public.trips USING btree (clerk_user_id, updated_at DESC);
CREATE INDEX trip_stops_trip_idx ON public.trip_stops USING btree (trip_id, "position");
CREATE INDEX trip_transfer_legs_trip_idx ON public.trip_transfer_legs USING btree (trip_id, "position");
CREATE INDEX trip_days_trip_idx ON public.trip_days USING btree (trip_id, day_index);
CREATE INDEX trip_activities_trip_day_idx ON public.trip_activities USING btree (trip_id, day_id, "position");
CREATE INDEX apify_spot_discovery_runs_city_date_idx ON public.apify_spot_discovery_runs USING btree (city_slug, discovery_date DESC);
CREATE INDEX apify_spot_discovery_runs_state_idx ON public.apify_spot_discovery_runs USING btree (state, started_at);
CREATE INDEX apify_spot_candidates_review_idx ON public.apify_spot_candidates USING btree (status, city_slug, recommended_localley_score DESC, created_at DESC);
CREATE INDEX weekly_social_trend_runs_state_idx ON public.weekly_social_trend_runs USING btree (week_start, state, processed_at);
CREATE INDEX weekly_social_content_city_week_idx ON public.weekly_social_content USING btree (city_slug, week_start DESC);
CREATE INDEX weekly_social_content_expiry_idx ON public.weekly_social_content USING btree (expires_at);
CREATE INDEX weekly_city_spot_rankings_lookup_idx ON public.weekly_city_spot_rankings USING btree (city_slug, week_start DESC, rank);
CREATE INDEX weekly_social_trend_city_builds_state_idx ON public.weekly_social_trend_city_builds USING btree (week_start, state, lease_expires_at);
CREATE INDEX weekly_social_spot_leads_queue_idx ON public.weekly_social_spot_leads USING btree (status, engagement_score DESC, created_at);
CREATE INDEX weekly_social_spot_leads_run_idx ON public.weekly_social_spot_leads USING btree (discovery_run_id) WHERE (discovery_run_id IS NOT NULL);
CREATE INDEX weekly_social_spot_leads_expiry_idx ON public.weekly_social_spot_leads USING btree (expires_at);
CREATE INDEX story_image_jobs_pending_deadline ON public.story_image_jobs USING btree (deadline) WHERE (state = ANY (ARRAY['reserved'::text, 'submitted'::text]));
CREATE INDEX idx_messages_conversation ON public.messages USING btree (conversation_id);
CREATE INDEX idx_messages_created ON public.messages USING btree (created_at);
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
CREATE OR REPLACE FUNCTION public.update_guide_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_social_submission_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.reset_social_spot_media_finalization_attempts_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.media_processing_revision IS DISTINCT FROM OLD.media_processing_revision THEN
    NEW.media_finalization_attempt_count := 0;
    NEW.media_finalization_available_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_conversation_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    UPDATE conversations
    SET updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$function$
;
CREATE TRIGGER spot_contributors_updated_at BEFORE UPDATE ON public.spot_contributors FOR EACH ROW EXECUTE FUNCTION update_social_submission_updated_at();
CREATE TRIGGER social_spot_submissions_updated_at BEFORE UPDATE ON public.social_spot_submissions FOR EACH ROW EXECUTE FUNCTION update_social_submission_updated_at();
CREATE TRIGGER guide_profiles_updated_at BEFORE UPDATE ON public.guide_profiles FOR EACH ROW EXECUTE FUNCTION update_guide_updated_at();
CREATE TRIGGER guide_earnings_updated_at BEFORE UPDATE ON public.guide_earnings FOR EACH ROW EXECUTE FUNCTION update_guide_updated_at();
CREATE TRIGGER update_conversation_on_message AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION update_conversation_timestamp();
CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER usage_tracking_updated_at BEFORE UPDATE ON public.usage_tracking FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER reset_social_spot_media_finalization_attempts BEFORE UPDATE OF media_processing_revision ON public.social_spot_submissions FOR EACH ROW EXECUTE FUNCTION reset_social_spot_media_finalization_attempts_v1();
