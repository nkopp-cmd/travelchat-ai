ALTER TABLE spots
ADD COLUMN IF NOT EXISTS google_place_id TEXT;

CREATE INDEX IF NOT EXISTS idx_spots_google_place_id
ON spots(google_place_id)
WHERE google_place_id IS NOT NULL;

COMMENT ON COLUMN spots.google_place_id IS 'Durable Google Places place ID used for exact photo provenance and Google Maps directions.';
