# Snapshot RPC Verification

## Scope

Migration: `supabase/migrations/20260911104013_save_itinerary_snapshot.sql`.

The route sends snapshots through `POST /rest/v1/rpc/save_itinerary_snapshot`.
It keeps the Clerk ownership read with `select("*")`.
The RPC compares five saved fields in one atomic update.
It returns zero rows for a stale snapshot.
The route returns 409 only when the RPC returns no row without an error.
Missing function errors return 503 with a migration-required message.
Permission errors return 403. Other database errors return 500.
The route has no fallback write path.

The function uses `SECURITY INVOKER` and an empty search path.
It checks the JWT subject in the update, in addition to existing RLS.
Only `authenticated` receives an explicit execution grant.
The function revokes execution from `PUBLIC` and `anon`.
It updates only title, city, activities, highlights, and estimated cost.
Extra payload keys cannot change identity or other columns.

Both snapshots require all five keys.
Text fields accept only strings or nulls.
Highlights accept only string arrays or nulls.
Replacement title and city cannot be null.
Replacement activities must be an object or array.
Expected activities preserve raw JSONB values allowed by the existing schema.
JSONB `null` differs from SQL NULL and remains a valid existing activities value.
The function preserves SQL NULL highlights, empty arrays, and escaped strings.

## Commands

Run from the app directory. Run these commands separately to preserve resource serialization.

```sh
/home/dev/projects/CyberLink/shared/scripts/run-heavy.sh node --test scripts/itinerary-rpc/verify.test.mjs
/home/dev/projects/CyberLink/shared/scripts/run-heavy.sh npx vitest run __tests__/api/itinerary-update-snapshot.test.ts --maxWorkers=1
/home/dev/projects/CyberLink/shared/scripts/run-heavy.sh npx eslint 'app/api/itineraries/[id]/update/route.ts' __tests__/api/itinerary-update-snapshot.test.ts scripts/itinerary-rpc/verify.test.mjs
```

The database test requires `/usr/lib/postgresql/18/bin` and `/usr/bin/psql`.
It refuses to run as root.
It verifies the approved scratch parent before creating a fresh random `rpc-*` directory.
It uses the current system user and a private UNIX socket.
It disables TCP and rejects host authentication.
It does not read database credentials or contact Supabase.
The cleanup hook stops PostgreSQL and removes only its generated directory.

The fixture extracts the itinerary table directly from `supabase/schema.sql`.
It extracts the exact itinerary policies from `supabase/rls-policies.sql`.
It supplies only the referenced `users.id` table subset.
The local `auth.jwt()` helper reads `request.jwt.claims` for fixture sessions only.
Every user query explicitly sets `authenticated` or `anon`.
These roles have neither superuser access nor permission to bypass RLS.
The concurrency test observes a real row-lock wait between two PostgreSQL sessions.

## Documentation

Reviewed on 2026-09-11:

- https://supabase.com/changelog.md
- https://supabase.com/docs/guides/database/functions.md

The relevant function guidance recommends invoker security, schema qualification, and explicit execution grants.
The reviewed changelog has no breaking change for this existing-table RPC.
The local CLI was absent from PATH and unavailable through `npx --no-install supabase`.
The migration filename uses the UTC timestamp from `date -u`.
No CLI package was installed.

## Results

Native PostgreSQL verification passed: 57 tests on PostgreSQL 18.6, Ubuntu package `18.6-0ubuntu0.26.04.1`.
The fixture created and removed `/home/dev/projects/CyberLink/codex-work/tmp/opencode/rpc-ZfKG1K`.
The database had no TCP listener.

The first database attempt found a JavaScript quotation error before cluster creation.
The corrected runner passed all database tests.
The first API run found that POST `maybeSingle()` expects a singular server response.
The route now consumes the RPC row array directly.
API verification passed: 25 tests with the real Supabase SDK and a mocked HTTP transport.
The transport tests cover 42-stop and 56-stop Korean plans with a constant short POST URL.
They also cover 428, 400, 401, 403, 409, 500, and missing-function 503 responses.
Targeted ESLint and `git diff --check` passed.
The parent subsequently passed the complete TypeScript check and optimized Next.js production build.
The final application suite passed 1,860 tests with four optional checks skipped.

The migration remains unapplied to live Supabase.
No production data, credentials, deployments, or paid services are involved.
