# Cloudflare Readiness

Assessment date: 2026-09-07. No hosting, DNS, account, or database changes were made.
This supersedes the earlier decision to keep Vercel indefinitely in `seoul-discovery.md`.
The target is Cloudflare where practical, not a forced replacement of every existing service.

## Preview

Local preview: `http://localhost:3001/spots?city=seoul&view=map`.
The preview binds to loopback. Remote browsers need local port forwarding.
No public preview deployment or tunnel was created.
Screenshot: `test-results/seoul-localhost-map.png`.
Playwright received HTTP 200 and observed 24 pins from 390 Seoul records.
Billable photo proxies were blocked during screenshot capture.
The earlier HTTP 500 involved a localhost proxy reset.
Starting with IPv4-first DNS and hostname localhost resolved it without app changes.

## Health Baseline

### Maintenance Update

The following results supersede the initial baseline table below.

Latest creator slice: Korean video exports, immutable submission captions, and carousel/video controls are implemented locally.
The full suite passes 1,560 tests with one opt-in integration skipped, and the production build passes.
Thirty-one PostgreSQL integration groups and seven browser tests pass.
The simulated component preview uses the real UI but does not verify production authentication or provider/storage access.
`20260907080754_story_video_reservation_snapshot.sql` is now required with the three earlier media migrations.
The local font must ship with the encoder and its license. No Cloudflare runtime or hosted activation was verified.

Latest delivery slice: the processor, isolated encoder, private artifact storage path, and owner-only download route are connected in code.
The full suite passes 1,482 tests, with one opt-in integration test separately verified against the real Docker encoder.
Twenty-four local PostgreSQL integration groups and the regular production build pass.
Actual provider and storage boundaries remain mocked in the encoder integration.
The encoder targets an approved Linux Docker host, not standard Workers or Vercel functions.
Its CLI is not deployed or scheduled. Media migrations and the private bucket remain unapplied to Localley's database.
See `story-studio.md` for activation requirements and the untouched $20 spending ceiling.

Video-job follow-up: 1,390 tests and the regular production build pass.
The new H3 submission/status routes have ownership checks, durable reservations, and database-controlled zero-default budgets.
Twenty video-ledger integration groups pass locally. No hosted migration or live generation ran.
`20260907064632_story_video_jobs.sql` is required before activating those routes.
The controlled download helper is tested but not connected to encoding or delivery.
Neither this slice nor its Node HTTPS downloader establishes Workers compatibility.

Latest story follow-up: 1,189 tests, the regular production build, and ten PostgreSQL integration groups pass.
The durable image ledger and pending-client behavior are implemented locally.
The route now requires `20260907060610_story_image_jobs.sql` for uncached image generation.
That migration has not been applied to Localley's database. Apply and verify it before deploying the new route.
The MiniMax H3 adapter and local burned-text video proof do not constitute a hosted video service.
See `story-studio.md` for exact scope, evidence, and remaining release gates.

Story integration follow-up: GPT Image 2 is wired locally but remains disabled by default.
All 1,009 tests and the regular production build pass after the image routing and usage safety changes.
See `story-studio.md` for the exact rollout gates and zero-spend record.
This does not establish Cloudflare or live story-generation compatibility.

Latest follow-up: removed the inactive `next-pwa` build integration and dependency.
This removes a Webpack-only path that could overwrite the push worker and cache private responses.
The existing Turbopack production worker was push-only; no active private-cache leak was demonstrated.
The application now explicitly registers that same `/sw.js` root worker without requesting notification permission.
Activation clears only known legacy caches and preserves unrelated caches.
The worker still has no fetch handler. It does not provide offline app or private-data access.
Subscription existence checks no longer wait indefinitely for a missing worker.

All 733 tests pass across 103 files after this follow-up. The production build also passes.
An isolated Chromium test verified real worker activation, legacy-cache cleanup, and offline private-response failure.
This test did not exercise a full production application or live push delivery.
Existing subscription continuity depends on the same registration being updated, not unregistered.
Cleanup takes effect only after users receive and activate the updated worker.

Destination cards now separate status badges from names and allow compact long names to wrap.
Three-width browser checks passed, including selection, keyboard use, geometry, and compact templates.
The earlier destination badge overlap is resolved.

- Upgraded Next.js to `16.3.4`, React and React DOM to `19.2.8`, and Clerk to `6.39.6`.
- Updated `eslint-config-next` to `16.3.4` and refreshed the lockfile.
- The earlier Clerk release failed the new Next build. The same-major Clerk update resolved that error.
- Restarted the local preview and regenerated stale development types after the upgrade.
- Production build passed on the final package set, including its TypeScript stage.
- All 725 tests passed across 101 files on the final package set.
- Full lint now reports three errors and 66 warnings. The newer rules introduce additional navigation warnings.
- The three remaining errors are in untouched story files. No lint rules were disabled.
- Generated browser artifacts are excluded from lint, not application source.
- Strict map browser checks passed at 390, 900, and 1440 pixels on the updated stack.
- The real anonymous review GET returned HTTP 200 after fixing its query.

The review query requested a nonexistent foreign key and nonexistent author columns.
It now looks up public usernames through `users.clerk_id` without a database migration.
Review errors remain explicit failures, not fabricated empty results.
Anonymous GET access is allowed; review writes and helpful votes remain protected.
The review UI supports retry and rejects stale responses.

Shared Leaflet and Kakao popups now treat source text as text rather than HTML.
Tests cover hostile titles, descriptions, and bilingual names.
Lifecycle fixes cover chat history, route previews, live announcements, map hydration, and autocomplete readiness.

A complete `npm audit` still timed out.
A direct registry advisory request found 31 advisory records for the old Next `16.0.10` release.
That is not a count of all vulnerable application dependencies.
Exact-version queries returned zero records for Next `16.3.4` and React/React DOM `19.2.8` at assessment time.
Transitive dependencies and the full production dependency set remain unaudited.

Build warnings remain for middleware naming, edge runtime, and a caught dynamic-render signal in the itinerary page.
A successful build does not verify PWA generation, cache privacy, payments, or story PNG output.
Those remain release gates.

### Initial Baseline

The latest repository commit is dated 2026-09-01. The repository has received recent work.
This does not prove the live deployment includes that work.

| Check | Result |
| --- | --- |
| Full unit suite | 661 passed across 91 files after a test isolation fix |
| TypeScript | Passed with `--noEmit --incremental false` |
| Full lint | Failed: 27 errors and 59 warnings |
| Dependency security audit | Timed out twice; no security conclusion available |
| Production build | Not run; build compatibility remains unverified |
| Map browser checks | Prior three-width run passed; restarted local preview returned HTTP 200 |
| Live payments, login, saves | Not exercised in this assessment |

The two initial test failures constructed real server SDKs inside jsdom.
Provider constructor mocks now isolate the routing tests without weakening production security.
Only `__tests__/lib/llm-orchestrator.test.ts` changed for that fix.

## Maintenance Priorities

1. Replace raw HTML interpolation in shared Leaflet popups with safe text nodes.
2. Audit anonymous review access and distinguish failed reads from empty review lists.
3. Verify the production bundler, PWA registration, cache privacy, and service-worker update behavior.
4. Clear lint failures in small tested changes. Do not disable rules globally to obtain a green result.
5. Complete a dependency advisory audit before selecting supported patch versions.
6. Verify real authentication, saves, subscriptions, webhook signatures, retries, and usage limits.
7. Restore verified booking destination mapping without restoring fake inventory.
8. Make the release map check require actual pins; keep empty-state tests separate.

Evidence:

- `components/ui/leaflet-map.tsx:156`: title and description enter an HTML popup string.
- `components/itinerary/itinerary-map.tsx:83`: itinerary text reaches shared markers.
- `middleware.ts:23`: spot pages are public, but review API reads are not allowlisted.
- `components/spots/review-list.tsx:63`: public details request those reviews.
- `next.config.ts:14`: next-pwa uses a build integration that needs bundler verification.
- `next.config.ts:21`: broad Supabase caching warrants a private-data and logout review.
- `package.json:7`: production uses plain `next build` with Next 16.
- `lib/viator.ts:78`: numeric provider destination IDs are required.
- `e2e/spots-map.spec.ts`: missing real results can be annotated without failing the test.

These are static findings, not proof of a production exploit or outage.
The new discovery map already avoids the raw HTML popup path.
The protected story-image pipeline remains unchanged, including its lint findings.
Its specific change restrictions still apply during maintenance and migration.

## Target Architecture

| Layer | Target | Decision |
| --- | --- | --- |
| Web application | Cloudflare Workers | Prove Next API and runtime compatibility before switching traffic |
| New licensed content files | R2 | Start with new content; retain old URLs until an explicit migration |
| Scheduled ingestion | Cron Triggers and Queues where needed | Require idempotency and prevent duplicate schedules |
| Geography and transactional data | Existing Supabase PostgreSQL | Retain PostGIS, RLS, transactions, and advisory-lock behavior |
| User authentication | Existing Clerk | Avoid changing user identity during the hosting migration |
| Payments | Existing Stripe | Preserve customer IDs, prices, subscriptions, and webhook verification |
| Cache and rate limits | Existing services initially | Migrate only after checking consistency and atomic operations |
| Stable story renderer | Existing runtime initially | Move only after equivalent output and failure tests pass |

D1 is not a direct replacement for this PostgreSQL database.
Avoid duplicating core records into D1 merely to increase Cloudflare usage.
Hyperdrive is an option for direct SQL connections, not a wrapper for existing Supabase HTTP calls.
Do not add it unless direct SQL access provides a measured benefit.
R2 storage and Cloudflare Images are different products with different costs.
Do not assume migration makes image transformations or upstream photo requests free.

## Framework Choice

See `cloudflare-compatibility.md` for the executed static scan and attempted isolated build.
The scan described the older dependency set; the updates above remove its React version mismatch.
Next `16.3.4` also satisfies the assessed OpenNext version range.
Neither change proves Workers runtime compatibility.
The tool denied creation of the isolated build directory. No Workers build or runtime preview ran.
The permission restriction must be resolved before that experiment resumes.

Current official documentation recommends vinext for Next.js on Workers.
It also identifies vinext as beta and requires compatibility review for existing production applications.
OpenNext remains an alternative adapter, with its own feature limits.

Do not choose by framework preference alone.
Run a separate compatibility experiment before adding either adapter to the application.
Preserve the current deployment path while comparing results.
Do not rewrite Localley as a new Vite SPA during a hosting migration.

The experiment must cover:

- Clerk middleware, sign-in redirects, cookies, and server actions.
- Streaming chat and cancellation.
- Supabase access and separation between anonymous and authenticated caches.
- Image loading, signed URLs, and provider URL restrictions.
- Stripe raw-body signatures and safe webhook replay.
- Node dependencies, bundle size, memory, and CPU limits.
- PWA behavior and removal of obsolete service-worker caches.
- Error monitoring and server-side stack traces.
- Story PNG rendering without modifying its protected pipeline during the assessment.

The advisor consultation hit its session limit. This migration has not received advisor sign-off.

## Delivery Sequence

1. Complete the health baseline and urgent security fixes.
2. Build an isolated Workers compatibility preview with test credentials and a reviewed budget.
3. Compare vinext and OpenNext only where compatibility requires the comparison.
4. Move new storage and scheduled work separately from web hosting.
5. Disable each old schedule before enabling its replacement.
6. Validate the Workers preview against the current deployment using the same acceptance cases.
7. Switch production traffic only after explicit release approval and a tested rollback procedure.
8. Retire Vercel only when all remaining routes have a verified replacement.

Keep the Seoul map within `/spots` through these stages.
This avoids maintaining a second navigation system or a separate city application.
Build events and stories against stable content contracts, not hosting-specific UI components.

## Release Gates

### Payment And Save Verification

Latest follow-up: all 848 tests pass across 106 files. The regular production build passes.
This includes 115 new offline regression cases for saved places, customer ownership, checkout, and webhooks.
No live charges, subscription changes, emails, or database writes ran during these checks.

Implemented protections:

- Saved-place routes reject malformed bodies and invalid IDs before database access.
- Save lookups report database failures instead of falsely reporting an unsaved place.
- Repeating an existing save succeeds even when the account has reached its quota.
- Reads and deletes retain authenticated ownership filters; inserts ignore supplied ownership fields.
- Checkout prefers the stored user/customer mapping and verifies customer metadata ownership.
- An email match cannot transfer another user's Stripe customer or claim an unowned customer.
- Billing portal creation verifies customer ownership.
- Checkout links customer identity without resetting paid tier or subscription status.
- Blank configured price IDs cannot grant Premium.
- Webhooks verify raw signatures before database access, including expired and tampered payload cases.
- Database write failures return HTTP 500 rather than acknowledging success.
- Deletion and invoice writes match user, subscription, and customer identifiers.
- Checkout completion derives status from the retrieved subscription rather than forcing active access.
- Invoice parsing accepts current parent references and shipped legacy references, including expanded IDs.
- Period parsing prefers item-level periods with a legacy fallback.
- Email queries use the actual `username` field, not the nonexistent `users.name` field.

These are bounded fixes, not payment release approval.
Remaining payment gates:

- Durable event deduplication, ordering, and concurrency protection are not implemented.
- Non-deleted subscription upserts can still replace newer state when events arrive late or concurrently.
- Email delivery can repeat after retries; no durable email outbox exists.
- Verify `users.email_preferences` in the target database. Local migrations do not establish its presence.
- Missing email preferences currently produce an explicit retryable failure, not a silent opt-in or swallowed error.
- Audit legacy customer mappings before release. Unowned or mismatched metadata now fails closed.
- Verify deployed RLS and concurrent save quotas; route mocks do not establish those guarantees.
- Validate payment and save flows with dedicated test accounts before production traffic changes.

### Remaining Release Requirements

- Supported and patched dependencies, reproducible installs, and a successful production build.
- No unresolved high-risk security findings.
- Real pin selection, details, login, saves, and payment tests on the target runtime.
- No private response caching across users or after logout.
- Verified redirects, canonical domain, webhooks, and scheduled jobs.
- Cost measurements that include transition costs and retained external services.
- No duplicate job execution or duplicate payment effects during cutover or rollback.
- Documented restoration of the old origin without reversing database writes.
- Explicit permission before changes to the protected image pipeline.

## Sources

Retrieved on 2026-09-07:

- https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/

These pages describe platform support, not verified compatibility with Localley.
