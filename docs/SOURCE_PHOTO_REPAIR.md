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
