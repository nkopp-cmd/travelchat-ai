# Social Spot Submissions

Localley now supports TikTok and Instagram spot submissions from `/spots/submit`.

The UI and API are dark-launched by default. Set
`NEXT_PUBLIC_SOCIAL_SPOT_SUBMISSIONS_ENABLED=true` only after the database
migration has been applied in the target environment.

## Flow

1. The contributor pastes a TikTok or Instagram post/reel link. Email, credit name, city, and notes are optional.
2. `/api/spots/social-submissions` canonicalizes the URL, stores contributor attribution, and checks for duplicate submissions.
3. The server fetches bounded public metadata, resolves duplicate aliases, and creates a durable processing checkpoint before any paid provider call. TikTok uses oEmbed plus trusted hydration data. Instagram can optionally use the pinned Apify Instagram Scraper provider for public post, reel, and carousel media.
4. TikTok videos and provider-backed Instagram reels are downloaded only from strict platform CDN allowlists, capped at 40 MB, uploaded to FAL, and inspected with full-video frame/OCR analysis. Image carousels retain one ordered image per logical slide.
5. OpenAI web-search research extracts up to 20 distinct candidate places, Localley score, local percentage, exact address, visual evidence notes, and web evidence. One malformed candidate cannot discard the other candidates. This is only for social-link research; chat and itinerary generation remain GLM-first.
6. Each high-confidence candidate is created or reused as a Localley spot only after Google Places confirms its identity, exact address, coordinates, and real photos. The submission stores the primary `spot_id` and all candidate results in the `research` payload.
7. Every durable new submission receives an idempotent token ledger entry. URL-only submissions use anonymous Localley contributor attribution.

Mixed carousels retain all discovered video URLs. The synchronous request analyzes one video and marks the submission `needs_review` with an explicit `0 of N` or `1 of N` partial-video status when more videos remain. A source video that cannot be analyzed also remains in review. Partial coverage is never reported as complete.

Provider errors, rejected provider identity, caption-only output, and missing provider configuration remain `needs_review`; cover text alone cannot publish an Instagram spot. Stale retries use an atomic timestamp claim before paid enrichment so only one request can resume the same submission.

Installed PWA users can share into Localley on platforms that support Web Share Target. The manifest sends shared `title`, `text`, and `url` data to `/spots/submit`, and the form auto-fills the first TikTok or Instagram URL it finds.

## Database

Apply both social-submission migrations in order:

1. `supabase/migrations/007_social_spot_submissions.sql`
2. `supabase/migrations/20260710065041_harden_social_submission_processing.sql`

Tables:

- `spot_contributors`: normalized email, optional display name, public credit name, token balance.
- `social_spot_submissions`: canonical URL, platform, research payload, status, spot reference. Canonical URLs are unique globally so the same social link cannot award tokens repeatedly.
- `contribution_token_ledger`: idempotent token movements per submission.

New tables use explicit service-role grants and RLS policies. Public clients do not write directly to Supabase.

## Instagram Media Provider

Meta's official API does not provide direct media-object access for arbitrary community-submitted posts. Localley therefore supports an optional server-only provider for public Instagram content.

1. Create an Apify API token restricted to running the approved Actor and reading its default output storage.
2. Enable restricted Actor execution for that token.
3. Set `APIFY_API_TOKEN` only in server environments. Never prefix it with `NEXT_PUBLIC_`.
4. Keep the Actor/build pin in code under review. The integration is fixed to `apify~instagram-scraper` build `0.0.674`.

Each provider request is limited to one result, a 12-second deadline, a one-item dataset response, and a maximum charge of USD 0.01. The token is sent in the `Authorization` header and is never included in URLs or logs. Provider output is rejected unless its shortcode exactly matches the submitted post, and only HTTPS `cdninstagram.com` or `fbcdn.net` media without credentials, custom ports, or deceptive suffixes is accepted.

## Deployment Order

1. Apply both social-submission migrations listed above.
2. Set `NEXT_PUBLIC_SOCIAL_SPOT_SUBMISSIONS_ENABLED=true` in Vercel.
3. Set `APIFY_API_TOKEN` to enable public Instagram media extraction.
4. Confirm `FAL_KEY`, `OPENAI_API_KEY`, and `GOOGLE_PLACES_API_KEY` are available server-side.
5. Redeploy the app so the spots CTA and `/spots/submit` page become active.
6. Submit a known Instagram carousel, Instagram reel, and TikTok video. Confirm every distinct verified place is represented by a separate candidate or an explicit review item.

## Loop Checks

Recommended focused loop for this feature:

```bash
cd "/Users/alleycore/Documents/CoreMachine/01 - Projects/Code/Localley"
npx vitest run __tests__/lib/social-spot-submissions.test.ts __tests__/api/social-spot-submissions-route.test.ts
npx tsc --noEmit
npx eslint lib/social-spot-submissions.ts app/api/spots/social-submissions/route.ts app/spots/submissions/page.tsx
npm run build
```

If `OPENAI_API_KEY` is absent, submissions still persist as `research_pending`; they do not create a spot until research can run.

Set `SOCIAL_SPOT_RESEARCH_MODEL` to override the default `gpt-5.4-mini` OpenAI web-search research model.
