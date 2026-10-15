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
Hosted acceptance and preview release evidence are pending. Production has not switched to D1.

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
Required CI and hosted preview release remain pending.

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
