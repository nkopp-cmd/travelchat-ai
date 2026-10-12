# Private Source story serving

## Observed defect and scoped change

The existing generated-images Source bucket is private.
A controlled3518698-byte PNG upload passed, but its public URL returned400.
A signed URL returned200 with the exact retained image hash; exact deletion and authenticated absence passed.
Normal story uploads now return signed media links for the existing tier retention period:7/30/90days.
The bucket policy remains private. No key, provider, schema or production data migration changes.
Normal persisted GET and gallery require the exact owner unless the itinerary is explicitly shared.
Private gallery metadata has no media OpenGraph/Twitter links and requests no indexing.
Returned slide metadata uses private/no-store caching.
Exact candidate D1/R2 routing retains its existing private-owner paths with no Source fallback.

## Delivered API verification — 2026-10-12

PR407 source442183c / CI38288943823SUCCESS10m08s / merge5f0e6d8.
Twenty-one focused tests, TypeScript, scoped ESLint, pinned build and bounded noP0/P1 review passed.
Artifact audit scanned2327files/76756736bytes against92private values; no unexpected hits appeared.
Only the five existing public Kakao server aliases remained; no browser/private-key match appeared.
Initial release Worker8b4db9c2/deploymentec2a30dd, rollback5814fa95.
Current release below includes this change and the bounded upload correction.

Actual three gradient PNGs persisted with signed links and matching Source hashes.
Live owner read/reload, free retention7days, anonymous middleware401 and second-owner404 passed.
Exact three storage deletes and authenticated unavailable400, both Source profiles and auth fixtures passed.
A later independent large-upload proof passed53 checks and repeated these API/storage/owner results.
Both admins, source8/5/33/85/3295 counts and four public200 remain unchanged.

## Device gate stopped after two attempts

The first run failed an order-sensitive JSONB comparison before browser or paid work.
Actual JSONB order was day1/cover/summary; the reply order was cover/day1/summary, with identical values.
The corrected second run passed53 API/cleanup checks, then expected the wrong page heading.
The page uses itinerary.title; the harness expected Seoul Story Slides.
No screenshot or desktop/mobile acceptance is claimed. The next device check needs a title-based selector and preflight.
Receipt3ea3bc12dfda remains unknown, estimatedUSD0.01, for existing image transforms before the assertion.
No automatic browser or paid-image retry occurred. No new image-generation request occurred.

## Retained limits

Old saved public URLs and the legacy save route are not repaired by this change.
Signed tokens remain valid until their tier expiry even after a trip is unshared.
Expired gallery state, versioned uploads and failed-write orphan cleanup remain separate work.
A failed signing or database response can leave an object under the existing upsert key.
No full Source media parity, privacy revocation or production D1 cutover is claimed.
