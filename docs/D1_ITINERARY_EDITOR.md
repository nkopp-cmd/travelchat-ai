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


## Preview delivery — 2026-10-17

[PR431](https://github.com/nkopp-cmd/travelchat-ai/pull/431), tested source `f587e2c5c8f0bf8c0b2694f1968fa6181ad9365d`, passed required self-hosted [CI38990695820](https://github.com/nkopp-cmd/travelchat-ai/actions/runs/38990695820) in19m22s. Merge `0f9a72965d54bf022e44f920185c21921356b698` has the same tree. Earlier server/client reviews remain resolved; the resumed bounded helper review approved release with no unresolved P0/P1. Its first attempt reached its eight-tool-turn limit without a verdict; the second reviewed one readable source bundle.

Exact local editor command:

```sh
npx vitest run __tests__/api/itinerary-update-candidate.test.ts __tests__/app/itinerary-detail-candidate-page.test.tsx __tests__/app/itinerary-edit-candidate-page.test.tsx __tests__/components/itinerary-edit-candidate-form.test.tsx __tests__/lib/app-data-preview-itinerary-editor.test.ts __tests__/lib/app-data-preview-itinerary-update.test.ts --maxWorkers=1
```

All38tests pass. `node --test scripts/d1-migration/editor-proof-contract.test.mjs` passes5tests. Full-schema local fixture preflight passes8checks. Focused ESLint, `npx tsc --noEmit`, pinned `npm ci --no-audit --no-fund` and `npm run cf:build` pass. Artifact tree `7c401264f32922ca68d497138ec2e90f6f271bea83e737b695a4950b4a1d8ebc` scans2325files and94private values with0hits; five existing server aliases of the public Kakao key remain unchanged. Required CI also passes the installed-SQL quota20checks and existing regressions.

### Worker and rollback

Preview `localley-next-preview` runs `e08db2c5-5788-4fbb-94d8-3bd373f33420` at100%, deployment `7cdc7953-3640-499f-93fb-1d6b8a90e3aa`. Its33binding definitions match prior version `6d621d4b-0747-4ace-afe9-14b987402037`. Outbox mail, Source read-only, false beta/bypass/generation settings and absence of the Source service-role binding remain intact.

Actual1% canary `22cb6754-d1ac-4e89-9f00-cf6b10178e04` passes60checks. Tested rollback `f76bb5bc-a2f5-45a8-957a-42edd19e2874` restores prior version6d621d4b at100% before merge and promotion. The default preview then passes60checks. Both external recovery timers are stopped. Each window's ten offline recovery checks cover changed deployment refusal, signal handling before browser launch, unknown-POST delayed readback and cleanup recovery. To roll back this feature, restore6d621d4b at100%, then verify preview health, settings and owned state. No SQL migration was applied. This feature drill does not replace the full data-cutover rollback test.

### Real hosted acceptance

Two reserved, verified outbox accounts prove desktop1440x900 and mobile390x844 manual edits, durable reload, desktop autosave, metadata round trips, cancel and one write per explicit action. Both actual owners have successful writes. Coordinates, costs, custom activity fields, subtitle and local score persist. The browser reports no runtime error or horizontal overflow. All8canary/default top/lower screenshots were opened and inspected.

Anonymous API requests return middleware401/no-store without a D1 marker. Foreign403 and missing404 retain the D1 marker, private/no-store and their exact error codes; framework-strengthened404 caching is accepted. Actor mismatch, unverified and legacy-mapped owners are denied. Full hashes of both controlled itinerary rows match before and after all denied writes. Private page statuses can be200 for streamed notFound; their saved bodies contain no private form or fixture titles. An anonymous page redirects to sign-in. The normal unopted preview request does not expose a candidate form; production anonymous routing remains unchanged.

A separate default-only browser probe checks the actual rendered denial UI for foreign, missing, anonymous, unverified and legacy cases on both sizes:10cases/74checks pass. It asserts visible404 or the actual email sign-in field, no private editor content and no overflow. Its first attempt timed out waiting for networkidle on an unverified page; exact cleanup passed. The second uses DOMContentLoaded plus explicit visible controls and saves markup/status before assertions, including failure evidence. Four successful denial/sign-in screenshots were opened and inspected. The standard white404 and faint navigation are recorded as later product work, not a privacy failure.

Each run restores all56candidate table counts, removes exact fixture itineraries and fresh/legacy owners, clears both accounts/sessions/users/outbox and restores verification count. Foreign-key checks return0. The synthetic legacy mapping uses its own owner with hasSourceProfile0 and references the existing canonical batch. It never inserts or deletes import batches; the full import-manifest hash stays unchanged. Selected Source users8/subscriptions5count/hash snapshots and both admin IDs stay unchanged. Production stays `19b90012-a85c-426c-a40e-9323ffaa5370` / `be8a200a-16dc-42a7-9435-f5195356475d`. No Source write, external email, paid provider or payment occurs.

### Retained proof and limits

Private host receipts under `~/.local/state/localley/`: `d1-editor-resume-artifact-20261017.json`, `d1-editor-resume-fixture-preflight-20261017.json`, `d1-editor-resume-bindings-20261017.json`, `d1-editor-hosted-resume-20261017.json`, `d1-editor-default-hosted-resume-20261017.json`, `d1-editor-preview-window-state-resume-20261017.json`, `d1-editor-resume-preview-promotion-state-20261017.json`, `d1-editor-default-hosted-denial-ui2-20261017.json`, screenshot inspection receipts and exact CI log. Earlier failed receipts remain separate.

This is reserved fresh-owner preview acceptance. Real historical-owner parity, all-owner notification activation, Source/media migration, full current-data rehearsal and production cutover remain open. Production keeps Supabase. The two real admin IDs and seven-day retention fence remain unchanged.
