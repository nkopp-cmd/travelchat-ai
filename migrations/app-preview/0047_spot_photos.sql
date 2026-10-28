-- Own spot photo library (NEEDS 882, shared/plans/localley-spot-photo-library.md). A tip photo becomes a spot photo
-- only with the uploader's consent (checkbox at upload) and an admin's choice. The file is copied to
-- spot-photos/<spotId>/<sha256>.webp in the COMMUNITY_MEDIA bucket and served publicly by /media/spot.
-- Google Places photos are never stored here (Places policy): they stay the live fallback. D1-only: not journaled.
ALTER TABLE spot_tips ADD COLUMN photo_spot_consent INTEGER NOT NULL DEFAULT 0 CHECK (photo_spot_consent IN (0, 1));
CREATE TABLE spot_photos (
  spot_id TEXT PRIMARY KEY NOT NULL REFERENCES spots(id),
  r2_key TEXT NOT NULL UNIQUE CHECK (r2_key GLOB 'spot-photos/*'),
  source TEXT NOT NULL CHECK (source IN ('tip', 'own', 'cc0')),
  licence TEXT NOT NULL,
  author TEXT,
  source_url TEXT,
  tip_id TEXT,
  approved_by TEXT NOT NULL,
  approved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
