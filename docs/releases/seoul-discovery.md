# Seoul Discovery Release

## Persistent AI request limits — 2026-09-20

- PR [145](https://github.com/nkopp-cmd/travelchat-ai/pull/145), repository `nkopp-cmd/travelchat-ai`, branch `cloudflare/full-migration`.
- Source `12fe72b2d3f6bacb808f3172b66b90e0beb3828f`; merge/tag `b67bfa7049748c861e07c022957862013a4ad935`.
- Candidate CI `35498299859`; merge CI `35498760481.1`; both passed. Native check: 271 tests, types and lint passed.
- Worker `6133e462-5664-4048-8081-eb3bce615d62`, 100%; deployment `fd21cc3b-a981-42f6-94ec-275861b65b53`.
- Data remains EU D1 `localley-migration-preview` (`e943548b-01ae-485d-9219-e2a46cb0da8e`).
- Backup `.preview-private/ai-reservations-pre-b67bfa7.sql`, SHA-256 `1c7e1c98464c9558b65827341914fbecd5d44ddc3c5e148a495174ebaa238b07`.
- Restored backup locally: integrity check `ok`, eight visible spots. Rehearsed migration with integrity and foreign-key checks.
- Remote migration `0010_ai_requests.sql` applied through Wrangler migration tracking. Read-only verification found one migration record, zero attempts, eight visible spots.
- Live health 200 `{ok:true}`; sessionless chat GET 401. No paid provider calls or hosted user mutations during this release.
- Rollback Worker `dfeb140c-9e1c-46af-9ee4-b0987f3f3d9a`; retain the additive table and reservation evidence. Previous Worker lacks these caps.

Chat now reserves each provider attempt before calling Luna. Atomic limits: 20 per owner and 100 globally per UTC day.
Completed and uncertain outcomes count; reservation failure prevents a new paid request. Native tests cover concurrency and accounting failure.
This is persistent request accounting, not token billing or full AI itinerary generation.
Hosted signed-in acceptance remains open because the available Access service identity is read-only.
Advisor review was unavailable due to its weekly subscription limit; no paid fallback was used.
Gravity's evidence command returned `independent_evidence_rejected`. Submitted evidence remains in `.preview-private/gravity-preview-release-145.json`; acceptance is not claimed.

## Luna runtime correction — 2026-09-20

- Repository: `nkopp-cmd/travelchat-ai`; release branch: `cloudflare/full-migration`.
- PR: [144](https://github.com/nkopp-cmd/travelchat-ai/pull/144).
- Source: `3875cbc3971b7881734aa8ed7186904b385f87df`.
- Deployed merge/tag: `3c400317572af1f568522916cf40974950751cbc`.
- Candidate CI: `35493559313`; exact merge CI: `35493816764.1`, both passed.
- Local native check: 264 tests passed, including 15 new provider-path checks; types and lint passed.
- Worker: `localley-discovery-preview`, version `dfeb140c-9e1c-46af-9ee4-b0987f3f3d9a`, 100% traffic.
- Deployment: `c24f8752-0348-4965-8dd9-9da076673f2a`.
- Data: EU D1 `localley-migration-preview` (`e943548b-01ae-485d-9219-e2a46cb0da8e`); no migration or data mutation in this release.
- Rollback Worker: `4141b23e-d59e-44a1-bd1b-3ef5dfca2e5d`. This restores the prior catalog fallback and its broken provider call.
- Live read-only checks: `/api/health` returned 200 `{ok:true}`; `/api/spots` returned eight spots; unauthenticated `/api/chat` returned 401.
- The existing Access service token was refreshed in place through `2026-09-21T06:18:29Z`; policies were unchanged.

The prior adapter used `redirect: "error"`, unsupported by workerd. Its exception was swallowed into the catalog fallback.
The replacement rejects redirects using `manual`, rejects incomplete/refused/wrong-model responses, separates instructions from input, and bounds provider responses to 64 KiB.
Only completed text is attributed to Luna; catalog fallback retains its own model label. No retries or alternate paid models are added.

One real **host adapter** probe returned completed Luna output: `resp_06da74f5c0ce31fb016aaf76f1bd5887d2a1e2c272030807cb`, 82 input / 6 output tokens.
Native workerd tests exercise the provider request with mocked outbound responses. Neither result establishes a hosted signed-in chat journey.
The read-only Access service identity cannot execute chat POST. Hosted human acceptance remains open.
Advisor read-only review timed out; no approval is claimed.
Gravity's documented evidence command returned `independent_evidence_rejected`, including on an IPv4 retry. No acceptance is claimed.
Submitted evidence remains in `.preview-private/gravity-preview-release-144.json` for reconciliation.

The remaining migration includes AI itinerary generation with durable usage accounting, full product UI, stories, billing, admin, account/import acceptance, and public cutover.
Older release identities below are historical checkpoints.

## Current-Week Trends - 2026-09-13

PR [136](https://github.com/nkopp-cmd/travelchat-ai/pull/136) delivered the official Tsukiji YouTube path for UTC week `2026-09-07`.
Checked source `14a7f538a5aa07dcdcfaf6eeab02ec2984fe6e84`; merge `9aaec81bea7cef06c4922a439e21045b3b14c06e`.
Exact merge verify run `34727683016.1` passed. Active Worker: `9b778bad-0fba-486b-81fa-c085f461c806`, at 100%.
Deployment ID: `384eafca-f6f8-47e4-a360-eddb0b3bc544`. Rollback Worker: `b94b6afb-46af-49a1-a08b-ade404c564b2`.
Backup SHA-256 `69f90ce719fa0bad255ecc0acb8c095330e4b5ea2ea3a46c0fe82aeac1f113f0`. Migration 0008 applied after restore rehearsal.
Live publication accepted one post and one rank: video `J0K2Vpm7JEw`, published `2026-09-09T08:00:21+00:00`, 565 views, four metrics null.
Canonical spot `65063bf2-32ad-44e8-8de4-8918fe074755` was unchanged. Hosted browser checks at 390/900/1440 passed on 2026-09-13 before expiry.
Gravity accepted coding evidence for `current-week-trends-product` and restricted-preview release evidence for PR136.
The snapshot expired `2026-09-14T00:00:00Z`. On 2026-09-14 the live API correctly returned `unready` with zero rankings for week `2026-09-14`.
The official YouTube feed then returned HTTP 404 without following redirects. The market RSS is a 2019 WordPress stub. Mastodon/Lemmy samples had no eligible current-week venue match.
Do not present the expired September 9 post as current. Coverage remains one reviewed venue-owned channel, not city-wide.
See `native-channel-trends.md` for pipeline, receipts, and this week's empty-supply review.
SQL access, six deferred image rights, hosted human recovery, and full account cutover remain separate gates.
Older deployment identities below are historical checkpoints.

## Account Recovery - 2026-09-12

The blocked image-rights question was cleared without granting outreach or reuse. The six items remain deferred in NEEDS.
Independent account work shipped through [PR135](https://github.com/nkopp-cmd/travelchat-ai/pull/135), merge `b3ba5e2e827b36e1993934f240bdd275048ad247`.
Exact merge verify run `34718132382.1` passed. Active Worker: `b94b6afb-46af-49a1-a08b-ade404c564b2`, at 100%.
Deployment ID: `f938e403-7f41-4f58-94c9-0b4c69db8805`.
Observer refresh is bounded, malformed verification flags fail closed, and stale recovery feedback cannot affect a newer account check.
All eight public rows, reviewed images, bindings, policies, and the active hourly transfer remain unchanged.
Gravity accepted the restricted-preview release evidence. See `native-account-boundaries.md` for exact source, tests, backup, rollback, and live receipts.
SQL access, real current-week social evidence, hosted human recovery, and full account cutover remain separate unverified gates.
Older deployment identities below are historical checkpoints.

## Reviewed Park Photo - 2026-09-12

PR [134](https://github.com/nkopp-cmd/travelchat-ai/pull/134) delivered the licensed 2018 park landscape without changing its UUID or coordinates.
Deployed merge: `ebc1e8c62f70495681c4b362a1c253fd8afc1785`; exact merge verify run `34712538658.1` passed.
Active preview version: `cffeadb7-083e-428f-95d7-8093106e35a1`; deployment `d91088ac-d931-4d95-89d2-449dd2392c0d`, serving 100%.
All eight public venues now have working reviewed images with attribution. The other seven records remained unchanged.
An actual repeated native transfer accepted thirteen identities and preserved public rows. The existing hourly schedule remains active.
Actual hosted checks covered eight images and 24 map/list selections at three widths. Park screenshots were opened.
See `park-photo.md` for exact source, database, relationship-rehearsal, replay, backup, rollback, and user-journey evidence.
Gravity accepted the restricted-preview release only. `usable-native-discovery` remains unverified because six business-image rights gates remain unresolved.
Older Worker identities below are historical checkpoints, not the current preview.

## Native Account Release - 2026-09-12

PRs [132](https://github.com/nkopp-cmd/travelchat-ai/pull/132) and [133](https://github.com/nkopp-cmd/travelchat-ai/pull/133) delivered bounded native auth and ownership safeguards.
Final deployed merge: `18f43472126bc5260ed51db3ae76ec4a02de4733`; exact merge verify run `34707616147.1` passed.
Active preview Worker version: `b4b364de-1721-402b-8fd3-4b342267baef`, serving 100% at `https://preview.localley.io`.
Cloudflare deployment ID: `c5ef3681-60de-4fcb-9e86-3a79371fbdbc`.
No schema migration ran. All eight public records and the checked private tables stayed unchanged; the hourly transfer remains active.
The native checks cover session preconditions, expiry/revocation races, stable legacy ownership, consent, and local password recovery.
Live asset, catalog, map, and private-denial checks passed. The generic-denial email notice was corrected after screenshot review.
Gravity accepted both the native coding evidence and the registered restricted-preview release evidence.
See `native-account-boundaries.md` for exact commits, checks, backup, rollback, and retained private receipts.
Production SQL credentials remain unavailable. The production website returns HTTP 200, but its metadata API currently returns 403.
The preserved production identity remains the last verified `e96b003` / `dpl_FA3tzDj3zDmxLGEFEjvoXv7d6rgg`, not a fresh provider verification.
Hosted human recovery/email, customer import, remaining native routes, and full production cutover remain open.
Older Worker identities below are historical checkpoints.

## Social Evidence Integrity - 2026-09-12

PR [131](https://github.com/nkopp-cmd/travelchat-ai/pull/131) delivered strict UTF-8 handling and retained new source-review decisions.
Host command source: `4293c5d2c8af90414cb1a915a3301098d81cce34`; exact merge verify run `34701338235` passed.
The installed command processed the actual private feed without publication, invented metrics, or paid calls.
Gravity accepted coding evidence for `venue-social-next`. Exact private receipts and rollback references are in `../native-social-review.md`.
The Worker identity below remains active. All eight public records and the hourly transfer stayed unchanged.
Six image-rights gaps and real current-week social acceptance remain open; they do not block independent native migration work.

## Native Preferences - 2026-09-12

PRs [129](https://github.com/nkopp-cmd/travelchat-ai/pull/129) and [130](https://github.com/nkopp-cmd/travelchat-ai/pull/130) delivered native email preferences.
Deployed merge: `b2cabd6c75a7e1b055c7537a3553ab2a4c95fc26`; final GitHub verify run `34698529510` passed.
Protected preview Worker version: `5bf95956-8bba-4158-9c8a-c2e8a81f6b51`, at 100%.
Deployment identity: `f521bb8d-553b-4c31-9429-86bb08fe9b04`, at `https://preview.localley.io`.
Additive D1 migration 0007 passed backup restoration and rehearsal before installation.
All eight public records stayed unchanged. The hourly transfer remains active; no ingestion was repeated for this release.
The actual settings controls passed local authenticated HTTPS tests and reviewed screenshots across three widths.
Live assets, catalog, maps, and denied private access passed. Hosted human sign-in/recovery remains unverified.
Gravity accepted the exact merged coding evidence but rejected independent release evidence. Its release gates remain open.
See `native-email-preferences.md` for the exact checks, data location, backup hash, rollback version, and private receipts.
Existing Vercel production, six image-rights gaps, native current-week social acceptance, and production SQL access remain unchanged.
The older preview identities below are historical checkpoints, not the active Worker.

## Host Ingestion Verification - 2026-09-12

PR https://github.com/nkopp-cmd/travelchat-ai/pull/128 merged as `0933208e4095354d92c3f3d78687dbc117d22bd3` into `cloudflare/full-migration`.
The host checkout installed this importer. The existing transfer command passed live verification at `2026-09-12T11:44:34.043Z`.
It accepted thirteen identities and preserved all eight public records. Candidate observations remained monotonic.
The existing hourly timer remains active and unchanged. The Worker bundle was not redeployed.
[Merged-commit verification](https://github.com/nkopp-cmd/travelchat-ai/actions/runs/34691652711) passed application, native, PostGIS, TypeScript, and lint checks.
Gravity accepted the merged commit's coding evidence. Full release verification remains unverified; no shared engine settings changed.
Persistent data remains in EU D1 `localley-migration-preview`, ID `e943548b-01ae-485d-9219-e2a46cb0da8e`.
Importer rollback source is `70d8b7551cd9f206fc9580e0dcf3c2b52ae7fd00`; preserve data and timer configuration during rollback.
Exact receipts, private evidence paths, unchanged public digest, and remaining gates are in `../native-scrapelet.md`.
Production SQL access, six image-rights gaps, current-week social evidence, and full migration acceptance remain unresolved.

## Native Provider Update — 2026-09-12

The native-provider checkpoint was PR https://github.com/nkopp-cmd/travelchat-ai/pull/127, merge `b965d3d9e631deb93dd6a23575ccb364c3d937e7`.
Worker version `7e9c2a7c-2c5b-406b-8160-9ae705d7271c` served that tag before the native preference release.
Four reviewed native venues were added without changing the original four rows; eight places are visible.
The preview holds thirteen candidates, seven exact source matches, six unmatched candidates, and no foreign-key violations.
All image, notice, source, map, and live browser checks passed. The working hourly transfer timer remains unchanged.
Scrapelet PR4 is live on its designated server, with both browser-worker PIDs preserved and zero paid budgets unchanged.
Full evidence, backup hashes, conditional rollback, and exact remaining provider-replacement gates are in `../native-scrapelet.md`.
Production Supabase installation remains blocked by missing SQL access. Six image-rights gaps and current-week social acceptance remain open.
Paid Apify schedules and the existing Vercel production application were not replaced.
The earlier collection/editor checkpoint below remains historical evidence, not the latest preview version.

## Current Delivery Status

Verified on 2026-09-11. This section supersedes the historical Vercel release identities below.

- Repository: `nkopp-cmd/travelchat-ai`.
- Production remains on commit `e96b00356d955ed6b777f5fd139ce1652accf09d`.
- Preserved Vercel deployment: `dpl_FA3tzDj3zDmxLGEFEjvoXv7d6rgg`.
- Read-only Vercel API verification confirmed no Git connection. No Vercel deployment was created or reconnected.
- Delivered increment: `feature/native-collection-delivery`, based on `b5b4cc30de15178a54caccaabb8eaee3edf57a2c`.
- Source checkpoint committed and pushed: `2732900dfe0ae5933aedb226ea5699bc869cffe9`.
- Reviewed PR: https://github.com/nkopp-cmd/travelchat-ai/pull/123, merged into `cloudflare/full-migration`.
- Deployed merge commit: `c5d1446941049bd8663adec1bf6f654e0f4b6cac`. The unfinished migration history was not merged into `main`.
- Authorized migration target: `localley-discovery-preview` at `https://preview.localley.io`, protected by Cloudflare Access.
- Current preview version: `7b5ad3c3-f6bf-4bb9-97c9-85e86729bd3a` at 100%, tagged with the deployed merge commit.
- Preview code rollback: `88de0da0-0e10-4e4e-9cf7-1f12b4be1c04`.
- Persistent preview data: EU D1 `localley-migration-preview`, ID `e943548b-01ae-485d-9219-e2a46cb0da8e`.

Remote preview verification found three public places and zero users, sessions, owners, saved places, or mail jobs.
Migration 0005 was applied to the isolated preview after backup restoration and rehearsal.
Post-migration checks preserved the three spots and all zero account/session/save/mail counts; the new itinerary table is empty.
The updated Worker and actual native Trips entry were deployed after final checks and reviewed merge.
The private SQL backup is `.preview-private/pre-collection-delivery.sql` under `cloudflare/auth-proof`.
Its SHA-256 is `557946b171e742ca498cc6783dfee457d2dc6c2d8da86af378cf3adf787f68f4`.
An in-memory restore and migration rehearsal preserved all existing counts and passed foreign-key checks.
This is preview restoration evidence, not a production customer-data restore rehearsal.
Prefer Worker rollback while retaining additive schema and data; do not overwrite records created after a backup.

Native collection/deletion now uses the existing cards, confirmation dialog, and editor.
Local acceptance covers cancellation, pagination, owner isolation, account changes, and deletion focus restoration.
The final actual-component journey passed 35 checkpoints with no product issues or external requests.
Independent review findings were resolved, including wrapper metadata preservation.
Final combined checks passed on 2026-09-12: 2,081 root tests, 93 native tests, both browser suites, and 57 PostgreSQL checks.
The production build and TypeScript passed. Full root lint reports zero errors and 63 warnings.
PostLabz's priority jobs were allowed to complete before these checks continued through the shared runner.
See `native-collection-delivery.md` for exact scope, limits, review disposition, and remaining production gates.
Live verification on 2026-09-12 confirmed the deployed Worker version, commit tag, and matching JavaScript/CSS hashes.
The app JavaScript SHA-256 is `c64a266ebe027eca2e87c9a8fd2157bd831d8d526c67f419b5dd3ccf886627f1`.
The app CSS SHA-256 is `8133db31994b20ed68e9d86036e0b1491b1140ed474968c68d9591d776b484d2`.
Anonymous preview requests redirect to Access. Authorized service reads reach health, configuration, and catalog endpoints.
Private session and itinerary reads return 401 without a Better Auth session. Service-authenticated mutation attempts return 403.
Live desktop, tablet, and mobile screenshots were opened. Both photos, real map tiles, selection, and the gated Trips tab worked.
No browser page errors occurred. Hosted checks sent no email and created no account or itinerary.
Post-verification D1 counts remained three spots and zero users, sessions, owners, saves, mail jobs, and itineraries.
Vercel provider metadata still identifies `e96b003` and `dpl_FA3tzDj3zDmxLGEFEjvoXv7d6rgg`; its Git connection remains absent.

Full production migration is not complete. Native creation, generation, sharing, billing, remaining server routes, and customer identity import remain unfinished.
Hosted human authentication, recovery, migration rehearsal, and complete application acceptance remain cutover gates.
The available Access service credential is deliberately read-only. It cannot substitute for a human Access session in signed-in live acceptance.
Necessary validated configuration and migration work is authorized by the updated delivery contract; repeated routine approval is not a blocker.
Preview success must not be reported as completion of production migration.
Only owned, regenerable integration fixture bundles were removed after verification. Unique reports, screenshots, backups, source, and active caches remain intact.

## Historical Release

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
