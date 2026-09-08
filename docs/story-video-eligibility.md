# Story Video Eligibility

`GET /api/itineraries/[id]/story/video` requires authentication and current itinerary ownership.
Every response has `Cache-Control: no-store`.

The successful response has this exact shape:

```ts
{
  canSubmit: boolean;
  reason: null | "premium_required" | "unavailable" | "unsupported_story_text"
    | "limit" | "processing_unavailable";
  eligibleDurations: number[];
  model: "MiniMax-H3";
  format: "mp4";
  ratio: "9:16";
}
```

`eligibleDurations` contains the allowed values from `[4, 5, 6]`, in ascending order.
A denied result has `canSubmit: false` and an empty duration list.
The UI must keep the poster when eligibility fails or an unknown job status appears.

Authentication failures return HTTP 401 with `{"errorCode":"unauthorized"}`.
Invalid IDs return HTTP 400 with `{"errorCode":"invalid_input"}`.
Missing or unowned itineraries return HTTP 404 with `{"errorCode":"not_found"}`.
Missing migrations, missing budget configuration, or invalid storage return HTTP 503 with `{"errorCode":"unavailable"}`.
These errors do not include the eligibility body.

## Submission Checks

Both GET and POST require Premium access, `ENABLE_MINIMAX_H3=true`, and a configured `MINIMAX_API_KEY`.
Both also require `ENABLE_STORY_VIDEO_PROCESSING=true` and `STORY_VIDEO_DELIVERY_READY=true`.
These values require an explicit operator confirmation.
They are not a worker heartbeat or an automatic health check.
The operator must confirm working processing and private delivery before enabling new submissions.
This change does not enable either flag.

Without either processing flag, GET returns `reason: "processing_unavailable"`.
POST returns HTTP 503 with `{"errorCode":"processing_unavailable"}`.
Existing polling and delivery remain available when submission flags are off.

Both routes validate text through `formatStoryVideoText` and verify the private `story-videos` bucket.
GET calls `get_story_video_eligibility` to check database readiness and current limits.
GET creates no reservations, provider requests, tokens, or signed URLs.
The result is advisory because another request can use capacity immediately afterward.
POST uses the new reservation RPC signature as its migration check.
The atomic reservation remains the final budget authority, including for duration selection.
Replays precede budget limits inside that transaction.

## Snapshot Rules

The server trims the title to 200 characters and the city to 100 characters.
The caption includes the city and `AI-generated travel scene`.
The server validates these fields before reserving funds or calling the provider.
The payload hash includes the exact render title and caption.

The reservation holds the accounting lock and an ownership row lock.
SQL recomputes and verifies the render text and provider prompt from that owned itinerary.
A changed preflight snapshot returns HTTP 409 with `{"errorCode":"conflict"}` before any provider call.
New inserts require non-null render fields, which the existing render guard makes immutable.
Later itinerary edits cannot change the saved render text.
Ownership changes still prevent processing and delivery.

The migration does not backfill old jobs with invented snapshots.
Only legacy jobs with a null snapshot read current text during their first processing claim.
The old six-argument reservation RPC is removed, so old callers fail closed.

Active limits include `provider_ready` and `processing`, as well as existing active provider states.
Delivered jobs and terminal render failures do not use active capacity.
All existing lifetime, daily, and owner admission policies remain in force.

## Offline Verification

Run `node scripts/test-story-video-ledger.mjs` for disposable PostgreSQL tests.
Run `npx --no-install vitest run __tests__/api/story-video-route.test.ts __tests__/api/story-video-delivery.test.ts` for API tests.
These tests use no live database, paid provider calls, deployment, or environment changes.

Verification on 2026-09-07 passed 31 PostgreSQL groups, including the original 24 groups.
The API and processing suites passed 148 tests.
TypeScript and targeted ESLint checks also passed.
