-- Provider listing association for catalog places. Request-time checks must still
-- corroborate each listing against catalog coordinates before any photo is shown.
CREATE TABLE spot_listing_places (
  spot_id TEXT PRIMARY KEY REFERENCES spots(id),
  provider TEXT NOT NULL CHECK(provider = 'google'),
  place_id TEXT NOT NULL CHECK(length(place_id) BETWEEN 1 AND 256 AND place_id NOT GLOB '*[^A-Za-z0-9_-]*'),
  source TEXT NOT NULL CHECK(length(source) BETWEEN 1 AND 300),
  created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('now', 'subsec') * 1000 AS INTEGER))
);
