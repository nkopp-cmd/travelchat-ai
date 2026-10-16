# Isolated push-subscription storage

## Scope

The candidate API uses D1 only on the exact preview host with `data_candidate=d1`.
It also requires outbox mail mode, read-only Source mode and a verified reserved fresh owner.
Normal preview and www keep their existing route. Candidate failures never fall back to Source.

Migration `0032_preview_push_subscriptions.sql` adds a separate table with cascading owner cleanup.
It stores endpoints and keys privately. SHA-256 endpoint uniqueness prevents reassignment between fresh owners.
One atomic statement enforces fresh ownership, no legacy mapping and at most ten endpoints per owner.
Existing endpoints can rotate keys at the limit. Deletes require the exact owner and endpoint.

The API bounds JSON to8KiB and rejects malformed UTF-8, extra fields and invalid keys.
P-256 keys must import successfully; authentication keys must contain16bytes.
Responses omit endpoints and keys, disable caching and explicitly report `deliveryEnabled:false`.
No sender, browser registration, VAPID configuration or dormant producer is enabled.
A provider endpoint allowlist and cross-store collision reconciliation remain prerequisites for future delivery.

## Verification and release

Local tests execute the actual migration and SQL through SQLite.
Required checks cover persistence, repeated saves, rotation, cap, competing owners, legacy races,
foreign deletes, cascading cleanup, malformed input, private failures and unchanged normal routing.
Hosted acceptance and preview release passed on2026-10-16; evidence appears below. Production has not switched to D1.

The read-only source audit below finds no current notification storage or matching triggers.
External writers, archived history and historical consent remain unproven.
This isolated fresh-owner increment cannot establish full notification migration.

## Separate existing Source defect

The current Source helper upserts globally by endpoint without an owner predicate.
A caller who knows another endpoint can replace its owner. This candidate adapter does not copy that behavior.
A separate guarded Source fix and its own verified release remain required.

## 2026-10-15 reconciliation and history disposition

PR424 rebased onto main9187187f at63cfeff0. The diff preserves the released Stripe and mobile cards.
Draft388 closed as superseded by426; draft283 closed because the source-schema fallback opposes D1 direction.
Their remote branches retain the unmerged code. No source table was created.

CI38579382055 exposed two stale complete-schema expectations. The new migration makes32, not31.
Required CI38760992592 and hosted preview release now pass; the earlier failed CI remains historical evidence.

A project-pinned Management API read-only SQL audit returned201 with transaction_read_only=on.
The SQL role has bypass-RLS visibility. All nonsystem schemas were checked for matching relation names
and push/notification key columns. No matching relations, functions or noninternal triggers were found.
public.notifications, public.notification_preferences and public.push_subscriptions are physically absent.
cron.job is absent. This is current catalog evidence, not proof about deleted backups or external systems.
Private receipt: notification-readonly-catalog-20261015.json.

There is no current source notification table to import. Do not invent historic records or consent.
Repository searches find producer definitions only in notification-triggers and web-push; no app imports activate them.
The host has only the Localley health timer and no matching Localley notification cron entry.
This inventory does not inspect external schedulers. Receipt: notification-host-inventory-20261015.json.
Explicit API routes remain the storage callers; no candidate sender is activated.
Future production activation still requires a complete caller inventory, explicit retention/consent policy,
all-owner routing, fresh production rehearsals, tested rollback and signed-in acceptance.

Candidate preflight passed58 read queries across55 tables with no foreign-key violations.
The existing background table already has the8MiB capacity constraint, but0031 is absent from its ledger.
Do not run blanket migration application or repeat its table rebuild. Leave this unrelated gap unchanged.
Apply only0032 with a backup/bookmark and one table/index/ledger batch.
Verify that all three objects exist together, then compare preexisting schemas, counts and foreign keys.
Remote batch atomicity needs evidence; do not assume an SQL file alone supplies rollback.
Private receipt: d1-push-preflight-resume-20261015.json. No production schema or data changes are authorized here.

Read-only review d1-push-review-resume-20261015.log found no P0/P1 in the supplied code.
Local SQLite promise races are sequential; only hosted concurrent requests can establish remote race behavior.

## Delivered preview — 2026-10-16

PR424 tested headbd56981383938e10597ca5912da0d79fd6309480 passed required CI38760992592.
Squash merged53367f0a00d70c459e733aa8086908351027d08 has the exact tested tree31d4599e3675d1259ba731fe18a6619589931408.
The only workflow has no main-push deployment or migration step.

Exact local commands passed:

- `npx vitest run __tests__/api/push-subscription-candidate-route.test.ts --maxWorkers=1` —14tests.
- `node --test scripts/d1-migration/notification-inventory.test.mjs scripts/d1-migration/core-import.test.mjs` —14tests.
- Focused ESLint on adapter, route and route test; `npx tsc --noEmit`; `npm run cf:build`.

Pinned dependencies and heavy checks used run-heavy. Artifact audit covered2328files and94private values.
It found zero private matches, apart from five previously documented public Kakao server aliases.
Code and release reviews found no P0/P1 in supplied code and evidence; they did not inspect live systems independently.

Candidate0032 passed66checks. Time Travel bookmark:
`000000d6-00000000-00005106-388d6b8b7b649e63398144d9e8353bd8`.
An intentionally failing CREATE/INSERT/query batch left no probe table, establishing remote batch rollback.
The real table/index/0032ledger batch succeeded. Existing schemas and counts stayed unchanged except ledger+1; FK0 passed.
Migration0031 remains absent from the ledger despite its existing capacity schema. Never run blanket migrations apply.

Preview Worker6d621d4b-0747-4ace-afe9-14b987402037 now runs100%, deployment69c96bf1-a014-4599-adbc-155b6ff0c069.
Rollback isdc5b3560-68ee-4a31-88a9-13cf49cfdae3. Actual guarded rollback succeeded at deployment6c8b6f01-50da-40d3-ac48-c0192509097d.
The guarded1% override proof passed44checks. A second44check proof used default traffic without version overrides.
Both used two actual verified reserved owners. They verified repeat/rotation, competing claims, concurrent cap10,
rotation at cap, foreign deletion, malformed keys, anonymous/unverified denials and owned deletion.
Normal preview without opt-in wrote nothing to D1. No external push request or production checkout occurred.

Each run removed its exact owners, subscriptions, Auth users/accounts/sessions and outbox messages.
All56candidate table counts and global verification count restored; FK0 passed.
Both production admin hashes, Source users/subscription hashes and production deployment stayed unchanged.
Both recovery timers are inactive. Production remains ca4dfaf3-1d5d-4798-9957-257738fb7c01 at100%.

Private receipts: d1-push-local-build-20261016.json, d1-push-artifact-20261016.json,
d1-push-apply-0032-20261016.json, d1-push-hosted-20261016.json,
d1-push-default-hosted-20261016.json and d1-push-preview-promotion-state-20261016.json.
Fresh notification-inventory-20261016.json finds all three candidate stores empty after cleanup.
It explicitly reports historicalParity=unproven and cutoverReady=false.
Full all-owner migration, external delivery, historical consent and production cutover remain separate gates.
