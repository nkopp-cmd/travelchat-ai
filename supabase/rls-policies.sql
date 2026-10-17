-- Historical file: not applied to the live project. It assumed clerk_user_id on
-- user_progress/user_challenges; the actual schema uses user_id UUID -> users.id.
-- Use the reviewed scripts/d1-migration/source-owner-policy-guard.mjs transaction.
-- That guard preserves data, validates current ownership, refuses policy drift,
-- protects public reads and includes a fingerprint-bound emergency rollback.
DO $$ BEGIN
  RAISE EXCEPTION 'Use the reviewed Localley source-owner-policy guard; do not apply the obsolete policy file';
END $$;
