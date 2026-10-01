# Production user health

Nils paused the application-data D1 move on 2026-10-01. Production remains OpenNext on Cloudflare with Supabase application data.

## Daily check

Run `node scripts/check-production-health.mjs` from the stable main checkout, with `CLOUDFLARE_API_TOKEN` in the environment. The dependency-free command reads three public production routes and the last 24 hours of Cloudflare Workers Observability for exactly `localley-next`. It includes console errors and HTTP 5xx responses. It writes a private report at `~/.local/state/localley/production-health.json` and returns nonzero if public health fails or logs cannot be read. Existing recorded errors remain visible in the report even when public uptime passes. A 500-event result is marked truncated; do not infer an exhaustive count from it.

The report records paths, statuses and fixed error classes. `top5` ranks path/status/class groups; `errorClasses` groups the full result across paths, retaining status counts. `countingUnit` explicitly identifies log events, not requests or users. A console error and invocation event can describe the same request. Never sum these counts as failed journeys or infer that a requested fallback succeeded. It omits request headers, URL queries, tokens, emails, user identifiers, and raw source payloads. Validated requested spot UUIDs are retained only in the bounded `photoFailures` diagnostic group. Cloudflare observability already stores production logs with 100% sampling; the API read verified enabled logs, persistence and invocation logging.

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

## Bounded photo failure diagnosis

The gallery emits one `[spot-photos]` event for each unavailable response. Its fields contain the validated requested spot UUID, a fixed reason, HTTP 502/503/504 and an optional numeric upstream status. It never emits provider bodies, photo URLs, keys, email addresses, or user IDs. Gallery statuses, venue identity checks, and attribution requirements remain unchanged.

The daily report accepts only this bounded format, rejects malformed or oversized events, and retains at most 20 grouped source failures. Other raw log text remains excluded. An early failure can contain a valid requested UUID before source existence is confirmed. Historical HTTP failures without this new event cannot identify their source retroactively. `observedEvents` and `top5` count log events; a console error and its HTTP invocation can count separately. `photoFailures` counts only the structured console event. This change supports targeted source repair; it does not claim every source photo is healthy.

Local checks: 42 public/candidate gallery tests, three hostile-input parser tests, focused ESLint, TypeScript, script syntax, and diff checks passed. Required CI and production acceptance will be recorded after release.

## Photo diagnostics release — 2026-10-01 16:24 UTC

PR #286 merged `4b0d466`, required self-hosted CI `36890214205` passed in 5m32s. The merged OpenNext production build and nilskopp account guard passed. Deployment `d9cfd015-9ec8-4b7d-88d4-80ccf8f733a3` runs Worker `93f34779-7182-4158-b564-86546800ce33` at 100%; rollback is `58e7dadb-406b-4e48-a7da-f25683cbf30c`. Supabase application data and Better Auth D1 are unchanged.

Four public requests (home, sign-in, city catalog, pricing) returned 200. Shared desktop/mobile sign-in screenshots returned 200 without overflow and were inspected. The prior quarantined source gallery remains 404. The first shared-listing candidate also returned 404 because its broad Local Scene name is hidden; this did not exercise the new logger. Applying the actual public-quality filter to retained source data found a visible market pair with a shared listing and points 4.177 km apart. Current live REST reads confirmed both records before the bounded probe.

One request to public source `00fa7ad9-3ef8-43ae-849b-fafd8c0b7ac0` returned 502 with no photos. The real Cloudflare console event passed through the daily parser: the report retained exactly that requested ID, `listing_coordinate_conflict`, status 502, count 1. No raw provider body, URL, credential or user identifier entered that group. This proves production logging and parsing while keeping the identity guard. The source itself still needs a verified correction; no data was changed in this release.

At 16:28 UTC the daily service completed successfully with public routes 200 and logs available. Top five event groups were gallery HTTP502 (24), generation server errors (2), intentional notification PATCH503 (2), dashboard lost connections (2), historical notification HTTP500 (2). These are event counts, not distinct users or requests. The new structured gallery event is recorded separately. The successful earlier trip generation used fallback after primary JSON parsing failed; no blind provider switch or paid retry is claimed.

Private proof: `users-first-photo-diagnostics-{release,http,public-http,final-health}-20261001.json` and `users-first-photo-diagnostics-signin-20261001/`. Publishing receipt `2a4eaeeda1df` closed after deployment verification. Both bounded gallery receipts (`26a3dbfd6f9d`, `8db0057ffe65`) closed with received responses; conservative USD0.10 remains reserved. A local receipt-ID placeholder was corrected after the second reply without another network request.

U1-U3 remain open. Gmail placement, notification SQL activation and Stripe test checkout still lack evidence. Primary generation format failures and newly identified source conflicts remain independent work. The native venue sync timer stays disabled/inactive; its recorded retirement remains in the root cutover plan.

## U3 daily diagnosis — 2026-10-01 17:31 UTC

The stable daily service passed at 17:27 UTC (Result=success, ExecMainStatus=0). The candidate classification script then read the same production source at 17:31 UTC: three public routes200, logs available,39 events, no truncation. This is a read-only production query, not a new application release.

| Top path/status group | Log events | Evidence and next repair |
| --- | ---: | --- |
| Venue photo request failed,502 |24| Historical events lack a source reason. The separate new structured event identifies source00fa7ad9-3ef8-43ae-849b-fafd8c0b7ac0 with listing_coordinate_conflict. Preserve the identity guard; correct only verified source data. |
| Primary trip format failed,unknown status |3| Legacy GLM parse failures now have a fixed class. Successful owned journeys separately prove fallback returned200; this log alone does not prove success. Provider repair remains open; no paid retry or provider change ran. |
| Notification preferences unavailable,503 |2| Expected refusal while tables are absent. The UI already explains unavailability. Draft PR283 prepares storage; NEED519 tracks the missing SQL access. |
| Dashboard connection lost,unknown status |2| Historical events include controlled browser probes. Actual recent desktop/mobile journeys passed. No new network root cause or repair is claimed. |
| Notification preference request failed,500 |2| Historical genuine failures remain separate from the503 refusal. Approved schema activation still needs SQL access. |

Full class totals additionally retain three old auth profile-sync failures, one missing application record, and a third network event outside the dashboard group. Earlier profile/navigation repairs and their real signup/login evidence remain above. A24-hour report includes earlier versions and controlled probes; it does not prove that these errors persist on the current Worker.

This increment repairs the daily report's generic generation labels and its unclear counting unit. Six new tests prove error classification, fallback-success limits, notification status separation, hostile-text exclusion and count preservation. The three existing photo-parser tests also pass. Required CI now runs every production-health test. Private production readback: `users-first-u3-error-classes-candidate-20261001.json`.

No Worker code, provider request, billing setting, source row or database schema changes. Release the host-side script by pulling the verified merge into the stable app checkout and running the existing daily service. Its timer already uses that checkout. Keep Worker93f34779 / deploymentd9cfd015 at100%, rollback58e7dadb. U3 remains open for the source, primary-format and notification storage repairs; do not tick it from this diagnostic improvement.
