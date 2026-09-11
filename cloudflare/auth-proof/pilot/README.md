# Seoul Public Catalog Pilot

This preview contains three famous places, not secret local gems.
Research date: 2026-09-11. No live import or deployment occurred.

## Completion Checks

- [x] Match existing Localley venue names without copying Google data.
- [x] Retrieve photo author, license, and source before downloading.
- [x] Open each downloaded image before selection.
- [x] Use independent Wikidata coordinates with no entrance claim.
- [x] Keep DDL separate from the reviewed seed SQL.
- [x] Verify catalog tests and an explicit native D1 import with isolated teardown.

## Parent Integration

Apply `migrations/0004_pilot_catalog.sql` before using the extended catalog.
Do not include `pilot/import.sql` in migrations or normal test setup.
Only the parent may import it into a new protected preview database after review.
Copy `pilot/images/*.jpg` into the preview asset directory at `/pilot/` during packaging.
Serve `pilot/credits.txt` at `/pilot/credits.txt` and link it beside the photo credits.
This notice supplies photo titles, creation years, and required change notices.
No runtime or build scripts changed in this task.

The catalog returns nullable `city`, `address`, `latitude`, and `longitude`.
It returns `photoCredits` and `sourceUrls` as arrays, including empty arrays for legacy fixtures.
The existing pagination and visibility rules remain unchanged.
Saved-list nested spot DTOs remain unchanged. Resolve their credits through visible catalog IDs.

The parent must update `scripts/local-server.mjs` to apply migration 0004.
Its synthetic inserts need explicit column names, without changing fixture values.
`test/application.test.mjs` also has a positional spot insert.
`test/proof.test.mjs` must apply 0004 when testing the extended catalog.
`test/browser.test.mjs` must expect the six new public fields.
These files remain outside this task's edits.

## Identity And Locations

Two records preserve exact source IDs supplied by the parent on 2026-09-11.
The parent reported an authenticated read-only `SELECT id/name` lookup of public venue records.
This task made no authenticated database request and did not inspect credentials.

| Place | Pilot ID | Mapping |
| --- | --- | --- |
| Seodaemun Independence Park | `0041a575-c6fd-4a7e-b9c3-56cc50e201d6` | Confirmed source ID |
| Gyeongbokgung Palace | `cbd403a4-1912-45b8-8ae1-fc13b4c2f1e5` | Confirmed source ID |
| Cheonggyecheon Stream | `f0fcf98e-76d7-4673-b8c3-6baf519a1551` | New pilot ID; mapping pending |

The parent found `Cheonggyecheon Stream Night Walk` at `11107241-dfb3-4cfc-a0c5-d243630f07b8`.
That experience is not a confirmed canonical stream venue. Its candidate association remains pending.
The seed does not import that candidate ID. The preview makes no night-access claim.
Coordinates use Wikidata P625, under CC0, for matched place entities.
They mark approximate place positions, not verified entrances or routes.
Hours and cost remain unknown. All scores remain NULL.

## Image Review

- Palace: accepted. Gwanghwamun and the palace grounds appear together. This is a daytime overview, not night-opening evidence.
- Stream: accepted with limits. The stream and lower walkway are visible. The older portrait photo has bright highlights.
- Park: rejected. The downloaded view mainly shows Seodaemun Prison History Hall, not the general park.
- `Cheonggyecheon evening 2.jpg`: rejected before download due to the `NoFoP-South Korea` category.
- `Cheonggyecheon Stream in sunset.jpg`: rejected before download because its original exceeds 10 MB.

The park has `photos: []` and no credits. No replacement image masks this gap.
Only the two accepted photos enter the package. See `licenses.md` for license duties.

## Fetch Budget

15 metadata/page requests and 3 image requests. Each image download enforced a 10,000,000-byte limit.
No paid calls, API keys, customer data, Supabase writes, or Cloudflare deployment occurred.
No access denial was bypassed. No Google photo references entered this package.
See `research.json` for the request ledger and rejected candidates.

## Local Verification

Run the focused synthetic catalog test with `node --test pilot/catalog.test.mjs` from `cloudflare/auth-proof`.
Run the separate import review with `node pilot/verify-import.mjs --import-sql`.
The import review uses the installed Miniflare and native workerd D1 binding with `remote: false`.
It loads no application worker, auth configuration, or environment credentials.
It removes inherited environment values before loading Miniflare and disables outbound requests and telemetry.
It applies every migration in filename order, including 0003 and 0004.
It verifies source/SQL equality, canonical IDs, unique IDs, NULL scores, coordinates, JPEG bytes, credits, and reviewed hashes.
It rejects a repeated seed instead of overwriting existing IDs.
The 2026-09-11 native check passed: before=0, imported=3, fresh database after teardown=0.
The check disposes the first runtime and removes its database files.
It recreates D1 at the same path, verifies no spots table exists, then reapplies migrations and verifies zero spots.
It disposes that second runtime and removes all generated local state.
This is teardown and recreation, not a SQL rollback. The earlier SQLite check is not the native release evidence.
It found two canonical IDs, one pending pilot ID, two unchanged photos, and one missing photo.
Outbound requests totaled zero. See `verification.json` for the recorded native result.
Integrated frontend and hosted preview checks remain with the parent.
The focused synthetic catalog test passed on 2026-09-11.
It checks nullable fields, visibility, pagination, unsafe URLs, plain-text credits, and schema constraints.
`tsc --noEmit`, catalog-only ESLint, and `git diff --check` also passed.
The host initially held the heavy-command lock. Tests ran after the lock became available.

## Release Status

The source package is ready for parent review and protected preview integration.
Native local D1 import verification passed. No hosted import or deployment occurred.
The parent must complete asset delivery, visible attribution, and integrated tests before publishing.
Two photos passed review, not five. The park still needs a suitable licensed photo.
Deoksugung and Namsangol were not included in this smaller pilot.
Two confirmed source UUIDs are preserved. The Cheonggyecheon venue mapping remains pending.
