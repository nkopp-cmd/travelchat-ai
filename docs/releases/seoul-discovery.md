# Seoul Discovery Release

Date: 2026-09-07. Target: Vercel `travelchat-ai`, serving `www.localley.io`.
Baseline: `98ccd6d00e11002326b8b7926e845414f675a7ef`.
Rollback deployment: `dpl_8GLWuch2zYWyFEJHt9SCNmyDPTJw`.

## Live Result

The release is live at `https://www.localley.io/spots?city=seoul&view=map`.
Final application commit: `0a503c63a93d151f0be81080e3f01a705f4bea30`.
Final deployment: `dpl_FcHJtVkCz5n92uYPhQJxZ8FLqh9u`.
Deployment URL: `https://travelchat-pa8t5pf7j-nkopp-cmds-projects.vercel.app`.
Vercel metadata and actual public browser checks confirm the live alias uses this deployment.

Final verification:

- 745 unit tests pass across 97 files. TypeScript and the hosted production build pass.
- All 39 public workflow checks pass across 390, 900, and 1440 pixel widths, without preview credentials.
- The map shows 24 real Seoul pins per result page, with working filtering, selection, details, and reviews.
- Local sign-in and signup forms work. Dashboard redirects now stay on Localley and preserve the original path.
- Thirty-four authenticated production checks passed before the redirect-only follow-up; its API protection remained unchanged.
- Save and unsave persisted correctly. Anonymous clients could not access the QA-owned row.
- Cover, day, and summary rendered real 1080x1920 PNGs. Private story access is protected and not cached.
- Five temporary QA accounts were created across the diagnostic attempts. All accounts, sessions, and fixture rows were removed.
- Each account was eligible for an authorized welcome email; attempt and delivery were not verified. No direct email call was made.
- No AI-generation or payment call ran during release checks.

Residual limits:

- Photo appearance and stale-worker upgrades were not established by the fresh, photo-blocked browser checks.
- Two filter-cache refresh timeout logs occurred with HTTP 200 responses; all browser filter checks still passed.
- This pre-existing query path needs a bounded performance follow-up. It is not a clean-error-log claim.
- Full lint retains 26 errors reproduced from the baseline; targeted changed code has no lint errors.
- New media activation, Cloudflare, billing changes, signup profile synchronization, and saved-place-to-itinerary continuation are not certified here.
- QA profile fixtures were explicit; automatic signup profile creation was not established.

Keep the saved-place security policy when rolling application code back. Do not restore the old PUBLIC policies.
Before deploying other branches, integrate this release's security and redirect fixes so they cannot be lost.

## Scope

This release extracts Seoul map discovery, safe map text, review reads, save validation, and compatible framework/worker maintenance.
The map shows the current result page. Moving the map does not fetch other result pages.
One security-policy migration was applied. No new media migrations are included.
No new provider, payment, or itinerary-generation code changes are included.
Image generation and billing code remain identical to the live baseline.
Hosted checks required two narrow changes to the existing story renderer: private access checks and summary layout compatibility.
Existing payment risks are not claimed to be fixed by this release.

## Candidate Verification

- 718 tests pass across 95 files.
- After the story fixes, the full suite passes 735 tests across 96 files.
- TypeScript and production builds pass on the isolated release tree.
- Focused lint passes with three warnings and no errors.
- Full lint reports 26 errors reproduced from the baseline with the same linter.
- Those baseline errors remain a separate maintenance task; this release adds none.
- Production Supabase hostname matches the expected Localley project.
- Saved-place and review field checks pass against the real schema.
- Clerk exposes the required `supabase` JWT template.
- Upload audit selects this release worktree, not its parent feature workspace.
- Deployment exclusions reject credentials, test artifacts, databases, and unrelated agent files.

## Verification History

The saved-place ownership migration was applied transactionally and recorded in hosted migration history.
Real QA verified save, read, unsave, and live-baseline compatibility after the change.
Anonymous database reads, inserts, and deletes cannot access the QA-owned row.

The first candidate exposed an existing private-story access gap and a summary Satori layout failure.
The renderer now checks owner/public access before image fetching and uses private no-store responses.
One missing `display: flex` declaration caused the summary failure and is now corrected.
Real offline and hosted renders of all three templates passed before completion.

QA found an existing saved-spots RLS risk, not a new discovery-code regression.
Production SQL confirmed three permissive PUBLIC policies with unconditional `true` predicates.
These policies allow anonymous reads, forged-owner inserts, and unrestricted deletes when table grants permit them.
The table was empty before migration after QA cleanup. Empty data did not make those policies safe.

Required migration: `supabase/migrations/20260907161457_harden_saved_spots_owner_rls.sql`.
It transactionally replaces only the three known policies with authenticated Clerk-subject ownership checks.
It refuses unexpected additional permissive policies or disabled RLS without dropping unknown policies.
It adds no UPDATE policy and changes no grants. Existing `service_role` administrative access remains available.
A real Clerk-template JWT with `role=authenticated` and the matching QA subject was verified before applying the policy.
Hosted save and isolation checks then verified the actual application-to-database authorization path.

Local regression command: `node scripts/test-saved-spots-rls.mjs`.
Result on 2026-09-07: all listed local regression checks passed on PostgreSQL 17.11.
The fixture uses PostgreSQL 17.11 from the existing `postgres:17-alpine` Docker image and checks its version.
It has no network or published ports, limits CPU and memory, and removes its container and temporary data.
It snapshots the original policies and first proves the vulnerable anonymous count is one.
It tests anonymous denial, owner isolation, forged-owner denial, denied reassignment, and administrative reads.
It also tests repeat application, rollback after invalid schema, and refusal of unknown permissive policies.
These SQL tests do not verify HTTP responses or production JWT validation.

References checked on 2026-09-07: [Supabase changelog](https://supabase.com/changelog.md)
and [RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).
No listed breaking change alters these existing-table policy expressions. The migration preserves existing grants.

Both release candidates used production configuration with `--skip-domain` before promotion.
The live aliases moved only after the relevant checks passed.
The final redirect-only follow-up passed its hosted redirect checks before promotion and all public workflows afterward.

The user authorized routine commit and deployment after successful release checks.
That authorization does not permit bypassing access controls or weakening authentication.
