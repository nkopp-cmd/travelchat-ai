# Seoul Discovery Release

Date: 2026-09-07. Target: Vercel `travelchat-ai`, serving `www.localley.io`.
Baseline: `98ccd6d00e11002326b8b7926e845414f675a7ef`.
Rollback deployment: `dpl_8GLWuch2zYWyFEJHt9SCNmyDPTJw`.

## Scope

This release extracts Seoul map discovery, safe map text, review reads, save validation, and compatible framework/worker maintenance.
The map shows the current result page. Moving the map does not fetch other result pages.
One additive security-policy migration is now required. No media migrations are included.
No media, payment, or itinerary-generation code changes are included.
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

## Deployment Gate

The saved-place ownership migration was applied transactionally and recorded in hosted migration history.
Real QA verified save, read, unsave, and live-baseline compatibility after the change.
Anonymous database reads, inserts, and deletes cannot access the QA-owned row.

The first candidate exposed an existing private-story access gap and a summary Satori layout failure.
The renderer now checks owner/public access before image fetching and uses private no-store responses.
One missing `display: flex` declaration caused the summary failure and is now corrected.
Real offline renders of all three templates pass; the replacement candidate still needs hosted re-verification.

QA found an existing saved-spots RLS risk, not a new discovery-code regression.
Production SQL confirmed three permissive PUBLIC policies with unconditional `true` predicates.
These policies allow anonymous reads, forged-owner inserts, and unrestricted deletes when table grants permit them.
The parent reports that QA cleanup left the table empty. Empty data does not fix the policies.

Required migration: `supabase/migrations/20260907161457_harden_saved_spots_owner_rls.sql`.
It transactionally replaces only the three known policies with authenticated Clerk-subject ownership checks.
It refuses unexpected additional permissive policies or disabled RLS without dropping unknown policies.
It adds no UPDATE policy and changes no grants. Existing `service_role` administrative access remains available.
The parent handles production application. This bounded task makes no production writes or application API calls.
The parent must separately verify a real Clerk-template JWT with `role=authenticated` and the correct `sub`.
Template existence alone does not verify that role or successful hosted authorization.

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

Deploy with production configuration and `--skip-domain` first.
Keep the existing live aliases unchanged until hosted checks pass.
Verify real map data, public details, authentication, saves, reviews, and worker behavior.
Do not call this release live until the exact deployment is promoted and its production routes are checked.

The user authorized routine commit and deployment after successful release checks.
That authorization does not permit bypassing access controls or weakening authentication.
