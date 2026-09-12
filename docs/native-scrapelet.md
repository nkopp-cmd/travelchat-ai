# Native Scrapelet → Localley

## Current Delivered Scope — 2026-09-12

The active preview now includes native account safeguards from merge `18f43472126bc5260ed51db3ae76ec4a02de4733`.
Worker version `b4b364de-1721-402b-8fd3-4b342267baef` supersedes earlier application checkpoints while preserving all eight public records.
See `releases/native-account-boundaries.md` for the deployment, backup, and independent preview evidence.
Native ingestion and the working hourly timer were not changed or repeated during this release.

### Production Continuation Source Check

Nils's explicit operator batch `next-1789217445` continues this same app session. Gravity owns receipt reconciliation.
The 12:54 UTC credential check found no SQL connection, management token, or stored CLI token. Service-role REST remains available.
Six bounded Commons searches found no exact reusable venue image. The Public Garden query returned unrelated historical PDFs.
Public venue timelines returned 4 Gwangjang Market, 10 Jongmyo, and 4 Seoul Museum of Art observations, all outside this UTC week.
No stale observation was accepted or staged as a current trend. Private results remain in `.preview-private/next-goal-source-evidence.json`.
No job, mission, paid fallback, or transfer timer was added or changed.
Independent native application migration continues with the existing email preference controls and a private D1 route.

### Independent Verification Continuation

Gravity resumed this same Localley session without changing app ownership or the transfer timer.
The previous commit did not have GitHub check evidence, so the independent coding verifier rejected it.
PR128 added a real `verify` workflow for exact source commits, including isolated native and PostGIS adapter checks.
It also rejects equal-time conflicting venue observations instead of allowing input order to replace evidence.
Candidate updates execute as one guarded statement; conflicts and capacity failures cannot leave a partial candidate batch.
Identical retries can still refresh exact source matching. Older observations cannot replace newer candidates.
The existing hourly unit and schedule remain unchanged.

PR https://github.com/nkopp-cmd/travelchat-ai/pull/128 merged into `cloudflare/full-migration` as `0933208e4095354d92c3f3d78687dbc117d22bd3`.
Source commit `475cc0857e5765b7c8c9fa3b36de6b50056912f7` and the merge have identical trees.
The merged commit passed [GitHub verify run 34691652711](https://github.com/nkopp-cmd/travelchat-ai/actions/runs/34691652711).
Checks covered application tests, native ingestion, isolated PostGIS, TypeScript, and lint.
Gravity accepted this merged commit through `verify-commit Localley preserved-app-work`.
That coding evidence does not establish full production release acceptance.

The host checkout installed the importer. At `2026-09-12T11:44:34.043Z`, the existing `scripts/run-native-sync.mjs` command passed live verification.
It accepted thirteen identities from 58,588 source bytes, with no rejections, targeting only `localley-migration-preview`.
The candidate identity set stayed unchanged. Observations remained monotonic; equal-time payloads stayed identical.
All eight public records stayed unchanged. Their ordered JSON SHA-256 was `10442fca87f36e8a1e7850cefa576d3e0c552330496c44a0707146011b0250c6`.
Batch receipt: `1664cca66006a7db2ba8bbab81a5835a8fa2cc3d793d69af27f7a5352e154797`.
The private before-snapshot, command log, and report remain in `cloudflare/auth-proof/.preview-private/ingestion-{before.json,command.log,evidence.json}`.
Persistent data remains in EU D1 `localley-migration-preview`, ID `e943548b-01ae-485d-9219-e2a46cb0da8e`.
The existing user-manager interface reported `localley-native-sync.timer` active. No scheduler configuration changed.
The social dry run still returned zero accepted posts or ranks, with no publication or paid calls.

PR128 changed host ingestion, not the Worker bundle. The PR127 Worker identity below records that historical checkpoint.
Importer rollback reference: `70d8b7551cd9f206fc9580e0dcf3c2b52ae7fd00`, before PR128.
Any rollback must preserve candidate data, receipts, public rows, and the existing timer. No rollback was performed.
Gravity's last status still reported `app_specific_live_contract_required`, `check_catalog_unavailable`, and `private_protection_unavailable`.
The accepted coding evidence is recorded separately from those status gates. No shared engine or registration was changed.

Localley PR https://github.com/nkopp-cmd/travelchat-ai/pull/127 merged as `b965d3d9e631deb93dd6a23575ccb364c3d937e7`.
Protected preview version `7e9c2a7c-2c5b-406b-8160-9ae705d7271c` served that tag at 100% before the native preference release.
Cloudflare deployment ID: `a455a2cb-07ac-4216-9c1c-68918c286a64`.

Four reviewed records were inserted: DDP, Sewoon Shopping Center, Gwangjang Market, and Jongmyo Shrine.
The actual INSERT returned four IDs; a repeated application returned zero insertions and zero mapping changes.
Preview now has eight visible places, thirteen candidates, seven exact matches, and six unmatched candidates.
All four original public rows, accounts, saves, itineraries, and unrelated tables remained unchanged. Foreign-key checks passed.
All seven JPEGs, public license notices, and all eighteen build files matched live bytes.
Live verification passed at 390, 900, and 1440 pixels, including fifteen native map selections and opened screenshots.
Credits, archive policies, exact addresses, uncropped photos, historical caveats, and map-control clearance passed.

The unique private backup and exact hide-only rollback remain under `.preview-private/pr127-activation-REK9Ws/database-VXDR3n/` in the proof package.
Backup SHA-256: `f6c2f73137056a385152eab923ba70df20bc4e8cb27dc302a1649d2f467100f4`.
Public asset snapshot SHA-256: `78f9f8c56f00e9c18bd31fe1201c1ac93c72e41f588542811e007999b6c6f63e`.
Rollback conditionally hides only the four new reviewed rows. Preserve their UUIDs, relationships, mappings, and assets.
Previous code version is `741d8fd5-b254-447d-9347-5d5869143219`. Code rollback alone is insufficient when rows reference new assets.

The production Supabase adapter is implemented, generated as a migration, and tested on real PostGIS. It is not installed in production.
Missing SQL/Management credentials prevent live catalog validation, backup, installation, and activation. Service-role REST access cannot replace these gates.
That adapter currently implements private ingestion and reviewed identity bindings only. Production public publication and attribution-renderer acceptance remain separate work.
Six venues still lack suitable image rights; one also has unresolved branch evidence. They remain private.
The native social reader accepts the deployed feed but returns zero accepted posts and ranks. Public rankings and paid schedules remain unchanged.
This provider-replacement work does not complete the broader Cloudflare application migration.
The historical foundation and operating contracts follow below.

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
node scripts/native-publish.mjs PRIVATE_OBSERVATIONS.json PRIVATE_PUBLICATION.sql
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

## Final Verification

- Localley root suite: 2,161 passed, five opt-in checks skipped.
- Native package: 200 checks plus environment isolation passed; both HTTPS browser suites passed.
- Root production build, TypeScript, and scoped lint passed.
- Production adapter: 33 final unit/PostGIS checks passed without skips using the pinned Docker image.
- Social intake: 135 native/weekly/quality checks passed, including latest-unknown metric handling.
- Scrapelet: 234 tests, typecheck, lint, webpack build, reviewed merge, deployment, and live source parity passed.
- Independent reviews closed deterministic timestamp, UUID case, stale metrics, private evidence, and publication guard findings.
- The existing hourly timer remained enabled and active, with last service result `success` and exit status 0.

The first full-Chromium regression run hit a Unix socket path limit in its long private test directory.
The existing shared headless-shell binary resolved the tooling issue; no assertion was skipped and no browser was installed.
The map review found initial auto-pan interference. Non-animated measured placement resolved it at all tested widths.
