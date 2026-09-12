# Private Production Adapter

## Scope And Gates

- [x] Keep preview importer, sync command, and timer sources untouched.
- [x] Require explicit production target and the exact configured Supabase origin.
- [x] Reuse native-v1 validation without paid calls or social ingestion.
- [x] Implement private transaction, receipts, permanent identities, and explicit review manifests.
- [x] Read live schema metadata and only the thirteen official Seoul name filters.
- [x] Run adapter unit tests.
- [x] Pass the real PostgreSQL/PostGIS suite through the pinned Docker backend; no local PostgreSQL installation required.
- [ ] Verify live SQL catalog constraints and service-role privileges. Database and Management API credentials remain unavailable.
- [x] Parent generated the unapplied release migration with official Supabase CLI 2.117.0 from the shared cache.
- [ ] Complete independent parent review before any production write.

This subtask made no production writes, publication changes, scheduler changes, Vercel changes, or Git changes.
The additive SQL is a generated, unapplied migration at `supabase/migrations/20260912090631_native_scrapelet_production_ingest.sql`.
The release remains at draft stage until live SQL catalog checks pass, a private backup is prepared, and the parent approves activation.
Generating the migration does not apply it to production or satisfy those gates.
Ingest starts disabled in its private metadata record. Installation alone does not activate ingest.
Public publishing has no implementation. Identity approval does not approve photographs, rights, or public rendering.

## Files And Exports

| File | Purpose |
| --- | --- |
| `scripts/native-production.mjs` | Target verification, versioned batch preparation, one-RPC apply, filtered private review report |
| `scripts/native-production.test.mjs` | Unit tests with mocked transport; no production writes |
| `scripts/native-production-postgres.test.mjs` | Isolated pinned Docker PostGIS or existing local PG18; removes only its own fixture afterward |
| `supabase/migrations/20260912090631_native_scrapelet_production_ingest.sql` | CLI-generated, unapplied private schema and invoker RPC; installation defaults disabled |
| `supabase/native-production.rollback-draft.sql` | Disable ingest and revoke RPC access without deleting identity bindings |
| `supabase/native-production-recon.sql` | Read-only catalog and Seoul geography inspection for the parent |
| `docs/native-production-adapter.md` | Contract, evidence, blockers, and parent handoff |

Adapter exports: `ORIGIN`, `TARGET`, `sha256`, `verifyTarget`, `prepareProductionBatch`, `requestProduction`, `ingestProduction`, `readProductionReview`.
SQL exports: `public.native_production_ingest(text,text,text,text)` and private `native_private.assert_schema()`.
Private tables: `metadata`, `identity_registry`, `candidates`, `review_bindings`, `receipts` in `native_private`.

## Commands

Run from the repository root. The CLI quietly loads existing `.env.local` values without replacing process environment values.
It requires `NEXT_PUBLIC_SUPABASE_URL` to equal `https://llehrhqeolfprutcaopi.supabase.co` exactly.
Missing targets, alternate projects, localhost, preview origins, and redirects fail closed.
Credentials never enter command arguments or error output.

```sh
node scripts/native-production.mjs --target production-supabase --input private-export.json
node scripts/native-production.mjs --target production-supabase --input private-export.json --review --out private-review.json
```

The first command makes no network request. The second reads only metadata and filtered spots.
Review output uses exclusive creation and mode `0600`. Use an existing private directory outside Git.
Names only identify possible review candidates. The report never approves or automatically binds a UUID.
The review reader pins thirteen provider/name pairs. It rejects other names before querying production.
Every spot query requires Seoul in the English address and one exact official English name.
It selects only ID, name, address, location, Google identity, destination, and local area.
It never reads private users, accounts, itinerary contents, or `discovered_by` values.

The input requires `schemaVersion: "localley-native-v1"`, `citySlug: "seoul"`, `publicationReady: false`,
`collection.paidProviderCalls: 0`, and `places`. Use the existing versioned collector export.
The implementation does not add another feed downloader or scheduler.
The read-only follow-up used exactly 25 job IDs from the staged feed with the existing `/api/localley/export` endpoint.
Its unchanged versioned response contains 13 places, original observation timestamps, and the API's collection metadata.
The export and CLI review are stored with mode `0600` under ignored `cloudflare/auth-proof/.preview-private/`:
`production-followup-export.json`, `production-followup-export-scope.json`, and `production-followup-review.json`.
No timestamp or paid-call claim was synthesized. No credential was persisted in these evidence files.
This repository is public even though the database tables are private. Never add credentials, real private payloads,
approval artifacts, or signed image URLs to tracked files. Static SQL/payload test fixtures use synthetic data only.

Future parent-only apply command, **not executed in this subtask**:

```sh
node scripts/native-production.mjs --target production-supabase --input private-export.json --manifest private-bindings.json --apply
```

Omit the manifest to ingest evidence without any UUID binding.
Apply calls one RPC. It never performs sequential REST writes.

## Transaction Contract

The invoker RPC requires `service_role`, explicit target, pinned origin, matching metadata, and parent activation.
A transaction advisory lock serializes candidate writes, concurrent retries, cap checks, and receipt maintenance.
The function checks the root `public.geography(Point,4326)` type and exact geography constraint definitions.
Unknown or missing schema stops the transaction. There is no fallback to preview or older schemas.

Batch limits: 8 MiB, 1,000 distinct observations per transaction, 32,000 bytes per payload, and four private image references.
Permanent source identities have a 5,000-row cap. Candidates do not expire; receipts expire after fourteen days during successful ingestion.
Permanent identities and approved bindings never enter retention deletion.
The service role cannot update or delete permanent registry rows or approved bindings through their grants.
RLS and explicit revocations deny `PUBLIC`, `anon`, and `authenticated` access to every private table and RPC.
The private schema must remain outside exposed Data API schemas. No view exposes evidence.

The batch hash covers UTF-8 bytes of the exact serialized envelope.
Each payload hash covers UTF-8 bytes of its exact serialized record. PostgreSQL recomputes both hashes.
Equal timestamps with different payload bytes raise a deterministic conflict and roll back the whole batch.
The adapter checks hashes for every source/timestamp pair before selecting the newest observation.
Conflicting older observations still reject the input when a newer observation appears first.
Identical duplicate payloads are accepted; input order cannot hide a conflict.
Older observations cannot replace newer evidence. Identical retries cannot change public data.
All errors roll back candidates, registry entries, bindings, and receipts together.
No function writes to public spots, public relationships, Google IDs, photos, translations, quality fields, or geography.
Visit Seoul identities remain source keys. They never populate `google_place_id`.

## Explicit Identity Manifest

The manifest is an array. Each choice must contain every field below.
`expected` uses the exact existing public snapshot, including all localized name/address values and null geography IDs.
`location` is the exact PostGIS hex string returned by the Data API, not rounded coordinates.
An approved choice preserves the public UUID and stores only a private binding.
The adapter normalizes `spotId` to lowercase before duplicate checks, batch hashing, and manifest serialization.
The RPC independently canonicalizes that UUID before duplicate checks, immutable manifest comparison, and insertion.
Uppercase/lowercase UUID retries preserve the same binding. All other manifest fields remain subject to exact comparison.
Expected destination/local-area IDs remain unchanged as part of the exact public snapshot.
Direct RPC receipts still hash the exact submitted envelope; case variants may have separate receipts but identical binding semantics.

```json
[
  {
    "sourceKey": "english.visitseoul.net:visit-seoul:73",
    "spotId": "REVIEWED-EXISTING-UUID",
    "identityApproved": true,
    "sourceDomain": "english.visitseoul.net",
    "sourceUrl": "EXACT-CANDIDATE-OFFICIAL-SOURCE-URL",
    "expected": {
      "name": { "en": "Gyeongbokgung Palace" },
      "address": { "en": "EXACT-EXISTING-ADDRESS" },
      "location": "EXACT-EXISTING-POSTGIS-HEX",
      "google_place_id": "EXACT-EXISTING-VALUE-OR-NULL",
      "destination_id": null,
      "local_area_id": null
    }
  }
]
```

These placeholders are not a valid approval file. No production manifest was approved or created.
The live spots schema has no source URL/domain column. Source expectations therefore apply to private official evidence.
The manifest separately pins the existing Google ID without treating it as a Visit Seoul ID.
The RPC locks and compares the public snapshot, then checks Seoul coordinates and destination/local-area membership.
Its `FOR SHARE` row lock requires SELECT privileges and UPDATE privilege on at least one spots column.
The disposable fixture uses the minimal `UPDATE(id)` grant. The RPC executes no public UPDATE.
`service_role` bypassing RLS does not bypass SQL grants.
The read-only recon file reports public schema usage, required SELECT privileges, `UPDATE(id)`, and any-column UPDATE capability.
Live acceptance must explicitly verify these grants; it must not infer them from service-role authentication.
Only exact official names can pass this initial mapping path. Name variants need separate parent review, not fuzzy matching.
A changed snapshot, source URL, domain, destination, local area, or permanent binding fails the whole transaction.

## Sanitized Live Evidence

Read-only inspection on 2026-09-12 verified the real `.env.local` origin against project `llehrhqeolfprutcaopi`.
Authenticated OpenAPI retrieval returned HTTP 200. No credential values were printed.
Confirmed formats: `id` UUID; `name` and `address` JSONB; `location` root-schema PostGIS geography Point/4326;
`google_place_id` text; `destination_id` and `local_area_id` UUID.
All six geography tables appear in live metadata. No native table or ingest RPC appeared.
OpenAPI is insufficient to prove composite foreign keys or validation state. Live SQL catalog verification remains blocked.

The thirteen exact official-name queries returned these possible UUIDs:

| Official venue | Existing UUID candidate | Review status |
| --- | --- | --- |
| Dongdaemun Design Plaza (DDP) | `ccca2adf-3646-47e6-93ec-1df153b10b9c` | Unreviewed, ambiguous |
| Dongdaemun Design Plaza (DDP) | `c6a455dc-4b18-4e29-a36b-7430f2ba8f3b` | Unreviewed, ambiguous |
| Gwangjang Market | `7f258ce1-b46c-4ab7-96ce-02a5fe5d6b67` | Unreviewed |
| Gyeongbokgung Palace | `cbd403a4-1912-45b8-8ae1-fc13b4c2f1e5` | Unreviewed |

All four returned rows currently have null destination and local-area IDs.
The other ten official names returned no exact-name candidate. This does not prove those venues are absent.
No name, proximity, or source-based automatic match was approved.

## Verification And Blockers

```sh
NATIVE_POSTGRES_BACKEND=docker NATIVE_REQUIRE_POSTGIS=1 HEAVY_LOCK_WAIT_SECONDS=180 /home/dev/projects/CyberLink/shared/scripts/run-heavy.sh node --test scripts/native-production.test.mjs scripts/native-production-postgres.test.mjs cloudflare/auth-proof/test/native-import.test.mjs
```

This is the required gate: explicit Docker backend, real PostGIS required, and zero skipped tests.
The Docker backend passed the prior 32-check run on 2026-09-12, superseding the initial local-extension blocker.
The independent-review fixes add conflict permutations, UUID-case retries and duplicates, and explicit row-lock privilege checks.
The earlier combined rerun passed 117 tests, with zero failures and zero skips.
It includes 16 adapter unit tests, 16 PostGIS subtests plus their parent test, and 84 current preview regression tests.
Runtime evidence: Node 22.22.1, PostgreSQL 17.5, PostGIS 3.5.2. The runner removed its owned container and fixture directory.
The uppercase retry test bypasses the receipt shortcut. New-observation preservation is checked inside the transaction before rollback.
After switching the fixture to the CLI-generated migration, the owned adapter unit and real Docker PostGIS suites
passed all 33 tests with zero failures and zero skips. The serialized disk guard reported 4,263 MiB free before starting.
That follow-up ran only the two adapter test files, using the same required backend and cached image settings:

```sh
NATIVE_POSTGRES_BACKEND=docker NATIVE_REQUIRE_POSTGIS=1 HEAVY_LOCK_WAIT_SECONDS=180 /home/dev/projects/CyberLink/shared/scripts/run-heavy.sh node --test --test-reporter=spec scripts/native-production.test.mjs scripts/native-production-postgres.test.mjs
```

The image is pinned rather than resolved from a mutable tag:

```text
postgis/postgis@sha256:01a6a70e41e6c4467c8f55f6063555ed72db2d6662cd0d571040d42eadaeb6f6
```

This is the existing `17-3.5` PostGIS image. The runner uses `--pull=never` and fails if that image or Docker is unavailable.
It does not install local PostgreSQL/PostGIS, replace images, or silently fall back to another backend.
The disposable runner never consumes a production database URL or inherited PostgreSQL connection variables.
Docker runs without networking or published ports, with a private Unix socket and an owned disk-backed fixture directory.
Limits are 1 GiB memory, two CPUs, and 128 processes; capabilities are dropped and privilege escalation is disabled.
Cleanup stops only the owned container and removes only its fixture directory. Other images and containers remain untouched.
It tests roles and RLS, concurrent retries, timestamp conflicts, rollback, hashes, caps, manifest checks, receipt retention,
unchanged public spots and relationships, missing geography constraints, and operational rollback without binding deletion.

The remaining live access blocker is missing database or Management API credentials for SQL catalog and privilege verification.
The parent confirmed that application and shared keys contain no Management token, database URL, or database password.
Service-role REST access and the exact origin are available, but cannot establish all catalog constraints and grants.
Official Supabase CLI 2.117.0 is installed in the shared cache; CLI installation and Docker PostGIS are not blockers.
Disposable SQL verification does not replace this live gate. Parent review and production activation remain separate release steps.
No retired app was started. No local dependency was installed. No paid service was called.

Current Supabase documentation reviewed: changelog, database functions, and row-level security.
Relevant guidance requires explicit function revocation, invoker security, private schema isolation, and real RLS tests.

## Parent Apply And Rollback

1. Pass the real PostGIS suite and independent review before production installation.
2. Obtain authorized SQL access and run `supabase/native-production-recon.sql` read-only against the verified project.
3. Compare catalog definitions with `native_private.assert_schema()` and verify recon privilege results, including row-lock UPDATE capability.
4. Use the parent's official Supabase CLI 2.117.0 from the shared cache; inspect command help before any future apply.
5. Review the already generated, unapplied migration `supabase/migrations/20260912090631_native_scrapelet_production_ingest.sql`. Do not generate a duplicate migration.
6. Prepare a private schema backup and rehearse restoration on disposable PostGIS, including permanent identity bindings.
7. Install the additive migration on the verified project. Confirm private schema exposure, grants, RLS, and disabled metadata.
8. After parent ingest review, activate only `native_private.metadata.ingest_enabled` through the authorized migration process.
9. Run the dry run and private match review. Approve exact manifests separately, then run the explicit apply command.
10. Verify private receipts and public snapshot equality. Do not report publishing success.

Operational rollback uses `supabase/native-production.rollback-draft.sql` under the same advisory lock.
It disables ingest and revokes RPC execution. It preserves evidence and permanent identity bindings.
Retained bindings keep their `ON DELETE RESTRICT` foreign key to public spots, including after operational rollback.
Deleting a referenced public spot therefore remains blocked. This deliberately preserves approved identities and their UUID references.
Rollback is not permission to delete or reassign those bindings. Any future retirement policy needs explicit parent review.
Do not drop the private schema after identity approval or restore stale bindings over newer approvals.
Public rights, asset provenance, and the main renderer acceptance remain separate, unimplemented publication gates.
