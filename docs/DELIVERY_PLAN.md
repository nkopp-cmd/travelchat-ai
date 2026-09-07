# Delivery Reset

Date: 2026-09-07.
This plan replaces the earlier approach of combining discovery, media, payments, and hosting into one release.

## Release 1 Completed

The Seoul map is now live: `https://www.localley.io/spots?city=seoul&view=map`.
Deployment `dpl_FcHJtVkCz5n92uYPhQJxZ8FLqh9u` serves application commit `0a503c6`.
All 39 public browser checks passed across three widths, and 34 authenticated live checks passed.
The final release suite passed 745 tests. A narrow redirect follow-up keeps dashboard sign-in on Localley.

Hosted QA exposed two existing privacy gaps and a summary-render defect, which were fixed before completion.
The saved-place owner policy was applied and recorded. New media migrations remain unapplied.
All QA accounts, sessions, and fixture data were removed.

Next: integrate release security fixes into future branches, then address signup synchronization and the saved-place planning journey.
Investigate the two nonfatal filter-cache refresh timeout logs without expanding that work into another hosting migration.
The historical assessment below explains why release work was split; it no longer describes the current live version.

## Initial Baseline

| Area | Actual state |
| --- | --- |
| Live website | Vercel deployment `dpl_8GLWuch2zYWyFEJHt9SCNmyDPTJw`, created 2026-07-27 |
| Live source | `98ccd6d00e11002326b8b7926e845414f675a7ef`, branch `fix/multi-city-network-narrowing` |
| Main baseline | Local `9aff78d` has the same file tree as the deployed commit |
| New discovery and story work | Local commit `073b11e`, not pushed or deployed |
| New media migrations | Tested locally, not applied to the hosted database |
| Cloudflare experiment | Adapted build passes; tested application routes fail at missing Clerk configuration |
| Access | Vercel, Supabase management, and Cloudflare access are available |
| Media spending | $0 of the shared $20 test ceiling |

`https://www.localley.io/spots?city=seoul&view=map` responds with HTTP 200.
That response does not prove the new map view is deployed. Production still runs the older source.
No authenticated application flow has passed on the Cloudflare experiment.

## What Went Wrong

- One 129-file commit combined independent features with different database and runtime requirements.
- The map became dependent on finishing media and hosting work through release grouping, not through application design.
- Local tests and simulated previews were repeatedly reported without completing a production release.
- Release notes retained obsolete access blockers after successful logins.
- The core journey was not used as the completion test.

Saving a place currently does not create or update an itinerary.
The save button also loses explicit return context when sending an anonymous visitor to sign-in.
Do not describe discovery, saved places, itinerary planning, and story export as one finished flow yet.

## Release 1: Visible Seoul Discovery

**Target:** the current Vercel project and domain. No hosting change or new media schema.

Prepare a dedicated release branch from the verified deployed baseline.
Use a separate approved worktree; preserve the current branch and Cloudflare experiment unchanged.
Extract cohesive whole-file groups from `073b11e` rather than releasing that entire commit.

Include:

- Seoul map view, filters, numbered selection, existing spot details, and explicit page scope.
- Shared map text safety and loading fixes.
- Public review reads, honest review errors, and saved-place route validation.
- The complete compatible framework and push-worker maintenance group, not isolated fragments of it.
- Their matching tests and required dependencies.

Exclude:

- New story routes, new image accounting, all four media migrations, and the unavailable Video tab.
- Stripe ownership changes until existing customer mappings have been audited.
- Cloudflare adapters, native encoder infrastructure, new paid providers, and unrelated UI changes.

Compare extracted imports against the baseline and rerun tests on that exact release tree.
The 1,565-test result from the combined commit does not certify this new combination.
Check live schema compatibility for existing save/review tables without adding media tables.

Acceptance:

1. Open the production landing page and reach discovery through visible navigation.
2. Choose Seoul, switch to Map, filter results, and open a real place.
3. Sign in, save the place, reload, and verify the saved state.
4. Unsave it and verify persistence and understandable error handling.
5. Check mobile and desktop behavior, keyboard selection, and map failure states.
6. Open an existing itinerary and verify its existing image-story export has not regressed.
7. Verify a preview, promote that exact deployment, and repeat production smoke checks.

The first release is complete only after those live checks and a recorded deployment URL and commit.
No placeholder video controls or fabricated booking offers belong in it.

## Release 2: Complete The Core Journey

Preserve the selected place and return context through sign-in.
Provide a clear, explicit action to continue from a saved place into itinerary planning.
Do not silently add places to an unrelated trip.
Test discovery, save, itinerary continuation, and existing story export as one user journey.

Release billing fixes as a separate tested group after a read-only mapping audit.
Verify checkout does not remove paid access and the portal opens only the correct customer's account.
Do not restore email-based customer reassignment as a shortcut.

## Release 3: Activate Story Media

Activate GPT Image 2 carousels before exposing MiniMax video to normal users.
Verify backups and apply the image ledger with its matching application code.
Use a bounded paid test, inspect the actual exported images, and verify charges and refunds.

Video follows only after a real worker processes a real provider job into a private MP4 download.
Verify polling, recovery, Korean captions, storage, budgets, and retention on the selected host.
Do not count mocked storage or an offline synthetic MP4 as hosted delivery verification.
Keep the shared $20 ceiling across image, video, and encoding tests.

## Seoul Content Track

The original product goal remains active: dated events, everyday experiences, Localley scores, and sourced guide stories.
These are not completed by an image or video generator.

Start a reviewed Jongno collection after Release 1 establishes the working discovery surface.
Add event expiry, source dates, real licensed photos, and an explanation of each score.
Use honest booking links until partner access supports equivalent live price comparisons.
Photorealistic 3D remains an optional later experiment, not a first-release dependency.

## Cloudflare Track

Keep Supabase PostgreSQL while evaluating Workers hosting and later R2 storage.
Do not make product releases wait for the migration.

Time-box the next experiment to one working public route and one correctly protected route on workerd.
Use clearly invalid fixture credentials only for offline tests, with all outbound traffic blocked.
That test cannot certify real Clerk sessions or Supabase authorization.
If vinext fails on a confirmed application incompatibility, evaluate OpenNext once against the same cases.
Do not remove authentication, drop routes, or silently stub integrations to obtain a green result.

A protected hosted preview must pass the same real user journey before any domain switch.
Production headers, redirects, webhooks, cookies, streaming, limits, and cost must also be verified.
Keep the old origin available for rollback.

## Operating Rules

- Work on one product release at a time, with one bounded migration experiment at most.
- Every update distinguishes committed, previewed, deployed, and verified-live states.
- A deployment URL is required before calling a release live.
- Record one concrete blocker and its next action instead of repeatedly requesting generic approval.
- Use browser login links or one short browser test when user participation is necessary.
- Keep unavailable features hidden in release branches rather than shipping dead-end controls.
- Do not activate spending, apply unreviewed schema, or switch domains to satisfy a status report.

## Immediate Next Action

Preserve and synchronize the deployed release, including its security migration.
Resume Release 2 as a bounded user-journey task. Do not make it wait for new media or Cloudflare.
