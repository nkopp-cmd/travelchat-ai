-- Migration 004: Add story_slides column to itineraries
-- Purpose: Store persisted rendered story slide PNG URLs for the public stories page.
-- The save route writes to this column, and the stories page reads from it.
--
-- IMPORTANT: Run this SQL in the Supabase SQL Editor on production.

ALTER TABLE itineraries
ADD COLUMN IF NOT EXISTS story_slides JSONB;

COMMENT ON COLUMN itineraries.story_slides IS 'Persisted rendered story slide PNGs in Supabase Storage. Format: {"cover": "url", "day1": "url", "summary": "url"}';
