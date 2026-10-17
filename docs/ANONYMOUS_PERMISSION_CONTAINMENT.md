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
It also revokes individual-column INSERT/UPDATE grants.
It replaces anonymous public-catalog SELECT with explicit approved column grants.
Residual inherited/PUBLIC privileges refuse the entire transaction.
All rows, existing policies and authenticated/service effective privileges must remain unchanged.
The script changes no data, identity, provider, function, notification or migration-ledger entry.

The source-sized fixed-width hash query takes2637.572ms in read-only EXPLAIN ANALYZE.
The13.837s Management snapshot wall time includes network and inventory calls; it is not SQL execution time.
Raw permission metadata and full48table/6181row digests are retained privately before any operation.

## Verification and rollback limits

The isolated PostgreSQL proof passes97checks, including a real transaction rollback that preserves the exact catalog.
It proves refusal for a wrong fingerprint and inherited PUBLIC privileges without partial changes.
Actual INSERT, UPDATE, DELETE and TRUNCATE commands fail after containment on every fixture table.
Approved public columns remain selectable; the private owner field is denied.
The fixture preserves private zero-row visibility, row contents and service writes.
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
