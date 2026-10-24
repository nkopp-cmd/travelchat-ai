-- Supabase exit step 3 (shared/plans/localley-decisions.md 2026-10-24): one D1 table per Postgres table for the facade.
-- public.users -> profiles (clerk_id = ownerId) gains the remaining Postgres columns, backfilled from the side tables
-- (kept for the preview candidates). saved_spots gains created_at text (Postgres timestamptz text) next to
-- createdAtMs. saved_itineraries is new in the Postgres shape (0 source rows on 2026-10-24).
ALTER TABLE profiles ADD COLUMN username TEXT;
ALTER TABLE profiles ADD COLUMN email TEXT;
ALTER TABLE profiles ADD COLUMN level INTEGER DEFAULT 1 CHECK (level IS NULL OR typeof(level) = 'integer');
ALTER TABLE profiles ADD COLUMN xp INTEGER DEFAULT 0 CHECK (xp IS NULL OR typeof(xp) = 'integer');
ALTER TABLE profiles ADD COLUMN title TEXT DEFAULT 'Tourist';
ALTER TABLE profiles ADD COLUMN created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) CHECK (created_at IS NULL OR julianday(created_at) IS NOT NULL);
UPDATE profiles SET
  username = (SELECT s.username FROM legacy_profile_stats s WHERE s.profileId = profiles.id),
  level = (SELECT s.level FROM legacy_profile_stats s WHERE s.profileId = profiles.id),
  xp = (SELECT s.xp FROM legacy_profile_stats s WHERE s.profileId = profiles.id),
  title = (SELECT s.title FROM legacy_profile_stats s WHERE s.profileId = profiles.id),
  created_at = (SELECT s.createdAt FROM legacy_profile_stats s WHERE s.profileId = profiles.id)
WHERE EXISTS (SELECT 1 FROM legacy_profile_stats s WHERE s.profileId = profiles.id);
UPDATE profiles SET email = (SELECT e.email FROM legacy_profile_emails e WHERE e.profileId = profiles.id)
WHERE EXISTS (SELECT 1 FROM legacy_profile_emails e WHERE e.profileId = profiles.id);
-- users_username_key
CREATE UNIQUE INDEX profiles_username_key ON profiles (username);

ALTER TABLE saved_spots ADD COLUMN created_at TEXT CHECK (created_at IS NULL OR julianday(created_at) IS NOT NULL);
UPDATE saved_spots SET created_at = strftime('%Y-%m-%dT%H:%M:%f', createdAtMs / 1000.0, 'unixepoch') || '+00:00';

CREATE TABLE saved_itineraries (
  id TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  clerk_user_id TEXT NOT NULL,
  itinerary_id TEXT NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) CHECK (created_at IS NULL OR julianday(created_at) IS NOT NULL),
  UNIQUE (clerk_user_id, itinerary_id)
);

-- subscriptions_clerk_user_id_key: upserts use onConflict clerk_user_id (= ownerId).
CREATE UNIQUE INDEX legacy_subscriptions_owner_key ON legacy_subscriptions (ownerId);

-- usage_tracking unique key: the usage functions upsert ON CONFLICT (clerk_user_id, usage_type, period_start, period_type).
CREATE UNIQUE INDEX legacy_usage_period_key ON legacy_usage (ownerId, usageType, periodStart, periodType);
