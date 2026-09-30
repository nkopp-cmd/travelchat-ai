-- Isolated email choices for new preview owners. Historical consent needs a separate import.
CREATE TABLE IF NOT EXISTS email_preferences (
  ownerId TEXT PRIMARY KEY REFERENCES owners(id) ON DELETE CASCADE,
  marketing INTEGER NOT NULL CHECK (marketing IN (0, 1)),
  weekly_digest INTEGER NOT NULL CHECK (weekly_digest IN (0, 1)),
  product_updates INTEGER NOT NULL CHECK (product_updates IN (0, 1)),
  itinerary_shared INTEGER NOT NULL CHECK (itinerary_shared IN (0, 1))
);
