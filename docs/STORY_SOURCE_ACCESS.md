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

## Verification gates

Twenty-one focused tests, TypeScript and scoped ESLint cover owner, foreign, anonymous and shared reads,
private metadata, signing failure, tier lifetime and unchanged normal/candidate route selection.
The bounded review found no concrete P0/P1 in the supplied Source files.
Required exact-head CI, pinned build and actual owned desktop/mobile image/hash/deny/cleanup proof remain open.
The upload-capacity PR stays draft until this serving correction passes.

## Retained limits

Old saved public URLs and the legacy save route are not repaired by this change.
Signed tokens remain valid until their tier expiry even after a trip is unshared.
Expired gallery state, versioned uploads and failed-write orphan cleanup remain separate work.
A failed signing or database response can leave an object under the existing upsert key.
No full Source media parity, privacy revocation or production D1 cutover is claimed.
