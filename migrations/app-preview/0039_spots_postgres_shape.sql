-- Supabase exit step 3, spots on D1 (shared/plans/localley-decisions.md 2026-10-24, option B): spots carries every
-- public.spots column. Additive: the text `address` the live list reads stays; the jsonb address goes to address_json.
-- location (geography) is not stored: the D1 facade rebuilds its EWKB from latitude/longitude. `visible`, `city`,
-- `address` and spot_listing_places are recomputed by the facade on every write (visibility_version = rule version).
ALTER TABLE spots ADD COLUMN address_json TEXT CHECK (address_json IS NULL OR (json_valid(address_json) AND json_type(address_json) = 'object'));
ALTER TABLE spots ADD COLUMN google_place_id TEXT;
ALTER TABLE spots ADD COLUMN discovered_by TEXT;
ALTER TABLE spots ADD COLUMN created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) CHECK (created_at IS NULL OR julianday(created_at) IS NOT NULL);
ALTER TABLE spots ADD COLUMN review_count INTEGER DEFAULT 0 CHECK (review_count IS NULL OR typeof(review_count) = 'integer');
ALTER TABLE spots ADD COLUMN average_rating REAL DEFAULT 0 CHECK (average_rating IS NULL OR typeof(average_rating) IN ('integer','real'));
ALTER TABLE spots ADD COLUMN name_en_normalized TEXT;
ALTER TABLE spots ADD COLUMN address_en_normalized TEXT;
ALTER TABLE spots ADD COLUMN visibility_version TEXT;
-- Backfill from the exact imported source row. photos: the source text[] (legacy rows had [] here).
UPDATE spots SET
  photos = (SELECT json_extract(l.payload, '$.photos') FROM legacy_spot_source l WHERE l.spotId = spots.id),
  address_json = (SELECT json_extract(l.payload, '$.address') FROM legacy_spot_source l WHERE l.spotId = spots.id),
  google_place_id = (SELECT json_extract(l.payload, '$.google_place_id') FROM legacy_spot_source l WHERE l.spotId = spots.id),
  discovered_by = (SELECT json_extract(l.payload, '$.discovered_by') FROM legacy_spot_source l WHERE l.spotId = spots.id),
  created_at = (SELECT json_extract(l.payload, '$.created_at') FROM legacy_spot_source l WHERE l.spotId = spots.id),
  review_count = (SELECT json_extract(l.payload, '$.review_count') FROM legacy_spot_source l WHERE l.spotId = spots.id),
  average_rating = (SELECT json_extract(l.payload, '$.average_rating') FROM legacy_spot_source l WHERE l.spotId = spots.id),
  name_en_normalized = (SELECT json_extract(l.payload, '$.name_en_normalized') FROM legacy_spot_source l WHERE l.spotId = spots.id),
  address_en_normalized = (SELECT json_extract(l.payload, '$.address_en_normalized') FROM legacy_spot_source l WHERE l.spotId = spots.id)
WHERE EXISTS (SELECT 1 FROM legacy_spot_source l WHERE l.spotId = spots.id);
