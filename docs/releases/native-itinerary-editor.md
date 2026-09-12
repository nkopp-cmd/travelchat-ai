# Native Itinerary Editor

## Status

Verified locally on 2026-09-11. No live migration or deployment occurred.
The existing editor now works with Better Auth and native D1 through an explicit adapter.
The Next pages retain Clerk and the current backend until the complete migration passes its release gates.

## Native Contract

Migration: `cloudflare/auth-proof/migrations/0005_itineraries.sql`.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/itineraries` | Owned summaries and `nextOffset`; activity plans are excluded. |
| `GET /api/itineraries/:id` | Complete decoded private row, scoped to the authenticated owner. |
| `PATCH /api/itineraries/:id/update` | Existing five-field snapshot contract and matching session precondition. |

Collection pages default to 25 rows and accept at most 25.
The encoded response budget is 1 MiB, including its envelope.
Pagination returns a contiguous prefix and advances by the actual number returned.
An oversized first summary returns 413 rather than disappearing.
Clients must follow `nextOffset`; pages do not provide a cross-request snapshot.

PATCH permits 512 KiB of UTF-8 data. Authentication and other existing small-body routes retain their 16 KiB limit.
The body deadline remains enforced. Invalid or excessively deep JSON fails before a write.

Every query binds the trusted session's owner ID.
Foreign and missing itinerary IDs produce identical 404 responses.
A session header never acts as a credential.
Supplied stale headers return `session_changed` before the client interprets an unlinked account's setup state.
Unverified users still fail first. Missing required headers do not grant access.

## Atomic Saves

The service compares the client snapshot to decoded stored values.
Object-key order does not matter; array order, scalar types, and null values remain significant.
One conditional UPDATE then checks all five original raw values, itinerary ID, and owner ID.
Binary, null-safe comparisons prevent a later write from replacing a changed snapshot.
The service returns the saved row from that same UPDATE.

A concurrent raw JSON rewrite can conservatively conflict despite equivalent content.
Snapshot equality permits an A-to-B-to-A sequence; this is not a revision counter.
Native JSON comparison uses JavaScript number semantics. Historical numeric and timestamp precision still need import review.

Only title, city, activities, highlights, and estimated cost change.
Numeric day count, owner, subtitle, score, timestamp, status, and favorite metadata remain unchanged.
Optional-field behavior matches the existing route: omitted highlights become `[]`; omitted or empty cost becomes null.

## Existing Editor

`ItineraryEditor` contains the original editing UI and state handling.
`EditForm` remains its Clerk/Next wrapper and checks the server row's owner against the current session.
`NativeItineraryEditor` loads owned native data and supplies the native save operation.
Neither wrapper can reuse a previous account's draft after an identity change.

The native wrapper checks returned IDs, ownership, plan structure, and bounded JSON before displaying data.
It supports structured plans and valid persisted JSON strings while retaining the original expected snapshot.
Unsupported legacy shapes remain blocked rather than silently discarded.

Snapshot conflicts retain the draft and stop automatic saves.
Identity faults close the editor without claiming that a removed draft remains available.
Late responses cannot show stale success messages or restore private data.
Normal same-identity SDK background refresh preserves an unsaved draft.

Activity keys now follow their objects rather than array indices.
Inserting or moving a place no longer transfers pending edits to another activity.
Internal keys never enter saved payloads. The editing drag handle remains available to the drag library.

## Verification

- Full root suite: **1,974 passed**, four optional checks skipped.
- Native package: **77 proof tests passed**, plus environment isolation, types, lint, build, and package checks.
- Actual root-component HTTPS journey: **23 checkpoints passed**.
- Latest journey: **252 native dispatches**, **243 browser responses**, zero outbound attempts, zero page errors.
- Captured 48 screenshots at 390, 900, and 1440 pixels and reviewed editor states across those widths.
- Standalone native browser suite: **two tests passed** and 19 screenshots reviewed.
- Root production build, TypeScript, scoped ESLint, and whitespace checks passed.

Native tests cover concurrent saves, each stale field, JSON ordering, nulls, UTF-8 limits, summary budgets, and database faults.
The actual editor journey uses two temporary private trips seeded only from trusted Node code.
It verifies placement, save, reload, notes, coordinates, immutable metadata, conflicts, revocation, and account changes.
Private fixture values are absent from the browser bundle.
Held responses remain real Worker responses, not substituted authentication or persistence results.

Evidence:

- `scripts/better-auth-integration/README.md`
- `test-results/better-auth-integration/evidence.json`
- `test-results/better-auth-integration/full-suite.json`
- `test-results/cloudflare-frontend/`
- `cloudflare/auth-proof/test/itineraries.test.mjs`

The stale catalog assertion was updated to the exact current DTO shape.
A stale-session ordering failure led to a product fix, not a relaxed ownership assertion.
The native unit expectation now checks that explicit stale headers differ from missing or current headers.
The old standalone `failure.png` is historical and is not current failure evidence.

## Remaining Migration

Native creation, generation, deletion, sharing, media, billing, and complete server-page routing remain unfinished.
No customer itinerary import has occurred. Historical field coverage, precise values, and restoration still require rehearsal.
Live Better Auth cutover also requires the existing identity, recovery, dependency, and account-migration gates.
Do not replace the full live app with the limited preview or deploy to Vercel.
