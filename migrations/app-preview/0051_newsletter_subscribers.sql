-- Localley's own newsletter (shared/plans/localley-newsletter.md, APPROVALS.md 2026-11-14). Additive: one new table.
-- Double opt-in: a row starts 'pending' with the SHA-256 of a one-time confirm token (24 h). The unsubscribe token is a
-- random capability stored as is, so the host issue sender can build one-click links without a shared secret.
-- Rollback: DROP TABLE newsletter_subscribers (no other table references it).
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  email TEXT NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'unsubscribed')),
  confirm_hash TEXT CHECK (confirm_hash IS NULL OR length(confirm_hash) = 64),
  confirm_expires INTEGER,
  unsubscribe_token TEXT NOT NULL CHECK (length(unsubscribe_token) = 64),
  source TEXT NOT NULL DEFAULT 'site' CHECK (length(source) BETWEEN 1 AND 40),
  city TEXT CHECK (city IS NULL OR length(city) <= 40),
  consent_text TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  confirmed_at INTEGER,
  unsubscribed_at INTEGER
);
CREATE INDEX IF NOT EXISTS newsletter_subscribers_status_idx ON newsletter_subscribers (status);
