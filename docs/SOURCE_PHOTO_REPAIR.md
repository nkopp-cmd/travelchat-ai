# Bounded source photo repair — 2026-10-01

Nils explicitly authorized source errors repair. The application-data D1 move remains paused.

## Wrong landmark

The Daesin-dong Old Town record `42726b65-cba8-4266-97f4-eca6a9dc7d9b` contains three photo references for Google listing `ChIJTwlXpoSifDURJOCAoUd4JoM`. Received Google details identify Dongnimmun Arch, at 37.5724017,126.9595303. The saved source point is 37.5654,126.9456, 1.454 km away. Keep the existing 1 km identity guard; do not display that landmark as this venue.

`scripts/photos/quarantine-source.mjs --dry-run PRIVATE_BACKUP.json` saves the original row privately and proves an exact ID/name/geography/null listing/TEXT[] photo filter matches one row. `--apply` clears only these proven wrong photos, with strict max-affected=1 and exact compare-and-set. Deep non-photo fields and readback must remain unchanged. The venue is preserved, but excluded from public spots until real source photos establish eligibility. This avoids repeated paid lookups of the known wrong reference. No other source record changes.

Dry-run on the live project matched one unchanged row; original-row backup SHA256 `6766e8778f6cc1d73c962c43f2e332a85f267664c7d6a2f472305f6291bbe094`. The private backup is under `cloudflare/auth-proof/.preview-private/users-first-wrong-photo-backup-20261001.json`; never publish its photo URLs. Apply and live proof are not yet claimed.

Explicit rollback: use `--rollback PRIVATE_BACKUP.json` only while the row still has empty photos and unchanged source fields. Never overwrite a later enrichment. A failed or lost write response requires readback reconciliation before another write. Do not retry automatically.

## Fresh trip photos

Saved Google references expire. Itinerary cards now use the existing public gallery by a grounded source spot UUID to resolve fresh attributed photos. They bypass the Next image optimizer for those photos. Legacy expired references without a grounded identity show Photo unavailable; no name-based venue guess or substitute image is made. Existing paid details/entitlement checks remain intact. The stable story image pipeline is unchanged.

Admin photo backfill now loads source coordinates and refuses candidate photos farther than 1 km, or without candidate coordinates when the source has a usable point. Tests prove the known landmark remains rejected even if name matching accepted it. Empty-photo quarantine must not be undone by backfill without passing this guard.

## Checks and release

Four itinerary card, 35 existing gallery and two backfill tests passed. Initial card assertion failed because the shared Next image mock returned a string; a real image-element mock corrected it. Three initial CAS tests passed; the added deep-preservation case also runs in required CI. Focused lint passed after destructuring the gallery hook like the existing venue-card implementation. A local TypeScript process was terminated by the host; required self-hosted CI must pass TypeScript before merge. Pre-release advisor and merged build, release version, rollback and real desktop/mobile evidence will be recorded before completion.
