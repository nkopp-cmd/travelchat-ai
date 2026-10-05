-- Candidate only: retain valid PNG output at the existing 1080x1920 provider size.
-- No table refers to this cache by foreign key. Copy constraints fail before DROP.
CREATE TABLE preview_story_backgrounds_capacity (
  id TEXT PRIMARY KEY NOT NULL,
  ownerId TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  cacheHash TEXT NOT NULL CHECK(length(cacheHash)=64),
  objectKey TEXT UNIQUE NOT NULL,
  contentType TEXT NOT NULL CHECK(contentType IN ('image/png','image/jpeg')),
  byteSize INTEGER NOT NULL CHECK(byteSize BETWEEN 500 AND 8388608),
  sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  UNIQUE(ownerId,cacheHash)
);
INSERT INTO preview_story_backgrounds_capacity
  (id,ownerId,cacheHash,objectKey,contentType,byteSize,sha256)
  SELECT id,ownerId,cacheHash,objectKey,contentType,byteSize,sha256
  FROM preview_story_backgrounds;
DROP TABLE preview_story_backgrounds;
ALTER TABLE preview_story_backgrounds_capacity RENAME TO preview_story_backgrounds;
