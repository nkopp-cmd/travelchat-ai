# Anonymous permission containment

## Scope and current findings

The anonymous regression extension is delivered in PR466, merge `d226f7dd4b4498c398b4895b8ad1a49e93767caf`.
Exact source `81d0005324a1538332ff88c6375d7efa80647764` passed required CI39056925223.
Fifty-eight focused tests,29real PostgreSQL checks and19stable-host acceptance checks pass.
The installed checker correctly fails current Source permissions; this is not a production security pass.

Current private reads remain protected:29zero counts and ten confirmed permission denials.
All nine public catalogs remain readable. No record bodies were retrieved.
Three currently empty private tables have permissive anonymous write policies:
`follows`, `review_helpful_votes` and `spot_reviews`.
Public spots expose `discovered_by`; four public geography/transfer catalogs expose unreviewed `source_meta`.
The opaque metadata has not been classified as personal data. Its direct public projection is withheld conservatively.

## Prepared repair

Both anonymous spot queries use explicit approved columns, preserving the existing display fields.
Their cache keys include that projection, so deployment does not rely on older cached row shapes.
The same named projection is checked against the regression contract.
Release compatible production **and preview** readers before changing Source column permissions.

`scripts/d1-migration/source-owner-anon-permissions.mjs` exports a guarded metadata operation.
It requires the exact freshly reviewed catalog fingerprint and complete expected relation count.
It refuses non-RLS relations, views, bypass roles, ownership, restricted operator visibility and schema drift.
It locks tables in name order using SHARE ROW EXCLUSIVE, which permits ordinary reads.
Lock acquisition is bounded to2seconds; the whole operation is bounded to15seconds.

The operation revokes anonymous INSERT, UPDATE, DELETE and TRUNCATE on every application table.
The default operation covers48owned application relations. Its fingerprint includes all51public relations.
An explicit owner-authorized extension mode also handles Supabase-owned references. The current operator cannot use it.
It also revokes individual-column INSERT/UPDATE grants.
It replaces anonymous public-catalog SELECT with explicit approved column grants.
Residual inherited/PUBLIC privileges refuse the entire transaction.
All rows, existing policies and authenticated/service effective privileges must remain unchanged.
The script changes no data, identity, provider, function, notification or migration-ledger entry.

The source-sized fixed-width hash query takes2637.572ms in read-only EXPLAIN ANALYZE.
The13.837s Management snapshot wall time includes network and inventory calls; it is not SQL execution time.
Raw permission metadata and full48table/6181row digests are retained privately before any operation.

## Verification and rollback limits

The isolated PostgreSQL proof now passes110checks, including a real transaction rollback that preserves the exact catalog.
It proves refusal for a wrong fingerprint and inherited PUBLIC privileges without partial changes.
Actual INSERT, UPDATE, DELETE and TRUNCATE commands fail after containment on every fixture table.
Approved public columns remain selectable; the private owner field is denied.
The fixture denies raw private SELECT, preserves row contents and retains service writes.
These are disposable PostgreSQL checks. They are not production mutation probes.

A SQL failure rolls back the complete operation. A lost HTTP response requires metadata reconciliation before any retry.
Retain the original ACLs and the permission-operation hash. Never automatically restore known exposure.
After column restrictions, older SELECT-star Workers are incompatible rollback targets for spot discovery.
Keep a compatible projection-aware Worker available; do not return public tables to broad grants to satisfy a rollback check.
The retained legacy Vercel fallback also requires a compatibility review before use after this repair.
No legacy platform is deleted by this operation.

Production completion requires exact CI, reviewed pinned builds, preserved bindings/crons, guarded releases,
current48relation regression success, stable public counts and direct private-column denials.
Preserve both administrator IDs, Source hashes and Auth state. Remove owned fixtures and worktrees after delivery.
Supabase remains the production application store; this security repair does not complete the D1 migration.

## Performance boundary

The new rules require the shared checker and Lighthouse before/after server changes.
Before this repair, seven shared-checker samples give home301/381ms, spots84/133ms and pricing235/269ms best/median.
All responses are200. These figures do not prove p75 or the50ms warm-cache target.
The exact shared PR160/head124a56d script is retained because root installation remains pending.
Do not publicly cache authenticated content or trigger paid photo/model calls for a benchmark.

## Supabase-owned reference grants — blocked owner action

Mutation coverage now includes all51public relations:48application relations plus three PostGIS references.
Read/privacy and public-column checks continue to cover application relations; reference reads are retained.
Unknown or inconsistent extension coverage fails closed. Full regression success requires both scopes to pass.
Separate application/reference result fields never turn a reference failure into overall success.

The actual Management write identity is `postgres`, without superuser status or `supabase_admin` membership.
It has no INSERT/UPDATE/DELETE grant options on `spatial_ref_sys`, `geometry_columns` or `geography_columns`.
Those objects and their grants belong to `supabase_admin`. The read-only endpoint uses a separate read-only role.
A broader access token cannot change that database ownership boundary.
One root NEED asks Nils to request the grant repair from Supabase Support, retaining SELECT.
No failing production REVOKE probe was attempted. Application containment proceeds independently.
The full51relation regression must remain failed until those residual reference grants are removed.
View write grants are conservatively rejected; no successful mutation of those system views is claimed.

Permission snapshots include reference metadata. Only ordinary tables are locked and hashed.
The guard never locks system views or their underlying PostgreSQL catalogs.
Sixty-five focused Node tests pass; seven spot tests, typecheck and focused lint also pass.
One expanded attempt caught a scoped-query alias error before mutation. Its corrected second attempt passes110checks.
The extended fixture tests default application scope without changing reference grants,
and explicit owner scope with actual reference mutations denied after repair.

## Prepared private-read and public-review compatibility follow-up

Empty private tables no longer pass solely because their current count is zero.
The catalog must also prove that anonymous SELECT cannot expose future rows.
The guarded application repair revokes both table and column SELECT on all private relations.
It preserves approved public catalog reads and reference SELECT.
Normal public review GET uses its existing explicit server projection after raw review access is denied.
Preview has no production database secret; its bounded bridge reads only that public production response.
The bridge pins the exact preview host and rejects candidate flags, foreign hosts and invalid identifiers.
It forwards no cookies, authorization or version override. Candidate D1 failures never use this bridge.

Local evidence:67 Node tests and113 disposable permission checks pass.
The real-handler follow-up passes131 PostgreSQL checks, including seven handler cases.
All19 focused proxy/spot Vitest tests also pass.
The first handler gate stopped on a stale six-test assertion after seven handler tests passed.
The corrected second gate passed database and Vitest checks, then TypeScript exhausted its default2GiB heap.
Focused lint did not run after that process stopped. No successful final typecheck or release is claimed.
Per the two-attempt rule, stop this item and retain PR467 as draft.
The earlier production build at4716c6ef is superseded and must not be uploaded.
No prepared permission SQL or Worker upload has run.
