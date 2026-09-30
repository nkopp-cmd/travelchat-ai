-- Candidate-only source profile emails. The live Worker keeps Supabase.
CREATE TABLE legacy_profile_emails (
  profileId TEXT PRIMARY KEY REFERENCES profiles(id),
  email TEXT CHECK(email IS NULL OR (typeof(email) = 'text' AND length(email) <= 320))
);
-- Refuse changed baselines; a fresh rehearsal must reconcile a new source snapshot.
CREATE TRIGGER legacy_profile_emails_immutable BEFORE UPDATE ON legacy_profile_emails
WHEN OLD.email IS NOT NEW.email
BEGIN SELECT RAISE(ABORT, 'Source profile email changed'); END;
