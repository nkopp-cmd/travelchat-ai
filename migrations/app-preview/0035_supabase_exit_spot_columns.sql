-- Supabase exit step 2: spot fields that hold real source data (2026-10-24 counts: subcategories,
-- best_times, tips 3295/3295; verified 211; trending_score 2572 non-zero; local_percentage 3193
-- non-default). Geo links are empty today but get the FK now. review_count, average_rating and
-- discovered_by are all default/null in the source and stay in legacy_spot_source.payload.
ALTER TABLE spots ADD COLUMN subcategories TEXT CHECK (subcategories IS NULL OR (json_valid(subcategories) AND json_type(subcategories) = 'array'));
ALTER TABLE spots ADD COLUMN local_percentage INTEGER CHECK (local_percentage IS NULL OR (typeof(local_percentage) = 'integer' AND local_percentage BETWEEN 0 AND 100));
ALTER TABLE spots ADD COLUMN best_times TEXT CHECK (best_times IS NULL OR json_valid(best_times));
ALTER TABLE spots ADD COLUMN tips TEXT CHECK (tips IS NULL OR json_valid(tips));
ALTER TABLE spots ADD COLUMN verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1));
ALTER TABLE spots ADD COLUMN trending_score REAL NOT NULL DEFAULT 0 CHECK (typeof(trending_score) IN ('integer', 'real'));
ALTER TABLE spots ADD COLUMN destination_id TEXT REFERENCES geo_destinations(id) ON DELETE SET NULL;
ALTER TABLE spots ADD COLUMN local_area_id TEXT REFERENCES geo_local_areas(id) ON DELETE SET NULL;
