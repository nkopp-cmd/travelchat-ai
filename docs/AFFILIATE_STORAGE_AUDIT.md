# Affiliate persistence and permission audit

## Scope and acceptance

This is a Source permission repair before further candidate D1 work. It does not activate a candidate collector, change booking links, migrate historical rows, invoke an earnings job or contact a partner.

- Restrict exactly three existing permissive policies to `service_role`, in one guarded transaction.
- Preserve the fourth false policy, all rows, schema, grants, functions, administrators and Workers.
- Prove public read/write denial and retained server CRUD against disposable Postgres.
- Retain private before/after catalog and row fingerprints; require reviewed green CI before live application.
- Verify live anonymous zero-row counts, privileged counts, unchanged row hashes and existing protected route contracts.

## Confirmed current Source boundary — October 17, 2026

The two physical RLS-enabled tables have 17 clicks and zero earnings. All clicks have nonempty owners, user agents and IP hashes; none have monetary amounts. Creation dates span December 10, 2025 through March 12, 2026. No private records were returned by the public probe: `select=id&limit=0` with exact count proved all 17 rows visible to the anonymous role.

All four policies were permissive and PUBLIC. `Allow affiliate click inserts` allowed INSERT with true; `Allow affiliate click reads` allowed SELECT with true. `Allow earnings access` allowed ALL with true. The false `Admin only for earnings` policy did not override that permissive policy. Both anonymous and authenticated roles had CRUD grants. Server role has BYPASSRLS and CRUD; neither public role inherits it. Neither table has FORCE RLS.

The read-only catalog found no dependent views/materialized views and no security-definer function definition naming either table. Text search cannot exclude arbitrary dynamic SQL or unknown external callers. The existing `aggregate_affiliate_stats()` function is invoker, publicly executable and has no tracked runtime caller. `cron.job` is absent. Do not execute this function during verification.

The broad live SELECT and ALL policies were absent from the repository schema. The schema's INSERT policy also defaulted to PUBLIC; this PR changes it to `TO service_role` so reapplying that definition cannot reopen direct inserts.

This is a confirmed historic exposure, not evidence that anyone accessed the records. Nils owns incident assessment and any required external notice. No access-log conclusion is available.

## Actual application callers and failure behavior

`app/api/affiliates/track/route.ts` uses `createSupabaseAdmin()` for both methods. The ordinary middleware protects this route: anonymous GET/POST and an invalid session cookie receive 401/no-store. The nullable-owner POST and anonymous pixel comments do not prove public access through the application.

POST requires partner, trackingId and eventType, then stores the optional activity name/URL, user agent, simple hashed forwarded-IP and authenticated owner or null. Missing fields return 400 before Source access. Database errors and caught exceptions return success deliberately; do not infer persistence from HTTP200. GET with no partner/tid returns the 42-byte GIF without a database operation. GET with both values inserts through the server role. It does not independently load a session; middleware checks the signed cookie. Session cache can retain a signed-out cached identity for the configured 60-second window. This audit does not change that policy.

- The rendered booking deals popover sends the expected fields.
- BookingButton sends expected fields, but only its definition/export was found in the tracked graph.
- The rendered Viator suggestions send productCode without trackingId. The actual protected POST returns400 for that payload.
- api-client/useTrackAffiliateClick expose provider/productId/productName/city rather than the required field names. The actual protected POST returns400. No current consumer of that hook was found.
- The pixel URL builder has no tracked application consumer. External historic consumers remain unknown.

Click handlers await tracking, ignore errors, then open the partner link. This documents the code's non-blocking failure intent; no real partner request or full mobile popup journey was performed.

Admin analytics requires an actual allowlisted administrator before Source access. A real signed-in non-admin received403. It reads clicks and earnings through the server role and aggregates events/dates. Preserve all17 historical events, private metadata and zero-row earnings schema pending explicit disposition. Raw archival classification in the base D1 importer does not prove a completed admin reader migration. The admin MRR constants differ from current plan prices; this audit does not change financial reporting.

## Guard and local proof

`scripts/d1-migration/affiliate-policy-guard.mjs` generates the reviewed SQL. It requires exactly the four known permissive policies, matching names/commands/expressions/roles, physical RLS-enabled tables, no FORCE RLS, the existing BYPASSRLS server role with CRUD, and no public membership in that role. It takes both table locks, uses a two-second lock timeout and five-second statement timeout, and compares complete row fingerprints inside the transaction. Unknown drift or an already-applied change refuses; never blindly retry an unknown result.

Only the three true policies change roles. No permanent function, data, ACL, ledger, auth provider, billing, secret or Worker changes occur. `affiliatePolicySql('restore')` is an explicit emergency rollback which reopens the prior exposure. Test it locally; never invoke it automatically or reopen live access merely to demonstrate rollback.

The pinned isolated Postgres proof reproduces public access using synthetic records and the repository table definitions. It proves both public roles see no rows, INSERT fails at RLS, UPDATE/DELETE affect no records, server CRUD remains available, all original rows survive, duplicate application refuses, changed/extra policies refuse atomically, and rollback/reapplication restore exact policy and row fingerprints. First rehearsal found a synthetic unique-key collision in its server UPDATE probe; the corrected probe updates each row without changing its unique partner/date. Corrected proof passes31checks and removes its owned container.

Private receipts under `/home/dev/.local/state/localley/` retain the catalog, zero-row REST confirmation, bypass preflight and local proofs. They contain no exported source records or credentials. The initial live boundary probe passed login/denial/field/GIF/admin checks but incorrectly expected immediate invalidation of all cached cookies. Its failure and successful exact Auth cleanup remain retained; the corrected token-only revocation check must have separate evidence.

## Delivery

Implementation and review are in progress. Live permission changes have not yet occurred. Production remains Worker19b90012/deploymentbe8a200a; preview remains e08db2c5/7cdc7953. Required CI, exact commit/merge, guarded Source application and live readback must be recorded before completion.
