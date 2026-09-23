# Localley on Cloudflare Workers (OpenNext) — path B

Decision: **2026-09-23, Nils chose path B.** Run the existing Next.js app (`main`) on Cloudflare Workers through
OpenNext (`@opennextjs/cloudflare`). Supabase stays as an external service for now.
The native rewrite on `cloudflare/full-migration` (path A) stays a separate, later track.

Auth decision: **2026-09-23, Nils: replace Clerk with Better Auth BEFORE the cutover** (easier login, free agent
testing, no external auth dashboard; house standard in `CyberLink/CLAUDE.md`). Better Auth stores users and sessions
in D1 (`AUTH_DB`), keeps the Clerk user ids, and replaces every Clerk call site. Details, preview test helpers,
the user migration and its approval checklist (A1–A6): `docs/AUTH_BETTER_AUTH.md`.

Production today: `https://www.localley.io` on Vercel, deployment `dpl_FA3tzDj3zDmxLGEFEjvoXv7d6rgg` (main `e96b003`).
That deployment is the rollback target. The Vercel project has **no Git repository connected** (Vercel API
`GET /v9/projects/travelchat-ai` returns `link: null`), so merges to `main` never deploy to Vercel.
Vercel deploys are manual CLI only. Do not deploy to Vercel.

## 1. What is in the repository

| File | Purpose |
| --- | --- |
| `wrangler.jsonc` | Top level = preview Worker `localley-next-preview` (workers.dev). `env.production` = Worker `localley-next` (no routes until cutover). |
| `open-next.config.ts` | R2 incremental cache (`unstable_cache`), D1 tag cache (`revalidateTag`), in-process revalidation queue. |
| `cloudflare/opennext/worker.ts` | Worker entry: OpenNext `fetch` + `scheduled` (Cron Triggers). |
| `cloudflare/opennext/cron-routes.ts` | Cron schedule -> route map, same as `vercel.json`. Tested against `vercel.json` and `wrangler.jsonc`. |
| `lib/rate-limit.ts` | Uses the Workers rate limiting binding `RATE_LIMIT_<n>` first, then Upstash, then memory. |
| `lib/supabase-read-only.ts` | `SUPABASE_READ_ONLY=true` blocks every non-GET Supabase request. Set only on the preview. |

Scripts: `npm run cf:build`, `npm run cf:preview:local`, `npm run cf:deploy:preview`.
`npm run build` (`next build`) is unchanged and is what Vercel runs. `cf:build` runs the same `next build` first.

Compatibility: `nodejs_compat`, `global_fetch_strictly_public`, compatibility date `2026-09-08`, `limits.cpu_ms` 30000.

## 2. Vercel feature -> Cloudflare mapping

| Vercel feature | Cloudflare equivalent | State |
| --- | --- | --- |
| Next.js hosting, middleware | OpenNext Worker; `middleware.ts` checks the Better Auth cookie signature | Verified on preview |
| Clerk (auth, hosted UI, webhook) | Better Auth on D1 `AUTH_DB`, own sign-in pages, user hooks | Verified on preview (e2e sign-up -> sign-out) |
| Static assets, `/_next/static` | Workers static assets (`.open-next/assets`) | Verified |
| `next/image` optimization | Cloudflare Images binding `IMAGES` (AVIF/WebP) | Verified (remote Unsplash image -> AVIF). Images Free includes 5,000 unique transformations per month. |
| `unstable_cache`, `revalidateTag` | R2 `NEXT_INC_CACHE_R2_BUCKET` + D1 `NEXT_TAG_CACHE_D1` | Preview bucket/DB created; cache populated on deploy |
| `after()` (social submissions) | `ctx.waitUntil` through OpenNext | Built; needs a signed-in write test on non-production data |
| `next/og` `ImageResponse` (`/api/og`, story PNG) | Bundled Satori + resvg wasm | Built. `/api/og` changed from `runtime = "edge"` to `"nodejs"` (OpenNext has no edge routes). |
| 4 Vercel crons (`vercel.json`) | Cron Triggers in `env.production.triggers` + `scheduled` handler | Map tested; see section 4 |
| Upstash rate limit (timed out from Vercel on 2026-09-22) | Workers rate limiting bindings `RATE_LIMIT_5/10/20/60` (60 s) | Verified: 429 after the limit on preview |
| Upstash LLM cache (`lib/llm/cache.ts`) | In-memory per isolate when Upstash vars are absent | Works without Upstash. Upstash is not needed on Workers. |
| `@vercel/speed-insights` | Rendered only when `process.env.VERCEL` is set | No request to `/_vercel/*` on Workers |
| `@vercel/og` package | Not imported by the app (`next/og` is used) | — |
| `@vercel/analytics`, Edge Config, `waitUntil` from `@vercel/functions` | Not used | — |
| `VERCEL_URL` (story save base URL) | Falls back to `https://localley.io` in production | Correct after the DNS switch. On the preview it points at production (read-only GET). |
| Sentry (`@sentry/nextjs`) | Build wrapper unchanged; no `instrumentation.ts`, so server Sentry is not active on either platform | No change |

## 3. Environment variables (names only)

Build time (inlined into the bundle, must be present when `npm run cf:build` runs):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`,
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_KAKAO_MAPS_APP_KEY`, `NEXT_PUBLIC_KAKAO_REST_API_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SOCIAL_SPOT_SUBMISSIONS_ENABLED`, optional `NEXT_PUBLIC_SENTRY_DSN`,
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_KAKAO_MAPS_ENABLED`, `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_ANALYTICS_ENDPOINT`.
A preview build and a production build are different builds because these values are inlined.

Runtime secrets (`wrangler secret put … --env production`):
`SUPABASE_SERVICE_ROLE_KEY`, `BETTER_AUTH_SECRET`, `SUPABASE_JWT_SECRET`, optional `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_CONNECT_WEBHOOK_SECRET`, `CRON_SECRET`, `ADMIN_USER_IDS`, `GLM_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
`GEMINI_API_KEY`, `FAL_KEY`, `ARK_API_KEY`, `GOOGLE_PLACES_API_KEY`, `PEXELS_API_KEY`, `TRIPADVISOR_API_KEY`, `VIATOR_API_KEY`,
`RESEND_API_KEY`, `APIFY_API_TOKEN`, `VAPID_PRIVATE_KEY`.

Runtime plain vars (`env.production.vars` or secrets): `STRIPE_PRO_MONTHLY_PRICE_ID`, `STRIPE_PRO_YEARLY_PRICE_ID`,
`STRIPE_PREMIUM_MONTHLY_PRICE_ID`, `STRIPE_PREMIUM_YEARLY_PRICE_ID`, `GLM_MODEL`, `GLM_BASE_URL`, `BETA_MODE`, `ENABLE_MULTI_LLM`,
`MULTI_LLM_PRO_TIER`, `MULTI_LLM_PREMIUM_TIER`, `BYPASS_IMAGE_TIER_CHECK`, `LLM_CACHE_TTL`, `LLM_CACHE_LOCATIONS_TTL`,
`CIRCUIT_BREAKER_THRESHOLD`, `CIRCUIT_BREAKER_RESET_MS`, `WEEKLY_SOCIAL_TRENDS_ENABLED`, `APIFY_SPOT_DISCOVERY_ENABLED`,
`MULTI_CITY_PREVIEW_API`, `VAPID_SUBJECT`, `FROM_EMAIL` (must be a Resend-verified sender), `BETTER_AUTH_URL`,
`AUTH_ALLOWED_HOSTS` (both set in `env.production.vars`), plus optional model/affiliate overrides read by the code
(`CLAUDE_MODEL`, `OPENAI_MODEL`, `SOCIAL_SPOT_RESEARCH_MODEL`, `VIATOR_API_URL`, `VIATOR_PARTNER_ID`, `VIATOR_AFFILIATE_ID`,
`BOOKING_AFFILIATE_ID`, `GYG_AFFILIATE_ID`, `KLOOK_AFFILIATE_ID`, `LOG_LEVEL`, `SPOTS_QUERY_TIMEOUT_MS`, `MULTI_CITY_GEO_DB`).

Not needed on Workers: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (replaced by rate limit bindings), `VERCEL*`, `TURBO_*`, `NX_DAEMON`,
and all `CLERK_*` / `NEXT_PUBLIC_CLERK_*` (Clerk is removed).
Never on production: `SUPABASE_READ_ONLY`, `AUTH_MAIL_MODE=outbox`.

## 4. Cron Triggers

| Schedule (UTC) | Route |
| --- | --- |
| `0 3 * * *` | `/api/cron/cleanup-stories` |
| `0 4 * * *` | `/api/cron/process-social-submissions` |
| `23 2 1 * *` | `/api/cron/discover-spots-with-apify` |
| `0 5 * * *` | `/api/cron/refresh-weekly-social-trends` |

The `scheduled` handler calls the unchanged route through `WORKER_SELF_REFERENCE` with `Authorization: Bearer $CRON_SECRET`,
logs status and duration, and throws on a non-2xx status so the invocation shows as failed.
Only `env.production` has triggers. The preview has none because the jobs write data.
Paid Workers limits: 30 s CPU per invocation (configurable to 5 min), 15 min wall time for Cron Triggers.
The route handlers declare `maxDuration` 120–300 s; that is wall time, and most of it is waiting on Supabase/Apify/LLM calls.

Manual trigger:

```sh
# production, after cutover (APPROVAL): the routes accept the same bearer as on Vercel
curl -H "Authorization: Bearer $CRON_SECRET" https://www.localley.io/api/cron/cleanup-stories
# local scheduled handler (wrangler dev --test-scheduled)
curl "http://localhost:8795/cdn-cgi/handler/scheduled?cron=0+3+*+*+*"
```

In local `wrangler dev` the self-service binding does not resolve to the same Worker (DNS lookup of `localley.internal`
fails), so the local scheduled test proves the mapping and the error path only. The deployed binding is used by
`apps/Concourse` (zapleg) in the same account.

## 5. Preview evidence — 2026-09-23

Preview: `https://localley-next-preview.nkopp.workers.dev`, version `309440ba-971a-497e-9d54-1347eaedb144` (code upload `0f7696d8-860c-4c45-aa3c-86de1232105b` + secret change).
Credentials: production Supabase URL + public anon key only, `SUPABASE_READ_ONLY=true`, no service-role key.
Clerk: the production publishable key (public, already in the live HTML) and a placeholder secret, so signed-out rendering works.
No Stripe, AI, email or Google keys. No Clerk development instance, Stripe test keys or Supabase preview project exist
in Vercel or `~/secrets/keys.env` (Vercel `preview` and `development` envs hold the live keys).

- Route parity: all 112 app paths from the build manifest (29 pages + 2 Next internals excluded, 78 API routes, 5 metadata routes)
  were requested signed-out on the preview and on production. 111 of 112 status codes match.
  The one difference, `/api/itineraries/[id]/story` (prod 404, preview 500), comes from the missing service-role key.
- Pages 200: `/`, `/spots` (live Supabase data, 2,583 curated spots), `/templates`, `/pricing`, `/itineraries/new`, `/spots/submit`,
  `/sign-in`, `/sign-up`. Protected pages redirect to sign-in (307) and protected APIs return 404, as on Vercel.
- `/api/cities` returns the same 14,037 bytes as production.
- `next/image`: remote Unsplash image -> `image/avif` 200.
- Rate limit: `/api/spots/social-submissions/media-status` (20/min) returned 429 with `Retry-After: 60` after 23 requests.
- Bundle: 31,522 KiB raw, **8,196 KiB gzip**. Workers Free allows 3 MiB, Workers Paid 10 MiB. The account is already on
  Workers Paid (`limits.cpu_ms` is accepted, and the 8 MiB upload was accepted). Headroom: about 1.8 MiB.
- CPU (Workers analytics, 101 requests): p50 10.8 ms, p90 187 ms, p99 468 ms, max 784 ms (cold start). Startup 26 ms.
  This exceeds the Free plan 10 ms limit, so Workers Paid is required — and is already active.

Auth on the preview (2026-09-23, Better Auth, version `c75c386e-322a-4c4f-b3e8-79e35b84b408`): `e2e/auth-preview.spec.ts`
passed — sign-up, email verification from the test outbox, `/dashboard` signed in, sign-out via the account menu,
`/settings` redirect, password sign-in back to `/settings`, magic-link sign-in. Signed out: pages 307 to `/sign-in`,
`POST /api/spots/save`, `/api/v2/trips/preview`, `/api/user/tier` return 401. Bundle 8,596 KiB gzip.
Signed-in pages that need the service-role key (`/settings`, `/profile`) render their error state on the preview.

Not verifiable without non-production credentials (NEEDS.md): signed-in data flows, spot detail (uses service role),
story PNG rendering with data, Stripe checkout/webhooks, AI chat/itineraries, email, cron jobs end-to-end.
Found on production too: Google place photos return `502 lookup_failed_400` on www.localley.io and on the Worker alike.

## 6. Production cutover checklist — every step needs Nils' approval

**2026-09-23, Nils approved P2–P5 ("go ahead") with A1–A5.** P2 done (earlier), P3 done (35 secrets), P4 + P5 done:
Worker `localley-next` version `ad07d446-e0d6-4209-8a0d-22c0c6f73015` on `next.localley.io`, crons `[]`.
Status and evidence: `docs/AUTH_BETTER_AUTH.md` section 7.

**2026-09-23, Nils: "go ahead with all live test and deployments".** Cutover done (claude):

- Live test on `next.localley.io` (migrated account, magic link read from the Resend API): dashboard, trips,
  profile, settings, trip save/read/delete, chat (GLM `glm-5.2`), AI itinerary generate-v2 (1 day, 69 s, then deleted),
  story/edit pages, export, Stripe checkout for all four plans (session created, not paid), signed Stripe test events
  on both webhook routes (200; wrong signature 400). Admin API 403 for this account is expected (admin id = other account).
- Fixes found by the test: Worker secrets `GLM_BASE_URL`/`GLM_MODEL` held Vercel's `[SENSITIVE]` placeholder (chat 500) →
  deleted, code defaults apply. The four `STRIPE_*_PRICE_ID` values were product ids from another Stripe account
  (Vercel checkout was broken too) → set to the live Localley prices (`price_1T2rh…`). PR159: Stripe
  `createFetchHttpClient()` (the Node client hung on workerd, error 1101). `cleanup-stories` compared a jsonb value to
  a string (`->` → `->>`, 22P02 on Vercel too).
- P8: Vercel crons disabled via API (`PATCH /v1/projects/<id>/crons {"enabled":false}`), then P7: the two Vercel DNS
  records deleted (backup `codex-work/tmp/localley-dns-backup-20260923.json`), Worker deployed with `localley.io`,
  `www.localley.io`, `next.localley.io` and the four Cron Triggers. Sign-in on `www` verified.
- P6: no Stripe change needed (same URLs and secrets); verified with signed test events.
- A6 + Vercel retirement (Nils: "go ahead with the next steps", same day): the five Clerk CNAMEs deleted (in the DNS
  backup), `localley.io`/`www.localley.io` removed from the Vercel project (only `travelchat-ai.vercel.app` left;
  crons off, no Git link). The Vercel project and the Clerk instance still exist but serve nothing; deleting them
  cannot be undone, so that is left to Nils (dashboards). **The rollback to Vercel above now also needs the two
  Vercel domains re-added and the Clerk CNAMEs restored from the backup.**
- `localley.io` → `www.localley.io` 301 in `middleware.ts` (PR163), as on Vercel. `ANTHROPIC_API_KEY` removed from the
  Worker (no credit; the orchestrator skips Claude when it is unset). Worker version `94422e32-62d2-42c6-a45c-4928e8327779`.
- Speed (TTFB, 5 requests each from the VPS): `/` 0.2–1.6 s, `/spots` 0.16–0.75 s, `/api/cities` 0.2–2.9 s (first
  request cold), `/pricing` 0.19–0.33 s.
- `APIFY_SPOT_DISCOVERY_ENABLED` and `WEEKLY_SOCIAL_TRENDS_ENABLED` = `true` on the Worker (Nils: "go ahead for
  localley to full performing actions"). Supabase proved both ran on Vercel (Apify run 2026-09-01, weekly trends
  daily until 2026-09-22). Caps in code: Apify $1/run (monthly), trends $2/actor run. `MULTI_CITY_PREVIEW_API`
  stays off (unfinished preview API; plans require it hidden).
- Chat fallback is OpenAI `gpt-5.6-luna` since PR161 (the Anthropic key had no credit; its SDK failed on Workers).
  Worker version `e418172b-68a7-4e6a-8206-401e78998b59`.

Run from a clean worktree of `main`. Never commit or print secret values. Delete temporary env files at once.

P1. **Non-production acceptance first.** Sign-in no longer needs Clerk keys (Better Auth preview store, see
    `docs/AUTH_BETTER_AUTH.md`). Nils provides Stripe test keys and a Supabase preview project (or approves another test setup). Then rebuild the preview with them and run sign-in, trip create, chat,
    story render, checkout (test mode) and the four crons against that data.

P2. **Create production cache resources (Cloudflare, within the paid plan):**

```sh
npx wrangler r2 bucket create localley-next-cache --location weur
npx wrangler d1 create localley-next-tags --location weur
# put the new database_id into wrangler.jsonc env.production.d1_databases, commit, PR, merge
```

P3. **Production secrets on the Worker (APPROVAL: production secrets).**

```sh
umask 077
vercel env pull /home/dev/projects/CyberLink/codex-work/tmp/localley-prod.env --environment=production --project travelchat-ai --scope nkopp-cmds-projects
# build a JSON file with ONLY the runtime secret names from section 3 (not NEXT_PUBLIC_*, not VERCEL*/TURBO*/UPSTASH*)
npx wrangler secret bulk /home/dev/projects/CyberLink/codex-work/tmp/localley-prod-secrets.json --env production
rm -f /home/dev/projects/CyberLink/codex-work/tmp/localley-prod.env /home/dev/projects/CyberLink/codex-work/tmp/localley-prod-secrets.json
```

P4. **Production build and deploy without a public route.** Export the production `NEXT_PUBLIC_*` values
    (`NEXT_PUBLIC_APP_URL=https://localley.io`) into the build environment only, then:

```sh
npm run cf:build
npx opennextjs-cloudflare deploy --env production   # Worker localley-next, no routes, workers_dev false
```

P5. **Staging host on the real zone (APPROVAL: DNS).** Add `{ "pattern": "next.localley.io", "custom_domain": true }` to
    `env.production.routes`, deploy, and run the full acceptance journey there with a migrated account (magic link).
    `next.localley.io` is already in `AUTH_ALLOWED_HOSTS`; no auth provider dashboard is involved.

P6. **Stripe webhooks (APPROVAL: billing).** Keep the URLs the same: `https://www.localley.io/api/subscription/webhook` and
    `https://www.localley.io/api/connect/webhook`. After the DNS switch Stripe reaches the Worker with no Stripe change,
    because the signing secrets move with the secrets in P3. Send one test event from the Stripe dashboard and confirm 200 in
    `npx wrangler tail localley-next`. (The Clerk webhook `/api/webhooks/clerk` is removed with Clerk.)

P7. **DNS switch (APPROVAL: DNS).** Record the current records first: apex `A 216.198.79.1`
    (id `18a24961686715e5a1c7cd27df512c8d`) and `www CNAME 8597cfc582a3e8e6.vercel-dns-017.com` (id `4ee834b5f230582391427ce4fb98a089`).
    Keep all Clerk CNAMEs. Delete the two Vercel records, then uncomment the `localley.io` and `www.localley.io` custom domains in
    `env.production.routes` and run `npx opennextjs-cloudflare deploy --env production`.
    Verify `/`, `/spots`, sign-in, a trip read, `/api/cities`, a Stripe test event, and each cron route with the bearer.

P8. **Disable Vercel crons at the DNS switch (APPROVAL).** Vercel crons call the deployment host
    (`travelchat-5lx8wjlwv-nkopp-cmds-projects.vercel.app`), not `www.localley.io`, so they keep running after DNS moves.
    Running both doubles every job. Disable them in the Vercel dashboard (Project -> Settings -> Cron Jobs -> Disable)
    in the same window as P7. Retire the Vercel project only after an agreed period (APPROVAL).

Auth steps A1–A6 (`docs/AUTH_BETTER_AUTH.md` section 7) run before P4/P5: the production auth D1 with its schema,
`BETTER_AUTH_SECRET` + `SUPABASE_JWT_SECRET` secrets, a Resend-verified sender, and the 5-user import. Clerk stays
enabled on Vercel until P7 is verified. The Clerk webhook in P6 no longer exists (the route is removed).

Rollback to Vercel (deployment `dpl_FA3tzDj3zDmxLGEFEjvoXv7d6rgg`):

1. Remove the Worker custom domains (`routes` back to none) and deploy, or delete them in the dashboard.
2. Recreate `A localley.io 216.198.79.1` and `CNAME www 8597cfc582a3e8e6.vercel-dns-017.com`, DNS-only.
3. Re-enable the Vercel cron jobs in the dashboard.
4. Stripe and Clerk webhook URLs did not change, so no webhook step is needed.
5. Supabase stayed the only app database, so there is no data to move back. Vercel still runs Clerk with the
   same user ids, so users who signed up on Better Auth after the switch are the only accounts that do not exist there.
