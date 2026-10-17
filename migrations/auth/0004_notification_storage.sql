-- Additive users-first storage. No Source data import and no delivery activation.
-- Canonical Better Auth IDs include both migrated and opaque IDs.
CREATE TABLE auth_notification_preferences (
  userId TEXT PRIMARY KEY NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  pushEnabled INTEGER NOT NULL DEFAULT 0 CHECK (pushEnabled IN (0, 1)),
  emailEnabled INTEGER NOT NULL DEFAULT 0 CHECK (emailEnabled IN (0, 1)),
  achievements INTEGER NOT NULL DEFAULT 0 CHECK (achievements IN (0, 1)),
  levelUps INTEGER NOT NULL DEFAULT 0 CHECK (levelUps IN (0, 1)),
  newSpots INTEGER NOT NULL DEFAULT 0 CHECK (newSpots IN (0, 1)),
  social INTEGER NOT NULL DEFAULT 0 CHECK (social IN (0, 1)),
  challenges INTEGER NOT NULL DEFAULT 0 CHECK (challenges IN (0, 1)),
  weeklyDigest INTEGER NOT NULL DEFAULT 0 CHECK (weeklyDigest IN (0, 1)),
  system INTEGER NOT NULL DEFAULT 0 CHECK (system IN (0, 1)),
  quietHoursStart TEXT,
  quietHoursEnd TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC' CHECK (length(timezone) BETWEEN 1 AND 100)
);

CREATE TABLE auth_notifications (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('achievement', 'level_up', 'new_spot',
    'itinerary_shared', 'itinerary_liked', 'review_helpful', 'friend_request',
    'friend_accepted', 'challenge_start', 'challenge_ending', 'weekly_digest', 'system')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 2000),
  data TEXT NOT NULL DEFAULT '{}' CHECK (length(data) <= 8192 AND json_valid(data) AND json_type(data) = 'object'),
  isRead INTEGER NOT NULL DEFAULT 0 CHECK (isRead IN (0, 1)),
  readAt TEXT,
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX auth_notifications_user_created ON auth_notifications(userId, createdAt DESC, id DESC);
CREATE INDEX auth_notifications_user_read ON auth_notifications(userId, isRead);

CREATE TABLE auth_push_subscriptions (
  endpointSha256 TEXT PRIMARY KEY NOT NULL CHECK (length(endpointSha256) = 64),
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL CHECK (length(endpoint) BETWEEN 1 AND 2048),
  p256dh TEXT NOT NULL CHECK (length(p256dh) = 87),
  auth TEXT NOT NULL CHECK (length(auth) = 22),
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX auth_push_subscriptions_user ON auth_push_subscriptions(userId);
