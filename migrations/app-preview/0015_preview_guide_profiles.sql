-- Isolated read-only guide archive for the preview admin candidate.
CREATE TABLE IF NOT EXISTS legacy_guide_profile_batches (
  id TEXT PRIMARY KEY,
  sourceCount INTEGER NOT NULL CHECK (sourceCount >= 0),
  sourceSha256 TEXT NOT NULL,
  importedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS legacy_guide_profiles (
  id TEXT NOT NULL,
  batchId TEXT NOT NULL REFERENCES legacy_guide_profile_batches(id),
  clerkUserId TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  appliedAt TEXT NOT NULL,
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  PRIMARY KEY (batchId, id),
  UNIQUE (batchId, clerkUserId)
);

CREATE INDEX IF NOT EXISTS legacy_guide_profiles_batch_status_applied_idx
  ON legacy_guide_profiles(batchId, status, appliedAt DESC, id DESC);

-- The 2026-09-29 verified source snapshot contains zero guide_profiles.
-- Its [] page has SHA256 4f53...b945. Replace this batch during the final frozen import.
INSERT OR IGNORE INTO legacy_guide_profile_batches(id, sourceCount, sourceSha256, importedAt)
VALUES ('source-20260929', 0, '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945', '2026-09-29T14:25:09.780Z');
