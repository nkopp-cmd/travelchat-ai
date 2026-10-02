# Production user health

Nils paused the application-data D1 move on 2026-10-01. Production remains OpenNext on Cloudflare with Supabase application data.

## Daily check

Run `node scripts/check-production-health.mjs` from the stable main checkout, with `CLOUDFLARE_API_TOKEN` in the environment. The dependency-free command reads three public production routes and the last 24 hours of Cloudflare Workers Observability for exactly `localley-next`. It includes console errors and HTTP 5xx responses. It writes a private report at `~/.local/state/localley/production-health.json` and returns nonzero if public health fails or logs cannot be read. Existing recorded errors remain visible in the report even when public uptime passes. A limit-sized result, or a reported match count above the returned count, is marked truncated. Read query sampling and coverage warnings before interpreting any ranking; fewer than500 events does not prove complete coverage.

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

This increment repairs the daily report's generic generation labels and its unclear counting unit. Seven new tests prove error classification, fallback-success limits, notification status separation, hostile-text exclusion and count preservation. The three existing photo-parser tests also pass. Required CI now runs every production-health test. Private production readback: `users-first-u3-error-classes-candidate-20261001.json`.

No Worker code, provider request, billing setting, source row or database schema changes. Release the host-side script by pulling the verified merge into the stable app checkout and running the existing daily service. Its timer already uses that checkout. Keep Worker93f34779 / deploymentd9cfd015 at100%, rollback58e7dadb. U3 remains open for the source, primary-format and notification storage repairs; do not tick it from this diagnostic improvement.

Advisor review found no P0/P1. Its P2 wording correction is included: OpenAI may run directly when GLM is unavailable, so its class says "OpenAI trip format failed". A failed GLM retry can appear as `generation_request_failed`, not `openai_invalid_json`; neither absent class proves retry success. The final generation error prefix has a separate fixed class and regression test. Worker raw-output logging remains a separate repair; this report does not persist it.

## Generation diagnostic release — 2026-10-01 18:14 UTC

PR290 merged `a9f0d1fb411dd1988adac722115d0e415d173af6` after required self-hosted CI `36903337756` passed on final head `239fece`. The standard and corridor parse failure logs now retain only fixed labels and bounded content length. A shared JSON boundary replaces syntax errors that can echo model fragments with a fixed error. Primary GLM failures retain a fixed fallback reason. Generated-day validation has a fixed message; the final route failure emits one fixed event and the same internal-error response.

Advisor review of `85eb0f8` found no P0/P1 and verified parse/fallback/report compatibility. Its existing generated-day and outer SDK-object leak suggestions were included in final head `239fece`. Final focused tests26, TypeScript, ESLint and diff checks passed. After merge, the26 application tests and10 diagnostic tests passed again on the exact release tree. The first build refused an external node_modules symlink. Pinned local dependencies fixed that cause; the second merged OpenNext build passed. No application source, prompt, model choice, token limit, quota, grounding, provider dispatch, story pipeline, source row or schema changed beyond the stated diagnostics.

Account guard passed for nilskopp. Normal OpenNext deployment `d39a5358-8601-4902-adad-c39b75cb7837` released Worker `a548f24e-1f17-4021-a830-219074baa337` at18:14:13UTC,100%. Rollback is `93f34779-7182-4158-b564-86546800ce33`. Four real curl checks (home, sign-in, cities, pricing) returned200; the stable daily service returned success/Exec0. Publication receipt `055d92f500f2` closed from deployment readback.

The first no-cost validation harness expected uppercase `VALIDATION_ERROR`. Localley's actual error contract is lowercase `validation_error`; its response was not retained. The builder stopped and did not count that failed assertion as live acceptance. On the new continuation, the source contract was read first. One controlled malformed JSON request then returned400 with the exact `validation_error` code and `Request body must be valid JSON` message at18:44:41UTC. The response was retained before assertion. This path returns before quota, application-data queries and providers; it creates no user/trip and makes no model/photo request. API readback confirmed the same Worker at100%.

Private evidence: `users-first-u3-privacy-{build,build-second,deploy}-20261001.log`, `users-first-u3-privacy-release-20261001.json`, `users-first-u3-privacy-validation-20261001.json`. The release notes and malformed-request check certify the bounded diagnostic change, not a new successful model generation. Historical Cloudflare events remain; no provider-failure event was induced after deployment. Photo source conflicts, primary provider JSON failures and notification schema activation remain open. U1 Gmail placement remains NEED480, SQL access NEED519; Stripe test checkout remains conditional. D1 application-data migration stays paused.

Fresh shared screenshot.sh checks returned200 on desktop1440×900 and mobile390×844 with no horizontal overflow. Both top screenshots were inspected. These are public sign-in render checks, not another signed-in or received-email journey. Private `users-first-u3-privacy-signin-20261001/report.json` retains them. The stable daily service passed at2026-10-01T18:45:08.969Z with logs available, public200 and39 events; timer active. Native sync remains disabled/inactive with its retirement decision in the root plan.

## Targeted source mitigation — 2026-10-01 19:05 UTC

The identified market source `00fa7ad9-3ef8-43ae-849b-fafd8c0b7ac0` is now quarantined. PR292 (`9b439b9`, required CI36910696132) released the reviewed photos-only CAS command. Apply receipt `a415fb4d336f` and exact live readback prove one row changed three rejected references to zero while every non-photo field and two control rows stayed unchanged. Its real hosted gallery returns404/unavailable with no Google dispatch; a fresh anonymous visibility-filtered query excludes it. The source venue remains intact pending verified enrichment; photos are not restored.

Four public paths returned200. The Worker remains `a548f24e-1f17-4021-a830-219074baa337` at100%, deployment `d39a5358-8601-4902-adad-c39b75cb7837`, rollback `93f34779-7182-4158-b564-86546800ce33`; this operational source release needs no runtime redeployment. Details, retained rollback, private backup hash and limits are in `docs/SOURCE_PHOTO_REPAIR.md`. No new signed-in journey or all-source health claim. Discovery caches can retain the old row for300seconds; current gallery no-store refuses it. Historical reports are not erased. Primary-format failures and notification SQL remain open; full U3 is unchecked.

The stable daily service passed again at19:07:50UTC (Result=success, ExecMainStatus=0), with public200/logs available/38events/no truncation. Its historical primary/source/notification groups remain visible; the count change is not proof of fewer failed users. Private `users-first-market-photo-final-health-20261001.json`. Evidence PR initially triggered no CI because these two records were absent from workflow path filters. Add both explicit records so future operational evidence changes receive the same required verification; no runtime behavior changes.

## Query coverage correction — 2026-10-01

A fresh stable report at19:18:32UTC returned only four groups while a separate console query still found three earlier primary-format failures. Same-timeframe comparisons at19:22:21UTC returned38events for the combined and console filters (ABR1), but one event for the HTTP filter (ABR10). The earlier report omitted query sampling and matching counts, so absence or changing counts cannot prove a repair. No new provider or user request was used to induce these errors; existing logs were inspected without retaining model text.

Cloudflare documents `statistics.abr_level` as query sampling (absent means1), separately from ingestion sampling. The corrected report retains only finite bounded numeric `querySampling`/`matchingEventsReported`, fixed `coverageWarnings`, and `rankingScope: returned_events_only`. It marks an incomplete event result when the provider reports more matches than returned, or the500event limit is reached. It never scales the returned class counts by ABR. Even ABR1 does not prove ingestion coverage or unique failed users. Unknown/hostile values remain unknown; no raw query, exception, credential or model payload enters coverage fields. Source: [Cloudflare telemetry query API](https://developers.cloudflare.com/api/resources/workers/subresources/observability/subresources/telemetry/methods/query/).

The ABR1 comparison's top five groups are gallery failure23, primary trip format failure3, notification unavailable5032, dashboard connection loss2 and notification failure5002. These are returned log events, not users. Known source conflicts are quarantined with guarded backups; notification storage still needs NEED519 SQL access. Primary-format root cause remains unproven: the retained logs lack stop-reason/token metadata. Do not change a provider or parser from that absence. Paid verification remains prohibited while the shared week is USD30.85/25 (NEED527).

Seven coverage tests plus ten existing error/photo tests passed through run-heavy; Node syntax/diff checks passed. The first repository advisor review reached its turn limit and is not counted as a pass. A second supplied-diff review found no P0/P1. Its missing-statistics safeguard is included: default ABR1 only within a recognized statistics object; an absent or malformed object remains unknown. Required self-hosted CI remains a separate gate. Release this dependency-free host script by pulling its verified merge into the stable app checkout and running the existing daily service. No Worker deployment, auth, source write, schema, model request or D1 change is included. Current Worker `a548f24e-1f17-4021-a830-219074baa337` / deployment `d39a5358-8601-4902-adad-c39b75cb7837` at100%, rollback `93f34779-7182-4158-b564-86546800ce33`; full U3 stays open.

### Verified host release — 2026-10-01 19:43 UTC

PR294 merged `1fb157b8fabdc4ae75e30a081c508385925beeab` after final required self-hosted CI `36915004008` passed7m5s on `9f43dae`. The supplied-diff advisor found no P0/P1; its missing-statistics safeguard and seventh coverage test are included in that final head. All17focused diagnostic tests, syntax and diff checks passed. Initial review exhaustion is not counted as a pass. The feature branch and squash merge trees match.

Pulling the verified merge released this host script into the existing service's stable WorkingDirectory. At19:43:00UTC the daily service returned Result=success/ExecMainStatus=0, three public200, logs available,38returned/matched events, ABR1/sampledfalse, returned-event ranking and the explicit ingestion-warning. Both new live fields have the documented shape; older reports lacking them do not establish query coverage. The active timer's next run is2026-10-02 07:18:12UTC.

Read-only deployment verification at19:44:34UTC confirmed unchanged Worker `a548f24e-1f17-4021-a830-219074baa337` at100%, deployment `d39a5358-8601-4902-adad-c39b75cb7837`, rollback `93f34779-7182-4158-b564-86546800ce33`. No Worker deployment is needed for the host-script release. Private `users-first-u3-coverage-merged-health-20261001.json` and `users-first-u3-coverage-release-20261001.json` retain actual proof, mode600. Full U3 remains open; no new provider call, source/schema/auth write or D1 work ran.


## U2 received-email login — 2026-10-02

Both real production sign-in forms now have received-email-to-browser acceptance. A fresh disposable session inbox received exactly one requested magic link per viewport. Desktop1440/mobile390 opened their received HTTPS app links and reached the verified owned dashboard, with zero script errors or overflow. Both rendered screenshots were inspected. No D1 token shortcut, new paid model/photo call or customer account was used. Exact cleanup removed the owned auth/session/profile/subscription rows and both received messages; both admin mappings remained one each. See [the complete auth evidence](AUTH_BETTER_AUTH.md#received-link-browser-acceptance--2026-10-02-0130-utc).

Current Worker a548f24e at100% / deploymentd39a5358 / rollback93f34779 is unchanged. Stable daily service passed with public200/logs available. Historical errors remain visible and are not proof of current failed users. This evidence closes U2's received-link gap using the retained earlier trip/chat/map action evidence; checkout is conditionally skipped because only live Stripe keys exist. U1 Gmail placement and U3 storage/provider repairs remain open. No runtime release or D1 data switch is claimed for these documentation changes.
