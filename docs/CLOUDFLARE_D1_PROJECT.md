# D1 application data migration

## Baseline — 2026-09-23

Public `www.localley.io` runs the OpenNext `localley-next` Worker. Better Auth uses production D1 `AUTH_DB`.
Application records still live in Supabase. The apex redirects to www.

Nils chose path A for **application data**, not a replacement app. Keep the full live Next.js UI and migrate its repositories to D1 one feature at a time.
The older `cloudflare/full-migration` branch is preserved as a native proof and import reference.
A bulk merge into production main was attempted on a scratch branch and aborted. It included 22 removed Clerk references and changes to the stable story pipeline.
Work proceeds from current production `main`; move only tested migration components from PR151.

## First candidate-only binding

The OpenNext **preview environment alone** has `APP_DATA_PREVIEW_DB` bound to the existing EU native preview D1 `localley-migration-preview`.
This binding is separate from `AUTH_DB` and the cache D1. Production has no application-data D1 binding.
`lib/app-data/preview-db.ts` offers two count-only reads from that binding. The adapter refuses non-preview environments or a missing binding.
The preview D1 currently holds eight pilot spots and zero legacy import batches. These counts do **not** establish migration parity.
No production query, import, write, public route, DNS, or Worker version is changed by this first code increment.

## Approval and gates

Nils approved the freeze, final import and live D1 switch on 2026-09-23 at 19:15 UTC, **conditional** on all three checks:

1. Full import rehearsal on current source data passes with zero mismatches.
2. A written rollback restores the Supabase path within minutes, and the rollback is tested.
3. A 1% Worker version override canary passes real signed-in sign-in, trips, saves, chat, checkout session and cron journeys.

Retain both admin user IDs through the migration: `user_38VRkLQbwVNbAqR9lBXTMGXr54h` and `eRrDwrrwjwO1YsxVlci7M6mMjjqPtyYx`.
Do not link accounts by email. Never drop or delete Supabase data until D1 has operated for at least seven problem-free days.
Avoid paid API probes this week. Do not send preview changes to `localley-next` or `www.localley.io` before release checks.

See `docs/CLOUDFLARE_OPENNEXT.md` section 6 for the active Worker, `docs/AUTH_BETTER_AUTH.md` section 7 for user identities, and `shared/plans/localley-full-cutover.md` for progress.
