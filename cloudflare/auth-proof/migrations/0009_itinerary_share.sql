ALTER TABLE itineraries ADD COLUMN shared INTEGER NOT NULL DEFAULT 0;
ALTER TABLE itineraries ADD COLUMN share_code TEXT;
CREATE UNIQUE INDEX itineraries_share_code ON itineraries(share_code) WHERE share_code IS NOT NULL;
