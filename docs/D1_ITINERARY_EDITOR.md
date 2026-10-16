# Candidate itinerary editor

## Scope

The editor reuses the existing itinerary form and PATCH adapter. It admits only the exact preview host with explicit `data_candidate=d1`, outbox mail and Source read-only mode. Normal www and preview requests without opt-in retain the existing Source flow.

Candidate reads and writes require a verified `@preview.localley.test` user, their exact fresh owner ID and no legacy mapping. Foreign, missing, unverified and legacy owners fail closed. Candidate failures never retry against Source. A mapping added before UPDATE also prevents the write.

The private reader preserves raw activity data. PATCH accepts only the six existing editable fields, bounds actual UTF-8 bytes, validates before normalization and preserves the existing normalization behavior. Coordinates, costs and other saved activity metadata have round-trip tests. The request includes the current preview actor. Errors are private and not cached.

The form retains opt-in on manual save, 30-second autosave and cancel. It locks candidate controls during a pending save and prevents overlapping submissions. Successful candidate saves reset the dirty baseline. Both fields and labels have explicit links.

## Verification and release gates

The focused suite covers full-schema SQLite ownership and metadata preservation, legacy mapping races, malformed input, page routing, denied reads, manual save, autosave, cancel, pending submissions and normal Source transport.

Implementation does not establish hosted acceptance. Keep the PR draft until focused tests, lint, TypeScript, pinned OpenNext build, artifact audit, review and required CI pass. Then use a guarded preview canary with actual reserved owners. Inspect desktop and mobile edits, save and reload; verify second-owner and other denial cases. Record exact fixture cleanup, unchanged Source/admin/production Worker state and an actual preview rollback. Release only to preview. The production data switch remains behind the common cutover gates.
