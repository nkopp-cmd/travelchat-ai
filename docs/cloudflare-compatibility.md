# Cloudflare Compatibility Assessment

Assessment date: 2026-09-07.

Subsequent maintenance updated the root to Next `16.3.4`, React/React DOM `19.2.8`, and Clerk `6.39.6`.
The regular Next production build and 725 unit tests pass on that package set.
The static scanner results below remain historical evidence from before those updates.
The React peer mismatch and OpenNext Next-version mismatch below no longer describe the current manifest.
Workers compatibility remains unverified. The attempted isolated build was blocked by directory-write permissions.

Later maintenance removed the inactive next-pwa package and its Webpack wrapper.
The push-only worker now registers explicitly; the PWA wrapper findings below are historical.
The regular production build and 733 tests pass after that change.
This removes one build integration barrier, but no Workers runtime validation has run.

## Decision

Select vinext for the next isolated experiment, not for production migration.
The static check ran successfully. No Workers build or runtime preview ran.
Neither adapter can accept the current dependency configuration unchanged.

vinext needs newer React packages and an ESM configuration.
Its scanner reports partial Clerk and Sentry support.
Localley's PWA build integration also needs separate investigation.

OpenNext remains an alternative if vinext cannot preserve required behavior.
The verified OpenNext release excludes Localley's current Next.js version.
It also requires a change to the existing edge OG route.
Do not downgrade the adapter merely to bypass its current version requirements.

## Scope and Safety

- Loaded the Cloudflare skill and the Supabase skill.
- Read public documentation, application source, and selected lockfile entries.
- Verified the workspace parent, workspace, and approved temporary directory with `ls -d` before npm created files.
- Confined npm downloads, its execution environment, and logs to the approved temporary cache.
- Did not run `init`, an application install, a build, a deployment, or a cloud resource command.
- Did not read secret files or call application services.
- Did not change root packages, lockfiles, or configuration.
- Added only this assessment document to the repository.
- The external read of `/home/dev/projects/CyberLink/CLAUDE.md` was denied. No alternate access was attempted.

The workspace already contained unrelated changes.
Other work changed additional files during this assessment, including `scripts/generate-icons.js`.
The scanner results below describe the source at scan time, not an immutable commit.
No unrelated changes were reverted.

## Executed Check

Host versions: Node `v22.22.1`, npm `11.19.1`.
The registry responded during this assessment despite earlier reported timeouts.

First registry query:

```bash
timeout 45s npm view vinext version engines peerDependencies dist.integrity --json --cache /home/dev/projects/CyberLink/codex-work/tmp/opencode/localley-npm-cache --fetch-retries=1 --fetch-retry-mintimeout=1000 --fetch-retry-maxtimeout=2000 --fetch-timeout=15000 --ignore-scripts
```

Executed from the Localley workspace:

```bash
timeout 120s npx --yes --package=vinext@1.0.0-beta.9 --cache=/home/dev/projects/CyberLink/codex-work/tmp/opencode/localley-npm-cache --fetch-retries=1 --fetch-retry-mintimeout=1000 --fetch-retry-maxtimeout=2000 --fetch-timeout=15000 --ignore-scripts vinext check
```

The command completed without a timeout or execution error.
npm warned about existing `globalignorefile` and `store-dir` settings.
Those warnings did not prevent execution.
The inspected CLI check path performs static scanning without loading dotenv or executing the Next configuration.
The build and development paths differ: they can change configuration and load environment files.

| Scanner result | Evidence |
| --- | --- |
| Overall | 86%; 23 supported, four partial, two issues |
| Imports | 11 of 12 fully supported |
| Configuration | `images` partially supported |
| Libraries | Five of seven recognized libraries fully supported |
| Structure | 29 pages, six layouts, 78 route handlers, five loading boundaries, six error boundaries |
| Issue | Missing `type: module` in `package.json` |
| Issue | CommonJS globals in `scripts/generate-icons.js` and `scripts/pre-deployment-check.js` |
| Partial | `next/font/google`: CDN fonts rather than build-time self-hosting |
| Partial | `images`: optimization needs an optimizer; otherwise images pass through |
| Partial | `@clerk/nextjs`: server-component `auth()` needs shim verification |
| Partial | `@sentry/nextjs`: server integration needs manual setup |

The score is a heuristic, not a passing runtime test.
The scanner does not validate all dependencies or evaluate plugin-generated webpack configuration.
The two CommonJS files are maintenance scripts, not identified request handlers.
Their result does not establish a Workers runtime failure.

## Verified Versions

These exact adapter versions came from successful npm registry queries.
Only vinext executed. The other versions are candidates, not tested installations.

| Package | Exact version | Verified requirements |
| --- | --- | --- |
| `vinext` | `1.0.0-beta.9` | Node `>=22`; Vite `^8.0.0`; React and React DOM `^19.2.6` |
| `@vinext/cloudflare` | `1.0.0-beta.7` | Node `>=22`; vinext `^1.0.0-beta.9` |
| `@opennextjs/cloudflare` | `1.20.6` | Next `>=15.5.24 <16 || >=16.3.3`; Wrangler `^4.125.0`; `rclone.js` `^0.6.6` |

vinext registry integrity:

```text
sha512-pKsaR9mzbfwifb0hQjrq/RQJ/yq9YGwWGusIxEV+bQabdeatm7KOgprKhcrr6LIrqzOQjZBYyU1wXJlb/3Gkcw==
```

vinext also declares `@vitejs/plugin-react` as `^5.1.4 || ^6.0.0`.
Its optional peers include `@vitejs/plugin-rsc` `^0.5.34` and `react-server-dom-webpack` `^19.2.6`.
The initializer includes both for App Router applications.
It also declares optional `@mdx-js/rollup` `^3.0.0`; Localley does not need that solely for this check.

Localley's manifest and lockfile specify Next `16.0.10` and React/React DOM `19.2.1`.
Evidence: `package.json:73-77`, `package-lock.json:13989`, and `package-lock.json:15161`.
React `19.2.1` does not satisfy vinext's peer range.
Next `16.0.10` does not satisfy the verified OpenNext peer range.

No complete preview dependency set or security advisory audit was verified.
Do not treat the peer ranges above as pinned candidate versions.
Resolve and verify exact supporting versions before creating the isolated preview lockfile.

## Integration Assessment

| Integration | Local evidence | Assessment and required proof |
| --- | --- | --- |
| App Router and middleware | `middleware.ts:1-46`; scanner structure results | Both adapters document support. Test public routes, protected routes, redirects, and cookies. |
| Clerk and Supabase identity | `lib/supabase-server.ts:29-51` | `auth()` obtains a Clerk template token. Failure falls back to anonymous access. Test two users and anonymous reads. |
| Supabase database and storage | `lib/supabase-server.ts:3-7,39-51`; `lib/web-push.ts:61-65` | Retain existing HTTP clients and PostgreSQL behavior. Hosting migration does not require D1 or Hyperdrive. |
| Stripe subscriptions and Connect | `lib/stripe.ts:11-15,205-206`; `app/api/connect/webhook/route.ts:25-35` | Raw text and synchronous signature verification need workerd tests. Preserve unsigned webhook access and idempotency. |
| AI generation and SSE | `app/api/itineraries/generate-v2/stream/route.ts:34-38,63-70,139-175` | Uses a five-minute timeout and a background producer. Test streaming, disconnects, cancellation, backpressure, and cleanup. |
| AI provider SDKs | `lib/llm/providers/glm.ts:46`; `lib/llm/providers/openai.ts:45`; `lib/llm/chat-provider.ts:1` | HTTP access is plausible, but the scanner does not validate provider transports or retries. Use mocks first. |
| Upstash | `lib/rate-limit.ts:2-19,69`; `lib/llm/cache.ts:130-132` | Retain Redis initially. Test atomic limits and user cache separation. |
| Email and push | `lib/resend.ts:10`; `lib/web-push.ts:1,45-54` | Test SDK loading and push crypto/HTTP behavior. Block actual sends during local tests. |
| PWA and build wrappers | `next.config.ts:14-43,157-164` | Vite cannot preserve webpack hooks automatically. Audit next-pwa, bundle analyzer, and Sentry wrappers separately. |
| Private cache behavior | `next.config.ts:21-28` | Broad Supabase NetworkFirst caching needs logout and cross-user checks. Framework support does not prove cache privacy. |
| Fonts and image optimization | `app/layout.tsx:2-16`; `next.config.ts:49-113` | Verify font delivery changes, image allowlists, quality settings, and signed URLs. |
| Story PNG renderer | `app/api/itineraries/[id]/story/route.tsx:1-7,1022-1023` | Scanner supports `next/og`, not this pipeline's memory, WASM, or output correctness. Keep protected source unchanged. |
| Edge OG route | `app/api/og/route.tsx:4` | OpenNext documents no edge runtime support. This is a concrete source mismatch for that alternative. |
| Monitoring | `next.config.ts:116-154`; `sentry.server.config.ts:1`; `app/layout.tsx:6` | Verify Sentry server setup. Vercel Speed Insights is not evidence of Workers monitoring. |
| Scheduled jobs | `vercel.json:7-23` | Four schedules need explicit Workers scheduling later. Do not enable duplicate jobs in a preview. |
| Maps | `components/ui/kakao-map.tsx`; `components/ui/leaflet-map.tsx` | Browser behavior still needs hydration and origin-allowlist tests. Hosting support alone does not prove map integration. |

Preserve the story pipeline's PNG/JPEG detection, WebP rejection, URL storage, prefetching, and forced stream consumption.
Measure it unchanged with fixture images before proposing any migration change.
Do not proxy preview traffic to production as a workaround.

## Isolated Preview Design

This is the selected next experiment, not an executed setup.

1. Create a sanitized source copy below `/home/dev/projects/CyberLink/codex-work/tmp/opencode/` after verifying its parent.
2. Include intended source changes explicitly, because the current workspace is dirty.
3. Exclude secrets, `.git`, provider metadata, databases, existing build output, and `node_modules`.
4. Do not link writable files or dependencies back to the original workspace.
5. Verify exact peer-compatible React, Vite, RSC, Cloudflare plugin, and Wrangler versions.
6. Install those versions only in the copy, with a separate lockfile and bounded network retries.
7. Review lifecycle scripts before enabling any required native build steps.
8. Apply ESM and build-wrapper changes only in the copy.
9. Configure the Cloudflare Vite plugin with `viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] }`.
10. Use `vinext/server/fetch-handler`, `nodejs_compat`, and a reviewed compatibility date in the isolated Wrangler configuration.
11. Configure `ASSETS` from `dist/client` with `not_found_handling: "none"`.
12. Start without remote cache or image bindings, using fixture responses and blocked service egress.
13. Build the copy, then run local Wrangler against `dist/server/wrangler.json` on loopback.
14. Record workerd responses and browser evidence before calling the result a runtime preview.

The upstream initializer defaults to KV, CDN caching, and Cloudflare Images.
Those defaults are not permission to create resources or use paid services.
An initial preview without them cannot establish cache or image optimization parity.
Do not run `vinext start` and describe its Node server as a Workers preview.

OpenNext would instead require a supported Next version and an isolated `open-next.config.ts`.
Its documented Worker entry is `.open-next/worker.js`, with assets from `.open-next/assets`.
It requires `nodejs_compat` and a compatibility date of `2024-09-23` or later.
Its official guide also excludes Node.js middleware support.
Localley's middleware has no explicit Node runtime declaration, so that limitation is not a proven current failure.

## Remaining Gates

- Complete a peer-compatible isolated install and resolve the PWA/Sentry build configuration.
- Verify Clerk request context before testing Supabase authorization behavior.
- Use test credentials only after explicit approval; mocks cannot prove live authentication or payments.
- Test valid and invalid Stripe signatures without payment effects.
- Test SSE completion, cancellation, timeout cleanup, and provider failures without paid generation.
- Measure bundle size, startup time, CPU, and memory, including concurrent story renders.
- Verify browser behavior, fonts, maps, image policies, and service-worker cache isolation.

The current limits page reports 128 MB per isolate and a 64 MiB uncompressed Worker limit.
It reports a one-second startup limit and no compressed bundle limit.
Paid HTTP CPU defaults to 30 seconds, with a five-minute maximum.
HTTP wall time continues while the client stays connected; post-response `waitUntil()` adds at most 30 seconds.
Localley's `maxDuration` exports do not establish equivalent Workers limits.
No bundle or resource measurement ran during this assessment.

## Sources and Verification

Retrieved on 2026-09-07:

- https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/ (updated 2026-08-25; recommends vinext beta)
- https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/ (updated 2026-08-25; documents the alternative)
- https://vinext.dev/compatibility (latest displayed run used Next `v16.2.6` and vinext `refs/heads/main`)
- https://raw.githubusercontent.com/cloudflare/vinext/main/packages/vinext/package.json
- https://raw.githubusercontent.com/cloudflare/vinext/main/packages/vinext/src/cli.ts
- https://raw.githubusercontent.com/cloudflare/vinext/main/packages/vinext/src/check.ts
- https://raw.githubusercontent.com/cloudflare/vinext/main/packages/vinext/src/init.ts
- https://raw.githubusercontent.com/cloudflare/vinext/main/packages/vinext/src/init-cloudflare.ts
- https://raw.githubusercontent.com/cloudflare/vinext/main/packages/cloudflare/package.json
- https://opennext.js.org/cloudflare/get-started
- https://developers.cloudflare.com/workers/platform/limits/ (updated 2026-09-05)

GitHub `main` sources are moving references, not proof of published artifact identity.
Registry metadata verified the adapter versions separately.
The dashboard does not test Localley's exact dependency combination.
OpenNext's older C3 example conflicts with Cloudflare's current recommendation; use Cloudflare's current framework guide for that choice.

`git diff --exit-code -- package.json package-lock.json next.config.ts vercel.json` returned zero after the scanner ran.
No application tests ran because this task changed no application code.
The completed evidence is a static compatibility assessment, not a runtime certification.

## Bounded Build Attempt

Follow-up attempt: 2026-09-07, with an eight-minute effort limit.
The user authorized a sanitized, isolated build without root dependency changes.
Loaded the Wrangler skill before attempting setup.

Directory verification succeeded:

```bash
ls -d /home/dev/projects/CyberLink/apps/Localley /home/dev/projects/CyberLink/codex-work/tmp/opencode
```

The tool then denied this command before execution:

```bash
mkdir /home/dev/projects/CyberLink/codex-work/tmp/opencode/localley-vinext-build-20260907
```

Exact tool message:

```text
The user has specified a rule which prevents you from using this specific tool call.
```

The tool reported conflicting external-directory rules, including a final general deny rule.
Thus, readable directory verification did not establish permission to create the isolated workspace.
No alternate tool, path, or command was used to bypass the denial.

The first blocker is workspace creation permission, not a compile or runtime failure.
No source copy, supporting-version query, dependency installation, lockfile creation, build, or workerd preview ran in this follow-up.
No build process inherited credentials because no build process started.
No fake keys, remote resources, provider sends, or production proxying were used.
The attempt stopped early rather than consuming the remaining budget with blocked setup retries.

To continue, the execution policy must permit directory creation and writes below the approved temporary path.
The previous static findings and verified adapter versions remain the only compatibility execution evidence.
The application and its root dependency configuration remain unchanged by this attempt.
