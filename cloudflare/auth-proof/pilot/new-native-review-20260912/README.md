# Native Venue Research

Research only. Nothing in this directory authorizes publication or database changes.
The parent must verify identity mappings, licenses, and exact image subjects before use.

Scope: ten remaining venues in the Seoul native feed, reviewed on 2026-09-12.
The existing museum and pilot assets are excluded.

Acceptance checks:
- Record each provider identity, source address, coordinates, and category proposal.
- Keep unknown Localley UUIDs unknown. The parent owns database verification.
- Fetch file-specific public license evidence before downloading any image.
- Open each downloaded image and record subject limitations.
- Preserve source credits, license notices, and historical-date caveats.
- Do not publish assets, modify runtime code, query databases, or use Git.

Files in this directory are private research evidence, not public runtime assets.

## Parent Identity Decision

Parent instructions on 2026-09-12 approve four exact images for staging, not activation or production publication.
The parent opened DDP ARP007nc1, Sewoon ARP007ev1, Gwangjang Bgag 20220926, and Jongmyo CHA 20130813.
Use only their file-specific licenses in `licenses.md`. Source gallery rights remain unknown.

- DDP: bind preview ID to production DDP B `c6a455dc-4b18-4e29-a36b-7430f2ba8f3b`, 48m from the official pin.
- DDP A (`ccca...`, incomplete ID supplied) is 1.249km away despite its address. Classify it `conflict_pending_separate_quality_review`.
- Preserve both production DDP rows. Never merge, delete, or remap their relationships in this work.
- Gwangjang: bind preview ID to `7f258ce1-b46c-4ab7-96ce-02a5fe5d6b67`. Whole-market name, exact address, and 33m separation support identity.
- Gwangjang uses `market` only in preview. Production `Food` remains unchanged.
- Sewoon: fixed preview-only UUID `8f3807c5-cc7d-49fe-9c09-ac1bc11a143c`, category `shopping`.
- Jongmyo: fixed preview-only UUID `0ec5db76-1250-482b-b780-33009930854b`, category `culture`.
- Sewoon and Jongmyo production identities remain unresolved. Exact-name queries cannot prove absence.
- Six other candidates remain unpublished because of explicit rights gaps. Mother Gimbap also has inconsistent branch identity. Do not crop the market image.

The native review records the newest collected observation for each provider, not the older duplicate.
`actualCandidate.recordId` is the native source record identifier, not a computed image or payload digest.
`sourceNameEn` preserves the collected heading independently from the display name. No source fields are rewritten.
The museum's existing public values and the three original pilot places remain unchanged.
Four byte-identical JPEG copies are staged in `pilot/images`; no crop or re-encoding occurred.
Parent review must precede Git, remote database writes, deployment, publication, or activation.

The parent's existing adapter report supplies DDP A's full UUID: `ccca2adf-3646-47e6-93ec-1df153b10b9c`.
The conflict decision applies to that row. It does not authorize changing the row.

## Preview Publication Contract

`actualCandidate.sourceFields` preserves the exact newest staged record, including private gallery references with unknown rights.
Those gallery references never enter public columns or the asset manifest.
`payloadSha256` hashes UTF-8 `JSON.stringify(sourceFields)`. It differs from `recordId` and the approved JPEG hash.
The generator verifies this digest. SQL compares the complete stored candidate payload with that exact snapshot.
New observations, changed payload bytes, aliases, or facts require another explicit review. Source fields are never normalized silently.

The generator accepts only checked-in reviews and the three exact license URLs.
It verifies image SHA-256, JPEG magic, UUID path, author, historical caption, and reviewed source URL.
An existing UUID mapping requires the same UUID and the identity reference above.
The SQL requires `runtime_purpose` to mark the database `localley-preview`.
One guarded INSERT validates the entire batch before adding any row. It never overwrites public rows.
Exact stored-review repeats succeed without mutations. Unrelated UUID or source collisions abort before inserting any place.
The following UPDATE only binds unmatched private candidates to their verified preview rows.
No SQL transaction syntax, migration, importer change, sync change, or timer change was introduced.

The generator receipt reports five reviewed places, a maximum of five insertions, and an unknown actual insertion count.
The INSERT returns `insertedPreviewId` for each actual insertion. Count those returned rows, not a separate `changes()` query.
The expected existing-museum fixture returns four IDs. A complete repeat returns zero IDs.
These are preview insertions, never evidence of production publication.

Before any parent-approved preview activation, stage all seven manifest JPEGs at `/pilot/<UUID>.jpg` using the existing asset workflow.
Keep `native-reviewed.json`, research files, and generated SQL out of public assets.
Preserve the two existing pilot JPEGs and the museum JPEG byte-for-byte.

The existing build copies `pilot/licenses.md` to public `/pilot/licenses.txt`.
That file currently covers only the original images and museum. It lies outside this assignment's file ownership.
Before activation, the parent must append the four new notices from this directory's `licenses.md` to that public notice source.
The new row credits already contain authors, file sources, license links, historical captions, and required Korean attribution.
Archive rows also include the required archive copyright-policy link in `sourceUrls`.

## Local Verification

Final native package check on 2026-09-12:

`HEAVY_LOCK_WAIT_SECONDS=600 /home/dev/projects/CyberLink/shared/scripts/run-heavy.sh npm run check`

- Passed type generation, server and web TypeScript checks, lint, native build, and package dry-run.
- Passed all 165 package tests, including 72 native import/publication tests. No skipped or failed tests.
- The separate clean-environment wrapper test also passed.
- SQLite and local D1 fixtures verified four returned insertion IDs with the museum already present, then zero on repeat.
- Collision and stale-evidence cases left all public records unchanged, without partial batch insertions.
- A concurrent newer import cannot receive the older review's private identity binding.
- JPEG magic, regular-file checks, changed bytes, exact license URLs, identity mapping, source hashes, geography, and scores fail closed.
- All seven staged JPEG hashes match the manifest. Four new images match the exact research bytes.
- The build staged seven JPEGs locally. The package dry-run excluded review snapshots, research copies, and generated SQL.
- No remote database write, deployment, activation, production publication, or Git command occurred.
- Parent review, the public notice update, and broader root checks remain required before activation.

The initial D1 fixture needed the installed Miniflare 5 configuration and complete prepared SQL statements.
A separate `changes()` query then returned an unreliable cross-call count. `INSERT ... RETURNING` fixed the receipt.
The final local D1 test uses sequential statements, not a surrounding transaction that could hide partial-write defects.

Newest source payload digests, distinct from image digests:

| Provider | Observed At (2026-09-12 UTC) | Payload SHA-256 |
| --- | --- | --- |
| Museum `1537` | 02:22:53.409 | `537bed9a1d5530f23b6489a4076df63f9caa3c63a881560817139f8da7c57884` |
| DDP `24680` | 03:35:47.075 | `64162be08484985378dda972d5ff288f551944b3f8fd1d21e4eb233f9fad8a7f` |
| Sewoon `24707` | 03:33:45.207 | `a29b67c1606c67d6f42d8eef0110a2627b7fda9a93b3b5dab143e8019842ff18` |
| Gwangjang `287` | 03:33:14.177 | `e4bc5c4e1e67741d61689f7cfc5821055dd54ed0282841099732c2b7990c4da2` |
| Jongmyo `549` | 03:30:42.795 | `44c8fbf3d5190021c8a006b35f7cbfbd6381e517974f54acff7f30be3bf59b19` |

## Public Repository Correction

This repository is public. The earlier description of checked-in research as private was incorrect.
The earlier `actualCandidate.sourceFields` contract is superseded by the private-input contract below.
The checked-in review now contains only public review facts and four observation pins: record ID, timestamp, payload hash, and source name.
All five approved records, UUIDs, categories, licenses, image hashes, and source payload hashes remain unchanged.
The Gimbap follow-up report also omits private asset and gallery references. Its identity conflict and no-crop decision remain unchanged.

The exact five reviewed observations were preserved locally, without fetching or re-collecting data:

`cloudflare/auth-proof/.preview-private/native-publication-reviewed-observations.json`

This file contains a staged-record envelope and retains the original payload digests above.
It has mode `0600` and lives under the existing `.preview-private/` ignore rule.
It is not a synthetic export and is not a new collector run.
The parent's genuine `production-followup-export.json` remains untouched.
That export does not satisfy all five current review pins, so it cannot replace the saved reviewed observations automatically.
Never change approved hashes merely to make another export pass.

## Private Input Command

Run from `cloudflare/auth-proof`:

```sh
node scripts/native-publish.mjs \
  .preview-private/native-publication-reviewed-observations.json \
  .preview-private/native-publication-private-input.sql
```

Generation only: this command does not execute SQL, upload assets, fetch sources, or publish anything.
The output contains exact private source snapshots for SQL guards. Keep it private with the input.
The output uses exclusive creation and mode `0600`; an existing output is never overwritten.
The old output-only CLI is no longer supported. No timer or importer invokes this manual publication command.

The CLI always uses checked-in `pilot/native-reviewed.json`. No flag can supply another approval registry.
It accepts a zero-paid `localley-native-v1` export or a `publicationReady: false` staged-record envelope.
For versioned exports, the transport-only `kind` field is placed first as in staged records; collected fields are not rewritten.
The resulting serialization must still match the exact approved digest. There is no hash fallback or relaxed comparison.
Missing, changed, newer, and conflicting observations fail before output creation.
Errors never echo raw input, including malformed JSON text.

The in-process `publicationSql(reviews, sourceRecords, trustedReviewRegistry)` function permits an explicit trusted fixture registry.
Tests use synthetic observations and fixture hashes through that dependency; the real checked-in hashes stay fixed.
The CLI exposes no such dependency override.
SQL still compares the complete private candidate payload and every existing public field before insertion or repeat acceptance.
Whole-batch collision failure, four-new-row receipts, and mutation-free repeats remain required.
The existing public policy-credit update remains parent-owned. No publication or activation is authorized here.

## Privacy Follow-Up Verification

The new private-input command generated SQL locally from the five preserved genuine observations.
All five original payload hashes matched. The generated SQL was not executed against any database.

`HEAVY_LOCK_WAIT_SECONDS=600 /home/dev/projects/CyberLink/shared/scripts/run-heavy.sh npm run check`

- Passed all 177 package tests, including 84 native import/publication tests, with no failures or skips.
- The separate clean-environment wrapper test also passed.
- Passed type generation, both TypeScript checks, lint, native build, and package dry-run.
- Tests cover missing and wrong snapshots, exact hashes, source identities, stale and conflicting observations, and supported input envelopes.
- Synthetic fixtures exercise the full SQLite and D1 batch guards and mutation-free repeats without reading private collector files.
- Tests separately verify real public hash pins and approved JPEG bytes.
- The real CLI rejects synthetic approval hashes and registry-override arguments. Malformed input never appears in error output.
- Public manifest and review-evidence checks reject raw private references. Private inputs remain under the existing ignore rule.
- Package output excludes private observations and generated SQL.
- No fetch, paid request, importer change, timer change, remote database write, deployment, activation, or Git command occurred.

## Expanded Preview Acceptance

The parent added all four public image notices and removed the private feed endpoint from the research candidate file.
The checker now derives its expected catalog from `pilot/catalog.json` plus `pilot/native-reviewed.json`.
The current union contains eight unique UUIDs: three base places and five native reviews.
`pilot/manifest.json` supplies the seven expected JPEG filenames and SHA-256 digests.
No four-place count remains in the live acceptance path.

Full acceptance checks exact IDs, names, descriptions, categories, addresses, coordinates, source URLs, authors, and license links.
It preserves confirmed source-alias UUIDs and rejects missing, duplicate, or substituted identities.
It compares the public credit fields exported by the current catalog DTO, not private review metadata.
Historical descriptions must remain visible, including Jongmyo's 2013 view and Gwangjang's 2022 photograph.
Archive cards must expose the reviewed copyright-policy links; the checker does not silently drop query-bearing source URLs.

Asset GET checks require status 200, JPEG content type and magic bytes, and the exact manifest digest.
Browser image responses also require those exact bytes, so browser-specific WebP conversion cannot pass unnoticed.
The deployed `/pilot/licenses.txt` must match the current public notice file byte-for-byte.
Photos and their credits are located across the page, including the shared hero component.
The checker rejects substituted images and cropped image presentation; the current component uses `object-fit: contain`.

At 390, 900, and 1440 pixels, the browser checks eight cards, seven loaded photos, source links, and overflow.
It selects all five native places through the real map controls and checks each popup title and selected UUID.
It also exercises the popup's return-to-list button and verifies focus on the corresponding card.
Trips remain inaccessible without a verified linked account.
Anonymous denials, service GET access, auth denial, and the empty service POST denial probe remain required.
No recipient, password, or test email is supplied. The existing private access file is read but never modified.
Access credentials are attached only to the pinned preview origin; browser requests do not forward them through redirects.
Receipts contain only public IDs, checks, statuses, and asset hashes. Response bodies and credentials are not logged.

### Parent Commands

Run from `cloudflare/auth-proof`. Before data apply, after the parent deploys the approved assets and public notices:

```sh
HEAVY_LOCK_WAIT_SECONDS=600 /home/dev/projects/CyberLink/shared/scripts/run-heavy.sh \
  node scripts/check-native-preview.mjs --assets-only
```

This mode retains access checks but deliberately does not require eight catalog records or launch a browser.
An assets-only pass does not approve data publication.

After the parent completes the separate source/database preflight and approved preview apply:

```sh
HEAVY_LOCK_WAIT_SECONDS=600 \
PLAYWRIGHT_EXECUTABLE_PATH=/home/dev/projects/CyberLink/.runtime/opencode-xdg/cache/ms-playwright/chromium-1234/chrome-linux64/chrome \
/home/dev/projects/CyberLink/shared/scripts/run-heavy.sh \
  node scripts/check-native-preview.mjs --live-preview
```

The command uses the existing shared Chromium installation. Do not install another browser.
Live screenshots go to ignored `.preview-private/native-acceptance/` and require parent visual review before release.
Neither mode executes database SQL, refreshes source evidence, changes review pins, or deploys anything.

### Verification And Remaining Gates

- The targeted Node run passed 107 tests, including 23 new acceptance tests and all 84 existing native tests.
- The package check passed 200 tests with no failures or skips, plus the separate environment-isolation test.
- Type generation, both TypeScript checks, lint, native build, and package dry-run passed.
- The final local browser fixture passed all three widths and fifteen native map selections using the actual components.
- The fixture sorts records like the API, so the museum photo appears in the hero, not its card.
- The fixture verified browser JPEG bytes, uncropped presentation, credits, historical copy, and denied Trips access.
- The fixture deliberately blocked all external tile requests. It does not establish real tile availability or deployed data correctness.
- Fixture screenshots are in ignored `.preview-private/native-acceptance-fixture/`.
- Desktop/mobile screenshot review found intact image subjects, readable historical copy, and no horizontal overflow.
- At 390px, Leaflet zoom controls overlap part of the DDP and museum popup titles. Map selection works, but the parent must review this existing UI defect.
- The live assets-only run passed the access probes, then failed `asset.content_type:c6a455dc-4b18-4e29-a36b-7430f2ba8f3b.jpg`.
- The DDP endpoint did not serve `image/jpeg`. Later assets and deployed public notices were not checked after that first failure.
- `src/catalog.ts` currently rejects all query-bearing source URLs. It strips the required Archive policy link and Jongmyo's upstream heritage link.
- That API behavior must be addressed by the parent before full acceptance. The checker intentionally retains strict expected source URLs.
- Full live eight-place/browser acceptance remains pending parent deployment and data apply.
- No source/database preflight was duplicated, no hashes were refreshed, and no remote database writes, deployments, or Git commands occurred.
