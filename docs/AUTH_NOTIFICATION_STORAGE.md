# Notification storage on Auth D1

## Scope

This is an independent, additive feature store. It does not import existing Source data or complete the application migration.
The current Source project has no `notifications`, `notification_preferences`, or `push_subscriptions` tables.
The read-only inventory proves current physical absence; it does not prove that no deleted archive or external history exists.

The three new tables use canonical Better Auth `user.id` values and `ON DELETE CASCADE`.
Neither an email address nor an ID prefix grants ownership. Migrated and opaque IDs follow the same rule.
Every SQL operation checks the physical user's verified status. No Source owner mapping or profile sync is required.
Every preference defaults to false. Reading defaults does not create a row or infer consent.

The store exposes no notification producer or sender. Push storage cannot send messages.
Existing dormant triggers, external push delivery, and email delivery remain inactive.
Existing preview candidate storage and all other Source features retain their behavior.

## Foundation and activation are separate gates

PR441 added the migration and an unused store. Source333ae736 passed exact CI39007525997 and merged13f44792 with the same tree.
Independent supplied-code review approved the inactive SQL/store with no P0/P1 findings.
This merge did not apply the migration, activate production storage, or deploy a Worker.

The routing follow-up introduces `AUTH_NOTIFICATION_STORAGE` on the actual Worker environment:

| Mode | Read behavior | Write behavior |
| --- | --- | --- |
| Missing or `off` | Existing legacy path; preview candidate still runs first | Existing legacy path |
| `readonly` | Canonical verified Auth D1 owner | Refused; saved data stays readable |
| `active` | Canonical verified Auth D1 owner | Bounded, owner-scoped D1 writes |
| Invalid value or unavailable selected store | Generic private503 | Generic private503 |

The top-level preview configuration stays `off`. The production configuration declares the final `active` variant.
The release must first upload and verify a `readonly` variant from the same artifact.
That version becomes the compatible rollback floor before any active storage writes.
Then use the active variant through an explicit version-override canary and a tested rollback to the read-only floor.
Do not deploy the production configuration directly before these gates pass.
The release record identifies the actual live variant and rollback version.

The adapter accepts only allowed HTTPS hosts, matching verified sessions, and current physical verified users and unexpired sessions.
It checks same-origin writes and an optional initiating-owner assertion. Stale account actions cannot act on a different signed-in owner.
Selected-store responses are private and never cached. Selected-store errors never return to Source.
The client hides old-owner state immediately, ignores stale responses, preserves paging after deletion, and clears data after logout.
Read-only controls are disabled. The UI states that external delivery is inactive and does not request browser push permission.

Before production activation:

1. Complete exact CI and independent code and release review.
2. Export and encrypt the complete production Auth database; test a real restore and compare data and schema.
3. Verify the existing database identity, both administrator IDs, and additive-only schema changes.
4. Route only verified sessions into the new store, after the existing preview candidate branch.
5. Bound every request body and page, reject owner claims, and fail closed on selected-store errors.
6. Clear client state and reject stale responses on account changes.
7. Deploy a compatible read-only version before enabling writes. Rollback must retain new rows and their readability.
8. Verify an explicit version-override canary with normal non-reserved desktop and mobile users.
9. Prove owned reads, partial preference writes, reload, inbox actions, device caps, foreign denials, and exact cleanup.
10. Activate normal production storage only after these feature gates pass.

Do not drop the new tables to roll back. Do not use a Source fallback after selecting the new store.
All common full-data rehearsal, freeze, canary, rollback, and retention gates remain in force.

## Local verification

`__tests__/lib/auth-notification-store.test.ts` uses the existing real SQLite adapter and all Auth migrations.
It covers additive schema preservation, false defaults, owner isolation, partial patches, quiet-hour clears,
verified-user races, bounded inbox reads, idempotent actions, unsafe link removal, push caps and ownership,
overlapping registrations, canonical key and point validation, and account-delete cascade.
Overlapping JavaScript calls share one real SQLite connection; this is not a remote D1 concurrency claim.
Hosted concurrency, compatible rollback, and production acceptance passed in the release below. Backup/restore proof is recorded below.

## Retained preparation evidence

The full production Auth backup at2026-10-17 06:04UTC is encrypted for the host and Nils.
A real decrypt and SQLite restore retained all9 original tables,17rows and both admin records.
The additive migration rehearsal preserved old schema and data, with integrity `ok` and zero foreign-key violations.
The plaintext stage was removed. The private receipt is `auth-notification-backup-20261017.json`.
Pinned schema preflight passed11guards against the actual production database.
The single production schema operation then passed24checks: three empty tables and indexes, plus one migration ledger row.
All previous table definitions, existing Auth rows and both administrator records were preserved exactly within the operation window.
The physical foreign keys passed their cascade checks. Production Worker2c328128/b5efe6f6 stayed unchanged at100%.
The private receipt is `auth-notification-schema-apply-20261017.json`; this is schema preparation, not storage activation.
The first strengthened read-only preflight selected an unavailable parser dependency and stopped before any write.
The installed JSON5 parser and exact production binding plus four-file migration pins then passed before the sole apply.

The routing proof passed140focused tests, TypeScript and ESLint. It includes actual Better Auth signup/verification/native session data on SQLite.
The code review found no P0/P1 issues; its non-blocking pagination, stale-read and metadata concerns were fixed and tested.
Twelve local desktop/mobile images were inspected across active, read-only and unavailable settings and inbox views.
The existing theme, controls, and typography remain. Mobile inbox actions are visible; no horizontal overflow was observed.
The local harness uses controlled API fixtures and proves component behavior only. It does not prove hosted D1 acceptance.
The first harness run loaded Better Fetch before its fixture. A later exact-text locator rejected the correct nested error message.
Both failed receipts remain; the saved DOM and remaining successful cases resolve the test defects without claiming an application fix.

## Production activation — 2026-10-17

Foundation PR441: source333ae736, required self-hosted CI39007525997 SUCCESS, merge13f44792, equal tree.
Routing PR442: sourcea457b490be496ac6f3b04e4938dbf1f6e71fbef1, required CI39009760822 SUCCESS,
merge44eacd2a1e12e78f9d181bc462a9ecc560a72a04, equal tree.
Local140focused tests and final47affected tests/type/lint passed. Independent SQL/store, HTTP/client and release reviews passed.
The encrypted complete Auth backup and real restore, additive schema receipt and twelve local images are recorded above.

Production Worker83366b0c-6a7f-4173-b569-3e4ad6f24780 serves100%, deploymentbaae783c-7d4c-4b80-929c-cd529c04187e.
The actual Worker flag is `AUTH_NOTIFICATION_STORAGE=active`. All55 previous complete binding definitions remain unchanged.
Read-only rollback70a278a5-2e68-44dd-99c5-50be5f09ee68 uses the same source and artifact.
Its actual restoration at86bd8150-3acc-4490-9abf-dd5a6227d8bf retained new rows and readable inbox/preferences, while refusing writes503.
Never automatically restore an older Source-only notification reader or drop these tables after live writes.
The source artifact manifest is07e7ca3a2f10e13726f03182de59affb0e4516a9220a6cd516b4b0eb93f08501;
build IDwkGiupXJaFPe_uX1RB6Cm, pinned Wrangler4.136.3. Fresh byte checks passed before each upload and after both.

The successful private receipt `auth-notification-live-attempt2-20261017.json` passes127checks:

- Explicit1% read-only and active canaries, normal read-only default, actual compatible rollback, and active default.
- Two real verified non-reserved controlled owners, native login, partial preference writes/reload and account isolation.
- Actual inbox paging, read, mark-all, delete, foreign denials, and preserved second-owner unread state.
- Fifteen overlapping native device registrations: ten accepted and five bounded refusals; rotation at cap and foreign ownership checks.
- Cached unverified-owner refusal; signed-in desktop/mobile DOM actions and persisted preference readback.
- Exact owned Auth cascade cleanup; all48 Source table counts/full row hashes and both real administrators preserved.

Ten hosted screenshots were opened and inspected. They show upper settings sections and inboxes on desktop/mobile.
Mobile inbox actions are visible; rollback actions are disabled. These images do not show the lower preference panel.
Actual DOM/API assertions prove the lower-panel changes and reload; local fixture images separately show the component states.
All owned users, accounts, sessions, preferences, notices and device registrations were removed.
Both safety timers/services are inactive. Previewe08db2c5/7cdc7953 remains unchanged.
A fresh final receipt passes20read-only guards, including current deployment, all prior bindings, administrator hashes,
Source full hashes, owned absence, Auth counts, four public200 responses, and anonymous401/no-store denial.

The first canary verifier wrongly required `private` on the anonymous middleware401 response, which already had `no-store`.
It safely restored the previous Worker before any fixture existed. No application defect or schema retry was needed.
Its failed receipt remains unchanged; the second verifier accepts effective no-store for middleware denials.
The first upload review required fresh artifact validation; real byte-tamper and manifest-mismatch checks then passed.
The lifecycle review found a lease collision bug in the one-off controller; exclusive-create refusal preserved old lease bytes after correction.
All release-blocking findings were resolved before activation. Expected capacity/denial503 responses are not unexpected production errors.

No Source records were migrated. Unknown deleted/external notification history remains intact and unclaimed.
All nine preferences default false. Push/email senders, dormant producers, and external delivery remain inactive.
This completes independent production notification storage, not the full Supabase migration or broad U3 closure.
Supabase remains required. Common current-data parity, rollback, freeze, full switch and retention gates remain open.

## Expected registration refusals

A successful D1 push-registration statement with exactly zero changes is a refused registration.
The API returns one generic private409 for capacity, endpoint ownership or verification-race refusals.
It does not disclose which guard refused the request, return device keys or enable delivery.
The unchanged atomic SQL still enforces those guards; successful writes and rotations retain their behavior.
D1 must explicitly confirm success. Failed, missing or malformed result metadata remains a private503 and a storage-error log.
Expected409 refusals do not emit the storage-outage marker. Existing historical503 events remain in the audit trail.
This repairs one concrete error path; it does not establish the causes of all historical notification or network events.
The [D1 result contract](https://developers.cloudflare.com/d1/worker-api/return-object/) defines success and change-count metadata.


## Refusal repair production release — 2026-10-18

PR474 source `a39c13946a1e81d142d649e92c294e4353064d96` passed self-hosted CI39081547136
(`verify`, SUCCESS,20m35s),75focused SQLite/HTTP tests, scoped lint, TypeScript and the pinned public-only build.
Merge `9908ffe34371986b65726de35638789308179548` has the identical tested tree.
The build scanned71private values with zero matches. Its manifest is
`fdad302fa8c6786c6e809c2c067c62a4644c0379ce499fad8d577febddb490be`, retained in
`push-refusal-production-resume2-service-build-20261018.json`.
Code review found no blockingP0/P1. Two bounded lifecycle reviews found no blocking flaw in supplied controls;
they did not independently inspect helper implementations. Their timer concern was corrected: independent
systemd units own both timers, and user linger is enabled. Prior broad reviews failed operationally;
those failures remain recorded rather than treated as approval.

Production Worker `38d2d7e6-40ea-48df-9783-24a0a121ad10` now serves100%,
deployment `25f36f3c-f591-4188-94f8-e2f2798758e0`.
The real compatible rollback restored `037dee7f-555b-45f3-89cd-44174301f6d5` at100%,
deployment `5b1da14e-ecbd-4cff-a354-26c35723031c`, before final activation.
Preview `03879c9f-26e4-4bb8-a955-a3798da12885` / `9b83b961-5475-4682-9a4b-ca2a9da00585` remains unchanged.

The inactive upload passed17guards. Corrected canary/default controllers passed26checks each;
actual rollback passed10. Each native phase passed34checks using two fresh controlled owners:

- Fifteen overlapping registrations produce ten200 responses and five identical private409 refusals.
- Identical registration and key rotation still return200 at capacity.
- Foreign endpoint takeover returns the same409 without changing the owner's devices.
- A second owner's free slot succeeds; switched-owner and anonymous requests return403/401.
- Exact account/session/user/notification/device cleanup restores the full Source snapshot and Auth counts.

Both native phases confirm `private, no-store`, the `Cookie` Vary token and `auth-d1` routing.
Unexpected storage failures remain503 with the existing sanitized outage marker; local actual-handler tests
prove that boundary. The hosted proof does not deliberately break the production database.
No push or email is delivered. Existing capacity/ownership/verification SQL remains unchanged.

The first canary verifier wrongly required Vary to equal only `Cookie`. Next.js appends its framework tokens.
It safely restored the old Worker at `846aaade-0f02-4c01-a7bc-1318d9a8e46a` and removed both test owners.
The corrected verifier preserves every409/body/privacy assertion and accepts Cookie within the token list.
Its response metadata confirms the appended tokens; it reused the same inactive Worker with no new upload.

Eight guest desktop/mobile browser checks passed and both PNGs were opened. These cover home rendering,
overflow, page exceptions and the existing root method boundary; they are not new signed-in U2 acceptance.
The final22guards preserve all48Source table counts/full row hashes, Auth counts, both full admin hashes,
all57bindings, four production schedules, zero preview schedules and exact U1/U2 acceptance lines.
All six old/retry timers and their services are inactive. No controlled user remains.

Public performance medians (same shared five-run checker): home221to210ms, spots285to266ms,
pricing207to168ms; all200. Existing speed budgets remain open; these samples do not prove a cache change.
Matched Lighthouse13.5 runs use the same browser, throttling and provider-block settings.
Mobile LCP8459to8302ms/TBT1271to1244ms; desktop LCP1932to1916ms/TBT79to52ms;
CLS0 and zero failed requests in both samples. All24loaded same-origin script paths and decoded-byte
SHA256 values are identical. No measured regression is observed; the existing LCP/JS/cache budgets remain open.
Receipts: `push-refusal-resume-before-lighthouse-summary-20261018.json`,
`push-refusal-resume2-after-lighthouse-summary-20261018.json`,
`push-refusal-public-script-parity-20261018.json` and `push-refusal-resume2-perf-after-20261018.log`.

Private receipts: `push-refusal-prod-upload-20261018.json`, `push-refusal-retry-baseline-20261018.json`,
`push-refusal-retry-prod-live-resume2-canary-20261018.json`,
`push-refusal-retry-prod-live-resume2-rollback-20261018.json`,
`push-refusal-retry-prod-live-resume2-promote-20261018.json`,
`push-refusal-retry-canary-native-20261018.json`, `push-refusal-retry-default-native-20261018.json`,
`push-refusal-retry-prod-browser-20261018.json`, inspected PNG receipt and `push-refusal-final-guards-20261018.json`.
This closes the scoped refusal repair. Historical U3 errors and full application-data migration remain open.
