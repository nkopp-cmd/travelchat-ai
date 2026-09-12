# Full Cloudflare Migration

Final target: no Vercel, Supabase, or Clerk runtime dependency.

Discovery improvements are additions to the complete existing application.
Preserve current accounts, subscriptions, itineraries, bookmarks, and other product flows during migration.
The restricted three-place preview is infrastructure evidence, not a replacement product or a cutover candidate.
The existing-app integration is documented in `releases/integrated-discovery.md`.

No new Vercel deployments are permitted, including narrow fixes to the existing website.
An attempted unpromoted photo-repair candidate was removed after the user reiterated this requirement.
Vercel Git integration is disconnected, and this branch retains only an explicit deployment-disable guard.
Legacy schedules are inventoried in `cloudflare/legacy-cron-inventory.json`; they have not been replaced remotely yet.
DNS is on Cloudflare, but the current application origin remains Vercel until a verified replacement is deployed.
Do not describe DNS activation as completion of the application migration.

The migration must also deliver the authentic discovery improvements in `AUTHENTIC_DISCOVERY.md`.
Photo truthfulness, useful spot facts, real map behavior, and spot-to-itinerary actions are primary product requirements.
Do not import the existing misleading fallback and photo-reference behavior unchanged into the Cloudflare implementation.
The current services stay online only until a verified replacement and rollback procedure are ready.
Stripe, OpenAI, and MiniMax remain external product providers, not hosting or authentication platforms.

## Current Checkpoint

The native shell now bounds auth requests and fences mapping reads with the observed session ID.
Account mutations require session preconditions and recheck active verification/session state within identity-write batches.
A synthetic ownership rehearsal preserves saved places, itineraries, quota, profile UUIDs, and consent across claim and password recovery.
See `releases/native-account-boundaries.md` for exact checks, delivery evidence, and remaining hosted/customer-import gates.

Native email preferences now have a guarded D1 route and reuse the actual settings controls through the application session boundary.
New accounts start off. Legacy preferences require explicit import; missing import data never becomes implicit consent.
This does not activate an email sender or change live Clerk settings. See `releases/native-email-preferences.md` for delivery evidence.

Private itinerary summaries, detail reads, and atomic edits now run in native D1.
The actual existing editor passed a Better Auth HTTPS journey against that backend.
See `releases/native-itinerary-editor.md` for the schema, limits, evidence, and remaining feature coverage.
This does not migrate the Next server pages or switch live accounts.

The latest authentication step connects actual root bookmark components to Better Auth and native D1 over local HTTPS.
The root application retains an explicit Clerk adapter for its current live backend.
The Better Auth adapter validates authentication and application identities without provider fallback.
Native bookmark writes now require matching session preconditions.
Full root regression checks and the production build pass.
See `releases/better-auth-integration.md` for exact evidence, dependency findings, and remaining account migration work.
This is not a live authentication cutover or a replacement of the full product with the restricted preview.

Cloudflare DNS is active for `localley.io` as of 2026-09-08.
The 14 existing DNS records were compared and preserved before the user changed nameservers.
Website and Clerk endpoint checks passed afterward; application hosting and authentication have not switched yet.
Email Sending onboarding remains blocked by the current token's access.
See `operations/cloudflare-dns-cutover.md` for the verified DNS state and next approval gate.

The tested story integration is preserved in local commit `b5a1fbc`.
It was not deployed after the user clarified the full migration target.
Its image ledger migration was already applied before that clarification; no data was removed to reverse it.

Migration work proceeds on `cloudflare/full-migration`.
Vercel Git deployment is disabled for `cloudflare/**` branches through versioned configuration.
The current main branch and live domain are unchanged by that guard.
Do not trigger new Vercel deployments for this migration branch.

## Target Services

| Function | Target |
| --- | --- |
| Web application and APIs | Workers and Workers Static Assets |
| Accounts and sessions | Better Auth on Workers with D1 |
| Application data | D1 with explicit Worker authorization |
| Files and exported media | R2 |
| Retryable background work | Queues and Workflows where required |
| Scheduling | Cron Triggers |
| Native encoding | A verified Cloudflare Containers implementation |
| Bot protection | Turnstile |

Cloudflare Access can protect internal tools. It is not the consumer authentication replacement.
Do not retain external PostgreSQL as the final answer to the D1 port.
Rewrite and verify spatial queries, transaction behavior, and authorization instead of assuming equivalent SQL support.

## Auth Proof

### Frontend Integration

The local proof now serves a React frontend through native Workers Static Assets.
It uses Better Auth's official client and the D1-backed application session and saved-place routes.
No successful authentication or save response is fabricated in the browser tests.

The UI covers signup, verification notices, sign-in, explicit account setup, saved places, logout, and password reset.
Email remains in the private local test outbox. Only the trusted test harness can read verification and reset links.
The page clearly labels its accounts and catalog as synthetic test data.

Private data is scoped to auth user, application owner, and session.
Account changes clear private views and cancel stale requests.
Mutations carry an expected session identifier, which the server compares with the actual authenticated session.
That header is a stale-client precondition, not an authentication credential.
A changed session rejects the mutation instead of applying the old page's action to a new account.

Guest place selection survives sign-in, but saving still requires explicit confirmation.
Failed reads do not appear as empty collections, and failed logout does not falsely claim that the session ended.
The UI does not claim XP or engagement completion from queued save events.

Browser verification covers 19 reviewed screenshots across nine states.
Public views were checked at 390, 900, and 1440 pixels.
Authenticated and recovery screens were checked at mobile and desktop sizes.
All measured controls meet 44x44 pixels. Text contrast, focus, overflow, and reduced-motion checks pass in the reviewed scope.
Screen-reader speech, zoom, other browser engines, and full WCAG conformance remain unverified.
Detailed evidence is in `cloudflare/auth-proof/docs/browser-evidence.md`.

`npm run check` now includes both Worker and frontend TypeScript checks and lint.
`npm run test:browser` runs the separate real-browser flow.
The local TLS bridge is test infrastructure, not a proposed production Node server.
No live accounts, real email, database imports, domain changes, or hosted deployment occurred in this slice.

### First Application Port

The local Worker now implements Localley's saved-place API with native D1 queries.
A shared application session boundary separates auth IDs, owner IDs, profile UUIDs, and session IDs.
Private access requires a current verified session and a complete identity mapping.
New account provisioning creates the owner, profile, default quota, and mapping in one atomic batch.
Legacy fixtures preserve their existing owner strings, profile UUIDs, save IDs, and millisecond timestamps.
No real account or catalog import has run.

`/api/spots/save` supports the existing POST, GET, and DELETE response shapes.
Quota errors retain the existing structured format and HTTP 429 status.
Limits of 10, 100, and 999 are server-controlled; absent quota configuration blocks new saves with HTTP 503.
Concurrent saves cannot exceed the quota or create duplicate save events.
The save and its event share one transaction, so a failed event write rolls back the save.
Duplicate retries remain successful at the limit, and over-limit owners can still read and remove existing saves.

Unavailable catalog entries expose no hidden metadata. Owned saves can return a read-time tombstone.
Multilingual JSON, null photos, and unrated scores remain intact. Rated scores use integers from 1 through 6.
Lists preserve history through 1000 rows. Larger lists fail explicitly rather than silently truncating.
Pagination and lossless handling of finer timestamp precision remain import-design decisions before production use.

The latest check passes 26 native runtime tests plus one environment-isolation test.
It issued 266 local Worker requests, including 119 saved-place requests.
Type generation, TypeScript, lint, bundling, and package validation pass.
These results do not establish production CPU costs or distributed performance.

Events remain in a local outbox. No XP award, guide engagement, billing action, or queue consumption is claimed.
The production frontend still uses the current live backend; only the local migration frontend uses these Worker routes.
Production imports, quota synchronization, real email delivery, and event consumers remain migration stages.
No live provider, account, email, database, or DNS changes occurred in this application slice.

### Authentication Foundation

`cloudflare/auth-proof` is an independent package with pinned dependencies and its own lockfile.
It runs Better Auth 1.7.3 and Drizzle 0.45.2 in native workerd with real local D1 bindings.
It contains no Clerk, Supabase, or Vercel integration and imports no production customers or credentials.
Its configuration exposes no remote route or workers.dev endpoint.

The proof verifies:

- Signup, verified email, login, password reset, logout, expiry, and session revocation.
- Secure, HttpOnly, host-only cookies and disabled cookie caching.
- Origin checks, callback restrictions, body size and time limits, and database-backed rate limits.
- Private-data ownership and rejection of user-supplied owner fields.
- Signed, expiring, single-use legacy-owner claims with atomic D1 consumption.
- Six concurrent claims produce one mapping, with unique constraints in both directions.
- Database and outbox failures do not grant a session or owner identity.

The initial authentication checkpoint passed 14 tests and made 109 local Worker requests.
The production dependency audit for the isolated proof reports zero advisories at this checkpoint.
This does not establish the security status of the parent application's dependencies.
Email is captured in a private, disposable D1 outbox, not sent to real addresses.
Claim tokens are issued only by a trusted synthetic fixture, not an HTTP minting endpoint.
This is a local runtime proof, not a migrated product or public authentication service.

Default password hashing is unchanged. No KDF parameter was reduced for a free tier.
Wall time was measured, but CPU time, peak memory, and hosted costs remain unmeasured.
Miniflare is a prerelease dependency of the selected stable Wrangler version.
Read `cloudflare/auth-proof/README.md` for exact commands and limitations.

## Identity Preservation

Keep the distinction between authentication IDs, application owner IDs, and existing profile UUIDs.
Historical owner strings can remain as local identifiers after the Clerk service is removed.
This preserves relationships to itineraries, saved spots, credits, guides, and Stripe customers.

Use a mapping unique on both authentication user and application owner.
Do not automatically link legacy accounts using matching email addresses.
Accept an independently verified credential import, an exact verified provider subject, or a short-lived authenticated migration exchange.
An exchange must bind the old owner, new authenticated user, nonce, expiry, and proof in one single-use grant.
The local proof tests grant redemption. It does not implement the real legacy proof issuer or import pipeline.

Preserve existing Stripe customer, subscription, Connect, and historical metadata identifiers.
Do not recreate billing accounts or overwrite ownership metadata during authentication migration.
Convert confirmed administrator and lifetime grants into explicit owner-bound permissions.
Editable profile metadata and unverified emails must never grant those permissions.

## Required Production Work

1. Audit the export of verified emails, provider subjects, password hash options, MFA, and passkey state.
2. Define recovery and re-enrollment rules where credentials cannot transfer safely.
3. Implement a production email outbox and delivery path with retryable operations.
4. Define safe cleanup and recovery for partial auth writes; D1 lacks interactive transactions through this adapter.
5. Prove production rate limiting, request consistency, session revocation, CPU cost, and peak memory.
6. Add the application session boundary and replace Clerk UI and middleware consumers.
7. Clear private client caches and cancel stale requests when the authenticated account changes.
8. Port private data operations into a tested Worker authorization boundary; D1 has no PostgreSQL RLS.
9. Port geographic queries and atomic credit/payment state transitions with parity tests.
10. Rehearse data and media imports with counts, checksums, ownership, and duplicate checks.

Partial signup can leave an unverified orphan user after a forced D1 write failure.
The proof confirmed that such users receive no session or owner mapping.
Production cleanup must distinguish disposable incomplete registration from imported accounts or users with content.
Do not solve partial writes by weakening email verification or account linking.

## Cutover Gates

- Verify real sign-in, recovery, save/unsave, itinerary ownership, billing access, and media delivery on the Cloudflare target.
- Preserve a verified backup and rehearse restoration, not only export.
- Prevent concurrent writes from producing divergent records during final synchronization.
- Switch schedules and webhooks once, with idempotency and rollback checks.
- Switch the domain only after the target passes the complete acceptance journey.
- Disable Vercel's Git deployment for main before merging the final migration branch into main.
- Retire Clerk sessions, SDKs, widgets, and bridge credentials after the migration window closes.
- Retire Supabase and Vercel only after all live dependencies and recovery needs are accounted for.

No live users, DNS records, hosted resources, or authentication providers changed during this proof.
