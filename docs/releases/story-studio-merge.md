# Story Studio Code Merge

Date: 2026-09-08.
This release merges the remaining application code. It does not activate GPT Image 2, MiniMax H3, or Cloudflare hosting.

## Release Contract

- Preserve the live saved-place policies, private story authorization, local sign-in redirects, and Apify billing fix.
- Deploy on the existing Vercel project with Supabase PostgreSQL retained.
- Keep new provider and video processing flags false or unset.
- Hide new video controls unless the server explicitly reports readiness. Known jobs remain accessible if creation is disabled later.
- Do not install the three video migrations or run a video worker for this disabled release.
- Do not create checkout sessions, charges, or paid media requests during release verification.

## Completed Preconditions

- Fresh Vercel production configuration was retrieved securely and matches the Localley database.
- All three mapped Stripe customers match their durable Clerk owners. No duplicate or deleted mapped customers were found.
- There are no mapped Stripe subscriptions to audit. This is not a claim of tested live checkout completion.
- All new media flags are absent in the retrieved production configuration, and GPT Image 2 credits are not configured.
- The hosted weighted counter signature, lock expression, period calculation, and service-role permission match the image ledger.
- The latest listed physical backup completed on 2026-09-07 at 06:46:38 UTC.
- Applied only `20260907060610_story_image_jobs.sql` through an explicit file query, then recorded its migration history.
- The earlier `20260907161457_harden_saved_spots_owner_rls.sql` was already applied and was not reapplied.
- The hosted ledger drill ran as `service_role` inside BEGIN/ROLLBACK. Reservation, replay fencing, submission, settlement, and refund assertions passed.
- The drill left zero image jobs and zero probe usage rows.
- Hosted RLS is enabled. Browser roles cannot read the job table or execute its RPCs; the service role can.
- The video job table remains absent, confirming that no video migration was applied accidentally.

## Compatibility Fixes

The old story-save endpoint fetched its private renderer without authentication.
It now invokes the authorized renderer directly within the verified outer request context.
It preserves ownership checks, verifies PNG bytes, bounds day counts, and scopes the final update to the owner.
Tests exercised real private cover, day, and summary rendering without provider requests.

The image ledger replaces precharge-before-cache behavior and blocks generation after quota errors.
It makes one provider attempt per request instead of silently paying for cascaded fallbacks.
Failed delivery returns reserved user credits. Uncertain submitted jobs require operator review.
The manual procedure is in `docs/operations/story-image-recovery.md`.

## Verification

- 1,639 tests pass across 125 files. One opt-in Docker integration test is skipped in the normal suite.
- The production build and TypeScript stage pass after the direct-render change.
- Full lint reports zero errors and 63 warnings.
- Ten local PostgreSQL integration groups pass in addition to the hosted rollback drill.
- Promotion requires hosted UI checks, existing story export/save checks, and confirmation that unavailable video controls remain hidden.
- Live paid-provider output, video delivery, and Cloudflare runtime are not certified by this code merge.

No new provider variables were added, and no existing deployment variable was duplicated or changed.
