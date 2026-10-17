# Seoul Discovery Release

## Production runtime record

[Root request boundary and current runtime status](../ROOT_METHOD_BOUNDARY.md) records the bounded next release, exact activation status, compatible rollback and hosted proof. Prepared work does not change the verified runtime. The notification-storage release below remains the baseline until that record proves activation.

## Prior verified production — independent notification storage, 2026-10-17

PR441 source333ae736/CI39007525997 SUCCESS/merge13f44792 and PR442 sourcea457b490/CI39009760822 SUCCESS/merge44eacd2a have equal tested/merged trees. Real SQLite/native-auth tests,140focused checks, final47affected tests/type/lint, pinned build, secret audit and independent reviews pass. Full encrypted Auth export/decrypt/real restore preserves9original tables/17rows/two admins. The sole additive schema operation passed24checks.

Worker `83366b0c-6a7f-4173-b569-3e4ad6f24780` serves100%, deployment `baae783c-7d4c-4b80-929c-cd529c04187e`, with `AUTH_NOTIFICATION_STORAGE=active`. All55 previous complete bindings remain unchanged. Compatible read-only rollback `70a278a5-2e68-44dd-99c5-50be5f09ee68` was actually restored at `86bd8150-3acc-4490-9abf-dd5a6227d8bf`; newly written rows stayed readable and mutations returned503. Older Source-only readers are unsafe rollback targets after this release.

The successful hosted receipt passes127checks across explicit1% canaries, actual rollback and normal active production. Two verified non-reserved controlled owners prove preferences/inbox/device storage, partial writes/reload, owner denials, fifteen concurrent registrations with a ten-device cap, desktop/mobile actions and exact cascade cleanup. Ten hosted upper-page/inbox screenshots were inspected; actual DOM/API assertions prove lower preferences changes. Twelve separate local component screenshots cover active/read-only/unavailable states. The first canary safely rolled back because its anonymous middleware cache assertion was too strict; its failed receipt remains retained.

Final20read-only guards pass: current production/preview identities, all previous bindings, both admin hashes, all48Source table counts/full hashes, Auth counts, owned absence, inactive safety units, four public200 responses and anonymous401/no-store. Previewe08db2c5/7cdc7953 is unchanged. No paid provider, payment, external push/email delivery or Source data migration occurred. Supabase remains required; full parity/freeze/switch/retention gates remain open. [Exact storage, backup, tests, failures and rollback evidence](../AUTH_NOTIFICATION_STORAGE.md).

## Historical production — compatible Source privacy runtime, 2026-10-17

PR436 source `589272d2a3538bfbc4d17eccfb903a26e7020da1`, required CI38999330578 SUCCESS, merged `813572502a8bc7dc38be7f96fa118f73cce34519` with an equal tree.92focused tests/type/lint, actual PostgreSQL96checks/four real handlers, public-only pinned build, zero-secret artifact audit and scoped SQL/runtime/tier reviews pass. Worker `2c328128-27cd-44dd-be51-e1d0dec9e91d` serves100%, deployment `b5efe6f6-8fd4-41c1-aad6-766fd9279a08`.

Canary9b169dd8 at1% and default release each pass38real login/owner-save/reload/chat-storage/foreign-denial checks with exact48table/Auth/admin cleanup. All eight desktop/mobile screenshots were inspected. All55complete binding definitions match the prior Worker; four production schedules remain unchanged and preview has none. Previewe08db2c5/7cdc7953 remains unchanged. No paid generation, provider, mail, partner or payment call occurred. Current cities recheck returns200three times at555/290/256ms.

Rollback `19b90012-a85c-426c-a40e-9323ffaa5370` was actually restored at `86c0e390-2521-4ab8-a662-836c6060deb3` before returning to the compatible runtime. The old Worker is not an approved rollback after the Source permission repair: it lacks these privacy checks. The watchdog is disarmed, and its timer/service are inactive. An emergency metadata restore also reopens known exposure and must never run automatically. [Current permission operation, exact receipts, failure reconciliation and limits](../SOURCE_OWNER_SECURITY.md). This is a Source security repair, not a D1 data switch; Supabase retention and the common migration gates remain in force.

The related [saved trip permission repair](../SAVED_ITINERARY_SECURITY.md) records its own guarded metadata and acceptance status. It does not need a new Worker artifact.

## Historical production — atomic usage correction, 2026-10-17

PR432 source `dbd09ad27037545314ce397b1da641f47656a3fe`, required self-hosted CI `38987106920` SUCCESS16m34s, merged `6d5b6c0f1c548479f365ce58166f506d390d6fe7` with the same tree. Thirty-seven focused tests, actual installed-SQL PostgreSQL20checks, full regressions/type/lint, pinned build, artifact audit and read-only code/release reviews pass.

Production Worker `19b90012-a85c-426c-a40e-9323ffaa5370` serves100%, deployment `be8a200a-16dc-42a7-9435-f5195356475d`. Rollback `ca4dfaf3-1d5d-4798-9957-257738fb7c01` was actually restored at `35e8ffd7-c0fa-4569-814e-f939bb7b84eb` after the1% canary. Canary25and default25checks pass: controlled free-owner login, real chat429atcap10 before provider, unchanged counter, public200including `/api/cities`, exact Source/Auth cleanup and both admins preserved. All55bindings remain equal; both watchdog timers stopped. Existing live Stripe four-price proof remains intact. No provider, price, schema, grant or D1 application-data switch occurs. [Exact quota evidence and limits](../ATOMIC_USAGE.md).

## Current preview — owned candidate itinerary editor, 2026-10-17

PR431 source `f587e2c5c8f0bf8c0b2694f1968fa6181ad9365d`, required CI38990695820 SUCCESS19m22s, merged `0f9a72965d54bf022e44f920185c21921356b698` with the same tree.38editor tests/5captured-contract tests/8full-schema fixture checks/lint/type/pinned build/artifact audit/reviews pass. Preview Worker `e08db2c5-5788-4fbb-94d8-3bd373f33420` serves100%, deployment `7cdc7953-3640-499f-93fb-1d6b8a90e3aa`. Prior version `6d621d4b-0747-4ace-afe9-14b987402037` remains rollback; actual restoration `f76bb5bc-a2f5-45a8-957a-42edd19e2874` passed after1% canary.

Hosted60canary+60default checks prove real owned desktop/mobile save/reload/autosave/cancel, private denial contracts, no metadata loss and exact56table/Auth/outbox/verification cleanup. A further74checks prove all10rendered denial cases on both viewports. All12successful positive/denial screenshots were opened and inspected. Both timers are inactive;33preview bindings/import manifest/selected Source users8-subscriptions5hashes/both admins/production19b90012-be8a200a remain preserved. No Source write, paid provider, external delivery, SQL migration or production data switch. [Exact editor tests, failures, release and limits](../D1_ITINERARY_EDITOR.md).

## Historical production — bounded GLM correction, 2026-10-05

Cloudflare OpenNext Worker `localley-next` serves www, apex and next.localley.io. Runtime source `ccf23a78dfea795a575a142402823cbf81dc0210` (PR295), tested head3a5f537, required self-hosted CI37299980586 SUCCESS10m12s and equal tree5b9b1383. Pinned production build and independent scoped release review passed. Worker `b42e8926-6b15-4875-85ec-44d39513832d` at100%, deployment `6f22f0cb-a8b8-4e8f-bf76-19965611b471`; rollback `a548f24e-1f17-4021-a830-219074baa337`.

One fresh received-email login and one actual live generation200 prove GLM5.2 primary/no fallback, automatic owned save and desktop/mobile reload. Scrolled screenshots inspected;40cleanup checks preserve both admins/source hashes and clear fixtures. Browser media/provider endpoints were blocked; precise pins/photo providers are not part of this acceptance. Public roots200 and anonymous normal-host/spoof checks pass; daily health service exits0. [Exact acceptance and limits](../GLM_JSON_REQUEST_ACCEPTANCE.md).

Production application data remains on Supabase; Better Auth uses D1 AUTH_DB. Candidate D1/R2 development resumed under Nils's October3 direction; production data switch still requires full parity, rollback and canary gates. Production bindings remain unchanged, with no candidate application binding. The current preview release appears below. Notification SQL fallback PR283 remains draft; history/disposition and production cutover gates remain open. Native sync stays disabled/inactive because its legacy import is obsolete.

## Historical preview — fresh story background links, 2026-10-05

PR379 / runtime source `8e33fd00e3f669b0143fdce822a28fc9c2c467a8` passed required CI `37330608378`.
Preview version `b3e8a3ef-10b3-45ce-a28a-23144d3b2ea8`, deployment `21cbffc9-e5e7-4ec5-b109-64c0bec59c66`, runs100%.
Rollback `6bb33686-6b1d-44c4-982a-a740ecda1167` remains available.
Nineteen focused tests, TypeScript, lint, pinned build and scoped source review passed.
Hosted fresh missing-media row creation/link/reload, real owned cache bytes and4438668-byte rendered PNG pass.
Exact fixture cleanup restores55APP/source/auth fingerprints and both admins; production stays unchanged.
No provider call or external email occurred. Generation remains disabled.
See [scope, exact tests and acceptance](../CANDIDATE_FRESH_STORY_BACKGROUNDS.md).
Later evidence-only main commits do not change this runtime source.

## Host artifact — notification history report, 2026-10-05

PR372 tested head `05cd70ececa19d0984983ec9b9356e31f87bfd7b` passed required self-hosted CI `37337852319` in9m17s.
Merge `51272e984b6346f8fc0cdd73e409a968920b94f3` matches tested tree `3419be13136b8b85a7c733690b4ef7942fd11cff`.
Stable main contains the [read-only SQL report and run instructions](../notification-history-sql.md).
SQL SHA256: `9f284160a27c1b5bbd6bb3532b87038b077837a070058d6a524759ffab98447a`.

Ten real PostgreSQL checks pass on the feature and stable main through `run-heavy.sh`.
They cover absent relations, counts, privacy, blank owners, inherited rows, missing fields, refused views, restricted RLS/user lookup and no writes.
Syntax/diff checks pass. Final supplied-source review found no concrete P0/P1; the reviewer ran no database queries.
Blank source IDs remain missing, never matched owners.
Inherited counts, incomplete writer coverage and unverified SQL Editor result handling remain explicit.

Read-only checks at16:14:55UTC match the baseline. Both production AUTH/source admins remain. Public roots return200.
Isolated preview AUTH retains20users/22sessions/20accounts/1verification/24outbox.
Current Worker/deployment/rollback identities remain unchanged, as recorded above.
This releases a host artifact. It changes no Worker runtime and creates no source/candidate rows.
The three source notification tables still return404/PGRST205 with unknown physical counts. Candidate notification tables remain empty.
NEED545 requires authorized physical source/history/installed writer evidence.
External writers, historical consent, source compatibility and activation remain unproven.
Private receipts and review remain in `~/.local/state/localley/notification-review-20261005/`.

## Real story acceptance preflight — stopped, 2026-10-05

Pinned install and OpenNext build passed on main `57dbda5b5ac16f805141a055692dce59c82a9ce5`.
The read-only activation-plan review found no P0/P1, subject to its entitlement, overlay and no-retry conditions.
It reviewed source only. No hosted entitlement or generation acceptance occurred.

Two baseline attempts stopped the test. The first tried to count D1's protected `_cf_KV` relation.
Schema inspection identified that internal relation; the supported snapshot covers55application tables.
The second stopped because the preview Worker has no `FAL_KEY` binding.
The shared credential store also has no FAL key. The existing application credential remains unchanged.
No key was copied, no test user or fixture was created, and no paid request or Worker upload occurred.
Generation remains disabled; normal production and preview versions above remain unchanged.

The spend guard passed atUSD4.95/week andUSD18.24/month. This preflight added no paid usage or reservation.
The new FAL credential/binding request is in root NEEDS.md. Do not retry the stopped baseline until it clears.
Notification source SQL/history and activation remain separately blocked by NEED545.
Private `story-real-acceptance-20261005/blocked-preflight.json` retains counted tables, source/auth fingerprints and release identities.

## Historical preview — fresh saved-slide capacity, 2026-10-05

PR377 / runtime source `978a1dc051ae9ae90dbf7c5e23f7c1a09ea971b5` passed required CI `37321893022`.
Preview version `6bb33686-6b1d-44c4-982a-a740ecda1167`, deployment `ead473e7-3af0-40ba-a949-5c85e3783d35`, runs100%.
Rollback `e13812dc-1c24-4c19-9aa5-bd7ecefc2cdf` remains available.
Twenty-seven focused tests, TypeScript, lint, pinned build and scoped review passed.
Hosted proof covers three real5751967-byte PNGs, full64MiB persistence, private readiness and inspected desktop/mobile galleries.
Exact fixture cleanup restores55APP counts, source/auth fingerprints and both admins; production remains unchanged.
Generation stays disabled. No paid provider call occurred.
See [exact scope and acceptance](../CANDIDATE_STORY_SLIDE_CAPACITY.md).
Later evidence-only main commits do not change the runtime source above.

## Historical preview — candidate FLUX submission boundary, 2026-10-05

PR373 / source `21dd7990f8984dfb7edcc3c4c86ff18988d1c917` passed required CI `37308365875`.
Preview version `fe7b1671-1f4a-4c07-86c4-fae9a0f84332`, deployment `2a00c196-bf76-45dc-9591-d3f97425f5b4`, runs100%.
Rollback `08d5a10a-a3e3-4842-ae90-1acef64121e1` remains available.
Production stays on the GLM release above.
Eleven real-SDK and thirteen handler tests, TypeScript, lint, pinned build and focused review passed.
Hosted owned/anonymous/normal boundary checks and exact auth cleanup passed.
Source/APP fingerprints, both admins and preview safety settings remained unchanged.
Paid generation stays disabled; real paid acceptance remains open.
See [the D1 release evidence](../CLOUDFLARE_D1_PROJECT.md#candidate-flux-submission-boundary--2026-10-05) for exact scope and limits.

## Historical production — users first, 2026-10-01

The current target is Cloudflare OpenNext Worker `localley-next`, serving apex, www and next.localley.io. Repository `nkopp-cmd/travelchat-ai`, merged main code `2177fa7` (PR #284), required self-hosted CI `36847108837`. Deployment `a1b6362a-817a-42c3-aec5-3c38dd53fc17` serves version `58e7dadb-406b-4e48-a7da-f25683cbf30c` at 100%, released 10:30:23 UTC. Rollback `b66a792d-fa68-4db4-acda-3e60d9ed3329`. Supabase application data and D1 Better Auth remain unchanged apart from the explicitly authorized one-row wrong-photo quarantine.

Merged OpenNext build and account guard passed. Four public curl routes returned 200. Source quarantine used exact compare-and-set, cleared three proven wrong landmark photos, preserved deep non-photo fields, and passed readback. Its original backup and guarded rollback remain private. See [Source photo repair](../SOURCE_PHOTO_REPAIR.md). Notification schema draft PR #283 passed required CI `36846355366`; live SQL access is missing, so its tables and controls remain unavailable. Daily checks run from stable main; native sync remains disabled/inactive. The application-data D1 move stays paused.

## Historical Vercel release — 2026-09-07

Date: 2026-09-07. Target: Vercel `travelchat-ai`, serving `www.localley.io`.
Baseline: `98ccd6d00e11002326b8b7926e845414f675a7ef`.
Rollback deployment: `dpl_8GLWuch2zYWyFEJHt9SCNmyDPTJw`.

## Live Result

The release is live at `https://www.localley.io/spots?city=seoul&view=map`.
Final application commit: `0a503c63a93d151f0be81080e3f01a705f4bea30`.
Final deployment: `dpl_FcHJtVkCz5n92uYPhQJxZ8FLqh9u`.
Deployment URL: `https://travelchat-pa8t5pf7j-nkopp-cmds-projects.vercel.app`.
Vercel metadata and actual public browser checks confirm the live alias uses this deployment.

Final verification:

- 745 unit tests pass across 97 files. TypeScript and the hosted production build pass.
- All 39 public workflow checks pass across 390, 900, and 1440 pixel widths, without preview credentials.
- The map shows 24 real Seoul pins per result page, with working filtering, selection, details, and reviews.
- Local sign-in and signup forms work. Dashboard redirects now stay on Localley and preserve the original path.
- Thirty-four authenticated production checks passed before the redirect-only follow-up; its API protection remained unchanged.
- Save and unsave persisted correctly. Anonymous clients could not access the QA-owned row.
- Cover, day, and summary rendered real 1080x1920 PNGs. Private story access is protected and not cached.
- Five temporary QA accounts were created across the diagnostic attempts. All accounts, sessions, and fixture rows were removed.
- Each account was eligible for an authorized welcome email; attempt and delivery were not verified. No direct email call was made.
- No AI-generation or payment call ran during release checks.

Residual limits:

- Photo appearance and stale-worker upgrades were not established by the fresh, photo-blocked browser checks.
- Two filter-cache refresh timeout logs occurred with HTTP 200 responses; all browser filter checks still passed.
- This pre-existing query path needs a bounded performance follow-up. It is not a clean-error-log claim.
- Full lint retains 26 errors reproduced from the baseline; targeted changed code has no lint errors.
- New media activation, Cloudflare, billing changes, signup profile synchronization, and saved-place-to-itinerary continuation are not certified here.
- QA profile fixtures were explicit; automatic signup profile creation was not established.

Keep the saved-place security policy when rolling application code back. Do not restore the old PUBLIC policies.
Before deploying other branches, integrate this release's security and redirect fixes so they cannot be lost.

## Scope

This release extracts Seoul map discovery, safe map text, review reads, save validation, and compatible framework/worker maintenance.
The map shows the current result page. Moving the map does not fetch other result pages.
One security-policy migration was applied. No new media migrations are included.
No new provider, payment, or itinerary-generation code changes are included.
Image generation and billing code remain identical to the live baseline.
Hosted checks required two narrow changes to the existing story renderer: private access checks and summary layout compatibility.
Existing payment risks are not claimed to be fixed by this release.

## Candidate Verification

- 718 tests pass across 95 files.
- After the story fixes, the full suite passes 735 tests across 96 files.
- TypeScript and production builds pass on the isolated release tree.
- Focused lint passes with three warnings and no errors.
- Full lint reports 26 errors reproduced from the baseline with the same linter.
- Those baseline errors remain a separate maintenance task; this release adds none.
- Production Supabase hostname matches the expected Localley project.
- Saved-place and review field checks pass against the real schema.
- Clerk exposes the required `supabase` JWT template.
- Upload audit selects this release worktree, not its parent feature workspace.
- Deployment exclusions reject credentials, test artifacts, databases, and unrelated agent files.

## Verification History

The saved-place ownership migration was applied transactionally and recorded in hosted migration history.
Real QA verified save, read, unsave, and live-baseline compatibility after the change.
Anonymous database reads, inserts, and deletes cannot access the QA-owned row.

The first candidate exposed an existing private-story access gap and a summary Satori layout failure.
The renderer now checks owner/public access before image fetching and uses private no-store responses.
One missing `display: flex` declaration caused the summary failure and is now corrected.
Real offline and hosted renders of all three templates passed before completion.

QA found an existing saved-spots RLS risk, not a new discovery-code regression.
Production SQL confirmed three permissive PUBLIC policies with unconditional `true` predicates.
These policies allow anonymous reads, forged-owner inserts, and unrestricted deletes when table grants permit them.
The table was empty before migration after QA cleanup. Empty data did not make those policies safe.

Required migration: `supabase/migrations/20260907161457_harden_saved_spots_owner_rls.sql`.
It transactionally replaces only the three known policies with authenticated Clerk-subject ownership checks.
It refuses unexpected additional permissive policies or disabled RLS without dropping unknown policies.
It adds no UPDATE policy and changes no grants. Existing `service_role` administrative access remains available.
A real Clerk-template JWT with `role=authenticated` and the matching QA subject was verified before applying the policy.
Hosted save and isolation checks then verified the actual application-to-database authorization path.

Local regression command: `node scripts/test-saved-spots-rls.mjs`.
Result on 2026-09-07: all listed local regression checks passed on PostgreSQL 17.11.
The fixture uses PostgreSQL 17.11 from the existing `postgres:17-alpine` Docker image and checks its version.
It has no network or published ports, limits CPU and memory, and removes its container and temporary data.
It snapshots the original policies and first proves the vulnerable anonymous count is one.
It tests anonymous denial, owner isolation, forged-owner denial, denied reassignment, and administrative reads.
It also tests repeat application, rollback after invalid schema, and refusal of unknown permissive policies.
These SQL tests do not verify HTTP responses or production JWT validation.

References checked on 2026-09-07: [Supabase changelog](https://supabase.com/changelog.md)
and [RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).
No listed breaking change alters these existing-table policy expressions. The migration preserves existing grants.

Both release candidates used production configuration with `--skip-domain` before promotion.
The live aliases moved only after the relevant checks passed.
The final redirect-only follow-up passed its hosted redirect checks before promotion and all public workflows afterward.

The user authorized routine commit and deployment after successful release checks.
That authorization does not permit bypassing access controls or weakening authentication.


## Bounded cave source repair — 2026-10-03

Operational source release PR298 / merge2d8f99e63f9201a1413a1e3e3c3503b00021f529, required CI37128259544. Nils directed the builder to proceed after the quota-blocked report; independent advisor verdict remains unavailable. Fourteen guard tests passed again. At16:28:09UTC receipt ff863c2eea2c cleared only three rejected cave photo references. Non-photo fields and both control sources remained unchanged. Live gallery404/unavailable, public quality query0 and four public200 passed at16:28:52UTC. Private original backup/hash and guarded rollback predicate are retained; rejected photos were not restored. See docs/SOURCE_PHOTO_REPAIR.md for exact incident and proof.

Current Cloudflare Worker a548f24e-1f17-4021-a830-219074baa337 at100%, deployment d39a5358-8601-4902-adad-c39b75cb7837; rollback93f34779-7182-4158-b564-86546800ce33. The source command changes no Worker bundle, so this operation needs no OpenNext deployment. Supabase remains the application database. D1 migration stays paused.


## D1 notification preference preview — 2026-10-03

PR300 / merge173f3173d4e0723bf11606b4d5e9ed4350f361a0; required CI37140474924 passed6m45s on608b779. Fifteen focused tests, TypeScript/lint, merged OpenNext build and account guard passed. Candidate migration0027 applied; ledger13to14. Preview deployment36d396aa-e83c-4ae7-9adc-0f6443dc4e16 / Worker3f377307-15bf-4d88-9d36-6a26ad8be6f5, rollbackf81c83e9-57ea-4b49-8624-0fa80bc11cbf.

Real verified reserved sessions proved D1 preference writes/readback, concurrent defaults, owner separation, null clearing and forged-owner400. Exact fixture cleanup0; prior table counts unchanged except migration+1. Normal signed-in preview remains500/no D1 because its old Supabase service role is absent; no normal-route success claim. Preview/www roots200 and signed-out preference reads401. Production Workera548f24e/deploymentd39a5358 remains unchanged at100%, rollback93f34779 retained. No paid provider or production application-data switch. Nils restarted candidate D1/R2 migration; independent advisor verdict remains unavailable. Details/private evidence locations and additive schema rollback are in docs/CLOUDFLARE_D1_PROJECT.md.

### 2026-10-03 — D1 story renderer preview release

PR302 `44d74c4375eb433f45da07cedae224bb1f849142`, exact head `d0a93392a178368da8e01d554115de538b062fcc`, required CI37143273975 passed6m53s. Thirty local real-render/access/repository tests, TypeScript/lint, pinned installation and OpenNext build passed. Preview Worker `110a575a-3799-4594-a426-1ee47608989c` / deployment `49cc5410-9fee-4c42-a279-97310ee4ed34`, rollback `3f377307-15bf-4d88-9d36-6a26ad8be6f5`; no app schema migration.

Two real outbox-verified sessions proved full cover/day/summary PNGs1080x1920, cross-owner/private404, public rendering200, expired stored-slide access semantics, a controlled public JPEG background prefetch, invalid-background500, missing404 and exact cleanup0. Counts7owners/85itineraries/85media restored, both production admins intact, two PNGs inspected. Unflagged preview500/no D1 remains a preexisting limitation. Production Worker `a548f24e`100%/deployment `d39a5358`/rollback `93f34779` unchanged; www/apex/preview200. Actual private report `d1-story-hosted-20261003.json`; details in CLOUDFLARE_D1_PROJECT. Harness removed; no paid call or source write. Background R2 writes, fresh-data parity, tested rollback and signed-in1% canary remain open.

## 2026-10-05 — Candidate background capacity preview

PR375 / merged source `d2111d0cc7fde752922128b6fc783d56d6c38ab2`; required CI37314744402 passed11m11s.
Twenty-six focused tests, TypeScript/lint, pinned OpenNext build and scoped review passed.
Preview-only0031 raises background cache limits to8MiB with preserved constraints and empty-table preflight.
Preview Worker `e13812dc-1c24-4c19-9aa5-bd7ecefc2cdf`, deployment `d987f582-d51c-4405-aa01-089122f9d2a4`, rollback `fe7b1671-1f4a-4c07-86c4-fae9a0f84332`.
Real verified owners prove a4515442-byte PNG/hash/cache hit/no credits, foreign404/anonymous401 and unchanged normal routing.
Exact R2/D1/AUTH cleanup0,55APP counts/import/FK/source fingerprints and both admins are restored.
Productionb42e8926/deployment6f22f0cb remains unchanged; all three public roots200.
Generation stays disabled. No paid call, source write or production data switch.
Candidate saved-slide2MiB capacity remains a separate follow-up before paid acceptance.
Exact limits, evidence paths and rollback conditions are in docs/CLOUDFLARE_D1_PROJECT.md.

## 2026-10-06 — Explicit itinerary Cloudflare mail

PR386 source0ad0b530; required exact-head CI37494333854 passed11m13s;33tests, public-only build, artifact audit and scoped review passed.
Previewb9086f9a100%/deployment69cb9786; production043e1752100%/deploymentec5dd29c; rollbackb42e8926 retained.
Only AUTH0003 adds atomic owner/shared copy limits; no APP database switch.
Controlled received login, full itinerary and reset messages passed, with owned200/anonymous401/missing404.
Exact cleanup restores55candidate table counts and selected four source/five auth hashes; both admins remain.
Correct quoted version overrides and merged preview100% replay replace earlier unattributed1% reads.
Details and limits: docs/ITINERARY_CLOUDFLARE_MAIL.md. Story-ready/subscription mail and full data cutover remain open.

## 2026-10-09 — Daily collection of existing spot research

PR390 / merged runtime source `de5ab5b9eb406e57234a40b341cd036f6981bc43`; required CI37954783163 passed14m38s.
Twenty-two focused collection/auth/schedule tests, TypeScript/lint, pinned public-only OpenNext production build and scoped advisor review passed.
Artifact audit2316files/84private values/0hits; nilskopp account guard passed.
Production Worker `0a81e48c-8490-4dbc-a311-c187789f8b94` at100%, deployment `969998b6-cdc4-4864-96ba-31bc884d51e2`.
Rollback Worker `043e1752-23d6-4378-be1b-96a48f86f995` from source0ad0b530 is retained.
Preview `b9086f9a-768a-487a-8e93-bba8fca88220` at100% remains unchanged; both production admin IDs remain present.

The four schedules are unchanged. Existing daily03UTC cleanup also calls authenticated collect-only discovery.
Monthly research starts remain monthly; collection never starts or aborts an actor, prunes rows or imports public spots.
Read-only server-token checks proved October1 Jeju actor200/SUCCEEDED and dataset200/46items.
Actual hosted collect returned200/processed/30candidates; its saved source run is succeeded with zero active runs.
Candidate totals56→86:83pending/3rejected/0imported. Public spots remain3295.
A second authorized collection returned200/idle; unsigned collection401. Root/spots/sign-in/cities each200 after release.
No paid actor start, new schedule, public candidate approval, credential rotation or production application-data switch occurred.
The obsolete native importer remains disabled; source data still uses Supabase pending the separate cutover gates.

Private before/after row backups and exact hosted proof are under `/home/dev/.local/state/localley/discovery-completion-{before,after,live-collect,public-after}.json`.
Build/deploy/review logs and the artifact audit use the same prefix.
Rollback deploys the retained Worker version; collected pending candidates remain in the review queue, so no automatic source reversal is needed.
Future terminal404 handling for expired actor datasets is separate; this retained dataset was readable and processed.
The requested generation upgrade remains isolated in draftPR391:91focused tests and required CI37957191790 pass, but paid activation acceptance remains blocked by the weekly spend guard.

## 2026-10-11 — Candidate export preparation and safe preview rollback

PR394 final head `bae523f6769268ec384f13ec3fb43e0005c7f16e` merged as `bab461bf2ef2b5c3da67ec0bb4f462e79053b431`.
Required CI38170933866 passed9m27s; seventeen API/SQLite/page tests, typecheck, lint and public-only OpenNext build passed.
Scoped independent review found noP0/P1. Artifact scan2316files/84private values/0hits passed.
Preview Worker `80f3f002-9aba-4c1e-8676-2b4f24138327` was released for isolated acceptance only.

The first driver failed before fixtures because it counted protected `_cf_KV`.
The second passed37checks: owned API200, full export fields, private/no-store/noindex, foreign404, missing404 and anonymous401.
Normal preview returned404 without D1; desktop detail returned200 with the explicit candidate export link.
A popup URL assertion then failed without retaining the actual URL. Its cause remains unproved.
Mobile, popup content/reload and hosted escaping acceptance remain open. The actual desktop detail screenshot was inspected.
All55APP table counts returned to baseline, FK checks were zero and both fresh AUTH fixture sets were removed.
The two-attempt rule stopped further hosted acceptance. No production application data switched.

Preview was restored to `b9086f9a-768a-487a-8e93-bba8fca88220`, deployment `5a3fbdee-a516-4a3f-a09d-09c19b3ed30e`.
Production stayed `0a81e48c-8490-4dbc-a311-c187789f8b94` at100%; rollback `043e1752-23d6-4378-be1b-96a48f86f995` remains retained.
Final read-only proof at20:31UTC confirms both production admin IDs and six public HTTP200 responses.
Full hashes match for8users/5subscriptions/33usage/3295spots. The85itinerary check covers IDs only, not row-value parity.
Evidence: private `candidate-export-*20261011*`, `cutover-final-safety-20261011.json` and bounded source receipts under `/home/dev/.local/state/localley/`.

PR393 delivered the offline dependency inventory; its stable-host audit exposed ignored legacy copies.
The follow-up restricts scanning to tracked source and adds a real Git regression fixture.
Static access counts never certify migration, physical SQL history, or source-free runtime acceptance.


## 2026-10-12 — Optional Korean local-search references

PR396 (`ccf8ca19`) and runtime correction PR397 (`4990d725`) passed reference acceptance; final delivery is held.
Required CI38257530031 and38261980776 passed;14focused tests,41health tests, exact OpenNext build and scoped artifact audit passed.
Worker `d37e80b7-c717-49a7-98a4-11bde0ea7dc3`, deployment `a79d8a19-bf10-4df0-b589-397574f5ba5d`, was withdrawn.
Stable pre-feature rollback: `0a81e48c-8490-4dbc-a311-c187789f8b94`. Keep native quota/cache holds intact.
Eighty-six live checks pass for Seoul/Busan/Jeju references, repeats, invalid cities, strict IP limit and nonpublic server key values.
Dedicated reference D1 `44b8b59c-a44d-4b42-ac03-40508c3eee89` shares atomic2000UTCday admission and seven-day holds.
Four earlier reservations preceded two new public reservations; counter6. Cached repeats added zero calls.
The temporary protected probe is deleted. Existing spots, map providers, admin IDs and source counts are unchanged.
Preview remainsb9086f9a. Production app data still uses Supabase; full data cutover remains gated.
See [Korean local-search references](../NAVER_LOCAL_REFERENCES.md) for exact tests, review scope, runtime diagnosis and receipts.

The release safety audit found an embedded preview read-only default without a production override.
Production was restored to stable0a81e48c. Reference results alone did not prove source-write safety.
An explicit productionfalse/previewtrue configuration and regression now await CI and signed-in write acceptance.
No reference gate is closed from the withdrawn release; the native cache/counters and source snapshots remain retained.


## 2026-10-12 — Production write safety and final reference release

PR399 exact9ba1838/requiredCI38264796013SUCCESS13m59s mergedd0159b2.
It pins productionSUPABASE_READ_ONLY=false and previewtrue;23focused tests pass.
The unchanged verified3046ed9 Worker artifact serves with the new explicit deployment flag.
Worker `5af2a5f3-5a6f-4edc-96d8-9c157f8f4db0` runs100%, deployment `14f3664b-f20e-47f3-a52f-f94a025f7ece`.
Stable rollback is `0a81e48c-8490-4dbc-a311-c187789f8b94`; preserve native reference holds and counters.
Native metadata confirmsfalse, both NCP secrets and no preview application DB binding.
Fresh verified nonadmin profile writes plus normal trip save/readback/API reload pass19checks and exact cleanup.
Final reference/cache/400/429/key-scope proof passes84checks; native counter6to6, no external query repeat.
Both admins, source counts8/5/33/85/3295 and four public200 pass. Preview remainsb9086f9a.
This replaces the withdrawn d37e80b7 release. The photo source repairs remain separate; source data still uses Supabase.
See [Korean local-search references](../NAVER_LOCAL_REFERENCES.md) for the baseline, final write proof and known limits.

### Candidate export acceptance — 2026-10-12

PR394's private D1 HTML export passed49 hosted checks through preview78cf5737
at1%/deployment8e4241f6, using quoted version overrides. Actual desktop/mobile
links and reloads passed; four screenshots were inspected. Exact cleanup
restored55 table counts and removed both temporary auth fixtures. Guarded
rollback restored previewb9086f9a100%/deploymenta25ac5d9. Production5af2a5f3/
14f3664b, two admin IDs, source counts8/5/33/85/3295 and four public200 remain
unchanged. See `docs/CLOUDFLARE_D1_PROJECT.md` for scope and private receipts.
No production D1 switch or paid generation occurred.

## 2026-10-12 — Generation runtime upgrade

PR391 head `0559441bf5f3670c81a71fbcf21fc7e48728ac13` merged as `bb76387`.
Required self-hosted CI38274196099 passed13m57s;93 focused tests, TypeScript and pinned OpenNext build passed.
The merged runtime files equal the checked artifact source. Scoped owner review resolves its original premise finding.

Production Worker `c166de78-32b6-46f9-a3c5-afae8e6ebd42` serves100%.
Deployment `2f501bf1-c829-4075-8009-fbf77c74fff3` retains normal source writes.
Rollback is `5af2a5f3-5a6f-4edc-96d8-9c157f8f4db0`.
Production application data remains Supabase. No application-data switch occurred.

The text primary is gpt-6-luna; new generated images use gemini-nano-banana-2.1.
Story controls have generic labels and no provider selector. Existing media format, storage and quota rules remain.
Local SDK receipts7055ef468ba4/fac443ad7662 passed one text and one image request, estimatedUSD1.02.
The real JPEG rendered through prefetched dataURI and consumed ImageResponse locally.
Artifact scan checked2328files/76761734bytes against92 private values with zero unexpected hits.
Five exact existing public Kakao server aliases were retained; no browser alias match was found.
Artifact tree SHA256 is `7f556d80b0a0f5beb3605f9f48c8ce2d922a1cc90b6af71dc95a1656e1359c41`.

Preview acceptance used `6dca825c-9e72-4073-976e-8da7e5efa168` at1% with quoted overrides.
The candidate had explicit generation enabled, readonly source, outbox mail and false tier bypasses.
The existing server Gemini key was bound to that inactive version without rotation.
Thirty-five hosted checks passed. Receipt1215c0ad3e2c records the single paid hosted image, estimatedUSD1.00.
Private R2 JPEG980908bytes/hash/MIME, exact3credit use, cache-only repeat, owner denial and actual story rendering passed.
The final consumed PNG was1080x1920/3518698bytes; its screenshot was inspected.
PNG SHA256: `1e46cb5118710affb3e869230f68081757ac46b0a3a65b23f54c711d31741de0`.
Exact55 application table counts, foreign keys and both auth fixtures were restored.
The actual test endpoint awaited R2 deletion; no independent physical R2 HEAD proof is claimed.
Eight watchdog guards passed; preview returned to b9086f9a100%, deployment315632a9, and its timer stopped.

Production acceptance passed23 checks with a real verified fresh nonadmin login.
Actual profile/subscription hooks, trip save/read/reload and one chat reply passed; chat usage persisted.
Receipt522b61add6cb records the live chat call, estimatedUSD0.02; it returned114characters without fallback.
The temporary Pro entitlement affected only the fresh test owner; no Stripe request or customer charge occurred.
Exact source/auth fixture cleanup passed. Both admins,8/5/33/85/3295 source counts and four public200 remain.

Desktop/mobile story UI acceptance remains open after two setup failures.
The first lacked the package-default browser; the second selected two responsive Stories buttons.
Both attempts removed their exact fixtures; neither started a paid call.
No screenshot or UI acceptance is claimed. Next verification needs an explicit installed browser and visible-control selection.
Private receipts are retained under `/home/dev/.local/state/localley/generation-upgrade-*20261012*`.

## Story-ready Cloudflare mail — 2026-10-12

PR4040bc01b1 / requiredCI38281236657SUCCESS / merge206476e.
Runtime Worker5814fa95-8fd2-45b9-8d85-243fc8de49b2 at100%.
Deployment6abdf686-fe5e-4a58-9af5-ce8251ea32cf; rollbackc166de78-32b6-46f9-a3c5-afae8e6ebd42.
Pinned build,29 tests/type/lint and scoped noP0/P1 review passed.
Guarded preview29 checks passed; exact R2/D1/auth cleanup and stable preview restoration passed.
Production37 checks include one received story email, real owned saved slides and received-link access.
Receipt171719a7559a records estimatedUSD0.01; there was no resend.
Exact Source storage/rows/auth/quota cleanup passed. Both admins, counts8/5/33/85/3295 and four public200 remain.
See docs/STORY_CLOUDFLARE_MAIL.md for scoped proof and limits.
Subscription mail still uses Resend. Application data remains Supabase; no D1 production switch occurred.

## Source story serving and upload capacity — 2026-10-12

PR407442183c / CI38288943823SUCCESS10m08s / merge5f0e6d8.
PR406f76ddb0 / CI38290914810SUCCESS11m56s / merge4a030a7.
Scoped reviews,21 and38 focused tests/type/lint, pinned builds and zero-unexpected-private-key audits passed.
Current Workerb4d426e2-1952-4f7b-9989-67142b47053f serves100%.
Deployment0385cd50-8091-4ab4-aec7-f208d15cb496; rollback8b4db9c2-8117-46e1-a2a4-f887942c5b4f.
Three retained actual3.5MiB PNG parts saved in one request, with signed URLs and exact Source media hashes.
The final independent API acceptance passed53 checks, including two-owner denial and exact storage/Source/Auth cleanup.
Both admins, source counts8/5/33/85/3295 and four public200 remain unchanged.
Source gallery device proof stopped after two harness failures; no screenshots or device pass are claimed.
Legacy public saved links, gallery expiry/orphans, subscription Resend and full D1 cutover remain open.
See docs/STORY_SOURCE_ACCESS.md and docs/STORY_UPLOAD_CAPACITY.md for scoped evidence.

## 2026-10-13 — candidate chat backend

PR409fe38850/CI38342593336SUCCESS17m47s/merge4b4e305 passed45focused tests, type/lint/pinned build and scoped reviews. Guarded candidate0f81bd62 at1% passed36hosted API checks: one real reply, saved history/reload, foreign/unverified/conflicting denials, atomic quota/isolation and exact55APP/Auth cleanup. Receipt67824a9d2719USD0.05 retained. Eight recovery tests and actual restoreb908/c4380814 passed.

Default preview9cf5bafd/deploymentec239595 released04:11:41UTC with generationfalse; rollbackb908. Final default-disabled proof passed12checks at04:23:07UTC: actual503, no counter/owner writes, exact Auth cleanup, all55application counts and foreign keys restored. Productionb4d426e2/0385cd50 remains unchanged; source/admin/fourpublic200 proof passes. See `docs/D1_CHAT_CANDIDATE.md`. This is backend acceptance, not candidate browser chat or a full application-data switch.

## 2026-10-14 — candidate browser chat

PR41689c427c/CI38418856780SUCCESS11m13s/mergeaf6dead passed68focused tests,
scoped review, type/lint/pinned build and zero-unexpected-private-value audit.
Guarded1% version386b740c passed49hosted checks: actual desktop/mobile submissions,
one paid request each, owned history/reload, denials and exact55APP/Auth cleanup.
Four screenshots were inspected. Receipts187600454aa5/d882147cc6cf total estimatedUSD0.10.
Recovery restoredae129c85/c56edfac. Default previewb010d40b/deployment2e305896
keeps generationfalse; rollbackae129c85. Final13checks prove503, no quota/owner
writes, absent composer and exact cleanup. Productionb4d426e2/0385cd50,
Source8/5/33/85/3295,twoadmins and fourpublic200 remain. See
`docs/CANDIDATE_CHAT_HISTORY.md` for exact identities, attempts and scope limits.
No production application-data switch occurred.

## Stripe live billing — 2026-10-14

Nils selected live mode and removed the sandbox setup prerequisite.
See [the Stripe live receipt](../STRIPE_LIVE.md) for configuration, safety checks, release and rollback evidence.
Production application data remains Supabase until the full cutover gates pass.


### 2026-10-14 — server database health monitoring

PR422/b906a5ae, requiredCI38560997777 and merge7a82e90d deliver the existing daily service update.
All48focused health checks and the read-only review passed.
The service now performs one bounded, read-only database probe from stable main.
Its real12:16:55UTC run correctly returns nonzero for the Source timeout.
Root/sign-in remain200; uncached city reads fail. No database recovery is claimed.
Productionb4d426e2/2f2bd3fb and previewdc5b3560/8040001b remain100%; no Worker deployment occurs.
See [Production user health](../PRODUCTION_USER_HEALTH.md#source-database-monitoring-release--2026-10-14) for evidence and unit rollback.
Stripe421 stays draft. Supabase management access and successful hosted billing checks remain required.


## 2026-10-15 — live Stripe checkout release

PR421185a8716/requiredCI38574737099SUCCESS/mergeee7336b4 passed62focused tests, lint/type/pinned build and independent code review.
Audited immutable production versionc674089a-8f92-4f7e-b4a1-dca4c7685e32 now serves100%.
Deployment4cd627fe-f874-4520-a458-6817d4c3e931 activated11:27:01UTC; default health and signature checks passed.
Guarded live acceptance passed77checks across four prices and actual desktop/mobile hosted payment forms.
All four unpaid sessions expired; empty owned customer and exact Source/Auth fixture cleanup passed.
Four screenshots were inspected. No card or charge was used.
The existing Premium trial was reconciled from canonical provider state without changing Stripe or other Source rows.
The actual default billing portal now offers all four existing live choices; expanded catalog readback passed.
Final22checks preserve both admins, Source counts8/5/33/85/3295 and all unrelated billing data.
All release timers are inactive. The prior Workerb4d426e2 remains retained, subject to combined account rollback.
See [Stripe live billing](../STRIPE_LIVE.md#production-release--2026-10-15) for exact evidence, review limits and recovery order.
This is live unpaid checkout acceptance, not a completed purchase or full D1 cutover.

## Spot card photos — 2026-10-15

The default discovery cards now use full-width 16:10 photos on mobile.
Photo credits use 11px text below the image, with Google Maps and photographer links preserved.
Rounded cards, visible 44px save controls, and two-line titles improve the mobile layout.
List cards also use full-width mobile photos. Related spots and stored itinerary thumbnails retain readable credits.

- Code: [PR426](https://github.com/nkopp-cmd/travelchat-ai/pull/426), tested `3f7b5deeecae167ec323083e5a6ec044f711225c`, merged `e8cb792fdb26fc16873acf2623f2decef2c428d4`.
- Required self-hosted CI: [38738468249](https://github.com/nkopp-cmd/travelchat-ai/actions/runs/38738468249), success for the exact tested commit.
- Production Worker: `localley-next`, version `ca4dfaf3-1d5d-4798-9957-257738fb7c01`, 100%.
- Deployment: `7942f312-bcae-4b0e-973a-838864596ba1`, activated 13:20:31 UTC; health passed at 13:21 UTC.
- Rollback: retain `c674089a-8f92-4f7e-b4a1-dca4c7685e32` and deploy it at 100% if required.
- All 55 production binding definitions match that rollback version. Billing configuration and application data remain unchanged.
- Preview candidate `b6f07d6d-6a21-4660-a085-f8ebe543faa5` passed and restored prior `dc5b3560-68ee-4a31-88a9-13cf49cfdae3`.
- Production canary `8c9b9e73-12a7-4bc7-a577-a08cb7908697` passed and restored the prior Worker before the merge and promotion.

### Checks

Run `npx vitest run __tests__/components/itinerary-activity-card.test.tsx __tests__/components/spot-card.test.tsx __tests__/components/spot-photo-image.test.tsx __tests__/components/spots-scroll-layout.test.tsx __tests__/components/preview-save-spot-button.test.tsx --maxWorkers=1`: 32 tests pass.
Focused ESLint, TypeScript and the pinned `npm run cf:build` pass.
Artifact tree `e3dcbac75e1a59725fe70604b06c7347b5648b42bc5acb1b4463677a412bc95a` scans 2,330 files and 94 private values with zero new hits.
Five existing public server alias exceptions remain unchanged.

Local layout checks pass 31 assertions with retained real photo bytes.
Hosted preview passes 37 checks and nine screenshots at 320px, 390px and 1440px.
The production canary passes 41 checks and twelve screenshots, including real gallery/image acquisition and detail heroes.
Exactly two controlled Google requests cost an estimated $0.10. Subsequent sizes reuse those received bytes.
Default production passes 40 checks and twelve screenshots without a version override, using the retained current photo responses.
These checks cover full-width photos, computed 11px credits, author links, 44px controls, list/grid views, sign-out save redirects, hero layout, no overflow, and controlled image failures.
Mobile and desktop screenshots were opened and inspected.
Public pages, cities and a harmless signed webhook probe return 200; the billing contract remains `2026-10-14`.

Private evidence remains under `/home/dev/.local/state/localley/spot-polish-*20261015*`.
The first immediate preview probe saw the previous layout and restored safely.
The second probe normalized the override header and waited 60 seconds for propagation; it passed.
Local auth interaction is excluded because the local process lacks `AUTH_DB`; hosted checks prove the real save redirect.
Draft388 retains its separate backend deduplication work. This release changes photo presentation and performs no data migration.


## 2026-10-16 — isolated D1 push storage, preview only

PR424bd569813/requiredCI38760992592SUCCESS merged d53367f0; exact tested and squash trees match31d4599e.
Local14route/14Node tests, focused lint, TypeScript, pinned OpenNext build and bounded reviews passed.
Artifact scan2328files/94private values found0private matches; five existing public Kakao server aliases remain documented.
Candidate-only0032 passes66checks with a saved Time Travel bookmark and demonstrated failed-batch schema rollback.
Existing table schemas/counts/FK0 remain intact except the intended ledger entry. Do not reapply0031 or blanket migrations.

Preview6d621d4b-0747-4ace-afe9-14b987402037 runs100%, deployment69c96bf1-a014-4599-adbc-155b6ff0c069.
Rollbackdc5b3560-68ee-4a31-88a9-13cf49cfdae3 was actually restored after the1% canary.
Canary44checks and default44checks verify actual signed-in storage, concurrent ownership/cap, isolation and exact cleanup.
All56candidate table counts, verification count, both production admins and Source users/subscription hashes remain unchanged.
Both recovery timers are inactive. No delivery, VAPID, producer, Source schema or production Worker change occurred.
Production still runs ca4dfaf3-1d5d-4798-9957-257738fb7c01, deployment7942f312-bcae-4b0e-973a-838864596ba1.

Fresh Stripe read-only15checks confirm the existing four-price hosted proof and default portal choices.
All four proof sessions remain expired and unpaid. No new session, card, charge or purchase was created.
Fresh Source REST/auth/storage return200in480/460/461ms. Full application-data migration remains gated.
See docs/D1_PUSH_STORAGE.md for exact commands, receipts, schema hazard and remaining scope.


## 2026-10-16 — candidate ledger reconciliation

PR4295cd35b6f/requiredCI38972957408SUCCESS merged3aca92f7 with the exact tested tree3c7f6a25.
The tool validates thirteen original hashes and executes the canonical schema once, fixing duplicate base execution.
Eight focused tests, scoped lint, complete87object comparison and remote32286byte EXPLAIN849rows pass.
The actual11853219byte export restores locally;10rehearsal checks restore rows and sequences through rollback.
Protected engine rows remain outside the exported-data claim.

The guarded metadata operation passes17checks, adds only0001–0013/0031, and repeats with0changes.
All55application table hashes/counts, all old ledger rows, schemas, foreign keys, workers, admins and Source hashes remain intact.
Ledger entries and the intended sequence advance18to32. Wrangler reports0pending at the pinned candidate binding/directory.
Immediate bookmark000000de-00000000-00005106-3bf100b1ff5aaa1112770457ed483a6a is retained privately with operation receipts.
Preview6d621d4b/69c96bf1 and productionca4dfaf3/7942f312 remain unchanged. No runtime deploy or Source write occurred.
See [the ledger procedure and evidence](../D1_LEDGER_RECONCILIATION.md). Full production data migration remains open.
