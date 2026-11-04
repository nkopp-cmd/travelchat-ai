-- spot_photos source may also be 'opendata': official government tourism open data with a reuse licence (NEED 1023,
-- APPROVALS 2026-11-04 "add all" = yes taiwan photos). First user: Taiwan Tourism Administration Attraction data,
-- Government Open Data License v1.0 (commercial use with credit). Rebuild (create new, copy every row unchanged,
-- drop old, rename): SQLite cannot alter a CHECK. No table references spot_photos. Rollback: the same rebuild with
-- the 0049 CHECK after deleting the 'opendata' rows.
CREATE TABLE spot_photos_opendata (
  r2_key TEXT PRIMARY KEY NOT NULL CHECK (r2_key GLOB 'spot-photos/*'),
  spot_id TEXT NOT NULL REFERENCES spots(id),
  position INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL CHECK (source IN ('tip', 'own', 'cc0', 'commons', 'kto', 'pexels', 'opendata')),
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
INSERT INTO spot_photos_opendata (r2_key, spot_id, position, source, licence, author, source_url, tip_id, width, height, approved_by, approved_at)
  SELECT r2_key, spot_id, position, source, licence, author, source_url, tip_id, width, height, approved_by, approved_at FROM spot_photos;
DROP TABLE spot_photos;
ALTER TABLE spot_photos_opendata RENAME TO spot_photos;
