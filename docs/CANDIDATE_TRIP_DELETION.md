# Candidate trip deletion

## Scope

The API repair admits only the exact preview host with explicit `data_candidate=d1` and the existing isolated flags.
It requires an authenticated verified reserved fresh owner plus the matching `X-Localley-Preview-Actor` header.
Normal preview and www retain the existing Source route. This increment does not enable a new browser delete control.

Each statement repeats exact owner identity, new-owner provenance, absent legacy mapping and no attached media.
The atomic batch detaches conversation links, removes empty trip metadata and deletes the owned trip.
Conversation messages survive. The existing foreign key cascades preview likes.
Any non-null background or story metadata, including an empty object, blocks deletion until object cleanup is accepted.
No R2 objects are touched. Refusals and failures never fall back to Source.

## Verified local checks

Source `6bf96f7cea6749dfbcbf71c2c9ab99cb89832d78`.
The five-suite focused command is:

```sh
npx vitest run __tests__/api/itinerary-delete-candidate.test.ts __tests__/lib/app-data-preview-itinerary-delete.test.ts __tests__/api/itinerary-detail-candidate.test.ts __tests__/lib/app-data-preview-itinerary-detail.test.ts __tests__/api/source-owner-readers.test.ts --maxWorkers=1
```

All50tests pass. Focused ESLint, `tsc --noEmit` and `git diff --check` pass.
The real SQLite verifier loads every current candidate migration and wraps actual statements in BEGIN/COMMIT.
It proves owner isolation, media refusal, legacy/owner/media changes immediately before the batch,
private/public foreign denial, invalid/missing IDs, repeated deletion and preservation of unrelated data.
A terminal delete trigger raises an error; the transaction restores the earlier conversation link and metadata changes.
Route tests prove required actor matching, anonymous denial and explicit intent refusal for each disabled safety flag.
The two flag tests execute the real candidate gate and prove that neither Source nor D1 delete runs.

The focused supplied-diff review reports PASS with no P0/P1 finding. It performs no separate file inspection.
Non-blocking feedback notes that media refusal and concurrent disappearance use the existing403contract.
No new user-facing copy claims why an ambiguous zero-change result occurred.
The fresh public-only pinned `npm run cf:build` passes, with71private values scanned and0artifact hits.
Eight direct cleanup safety cases pass, including foreign conversation/message refusal before any data cleanup.

Native D1 schema inspection confirms only two foreign-key tables reference itineraries:
`legacy_itinerary_media` and `preview_itinerary_likes`; the latter cascades.
`conversations.linkedItineraryId` is the separate history link that the batch detaches.
The first read-only pragma table-valued join was refused with SQLITE_AUTH.
A bounded second read uses sqlite_master and passes; neither probe mutates data.

## Release attempt stopped — 2026-10-17

PR458 merges as `f782e37a2762855ba697be2ff49306372c03d579` with the same tested tree.
Required self-hosted [CI39046048782](https://github.com/nkopp-cmd/travelchat-ai/actions/runs/39046048782) passes15m47s.
The inactive preview upload passes13guards and preserves all33binding definitions.
Candidate Worker: `578f9ef8-5abb-4168-a4c9-acd7805f7789`.
Production Worker3132337f/deployment6a17bf4b remains unchanged.

### First guarded attempt

The1% deployment `c7cff3c9-1758-45cf-9d74-e1c01b7728c1` passes21checks.
Two reserved users complete real signup, outbox verification and verified-session reads.
Foreign public-trip, mismatched-actor and absent-actor DELETE requests return403 with the D1 header.
The anonymous request correctly returns401/no-store from middleware, without the route's D1 header.
The verifier incorrectly requires that header and stops before a positive DELETE.
Middleware line77 confirms the actual contract. No application change is needed for that refusal.
Actual rollback `9a3b268b-2f45-4ba3-9395-54ab52792c56` restores the prior preview66e84452 at100%.
Exact fixture cleanup passes. A read-only reconciliation passes8guards before a bounded second attempt.

### Second guarded attempt

The same uploaded version runs at1% on deployment `dd066121-7f07-4ee0-961e-9410a8c16af5`.
The operator retains the original failed receipts and uses fresh reserved fixtures with a separate safety timer.
The corrected verifier accepts middleware's actual anonymous401contract.
All27preceding checks pass: foreign public-trip, mismatched/absent actor, anonymous, missing and attached-media denials,
with no private subtitle disclosure and unchanged candidate rows after denied requests.
The owned DELETE then returns500/92bytes with the D1 header.
The generic reply does not prove its cause or whether a partial business operation committed before validation.
No successful deletion, history/cascade acceptance, repeat-delete result or default preview promotion is claimed.
The user two-attempt limit stops execution; no third retry occurs.

Actual rollback `a21838f8-a78b-4d10-91b9-7ccb9d5f8941` restores
Worker `66e84452-82e7-4702-9c5c-95cf87e6fdde` at100%.
Both attempts restore all55candidate and8preview Auth business-table hashes/counts, with0foreign-key errors.
Both leases close and both independent safety timer/service pairs stop.
Shared rate counters and mailbox sequences remain monotonic; they are not reset.
Fresh stopped-release verification passes23guards, preserving all48Source full-row hashes,
production Auth counts, both full administrator rows, all33inactive-candidate bindings and the original production deployment.
Both hosts return200 with complete root/sign-in/city API bodies. Preview keeps0cron schedules.

Private `d1-delete-{local-checks,build,review,ci,upload,reference-check,safety-test-final,hosted-attempt1,hosted,retry-reconciliation,fixture-cleanup-attempt1,fixture-cleanup,stopped-final}` receipts
and the inert full-source helper archive retain the exact tests, failures, rollback and cleanup evidence.
The candidate remains inactive for diagnosis. This feature is not accepted or released as default preview.
No production data switch, Source mutation, R2 operation, provider call, external email or payment occurs.
Remaining D1/R2 routes, media parity, full current-data rehearsal, production rollback/canary and final switch remain open.
Supabase is still required.
