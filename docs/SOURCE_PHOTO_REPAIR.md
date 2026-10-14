# Bounded source photo repair — 2026-10-01

Nils explicitly authorized source errors repair. The application-data D1 move remains paused.

## Wrong landmark

The Daesin-dong Old Town record `42726b65-cba8-4266-97f4-eca6a9dc7d9b` contains three photo references for Google listing `ChIJTwlXpoSifDURJOCAoUd4JoM`. Received Google details identify Dongnimmun Arch, at 37.5724017,126.9595303. The saved source point is 37.5654,126.9456, 1.454 km away. Keep the existing 1 km identity guard; do not display that landmark as this venue.

`scripts/photos/quarantine-source.mjs --dry-run PRIVATE_BACKUP.json` saves the original row privately and proves an exact ID/name/geography/null listing/TEXT[] photo filter matches one row. `--apply` clears only these proven wrong photos, with strict max-affected=1 and exact compare-and-set. Deep non-photo fields and readback must remain unchanged. The venue is preserved, but excluded from public spots until real source photos establish eligibility. This avoids repeated paid lookups of the known wrong reference. No other source record changes.

Dry-run on the live project matched one unchanged row; original-row backup SHA256 `6766e8778f6cc1d73c962c43f2e332a85f267664c7d6a2f472305f6291bbe094`. The private backup is under `cloudflare/auth-proof/.preview-private/users-first-wrong-photo-backup-20261001.json`; never publish its photo URLs. Apply passed at about 10:20 UTC: exactly one row changed from three photos to zero; deep non-photo fields stayed unchanged and readback passed. Receipt `40db4d2f8c47`. The public gallery now returns 404 without requesting the known wrong provider listing.

Explicit rollback: use `--rollback PRIVATE_BACKUP.json` only while the row still has empty photos and unchanged source fields. Never overwrite a later enrichment. A failed or lost write response requires readback reconciliation before another write. Do not retry automatically.

## Fresh trip photos

Saved Google references expire. Itinerary cards now use the existing public gallery by a grounded source spot UUID to resolve fresh attributed photos. They bypass the Next image optimizer for those photos. Legacy expired references without a grounded identity show Photo unavailable; no name-based venue guess or substitute image is made. Existing paid details/entitlement checks remain intact. The stable story image pipeline is unchanged.

Admin photo backfill now loads source coordinates and refuses candidate photos farther than 1 km, or without candidate coordinates when the source has a usable point. Tests prove the known landmark remains rejected even if name matching accepted it. Empty-photo quarantine must not be undone by backfill without passing this guard.

## Checks and release

Four itinerary card, 35 existing gallery and two backfill tests passed. Initial card assertion failed because the shared Next image mock returned a string; a real image-element mock corrected it. Three initial CAS tests passed; the added deep-preservation case also runs in required CI. Focused lint passed after destructuring the gallery hook like the existing venue-card implementation. A local TypeScript process was terminated by the host; required self-hosted CI must pass TypeScript before merge. Pre-release advisor and merged build, release version, rollback and real desktop/mobile evidence will be recorded before completion.

Required self-hosted CI `36847108837` passed in 6m52s, including TypeScript, card/backfill checks and all four CAS tests. PR #284 merged `2177fa7`. Advisor reviews found no concrete P0/P1 in the bounded proposal and fresh-card change; the broad source review reached its turn limit and is not counted as passed. Merged OpenNext build and nilskopp account guard passed. Production deployment `a1b6362a-817a-42c3-aec5-3c38dd53fc17` released version `58e7dadb-406b-4e48-a7da-f25683cbf30c` at 10:30:23 UTC, 100%, rollback `b66a792d-fa68-4db4-acda-3e60d9ed3329`. Four public curl routes returned 200.

Live desktop/mobile proof: the owned regression trip retains two expired source references and grounded spot UUIDs. After scrolling the actual app pane, both sizes loaded two fresh images and two credit regions. All four bounded gallery requests and their media returned 200; no failed photo response, browser script error or document overflow occurred. Initial window scrolling did not trigger lazy loading; no source-ID or normalization bug existed. Other discovery gallery calls were suppressed under the QA budget, so no all-source photo claim is made. Real generation/save, signup/magic verification, password reset/login, chat persistence and 24-spot map selection also passed; see Better Auth acceptance.

## Rejected market source — bounded continuation

The hosted gallery for Janghanpyeong Antique Market `00fa7ad9-3ef8-43ae-849b-fafd8c0b7ac0` returned 502 with `listing_coordinate_conflict` (Attempt94). A fresh source read retains three photos for `ChIJk7CYh6ujfDURBm5z-rXPgbE`, shared with a different market 4.177 km away. No verified replacement listing exists in the retained evidence. Do not weaken the identity guard, guess coordinates, or substitute photos.

The quarantine command now accepts this explicit incident UUID as its fourth argument. Its original default remains unchanged. Validation pins this market's name, current point, null listing ID and three rejected listing references. All other UUIDs fail before HTTP access. Use `--dry-run PRIVATE_BACKUP.json 00fa7ad9-3ef8-43ae-849b-fafd8c0b7ac0`, then `--apply` with that same backup and UUID after review and required checks. This hides the venue until verified enrichment supplies real photos; it does not claim restored photo coverage. The source row and all non-photo fields remain intact.

Rollback uses `--rollback` with the same backup and UUID, only while photos remain empty and all source fields match. Restoring known rejected photos is not a routine verification step. Mock HTTP tests prove apply/rollback preservation, changed-field/enrichment refusal, CAS race refusal and no retry after a lost write reply. If a production response is lost, read the exact row and reconcile the receipt before another write. No automatic retry is allowed.

The Supabase changelog was read before implementation. The September25 breaking change covers indexes/encryption/custom operators; this photos-only REST update changes none of those. PostgREST documents strict `max-affected=1` and returned representations: https://docs.postgrest.org/en/stable/references/api/preferences.html. No schema, auth, RLS, Worker or paused D1 routing changes are included. Production dry-run, apply and no-provider live proof remain separate gates.

Live dry-run matched exactly one unchanged market row with three rejected references. Private backup `users-first-market-photo-backup-20261001.json` SHA256 `d685b5dc52fecb04ff64e4546f8571a03d860a72c16aaab9cd3afb89eed8d2d5`; file mode600. Ten focused tests passed. The first test run found a mock error: it evaluated PATCH filters after mutation and treated new photos as the old array. Corrected mock semantics distinguish pre-write matching from returned representation. No production write occurred during these tests.

### Market source release and live proof — 2026-10-01 19:05 UTC

PR292 merged `9b439b95aaa0a46ca7a0a3c51b57607ff6a00cd4` after required self-hosted CI `36910696132` passed in6m7s on `ccffe5b`. The focused read-only advisor found no concrete P0/P1, checked gallery visibility and backfill refusal, and did not run live APIs. The branch and squash-merge trees match. This operational command release changes no Worker entrypoint; no OpenNext rebuild/deployment is required for this photos-only source operation.

Production apply receipt `a415fb4d336f` completed: one source row changed three photos to zero, exact non-photo fields and readback remained unchanged. Private backup SHA256 remains `d685b5dc52fecb04ff64e4546f8571a03d860a72c16aaab9cd3afb89eed8d2d5`, under the stable checkout's `cloudflare/auth-proof/.preview-private/`, mode600 and excluded from Git. Live controls confirmed the earlier Daesin quarantine and the other market source remain exactly unchanged. The fresh anonymous source query with the application's empty-photo exclusion returned zero target rows.

The real hosted gallery now returns404/unavailable/photos[] instead of502. Its current code returns before Google access because the source has empty photos; no provider call was made. Four actual public paths (home, sign-in, cities, pricing) returned200. API readback at19:05:01UTC confirmed unchanged deployment `d39a5358-8601-4902-adad-c39b75cb7837`, Worker `a548f24e-1f17-4021-a830-219074baa337` at100%, rollback `93f34779-7182-4158-b564-86546800ce33`. Private apply/gallery/proof reports use `users-first-market-photo-{apply,live-gallery,proof}-20261001.json`.

The rollback command and mock apply/rollback tests remain recorded above. No production rollback restored known rejected photos. Cached discovery lists can retain a row for300seconds; the gallery itself is no-store. No new signed-in saved-trip UI journey is claimed. Existing cards map unavailable gallery responses to Photo unavailable. This is quarantine, not verified replacement photos. Historical24-hour errors remain visible. The paused D1 preview source is unchanged; restarted imports must use the fresh source. Full U3 still needs primary-format and notification storage repairs.


## Prepared cave incident — 2026-10-03

The actual scheduled report at07:18:24UTC recorded one HTTP502 event and one structured listing_coordinate_conflict502 for source036dd3e6-0e81-4a4d-bcc1-956c79b1677a. These are two log events, not proof of two failed users. Fresh REST readback confirms Okutama Nippara Caves, null google_place_id, three refs to listing ChIJU39aEIo1GWARC-QtJQ0DPqg and EWKB point0101000020E6100000DBF97E6ABC626140E25817B7D1E84140. No new paid provider lookup was used to diagnose it.

The operational command explicitly allowlists this incident alongside the two existing incidents. Its old default remains unchanged. Tests pin the name, point, listing and null identity; they prove photos-only apply/rollback preservation, wrong-backup refusal, changed-field/replacement-photo refusal and no lost-reply retry. Four new tests and ten existing tests passed through run-heavy; Node syntax and diff checks passed. A live read-only dry-run matched exactly one unchanged row and saved the original backup600 in the stable excluded proof folder. Backup SHA256d647fa55598b2f073f664dc677a8b2b7e2e048a1684b9ac5340c6912917159a2.

Apply syntax after required review, checks and merge: node scripts/photos/quarantine-source.mjs --apply PRIVATE_BACKUP.json 036dd3e6-0e81-4a4d-bcc1-956c79b1677a. Rollback uses --rollback with the same backup/ID only while all non-photo fields match and photos remain empty. Mock rollback is tested; do not restore rejected photos just to exercise live rollback. No production write has run. No verified photo replacement or full U3 completion is claimed.

The first focused read-only advisor invocation failed before review because its subscription weekly limit was reached; no verdict or retry is counted. Retain this increment as draft until a working review and required CI pass. Paid calls stay off until2026-10-05 per Nils's decision in NEED527; SQL access remains NEED519. D1 application-data movement stays paused. Actual reviewed source quarantine, unchanged controls, free hosted404 and current Worker/rollback evidence remain release gates.


### Cave source release and live proof — 2026-10-03

Nils instructed “go ahead and fix it” after the blocked-release report. The two advisor calls remain failed from subscription quota; no independent approval is claimed. The builder reviewed the exact allowlisted incident, photos-only CAS, refusal paths and retained backup under that direct release instruction. Fourteen guard tests passed again; required CI37128259544 passed on4b3ec1501ba1b583a88c832283aabf02f2e27ded. PR298 merged2d8f99e63f9201a1413a1e3e3c3503b00021f529 at16:27:40UTC; feature and squash-merge trees match.

Fresh preflight matched one unchanged source and the original backup SHA256d647fa55598b2f073f664dc677a8b2b7e2e048a1684b9ac5340c6912917159a2. Apply receipt ff863c2eea2c completed at16:28:09UTC: exactly one cave row changed from three photos to zero. All non-photo fields and full readback matched the retained backup. The two earlier quarantined source controls stayed exactly unchanged. The original private backup and apply/live-proof receipts remain mode600 in the stable excluded proof folder.

At16:28:52UTC the real hosted gallery returned404 with status unavailable and photos[]. The anonymous source query with the app's empty-photo exclusion returned zero target rows. Current gallery code exits on failed source quality before Google access; this verification used no paid provider request. Four public paths returned200. The cave is preserved but excluded until verified enrichment supplies real photos. No replacement venue, coordinates, photo coverage or fresh signed-in journey is claimed.

The actual readonly rollback predicate matched one unchanged empty-photo row. Mock apply/rollback, changed-field/new-enrichment refusal and lost-response no-retry tests passed; known rejected photos were not restored in production. Rollback retains the same backup/incident command above and must refuse changed source fields or replacement photos.

This host operational command release changes no Worker code. Actual Cloudflare API proof confirms deployment d39a5358-8601-4902-adad-c39b75cb7837 and Worker a548f24e-1f17-4021-a830-219074baa337 at100%; retained Worker rollback93f34779-7182-4158-b564-86546800ce33. No OpenNext build/deployment is needed for the photos-only source operation. Earlier24-hour error events can remain in the daily report; source and gallery proofs establish the repair. U3 still needs notification storage and bounded real GLM acceptance. Application-data D1 work stays paused.


## Book Off and Gyoza no Ohsho — delivered 2026-10-04

The stable daily service at01:52:55UTC returned4log events over24hours. Two classes ranked under `/api/spots/:id/photos`: listing_coordinate_conflict2 and generic venue_photos_failed2. These are returned log events, not four users or five distinct incidents. The report retained sampling/ingestion coverage limits and current logging configuration rates1. Public health passed; the current configuration does not prove complete ingestion.

Fresh source snapshots pinned Book Off `027edc15-caf8-44a4-96f3-df791e81483d`, point `0101000020E61000008CB96B09F9EE6040371AC05B20494140`, rejected listing `ChIJgxLkXxPnAGARWJN8WxTACJI`; and Gyoza no Ohsho `07f5f5e3-3dd8-47bc-b5e6-ab43e7e7861a`, point `0101000020E6100000A779C7293AF06040386744696F484140`, rejected listing `ChIJGf7pKhfnAGARNHAmUvCD7C0`. Each had null google_place_id and three matching photo references. Complete private snapshots, individual fresh dry-run backups and three incident-control rows were retained. No new paid listing lookup was made.

Feature [PR328](https://github.com/nkopp-cmd/travelchat-ai/pull/328), exact head `35a8b62601df10b8cf296339c003f354f10d86b4`, required self-hosted CI `37170505533` passed7m03s; stable-main release `034904a37841bca96f3f2bf5568023d779d3f32b`. Feature and squash trees match `f5baf18e7a4c56d63049222b3c4b7f0e5d2ae8e9`. Only the two explicit incident entries and their tests changed. The existing compare-and-swap algorithm, exact project/identity/photo predicates, maximum-one-row preference and other incident behavior remain unchanged.

Exact local checks through run-heavy: pinned `npm ci --no-audit --no-fund`, `node --test scripts/photos/quarantine-source.test.mjs` (22passed), `node --check scripts/photos/quarantine-source.mjs`, and `git diff --check`. New cases prove name/point/null identity/listing refusal for both rows, nested-field preservation, apply and mocked guarded rollback, concurrent-photo race refusal, one attempted write after a lost reply, and rollback refusal after unrelated data changes. Required CI also passed its full existing type/lint/test gates. This routine incident extension uses the existing guarded repair protocol; no new independent advisor verdict is claimed from the previously unavailable review quota.

The stable main tool's fresh dry runs each matched exactly one unchanged row. Book Off backup SHA256 `a73074284330245c80018ce4ca844a7b212277e579c6eef3ec28baa58f88fe8b`; Gyoza backup SHA256 `af9340b05613d3e457b91bcfcabe8645c0fba312d6636d79a2ba78ce2af057c9`. Each apply receipt was written before the request. Book Off applied once at02:24:21–02:24:22UTC; Gyoza applied once at02:24:22UTC. Each exact photos array changed3to0. Both responses and independent readbacks confirmed every non-photo field unchanged. Neither operation was retried.

Actual proof at02:24:51UTC shows both www photo endpoints return404 with statusunavailable and an empty photos array. The existing route returns before its Google provider fetch when photos are empty and listing identity is null; no paid provider request was used for these checks. Fresh anonymous Data API queries using the application's nonempty-photo visibility predicate returnzero for each repaired row. Three complete control rows remain unchanged, source spots count remains3,295, and five public endpoints return200. This source-data repair has no new UI/browser journey claim or replacement-media acceptance.

Both live rollback predicates match exactly one unchanged row with empty photos. Written guarded rollback passed mocked-network tests; rejected photos were not restored. A future authorized rollback uses the corresponding private original backup and exact selected ID with `node scripts/photos/quarantine-source.mjs --rollback PRIVATE_BACKUP SELECTED_ID`. This does not satisfy the separate executed full application cutover rollback gate.

Production Worker `a548f24e-1f17-4021-a830-219074baa337` remains100percent under deployment `d39a5358-8601-4902-adad-c39b75cb7837`, rollback `93f34779-7182-4158-b564-86546800ce33`. Preview Worker `a349107c-a1fc-40c7-9538-ade39fcb3292` remains100percent under deployment `f95d2b15-aea5-4ed7-8ff1-36701a7170cb`, rollback `f4519ea5-af5a-46f4-b22d-4e5d3c9146c8`. No Worker deploy occurred for this host-tool release. Both production admin rows remain present; all54candidate application table counts, import hash and zero foreign-key violations match the preflight. Candidate imports were not refreshed, so current historical/source parity is not claimed.

Private mode600 evidence in the excluded auth-proof directory: `u3-two-photo-conflicts-source-20261004.json`, point/listing pins, `u3-book-off-before-20261004.json`, `u3-gyoza-before-20261004.json`, individual preflight/apply receipts, control rows, runtime preflight, `u3-two-photo-after-20261004.json`, install/test/CI logs. Evidence-only merge, final proof and worktree cleanup follow in the canonical plan. Full U3 remains open for paid GLM acceptance afterOctober5 and other explicitly gated history/notification work. Verified replacement photos remain separate; Supabase stays intact until the full cutover retention/deletion gates pass.

## Retrospective independent cave review — 2026-10-05

A fresh read-only advisor review inspected quarantine-source.mjs, its tests and this release evidence. It found no concrete P0/P1 requiring follow-up for PR298. It did not rerun historical receipts or change source data. This closes the missing review evidence retrospectively; no independent approval was claimed at the original release. Private review: cave-retrospective-review-20261005.txt.

Nonblocking hardening remains separate: bind an expected backup hash, add a bounded fetch timeout without retrying ambiguous writes, and consider an updated_at predicate for concurrent non-photo edits. The existing PATCH changes only photos; its post-readback refuses changed non-photo fields. Never restore rejected photos merely to test rollback. Current later incident tests already cover shared concurrency/refusal behavior.


## Don Muang, Popiah and Jurong — delivered 2026-10-12

The daily report at13:40UTC returned six events in three classes.
They were three generic venue failures, two coordinate conflicts and one city conflict.
These counts represent returned events, not six users or five distinct error types.
The existing identity guard remains unchanged. No replacement lookup or coordinate guess was made.

Three fresh source snapshots pinned the rejected incidents:

| Source ID | Venue | Original backup SHA256 | Apply receipt |
| --- | --- | --- | --- |
| 040f2f34-6fc1-4133-a0fc-b0c31d90e55a | Don Muang Night Market | 1c5683c102ab8a39c3ea0a9d45a8817df29b7b795dca88014235e8cd65695640 | afb8de6c6b45 |
| 0a71e061-d220-478c-b959-409de2cdbcdd | Popiah Cart (Jalan Hang Lekir) | cacdd743dfc5548a7512a27c09f83aaa9470edbc0d4a837a5f4edf1947d72079 | 126a4d742cc6 |
| 4b3b1600-9b3a-4021-b77c-32629445c6f2 | Jurong Lake Gardens | 3d8dbebd0d417d8680a31db824830ee46a336cf924db5484b7d843b520aeda9d | e19d6027437b |

PR398 exact4438f3f passed required CI38263105515 in11m58s and merged5d41d9e.
The merged host scripts match the tested source files exactly.
Thirty-seven tests pass, including exact identity/listing refusal, deep preservation, apply and mocked rollback.
Each incident also tests changed-field rollback refusal, a concurrent enrichment race and a lost reply without retry.
Node syntax and Git whitespace checks pass. The established repair algorithm is unchanged.
This routine allowlist extension claims no new independent architecture review.

Each live dry run matched one unchanged row before merge. Each durable zero-cost receipt preceded its single source write.
The stable main command cleared only the three rejected references per row. All non-photo fields passed readback.
Live proof at14:44:57UTC passed32checks: three gallery404/unavailable/empty responses, source preservation and exact rollback predicates.
The application's nonempty-photo filters exclude the three repaired records. Source total remains3295.
Root/spots/sign-in/cities returned200. No paid provider request or replacement image was used for these checks.
These venues stay retained until verified enrichment supplies safe photos. This does not prove complete photo coverage.

This host operation deploys no new Worker code.
Production was on stable0a81e48c, deployment3ff82c33, after the separate Naver safety rollback.
The retained prior stable rollback is043e1752. Full D1 cutover remains gated.
The original private backups, three apply receipts and live proof stay under `/home/dev/.local/state/localley/`.
The receipt file is `photo-incidents-live-proof-20261012.json`.

Future authorized rollback must use the corresponding private backup and exact incident ID with `--rollback`.
It must refuse changed fields or later enrichment. Read-only live predicates each match exactly one unchanged empty-photo row.
Rejected images were not restored. This mock/source-predicate proof does not satisfy the full cutover rollback drill.

## Observed Seoul incidents — 2026-10-14

The daily report found four returned log events for two photo requests.
Two structured events report `listing_coordinate_conflict`; event counts do not count affected users.
This report does not prove complete ingestion coverage.

The exact source records are:

| Venue | Source ID | Backup SHA256 |
| --- | --- | --- |
| Hongje-dong Gimbap Alley | `2f9a76e1-2ad6-4126-89bc-e8f9ca6debfd` | `3734528778acd24c39b7f8aea52ccb6fa129f4aee5b94e71e05c6a145b71448e` |
| Suyu-ri Bossam Street | `3359704a-6786-44bb-a137-9833427b460b` | `1f271ee3ab493b5d70a3ab8dde3c613d225b3c0b7f7fc5318a974100fa8c56cb` |

Both have a null stored listing ID and three references to their rejected listing.
The command pins each name, UUID, source point and photo listing.
All41 guard tests pass. Read-only review found no confirmed P0/P1.
Each live dry run matched one unchanged record and retained its original backup privately.
No paid provider lookup was needed.

After exact green CI and merge, use the retained backup and explicit target ID with `--apply`.
Clear only the original photo array. Preserve every other source field and an unrelated control.
Retain a durable operation receipt before each write. Never retry an uncertain write.
Verify the hosted `unavailable` response only after the empty-array source readback passes.
A null listing and empty photos exit before any paid provider request.

Backups are private `photo-{hongje,suyu}-backup-20261014.json` files under `/home/dev/.local/state/localley/`.
Receipts use `photo-{hongje,suyu}-operation-20261014.json`; hosted replies use the corresponding `-hosted-` filename.
Explicit rollback uses the same backup/ID with `--rollback`, only while fields remain unchanged and photos stay empty.
Mock rollback tests pass. Do not restore rejected photos as a live test.

PR418 and canonical `shared/plans/localley-full-cutover.md` Attempt534 record final CI, apply and live outcomes.
Preparation alone does not certify delivery. This host operation needs no new Worker bundle.
Production Worker is `b4d426e2-1952-4f7b-9989-67142b47053f` at100%, deployment `0385cd50-8091-4ab4-aec7-f208d15cb496`.
Its retained Worker rollback is `8b4db9c2-8117-46e1-a2a4-f887942c5b4f`.
This quarantine does not verify replacement photos or complete U3.
Discovery caches and the old candidate import require separate refresh evidence.
Production application data remains Supabase; the full D1 cutover gates still apply.
