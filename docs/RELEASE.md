# Release Status

Assessment: 2026-09-07.
The user authorized routine commits and production deployment after successful release checks.
That instruction does not override missing access, failed checks, or known compatibility blockers.

## Current Decision

The smaller Seoul discovery release is live and verified on Vercel.
Final application commit: `0a503c63a93d151f0be81080e3f01a705f4bea30` on `release/seoul-discovery`.
Final deployment: `dpl_FcHJtVkCz5n92uYPhQJxZ8FLqh9u`.
Live map: `https://www.localley.io/spots?city=seoul&view=map`.
Release source is pushed to `origin/release/seoul-discovery` at `acce260`.
The final source commit adds release evidence after deployed application commit `0a503c6`; it changes no application code.
No pull request or merge into `main` was performed.

The combined story and Cloudflare work remains separate and is not live.
Before deploying the feature branch or an older main branch, integrate the release's security fixes.
The earlier missing-login blockers are resolved. Do not report them as current blockers.

## Latest Verification

- 745 release tests pass across 97 files; TypeScript and the hosted build pass.
- All 39 public browser workflow checks pass at 390, 900, and 1440 pixels without preview access headers.
- Thirty-four real authenticated production checks passed, including persisted save/unsave and all three existing PNG templates.
- The final redirect-only follow-up preserves API protection and fixes dashboard continuation through local sign-in.
- All temporary QA accounts, sessions, and fixture rows were cleaned up.
- Applied and verified `20260907161457_harden_saved_spots_owner_rls.sql`; its migration history is recorded.
- The new media migrations were not applied and no new media generation was enabled.
- Two existing filter-cache refresh timeouts were logged with HTTP 200; visible filter checks passed. Performance follow-up remains.
- Photo appearance, stale-worker upgrades, and automatic signup-profile synchronization remain unverified.

Detailed release evidence is in `docs/releases/seoul-discovery.md` on the pushed release branch.
The temporary worktree and test artifacts were removed after verification; the exact cleanup origin was not established.
Git preserved all release commits, and the branch was pushed successfully from the main workspace.
Future release worktrees must not live under a test runner's disposable output directory.
Do not restore the old PUBLIC saved-place policies during application rollback.

## Earlier Production Check

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

1. Integrate the pushed release's security fixes into future branches before resuming feature deployment.
2. Address signup-profile synchronization, sign-in return context from saved places, and filter-cache performance as bounded follow-ups.
3. Follow the separate billing, media, content, and Cloudflare gates in `DELIVERY_PLAN.md`.

The earlier assessment stopped before deployment. The latest verification above supersedes that status.
No new AI-provider generation was used during release verification.
