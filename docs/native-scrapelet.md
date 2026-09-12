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

## Release evidence — 2026-09-12

PR124 merged into `cloudflare/full-migration` as `b8511ca`.
Preview deployment: `741d8fd5-b254-447d-9347-5d5869143219`.
Migration 0006 applied after a private SQL backup and in-memory restoration rehearsal.
Live database: 13 private candidates, 3 exact source matches, 10 unmatched, 4 public preview places, zero foreign-key errors.
The native feed import was repeated after publication to verify deduplication and preserved public records.
Full isolated Cloudflare check: 98 tests passed, plus the negative environment fixture.
Live browser checks passed at 390, 900, and 1440 pixels with real map tiles, loaded images, no overflow, and no page errors.
The museum map button selected the correct card and marker. Anonymous requests still redirect to Access; service writes remain denied.
No customer login or email delivery is claimed by these service-credential checks.
Museum asset SHA-256 matched the reviewed file served by the deployed preview.
Screenshots were opened and inspected. Existing identity, cards, source links, and photo-credit components remain in use.
The first custom browser assertion assumed a card-local image; the existing hero intentionally owns that image.
Corrected the assertion to check the hero image and the museum card's link/details, then reran successfully.
The existing preview verification token expired during testing. Renewed the same identity for 24 hours without changing policies.
Independent advisor review could not start because its app-server path was read-only. No paid fallback was used.

Repeat live verification from the proof directory with the existing private Access credential:

```sh
node scripts/check-native-preview.mjs --live-preview
```

Automatic collection is active on Scrapelet for seven bounded daily runs.
Automatic transfer is not yet installed: this session cannot access the main user's systemd bus or crontab.
The transfer command itself has passed live validation. Do not report it as scheduled until a real timer run is verified.
Outstanding: production Supabase adapter, ten unapproved venue identities/images, current-week social discovery/metrics/place matches, and eventual paid-schedule replacement.

## Automatic transfer repair — 2026-09-12

The prior scheduler limitation was a process-namespace compatibility issue in `systemctl`, not missing authorization.
The existing supported GDBus user-manager interface works, as documented in CyberLink's Herdr installer.
Installed and enabled `localley-native-sync.timer`: hourly, with bounded jitter and a persistent missed-run check.
The timer triggered its first real service run successfully: exit status 0 and result `success`.
The entry point reads the existing shared key file silently and passes only the Cloudflare token to the bounded importer.
No credentials were copied into a unit or committed. Each run is limited to 180 seconds and 512 MiB.
Candidate imports remain separate from reviewed publication; no unapproved venue is made public by the timer.
Unit sources are in `cloudflare/auth-proof/deploy/`; entry point is `scripts/run-native-sync.mjs`.

## Builder Continuation — 2026-09-12

The Localley builder resumed the existing source and tightly scoped Scrapelet collector work. The hourly timer remains unchanged and active.
Scrapelet PR4 is deployed at `/srv/scrapelet/releases/social-4b3a6b8`, BUILD_ID `r8F1EQ3kcAw3yf9WKr5vQ`.
The collector now retains exact social identity, nullable metrics, discovery leads, and incomplete-source diagnostics without inventing acceptance.
All 234 Scrapelet tests passed. Both browser-worker PIDs and existing mission budgets remained unchanged during activation.

Four additional venue images passed source, identity, license, hash, and visual review: DDP, Sewoon, Gwangjang Market, and Jongmyo.
DDP uses existing UUID `c6a455dc-4b18-4e29-a36b-7430f2ba8f3b`; Gwangjang uses `7f258ce1-b46c-4ab7-96ce-02a5fe5d6b67`.
This preview mapping does not modify either production row, its categories, geography, or relationships.
The other DDP row remains a separate quality conflict; it was not merged or deleted.
Sewoon and Jongmyo IDs are preview-only, not assertions that production contains no matching venue.
Six image-rights gaps remain. The gimbap branch evidence is inconsistent, so a market-photo crop was rejected.

The expanded publisher requires explicit private observations and exact checked-in approval hashes.
Raw feed snapshots and generated SQL stay private. All seven public JPEGs and their notices must be deployed before activating four new rows.
The prepared rollback conditionally hides only those new rows, preserving UUIDs, relationships, mappings, and the original four places.
See `pilot/new-native-review-20260912/` under the proof directory for public review decisions and license evidence.

The explicit production Supabase adapter is implemented and tested against real PostGIS, with no public-table write path.
Migration `supabase/migrations/20260912090631_native_scrapelet_production_ingest.sql` was generated with Supabase CLI 2.117.0 and remains unapplied.
SQL or Management API credentials are unavailable. Live catalog verification, backup, installation, and private ingest activation remain blocked.
Service-role REST access and the exact project origin were verified without exposing credentials.
See `native-production-adapter.md` for transactional, UUID, RLS, geography, and rollback checks.

The Localley native-social diagnostic now reads the deployed additive feed successfully.
Its live result is zero social observations, zero accepted posts, and zero ranks; public rankings remain unchanged.
Bounded source probes found YouTube challenges, a missing official RSS feed, Bluesky denial, and stale or unrelated Mastodon results.
No paid Apify schedule has been replaced. Provider replacement and the broad Cloudflare application migration remain separate acceptance scopes.
