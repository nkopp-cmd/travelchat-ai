-- Synthetic preview inbox only. Historical notifications require a counted import.
CREATE TABLE IF NOT EXISTS preview_notifications (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('achievement','level_up','new_spot','itinerary_shared',
    'itinerary_liked','review_helpful','friend_request','friend_accepted','challenge_start',
    'challenge_ending','weekly_digest','system')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 2000),
  data TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data) AND json_type(data) = 'object'),
  isRead INTEGER NOT NULL DEFAULT 0 CHECK (isRead IN (0, 1)),
  readAt TEXT,
  createdAt TEXT NOT NULL,
  CHECK ((isRead = 0 AND readAt IS NULL) OR (isRead = 1 AND readAt IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS preview_notifications_owner_page_idx
  ON preview_notifications(ownerId, createdAt DESC, id DESC);
