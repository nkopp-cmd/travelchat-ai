# Social Spot Submissions

Localley now supports TikTok and Instagram spot submissions from `/spots/submit`.

The UI and API are dark-launched by default. Set
`NEXT_PUBLIC_SOCIAL_SPOT_SUBMISSIONS_ENABLED=true` only after the database
migration has been applied in the target environment.

## Flow

1. The contributor pastes a TikTok or Instagram post/reel link. Email, credit name, city, and notes are optional.
2. `/api/spots/social-submissions` canonicalizes the URL, stores contributor attribution, and checks for duplicate submissions.
3. The server fetches bounded public metadata, resolves duplicate aliases, and creates a durable processing checkpoint before any paid provider call. TikTok uses oEmbed plus trusted hydration data. Instagram can optionally use the pinned Apify Instagram Scraper provider for public post, reel, and carousel media.
4. The server compares provider-declared media counts with every trusted image and video URL. Complete manifests support all 35 items allowed by TikTok. Partial, cover-only, unavailable, or over-limit extraction gets up to five bounded provider retries before becoming an explicit review item; it can never create a public spot.
5. Complete manifests become revision-fenced database jobs, one per image or video. The POST returns `202`, and the submission tracker polls sanitized per-item progress. Images run in bounded batches with per-image fallback; videos run two at a time. Expiring signed URLs are refreshed once before a job is retried.
6. Only after every current-revision media job succeeds does aggregate OpenAI web-search research extract up to 35 distinct places, Localley score, local percentage, exact address, visual evidence, and web evidence. One malformed candidate cannot discard the others. Chat and itinerary generation remain GLM-first.
7. Each high-confidence candidate is created or reused as a separate Localley spot only after Google Places confirms identity, exact address, coordinates, and real photos. No partial media result can materialize a spot.
8. Every durable new submission receives an idempotent token ledger entry. URL-only submissions use anonymous Localley contributor attribution. Created spot cards and details expose `Community` provenance and contributor credit.

The immediate worker drains multiple typed batches within a 100-second soft budget. Database-time leases, revision fencing, stable URL-independent fingerprints, one-time finalization tokens, bounded exponential retries, dead-letter states, and a daily Vercel reconciliation cron make interrupted work resumable and idempotent. Aggregate place verification stops after five attempts and becomes an explicit review item. Vercel Hobby only permits daily cron schedules, so normal submissions also trigger the worker immediately with `after()`.

Provider errors, rejected provider identity, caption-only output, and missing provider configuration remain `needs_review`; cover text alone cannot publish an Instagram spot. Stale retries use an atomic timestamp claim before paid enrichment so only one request can resume the same submission.

Installed PWA users can share into Localley on platforms that support Web Share Target. The manifest sends shared `title`, `text`, and `url` data to `/spots/submit`, and the form auto-fills the first TikTok or Instagram URL it finds.

## Database

Apply all social-submission migrations in order:

1. `supabase/migrations/007_social_spot_submissions.sql`
2. `supabase/migrations/20260710065041_harden_social_submission_processing.sql`
3. `supabase/migrations/20260710085431_social_submission_media_jobs.sql`
4. `supabase/migrations/20260710105520_social_submission_legacy_backfill.sql`
5. `supabase/migrations/20260710105752_index_social_submission_media_jobs_fk.sql`

Tables:

- `spot_contributors`: normalized email, optional display name, public credit name, token balance.
- `social_spot_submissions`: canonical URL, platform, research payload, status, spot reference. Canonical URLs are unique globally so the same social link cannot award tokens repeatedly.
- `contribution_token_ledger`: idempotent token movements per submission.
- `social_spot_submission_media`: authoritative ordered media identities per manifest revision.
- `social_spot_submission_media_jobs`: fenced leases, attempts, results, retry timing, and terminal state for each media item.

New tables use explicit service-role grants and RLS policies. Public clients do not write directly to Supabase.

## Legacy Reconciliation

Submissions created before the durable media queue remain visible as legacy results until an admin explicitly reviews and admits them. The normal cron never discovers or schedules historical rows.

1. Send an authenticated admin `POST` to `/api/admin/spots/social-submissions/backfill` with `{"dryRun":true,"includeResolved":true}`.
2. Review the exact pre-cutoff IDs, platforms, names, and current spot state returned by the plan.
3. Execute with `{"dryRun":false,"planToken":"..."}` and a unique `Idempotency-Key` header within ten minutes.
4. The signed plan can admit at most five exact revision-zero rows. SQL rechecks the fixed cutoff, state, platform readiness, and resolved-spot opt-in under `FOR UPDATE SKIP LOCKED`.
5. Replaying the request cannot admit a row twice. Existing complete metadata is queued without another provider request; incomplete coverage enters the bounded provider retry path.

Instagram cannot appear in a plan until `APIFY_API_TOKEN` is configured. Resolved legacy spots require the explicit `includeResolved` opt-in because aggregate processing may discover additional places in the original post.

## Instagram Media Provider

Meta's official API does not provide direct media-object access for arbitrary community-submitted posts. Localley therefore supports an optional server-only provider for public Instagram content.

1. Create an Apify API token restricted to running the approved Actor and reading its default output storage.
2. Enable restricted Actor execution for that token.
3. Set `APIFY_API_TOKEN` only in server environments. Never prefix it with `NEXT_PUBLIC_`.
4. Keep the Actor/build pin in code under review. The integration is fixed to `apify~instagram-scraper` build `0.0.674`.

Each provider request is limited to one result, a 12-second deadline, a one-item dataset response, and a maximum charge of USD 0.01. The token is sent in the `Authorization` header and is never included in URLs or logs. Provider output is rejected unless its shortcode exactly matches the submitted post, and only HTTPS `cdninstagram.com` or `fbcdn.net` media without credentials, custom ports, or deceptive suffixes is accepted.

## Deployment Order

1. Apply all four social-submission migrations listed above.
2. Set `NEXT_PUBLIC_SOCIAL_SPOT_SUBMISSIONS_ENABLED=true` in Vercel.
3. Set `APIFY_API_TOKEN` to enable public Instagram media extraction.
4. Confirm `FAL_KEY`, `OPENAI_API_KEY`, `GOOGLE_PLACES_API_KEY`, and a strong `CRON_SECRET` are available server-side.
5. Redeploy the app so the queue RPCs, worker route, tracker, spots CTA, and `/spots/submit` page use the same release.
6. Submit a known Instagram carousel, Instagram reel, TikTok photo post, and TikTok video. Confirm every media item reaches a terminal tracker state and every distinct verified place becomes a separate candidate or explicit review item.
7. Confirm `/api/cron/process-social-submissions` rejects missing/wrong bearer secrets and succeeds with `Authorization: Bearer $CRON_SECRET`.
8. Confirm a cron bearer without the current revision and one-time finalization token cannot replay aggregate research.

## Loop Checks

Recommended focused loop for this feature:

```bash
cd "/Users/alleycore/Documents/CoreMachine/01 - Projects/Code/Localley"
npx vitest run __tests__/lib/social-spot-submissions.test.ts __tests__/lib/social-spot-media-jobs.test.ts __tests__/lib/social-share-target.test.ts __tests__/api/social-spot-submissions-route.test.ts __tests__/api/social-submission-backfill-route.test.ts __tests__/api/process-social-submissions-route.test.ts __tests__/api/social-submission-media-status-route.test.ts __tests__/components/submission-media-progress.test.tsx __tests__/lib/cron-auth.test.ts
npx tsc --noEmit
npx eslint lib/social-spot-submissions.ts lib/social-spot-media-jobs.ts lib/cron-auth.ts app/api/spots/social-submissions/route.ts app/api/spots/social-submissions/media-status/route.ts app/api/cron/process-social-submissions/route.ts app/api/cron/cleanup-stories/route.ts app/spots/submissions/page.tsx components/spots/submission-media-progress.tsx
npm run build
```

For an authenticated reconciliation run:

```bash
curl --fail --show-error --silent \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://www.localley.io/api/cron/process-social-submissions
```

If the queue migration is not present, the API stays compatible but does not publish media-backed spots. If `OPENAI_API_KEY` is absent, jobs retry and eventually become explicit review items; they never create a spot from incomplete evidence.

Set `SOCIAL_SPOT_RESEARCH_MODEL` to override the default `gpt-5.4-mini` OpenAI web-search research model.
