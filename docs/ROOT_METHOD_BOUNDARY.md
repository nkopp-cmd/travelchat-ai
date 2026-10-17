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
