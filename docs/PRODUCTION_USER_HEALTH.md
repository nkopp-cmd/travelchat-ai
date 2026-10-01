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
| Email verification profile update missing avatar_url column | 1 | Addressed by profile hook PR #276, pending the recorded hosted release proof. |

The remaining two events were the same missing-column hook failure during signup and magic-link verification. Client-side React hydration error 418 was also captured during the desktop journey; it is not present in server-only telemetry. The signed-in desktop and mobile dashboard, spots, chat, pricing and settings pages each returned 200 without document overflow. This is page-load proof, not completed generation/chat/checkout acceptance.
