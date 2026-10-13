-- Private source evidence only. The public catalog continues to read spots.
CREATE TABLE native_place_candidates (
  source_key TEXT PRIMARY KEY NOT NULL,
  city TEXT NOT NULL CHECK(city = 'seoul'),
  observed_at TEXT NOT NULL,
  source_url TEXT NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload) AND length(payload) <= 32000),
  matched_spot_id TEXT REFERENCES spots(id),
  match_state TEXT NOT NULL CHECK(match_state IN ('unmatched', 'exact_source', 'ambiguous')),
  batch_id TEXT NOT NULL
);
CREATE INDEX native_candidates_observed ON native_place_candidates(city, observed_at);
CREATE TABLE native_import_receipts (
  batch_id TEXT PRIMARY KEY NOT NULL,
  imported_at TEXT NOT NULL,
  accepted INTEGER NOT NULL CHECK(accepted BETWEEN 0 AND 1000),
  rejected INTEGER NOT NULL CHECK(rejected BETWEEN 0 AND 5000)
);

CREATE TRIGGER native_candidate_capacity BEFORE INSERT ON native_place_candidates
WHEN NOT EXISTS (SELECT 1 FROM native_place_candidates WHERE source_key=NEW.source_key)
 AND (SELECT count(*) FROM native_place_candidates) >= 5000
BEGIN SELECT RAISE(ABORT, 'Native candidate capacity reached'); END;
