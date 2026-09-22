# Cloudflare go-live gates

See `CLOUDFLARE_CUTOVER_INVENTORY.md` for the 2026-09-21 live source audit, verified private EU R2 backups and media transfer, identity mismatches, and full-product cutover requirements.
Available live Clerk/Stripe credentials and REST export access are confirmed; missing SQL access does not block the completed read-only export.

Public `localley.io` stays on Vercel until these pass. Do not point DNS at Access-protected preview.

## Ready on preview

- Catalog, map, saves, Better Auth, email preferences, trends pipeline
- Trips: create, catalog generate, duplicate, share, edit, delete
- Localley chrome (mark, glass, violet)

## Still required before cutover

1. Preview chat and explicit AI itinerary drafts use `gpt-5.6-luna` when `OPENAI_API_KEY` is bound. Full live-app generation parity, stories, billing, and admin remain unfinished.
2. Stories, billing, and admin are unported. The preview Worker CPU limit is 15s; each migrated workload still needs verification.
3. Hosted human sign-in and recovery on this shell.
4. Access is not consumer login. Remove it only after public Better Auth works.
5. Production SQL/import if live spots must move with the domain.
6. Backup, rollback Worker, and a verified `localley.io` switch.

Chat calls GPT-5.6 Luna with catalog facts and retains a catalog-only fallback.
The September 20 audit found that the first adapter used `redirect: "error"`, which workerd rejects before a provider request.
The replacement uses manual redirects, rejects redirect responses, bounds provider bodies, and accepts only completed Luna assistant output.
Native provider-path tests now cover success, incomplete output, refusals, malformed/oversized bodies, redirects, and no retry.
One real host adapter probe completed: `resp_06da74f5c0ce31fb016aaf76f1bd5887d2a1e2c272030807cb`, 82 input and 6 output tokens.
This is provider acceptance, not hosted account acceptance. The read-only Access identity cannot exercise chat POST.

Native chat now reserves each paid attempt in D1 before calling Luna (migration `0010_ai_requests.sql`).
Preview limits are 20 attempts per owner and 100 globally per UTC day, checked atomically with insertion.
Completed, failed, and uncertain attempts all count. Accounting outages block new provider calls and keep catalog fallback available.
API `aiStatus` distinguishes completion, daily limits, provider unavailability, and accounting faults.
These are persistent request limits, not exact token usage or subscription billing.
Migration `0011_ai_receipts.sql` adds provider IDs/status and nullable input, output, and cached-input counts for chat and itinerary attempts.
Incomplete and rejected outputs retain observed counts; absent or malformed metrics remain unknown. This is not billing settlement.
`POST /api/itineraries/generate` accepts explicit `mode:"ai"` and optional preferences. Default catalog mode remains non-AI.
Luna selects day order and unique published spot IDs; the server reconstructs names, coordinates and addresses from D1.
Unknown IDs, repeated venues, wrong day counts, incomplete output and insufficient coverage fail without saving a trip.
Persistence rechecks the session, owner mapping and spot visibility in one INSERT after the provider wait.
No automatic retry or paid-model fallback. Shared limits remain 20 owner/100 global attempts per UTC day.
Actual structured host probe: `resp_00016ba3d3417215016aafa39a085c87d28872bf08fe68135b`; 603 input/177 output/0 cached tokens; two valid days and six real catalog venues. No database write.
Hosted signed-in generation remains a separate acceptance check; the Access service identity is read-only.
Catalog-generated itineraries and basic share pages are not complete equivalents of the existing Localley product.

## Gap inventory — 2026-09-22

Live today: `https://www.localley.io` on Vercel, deployment `dpl_FA3tzDj3zDmxLGEFEjvoXv7d6rgg`, main `e96b003`.
Cloudflare target: Worker `localley-discovery-preview` at `https://preview.localley.io` (Access-protected), source `cloudflare/auth-proof`.
Main has 29 pages and 78 route handlers (`git ls-tree main app`). The native Worker serves one single-page app and 14 API route groups.
The native Worker is a rewrite, not a port of the Next.js app. Each row below needs new Worker code, D1 schema and tests.

Legend: **native** = on the preview Worker and hosted-verified. **partial** = some behavior only. **missing** = no native code.

### Public and account journeys

| Live feature (main) | Native state | Gate |
| --- | --- | --- |
| Landing `/`, explore, templates | missing (preview has one catalog view) | 4 |
| Spot list/detail `/spots`, `/spots/[id]` | partial: 8 reviewed Seoul spots, map, credits. Live has 3,295 rows (390 public Seoul) | 5 |
| Venue listing photos (`release/authentic-discovery`, never live) | native: PR149, hosted gate passed (`releases/native-listing-photos.md`) | 4 |
| Spot reviews, helpful votes | missing (0 source rows) | 4 |
| Social spot submissions, submit/status pages | missing (4 submissions, 10 media rows) | 4 |
| Saved spots | native (0 live source rows) | — |
| Trips: create, generate, edit, duplicate, share, delete | native (catalog-only and Luna drafts) | — |
| Trips: generate-v2 stream, revise, email, export, like, saved-itineraries | missing | 4 |
| Multi-city `/api/v2/trips/preview` | missing. Nils keeps sign-in on this route; do not merge `fix/multi-city-network-narrowing` | 4 |
| Chat with history (`/api/conversations*`, 115 conversations, 173 messages) | partial: Luna catalog chat, no stored history | 4, 5 |
| Stories: backgrounds, Satori PNG render, save/persist, notify, cleanup cron | missing. 222 media objects are in private R2 `localley-legacy-media`; no serving route | 2 |
| Pricing, subscription checkout/portal/status/webhook (Stripe) | missing | 2 |
| Guide/Connect onboarding, earnings, webhook | missing | 2 |
| Admin pages and 12 admin APIs | missing | 2 |
| Gamification, challenges, leaderboard, friends, notifications, push | missing (10 challenges, 6 user_challenges) | 4 |
| Profile, `/users/[username]`, settings (tier, usage) | partial: email preferences only | 4 |
| Geocode, cities, translate, recommendations, Viator, affiliates, OG images | missing | 4 |
| Sign-up, sign-in, recovery for the public | partial: Better Auth works for allowlisted preview emails behind Access only | 3, 4 |
| Email delivery | partial: Cloudflare `send_email` to one allowed address. Public mail needs a sender decision | 3 |

### Platform

| Item | Live | Native state |
| --- | --- | --- |
| Hosting | Vercel | Worker + static assets (preview only) |
| Database | Supabase PostgreSQL + PostGIS, 48 REST tables, 5,502 rows | D1, 15 application tables, 8 spots |
| Auth | Clerk, 5 users | Better Auth on D1; no Clerk import; claim flow proven on synthetic data |
| Rate limiting | Upstash Redis (did not answer from Vercel on 2026-09-22) and in-memory fallback | D1 counters for auth and AI; Workers rate-limit bindings for listing photos |
| Schedules | 4 Vercel crons (`vercel.json`) | 0 Cron Triggers. Hourly Scrapelet transfer runs from the VPS timer |
| Media | Supabase Storage `generated-images`, Pexels, Google proxies | Private R2 copies only; reviewed pilot JPEGs in static assets |
| Monitoring | Sentry | Workers observability logs (invocation logs off) |
| Webhooks | Stripe, Stripe Connect, Clerk | none |

### Data import

No import code exists yet. The source backup is complete and verified (see `CLOUDFLARE_CUTOVER_INVENTORY.md`).
Import must map 48 source tables to D1, keep owner strings and profile UUIDs, and keep the two unmatched historical owners.
Twelve itinerary rows need the R2 story-media projection because they exceed the D1 row limit.

### Branches

- `builder/seoul-story-studio` and `integration/story-studio` have no commits outside `cloudflare/full-migration`. Their story code is in the Next.js tree only.
  The 4 story migrations (`story_video_jobs`, `story_video_processing`, `story_video_reservation_snapshot`, `save_itinerary_snapshot`) are Supabase-only.
  On Cloudflare they become D1 migrations for a native story port. They need no Supabase production migration.
- `release/authentic-discovery` (`60ffc7c`, `4e38597`) failed its Vercel photo gate because Upstash timed out. The gallery is ported natively without Upstash and passed its hosted gate (PR149). Its spot-detail page, detail map and wording changes still need the native spot-detail view.
- `fix/multi-city-network-narrowing` stays unmerged by decision.

### Path decision for Nils

Most live API groups above are still missing after 14 native preview releases.
Two paths can retire Vercel:

- **A. Continue the native rewrite.** Final stack only (Workers, D1, R2, Better Auth). Longest path. Every row above needs a port.
- **B. Run the existing Next.js app on Workers first** (vinext built all 29 pages and 81 handlers in `docs/cloudflare-preview.md`).
  Keep Supabase and Clerk as external services for a short time. Then move data and auth in steps.
  This needs production secrets on a new Worker. That is a secret change and needs approval.

This inventory does not choose a path. Increments on this branch continue path A.
