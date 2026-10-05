# Fresh candidate story background links — 2026-10-05

## Release and scope

PR [379](https://github.com/nkopp-cmd/travelchat-ai/pull/379) tested head `27db5549d5c364546d08ac2e41d43a238fb66c78`.
Required self-hosted [CI37330608378](https://github.com/nkopp-cmd/travelchat-ai/actions/runs/37330608378) passed in9m21s.
Merged runtime source `8e33fd00e3f669b0143fdce822a28fc9c2c467a8` has the identical tree `9dcd2658e4a41cffd1fb64bbcd3af96c8cf252c7`.
TypeScript, focused lint, exact-head pinned OpenNext build, diff and scoped source review passed.

Only the preview Worker received this release.
Version `b3e8a3ef-10b3-45ce-a28a-23144d3b2ea8` runs100%, deployment `21cbffc9-e5e7-4ec5-b109-64c0bec59c66`.
Its source tag matches the merged runtime commit.
Rollback preview version `6bb33686-6b1d-44c4-982a-a740ecda1167` is available.

The existing background API accepts explicit `data_candidate=d1&background_candidate=fresh` on the exact preview host.
Verified reserved fresh owners can link owned R2 backgrounds before slide persistence creates a media row.
Fresh JSON bodies stop at16KiB before parsing.
The atomic upsert checks trip owner/source/days, absent historical mappings and every patch cache owner.
It merges background JSON and preserves all other media fields.
Fresh reads refuse invalid retained references and never fall back to source data.
Unsafe preview settings refuse before source access, using the existing database-error500 contract.
Mapped and normal www/preview routes retain their existing behavior.
No schema, provider selection, media rules, generation activation or production binding changed.

## Exact tests and review

Through `run-heavy.sh`, this command passed19tests across3files:

```sh
npx vitest run __tests__/lib/app-data-preview-fresh-story-backgrounds.test.ts __tests__/lib/app-data-preview-story-metadata.test.ts __tests__/api/ai-backgrounds-candidate-route.test.ts --maxWorkers=1
```

Real SQLite uses the actual cache migrations0028/0031.
Tests cover an actual fresh save without media, read/link/merge and retained non-background fields.
They cover foreign/unverified/historical owners, source URLs, foreign caches, invalid days and missing/corrupt R2 bytes.
Trip/cache/day/history races refuse the write atomically.
An ambiguous committed reply causes no retry or R2 mutation.
Concurrent disjoint patches preserve every key; repeated cache links read bytes only once per patch.
Missing-length oversized streams cancel; malformed JSON/UTF8 and unsafe settings refuse before writes.
Normal www accepts its existing source route even with both candidate flags.

The focused source review found no P0/P1; it did not inspect or execute tests.
Accepted P2 limits remain: deleting retained cache rows fails closed, and the unchanged older candidate writer can invalidate its own trip's fresh references.
Externally lowering trip days can invalidate retained day links; the public fresh update does not change days.
These are not a complete production migration verdict.

## Hosted acceptance and cleanup

Two verified non-admin accounts used reserved addresses and the private preview outbox.
An actual saved one-day trip had no media row and returned an empty background map.
One retained5751967-byte PNG was seeded into exactly its owned R2/D1 cache.
The explicit fresh API created the media row, linked the cache and retained the map on reload.
Owned cache readback matched its complete byte size and SHA256.
Other media fields stayed null/private/default; no slides had been persisted.
Foreign GET/PATCH returned404; anonymous requests returned401.
Source-reference and invalid-day writes returned400 without changing metadata.

The existing story renderer returned a complete4438668-byte PNG through this link.
Chromium decoded1080×1920; the360×640 inspection capture was opened and checked.
The retained illustration is a cache fixture, not new city-specific generation or venue-photo evidence.
No provider call or external email ran. This is not paid-generation or desktop/mobile product-UI acceptance.

Exactly one owned R2 object, cache row, trip, media row and new owner were removed.
Both preview users/sessions/accounts/verification/outbox entries read back as zero; fixture credentials were removed.
At15:26:02UTC, all55APP counts/import hash/AUTH fingerprints and checked source hashes matched the fresh baseline.
Source checks cover users/subscriptions/usage rows and spot IDs; they do not prove complete source-table parity.
Foreign-key checks returned no violations; both production admin IDs remained in AUTH/source.
Production `b42e8926-6b15-4875-85ec-44d39513832d` / deployment `6f22f0cb-a8b8-4e8f-bf76-19965611b471` stayed unchanged.
Production rollback `a548f24e-1f17-4021-a830-219074baa337` and the preview rollback are available.
All three public roots returned200 after the apex redirect.
Preview stays read-only against Supabase, with private outbox and generation/bypass flags absent.

Private `fresh-background-before/accepted/after-20261005.json`, response/hash receipts and `fresh-background-render-decoded-20261005.json` retain exact proof.
The inspected thumbnail and original rendered PNG remain private.
Production app data still uses Supabase. Paid story acceptance, notification history and full cutover gates remain open.
