# Personal saved-trip permissions

## Checkable scope

- Restrict only the three existing saved_itineraries policies to authenticated personal owners.
- Revoke public TRUNCATE without changing other grants, columns, indexes, constraints or rows.
- Preserve complete trusted counts, shared-copy/export access and removal of an old private like.
- Pass real PostgreSQL role/owner/tamper/rollback checks, actual handler integration, exact CI and independent review.
- Apply merged guarded metadata once; reconcile unknown outcomes read-only.
- Verify actual owner/foreign behavior, unchanged Source/Admin/Worker guards and exact controlled fixture cleanup.

## Confirmed baseline — October 17, 2026

The project-pinned privileged read-only catalog finds saved_itineraries with RLS enabled, no FORCE, zero rows and no non-internal triggers. The three permissive PUBLIC policies allow INSERT WITH CHECK(true), SELECT USING(true) and DELETE USING(true). Both public roles retain ALL table privileges, including TRUNCATE. RLS does not restrict TRUNCATE.

The table uses UUID id/itinerary_id, text clerk_user_id and created_at. The unique key is(clerk_user_id,itinerary_id); the itinerary foreign key cascades on deletion. This is current physical evidence, not a claim about deleted archives or historical access. No current table or record is removed.

Only app/api/itineraries/[id]/like/route.ts and app/api/user/saved-itineraries/route.ts directly access this table in application source. Personal reads/writes already use the authenticated SDK. The compatible436 runtime uses bounded trusted reads for complete counts and parent updates. Shared-copy/export use their existing independent access checks. Direct operational import/archive references do not prove a live caller.

## Guard and recovery

scripts/d1-migration/source-owner-saved-policy.mjs validates exactly the three known policies, commands, permissive flags, roles and expressions. It checks physical RLS/no FORCE, public roles without owner/service membership or bypass, trusted full CRUD/BYPASSRLS and exact direct TRUNCATE grants. It locks only this table, with lock timeout2s and statement timeout5s.

SELECT/DELETE get USING(clerk_user_id=(SELECTauth.jwt()->>sub)); INSERT gets the same WITH CHECK. TO authenticated combines role and subject ownership. There is no UPDATE policy, as before. Editable metadata and UUID casts never grant access. Before/after complete sorted row digests must match; inherited TRUNCATE refuses the transaction. No data, migration ledger, function, identity, provider, secret, billing or Worker change occurs.

Restore requires the exact current catalog fingerprint and explicitly reopens prior PUBLIC access. It is an emergency operation only. It is not an automatic response to an HTTP/verifier error. Local proof verifies original policy/ACL fingerprint and rows after restore, then reapplies. Live readback must verify exact intended metadata and preserve every other privilege. Review notes request optional in-transaction final catalog checks; current scope uses strict initial guard, local exact rollback and independent live readback. Current live clerk_user_id is text; unknown type/catalog drift must stop.

## Local evidence

Independent read-only guard review APPROVE, noP0/P1. Corrected real pinned PostgreSQL proof passes131checks, including six actual handler cases. Tests cover anonymous/foreign/unknown owner, forged editable metadata, owned insert/delete, prohibited UPDATE, actual TRUNCATE denial, server CRUD, complete counters across owners, old private unlike without count leakage, repeat/drift refusal, tampered-row transaction rollback and exact metadata/data restore/reapply. All owned disposable containers are removed; no external calls occur. ESLint passes.

The first131-scope run reached130checks but one multi-owner handler returned500. The test adapter parsed only the last line of PostgreSQL's valid multi-line JSON aggregate. Parsing the complete quiet-psql document fixes the fixture. The failed report remains retained; the second run passes131. No production permission operation occurred during either proof.

## Release gate

Prepared only. Exact commit, required CI, merge, actual guarded operation, native private owner/foreign cleanup and retained Worker/Source/Admin evidence remain required before this repair is complete. Production remains Worker2c328128/b5efe6f6 at100%; previewe08db2c5/7cdc7953 is unchanged. The earlier eight-table privacy repair remains active. Full notification activation and D1 application-data cutover retain their common gates; Supabase remains live.
