-- Preview-only private background cache and weighted monthly counters. No source mutation.
CREATE TABLE IF NOT EXISTS preview_story_backgrounds (
  id TEXT PRIMARY KEY NOT NULL,
  ownerId TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  cacheHash TEXT NOT NULL CHECK(length(cacheHash)=64),
  objectKey TEXT UNIQUE NOT NULL,
  contentType TEXT NOT NULL CHECK(contentType IN ('image/png','image/jpeg')),
  byteSize INTEGER NOT NULL CHECK(byteSize BETWEEN 500 AND 2097152),
  sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  UNIQUE(ownerId,cacheHash)
);
CREATE TABLE IF NOT EXISTS preview_story_usage (
  ownerId TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  periodStart TEXT NOT NULL,
  count INTEGER NOT NULL CHECK(count BETWEEN 0 AND 9007199254740991),
  baselineCount INTEGER NOT NULL CHECK(baselineCount BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY(ownerId,periodStart)
);
