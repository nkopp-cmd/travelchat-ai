-- Candidate-only baseline; legacy_usage remains unchanged.
ALTER TABLE preview_chat_usage ADD COLUMN baselineCount INTEGER NOT NULL DEFAULT 0
  CHECK (baselineCount >= 0);
