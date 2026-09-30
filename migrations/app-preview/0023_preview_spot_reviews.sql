-- Isolated preview reviews. The observed live source had zero reviews and votes.
CREATE TABLE IF NOT EXISTS preview_spot_reviews (
  id TEXT PRIMARY KEY,
  spotId TEXT NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  ownerId TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT CHECK (comment IS NULL OR length(comment) <= 1000),
  visitDate TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE (spotId, ownerId)
);
CREATE INDEX IF NOT EXISTS preview_spot_reviews_spot_date_idx
  ON preview_spot_reviews(spotId, createdAt DESC, id DESC);

CREATE TABLE IF NOT EXISTS preview_review_votes (
  reviewId TEXT NOT NULL REFERENCES preview_spot_reviews(id) ON DELETE CASCADE,
  ownerId TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  createdAt TEXT NOT NULL,
  PRIMARY KEY (reviewId, ownerId)
);
