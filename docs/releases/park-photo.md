# Park Photo And Discovery Evidence

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

Rollback must first revert only the exact park photo change, if still unchanged, before restoring a Worker that lacks the new asset.
Never restore an old database over newer user or ingestion activity. Keep every backup, failed attempt, and native transfer receipt.
