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
