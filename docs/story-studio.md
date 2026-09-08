# Story Studio

Current merge requirements supersede historical status notes below: see `releases/story-studio-merge.md`.
The image ledger is now installed and verified on the hosted database. Video migrations remain deferred.
New paid generation and video controls remain disabled unless server readiness explicitly permits them.

Status: carousel/video controls, Korean exports, caption snapshots, accounting, encoding, and private delivery implemented locally. Live activation remains pending.
Date: 2026-09-07.
The user explicitly requested changes to the previously protected story pipeline for this feature.
Existing safety constraints still apply. This permission does not justify an unrelated rewrite.

## Implementation Evidence

### Creator And Korean Follow-Up

The real story dialog now offers Image carousel and Video tabs, with carousel selected initially.
Video controls read server eligibility rather than assuming that a key or paid tier makes generation available.
The owner-only eligibility endpoint checks flags, storage, text, migration readiness, and available duration limits.
`STORY_VIDEO_DELIVERY_READY=true` records operator confirmation; it is not an automatic worker heartbeat.
No readiness or generation flags were enabled during implementation.

The two story dialogs share video request state by Clerk user and itinerary.
A synchronous lock prevents duplicate submissions from their two triggers.
Uncertain requests keep their original request identity. Known jobs use GET for recovery.
Closing stops polling, not provider work. Full-page reload recovery remains a follow-up.
Only completed jobs show a private MP4 download action. Videos do not enter public carousel sharing.

`20260907080754_story_video_reservation_snapshot.sql` stores immutable render text at reservation time.
The transaction verifies the server's preflight text against the owned itinerary before any provider submission.
Later itinerary edits cannot change a new job's captions. Legacy null snapshots retain their documented behavior.
This resolves the submission/claim text race described in earlier sections.
The new reservation signature requires coordinated deployment of the migration and server code.

Korean and English now render from a pinned local Noto Sans KR Regular font.
The renderer verifies its SHA-256 and never fetches fonts at runtime.
It supports all Hangul syllables, modern Jamo, NFC normalization, ASCII, and specified punctuation.
Tests check real glyph outlines, weighted wrapping, long text, and disclosure preservation.
Unsupported characters still fail validation before generation.
Font provenance, immutable source revision, and OFL obligations are in `lib/fonts/README.md` and `lib/fonts/OFL.txt`.
The upstream regional font subset is 4,644,748 bytes. No new npm package was installed for it.

A real four-second Korean MP4 was generated from synthetic local input through the encoder.
The reviewed frame is `test-results/story-video-overlay/frame.png`.
The video is `test-results/story-video-overlay/sample.mp4` and clearly labels its synthetic input.
All 9,086 sampled text pixels appeared in decoded output.

Interactive component preview: `http://127.0.0.1:4174/?scenario=ready`.
It mounts the real components outside production routes, with a prominent simulated-data banner.
Its fake API responses cannot call providers or create charges.
The preview's download fixture is a labeled text file, not a generated MP4.
Use the separately encoded artifact above to inspect real video output.

Browser review passed all seven tests at 390, 900, and 1440 pixels.
It covers keyboard operation, focus, touch, shared requests, state transitions, and private download paths.
Four discovered defects were fixed: small close target, obstructing toast, pale radios, and low-contrast placeholder text.
The close target now measures 44x44 pixels. Radio contrast measures 4.83:1.
Placeholder label contrast measures 5.70:1 and 7.90:1 at the gradient endpoints.
All regenerated representative images and contact sheets were opened for review.
Detailed evidence and source selection are in `story-studio-browser-review.md`.

Final verification: 1,560 tests pass, with the opt-in Docker integration test skipped in the normal suite.
Production build and TypeScript pass. Thirty-one local PostgreSQL integration groups pass.
A test-only lifecycle warning was corrected afterward; both affected files passed all 38 focused tests without that warning.
Native browser zoom, dark mode, actual Clerk sessions, live provider output, and live storage delivery remain unverified.
The preview supplies a Korean browser font separately; production browser fallback loading remains to be checked.
All four media migrations remain unapplied to Localley's database.
No worker, model flags, nonzero budgets, or hosting changes were deployed. Spending remains $0 of the approved $20 ceiling.

### Private Delivery Follow-Up

The processing service now connects stored provider output to validated downloads, the isolated encoder, and private storage.
Processing claims use database-generated tokens, 15-minute leases, and at most three local render attempts.
Expired render work can be reclaimed without submitting another provider job or releasing its cash allocation.
Each attempt writes a unique `${jobId}/${token}.mp4` object, without overwriting earlier attempts.
The processor reads the object back and verifies length and SHA-256 before committing `delivered`.
Stale tokens cannot finish another worker's attempt.
Uncertain uploads or settlement remain leased for later recovery. Orphan cleanup is not implemented.

Migration: `supabase/migrations/20260907071555_story_video_processing.sql`.
It adds processing and artifact state and provisions the private `story-videos` storage bucket when Supabase Storage exists.
It refuses an existing public bucket and restricts browser roles from accessing its objects directly.
It has been tested only in disposable PostgreSQL, not applied to Localley's database.
All three media migrations must be verified in the intended environment before activation.

The owner-only download route is `/api/itineraries/[id]/story/video/[jobId]/download`.
It checks current itinerary and job ownership, completed state, and private bucket configuration.
It redirects to a signed storage URL valid for 60 seconds, with private/no-store and no-referrer headers.
The signed URL is a temporary bearer link. Ownership changes cannot revoke an already issued link before its expiry.
The ordinary status response contains only the application download route, not the signed or provider URL.

The encoder verifies source streams, codecs, dimensions, duration, frame rates, rotation, and full decode success.
It produces silent 1080x1920 H.264 at 24 fps, strips source metadata, and burns the overlay into output frames.
It fully probes and decodes the final output before returning bytes.
Docker runs with no network, a read-only root, dropped capabilities, bounded resources, and one private job directory.
The worker does not pass application secrets into that container.
Each media process has a two-minute timeout within a three-minute processing deadline.
This implementation requires an approved non-root Linux Docker host. It is not a standard Workers or Vercel encoder.

Titles up to 200 characters and captions up to 160 wrap automatically.
Long text uses visible ASCII ellipses, while the AI disclosure retains its own line.
Korean and other non-ASCII text remain unsupported by this encoder font.
Submission now rejects unsupported text before reservation or generation, rather than paying for an unrenderable job.
The processing claim still snapshots current itinerary text. Edits between submission and claiming can change render input.
Snapshot text at submission, or revalidate this race, before production activation.

Single-job entry point:

```bash
node --conditions=react-server --import tsx scripts/process-story-video.ts <job-uuid>
```

The command requires `ENABLE_STORY_VIDEO_PROCESSING=true`, approved exact `STORY_VIDEO_ALLOWED_HOSTS`, server database configuration, and the local encoder image.
It validates basic configuration before claiming work. It does not change budgets or submit provider requests.
`STORY_VIDEO_WORK_DIR` can select an approved private work area on the encoder host.
No scheduler or automatic worker service was deployed.

Final verification:

- Full suite: 1,482 passed across 121 files; one opt-in Docker integration test skipped by default.
- The skipped integration test was explicitly run and passed separately.
- That test uses the real encoder with synthetic input and mocked provider downloads, RPCs, and storage.
- It verified the attempt-specific key, stored-byte readback, hash, settlement, and sanitized delivery status.
- Output: 1080x1920 H.264, 24 fps, 96 frames, four seconds, and 28,318 bytes.
- Opened `test-results/story-video-delivery/frame.png`; output is `test-results/story-video-delivery/sample.mp4`.
- Twenty-four PostgreSQL integration groups pass, including claims, expiry, stale tokens, attempt limits, and delivery ownership.
- Production build, TypeScript, and targeted ESLint pass.

Run the real-encoder integration with:

```bash
RUN_STORY_VIDEO_ENCODER_TEST=1 npx --offline vitest run __tests__/integration/story-video-delivery.test.ts
```

Live provider generation, actual Supabase Storage delivery, hosted migrations, Cloudflare execution, and video UI remain unverified.
No live worker jobs ran. No provider spending occurred; the approved $20 test ceiling remains untouched.

### Video Job Follow-Up

The H3 adapter now has authenticated submission and status routes.
`POST /api/itineraries/[id]/story/video` requires itinerary ownership, Premium, and a stable `Idempotency-Key`.
The request accepts only a four-to-six-second duration. Prompt context comes from the itinerary.
`GET /api/itineraries/[id]/story/video/[jobId]` checks both job and current itinerary ownership.
Responses contain no provider URLs or internal tokens and disable caching.
Status checks remain available after submissions are disabled or the user's tier changes.

Migration: `supabase/migrations/20260907064632_story_video_jobs.sql`.
It creates an operator-owned budget row and durable video jobs.
Every spending and admission limit starts at zero. Requests cannot raise the configured limits.
The maximum configurable lifetime video allocation is 2,000 cents.
Additional limits cover UTC daily allocations, owner daily admissions, and owner active jobs.
The budget is not reset at midnight or when an itinerary is deleted.

The current allocation formula is eight cents per second for fixed H3 768P text-only generation.
These are recorded video output estimates, not verified provider invoices or combined image/video/encoding costs.
The approved $20 ceiling remains shared across all media testing.
Before live use, allocate less than the remaining total ceiling to video to leave room for other costs.
The video ledger alone does not enforce that combined ceiling. Do not call it an aggregate media budget.

Database reservations prevent competing requests from exceeding configured caps.
Matching retries reuse the job and never receive new submission authority.
Changed payloads with an existing key return a conflict; explicit regeneration needs a new key.
The submitting state commits before the provider POST.
Uncertain submissions retain their full allocation and are never automatically resubmitted.
Only expired reservations that never reached submission release their allocation automatically through the expiry RPC.
Provider rejection, failure, and cancellation retain allocations until billing evidence establishes a safe release.
This conservative policy can require operator intervention; there is no automatic billing reconciliation worker yet.

Status polling uses a ten-second per-job database claim and a fresh fence.
Stale responses cannot regress state or attach a different task ID.
Poll claims do not take the global budget lock; unrelated jobs can be polled independently.
Provider success records `provider_ready`, not `delivered`.
The provider URL stays private for later processing. No download link is exposed yet.

`lib/story-video-download.ts` provides a standalone server-only ingestion helper.
It accepts exact server-controlled hostnames, resolves DNS once, and pins the validated address to the TLS connection.
It rejects redirects, private or reserved addresses, mixed DNS answers, and compressed responses.
Its whole-operation deadline is 15 seconds and its byte limit is 32 MiB.
It verifies a bounded MP4 `ftyp` header instead of trusting Content-Type.
This header check does not establish valid media. FFprobe and a constrained full decode are still mandatory.
The helper is not yet connected to job processing or the encoder.

Verification on the final source:

- All 1,390 tests pass across 117 files.
- The regular production build and its TypeScript stage pass.
- Twenty video-ledger integration groups pass on actual PostgreSQL 17.11.
- SQL groups cover real concurrency, limits, replays, lock scope, ownership, expiry, permissions, and monotone polling.
- Reproduce those SQL checks with `node scripts/test-story-video-ledger.mjs`.
- The disposable database was removed after testing.

Both media migrations remain unapplied to Localley's database.
No flags, provider keys, or nonzero video budgets were configured.
No live generation or real provider downloads occurred. Provider spending remains $0 of the $20 ceiling.
No new visible video controls were added in this API-focused slice.

The next implementation must connect validated ingestion, isolated encoding, controlled storage, and owner-only delivery.
It must also address Korean fonts, retention, reconciliation, and target-host execution before activation.

### Durable Follow-Up

The newest implementation supersedes the earlier reservation and refund gaps described below.
It does not establish production activation or a complete video product.

Image accounting now uses `story_image_jobs` with a unique user/request key and a database-generated owner token.
Reserve, submit, and settle each run in a short transaction. No database lock spans a provider call.
Reservation calls the existing weighted RPC, sharing its exact usage-counter lock.
Failed delivery refunds the recorded month exactly once. Successful retries return the stored URL without charging again.
Pending duplicates do not receive an owner token and cannot submit another provider request.
Settlement failures remain pending; the route never assumes a refund succeeded.
Direct table and RPC access is restricted to the service role, with RLS enabled.

Migration: `supabase/migrations/20260907060610_story_image_jobs.sql`.
It was applied only to a disposable local PostgreSQL test database, not Localley's database.
The updated background route requires this migration for all uncached AI image generation.
Do not deploy that route before applying and verifying the migration in the intended environment.
No legacy increment fallback remains.

Recovery uses `reconcile_story_image_job` for expired, unsubmitted reservations.
Submitted jobs with uncertain results require operator review against provider and storage evidence.
No automatic replay occurs. No reconciliation scheduler or operator dashboard exists yet.
User credit refunds do not imply that providers refund their costs.
A caught generation failure can include a provider timeout; unsuccessful delivery returns the user's credits.
The same failed key stays terminal, preventing an automatic second provider call.

The client polls pending jobs using the identical serialized request and a shared 90-second deadline.
Closing or unmounting cancels client work, not an already submitted server job.
Only confirmed terminal failures permit fresh attempt keys on the next explicit generation action.
Successful, pending, and uncertain requests retain their keys and bodies during the dialog session.
A complete remount loses session retry history, so retry continuity across reloads remains a follow-up.
Pending work does not report completed slides or trigger persistence.

MiniMax implementation: `lib/minimax-video.ts`.
Submission requires `ENABLE_MINIMAX_H3=true` and a configured `MINIMAX_API_KEY`.
It accepts only text-to-video, 4-6 seconds, 768P, and 9:16 for the initial bounded contract.
It makes no automatic retries and distinguishes ambiguous submissions from explicit rejection responses.
Queries remain available when new submissions are disabled, allowing existing tasks to be reconciled.
Task IDs, model identity, response sizes, states, and output URL syntax are validated.
Provider outputs are not downloaded yet. DNS, redirect, media validation, and ownership checks belong to the future job service.
No public video route, durable video ledger, or callback endpoint has been added.

The offline encoder proof produces an actual four-second H.264 MP4 with burned-in text.
It uses a separately rendered transparent overlay over synthetic input, not real or generated travel footage.
The extracted frame was opened and reviewed.
The proof confirms 1080x1920, 24 fps, 96 frames, and exactly four seconds.
Pixel checks verified 7,217 text pixels and preserved 540,000 safe-zone pixels.
English overlay support is proven. Korean fonts, live footage, and production delivery remain unverified.

Artifacts:

- `test-results/story-video-overlay/sample.mp4`
- `test-results/story-video-overlay/frame.png`
- `test-results/story-video-overlay/overlay.png`
- `test-results/story-video-overlay/evidence.json`

Verification:

- All 1,189 tests pass across 115 files.
- The regular production build passes, including TypeScript.
- Ten integration groups pass on actual PostgreSQL 17.11.
- Integration groups cover concurrent reservations, mixed legacy counter calls, refunds, original-month settlement, permissions, fencing, and rollback.
- Reproduce ledger checks with `node scripts/test-story-image-ledger.mjs`.
- Reproduce overlay checks after building `infra/story-encoder` with `node --import tsx scripts/test-story-video-overlay.tsx`.
- Test containers had explicit resource limits and no runtime network or remote secrets.
- Disposable database and encoder containers were removed after tests.

New provider spending remains $0 of the approved $20 total ceiling.
No new model flags were enabled and no production database or hosting changes occurred.
Pending-dialog behavior has component tests, but no new browser screenshot review yet.
Final encoder hosting, licensing review, global monetary caps, retention, and live account access remain release gates.

### Earlier Adapter Slice

The user approved proceeding after the proposed $20 total test ceiling.
Treat that ceiling as shared across image, video, and encoding tests, not a per-provider allowance.
New media API spending in this implementation slice: $0. Remaining ceiling: $20.
No paid requests or new environment variables were enabled.

Implemented:

- `lib/gpt-image.ts` calls the Image API only when explicitly enabled and configured.
- The adapter requests one low-quality PNG at 1024x1536, with a 45-second timeout and zero SDK retries.
- Prompt instructions reserve overlay space and describe the result as imagined artwork, not documentary evidence.
- Image output is size-bounded and fully decoded before acceptance. WebP and malformed images are rejected.
- The existing image router and model list support `gpt-image-2` as a Premium option.
- The model remains absent from the list unless its flag, key, and credit configuration are valid.
- Automatic provider selection does not select GPT Image 2.
- The background route now validates requests and uses owner-scoped, hashed cache identities.
- Cache identity includes provider, model/prompt revision, scene fields, and the caller's cache key.
- Exact PNG and JPEG cache matches are read before usage increments.
- Usage failures block generation. A missing weighted RPC no longer falls back to a single-credit increment.
- A request makes one paid provider attempt, including automatic mode. It does not cascade across providers.
- Unknown image bytes are no longer assumed to be PNG.
- Existing saved URLs remain intact. New requests do not reuse unsafe legacy shared cache entries.

Configuration contract, not an activation instruction:

| Variable | Requirement |
| --- | --- |
| `ENABLE_GPT_IMAGE_2` | Must equal `true`; unset means disabled |
| `OPENAI_API_KEY` | Existing secure key must be present |
| `GPT_IMAGE_2_CREDITS` | Positive safe integer chosen after cost measurement |

The flag alone is not release approval.
Do not activate until durable reservation, settlement, refunds, and concurrent-request deduplication are verified.
The existing usage increment still charges failed generation or upload attempts.
Concurrent misses can still generate and charge independently.
These remaining accounting gaps are why this slice made no paid image calls.
No arbitrary commercial credit price was selected.

Verification: 1,009 tests pass across 110 files, including 161 new offline regression cases.
The regular production build, TypeScript, focused lint, and diff checks pass.
Provider access, real output quality, exported overlay appearance, and live billing remain unverified.
The Satori renderer and story dialog were not changed in this slice.
The provider returns 2:3 source media for the existing renderer's 9:16 crop; it does not promise native 9:16 generation.

Shared ledger writes remain blocked by workspace permissions. This local record preserves the zero-spend evidence.

## Goal

Turn a Localley itinerary into an image carousel or a short video.
Use one ordered scene plan and separately rendered text for both outputs.
Let users preview, edit captions, reorder scenes, and export without unnecessary regeneration.
Make image carousels the initial default. Keep video an explicit paid choice.

## Verified Models

| Output | Requested name | Verified API model | Initial integration |
| --- | --- | --- | --- |
| Images | ChatGPT Image 2.0 | `gpt-image-2` | OpenAI Image API |
| Video | MiniMax H3 | `MiniMax-H3` | MiniMax asynchronous video API |

OpenAI also lists the snapshot `gpt-image-2-2026-04-21`.
Pin a verified snapshot for repeatable tests when supported by the chosen endpoint.
Use the Image API directly, rather than adding a conversational model call to generate each background.
Do not confuse ChatGPT subscription access with API billing or model access.
The project already uses `OPENAI_API_KEY`; reuse its secure configuration rather than adding a duplicate variable.
Its image-model access remains unverified.

MiniMax documents `POST /v2/video_generation` and `GET /v2/query/video_generation/{task_id}`.
H3 supports text, frame, and reference-based generation.
The documented output range is 4-15 seconds at 768P or 2K.
`MiniMax-H3-Max` is a separate model. Do not silently substitute it for H3.
The inspected source contains no MiniMax adapter or credential configuration.
The official direct API examples use `MINIMAX_API_KEY`.
Existing provider keys do not prove access to this model.

## User Flow

1. Choose Image Carousel or Video.
2. Review scenes generated from the actual itinerary.
3. Edit captions and choose licensed source media or labeled generated visuals.
4. Review the format, duration, estimated charge, and maximum authorized charge.
5. Generate once and track the real job state.
6. Edit text or scene timing without regenerating the underlying media.
7. Export ordered PNG slides or an MP4 with text included in its frames.

Start with portrait output and the existing Localley story identity.
Keep existing social safe zones until visual testing establishes a better layout.
Do not stretch generated media to fit. Crop or letterbox with an explicit preview.
Test landscape source assets, long Korean names, bilingual captions, and emoji fallbacks.
Generated scenes must not masquerade as authentic footage or proof of a venue's appearance.
Narration is optional later. It is not required for the first video implementation.
Do not add unlicensed music, cloned voices, or automatic sound playback.

## Rendering

Store text, timing, and layout separately from generated assets.
The model generates imagery, not the final overlay lettering.
Image exports retain the existing Satori and PNG rendering approach.
For video, render transparent overlay images with controlled fonts, then composite them into the frames.
This reuses text shaping and wrapping rather than rebuilding them through FFmpeg drawtext.
Verify transparent overlays and Korean glyph coverage with real exported files before claiming parity.

Use FFmpeg for the first encoding experiment, subject to its build and codec licenses.
Pass fixed arguments directly, without a shell or user-controlled filter expressions.
Use `-nostdin`, deadlines, process limits, and isolated temporary storage.
Give the encoder validated local assets rather than unrestricted network URLs.
Reject private network destinations and unsafe redirects during asset ingestion.
Verify magic bytes, dimensions, duration, size, codec, and decode success.
Delete temporary files and reject incomplete exports.

A browser overlay above a video is only a preview. It does not satisfy the export requirement.
The downloaded MP4 must contain the visible captions without Localley's website.
Keep the original asset so caption changes require only a new render.
Re-rendering still has compute cost; do not promise unlimited free edits.

## Existing Contracts

Preserve existing saved PNG URLs and carousel ordering.
Keep video jobs and video metadata separate from `itineraries.ai_backgrounds`.
Do not put MP4 URLs into fields that existing consumers assume contain PNGs.
Normalize existing flat and nested saved-slide formats at read boundaries during the transition.
Preserve existing image provider choices until the new path passes quality and cost gates.
Do not silently spend money on a different provider after the chosen provider fails.
Offer a gradient, existing licensed assets, or an explicit retry when generation fails.

Retain mandatory image protections:

- Validate PNG/JPEG bytes and matching file extensions.
- Reject WebP before Satori rendering.
- Prefetch images into supported data URIs before rendering.
- Consume the ImageResponse stream to detect errors.
- Store controlled storage URLs, not base64, in the database.
- Preserve ownership checks, retention rules, and deletion behavior.

## Durable Jobs

Proposed states: queued, generating, downloading, rendering, succeeded, failed, and cancel_requested.
Only mark a job cancelled after the provider or local executor confirms cancellation.
Keep provider task IDs, attempt IDs, asset revisions, output format, and credit state durably.
Authorize every read, retry, cancellation, download, and share operation.
Do not expose provider credentials or temporary provider download URLs to other users.

Persist the provider task ID immediately after submission.
Do not blindly resubmit on an ambiguous timeout; reconcile before starting another billable task.
Poll through bounded background work with backoff, not a single long browser request.
Provider polling guidance currently recommends ten-second intervals; obey account limits as well.
Copy completed output into controlled storage before its provider URL expires.
Resume generation and encoding safely after a worker restart.
Display real stages rather than invented percentages.

## Profit Controls

The current image route charges before checking its cache and has no reliable refund path.
Its automatic fallback does not consistently match actual provider cost or access rules.
The weighted usage fallback can undercount charges or allow work after thrown errors.
Correct these issues before connecting a costly video provider.

Use durable, atomic credit reservation and settlement.
Check reusable output before reserving new generation credits.
Include owner, model, prompt revision, source assets, dimensions, and quality in cache identity.
Settle each job once. Do not charge twice for replayed requests or callbacks.
Define refunds for failed delivery separately from provider charges that cannot be recovered.
Fail closed when quotas or reservation storage cannot be checked.

Verified MiniMax list prices on the assessment date:

| H3 output | Provider output cost |
| --- | --- |
| 768P | $0.08 per second |
| 2K | $0.13 per second |

A six-second 768P clip costs $0.48 for output alone.
Five such scenes cost $2.40 before images, encoding, storage, retries, or payment fees.
Reference video inputs and some image inputs can add charges.
Verify current rates again before enabling paid requests.
GPT Image cost depends on settings and tokens; no fixed carousel price is established here.

Start with one four-to-six-second H3 clip at 768P for the technical pilot.
Keep 2K disabled initially. Do not sell unlimited video through existing image credits.
Video needs a separately calculated credit price or tightly bounded allowance.
Enforce account limits, a daily global seconds cap, and a monetary stop before each billable submission.
The user approved the proposed $20 total test ceiling after this plan was presented.
It includes both providers and any encoding costs. It does not authorize open-ended production generation.
Paid calls remain deferred until accounting and access checks pass.

## Cloudflare Fit

Keep Cloudflare as the target, but do not tie story correctness to an unverified hosting migration.
Workers can coordinate authenticated jobs and storage. Standard Workers cannot launch native FFmpeg.
R2 can hold finished files; it does not render captions.
Cloudflare Containers is a candidate encoder host and requires a Workers Paid plan.
Evaluate bounded encoding on an approved existing host before paying for another runtime.
Container hosting is a separate cost decision, not implied by API access.
Do not migrate the application, database, and encoder simultaneously.

The advisor endorsed separate overlays, isolated encoding, and credit reservation before provider calls.
The advisor warned against extra hosting costs and treating video as ordinary image credits.
The user's Cloudflare preference remains the target; the final encoder host remains unselected.

## Build Sequence

1. Fix ownership, cache identity, format validation, and durable credit accounting in the image path.
2. Add the OpenAI adapter behind a default-off feature flag with offline provider-contract tests.
3. Verify approved image samples and existing saved-story compatibility.
4. Add the explicit carousel/video selector and one-scene video job path behind a separate flag.
5. Prove burned-in text with a short locally encoded sample before live H3 generation.
6. Run budget-approved H3 samples and test failures, polling, cancellation, and settlement.
7. Add multi-scene composition only after cost and quality measurements pass.

## Needed Access

- Workspace policy must permit the isolated Cloudflare build directory; ordinary chat approval does not change it.
- Confirm secure MiniMax H3 API access or configure it through the normal secret-management process.
- Verify existing OpenAI organization access to `gpt-image-2`; additional organization verification may be required.
- Approve a bounded live-generation test budget before spending.

Never paste API keys into chat. Do not duplicate existing deployment variables.
No paid API calls, credentials, database migrations, or deployments were made during the first implementation slice.

## Sources

Official documentation retrieved on 2026-09-07:

- https://platform.minimax.io/docs/guides/video-generation
- https://platform.minimax.io/docs/guides/pricing-paygo
- https://developers.openai.com/api/docs/guides/image-generation
- https://developers.openai.com/api/docs/models/gpt-image-2
- https://developers.cloudflare.com/containers/

Documented model availability does not prove access for Localley's accounts.
