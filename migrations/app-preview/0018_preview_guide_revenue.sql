-- Counted, isolated preview source pages for guide earnings and engagement.
CREATE TABLE IF NOT EXISTS legacy_guide_revenue_batches (
  id TEXT PRIMARY KEY,
  earningsCount INTEGER NOT NULL CHECK (earningsCount >= 0),
  engagementCount INTEGER NOT NULL CHECK (engagementCount >= 0),
  earningsSha256 TEXT NOT NULL,
  engagementSha256 TEXT NOT NULL,
  importedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS legacy_guide_earnings (
  id TEXT NOT NULL,
  batchId TEXT NOT NULL REFERENCES legacy_guide_revenue_batches(id),
  guideClerkUserId TEXT NOT NULL,
  earningMonth TEXT NOT NULL,
  status TEXT NOT NULL,
  grossAmount TEXT NOT NULL,
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  PRIMARY KEY (batchId, id),
  UNIQUE (batchId, guideClerkUserId, earningMonth)
);
CREATE INDEX IF NOT EXISTS legacy_guide_earnings_owner_month_idx
  ON legacy_guide_earnings(batchId, guideClerkUserId, earningMonth DESC);

CREATE TABLE IF NOT EXISTS legacy_content_engagement (
  id TEXT NOT NULL,
  batchId TEXT NOT NULL REFERENCES legacy_guide_revenue_batches(id),
  creatorClerkUserId TEXT NOT NULL,
  engagementMonth TEXT NOT NULL,
  contentType TEXT NOT NULL,
  engagementPoints INTEGER NOT NULL,
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  PRIMARY KEY (batchId, id)
);
CREATE INDEX IF NOT EXISTS legacy_content_engagement_owner_month_idx
  ON legacy_content_engagement(batchId, creatorClerkUserId, engagementMonth);

-- The observed 2026-09-30 source has zero rows in both tables.
INSERT OR IGNORE INTO legacy_guide_revenue_batches
  (id, earningsCount, engagementCount, earningsSha256, engagementSha256, importedAt)
VALUES
  ('source-20260930', 0, 0,
   '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
   '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
   '2026-09-30T09:00:00.000Z');
