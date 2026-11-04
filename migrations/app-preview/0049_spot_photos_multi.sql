-- Several real-place photos per spot from mixed sources (NEED 1017, APPROVALS 2026-11-04 01:2xZ: "use all photos. can
-- be mixed up, but needs to be the real places"). spot_photos was empty in production when this ran and no table
-- references it, so it is rebuilt (create new, drop old, rename): one row per R2 object, ordered per spot by position (lowest = the lead photo).
-- Sources: tip (consented upload), own, cc0, commons (Wikimedia Commons, licence + author kept), kto (Korea Tourism
-- Organization, KOGL Type 1: attribution), pexels (area spots only, never a stand-in for a venue). Google Places photos
-- are never stored here (Places policy): they stay the live fallback. D1-only: not journaled.
CREATE TABLE spot_photos_multi (
  r2_key TEXT PRIMARY KEY NOT NULL CHECK (r2_key GLOB 'spot-photos/*'),
  spot_id TEXT NOT NULL REFERENCES spots(id),
  position INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL CHECK (source IN ('tip', 'own', 'cc0', 'commons', 'kto', 'pexels')),
  licence TEXT NOT NULL,
  author TEXT,
  source_url TEXT,
  tip_id TEXT,
  width INTEGER,
  height INTEGER,
  approved_by TEXT NOT NULL,
  approved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (spot_id, position)
);
DROP TABLE spot_photos;
ALTER TABLE spot_photos_multi RENAME TO spot_photos;
