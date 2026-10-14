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

Physical Source push history, external writers, triggers and historical consent remain unknown under NEED545.
This isolated fresh-owner increment cannot establish historical parity or full notification migration.

## Separate existing Source defect

The current Source helper upserts globally by endpoint without an owner predicate.
A caller who knows another endpoint can replace its owner. This candidate adapter does not copy that behavior.
A separate guarded Source fix and its own verified release remain required.
