# Full Cloudflare Migration

Final target: no Vercel, Supabase, or Clerk runtime dependency.
The current services stay online only until a verified replacement and rollback procedure are ready.
Stripe, OpenAI, and MiniMax remain external product providers, not hosting or authentication platforms.

## Current Checkpoint

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

The current test run passes 14 tests and makes 109 local Worker requests.
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
- Retire Clerk sessions, SDKs, widgets, and bridge credentials after the migration window closes.
- Retire Supabase and Vercel only after all live dependencies and recovery needs are accounted for.

No live users, DNS records, hosted resources, or authentication providers changed during this proof.
