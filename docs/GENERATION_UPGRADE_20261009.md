# Generation upgrade preparation — 2026-10-09

## Status

Prepared on a feature branch. **Not deployed or activated.** Production still uses its previous generation configuration.

Requested text model: `gpt-6-luna`. Requested image model: `gemini-nano-banana-2.1`.
Official model pages and read-only lookups with the existing server keys both returned valid model records/HTTP200:
[OpenAI model](https://developers.openai.com/api/docs/models/gpt-6-luna),
[Google model](https://ai.google.dev/gemini-api/docs/models/gemini-nano-banana-2.1).
No inference was performed and no credential values appear in these records.

## Scope

- Pin the text model for chat, itinerary generation/revision, map-query translation and social place research.
- Use compatible completion-token/reasoning parameters; do not silently switch text providers.
- Keep the existing optional itinerary location/supervision checks and historical provider metadata.
- Use one image service for new images and story backgrounds. Refuse retired explicit options.
- Remove the story provider picker and names from progress, previews and notifications. Keep a generic AI control and credit estimate.
- Permit the current image service on Pro/Premium with its existing three-credit weight. Check normal source usage atomically and fail closed when accounting is unavailable.
- Retain byte detection, WebP rejection, owned cache/media reads, private candidate R2 storage, source storage, slide dedupe, prefetch and lazy Satori stream consumption.

## Checks

`run-heavy.sh` ran nine focused suites: chat provider/readiness, itinerary metadata/orchestration/fallback,
current image generation, candidate background/cache/media/usage, geocoding and social place research.
**90 assertions passed; TypeScript passed.**

The story-options component test passed separately, bringing focused coverage to **91 assertions**.
It opens the real dialog, proves the nine-credit estimate for three slides, finds no provider radio group or provider names,
and rejects selection of retired options even from a stale server response.
The first UI test attempt used an unavailable jest-dom matcher; it was corrected to supported assertions.

Scoped ESLint completed with zero errors and five existing unused-variable warnings in the story route/dialog.
`git diff --check` passed. Required CI and release evidence must be attached to the PR before any release.

## Activation gate

`spend-guard.sh` returned OVER on October9: weekUSD32.07 exceedsUSD25; monthUSD45.36 is belowUSD90.
Paid acceptance requires the October12 weekly reset or a specific exception for at mostUSD1.02:
one bounded text generation and one image generation, with receipts before dispatch and no retry of an unknown result.
A model lookup or mocked test does not prove generation, quota accounting, storage or hosted rendering.

Keep this PR draft until those checks, production build, release review and hosted acceptance are possible.
Use the server's existing OPENAI_API_KEY and GEMINI_API_KEY at release; never put private keys into build assets.
Record the current Worker and rollback before changing runtime configuration.
Verify signed-in desktop/mobile story controls and actual PNG/JPEG generation/storage/rendering, then clean exact fixtures.
