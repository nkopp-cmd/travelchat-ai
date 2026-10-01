# Production user health

Nils paused the application-data D1 move on 2026-10-01. Production remains OpenNext on Cloudflare with Supabase application data.

## Daily check

Run `node scripts/check-production-health.mjs` from the stable main checkout, with `CLOUDFLARE_API_TOKEN` in the environment. The dependency-free command reads three public production routes and the last 24 hours of Cloudflare Workers Observability for exactly `localley-next`. It includes console errors and HTTP 5xx responses. It writes a private report at `~/.local/state/localley/production-health.json` and returns nonzero if public health fails or logs cannot be read. Existing recorded errors remain visible in the report even when public uptime passes. A 500-event result is marked truncated; do not infer an exhaustive count from it.

The report records paths, statuses and sanitized error summaries. It omits request headers, URL queries, tokens, emails, UUIDs, and raw source payloads. Cloudflare observability already stores production logs with 100% sampling; the API read verified enabled logs, persistence and invocation logging.

The tracked units in `ops/` run at 07:15 UTC daily, with at most five minutes of random delay. Their WorkingDirectory is the stable app checkout, never a disposable worktree. Install them into `~/.config/systemd/user/` only after merging this script to main; reload the user daemon, enable the timer and start the service once. Read the report during each builder continuation and fix the highest-impact user-visible errors first. This service sends no messages and changes no application data.

## First observation — 2026-10-01 03:00 UTC

All three public health requests returned HTTP 200. The production-only query returned 20 matching events without truncation. Its top five groups were:

| Group | Events | State |
| --- | ---: | --- |
| Listing photo endpoint HTTP 502 | 13 | Open; preserve listing identity and attribution checks while investigating. |
| Notification preference endpoint HTTP 500 | 2 | Open; production settings cannot load these preferences. |
| Trip save missing application user | 1 | Reproduced after real signup; profile repair changed the same owned request from 404 to 200. |
| Dashboard network connection lost | 1 | Observed during the first browser navigation timeout; distinguish a canceled probe from a real user failure. |
| Email verification profile update missing avatar_url column | 1 | Fixed by PR #276 (`1b1a0d8`), required CI `36807346959`, production version `049a6fbe-2988-4d1a-881c-7c221ddc5d50`. Fresh hosted signup created exactly one profile and one Free subscription; real confirmation delivery passed SPF/DKIM/DMARC. |

The remaining two events were the same missing-column hook failure during signup and magic-link verification. Client-side React hydration error 418 was also captured during the desktop journey; it is not present in server-only telemetry. The signed-in desktop and mobile dashboard, spots, chat, pricing and settings pages each returned 200 without document overflow. This is page-load proof, not completed generation/chat/checkout acceptance.

## Users-first acceptance and bounded repairs

On 2026-10-01 the new daily timer started successfully from main after PR #277 (`aeb8449`), required CI `36808698082`. The first report had three public HTTP 200 responses, logs available, 23 events and no truncation. The obsolete native sync timer remains disabled/inactive; the cutover plan records its retirement in Attempt 62.

Desktop (1440×900) and mobile (390×844) production login, dashboard, spots, chat, pricing and settings loaded successfully. Real chat sends returned HTTP 200 from GLM 5.2 without fallback. Both discovery maps rendered 24 pins; selecting a pin displayed its card without horizontal document overflow. Screenshots and private received-email reports remain outside Git. A History-only one-day trip returned a truthful 422 for insufficient verified coverage before consuming generation quota. A broader Food & Dining request returned 200, saved a one-day Seoul Food Day with two grounded stops, and reopened with its schedule and map on both desktop and mobile. Do not count the rejected History request as a successful generation. Stripe credentials are live-only, so no checkout or charge is claimed.

Live REST checks proved `notification_preferences`, `notifications` and `push_subscriptions` absent (`PGRST205`). The notification setting correction displays an explicit unavailable state and removes misleading working controls. GET returns `available: false` with null preferences and private/no-store; an attempted PATCH remains a 503. Real database failures remain 500. Existing preferences are neither fabricated nor overwritten. Enabling this feature requires its separately approved production schema work; this change performs no migration.

One bounded Google listing lookup diagnosed the repeated photo 502: the saved “Daesin-dong Old Town” photo reference resolves to “Dongnimmun Arch (Independence Gate)”. The endpoint continues to reject contradictory listing coordinates/identity: that listing is 1.454 km from the stored point, beyond the 1 km gate. Do not remove this safety check or show that other venue's photos. A source correction remains open; this PR does not overwrite venue data or alter the stable story image pipeline.

## Checked production release — 2026-10-01 04:34 UTC

Repository `nkopp-cmd/travelchat-ai`, merged main code `71f9dc1`, Cloudflare OpenNext Worker `localley-next`, deployment `4c8acf2b-1836-41f0-968a-ff4c91ec69c2`, version `b66a792d-fa68-4db4-acda-3e60d9ed3329` at 100%. Rollback is `5a303f10-4e77-4cec-a19e-807030929066`. Application data remains Supabase; Better Auth remains D1. The D1 data move stays paused.

| Repair | Merge | Required CI | Checks |
| --- | --- | --- | --- |
| Honest unavailable notification controls, PR #278 | `799b65a` | `36810223144` | Seven route tests; live GET 200 available:false/private-no-store, PATCH 503; desktop/mobile status and help shown, no notification switches/push label. |
| Free viewer photo entitlement, PR #279 | `6a4d851` | `36811197168` | Ten hook tests; both real Free trip views made zero Pro-only photo lookup requests. |
| One conversation per question/reply pair, PR #280 | `e9079d9` | `36811754272` | Nine component tests; two real UI replies 200 from GLM 5.2; one created conversation, four alternating messages; durable REST read confirms one conversation. Owner-authenticated reads returned the four messages on desktop/mobile. |
| Single password callback navigation, PR #281 | `71f9dc1` | `36815008641` | Four real-SDK tests; real desktop/dashboard and mobile/owned-trip login each made exactly one document request, HTTP 200, no script errors/overflow. |

All required self-hosted checks passed. Focused lint, TypeScript, merged OpenNext build and nilskopp account guard passed. The three component/hook fixes and the auth fix received read-only advisor reviews without P0/P1 findings. Four www curl routes returned 200. The daily service completed with Result=success and ExecMainStatus=0 after this release.

The exact-text notification locator failed because the status div includes nested help text. Captured desktop/mobile DOM contained the message; an independent advisor confirmed the selector defect. The corrected role/status check passed on both sizes. Screenshots were inspected. Do not attribute those locator timeouts to absent notifications or claim all earlier hydration errors had the duplicate-navigation cause.

Exact cleanup removed only the two owned seed accounts: two trips, five conversations, eight messages, two usage rows, 24 auth sessions and two credentials. Owner-scoped app/auth reads returned zero remaining rows. Both real admin IDs retained exactly one auth and one app profile mapping. Three repaired real mappings remain intact. Owned runtime scripts, credential files and merged worktrees are removed after this evidence merges; private receipt reports and screenshots are retained with restricted permissions.

Remaining limits: Gmail inbox placement is unknown despite a controlled receiver score of 10/10 with SPF/DKIM/DMARC pass. Stripe keys are live-only, so no test checkout or real charge is claimed. Notification persistence requires separately approved schema work; honest unavailability is not feature completion. The diagnosed source photo mismatch and stored image 404s remain open. Keep venue identity checks and the stable story image pipeline. U1–U3 remain open until these limits have evidence.

## Source photos and fresh production journeys — 2026-10-01 10:30 UTC

Current release: PR #284 / `2177fa7`, required CI `36847108837`, deployment `a1b6362a-817a-42c3-aec5-3c38dd53fc17`, Worker `58e7dadb-406b-4e48-a7da-f25683cbf30c`, 100%, rollback `b66a792d`. [Source photo repair](SOURCE_PHOTO_REPAIR.md) records the exact one-row quarantine and guarded rollback. [Better Auth](AUTH_BETTER_AUTH.md#users-first-photo-release-acceptance--2026-10-01-1030-utc) records fresh UI journeys and cleanup. Both sizes loaded two fresh attributed itinerary photos without failed photo responses, script errors, or overflow.

Daily health check at 10:26 UTC passed all three public routes; 28 historical events were available without truncation. Top five groups: gallery HTTP502 (16), intentional notification PATCH503 (2), dashboard lost connections (2), pre-fix notification HTTP500 (2), trip lost connection (1). A repaired source gallery now returns 404 without another wrong-listing lookup. Fresh owned journeys have zero browser script errors. These observations do not erase the historical 24-hour groups or prove all gallery sources healthy.

Notification persistence remains open: its authorized additive migration is prepared on draft #283 with passing CI and local SQL proof, but live SQL access is missing. Do not claim storage works or enable controls early. Gmail placement and Stripe test checkout remain open. Native sync remains disabled/inactive; its decision remains in the root plan.
