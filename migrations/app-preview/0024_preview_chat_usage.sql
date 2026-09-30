-- Isolated daily chat counter for verified preview accounts only.
-- Historical usage remains immutable in legacy_usage until the owner gate passes.
CREATE TABLE IF NOT EXISTS preview_chat_usage (
  ownerId TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  periodStart TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (ownerId, periodStart)
);
