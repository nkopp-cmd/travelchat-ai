# Local Auth Proof

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
| `GET /api/session` | Verified user ID and trusted owner mapping, without session credentials |
| `POST /api/account/new` | Explicitly create a server-owned UUID owner; requires an empty JSON object |
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

## Verification Evidence

The final 2026-09-08 check passed type generation, TypeScript, ESLint, bundle generation, tests, and the package check.
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
