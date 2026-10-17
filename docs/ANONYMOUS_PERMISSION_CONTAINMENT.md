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

## Compatibility release and stopped preview gate — 2026-10-17

PR467 source4ce70c3d9a5e14596520d2c79ffcd93aee7d585f passed required CI39063107094.
It merged as74cb4be30442946d18fdfe12002a4619d77d02a4 with the exact tested tree.
This required gate includes TypeScript and lint; the earlier local heap failure is superseded by its successful result.
Separate public-only production and preview builds pass71private-value scans with zero hits.
Production037dee7f-555b-45f3-89cd-44174301f6d5 serves100% on deployment82e0a7f9-6ac9-4fab-b76c-545a807d86b1.
Its25canary checks, actual rollback2c0581c2,25default checks, eight desktop/mobile checks and two inspected images pass.
All57bindings/fourcrons/Source hashes/Auth counts/admin rows remain unchanged.
The original retained rollback version is a70b4e30; Source permissions have not changed.

The preview build uploaded05ef339d-a292-4d0b-b877-15f482f31d6b with all33bindings preserved.
Its1% gate passes five public pages, then the normal public review projection returns503.
The safety controller restores a397be3d at100% on deployment25df2385-c951-4978-9002-82b990d561ae.
Both release timers are inactive. The Source permission operation has never run.
Production returns200for the exact public review URL and query from this host.
The cause of the preview HTTP failure remains unproved; global_fetch_strictly_public was present.
The follow-up uses a preview-only HTTP service binding to the existing production public projection.
It strips identity, pins the same URL, keeps bounded reads and refuses missing bindings without a network fallback.
It additionally refuses the review selector data_candidate, alongside app_data, before the bridge.
Candidate D1 processing still runs first. No production binding or Source secret is added.
Only fixed failure labels and HTTP statuses may enter logs. Hosted acceptance is still required.

The shared checker has fresh seven-run median values before/after production release:
home916to214ms, spots293to273ms, pricing230to172ms. These are observations, not causal improvements.
The50ms warm target and full Lighthouse budgets remain open.

The service-binding correction passes24focused Vitest tests, scoped lint and TypeScript.
Pinned Wrangler generates the service Fetcher type successfully after creating its ignored output directory.
Its first focused gate catches a test-file URL assumption; the corrected second gate passes.
Required exact-head CI and the single remaining hosted retry are pending.

## Second preview attempt stopped — 2026-10-17

PR468 source8ed9919aac599394a6a4ac6c2d3354d5f6b442be passes required CI39073760378.
It merges as3326b26cde50770bf8ba3f49e5ee113fe3855446 with the exact tested tree.
The24focused tests, lint, TypeScript, generated binding type and public-only build pass.
The build scans71private values and finds zero hits.
Inactive upload3cef59a4-88ab-4f6b-a9d0-82af5a4c3623 passes19guards.
It retains all33previous preview bindings and adds only PUBLIC_REVIEW_SOURCE targeting localley-next.
Production57bindings/fourcrons and preview0crons remain unchanged.

The corrected1% hosted retry passes the same five public routes, then public reviews again return503.
The bounded diagnostic label is upstream_exception; the underlying cause remains unproved.
No raw error, response payload or credential is retained in that diagnostic.
The actual safety rollback restores a397be3d-8798-4c72-9abd-4975f4e6d855 at100%.
Its deployment is61a63820-48b3-4c87-9823-f12b8c343e90.
The release stops after two hosted failures. No third canary or Source permission operation runs.
The prepared application grant repair and full51relation regression remain open.
The separate PostGIS owner-grant NEED remains open; the exposure-review NEED remains closed.

Production remains037dee7f-555b-45f3-89cd-44174301f6d5 at100% on82e0a7f9-6ac9-4fab-b76c-545a807d86b1.
All48Source row counts/full hashes, Auth counts and both administrator records remain preserved.
All48application tables still have RLS. All four owned safety/fixture timers are inactive or collected.
The initial final-state guard incorrectly requires exit3 for a collected transient timer.
The corrected read-only guard checks ActiveState/SubState/LoadState without another feature attempt.

Independent production proof passes76checks across dashboard, itineraries, profile, settings and chat.
Ten document and ten RSC bodies finish across desktop/mobile; the owned Auth fixture is removed.
All ten screenshots were opened. Existing mobile settings-bar and chat-title overlaps remain open findings.
Observed API request attempts through networkidle are4on dashboard/itineraries/chat,3onprofile and6onsettings.
The same-origin forwarding gate adds latency and blocks unallowed traffic.
This proves bounded completed responses, not full journey acceptance, one database round trip or field INP.
The performance parent remains open. Document-declared initial scripts alone total341928gzip bytes onhome,
335958onpricing and364275onspots, using level9 recompression; dynamic chunks and wire transfer remain separate.

Private durable receipts are anon-review-service-stopped-20261017.json,
anon-review-service-final-stop-guards-20261017.json and anon-permission-pregrant-rsc-browser-20261017.json.
Keep both failed hosted receipts and all rollback evidence.
Continue from the upstream_exception diagnosis only under a renewed instruction for this stopped item.
Do not apply Source grants before a compatible preview succeeds.

The corrected final-state guard passes10checks; all four transient timer units are collected, inactive and dead.
Independent Lighthouse13.5 after the production release also completes without failed requests.
Mobile simulated4G LCP8591.862ms/TBT410.919ms compares with9386.228ms/1479.950ms before.
Desktop LCP1753.224ms/TBT30.5ms compares with1833.445ms/58.5ms before; both CLS values remain0.
These samples do not meet mobile1200ms/desktop600ms budgets or establish field INP.
The script transfer sizes remain371371mobile/502273desktop bytes; gzip inventory is separate.
Private reports are perf-after-lighthouse-summary-20261017.json and the complete mobile/desktop reports.
No public cache, provider selection, pricing, paid generation or Source data switch changes.

## Renewed runtime diagnosis and preview repair — 2026-10-17

Nils approved private-table zero anonymous visibility and retained public catalogs.
APPROVALS.md line19 and closed NEED661 record that scope; NEED645 is also closed.
RLS containment remains active. No incident notice was sent.
The fresh read-only report finds29zero-row private tables,10permission denials and9readable public catalogs.
It retrieves no row bodies. Existing seven future-policy findings, three writable app tables,
five public-column findings and three provider-owned PostGIS relations keep the full regression failed.
The separate PostGIS owner-grant NEED665 remains open.

A local pinned Workerd test reproduces the preview failure with identical service fetch options:
redirect:error throws a TypeError before fetching; redirect:manual succeeds.
PR470 changes only that runtime option and preserves the existing non-2xx refusal.
New actual Workerd tests prove service projection success and zero outbound hits for a302redirect.
All19focused tests/lint, TypeScript and exact-source public-only build pass;71private values yield0hits.
The final build first refuses an existing owned public-env file; the corrected second build passes.
Required CI39076947750 passes22m26s on76d9ee5c8d771e28d4bb0c4254bab0807f723e34.
Mergee2c3ec05ef4e31d8c8243f2e44cf7b073a8d500e has the identical tested tree.
The independent review finds noP0/P1 and its weaker redirect-test finding is repaired before final CI.

Preview inactive upload03879c9f-26e4-4bb8-a955-a3798da12885 passes19guards.
It retains all33prior bindings and adds only PUBLIC_REVIEW_SOURCE targeting production's public projection.
The1% version-override canary passes16checks; actual browser proof passes18desktop/mobile checks.
All four screenshots were opened; media requests were deliberately blocked, so this is not photo acceptance.
Actual rollbackb626dc5a-1886-4cf2-8a5d-00200565159e restoresa397be3d before promotion.
The new preview version is then active100% on deployment9b83b961-5475-4682-9a4b-ca2a9da00585.
Default verification passes16checks, including public review200, no-store and terminal D1 candidate validation.
The safety timer is disarmed; Source48full row hashes/Auth counts/both admins and schedules remain equal.
Production037dee7f-555b-45f3-89cd-44174301f6d5 on82e0a7f9-6ac9-4fab-b76c-545a807d86b1 is unchanged.

Lighthouse mobile baseline/after samples show LCP8910.086/8902.802ms,TBT1436.486/563ms and CLS0/0.
These samples do not meet the existing performance budgets or establish field INP.
No Source permission operation runs. Both compatible Workers are now verified;
application grant repair, provider grants and the fullD1cutover remain separate open gates.
Private receipts use review-redirect-* under the established private state directory.
