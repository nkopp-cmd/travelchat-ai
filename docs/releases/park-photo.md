# Park Photo And Discovery Evidence

## Delivered Partial Outcome - 2026-09-12

- Checked source: `4a9237b35522d54800f2524b767e818fcd2f9f1d`, [PR134](https://github.com/nkopp-cmd/travelchat-ai/pull/134).
- Deployed merge: `ebc1e8c62f70495681c4b362a1c253fd8afc1785`; source and merge trees match.
- Required GitHub verification passed: PR run `34712106617`, merge run `34712538658`, attempt 1.
- Target: protected `https://preview.localley.io`, Worker `localley-discovery-preview`.
- Active version: `cffeadb7-083e-428f-95d7-8093106e35a1`, tagged with the merge, serving 100%.
- Cloudflare deployment: `d91088ac-d931-4d95-89d2-449dd2392c0d`.
- Data: EU D1 `localley-migration-preview`, ID `e943548b-01ae-485d-9219-e2a46cb0da8e`.
- Backup: `cloudflare/auth-proof/.preview-private/park-release-EC2vdM/before.sql`.
- Backup SHA-256: `8cb164333313bcbf0efe486cd46b29f2dda6a2dbc1619377428a1b8c32a16316`; restoration passed.
- Previous Worker: `b4b364de-1721-402b-8fd3-4b342267baef`. Prefer the guarded data rollback while retaining the new asset bundle.
- Rehearsed private rollback: `park-release-EC2vdM/rollback.sql`, SHA-256 `33b0c5cccf541231aaf902bce9127fa0dc0638268a9bc2ac000e3d869da6040d`.

Assets and public attribution were verified before the data update. The guarded update changed exactly one row; its repeat changed zero.
Only the park's description note, photo list, and credits changed. Its UUID, coordinates, address, visibility, score, and source relationships stayed unchanged.
The other seven public records and all checked private tables stayed unchanged. All eight published records now have distinct reviewed images.

The actual native source snapshot contained 25 observations, reduced to thirteen accepted venue identities.
Source snapshot SHA-256: `227ffd9ec5918f86368fce842c5a7ab0cfaa30e9db82b8f486b864e6265b0feb`.
On the restored live snapshot, two native SQL replays preserved the updated public records and two additional synthetic relationship rows.
After activation, the existing `scripts/run-native-sync.mjs` ran once against real Scrapelet and D1.
It accepted thirteen identities from 58,588 bytes; batch `1664cca66006a7db2ba8bbab81a5835a8fa2cc3d793d69af27f7a5352e154797`.
The replay preserved every public row and checked relationship table. Live saved-place and itinerary tables each had zero rows; positive relationship rehearsal used synthetic local rows.
The hourly transfer remains active and unchanged. No collector job, new schedule, paid fallback, or external social publication was introduced.

Actual hosted checks passed for eight reviewed JPEGs, attribution, descriptions, addresses, and all 24 map/list selections across 390/900/1440 pixels.
Nine park image/card/map screenshots were opened. Image bytes matched the reviewed hash and remained uncropped; Korean attribution rendered correctly.
Private source, database, transfer, and browser evidence remains in `park-release-EC2vdM/`, including `native-source.json`, `preflight.json`, `native-repeat.log`, `release.json`, and `live.json`.
The first native check covered the existing 218 tests; all eleven new park tests passed separately and were then added to normal CI.
All three local browser suites and the explicit native D1 seed verifier passed. These checks supplement, not replace, the actual hosted evidence above.

Gravity accepted the updated restricted-preview release using `.preview-private/gravity-preview-release-134.json`.
No completion evidence was submitted for `usable-native-discovery`: six business-image rights gates remain unresolved.
Production Supabase/Clerk/Vercel and its public origin were not changed. This is not a full discovery-product completion or production cutover.

## Outcome Scope

The `usable-native-discovery` outcome is not complete while six business-image rights gaps remain.
Parser tests or a successful preview deployment cannot close that outcome.
This increment improves the existing public park record, not any of those six businesses.

Seodaemun Independence Park keeps UUID `0041a575-c6fd-4a7e-b9c3-56cc50e201d6`, address, coordinates, category, visibility, and relationships.
Its new photograph shows the park's paths, lawns, and memorials. The earlier prison-dominated candidate remains rejected.
The image is not a substitute for Hyeongje, Gukseon, Jongoh, Public Garden, Soonhee Food, or Mother and Daughter's Gimbap.

## Actual Sources

- Venue: https://english.visitseoul.net/attractions/Seodaemun-Independence-Park/ENP001753 . The page identifies the park, memorials, history hall, and 251 Tongil-ro address.
- Coordinates: https://www.wikidata.org/wiki/Q623629 . The entity still labels this park and supplies `37.5752858, 126.9550192` under CC0.
- Photograph: https://commons.wikimedia.org/wiki/File:%EC%84%9C%EB%8C%80%EB%AC%B8%EB%8F%85%EB%A6%BD%EA%B3%B5%EC%9B%90%EC%9D%98_%EB%AA%A8%EC%8A%B5.jpg .
- Commons page/revision: `81456840` / `1018180457`; the uploader declares own work and a copyright-holder license grant. The original Korean author credit is retained in the catalog and license notice.
- License: CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/ . Attribution, ShareAlike, modification notices, and no extra restrictions remain required.
- Declared capture date: `2018-06-16`; upload date: `2019-08-19`. The card identifies the photograph as historical.
- Downloaded JPEG: 1,714,706 bytes, 2064 x 1161 pixels. Opened and visually reviewed; no local modification.
- SHA-256: `14c9c3a438e9f93980757be9c4654ed92dc658cebe2a90dcbfbf6ef7aaf17a75`.

The broad scene is a park view, not an isolated artwork reproduction. No crop isolates a statue or person.
The copyright license is not a warranty about unrelated rights or an endorsement of Localley.
Coordinates remain catalog positions, not surveyed entrances or inferred camera locations.

## Six Remaining Gates

Gukseon's official site was accessible and still states `All rights reserved`; its address and phone match the reviewed shop.
https://www.gs5701.com/ did not supply a reusable photo grant. No product photo was copied.
The owner pages https://www.yukhoe.com/ and https://www.sisul.or.kr/gha/store/info.do?key=2309210001&sc_mallSn=6 remained unreachable.
Transport failure is not proof of either permission or prohibition. No challenge or TLS bypass was attempted.
Prior exact-site and license reviews for the other three venues remain retained in `cloudflare/auth-proof/pilot/new-native-review-20260912/followup-images.md`.

| Provider | Required Before Publication |
| --- | --- |
| visit-seoul:51933 | Exact Hyeongje main-branch image and a legitimate reuse grant |
| visit-seoul:24725 | Exact Gukseon shop image, not a generic lacquerware product; permission or suitable license |
| visit-seoul:508 | Exact Jongoh underground arcade image and rights evidence |
| visit-seoul:47532 | Exact fourth-floor Public Garden cafe image and rights evidence |
| visit-seoul:26253 | Exact Soonhee banchan shop image, not the pancake restaurant; rights evidence |
| visit-seoul:14618 | Exact branch/stall identity resolution and rights evidence; the prior market crop remains rejected |

No license request was sent, no photo was purchased, and no new paid fallback was used.
None of these six candidates is approved by this park review.

A subsequent bounded check of PHOTO KOREA returned no items for twelve exact venue-name queries; a positive control returned 35.
The registration/purpose requirements, actual search-response evidence, and an unsent rights-clearance request are in `../native-image-permissions.md`.
No additional photo was approved, and no permission request was sent through the auth-only email binding.

## Release And Verification Plan

Deploy the exact reviewed JPEG and its attribution before changing the existing park row.
Apply only `pilot/park-photo-update.sql`, which checks the database purpose and prior row fields.
It changes only the description's historical-photo note, photos, and photo credits. It creates no venue and changes no coordinates.
Its repeat must report zero changes. Do not treat an unexpected zero-change first application as success.
The fresh-database seed stays synchronized; old research counters and verification receipts remain historical, not overwritten.

The updated local seed verifier applies all seven native migrations and tests duplicate-import rejection, image hashes, and teardown.
Its first two attempts exposed the old D1 exec assumption: standalone comments and multiline DDL need prepared statements.
The corrected verifier passed with three base venues, three distinct reviewed photos, preserved IDs, and zero outbound requests.
The dedicated update tests cover purpose, identity, geometry, newer edits, attribution, repeat safety, and related saved/itinerary data.
Final acceptance must include actual hosted assets and map/list journeys for all eight records, plus an actual repeated native transfer.
Keep synthetic relationship rehearsal distinct from any empty real user tables. Do not claim a hosted authenticated journey without evidence.

The first local real-catalog browser rehearsal passed with eight reviewed records and images, plus twenty-four map selections at 390/900/1440 pixels.
It used the actual local Worker, D1, and current frontend, with only presentation configuration substituted.
OpenStreetMap tiles were the only permitted external browser source. No email was sent and the local catalog stayed unchanged.
Evidence: `test-results/native-catalog/run-O5QwXL/`. The park image and map were opened during review.
The existing deterministic hero selection now chooses the park as the first photographed catalog record; no selection heuristic changed.

Prefer the tested conditional data rollback while retaining the current asset bundle for existing clients.
If an older Worker is required, first revert only the exact park photo change when still unchanged; preserve the new asset bytes and use an asset-aware rollback when needed.
Never restore an old database over newer user or ingestion activity. Keep every backup, failed attempt, and native transfer receipt.
