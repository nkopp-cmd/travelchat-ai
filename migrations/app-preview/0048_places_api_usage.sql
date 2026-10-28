-- Hard daily stop for Google Places API calls (NEEDS 880, APPROVALS.md 2026-10-28 00:20Z): lib/places-quota.ts
-- reserves one call per upstream request in one atomic upsert and refuses once calls = cap (fail closed). The row
-- also stores the cap in force, so the host alert (80 %) reads both from here. D1-only: not journaled.
CREATE TABLE places_api_usage (
  day TEXT PRIMARY KEY NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  calls INTEGER NOT NULL CHECK (calls >= 0),
  cap INTEGER NOT NULL CHECK (cap > 0),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
