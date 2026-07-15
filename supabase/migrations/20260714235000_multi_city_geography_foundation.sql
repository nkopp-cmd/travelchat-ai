-- Additive geography identity foundation. This migration intentionally does not
-- backfill existing spots or change any public read path.

CREATE TABLE public.geo_countries (
  code CHAR(2) PRIMARY KEY CHECK (code ~ '^[A-Z]{2}$'),
  name JSONB NOT NULL CHECK (jsonb_typeof(name) = 'object' AND name ? 'en'),
  default_currency CHAR(3) NOT NULL CHECK (default_currency ~ '^[A-Z]{3}$'),
  default_languages TEXT[] NOT NULL DEFAULT '{}',
  source_meta JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_meta) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.geo_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name JSONB NOT NULL CHECK (jsonb_typeof(name) = 'object' AND name ? 'en'),
  country_code CHAR(2) NOT NULL REFERENCES public.geo_countries(code),
  center GEOGRAPHY(POINT, 4326) NOT NULL,
  timezone TEXT NOT NULL,
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  languages TEXT[] NOT NULL DEFAULT '{}',
  ring SMALLINT NOT NULL CHECK (ring BETWEEN 1 AND 3),
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  targets JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(targets) = 'object'),
  characterization JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(characterization) = 'object'),
  source_meta JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_meta) = 'object'),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.geo_local_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id UUID NOT NULL REFERENCES public.geo_destinations(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.geo_local_areas(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'district', 'neighborhood', 'town', 'island', 'day_trip_area', 'spot_cluster'
  )),
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name JSONB NOT NULL CHECK (jsonb_typeof(name) = 'object' AND name ? 'en'),
  characterization JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(characterization) = 'object'),
  traveler_types TEXT[] NOT NULL DEFAULT '{}',
  practical_notes JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(practical_notes) = 'object'),
  center GEOGRAPHY(POINT, 4326),
  boundary GEOMETRY(MULTIPOLYGON, 4326),
  source_meta JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_meta) = 'object'),
  confidence NUMERIC(4, 3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  review_status TEXT NOT NULL CHECK (review_status IN (
    'draft', 'machine_checked', 'human_verified', 'needs_review'
  )),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (destination_id, slug),
  UNIQUE (id, destination_id)
);

CREATE TABLE public.geo_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('destination', 'local_area', 'spot')),
  destination_id UUID REFERENCES public.geo_destinations(id) ON DELETE CASCADE,
  local_area_id UUID REFERENCES public.geo_local_areas(id) ON DELETE CASCADE,
  spot_id UUID REFERENCES public.spots(id) ON DELETE CASCADE,
  entity_id UUID GENERATED ALWAYS AS (COALESCE(destination_id, local_area_id, spot_id)) STORED,
  alias TEXT NOT NULL CHECK (char_length(trim(alias)) BETWEEN 1 AND 160),
  normalized_alias TEXT NOT NULL CHECK (char_length(trim(normalized_alias)) BETWEEN 1 AND 160),
  lang TEXT,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT geo_aliases_exactly_one_entity CHECK (
    num_nonnulls(destination_id, local_area_id, spot_id) = 1
  ),
  CONSTRAINT geo_aliases_entity_type_matches_fk CHECK (
    (entity_type = 'destination' AND destination_id IS NOT NULL) OR
    (entity_type = 'local_area' AND local_area_id IS NOT NULL) OR
    (entity_type = 'spot' AND spot_id IS NOT NULL)
  ),
  UNIQUE (entity_type, entity_id, normalized_alias)
);

CREATE INDEX geo_aliases_destination_idx
  ON public.geo_aliases (destination_id, normalized_alias)
  WHERE destination_id IS NOT NULL;
CREATE INDEX geo_aliases_local_area_idx
  ON public.geo_aliases (local_area_id, normalized_alias)
  WHERE local_area_id IS NOT NULL;
CREATE INDEX geo_aliases_spot_idx
  ON public.geo_aliases (spot_id, normalized_alias)
  WHERE spot_id IS NOT NULL;
CREATE INDEX geo_aliases_lookup_idx ON public.geo_aliases (normalized_alias, entity_type);

CREATE TABLE public.geo_vibe_taxonomy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  rubric JSONB NOT NULL CHECK (jsonb_typeof(rubric) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (slug, version)
);

CREATE TABLE public.geo_local_area_vibe_scores (
  local_area_id UUID NOT NULL REFERENCES public.geo_local_areas(id) ON DELETE CASCADE,
  vibe_id UUID NOT NULL REFERENCES public.geo_vibe_taxonomy(id) ON DELETE RESTRICT,
  score SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),
  confidence NUMERIC(4, 3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  evidence JSONB NOT NULL CHECK (jsonb_typeof(evidence) IN ('object', 'array')),
  source_type TEXT NOT NULL CHECK (source_type IN (
    'curated', 'spot_aggregate', 'social_aggregate', 'survey'
  )),
  scored_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  PRIMARY KEY (local_area_id, vibe_id)
);

ALTER TABLE public.spots
  ADD COLUMN destination_id UUID,
  ADD COLUMN local_area_id UUID,
  ADD CONSTRAINT spots_destination_id_fk
    FOREIGN KEY (destination_id) REFERENCES public.geo_destinations(id) ON DELETE SET NULL,
  ADD CONSTRAINT spots_local_area_requires_destination
    CHECK (local_area_id IS NULL OR destination_id IS NOT NULL),
  ADD CONSTRAINT spots_local_area_destination_fk
    FOREIGN KEY (local_area_id, destination_id)
    REFERENCES public.geo_local_areas(id, destination_id) ON DELETE SET NULL (local_area_id);

CREATE INDEX spots_destination_id_idx ON public.spots (destination_id);
CREATE INDEX spots_local_area_id_idx ON public.spots (local_area_id);
CREATE INDEX geo_destinations_country_enabled_idx
  ON public.geo_destinations (country_code, is_enabled, ring);
CREATE INDEX geo_local_areas_destination_review_idx
  ON public.geo_local_areas (destination_id, review_status, kind);

ALTER TABLE public.geo_countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_local_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_vibe_taxonomy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_local_area_vibe_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public reads geography countries"
  ON public.geo_countries FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public reads enabled destinations"
  ON public.geo_destinations FOR SELECT TO anon, authenticated USING (is_enabled);
CREATE POLICY "Public reads reviewed local areas"
  ON public.geo_local_areas FOR SELECT TO anon, authenticated
  USING (
    review_status IN ('machine_checked', 'human_verified') AND
    EXISTS (
      SELECT 1 FROM public.geo_destinations destination
      WHERE destination.id = destination_id AND destination.is_enabled
    )
  );
CREATE POLICY "Public reads destination and local area aliases"
  ON public.geo_aliases FOR SELECT TO anon, authenticated
  USING (
    (
      entity_type = 'destination' AND
      EXISTS (
        SELECT 1 FROM public.geo_destinations destination
        WHERE destination.id = destination_id AND destination.is_enabled
      )
    ) OR
    (
      entity_type = 'local_area' AND
      EXISTS (
        SELECT 1 FROM public.geo_local_areas area
        JOIN public.geo_destinations destination ON destination.id = area.destination_id
        WHERE area.id = local_area_id
          AND area.review_status IN ('machine_checked', 'human_verified')
          AND destination.is_enabled
      )
    )
  );
CREATE POLICY "Public reads vibe taxonomy"
  ON public.geo_vibe_taxonomy FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public reads reviewed local area vibe scores"
  ON public.geo_local_area_vibe_scores FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.geo_local_areas area
      JOIN public.geo_destinations destination ON destination.id = area.destination_id
      WHERE area.id = local_area_id
        AND area.review_status IN ('machine_checked', 'human_verified')
        AND destination.is_enabled
    )
  );

GRANT SELECT ON TABLE
  public.geo_countries,
  public.geo_destinations,
  public.geo_local_areas,
  public.geo_aliases,
  public.geo_vibe_taxonomy,
  public.geo_local_area_vibe_scores
TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.geo_countries,
  public.geo_destinations,
  public.geo_local_areas,
  public.geo_aliases,
  public.geo_vibe_taxonomy,
  public.geo_local_area_vibe_scores
TO service_role;

COMMENT ON TABLE public.geo_destinations IS
  'Canonical Localley destination identities. Social evidence must never overwrite these rows automatically.';
COMMENT ON TABLE public.geo_local_areas IS
  'Reviewed destination districts, neighborhoods, towns, islands, and day-trip areas.';
COMMENT ON COLUMN public.spots.destination_id IS
  'Nullable during the geography backfill and human mismatch review gate.';
COMMENT ON COLUMN public.spots.local_area_id IS
  'Optional reviewed local-area identity; must belong to destination_id.';
