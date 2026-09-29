-- Candidate-only ledger. Apply after the native 0001-0013 application migrations.
CREATE TABLE IF NOT EXISTS preview_stripe_events (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id) BETWEEN 5 AND 200),
  eventType TEXT NOT NULL CHECK(length(eventType) BETWEEN 1 AND 128),
  stripeCreated INTEGER NOT NULL CHECK(stripeCreated > 0),
  livemode INTEGER NOT NULL CHECK(livemode = 0),
  objectId TEXT NOT NULL CHECK(length(objectId) BETWEEN 1 AND 200),
  payloadSha256 TEXT NOT NULL CHECK(length(payloadSha256) = 64),
  receivedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
