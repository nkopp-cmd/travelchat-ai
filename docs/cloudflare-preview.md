# Local Cloudflare Preview

## Scope

This experiment uses `.cloudflare-preview/` only. It does not change the production application or its dependencies.
No deployment, account operation, migration, or live provider test is authorized here.

Source commit: `073b11eaafd626dc0081045eff1c7506f6fbacee`.
The filtered Git archive contains 452 files, 29 pages, and 81 route handlers.
The scanner found no matching credential patterns. This scan cannot prove that all secrets are absent.
The snapshot excludes environment files, repository metadata, database files, reports, tests, and deployment configuration.
No data directory or private JSON dataset was copied.
The font license remains included as `lib/fonts/OFL.txt`.

## Setup

Cloudflare's Next.js guide recommends vinext beta as of September 7, 2026.
References:

- https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- https://github.com/cloudflare/vinext/blob/main/README.md
- Installed `vinext/dist/init-cloudflare.js`, lines 93-120, for the Worker entry and assets configuration.

The independent package and lock are `.cloudflare-preview/app/package.json` and `.cloudflare-preview/app/package-lock.json`.
Installed tools use Node `22.22.1`.

| Package | Pinned Version |
| --- | --- |
| vinext | 1.0.0-beta.9 |
| @vinext/cloudflare | 1.0.0-beta.7 |
| vite | 8.2.2 |
| @vitejs/plugin-rsc | 0.5.34 |
| @vitejs/plugin-react | 6.1.1 |
| @cloudflare/vite-plugin | 1.54.4 |
| wrangler | 4.129.0 |
| next | 16.3.4 |
| react, react-dom, react-server-dom-webpack | 19.2.8 |
| miniflare (transitive) | 5.20260903.0-alpha |
| workerd (transitive) | 1.20260903.1 |

Published peer ranges accept these versions. Installation completed with scripts disabled.
The install added 596 packages. No root `node_modules` link is used.
The lock records exact versions for application dependencies with ranges.

The runner constructs a clean environment instead of inheriting provider credentials.
It places HOME, temporary files, and caches inside the preview folder.
Public Clerk and Supabase values are placeholders. Server provider keys are absent.
The runner disables telemetry and limits Node memory to 3 GiB.
Build commands have a three-minute timeout and two-thread settings.

## Commands

Run these commands from the application repository:

```sh
node .cloudflare-preview/prepare.mjs
node .cloudflare-preview/run.mjs npm install --ignore-scripts --include=dev --no-audit --no-fund
node .cloudflare-preview/run.mjs node node_modules/vinext/dist/cli.js check
node .cloudflare-preview/run.mjs node node_modules/vinext/dist/cli.js build
node .cloudflare-preview/run.mjs ./node_modules/@cloudflare/workerd-linux-64/bin/workerd --version
node .cloudflare-preview/run.mjs node local-workerd.mjs
```

Preparation is a one-time operation. Running it again would overwrite snapshot adaptations.
Registry checks used `npm view` through the same clean runner before installation.
Commands after logging was enabled write their output under `.cloudflare-preview/logs/`.

## Baseline Evidence

`vinext check` reported 94% compatibility: 24 supported items, three partial items, and zero reported issues.
Partial items were Google Fonts, Clerk, and Sentry. This static report does not prove runtime compatibility.
It found 29 pages, six layouts, 81 handlers, five loading boundaries, and six error boundaries.
No Next configuration was copied because the production configuration includes unrelated deployment tooling.
Thus, this check does not cover production Next configuration.

The first actual build failed before bundling:

```text
Error: Invalid middleware matcher "/((?!_next|[^?]*\.(?:html?|css|js(?!on)|json|txt|xml|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)": parameter "0" contains ambiguous sequence expansion.
```

## Preview Adaptations

- Added ESM package mode and pinned preview dependencies.
- Removed unused test and lint dependencies from the snapshot manifest only.
- Renamed `postcss.config.js` to `postcss.config.cjs` for ESM package mode.
- Added the documented Vite Cloudflare plugin configuration and local Wrangler configuration.
- Broadened the snapshot middleware matcher to `/:path*` after the baseline failure.

The matcher adaptation keeps Clerk and all protection logic. It also matches static paths.
No integration stubs or application route removals have been added.
The Wrangler configuration has no account ID, remote bindings, or remote deployment URLs.

## Build Result

The second build passed all five stages after the middleware adaptation.
It built the RSC, client, and SSR environments with the Cloudflare Vite plugin.
It retained all 29 pages and 81 route handlers.
The five reported stage durations total about 74 seconds.
The output includes `dist/server/index.js`, `dist/server/ssr/`, and `dist/client/`.
The adapter generated `dist/server/wrangler.json` with `no_bundle: true`.
No install scripts were needed, including workerd and esbuild postinstall scripts.
The build reported middleware deprecation and plugin timing warnings, but no final build error.

## Runtime Result

The harness loads the adapter's generated modules into real workerd through Miniflare.
It reads the generated Wrangler configuration for the entry, compatibility settings, and assets location.
This is not `vinext start` or a Node-only application server.
The harness denies outbound requests rather than supplying fake provider responses.
It uses loopback port `8788` and closes the runtime after its tests.

Installed Miniflare uses its new version-five API.
The initial harness failed with `ERR_VALIDATION`: `workers` was undefined.
The exported `convertV4MiniflareOptions` helper resolved that configuration mismatch.
The next harness attempt rejected conversion of the network-form `outboundService` option.
Using a throwing outbound handler resolved this without allowing network access.
These were harness errors, not application build failures.
An initial version command incorrectly passed the native binary to Node.
Direct execution then confirmed `workerd 2026-09-03`.

The final runtime started at `http://127.0.0.1:8788/` and returned:

| Request | Status | Result |
| --- | --- | --- |
| `/` | 500 | Clerk missing secret key |
| `/pricing` | 500 | Clerk missing secret key |
| `/api/cities` | 500 | Clerk missing secret key |
| `/dashboard` | 500 | Clerk missing secret key |
| `/manifest.json` | 200 | Application manifest, 1,604 bytes |

The exact runtime blocker was:

```text
@clerk/nextjs: Missing secretKey. You can get your key at https://dashboard.clerk.com/last-active?path=api-keys.
```

Clerk requires a server secret even for public routes through its middleware.
This experiment did not remove Clerk, bypass authentication, or add a server secret.
The manifest response proves local static serving, not successful application rendering.
No browser test, hydration test, authenticated flow, database request, or paid generation test passed here.
Story rendering and video encoding remain untested on Workers.
The production Next configuration, redirects, headers, and deployment integrations also remain outside this baseline.

## Evidence Files

All paths below are relative to `.cloudflare-preview/logs/`:

- `snapshot-scan.json`: exact snapshot file allowlist, commit hash, and scan findings.
- `1788783753406-node.log`: first build and exact matcher error.
- `1788783821381-node.log`: successful adapted build and route table.
- `1788783919511-node.log`: saved compatibility report.
- `1788783960363-workerd.log`: native workerd version.
- `1788784041604-node.log`: initial Miniflare configuration failure.
- `1788784063072-node.log`: outbound configuration conversion failure.
- `1788784107100-node.log`: successful runtime startup and HTTP tests.
- `runtime-results.json`: response status, content type, length, and short excerpts.

## Status

The adapted build passed. Local workerd started, but application requests failed at the authentication boundary.
The runtime has been stopped. No preview server remains running.
Further application tests need a separately approved authentication strategy.
Root application code, root dependencies, and existing workspace changes remain unchanged by this experiment.
No Worker compatibility claim or production migration approval follows from this experiment.
A protected remote deployment requires a separate approval gate.
