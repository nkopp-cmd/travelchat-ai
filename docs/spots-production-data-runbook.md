# Spots Production Data Runbook

Localley spot quality depends on two separate data gates:

- Real photo coverage: each public spot should have at least one production-safe, proxied Google Places photo or another reviewed real image.
- Place identity coverage: each exact destination should store `spots.google_place_id` so Google Maps directions can use a durable Place ID instead of only a text search or imported coordinates.

## Current Production Finding

Production readiness packet from July 1, 2026, rerun from Vercel production env:

- Total spots: 3,287
- Public-ready spots: 1,436
- Needs work: 1,851
- Real photo coverage: 97.3% (3,198/3,287)
- Missing real images: 89
- Exact address coverage: 43.9% (1,444/3,287)
- Inexact or area-level addresses: 1,843
- Weak directions with missing or zero coordinates: 150
- Missing place identity according to the photo audit: 89
- `actionPlan.schema.migrationRequired`: true, meaning `spots.google_place_id` is still not selectable by the app service role

The main blocker is no longer the photo layer. It is exactness: too many records are still neighborhood, district, event, route, or collection-level entries. Those can look good in cards, but they cannot power trustworthy directions until each card represents an exact mappable destination or is intentionally rewritten as a collection/template item.

The readiness report still marks the Google Place ID schema as missing when the service role query cannot select `google_place_id`. If a fresh packet reports `actionPlan.schema.migrationRequired: true`, apply the existing migration before running place-ID writes:

```bash
cd "/Users/alleycore/Documents/CoreMachine/01 - Projects/Code/Localley"
export SUPABASE_ACCESS_TOKEN="your_supabase_access_token"
npx supabase db query --linked --file supabase/migrations/006_spots_google_place_id.sql
```

After the migration command succeeds, verify that the app service role can select the column and that the packet no longer reports a schema blocker:

```bash
cd "/Users/alleycore/Documents/CoreMachine/01 - Projects/Code/Localley"
tmp_env=$(mktemp)
vercel env pull "$tmp_env" --environment=production --scope nkopp-cmds-projects --yes >/dev/null
set -a; source "$tmp_env"; set +a
npm run spots:quality:action-plan -- --limit=1 --json
npm run spots:readiness -- --limit=250 --sample-limit=80
rm -f "$tmp_env"
```

The expected action-plan signal after the schema is fixed is:

- `schema.hasGooglePlaceIdColumn: true`
- `schema.migrationRequired: false`
- `schema.blockingAction: null`

If `schema.migrationRequired` remains `true`, do not run place-ID apply/backfill commands yet. Supabase's 2026 Data API exposure changes mean schema and selectability can fail separately from RLS or row access, so treat this as a production schema/access issue first.

If the project is not linked for the Supabase CLI yet:

```bash
cd "/Users/alleycore/Documents/CoreMachine/01 - Projects/Code/Localley"
export SUPABASE_ACCESS_TOKEN="your_supabase_access_token"
npx supabase link --project-ref llehrhqeolfprutcaopi
npx supabase db query --linked --file supabase/migrations/006_spots_google_place_id.sql
```

## Audit Commands

For a single timestamped operator packet, run the combined read-only audit:

```bash
cd "/Users/alleycore/Documents/CoreMachine/01 - Projects/Code/Localley"
tmp_env=$(mktemp)
vercel env pull "$tmp_env" --environment=production --scope nkopp-cmds-projects --yes >/dev/null
set -a; source "$tmp_env"; set +a
npm run spots:readiness -- --limit=250 --sample-limit=80
rm -f "$tmp_env"
```

This writes `reports/spot-readiness-<timestamp>/manifest.json`, `photo-coverage.json`, `location-quality.json`, `action-plan.json`, and `action-plan.csv`.
Add `--verbose` when you want to see the child audit output while the packet runs. The default mode stays quiet and prints the packet path plus final status.
The action-plan JSON and CSV include a research query, Google Maps search link, traveler-facing directions preview link, image search link, Place ID guide link, public spot link, and admin deep link for each prioritized record. They also include operator-ready status fields for real image evidence, exact location evidence, direction trust, public-card visibility, stored photo/place-ID evidence, and a row-level checklist so spot cleanup can proceed from highest priority without re-diagnosing every card.
When the Place ID migration is still missing, `manifest.json` now includes the exact migration command in `nextSteps`, and each CSV row includes `schemaBlockingAction` so operator cleanup does not confuse spot-level image/address work with the global schema blocker.

Pull production env into a temporary file and run the audits without printing secrets:

```bash
cd "/Users/alleycore/Documents/CoreMachine/01 - Projects/Code/Localley"
tmp_env=$(mktemp)
out_dir=$(mktemp -d)
vercel env pull "$tmp_env" --environment=production --scope nkopp-cmds-projects --yes >/dev/null
set -a; source "$tmp_env"; set +a
npm run spots:photos:audit -- --out="$out_dir/photo.json"
npx tsx scripts/audit-spot-location-quality.ts --out="$out_dir/location.json"
rm -f "$tmp_env"
```

For a prioritized operator packet that combines image, address, name, and place-identity issues into one JSON/CSV action list:

```bash
cd "/Users/alleycore/Documents/CoreMachine/01 - Projects/Code/Localley"
tmp_env=$(mktemp)
vercel env pull "$tmp_env" --environment=production --scope nkopp-cmds-projects --yes >/dev/null
set -a; source "$tmp_env"; set +a
npm run spots:quality:action-plan -- --out=reports/spot-quality-action-plan.json --csv=reports/spot-quality-action-plan.csv --limit=250
rm -f "$tmp_env"
```

## Admin Enrichment Queue

Use the admin workbench after each audit run:

- `/admin/spots/quality` shows records blocked by missing real images, inexact addresses, broad names, or missing place identity.
- `GET /api/admin/spots/quality?issue=missing_real_photo&city=Tokyo&limit=80` returns the same queue as JSON for inspection.
- `PATCH /api/admin/spots/quality` updates one spot at a time with `address`, `lat`, `lng`, `photos`, and `googlePlaceId`.

The patch endpoint preserves existing localized address fields, writes coordinates as `POINT(lng lat)`, deduplicates photo URLs, rejects invalid coordinates, and refuses to save `googlePlaceId` until the `spots.google_place_id` migration exists.

Recommended manual loop:

1. Filter by `Images`, add real Google proxy or trusted HTTPS spot photos.
2. Filter by `Location`, replace area-level addresses with exact mappable addresses plus coordinates.
3. Filter by `Place ID` after the migration is applied, then save durable Google Place IDs.
4. Re-run the photo and location audits and confirm the public-ready count increases.

For exact location matching, use the admin batch preview first. It uses the strict Google Places matcher and will skip broad or ambiguous rows rather than guessing.

```bash
# In the browser, open:
https://www.localley.io/admin/spots/quality
```

Use the `Exact-location batch` panel:

1. Run `Preview 8 places`.
2. Review each matched name, address, pin, and skip reason.
3. Apply only the previewed places when every accepted match is an exact destination.
4. Re-run the readiness packet and confirm `exactAddress`, `weakDirections`, and `publicReady` moved in the right direction.

Do not use automatic backfill for records like `Residential`, `Local Scene`, `Office District`, `Various locations`, broad food/bar scenes, route walks, or seasonal pop-ups unless the row is first rewritten into one exact destination.

Review strict Google Places backfill candidates before applying:

```bash
cd "/Users/alleycore/Documents/CoreMachine/01 - Projects/Code/Localley"
tmp_env=$(mktemp)
vercel env pull "$tmp_env" --environment=production --scope nkopp-cmds-projects --yes >/dev/null
set -a; source "$tmp_env"; set +a
npm run spots:photos:review -- --limit=20 --max-candidates=120 --out=reports/spot-photo-backfill-review.json
rm -f "$tmp_env"
```

When a QA report, user screenshot, or admin review identifies one exact record, target it directly instead of scanning the whole table:

```bash
npm run spots:photos:review -- --spot-id=<spot_uuid> --limit=1 --out=reports/spot-photo-backfill-spot.json
```

Only apply once the dry-run returns high-confidence `would_update` rows:

```bash
npm run spots:photos:apply -- --limit=20 --max-candidates=120 --out=reports/spot-photo-backfill-apply.json
npm run spots:photos:apply -- --spot-id=<spot_uuid> --limit=1 --out=reports/spot-photo-backfill-spot-apply.json
```

## Latest Backfill Read

Earlier production dry-runs on July 1, 2026 found zero safe automatic photo updates and zero safe automatic location updates with the older script path:

- Photo dry-run: 90 candidates, 0 `would_update`, 90 skipped. The rejected matches were mostly unrelated businesses, broad neighborhoods, lodging, or partial-name matches.
- Location dry-run with `--exact-only --trusted-provider-only`: 4 candidates, 0 `would_update`, 4 skipped because results fell back to city centers or unsupported cities.

Do not apply batch backfills when the dry-run looks like this. Work through `action-plan.csv` and `/admin/spots/quality` instead, using the research links to find the exact place, exact address, coordinates, and reviewed real images.
Location backfill reports include `manualReview.mapsSearchUrl` and `manualReview.recommendedAction` for skipped rows. Treat `geocode_city_center_fallback` as a manual-only case, because the geocoder found the city center instead of the actual place.

The newer admin `Exact-location batch` tool may find safe strict Google Places matches that the older coordinate-only script skipped. Treat it as a preview queue, not a blind bulk update. Its accepted rows should include a matched Google place name, formatted address, latitude/longitude, and optional photos before applying.

After adding Yilan to the city registry, one exact-address production row was safe to update:

- `6727af36-6e24-4ac2-a823-8279946b09f0` — Yilan National Center for Traditional Arts
- Applied coordinate backfill: `POINT(121.824053 24.685587)`
- Post-apply Yilan dry-run: 5 scanned, 0 candidates, 0 `would_update`, 0 failed.

## Interpretation

- `hasGooglePlaceIdColumn: false` means the schema migration is still blocking exact Place ID storage.
- `needsBackfill` means the spot lacks a reviewed real image.
- `needsPlaceIdentityBackfill` means the spot lacks a durable Google Place ID, either in the column or inferable from a proxied Places photo URL.
- `weakDirections` means the address is area-level and the coordinates are missing or zero, so the spot needs manual address/coordinate enrichment before directions can be trusted.

If strict backfill returns only `skipped` rows, do not loosen matching globally. Those records need manual enrichment because Google is returning unrelated businesses, hotels, stations, or broad area matches.
