-- Current source saved_itineraries and positive cached like counts were both zero on 2026-09-30.
-- This table is for isolated preview owners. Historical likes need a counted import before canary.
CREATE TABLE IF NOT EXISTS preview_itinerary_likes (
  ownerId TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  itineraryId TEXT NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  createdAt TEXT NOT NULL,
  PRIMARY KEY (ownerId, itineraryId)
);
CREATE INDEX IF NOT EXISTS preview_itinerary_likes_itinerary_idx
  ON preview_itinerary_likes(itineraryId, ownerId);
