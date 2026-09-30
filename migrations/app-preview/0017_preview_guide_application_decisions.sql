-- Additive preview-only review record; imported source rows remain immutable.
CREATE TABLE IF NOT EXISTS preview_guide_application_decisions (
  clerkUserId TEXT PRIMARY KEY REFERENCES preview_guide_applications(clerkUserId),
  status TEXT NOT NULL CHECK (status = 'rejected'),
  reviewedAt TEXT NOT NULL,
  reviewedBy TEXT NOT NULL
);
