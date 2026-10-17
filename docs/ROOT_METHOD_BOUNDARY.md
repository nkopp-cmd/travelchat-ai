# Root request method boundary

## Runtime status

Production Worker3132337f-a1bc-4ff5-a780-bdbe7a65e557 serves100%, deployment6a17bf4b-e2c1-435b-999e-25614fadbaec.
Sourcea38fe6495a20711086dce6a56a96545aa057c639, PR445, required self-hosted CI39017184181 SUCCESS15m45s,
squash3c6188fcd8b5c376590d305abd0738aaaedf1c87, equal tested/merged trees.
Compatible rollback83366b0c-6a7f-4173-b569-3e4ad6f24780 was actually restored at1c2bf4dc-55a8-43a5-b641-59363dc740f3.
Both versions preserve active Auth D1 notification storage and all earlier privacy repairs.
Do not use an older Source-only notification reader after live notification writes.

## Evidence and scope

An ABR1 read-only three-minute window proves two POST500 root invocations on inactive Workerca4dfaf3 at
2026-10-16 23:16:07/23:16:19UTC. Four root renderer-stack events accompany them; six events are not six requests.
No historical request payload or header set was retained. The exact old failure cannot be reconstructed from those logs.
Current833 GET/HEAD/empty-JSON POST returns200/200/405. This guard does not claim that an old500 was reproduced or fixed.

The tracked landing page is a client page with no Server Actions or root mutation contract.
The narrow middleware guard runs after the existing apex redirect and before auth, body decoding and rendering.
Only GET/HEAD reach the exact root renderer. Other root methods return fixed405 JSON, Allow GET/HEAD and no-store.
Root RSC GET queries and all other paths preserve existing routing. Auth, billing webhooks and private methods retain their handlers.
Independent read-only review approves the fence with no unresolved P0/P1. Its historical-failure limitation is retained here.

## Release gates

- Focused middleware/routing tests, TypeScript/lint, exact self-hosted CI and a pinned public-only OpenNext build.
- Private-value artifact scan and fresh artifact verification before upload; compare every complete existing binding.
- Inactive version upload, explicit1% override canary, compatible actual rollback and normal100% promotion.
- Actual root GET/HEAD/RSC and refused POST/PUT/PATCH/DELETE/OPTIONS; malformed form/action headers remain outside the renderer.
- Preserve apex301, auth POST validation, billing webhook signature rejection, private API denial and public city/pricing health.
- Preserve both administrators, Source data, active Auth notification storage, preview and all cron schedules.
- Inspect public landing desktop/mobile proof, disarm the bounded safety timer and remove owned worktrees/helpers after evidence.

## Acceptance record — 2026-10-17

All65 focused middleware/routing tests, lint/diff, exact required CI and pinned public-only OpenNext build passed.
The scan checked71private values and found0hits. Wrong-manifest and real changed-byte checks were refused;
exact artifact bytes were restored and freshly verified before upload and before the second canary.
The sole inactive upload passed17guards and retained all56complete binding definitions, including active notification storage.
The same uploaded version was reused for both traffic attempts; no second upload was needed.

Independent code review approves the narrow fence with no unresolved P0/P1.
A broad operator review timed out and is not counted as a passed review.
The focused lifecycle excerpt review found no P0/P1 within its stated scope; guard/helper internals were outside that excerpt.
Its two P2 concerns were corrected with a common exclusive lock, fsynced atomic lease writes,
and an exact post-marker deployment readback. Actual controller tests preserve an existing lease on collision
and refuse to roll back a verified release. A real flock probe proves concurrent refusal and subsequent admission.
The one-shot server watchdog is bounded to one rollback and runs under the same exclusive lock.

The first canary safely restored833 after an over-strict test expected200 from the initial RSC request.
Both candidate and normal production actually returned307 to a same-origin canonical `_rsc` root URL.
A read-only control followed that legitimate redirect to200; the application code did not change.
The second driver follows at most one validated same-origin root redirect, then requires200.
The first failed receipt remains intact; it is a verifier defect, not a reproduced application outage.

The second explicit1% canary passed25checks at deployment257ad607-f71d-464f-97a6-d35c5d2b64d6.
Actual desktop1440x1000/mobile390x844 browser checks passed8checks with two inspected screenshots.
Both show the existing readable Localley landing layout, no horizontal document overflow and no page exceptions.
Browser POST with an unregistered action header and an empty multipart body returned the exact new405 contract.
This public proof does not replace U2's retained signed-in journey acceptance.
Actual compatible rollback passed10checks before promotion. Normal100% default verification passed25checks,
including GET/HEAD, canonical RSC GET, all five refused mutation/OPTIONS methods, JSONPOST,
apex301, anonymous private API/checkout401 and preserved auth POST validation4xx.
Both actual billing webhook POST routes also returned400/Missing signature before event processing; no provider request or charge occurred.

All48 Source table counts/full row hashes, Auth user/session/notification counts and both full admin-row hashes remain equal.
All56binding definitions, previewe08db2c5/7cdc7953 and four production cron schedules remain unchanged; preview has0schedules.
Native auth validation can advance normal rate-limit counters; no complete Auth-row hash claim is made for those counters.
Both safety timers/services are inactive; the verified lease is durably disarmed.
No Source/DDL/payment/provider/mail operation or full-data migration occurred.
U1 remains verified. U2 acceptance and its original conditional test-checkout skip remain unchanged.
U3 remains open for network errors and other unresolved causes; the old500 payload was never reconstructed.

Private evidence: root-method-build/artifact-negative-proof/upload-20261017.json,
root-method-live-attempt2-canary/rollback/promote-20261017.json,
root-method-browser-attempt2/browser-inspected-attempt2-20261017.json,
root-method-safety-proof-attempt2/flock-proof-20261017.json and the preserved first failed receipts.
The delivery PR and root blocker plan Attempts176–177 record final repository cleanup and read-only reconciliation.


## Subsequent host monitor release

PR447 source1fbcdd9e/CI39021868298SUCCESS17m45s/mergebaac9083 adds provider-only version evidence to the daily report. All56monitoring tests and20actual host guards pass. The stable service09:56:50UTC exits0; five sampled events/ABR10 retain counts and coverage limits. Production3132337f/6a17bf4b and previewe08db2c5/7cdc7953 stay unchanged. No Worker upload, data or paid-provider change occurred. Monitor rollback source0676c795 is separate from application rollback83366b0c. [Exact host release and limits](PRODUCTION_USER_HEALTH.md#worker-version-evidence--released2026-10-17). U1/U2 acceptance stays unchanged; U3 remains open.


## Complete public response monitor release — 2026-10-17

PR449 sourcee0598d96305c8ccd69c398c868a8b5bcad439d3f passed required self-hosted CI39025317573 in18m25s before readiness and merge.
Merge659fb45ad7ea56b0eea94d9c06a7ef9644dbdef3 has the same tested tree.
All63monitoring tests, syntax/diff checks and a focused independent no-P0/P1 review pass.
The review did not run tests; builder and CI ran them. A broader scope consultation failed at its turn limit and is not a passed review.

The old checker canceled page bodies after headers and could accept a truncated HTTP200.
The same frozen broken-response fixture makes old2f10a327CLIexit0 and newe0598d96CLIexit1.
Both retain HTTP200 and identical independent log counts. Native HTTP tests prove actual truncation and a body-time fetch deadline.
The new checker drains/discards at most2MiB under the existing25second fetch deadline, retaining fixed reasons and capped byte counts only.
It refuses empty, missing, oversized and failed bodies; it leaves complete streams uncanceled.
A cleanly completed error shell remains outside this transfer-completion check.

The actual stable service ran successfully at10:53UTC and exited0 at10:53:34UTC.
Root117044bytes and sign-in33442bytes complete with HTTP200; catalog30cities/24visible/2574spots and read-only Source billing query pass.
The report returns35events/ABR1 and explicit ingestion limits. This is not a decline from the earlier5event/ABR10sample.
Seventeen live guards pass, including exact installed code hashes, preserved error/version totals and the U2 acceptance hash.
Full production3132337f/6a17bf4b and previewe08db2c5/7cdc7953 deployment records are unchanged.
Monitor rollback source2f10a327 remains separate from compatible application rollback83366b0c.
No Worker upload, data, secret, authentication, external email, payment or paid-provider change occurred.

Private page-completion-tests/review/candidate/differential/release-20261017 receipts retain actual proof.
All14historical network URLs carry an RSC query, but their missing headers/status/causal stacks prevent a cancellation claim.
This repairs a proven monitoring false-positive; it does not establish those historical application causes.
U1 remains verified. U2 and its original conditional test-checkout skip remain unchanged. U3 remains open.


## Subsequent production dependency inventory — 2026-10-17

The current read-only audit targets exact deployed sourcea38fe649 and unchanged Worker3132337f/6a17bf4b.
It covers582modules/463access sites,48application tables/6181rows,35custom functions,8triggers and175private media objects.
All17literal RPCs are installed. All94application/provider relations are included in the document coverage check.
Disposition is47retained serving-scope tables and one retired early-adopter table; all48retain raw snapshots and schema.
Zero archive-only approvals or deletion approvals were issued. Provider implementation exclusions do not retire product data or media.
The current four Worker schedules and additional ten-minute host monitor are recorded alongside the daily health timer and disabled native-sync timer.
The14unchanged scanner tests pass from the stable checkout with identical scanner/test bytes; the fresh docs worktree lacks TypeScript dependencies.
The corrected native audit and document coverage checks pass; two Source full-row count/hash snapshots match.
This is a documentation-only inventory release, with no Worker, data, credential, provider, email or payment change.
Full candidate parity, media verification, rollback/canary, freeze/switch and retention gates remain open.
[Exact table dispositions, write paths, SQL effects, host jobs and evidence](SUPABASE_CUTOVER_INVENTORY.md#current-production-inventory--2026-10-17).


## Subsequent candidate trip API attempt — 2026-10-17

PR452 sourceb93a8508/CI39032234018SUCCESS17m14s/mergece4f3c61 prepares isolated owned-trip duplication.
The uploaded preview candidate15bdeaa5 passed artifact/binding guards; production3132337f/6a17bf4b remains unchanged.
Two release attempts stopped: an API400 before fixtures, then an owned copy500 after14hosted checks.
Actual preview rollback restorese08db2c5 at100%; both fixtures and all55candidate/8Auth business-table snapshots restore exactly.
All48Source hashes and both production admins remain unchanged. No default preview promotion or hosted copy acceptance is claimed.
[Exact scope and stopped release evidence](CANDIDATE_TRIP_DUPLICATION.md#release-attempt--2026-10-17).


## Candidate duplicate API repaired and accepted — 2026-10-17

PR45482d7ce18/requiredCI39037202818SUCCESS17m41s/merge10181b8b removes the failing request reconstruction.
Native Workerd reproduces the old constructor error.52focused tests/type/lint/pinned build/private71value scan0hits and focused review pass.
After one propagation-delay failure with proven old-version404, the second controlled preview run passes47hosted checks.
Preview9354e5af now serves100% on deploymentf08a4f4a; actual rollbackcf7f201c restorese08db2c5 before final promotion.
All55candidate/8Auth business-table fixture snapshots restore exactly/FK0; all48Source hashes and both production admins remain unchanged.
Both cleanup timers stop and leases close. Production3132337f/6a17bf4b remains unchanged; root/sign-in/cities return200 complete bodies.
[Exact accepted scope and rollback IDs](CANDIDATE_TRIP_DUPLICATION.md#hosted-repair-accepted--2026-10-17).
This API-only release keeps browser-copy activation and full migration gates open.


## Candidate browser copy accepted — 2026-10-17

PR456b3c3bcc9/requiredCI39041588461SUCCESS17m47s/mergeead30844 adds the isolated admitted-owner copy button.
All59focused tests/lint/type/pinned public-only build/private71value scan0hits, focused review and six cleanup safety cases pass.
Preview66e84452 serves100% on deployment5be84ba8 after43hosted checks and actual desktop/mobile button actions.
Both browser phases pass16checks, including one POST per action, owned result links and reload with retained opt-in.
All six before/saved/copy PNGs are inspected; both viewports fit without horizontal overflow and use44pixel copy targets.
Actual rollback347d749c restores9354e5af before final promotion; the default mobile action follows a60second propagation wait.
All55candidate/8Auth business-table snapshots restore exactly/FK0; lease closes and safety timer/service stop.
Fresh26finalguards preserve all48Source hashes, both admins, all33preview bindings and production3132337f/6a17bf4b.
Production and preview root/sign-in/cities return200 with complete bodies; preview keeps0cron schedules.
[Exact browser scope, tests and rollback IDs](CANDIDATE_TRIP_DUPLICATION.md#browser-copy-control-accepted--2026-10-17).
Full migration gates remain open. No production data switch or provider/payment/external-mail action occurs.


## Candidate delete guard stopped after hosted failure — 2026-10-17

PR4586bf96f7c/requiredCI39046048782SUCCESS15m47s/mergef782e37a adds reserved fresh-owner and required-actor guards.
All50focused tests/type/lint/pinned public-only build/private71value scan0hits, focused review and eight cleanup safety cases pass.
Inactive candidate578f9ef8 passes13uploadguards/all33bindings unchanged.
First1% verifier stops on an incorrect anonymous-header assertion after21checks; middleware correctly returns401 without the D1 header.
Second bounded run fixes that verifier contract and passes27checks, then the owned DELETE returns500 with the D1 header.
The cause remains unproved; no successful delete/default promotion is claimed and no third retry occurs.
Actual rollbacka21838f8 restores66e84452 at100%; both55APP/8Auth business-table snapshots restore/FK0/closedleases/inactiveunits.
Fresh23stopped guards preserve all48Source hashes/bothadmins/productionAuth/production3132337f-6a17bf4b.
Bothhosts root/sign-in/cities return200 complete bodies; preview keeps0cron schedules.
[Exact stopped attempt and rollback evidence](CANDIDATE_TRIP_DELETION.md#release-attempt-stopped--2026-10-17).
The candidate feature and full migration gates remain open. Production is unchanged.


## Candidate delete repair accepted — 2026-10-17

PR460751b9bd7/requiredCI39049002104SUCCESS17m52s/mergeb2f3a789 replaces aggregate-change validation with DELETE RETURNING exact ID.
The actual Workerd app-helper regression proves changes2for one trip plus cascaded like;52focused tests/type/lint/build/private71value scan0hits/review/eight safety cases pass.
Previewa397be3d serves100% on deployment3268b368 after66hosted checks.
Owned liked/unliked deletes succeed, reload/repeat404, denied requests preserve rows, and conversation messages survive with only their trip link detached.
Actual rollbackad9afeaf restores66e84452 before final promotion and60second default wait.
All55APP/8Auth business-table snapshots restore/FK0/closedlease/inactiveunits; all48Source hashes/fulladmins/productionAuth/33bindings are preserved.
Production3132337f/6a17bf4b remains unchanged. No browser delete control or production data switch is activated.
[Exact repair, native contract reproduction and hosted evidence](CANDIDATE_TRIP_DELETION.md#returned-primary-key-repair--2026-10-17).

## Resumed current signed-in proof

The [October17 production response check](CURRENT_SIGNED_IN_RESPONSE_PROOF.md) passed76 bounded checks across five pages and two viewports.
All ten document and ten RSC bodies completed; exact fixture cleanup and Source/Auth/Worker preservation passed.
This does not explain historical RSC failures. Mobile screenshot findings remain open in that record.
