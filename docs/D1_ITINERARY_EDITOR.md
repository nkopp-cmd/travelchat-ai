# Candidate itinerary editor

## Scope

The editor reuses the existing itinerary form and PATCH adapter. It admits only the exact preview host with explicit `data_candidate=d1`, outbox mail and Source read-only mode. Normal www and preview requests without opt-in retain the existing Source flow.

Candidate reads and writes require a verified `@preview.localley.test` user, their exact fresh owner ID and no legacy mapping. Foreign, missing, unverified and legacy owners fail closed. Candidate failures never retry against Source. A mapping added before UPDATE also prevents the write.

The private reader preserves raw activity data. PATCH accepts only the six existing editable fields, bounds actual UTF-8 bytes, validates before normalization and preserves the existing normalization behavior. Coordinates, costs and other saved activity metadata have round-trip tests. The request includes the current preview actor. Errors are private and not cached.

The form retains opt-in on manual save, 30-second autosave and cancel. It locks candidate controls during a pending save and prevents overlapping submissions. Successful candidate saves reset the dirty baseline. Both fields and labels have explicit links.

## Verification and release gates

The focused suite covers full-schema SQLite ownership and metadata preservation, legacy mapping races, malformed input, page routing, denied reads, manual save, autosave, cancel, pending submissions and normal Source transport.

Implementation does not establish hosted acceptance. Keep the PR draft until focused tests, lint, TypeScript, pinned OpenNext build, artifact audit, review and required CI pass. Then use a guarded preview canary with actual reserved owners. Inspect desktop and mobile edits, save and reload; verify second-owner and other denial cases. Record exact fixture cleanup, unchanged Source/admin/production Worker state and an actual preview rollback. Release only to preview. The production data switch remains behind the common cutover gates.

## Resumed verification — 2026-10-17

The October16 hosted attempts proved positive desktop/mobile saves but stopped at denial assertions. They did not complete the feature. Captured anonymous middleware401 has `no-store`, no route marker and `Unauthorized`. Captured foreign403 has the D1 marker, private/no-store and error code `forbidden`. Missing404 retains the D1 marker and code `not_found`; Next.js strengthens its cache policy to `private, no-cache, no-store, max-age=0, must-revalidate`.

The checked-in `scripts/d1-migration/editor-proof-contract.mjs` evaluates these distinct contracts. Its tests retain all three received shapes and refuse public or weaker caches, missing markers, wrong status/error codes and unsupported responses. A stronger framework policy must not fail because of string ordering or extra refusal directives. These offline tests do not replace the real hosted denied cases. PR431 remains draft until its resumed exact-head checks and complete hosted acceptance pass. Production source and both admins remain protected.
