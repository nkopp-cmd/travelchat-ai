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
