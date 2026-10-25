-- One optional photo per spot tip (shared/plans/localley-helper-community.md phase 2: "spot tips and photos").
-- The file lives in R2 (binding COMMUNITY_MEDIA, bucket localley-community-media, EU), re-encoded to WebP by the
-- IMAGES binding (drops EXIF incl. GPS). D1-only like 0041-0043: not journaled.
ALTER TABLE spot_tips ADD COLUMN photo_key TEXT CHECK (photo_key IS NULL OR photo_key GLOB 'tips/*');
