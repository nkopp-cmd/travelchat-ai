# Local Auth And Application Proof
This package proves Better Auth on native workerd with local D1 bindings.
It does not change the parent application or its dependencies.
Better Auth, Workers, and D1 form the intended final authentication platform.
This package has no Clerk, Supabase, or Vercel integration.

**Do not deploy this package.** It contains local fixture behavior, not a production migration service.

## Commands

Run these commands from `cloudflare/auth-proof` with Node.js 22.13 or later.

```sh
npm ci --ignore-scripts --cache .npm-cache --no-audit --no-fund
npm run check
npm run clean:local
```

`check` first starts an isolated host process and tests its environment boundary with fake poison markers.
It then runs the unchanged pipeline through `check:inner`: types, TypeScript, ESLint, Worker build, workerd tests, and package validation.
The pack check uses `npm pack --dry-run`. It does not publish or deploy.
No command needs Cloudflare credentials or a Cloudflare account.
Do not run Wrangler remote, deploy, login, or resource commands for this proof.

**`npm run check` is the canonical validation command.**
Direct `build`, `test`, and `check:inner` commands do not create the clean host boundary.
The proof harness refuses to run without that boundary and validates its environment before importing third-party modules.
Direct `types` still supplies Wrangler with its own restricted environment.
Install the pinned dependencies first. The check never installs packages or runs an implicit dependency audit.

### Host And Transport Isolation

`scripts/check.mjs` imports only Node built-ins before spawning child processes.
It preserves only PATH, with the running Node directory first, and constructs all other environment values explicitly.
It does not inherit Cloudflare, Stripe, Better Auth, Clerk, Supabase, npm tokens, or other service credentials.
It also strips inherited proxy configuration, `NODE_OPTIONS`, and `NODE_PATH`.

Each invocation creates a fresh `.local/check-*` directory with `mkdtemp`.
HOME, TMPDIR, XDG configuration, XDG cache, XDG state, and the npm cache remain inside that directory.
Distinct, empty user and global npm configuration files prevent loading the host's credential settings.
The wrapper creates files exclusively and removes its check directory in `finally`.
It never copies `.env` files or parent settings.

The clean child uses the public npm registry setting with npm offline mode, disabled lifecycle hooks, and disabled update checks.
Explicit npm scripts still run. The existing local dependency installation supplies all build and test tools.
Wrangler metrics remain disabled. Miniflare disables telemetry and metadata fetching, and the test Worker blocks outbound fetches.
No platform API, account, deployment, or remote binding call belongs to this check.

The initial npm launcher and wrapper Node process still start in the caller's environment.
The boundary protects their child pipeline, before its third-party test or build modules load.
It assumes trusted Node/npm executables and PATH. It is process-environment isolation, not an operating-system sandbox.

The preflight test passes fake Cloudflare, Stripe, auth, npm, proxy, and preload markers into a nested wrapper.
The child checks that all markers are absent and its npm configuration files are empty and distinct.
The test never prints marker values or captured child output, and it verifies removal of the nested check directory.
The proof harness repeats the host assertions before loading Better Auth or Miniflare.
Only the Worker receives fresh, random authentication secrets through explicit ephemeral bindings.

The package pins direct dependencies and includes its own lockfile.
Installation disables lifecycle scripts. Published optional binaries provide workerd and esbuild without rebuilding native code.
The lockfile records registry integrity hashes. Both installed binaries executed successfully during verification.
There are no links to parent dependencies.

The ignored `.npm-cache` belongs only to this package.
Keep its lifetime bounded to one installation and check cycle.
`clean:local` removes that cache, `.local`, and `.wrangler`.
It leaves `node_modules`, the bundle, and generated types available for review.

## Versions

Registry metadata was retrieved on 2026-09-08 before selection.

| Component | Exact Version |
| --- | --- |
| Better Auth | 1.7.3 |
| Better Auth Drizzle adapter | 1.7.3 |
| Drizzle ORM | 0.45.2 |
| Wrangler | 4.129.1 |
| Miniflare | 5.20260907.0-alpha |
| workerd, through Wrangler and Miniflare | 1.20260907.1 |
| TypeScript | 6.0.3 |
| esbuild | 0.28.2 |
| ESLint | 10.10.0 |
| typescript-eslint | 8.70.0 |
| Node types | 22.20.1 |
| Verification host Node.js | 22.22.1 |
| Verification host npm | 11.19.1 |
| Test runner | Node.js built-in `node:test` |

Better Auth and Drizzle use stable releases with matching peer ranges.
Wrangler's current stable release depends on this Miniflare prerelease.
The harness uses Miniflare 5's published configuration schema directly.
TypeScript 6.0.3 matches typescript-eslint's supported range. TypeScript 7 does not match that range.

## Local Boundary

- `LOCAL_PROOF` must equal `true`.
- The configured base must be an HTTPS origin on `localhost` or a reserved `.test` name.
- Every request must match that exact configured origin. Other hosts, ports, and protocols fail closed.
- Both secrets must contain at least 32 characters.
- Wrangler has no routes, account identifier, preview URLs, or workers.dev endpoint.
- The D1 identifier is the zero UUID. The binding explicitly disables remote access.
- Observability disables invocation logs, trace collection, and log persistence. It redacts query strings.
- Better Auth logging is disabled. `onAPIError.throw` sends unknown failures to the Worker's safe response handler.
- This also avoids better-call's fallback console logging of failed SQL and credential parameters.
- Worker outbound fetches are blocked by the test harness. No email is sent.

`scripts/types.mjs` creates random, ignored `.dev.vars` secrets only for `wrangler types`.
It refuses to overwrite an existing file and removes its temporary secret file afterward.
Wrangler receives a restricted environment with package-local HOME, configuration, logs, and temporary paths.
The committed type file contains secret names and string types, not secret values.

The harness supplies separate random secrets directly to Miniflare for each run.
It creates fresh D1 storage under `.local`, applies the actual migration, and disposes workerd afterward.
It removes database state in `finally`. `clean:local` also removes artifacts from interrupted runs.
No tests import customer data, passwords, legacy exports, or real credentials.

## Authentication

`src/auth.ts` creates a request-scoped Better Auth instance using the Drizzle SQLite adapter and native `env.DB`.
The adapter explicitly uses `transaction: false`, as documented for databases without interactive transactions.
No code casts D1 into a transaction API. No code sends `BEGIN` to D1.

- Email and password authentication requires verified email.
- Signup does not create a session. Spoofed `emailVerified` input does not verify the stored user.
- Account linking is disabled. No OAuth providers are configured.
- Session cookies use Secure, HttpOnly, SameSite=Lax, and a host-only scope.
- Cookie caching is disabled. Session lookup reads the database.
- Password reset uses the verified `revokeSessionsOnPasswordReset: true` option.
- Rate limiting is enabled with database storage and Better Auth's default endpoint limits.
- Local requests share a server-set loopback bucket. Client IP headers cannot select another bucket.
- Better Auth retains its built-in origin, callback, and CSRF checks.
- Application mutations also require an exact Origin header.
- Request bodies have a streamed, counted 16 KiB limit, independent of Content-Length.
- One five-second deadline covers the entire body, including stalled streams and streams that keep sending small chunks.
- Timeouts return 408. Read failures return 400. Neither path reaches authentication or private writes.
- A `finally` block clears the deadline timer. Cancellation uses `ctx.waitUntil` with handled rejection, without delaying the response.

The password configuration does not override Better Auth's hasher.
The Worker bundle selects its published non-Node `@noble/hashes` scrypt implementation.
The unchanged parameters are N=16384, r=16, p=1, and dkLen=64.
Signup, incorrect password checks, successful login, and password reset execute that implementation inside workerd.
No KDF parameter was reduced to fit a platform plan.

Verification and reset callbacks await insertion into the private `local_outbox` D1 table before returning.
Better Auth 1.7.3 catches these callback errors even when it awaits the callback.
A request-scoped failure flag therefore changes the HTTP result to a safe 500 response without cookies.
The flag never enters global state. No auth library internals are changed.
Only the trusted harness reads that binding directly. No HTTP mailbox endpoint exists.
The outbox contains sensitive test tokens and exists only in disposable local storage.
Tests read outbox rows immediately after the response, without polling or waiting for background work.

### Partial Write Boundary

Real D1 `RAISE(ABORT)` triggers test failed outbox inserts and failed account inserts.
Both signup cases return 500 without a session cookie, database session, identity link, owner, or outbox row.
The pinned nontransactional adapter leaves an unverified user row in both cases.
An outbox failure also leaves the credential account. An account failure leaves no credential account.
Neither failed signup can log in. A failed reset notification returns 500 and does not revoke the existing session.
A failed reset notification can leave an undelivered verification record until its normal expiry or cleanup.

**Production requires a reviewed cleanup and recovery policy for these partial writes.**
That policy must address orphan users, retry behavior, undelivered reset records, and email enumeration risks.
Awaiting outbox storage does not make the complete signup or reset request transactional.
Only the explicit D1 batches described below have the atomic guarantees tested here.

## Private API

| Route | Purpose |
| --- | --- |
| `/api/auth/*` | Better Auth's built-in HTTP handlers |
| `GET /api/session` | Neutral identity DTO, without credential tokens |
| `POST /api/account/new` | Atomically create owner, profile, free quota, and identity; accepts an empty object |
| `POST /api/account/claim` | Redeem one signed legacy fixture grant; accepts only `token` |
| `GET /api/private-notes` | List up to 100 notes for the trusted owner |
| `POST /api/private-notes` | Create a note; accepts only `body` |
| `GET /api/private-notes/:id` | Read an owner-scoped note |
| `PATCH /api/private-notes/:id` | Update an owner-scoped note; accepts only `body` |
| `DELETE /api/private-notes/:id` | Delete an owner-scoped note |

Private data requires a valid database session and current verified email.
Unlinked users receive 409 until they explicitly create or claim an owner.
`identity_links` has unique constraints on both `authUserId` and `ownerId`.
Client owner fields are rejected. Every note query derives ownership from the trusted mapping.

### Shared Session Boundary

`src/app-session.ts` exports `trustedAppSession` and the `TrustedAppSession` interface.
The interface contains `authUserId`, `ownerId`, `userRecordId`, and `sessionId`.
`userRecordId` is the existing profile UUID, not the auth ID or owner string.
Each request verifies the Better Auth database session and reads current email verification and identity mapping.
There are no global sessions or cached mappings.
Notes, account routes, session responses, and saved spots use this boundary.

Signed-out requests return 401. Unverified requests return 403.
Verified session responses contain `state`, `authUserId`, and `sessionId`.
The `state` is `unlinked`, `incomplete`, or `ready`.
Only `ready` includes `ownerId` and `userRecordId`.
Incomplete means an identity link has no validated profile.
Unlinked and incomplete identities cannot access private data; these requests return 409.
No session DTO contains passwords, email tokens, cookie credentials, access tokens, or refresh tokens.
`sessionId` identifies the session row; it is not its bearer token.
This unshipped proof does not preserve the old `userId` response field.

New-account provisioning uses one D1 batch for owner, profile UUID, free limit 10, and identity link.
The initial request returns 201 with `{ownerId,userRecordId}`.
Retries return 200 with the unchanged identity. Concurrent requests create exactly one complete account.
This batch does not assume Better Auth hooks are transactional.
Existing links cannot change owners. Incomplete identities cannot generate replacement profiles.
Missing quota rows do not remove read access; they block new saves with 503.
Legacy claims require an existing unique profile and a validated limit for the exact unchanged owner string.
The trusted fixture issuer also checks these requirements. It never generates a legacy profile UUID.

### Saved Spots Contract

`/api/spots/save` mirrors the parent route's successful response shapes without importing its providers.
All queries use the session owner. Clients cannot provide ownership or quota settings.
POST and DELETE accept exactly `{ "spotId": "UUID" }`.
GET accepts no query fields or exactly one `spotId` query field.
Unknown fields, duplicate query fields, invalid UUIDs, null IDs, and malformed bodies return 400.
UUID input becomes lowercase, matching PostgreSQL UUID behavior.

| Request | Response |
| --- | --- |
| POST, new save | 200 `{success:true,saved:true,message:"Spot saved successfully"}` |
| POST, existing own save | 200 `{success:true,saved:true,message:"Spot already saved"}` |
| DELETE | 200 `{success:true,saved:false,message:"Spot removed from saved"}` |
| GET with `spotId` | 200 `{saved:boolean}` |
| GET without `spotId` | 200 `{success:true,spots:[...]}` |

Each list entry contains `id`, `spot_id`, `created_at`, and `spots`.
`created_at` is an ISO timestamp representing the unchanged integer milliseconds.
Visible `spots` contains `id`, `name`, `description`, `category`, `localley_score`, and `photos`.
Name and description remain multilingual JSON objects. Photos remain a JSON array or null.
Scores remain integers from 1 through 6, or null. The DTO never supplies replacement values for null fields.
Missing or hidden catalog entries produce `spots:null`, without hidden metadata.
Existing hidden saves still return `{saved:true}` and permit deletion or duplicate POST.
New saves of hidden and unknown spots return identical 404 responses: `{error:{code:"not_found",message:"Spot not found."}}`.

Lists sort newest first by timestamp, then descending save UUID for stable ties.
Normal server limits are 10 free, 100 pro, and 999 premium.
Only trusted local fixtures set limits in this proof. Email addresses never select a paid quota.
There is no public quota setter or payment integration.
Over-limit imports retain their history. Reads return every row through an absolute limit of 1000.
The query reads at most 1001 rows to detect overflow.
More than 1000 rows returns 409 with code `conflict` and message `Saved spot list exceeds absolute limit of 1000`.
It never reports a silently truncated successful list. State reads and deletion still work above this bound.

POST uses one atomic D1 batch, with prepared bindings only.
The conditional INSERT checks visibility, quota, and absence of the owner's existing save.
It uses targeted `ON CONFLICT(ownerId,spotId) DO NOTHING`, not broad `INSERT OR IGNORE`.
The next statement inserts an event only when `changes() = 1`.
Subsequent SELECTs inside that same batch distinguish duplicates, unavailable catalog, missing quota, and full quota.
There is no post-transaction decision query. Duplicate saves succeed even when quota is missing or exhausted.
The same batch also selects the current saved count for the quota response.
Exhausted limits return HTTP 429 with the root `Errors.limitExceeded` contract:

```json
{"error":{"code":"limit_exceeded","message":"You've reached your saved spots limit.","details":{"limitType":"saved spots","current":10,"limit":10}}}
```

`current` and `limit` come from that batch, not a later query. Lifetime quotas omit `resetAt` entirely.
There is no invented `periodResetAt` field.
New visible saves without a limit return 503 with code `database_error`.
The message is `Database operation failed. Please try again.` No quota details are returned.
This intentional 503 differs from the root database helper's default 500 because trusted quota configuration is unavailable.
It does not indicate quota exhaustion. Duplicates still return 200 and deletion remains available.
Unexpected database failures return safe HTTP 500 with code `internal_error`, matching the root catch handler.
The message is `An unexpected error occurred. Please try again.` Failed event inserts roll back the new save.

Saved-route errors use `{error:{code,message,details?}}`, including failures in the shared session and body checks.
Validation returns 400 with code `validation_error`. Signed-out requests return 401 with code `unauthorized`.
The unauthorized message is `Please sign in to continue.` Unverified sessions and invalid origins return 403 with code `forbidden`.
Unlinked and incomplete identities retain HTTP 409 with code `conflict`.
The small `src/app-error.ts` helper stays inside this proof. Better Auth's native endpoint JSON remains unchanged.

DELETE removes only the owner's save, without a quota check. Repeated deletion remains successful.
There is no unsave event. Save events survive deletion and use the unique key `saveId:save`.
Saving again creates a new save UUID and event. No consumer runs in this proof.
The event does not claim completed XP or engagement processing.
Origin checks, body limits, auth rate limits, cookie protections, and no-store headers remain in place.

### Application Schema

`0001_local.sql` remains unchanged. The harness applies it before `0002_application.sql`, only to fresh local D1.
The second migration adds profiles, minimal spots, owner limits, saved spots, and the application outbox.
Profile IDs and save IDs use canonical UUID checks. Profiles and limits have unique owner foreign keys.
Quota values must be integers from 0 through 999. Name and description require non-null JSON objects.
Scores require SQL NULL or SQLite integer storage from 1 through 6. Photos accept SQL NULL or a JSON array.
The synthetic catalog uses score 4. Tests reject 42, fractional scores, and other invalid scores.
Saved spots have a unique owner/spot pair, an owner/order index, and a spot index.
Catalog references deliberately lack foreign keys, so removed catalog rows can remain as history tombstones.
Events deliberately lack a save foreign key, so deletion cannot cascade into the outbox.
Tests seed only clearly labeled synthetic Korean and English catalog content.
No production data or remote migration enters this package.

### Lifecycle Gates

Before integration, the parent must validate legacy profile IDs, owner mappings, quotas, and timestamp imports.
Incomplete legacy data requires trusted repair, not generated substitute IDs or email-only ownership proof.
Consumers need reviewed deduplication, delivery, retry, and engagement semantics.
Outbox retention, account deletion, orphan cleanup, abuse limits, and list pagination remain future gates.
No live provider, email delivery, account creation, remote database write, or deployment occurred.
All created accounts and database writes exist only in disposable local tests.

## Claim Proof

`test/fixture-issuer.mjs` is the only grant issuer. The Worker bundle does not import it.
The issuer uses synthetic, explicitly seeded legacy owners as its source proof.
It does not infer ownership from email addresses.

A grant signs the exact auth user ID, legacy owner string, expiry, and random nonce with HMAC-SHA256.
D1 stores the token's SHA-256 hash and signed fields, not the clear grant token.
The Worker verifies HMAC with Web Crypto `subtle.verify`, not a secret string comparison.
Redemption requires the verified target session and the exact secure Origin.

One D1 batch performs two conditional statements:

1. Insert the identity link only when the matching, unexpired grant remains unused and both identities remain unlinked.
2. Consume the grant only when the previous statement inserted one mapping, using SQLite `changes()`.

D1 executes the batch atomically. Constraint failures roll back the batch.
The claim INSERT checks `CAST(unixepoch('now', 'subsec') * 1000 AS INTEGER)` inside SQL.
This is D1's current epoch time in milliseconds at statement execution, not a captured JavaScript timestamp.
The early JavaScript expiry check remains an optimization. The SQL check is authoritative for the write.
The consumption timestamp also comes from D1's clock.
Conflicts do not replace an existing mapping or consume a grant.
Legacy owner strings remain unchanged, including punctuation and slashes.
An account with a new owner cannot later claim legacy content through this endpoint.

**The real Clerk source-proof exchange and customer import are not implemented.**
A production issuer must independently prove legacy ownership and bind that proof to the exact new authenticated user.
Parent review must define that exchange, recovery policy, audit trail, and migration rollback before integration.

## Schema Evidence

`src/schema.ts` and `migrations/0001_local.sql` are manually authored and reviewed against Better Auth 1.7.3's `getAuthTables`.
The runtime test compares every core table's columns with that pinned library definition.
The migration includes auth tables, the database rate table, private outbox, owners, identity links, notes, and hashed grants.
Dates use integer milliseconds through Drizzle's `timestamp_ms` mode.
The test exercises real inserts, updates, session reads, token consumption, foreign keys, uniqueness, and D1 batches.
This is not a Node SQLite substitute or an in-memory JavaScript database.

## Application Verification

The 2026-09-08 `npm run check` passed types, TypeScript, ESLint, build, native tests, and package validation.
The original 14 reported auth passes remain covered. Twelve application groups bring the runtime total to 26 passes.
The separate host-isolation test also passed, giving 27 reported passes overall. No tests were skipped.
The runtime suite issued 266 Worker requests, including 119 requests to `/api/spots/save`.
The native harness measured 48,670 ms total wall time. The host-isolation test measured 580 ms wall time.

| HTTP Status | Request Count |
| --- | ---: |
| 200 | 109 |
| 201 | 5 |
| 302 | 7 |
| 400 | 35 |
| 401 | 26 |
| 403 | 19 |
| 404 | 12 |
| 408 | 2 |
| 409 | 26 |
| 413 | 1 |
| 429 | 15 |
| 500 | 8 |
| 503 | 1 |

These counts include intentional validation errors, revoked sessions, quota failures, and trigger-induced database failures.
Eight simultaneous saves returned 200 with exactly one row and one event.
Two different saves contested the last slot: one returned 200 and one returned 429.
Six concurrent account requests returned one 201 and five 200 responses with the same identity.
Native triggers proved rollback for save, event, profile, limit, and identity inserts.
Tests preserved historical profile UUIDs, save UUIDs, owner strings, and timestamps after claims.
The list test checked 999 and 1000 rows, plus explicit rejection of 1001 rows.
Tests checked exact structured errors, omitted reset fields, nullable list values, and score constraints.
All 266 responses had `Cache-Control: no-store`. Forced application failures emitted zero Worker log events.
The bundle measured about 899.1 kB. The dry-run package measured about 361.5 kB compressed before this evidence update.

**Wall time is not CPU time.** CPU usage, peak memory, production latency, and plan suitability remain unmeasured.
No KDF settings, library checks, Wrangler configuration, generated Env, dependency files, or root files changed.
The unchanged cleanup command removes disposable `.local`, `.wrangler`, and `.npm-cache` state.

## Previous Auth Evidence

The earlier auth-only 2026-09-08 check passed type generation, TypeScript, ESLint, builds, tests, and the package check.
The isolated host preflight also passed its poison-marker and directory-cleanup test in 501 ms wall time.
Together, the preflight and runtime suites reported 15 passing tests.
All 12 scenario groups, the delayed-claim subtest, and their parent test passed: 14 reported passes.
That run issued 109 Worker requests and took 24,555 ms of total wall time.
Successful signup took 135-239 ms. Successful sequential login took 130-191 ms. Successful reset took 168 ms.
The stalled stream returned 408 after 5,013 ms. The trickling stream returned 408 after 5,009 ms.
The failed stream returned 400 after 9 ms.
The delayed grant had 1,881 ms remaining when the batch wrapper received it.
D1's clock showed that it had expired 203 ms before SQL execution. No link or consumption occurred.
Both forced signup failures left an unverified orphan user, but no session, owner, or notification row.
The failure test also confirmed zero Worker log events.
The bundle measured 894,372 bytes. The package check reported about 355 kB compressed, including generated runtime types.
These numbers include request and database overhead. They are not isolated KDF measurements.

The tests cover:

- Fresh schema, foreign keys, default scrypt, signup spoof protection, verification, wrong passwords, and valid login.
- Secure cookie attributes, private CRUD, second-user isolation, and rejection of forged owner fields.
- Wrong Origin, invalid callbacks, invalid reset redirects, unknown mailbox paths, and a streamed oversized request.
- Verified-target claims, unverified-session rejection, stolen grants, expired grants, tampering, and exact legacy mapping.
- Six concurrent redemptions with exactly one success, replay rejection, owner conflicts, and preservation of new content.
- Logout, session expiry, password reset, old-password rejection, token reuse, and revocation of both active sessions.
- Expired reset records and a correctly signed expired verification token returning `TOKEN_EXPIRED`.
- Database rate limits across fresh auth instances and forged IP headers.
- Eight concurrent login attempts with three processed requests and five rate-limit rejections.
- Disabled local flag, invalid configured origins, and the reserved `.test` configuration path.
- A grant valid at the batch call but expired before native D1 execution, with no mapping or consumption.
- Stalled and trickling native streams returning 408 at the whole-body deadline, including rejected source cancellation.
- A failed native stream returning a safe 400 response without creating a user.
- Failed outbox writes during signup and reset, with no false notification success or session cookie.
- A failed account insert, its orphan user row, denied login, and absence of session or ownership grants.
- Zero Worker log events during the forced failure paths. The harness counts logs without printing their contents.

`test/fixture-worker.mjs` exists only in the test manifest. The package build does not import it.
It creates native workerd streams and delays only the call to the real D1 `batch` binding.
The delayed test reads D1's clock before and after the delay and then executes the unchanged claim SQL.
It does not replace D1, emulate SQL, change the Worker clock, or bypass session and HMAC checks.
Test triggers are removed in `finally`. Temporary databases and test artifacts remain disposable.

**CPU time, peak memory, and production latency were not measured.**
A prior parent verification repeated all 14 passing tests and 109 Worker requests in 26,090 ms wall time.
The isolated package's production dependency audit reported zero advisories on 2026-09-08.
That audit does not cover the parent application's dependencies or prove complete application security.
Miniflare wall time does not establish Cloudflare CPU billing or a free-plan fit.
The proof makes no free-plan claim.
No production deployment, distributed load test, paid service, or live migration was performed.
Miniflare's prerelease status remains a tooling risk for later integration.
The private API needs production abuse limits and operational policies before release.

## Retrieved References

These documents were retrieved before choosing the APIs on 2026-09-08.
Installed package source and generated runtime types supplied exact version-specific details.

- [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/)
- [D1 database and atomic batch API](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [Miniflare web standards](https://developers.cloudflare.com/workers/testing/miniflare/core/standards/)
- [Drizzle D1 adapter](https://orm.drizzle.team/docs/connect-cloudflare-d1)
- [Better Auth Drizzle adapter](https://www.better-auth.com/docs/adapters/drizzle)
- [Better Auth email and password](https://www.better-auth.com/docs/authentication/email-password)
- [Better Auth security](https://www.better-auth.com/docs/reference/security)
- [Better Auth rate limiting](https://www.better-auth.com/docs/concepts/rate-limit)
- [SQLite date functions and subsecond epoch time](https://www.sqlite.org/lang_datefunc.html)
- [Workers ReadableStream](https://developers.cloudflare.com/workers/runtime-apis/streams/readablestream/)
- [Better Auth error options](https://www.better-auth.com/docs/reference/options#onapierror)
