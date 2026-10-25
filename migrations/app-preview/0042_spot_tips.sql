-- Spot tips from travellers (shared/plans/localley-helper-community.md phase 2: "went today, closed Mondays").
-- D1-only like the community Q&A tables (0041): not journaled for the gate-2 rollback.
CREATE TABLE spot_tips (
  id TEXT PRIMARY KEY,
  spot_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 3 AND 280),
  visited_on TEXT CHECK (visited_on IS NULL OR visited_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX spot_tips_spot ON spot_tips (spot_id, status, created_at DESC);
CREATE INDEX spot_tips_user ON spot_tips (user_id, created_at);

CREATE TABLE spot_tip_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tip_id TEXT NOT NULL REFERENCES spot_tips(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'abuse', 'unsafe', 'wrong', 'other')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resolved_at TEXT,
  UNIQUE (user_id, tip_id)
);
CREATE INDEX spot_tip_reports_open ON spot_tip_reports (resolved_at, created_at);
