# Native Scrapelet → Localley

The native collector runs on the designated Scrapelet host. Localley imports source evidence without calling Apify, Google Places, or an AI provider.
The current target is the existing protected Cloudflare preview. Production Supabase and its public feed remain separate acceptance work.

## Import

Migration `cloudflare/auth-proof/migrations/0006_native_candidates.sql` adds private venue candidates and receipts.
No API exposes these tables. Existing catalog, accounts, saves, and curated place fields are preserved.
The importer validates source host and provider ID, Seoul coordinates, English name/address, dated observations, and bounded image references.
It deduplicates by official provider identity, selects the newest observation, and matches only one exact public source URL.
Ambiguous matches remain unresolved. Repeated imports are safe; older observations cannot replace newer evidence.
Candidate storage is capped at 5,000 distinct places. Import receipt retention is fourteen days.

From `cloudflare/auth-proof`:

```sh
node scripts/native-sync.mjs
node scripts/native-sync.mjs --apply
```

The first command validates the private Tailscale feed. The second applies only candidate data to the fixed preview database.
Use the existing `CLOUDFLARE_API_TOKEN` in the process environment. Do not paste credentials into commands or logs.
The tool bounds pages and response bytes, rejects redirects, removes temporary SQL, and suppresses signed URLs in Wrangler output.
Apply the migration once through the existing release process before using `--apply`.

For a saved versioned export:

```sh
node scripts/native-import.mjs export.json import.sql
```

## Reviewed publication

`pilot/native-reviewed.json` records the first native place approved for the preview: Seoul Museum of Art, Seosomun main building.
`native-publish.mjs` generates a conditional insert that requires the exact collected name, address, coordinates, and source identity.
It checks the approved photograph's hash and license credit. It cannot overwrite an existing place.
The unmodified 305 KiB photograph by Gapo uses CC BY-SA 3.0; its 2011 exhibition banners are explicitly historical.
The original image, license, author, and source remain available through the existing card/detail photo component.
The checked-in image manifest also pins both existing pilot images without changing their bytes.

```sh
node scripts/native-publish.mjs reviewed-publication.sql
```

Deploy the checked assets before applying that SQL to the preview. Verify cards, details, map pins, credits, and retry behavior.
Private scraped gallery assets remain unapproved for publication. A successful byte download does not establish image rights.

## Acceptance limits

This delivers candidate ingestion and one reviewed native place through the preview's existing public catalog path.
It does not claim the production Supabase migration, full venue approval, or a complete social-trend replacement.
Current-week social posts still require exact publication dates, observed metrics, and verified Localley place matching.
Never fill missing trends with stale posts or invented metrics. Do not disable paid discovery until its replacement scope passes acceptance.
