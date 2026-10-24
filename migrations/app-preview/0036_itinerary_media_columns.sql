-- Supabase exit step 3 (shared/plans/localley-decisions.md 2026-10-24): itineraries carries every Postgres column,
-- so the D1 data layer reads and writes one table. Types and defaults follow public.itineraries (nullable, as there).
-- Backfilled from legacy_itinerary_media, which stays for the preview candidates until they are retired.
ALTER TABLE itineraries ADD COLUMN ai_backgrounds TEXT CHECK (ai_backgrounds IS NULL OR json_valid(ai_backgrounds));
ALTER TABLE itineraries ADD COLUMN story_slides TEXT CHECK (story_slides IS NULL OR json_valid(story_slides));
ALTER TABLE itineraries ADD COLUMN is_public INTEGER DEFAULT 0 CHECK (is_public IS NULL OR is_public IN (0, 1));
ALTER TABLE itineraries ADD COLUMN like_count INTEGER DEFAULT 0 CHECK (like_count IS NULL OR typeof(like_count) = 'integer');
ALTER TABLE itineraries ADD COLUMN view_count INTEGER DEFAULT 0 CHECK (view_count IS NULL OR typeof(view_count) = 'integer');
-- Source profile uuid (public.users.id = profiles.id); kept as text, the owner is ownerId.
ALTER TABLE itineraries ADD COLUMN user_id TEXT;
UPDATE itineraries SET
  ai_backgrounds = (SELECT m.aiBackgrounds FROM legacy_itinerary_media m WHERE m.itineraryId = itineraries.id),
  story_slides = (SELECT m.storySlides FROM legacy_itinerary_media m WHERE m.itineraryId = itineraries.id),
  is_public = (SELECT m.isPublic FROM legacy_itinerary_media m WHERE m.itineraryId = itineraries.id),
  like_count = (SELECT m.likeCount FROM legacy_itinerary_media m WHERE m.itineraryId = itineraries.id),
  view_count = (SELECT m.viewCount FROM legacy_itinerary_media m WHERE m.itineraryId = itineraries.id),
  user_id = (SELECT m.sourceProfileId FROM legacy_itinerary_media m WHERE m.itineraryId = itineraries.id)
WHERE EXISTS (SELECT 1 FROM legacy_itinerary_media m WHERE m.itineraryId = itineraries.id);
