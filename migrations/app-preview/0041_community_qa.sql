-- Community Q&A (shared/plans/localley-helper-community.md phase 2). D1-only tables: they never existed in Supabase,
-- so they are not journaled for the gate-2 rollback (a rollback to Supabase drops community content; decisions log).
CREATE TABLE community_questions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  city TEXT NOT NULL,
  topic TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 8 AND 140),
  body TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 2000),
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden')),
  score INTEGER NOT NULL DEFAULT 0,
  answer_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX community_questions_list ON community_questions (status, city, topic, created_at DESC);
CREATE INDEX community_questions_user ON community_questions (user_id, created_at);

CREATE TABLE community_answers (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES community_questions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 2 AND 2000),
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden')),
  score INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX community_answers_question ON community_answers (question_id, status, score DESC, created_at);
CREATE INDEX community_answers_user ON community_answers (user_id, created_at);

-- Upvotes only; one per user and target. score columns are kept in the same batch as the vote row.
CREATE TABLE community_votes (
  user_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('question', 'answer')),
  target_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, target_type, target_id)
);

CREATE TABLE community_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('question', 'answer')),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'abuse', 'unsafe', 'wrong', 'other')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resolved_at TEXT,
  UNIQUE (user_id, target_type, target_id)
);
CREATE INDEX community_reports_open ON community_reports (resolved_at, created_at);
