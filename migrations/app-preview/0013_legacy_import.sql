-- Additive tables for the verified legacy (Supabase/Clerk) import. Nothing here grants
-- sessions, paid access or email consent. owners.source 'legacy-fixture' is the existing
-- claimable legacy-owner category used by the claim flow; legacy_owners records provenance.
CREATE TABLE legacy_import_batches (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id) = 64 AND id NOT GLOB '*[^0-9a-f]*'),
  manifestSha256 TEXT NOT NULL CHECK(length(manifestSha256) = 64),
  projectionSha256 TEXT NOT NULL CHECK(length(projectionSha256) = 64),
  counts TEXT NOT NULL CHECK(json_valid(counts) AND json_type(counts) = 'object'),
  importedAt INTEGER NOT NULL DEFAULT (CAST(unixepoch('now', 'subsec') * 1000 AS INTEGER))
);
CREATE TABLE legacy_owners (
  ownerId TEXT PRIMARY KEY NOT NULL REFERENCES owners(id),
  clerkUserId TEXT NOT NULL UNIQUE CHECK(length(clerkUserId) BETWEEN 1 AND 64),
  hasSourceProfile INTEGER NOT NULL CHECK(hasSourceProfile IN (0, 1)),
  batchId TEXT NOT NULL REFERENCES legacy_import_batches(id)
);
CREATE TABLE legacy_profile_stats (
  profileId TEXT PRIMARY KEY NOT NULL REFERENCES profiles(id),
  username TEXT, xp INTEGER, level INTEGER, title TEXT, createdAt TEXT
);
CREATE TABLE legacy_itinerary_media (
  itineraryId TEXT PRIMARY KEY NOT NULL REFERENCES itineraries(id),
  aiBackgrounds TEXT CHECK(aiBackgrounds IS NULL OR json_valid(aiBackgrounds)),
  storySlides TEXT CHECK(storySlides IS NULL OR json_valid(storySlides)),
  isPublic INTEGER NOT NULL DEFAULT 0 CHECK(isPublic IN (0, 1)),
  likeCount INTEGER NOT NULL DEFAULT 0, viewCount INTEGER NOT NULL DEFAULT 0,
  sourceProfileId TEXT
);
CREATE TABLE conversations (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id) = 36 AND id = lower(id)),
  ownerId TEXT NOT NULL REFERENCES owners(id),
  title TEXT, linkedItineraryId TEXT,
  createdAt TEXT NOT NULL, updatedAt TEXT
);
CREATE INDEX conversations_owner ON conversations(ownerId, updatedAt DESC);
CREATE TABLE messages (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id) = 36 AND id = lower(id)),
  conversationId TEXT NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL CHECK(length(content) <= 65536),
  createdAt TEXT NOT NULL
);
CREATE INDEX messages_conversation ON messages(conversationId, createdAt);
CREATE TABLE legacy_subscriptions (
  id TEXT PRIMARY KEY NOT NULL,
  ownerId TEXT NOT NULL REFERENCES owners(id),
  tier TEXT, status TEXT, billingCycle TEXT,
  stripeCustomerId TEXT, stripeSubscriptionId TEXT, stripePriceId TEXT,
  currentPeriodStart TEXT, currentPeriodEnd TEXT, cancelAtPeriodEnd INTEGER,
  trialStart TEXT, trialEnd TEXT, createdAt TEXT, updatedAt TEXT
);
CREATE TABLE legacy_usage (
  id TEXT PRIMARY KEY NOT NULL,
  ownerId TEXT NOT NULL REFERENCES owners(id),
  usageType TEXT NOT NULL, periodType TEXT, periodStart TEXT, count INTEGER NOT NULL,
  createdAt TEXT, updatedAt TEXT
);
CREATE TABLE legacy_spot_source (
  spotId TEXT PRIMARY KEY NOT NULL REFERENCES spots(id),
  payload TEXT NOT NULL CHECK(json_valid(payload) AND json_type(payload) = 'object'),
  publicIssue TEXT
);
