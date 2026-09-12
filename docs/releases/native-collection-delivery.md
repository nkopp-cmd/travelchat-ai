# Native Collection Delivery

## Scope

This increment reuses Localley's collection, confirmation dialog, editor, and bookmark controls with Better Auth and D1.
It targets the existing restricted Cloudflare preview. It does not replace production or complete the full migration.
The primary release record remains `seoul-discovery.md`.

## Delivered Increment

PR https://github.com/nkopp-cmd/travelchat-ai/pull/123 merged into the migration branch at `c5d1446941049bd8663adec1bf6f654e0f4b6cac`.
Cloudflare preview version `7b5ad3c3-f6bf-4bb9-97c9-85e86729bd3a` serves that tagged commit at 100%.
Live metadata, asset hashes, access boundaries, public catalog, maps, and the Trips sign-in gate were verified.
The full production application remains on the preserved Vercel origin.

## Behavior

- Private collection and editor access requires verified authentication and the matching owner mapping.
- Pagination returns at most 25 metadata-only rows and a contiguous cursor.
- Native collection loading enforces 1 MiB responses, 4 MiB total loaded data, 1,000 rows, and 20-second request deadlines.
- Search and sorting remain explicitly limited to loaded pages until pagination completes.
- DELETE requires confirmation, a current session header, no body, and an owner-scoped database operation.
- Repeated or foreign-ID deletion has the same success response without affecting another owner's data.
- Deletion does not refund generation usage or change quotas and event records.
- Successful deletion resets pagination and restores keyboard focus, including the empty state.
- Lost responses remain uncertain; writes never retry automatically.
- Account changes close confirmations and suppress late rows, callbacks, and messages.
- Saved-state reads carry session preconditions as well as mutations.
- Shared plan validation prevents successful native saves that the editor cannot open.
- Both update backends retain recognized wrapper metadata, including safe prototype-named JSON keys.
- The preview Trips entry uses actual root components and contains no fixture-account controls or private fixture payloads.

## Final Local Checks

Completed on 2026-09-12 after yielding to PostLabz's priority release work.

| Check | Result |
| --- | --- |
| Root regression suite | 2,081 passed; five opt-in checks skipped |
| Native package | 93 proof tests and environment isolation passed |
| Actual root-component HTTPS journey | 35 checkpoints passed |
| Actual web-entry and native browser suites | Two tests passed |
| Temporary PostgreSQL snapshot checks | 57 passed |
| Production Next build and TypeScript | Passed |
| Full root lint | Zero errors; 63 warnings |
| Native lint and package checks | Passed |

The full root linter now excludes the separate `.release-worktrees` Git checkout, not any current application source.
The existing warnings remain visible. This is not a zero-warning or clean-dependency claim.
The latest actual-component journey recorded 389 native API dispatches, 373 browser responses, and zero outbound attempts or page errors.
It captured 90 screenshots. Browser runs used the shared installed Chromium executable, without another download.

Independent reviews found no P0/P1 issues. All reported P2 issues were addressed.
The final metadata review verified preservation, prototype safety, and unchanged CAS protection.
The reviews did not authorize bypassing full production migration acceptance.

## Preview Preparation

Read-only provider checks confirmed Vercel Git is disconnected and production still uses `e96b003`.
The preview database held three public spots and no accounts, sessions, saves, or mail jobs.
A mode-restricted SQL backup was restored in memory before migration 0005 was applied to the preview.
Post-migration counts remained unchanged and the itinerary table was empty.
Worker version `88de0da0-0e10-4e4e-9cf7-1f12b4be1c04` remains the code rollback target.
Keep additive schema and any newer data during code rollback; do not overwrite later records with the earlier backup.

## Remaining Cutover Gates

Native creation, generation, sharing, billing, media, remaining private routes, and the complete application router remain unfinished.
No real customer identity or itinerary import has occurred.
Hosted human authentication and recovery must pass through the protected target; a read-only service token cannot substitute for them.
Production data parity, restoration, final synchronization, and operational rollback remain required.
The root dependency audit also needs remediation and deployment-exposure review before full production cutover.
No Vercel deployment, paid generation activation, or customer-data replacement belongs to this increment.
Live signed-in acceptance is still open because the available automation identity is read-only under Cloudflare Access.
Local authenticated journeys are real Better Auth/D1 tests, but are not evidence of hosted human authentication or delivery.
