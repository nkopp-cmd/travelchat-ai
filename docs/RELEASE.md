# Release Status

Assessment: 2026-09-07.
The user authorized routine commits and production deployment after successful release checks.
That instruction does not override missing access, failed checks, or known compatibility blockers.

## Current Decision

The combined feature commit is local and is not a safe single release without additional gates.
Use the staged plan in `DELIVERY_PLAN.md`: release Seoul discovery on Vercel independently from new media and Cloudflare.
The earlier missing-login blockers are resolved. Do not keep reporting them as current blockers.
Hold the combined media release until its schema and runtime gates pass.

## Production Check

Checked on 2026-09-07 through authenticated Vercel inspection and its deployment API.

- Live deployment: `dpl_8GLWuch2zYWyFEJHt9SCNmyDPTJw`, created 2026-07-27.
- Live source: `98ccd6d00e11002326b8b7926e845414f675a7ef`.
- Live branch: `fix/multi-city-network-narrowing`; deployment source is `redeploy`.
- Domains: `localley.io` and `www.localley.io`.
- New feature commit `073b11e` has not been pushed or deployed.
- The live source has the same file tree as local `main` baseline `9aff78d`.
- The public Seoul URL returns HTTP 200, but it is still the older application.

## Local Verification

- Final unit suite: 1,565 passed; one opt-in Docker integration test skipped in the normal run.
- The real-encoder integration previously passed separately with mocked provider and storage boundaries.
- Production build and TypeScript passed on the final application source.
- Full lint passed with zero errors and 63 warnings.
- Seven story browser tests and 31 video PostgreSQL integration groups passed before this release assessment.
- The exhaustive font test exceeded its five-second default once under concurrent build load.
- Its dedicated timeout is now 20 seconds; all glyph and outline assertions remain intact.
- The full suite passed after that test-only adjustment.
- Build deprecation warnings and the complete dependency advisory audit remain outstanding maintenance items.

## Verified Access

- GitHub repository: `nkopp-cmd/travelchat-ai`, default branch `main`.
- Starting branch: `fix/social-trends-triple-billing`, with no existing staged changes.
- Vercel is authenticated as `nkopp-cmd`; project `travelchat-ai` and its production aliases are confirmed.
- The project uses repository-link metadata; absence of a standalone `project.json` is not evidence of missing access.
- Supabase login is complete, with access to `travel-ai` (`llehrhqeolfprutcaopi`).
- Authenticated read-only SQL now works through the Supabase management path.
- A physical backup completed on 2026-09-07 at 06:46:38 UTC; this is not a tested restore.
- Production environment variables were retrieved into ignored local storage without logging their values.
- Confirm the deployment's database match again before any write or migration.
- Cloudflare access is available. The user approved the isolated `.cloudflare-preview/` directory inside this workspace.
- The shared team rules file remains blocked by workspace permissions. No alternate read was attempted.

## Schema Findings

Read-only checks returned no user rows and called no RPCs.

- Required `usage_tracking`, `subscriptions`, and itinerary fields are available through REST.
- `users.email_preferences` is absent, with PostgreSQL error `42703`.
- Image and video job tables are unavailable through REST and absent from admin OpenAPI.
- Required reservation, settlement, processing, delivery, and eligibility RPCs are absent from OpenAPI.
- The weighted usage RPC exists with its expected argument signature; its body and grants remain unverified.
- The older atomic usage RPCs from `001_atomic_usage_tracking.sql` are also absent from OpenAPI.

Earlier REST absence established a compatibility gap, not definitive migration history.
Later read-only SQL confirmed that the new media tables were absent.
SQL access is now available for detailed checks before the media release.

The updated image route requires `20260907060610_story_image_jobs.sql` for every uncached AI image.
Disabling GPT Image 2 does not remove this dependency for FLUX, Seedream, or Gemini.
Do not deploy the route until its required schema is applied and verified.

Video additionally requires these ordered migrations:

1. `20260907064632_story_video_jobs.sql`
2. `20260907071555_story_video_processing.sql`
3. `20260907080754_story_video_reservation_snapshot.sql`

## Final Payment Fix

Optional email lookup now uses `maybeSingle()` inside its own error boundary.
Missing columns, missing users, unknown preferences, and provider email failures do not reject successful payment persistence.
Unknown consent skips email. Explicit product-update consent is required.
Payment database failures still return HTTP 500 so Stripe can retry.
All 47 webhook regression tests passed without live Stripe or email calls.

Strict Stripe customer ownership still needs a read-only audit of existing production mappings.
Do not restore email-only ownership checks to avoid that audit.
Webhook ordering and duplicate-email handling remain documented limitations.

## Resume Sequence

1. Prepare the smaller discovery release from the verified live baseline without disturbing the feature branch.
2. Verify its exact dependencies, existing schema, authenticated flows, and current-story compatibility.
3. Deploy a preview, test it, then promote and record the live commit and URL.
4. Follow the separate billing, media, content, and Cloudflare gates in `DELIVERY_PLAN.md`.

No migration, backup, provider generation, or production deployment occurred during this release assessment.
The approved media test budget remains unspent.
