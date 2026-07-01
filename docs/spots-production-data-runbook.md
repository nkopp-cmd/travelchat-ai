# Spots Production Data Runbook

Localley spot quality depends on two separate data gates:

- Real photo coverage: each public spot should have at least one production-safe, proxied Google Places photo or another reviewed real image.
- Place identity coverage: each exact destination should store `spots.google_place_id` so Google Maps directions can use a durable Place ID instead of only a text search or imported coordinates.

## Current Production Finding

The production `spots` table is missing the `google_place_id` column. Until that migration is applied, Localley cannot store durable Google Place IDs even when photo URLs contain enough place provenance for the UI to infer one.

Apply the existing migration before running the next place-ID backfill:

```bash
cd "/Users/alleycore/Documents/CoreMachine/01 - Projects/Code/Localley"
export SUPABASE_ACCESS_TOKEN="your_supabase_access_token"
npx supabase db query --linked --file supabase/migrations/006_spots_google_place_id.sql
```

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

Pull production env into a temporary file and run the audits without printing secrets:

```bash
cd "/Users/alleycore/Documents/CoreMachine/01 - Projects/Code/Localley"
tmp_env=$(mktemp)
out_dir=$(mktemp -d)
vercel env pull "$tmp_env" --environment=production --scope nkopp-cmds-projects --yes >/dev/null
set -a; source "$tmp_env"; set +a
npx tsx scripts/audit-spot-photo-coverage.ts --out="$out_dir/photo.json"
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

Review strict Google Places backfill candidates before applying:

```bash
cd "/Users/alleycore/Documents/CoreMachine/01 - Projects/Code/Localley"
tmp_env=$(mktemp)
vercel env pull "$tmp_env" --environment=production --scope nkopp-cmds-projects --yes >/dev/null
set -a; source "$tmp_env"; set +a
npx tsx scripts/review-spot-photo-backfill.ts --limit=20 --max-candidates=120 --out=reports/spot-photo-backfill-review.json
rm -f "$tmp_env"
```

Only apply once the dry-run returns high-confidence `would_update` rows:

```bash
npx tsx scripts/review-spot-photo-backfill.ts --apply --limit=20 --max-candidates=120 --out=reports/spot-photo-backfill-apply.json
```

## Interpretation

- `hasGooglePlaceIdColumn: false` means the schema migration is still blocking exact Place ID storage.
- `needsBackfill` means the spot lacks a reviewed real image.
- `needsPlaceIdentityBackfill` means the spot lacks a durable Google Place ID, either in the column or inferable from a proxied Places photo URL.
- `weakDirections` means the address is area-level and the coordinates are missing or zero, so the spot needs manual address/coordinate enrichment before directions can be trusted.

If strict backfill returns only `skipped` rows, do not loosen matching globally. Those records need manual enrichment because Google is returning unrelated businesses, hotels, stations, or broad area matches.
