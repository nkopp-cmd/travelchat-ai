-- New candidate applications are separate from the immutable source archive.
CREATE TABLE IF NOT EXISTS preview_guide_applications (
  id TEXT PRIMARY KEY,
  clerkUserId TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status = 'pending'),
  bio TEXT,
  specialties TEXT NOT NULL CHECK (json_valid(specialties)),
  cities TEXT NOT NULL CHECK (json_valid(cities)),
  appliedAt TEXT NOT NULL
);
