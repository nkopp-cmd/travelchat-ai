-- Operational rollback, retaining permanent identity bindings and private evidence.
-- Parent-only, after target verification and a private backup. No public data changes.
BEGIN;
SELECT pg_advisory_xact_lock(741923860421::bigint);
UPDATE native_private.metadata SET ingest_enabled = false;
REVOKE EXECUTE ON FUNCTION public.native_production_ingest(text,text,text,text) FROM service_role;
COMMIT;
