# Social Spot Submissions

Localley now supports TikTok and Instagram spot submissions from `/spots/submit`.

The UI and API are dark-launched by default. Set
`NEXT_PUBLIC_SOCIAL_SPOT_SUBMISSIONS_ENABLED=true` only after the database
migration has been applied in the target environment.

## Flow

1. The contributor pastes a TikTok or Instagram post/reel link. Email, credit name, city, and notes are optional.
2. `/api/spots/social-submissions` canonicalizes the URL, stores contributor attribution, and checks for duplicate submissions.
3. The server fetches social Open Graph metadata from an allowlisted host only.
4. OpenAI web-search research extracts a candidate place, Localley score, local percentage, address, and evidence. This is only for social-link research; chat and itinerary generation remain GLM-first.
5. A spot is created or reused only when the candidate clears the confidence gate and geocoding succeeds.
6. Every durable new submission receives an idempotent token ledger entry. URL-only submissions use anonymous Localley contributor attribution.

Installed PWA users can share into Localley on platforms that support Web Share Target. The manifest sends shared `title`, `text`, and `url` data to `/spots/submit`, and the form auto-fills the first TikTok or Instagram URL it finds.

## Database

Apply `supabase/migrations/007_social_spot_submissions.sql`.

Tables:

- `spot_contributors`: normalized email, optional display name, public credit name, token balance.
- `social_spot_submissions`: canonical URL, platform, research payload, status, spot reference. Canonical URLs are unique globally so the same social link cannot award tokens repeatedly.
- `contribution_token_ledger`: idempotent token movements per submission.

New tables use explicit service-role grants and RLS policies. Public clients do not write directly to Supabase.

## Deployment Order

1. Apply `supabase/migrations/007_social_spot_submissions.sql`.
2. Set `NEXT_PUBLIC_SOCIAL_SPOT_SUBMISSIONS_ENABLED=true` in Vercel.
3. Redeploy the app so the spots CTA and `/spots/submit` page become active.
4. Submit one known Instagram or TikTok URL without email and confirm the API returns either `spot_created`, `spot_reused`, `needs_review`, or `research_pending`.

## Loop Checks

Recommended focused loop for this feature:

```bash
cd "/Users/alleycore/Documents/CoreMachine/01 - Projects/Code/Localley"
npx vitest run __tests__/lib/social-spot-submissions.test.ts __tests__/api/social-spot-submissions-route.test.ts
npx tsc --noEmit
npm run lint
```

If `OPENAI_API_KEY` is absent, submissions still persist as `research_pending`; they do not create a spot until research can run.

Set `SOCIAL_SPOT_RESEARCH_MODEL` to override the default `gpt-5.4-mini` OpenAI web-search research model.
