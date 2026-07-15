-- Additive multi-city trip core. This migration is authored for branch rehearsal
-- and must not be applied to production without the explicit release gate.

CREATE TABLE public.transfer_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  from_destination_id UUID NOT NULL REFERENCES public.geo_destinations(id) ON DELETE RESTRICT,
  to_destination_id UUID NOT NULL REFERENCES public.geo_destinations(id) ON DELETE RESTRICT,
  mode TEXT NOT NULL CHECK (mode IN ('flight', 'train', 'bus', 'ferry', 'car', 'taxi', 'rideshare', 'transit')),
  duration_min_minutes INTEGER NOT NULL CHECK (duration_min_minutes > 0),
  duration_max_minutes INTEGER NOT NULL CHECK (duration_max_minutes >= duration_min_minutes),
  departure_buffer_minutes INTEGER NOT NULL CHECK (departure_buffer_minutes >= 0),
  arrival_buffer_minutes INTEGER NOT NULL CHECK (arrival_buffer_minutes >= 0),
  hotel_change_minutes INTEGER NOT NULL DEFAULT 45 CHECK (hotel_change_minutes >= 0),
  cost_band TEXT NOT NULL CHECK (cost_band IN ('budget', 'moderate', 'premium')),
  booking_hint JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(booking_hint) = 'object'),
  schedule_notes JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(schedule_notes) = 'object'),
  source_type TEXT NOT NULL CHECK (source_type IN ('curated', 'google_routes', 'gtfs', 'operator')),
  source_meta JSONB NOT NULL CHECK (jsonb_typeof(source_meta) = 'object'),
  confidence NUMERIC(4, 3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  review_status TEXT NOT NULL CHECK (review_status IN ('draft', 'machine_checked', 'human_verified', 'needs_review')),
  reviewed_at TIMESTAMPTZ,
  valid_from DATE,
  valid_until DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_destination_id <> to_destination_id),
  UNIQUE (from_destination_id, to_destination_id, mode, source_type)
);

CREATE TABLE public.trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT NOT NULL CHECK (char_length(clerk_user_id) BETWEEN 1 AND 255),
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 200),
  start_date DATE,
  total_days SMALLINT NOT NULL CHECK (total_days BETWEEN 3 AND 21),
  party JSONB NOT NULL CHECK (jsonb_typeof(party) = 'object'),
  preferences JSONB NOT NULL CHECK (jsonb_typeof(preferences) = 'object'),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'generated', 'edited', 'archived')),
  legacy_itinerary_id UUID REFERENCES public.itineraries(id) ON DELETE SET NULL,
  planner_version TEXT NOT NULL CHECK (char_length(planner_version) BETWEEN 1 AND 80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.trip_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  destination_id UUID NOT NULL REFERENCES public.geo_destinations(id) ON DELETE RESTRICT,
  position SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 4),
  nights SMALLINT NOT NULL CHECK (nights BETWEEN 0 AND 20),
  is_locked BOOLEAN NOT NULL DEFAULT false,
  arrival_local TIMESTAMPTZ,
  departure_local TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trip_id, position),
  UNIQUE (trip_id, destination_id),
  UNIQUE (id, trip_id)
);

CREATE TABLE public.trip_transfer_legs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  from_stop_id UUID NOT NULL,
  to_stop_id UUID NOT NULL,
  transfer_edge_id UUID NOT NULL REFERENCES public.transfer_edges(id) ON DELETE RESTRICT,
  position SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 3),
  normalized_snapshot JSONB NOT NULL CHECK (jsonb_typeof(normalized_snapshot) = 'object'),
  confidence NUMERIC(4, 3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT trip_transfer_from_stop_fk FOREIGN KEY (from_stop_id, trip_id)
    REFERENCES public.trip_stops(id, trip_id) ON DELETE CASCADE,
  CONSTRAINT trip_transfer_to_stop_fk FOREIGN KEY (to_stop_id, trip_id)
    REFERENCES public.trip_stops(id, trip_id) ON DELETE CASCADE,
  CHECK (from_stop_id <> to_stop_id),
  UNIQUE (trip_id, position)
);

CREATE TABLE public.trip_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  stop_id UUID NOT NULL,
  day_index SMALLINT NOT NULL CHECK (day_index BETWEEN 1 AND 21),
  local_date DATE,
  day_type TEXT NOT NULL CHECK (day_type IN ('arrival', 'full', 'transfer', 'rest', 'departure')),
  active_minutes_budget INTEGER NOT NULL CHECK (active_minutes_budget BETWEEN 0 AND 640),
  theme TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT trip_days_stop_fk FOREIGN KEY (stop_id, trip_id)
    REFERENCES public.trip_stops(id, trip_id) ON DELETE CASCADE,
  UNIQUE (trip_id, day_index),
  UNIQUE (id, trip_id)
);

CREATE TABLE public.trip_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  day_id UUID NOT NULL,
  position SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 20),
  spot_id UUID REFERENCES public.spots(id) ON DELETE SET NULL,
  local_area_id UUID REFERENCES public.geo_local_areas(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('spot', 'meal', 'rest', 'free_time', 'transfer')),
  start_window TSTZRANGE,
  duration_minutes INTEGER CHECK (duration_minutes BETWEEN 0 AND 720),
  route_from_previous JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(route_from_previous) = 'object'),
  notes JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(notes) = 'object'),
  confidence NUMERIC(4, 3) CHECK (confidence BETWEEN 0 AND 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT trip_activities_day_fk FOREIGN KEY (day_id, trip_id)
    REFERENCES public.trip_days(id, trip_id) ON DELETE CASCADE,
  UNIQUE (day_id, position)
);

CREATE INDEX transfer_edges_route_idx
  ON public.transfer_edges (from_destination_id, to_destination_id, review_status);
CREATE INDEX trip_stops_trip_idx ON public.trip_stops (trip_id, position);
CREATE INDEX trip_transfer_legs_trip_idx ON public.trip_transfer_legs (trip_id, position);
CREATE INDEX trip_days_trip_idx ON public.trip_days (trip_id, day_index);
CREATE INDEX trip_activities_trip_day_idx ON public.trip_activities (trip_id, day_id, position);
CREATE INDEX trips_owner_updated_idx ON public.trips (clerk_user_id, updated_at DESC);

ALTER TABLE public.transfer_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_transfer_legs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public reads reviewed transfer edges"
  ON public.transfer_edges FOR SELECT TO anon, authenticated
  USING (
    review_status IN ('machine_checked', 'human_verified') AND
    (valid_from IS NULL OR valid_from <= current_date) AND
    (valid_until IS NULL OR valid_until >= current_date) AND
    EXISTS (
      SELECT 1 FROM public.geo_destinations origin
      JOIN public.geo_destinations destination ON destination.id = to_destination_id
      WHERE origin.id = from_destination_id
        AND origin.is_enabled
        AND destination.is_enabled
    )
  );

CREATE POLICY "Owners manage trips"
  ON public.trips FOR ALL TO authenticated
  USING (clerk_user_id = (SELECT auth.jwt() ->> 'sub'))
  WITH CHECK (clerk_user_id = (SELECT auth.jwt() ->> 'sub'));

CREATE POLICY "Owners manage trip stops"
  ON public.trip_stops FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trips trip
    WHERE trip.id = trip_id AND trip.clerk_user_id = (SELECT auth.jwt() ->> 'sub')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.trips trip
    WHERE trip.id = trip_id AND trip.clerk_user_id = (SELECT auth.jwt() ->> 'sub')
  ));

CREATE POLICY "Owners manage trip transfer legs"
  ON public.trip_transfer_legs FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trips trip
    WHERE trip.id = trip_id AND trip.clerk_user_id = (SELECT auth.jwt() ->> 'sub')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.trips trip
    WHERE trip.id = trip_id AND trip.clerk_user_id = (SELECT auth.jwt() ->> 'sub')
  ));

CREATE POLICY "Owners manage trip days"
  ON public.trip_days FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trips trip
    WHERE trip.id = trip_id AND trip.clerk_user_id = (SELECT auth.jwt() ->> 'sub')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.trips trip
    WHERE trip.id = trip_id AND trip.clerk_user_id = (SELECT auth.jwt() ->> 'sub')
  ));

CREATE POLICY "Owners manage trip activities"
  ON public.trip_activities FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trips trip
    WHERE trip.id = trip_id AND trip.clerk_user_id = (SELECT auth.jwt() ->> 'sub')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.trips trip
    WHERE trip.id = trip_id AND trip.clerk_user_id = (SELECT auth.jwt() ->> 'sub')
  ));

GRANT SELECT ON public.transfer_edges TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.trips,
  public.trip_stops,
  public.trip_transfer_legs,
  public.trip_days,
  public.trip_activities
TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.transfer_edges,
  public.trips,
  public.trip_stops,
  public.trip_transfer_legs,
  public.trip_days,
  public.trip_activities
TO service_role;

COMMENT ON COLUMN public.trip_activities.spot_id IS
  'Nullable by design: Phase 2 must tolerate spots without reviewed destination ownership.';
COMMENT ON TABLE public.transfer_edges IS
  'Reviewed planning ranges, never a promise of live schedule, fare, availability, or disruption status.';
