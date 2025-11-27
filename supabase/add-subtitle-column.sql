-- Add subtitle column to itineraries table
-- Run this migration in Supabase SQL editor

ALTER TABLE itineraries
ADD COLUMN IF NOT EXISTS subtitle TEXT;

-- Add comment for documentation
COMMENT ON COLUMN itineraries.subtitle IS 'Brief tagline/description for the itinerary';
