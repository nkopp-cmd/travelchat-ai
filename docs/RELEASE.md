# Release Status

Assessment: 2026-09-07.
The user authorized routine commits and production deployment after successful release checks.
That instruction does not override missing access, failed checks, or known compatibility blockers.

## Current Decision

Commit the tested source on a separate branch. Hold production deployment.
Do not trigger a Git-connected production deploy as a workaround for missing CLI access.
The advisor did not approve release while the target and schema gates remain open.

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
- Local Vercel repository metadata names `travelchat-ai`, but no `project.json` exists.
- `vercel whoami` and `vercel project ls` both report no existing credentials.
- `VERCEL_TOKEN` is absent from the allowed local environment.
- The configured Supabase endpoint responds to authorized read-only REST schema checks.
- That endpoint has not been matched against authenticated Vercel production configuration.
- No Supabase management token or database connection credentials are available in the permitted environment.
- The shared team rules file remains blocked by workspace permissions. No alternate read was attempted.

## Schema Findings

Read-only checks returned no user rows and called no RPCs.

- Required `usage_tracking`, `subscriptions`, and itinerary fields are available through REST.
- `users.email_preferences` is absent, with PostgreSQL error `42703`.
- Image and video job tables are unavailable through REST and absent from admin OpenAPI.
- Required reservation, settlement, processing, delivery, and eligibility RPCs are absent from OpenAPI.
- The weighted usage RPC exists with its expected argument signature; its body and grants remain unverified.
- The older atomic usage RPCs from `001_atomic_usage_tracking.sql` are also absent from OpenAPI.

REST absence establishes a compatibility gap, not definitive migration history.
SQL access is required to verify actual objects, constraints, policies, grants, and migration history.

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

1. Authenticate the approved Vercel account through its secure login flow.
2. Verify the project and `localley.io` production alias against the authenticated account.
3. Provide approved SQL or Supabase management access without putting secrets in chat or source.
4. Verify the target database and recovery backup before applying any required migrations.
5. Apply only reviewed missing migrations and verify grants and existing-provider compatibility.
6. Audit existing Stripe customer mappings without making billing changes.
7. Confirm new model flags remain disabled and video budgets remain zero until activation checks pass.
8. Deploy a preview, test it, then promote the verified build and check the live routes.

No migration, backup, provider generation, or production deployment occurred during this release assessment.
The approved media test budget remains unspent.
