# Authentic Discovery Repair

Target: the current live application, while the Cloudflare migration remains separate.
This repair does not activate new AI media, change billing, or apply database migrations.

## Scope

- Fresh, coordinated venue galleries instead of unrelated stock substitutions.
- No automatic replacement of every expired reference with the first available photo.
- Distinct resource names and visible provider author attribution.
- Explicit unavailable states, with no venue photograph inferred from a successful fallback response.
- Direct, unoptimized photo delivery with no-store behavior and a new URL version.
- Lazy card requests and in-flight-only metadata deduplication.
- A real detail map with honest location wording.
- Unverified visit timing and editorial percentage labels instead of unsupported certainty.

The existing photo records are legacy inputs used to identify the provider place ID.
They are not rewritten in this release. Legacy data cleanup and a complete provider-rights audit remain separate work.
Resource-name uniqueness does not prove pixel uniqueness in provider listings; real gallery checks are required before promotion.

## Checks

The initial full suite passed 842 tests, followed by 18 additional rate-key regression cases.
The production build passes using explicit local placeholders, without downloading sensitive provider keys.
Real provider and database behavior must be checked on a production-configured candidate before changing live aliases.

Vercel documents that it overwrites the ordinary forwarded-for header, except for trusted-proxy arrangements.
The new photo routes explicitly use a validated platform forwarded-for address and fail closed to an unknown bucket.
This is not evidence of a confirmed existing Vercel IP-spoofing exploit.

## Hosted Gate

Inspect real venue photos, attributions, failure states, map interaction, and mobile/desktop layout.
Use bounded Google requests within the already approved media test budget; do not call AI generation providers.
Keep cache, rate-limit, unsupported-source, and location-match failures visible rather than substituting invented evidence.
Promote only the tested candidate. Preserve the prior deployment for rollback.

## Hosted Gate Result — 2026-09-22: FAILED, not promoted

Candidate: `dpl_4L7VRHKY13Qd4ZG9b53GJcorcyx5` (`https://travelchat-fhms618mz-nkopp-cmds-projects.vercel.app`),
built from `60ffc7c` with production settings and `--skip-domain`. Hosted build and TypeScript passed.
Live production stayed on `dpl_FA3tzDj3zDmxLGEFEjvoXv7d6rgg` (main `e96b003`).

- `/spots?city=seoul` returned 200 with 24 spot links.
- `GET /api/spots/<id>/photos` returned 503 `unavailable` for four real Seoul spots, in about 2.2 s each.
- A random nonexistent UUID and `/api/places/photo` also returned 503 in about 2.2 s.
- That timing matches the 2000 ms Upstash limiter timeout, which runs before the database and Google calls.
- No real venue photo was served, so photos, attributions, and layout could not be inspected.
- No Google Places request was reached, so no media budget was used.

Cause to verify: the Upstash Redis store behind the Sensitive `UPSTASH_REDIS_REST_*` variables does not answer
within 2 s from Vercel. The values cannot be pulled locally, so the store could not be probed directly.
The older shared limiter falls back to memory on errors, which can hide a dead store on the live site.
Before retrying: restore or replace the Upstash store, confirm a 200 PING, redeploy a candidate, and repeat this gate.

## Hosted Gate Result — 2026-09-23: PASSED on Cloudflare (claude)

Candidate: Worker `localley-next` version `b92543b3-07b3-452b-a971-95db71e15cc0` (this branch merged with main,
photo limiter moved from Upstash to Workers bindings `RATE_LIMIT_120`/`RATE_LIMIT_40` keyed by `cf-connecting-ip`,
still fail-closed). Canary at 1% beside `94422e32`, tested with `Cloudflare-Workers-Version-Overrides`.

- `GET /api/spots/<id>/photos` for four real Seoul spots: 200, `status: available`, 4 distinct Google listing photos
  each, with author attributions (0.7–1.8 s).
- `/api/places/photo` for one photo per spot: 200 `image/jpeg`, 388–644 KB, 0.4–1.5 s.
- Nonexistent UUID 404 (0.26 s), invalid id 400, proxy without name 400.
- Rate limit: a fast burst of 150 requests returned 66 × 429 (Cloudflare limits are approximate per location).
- Spot detail page, headless Chromium desktop 1366×900 and Pixel 7: 4 venue images loaded, 4 attribution nodes,
  no page errors, photo API calls all 200. Screenshots inspected.
- Google usage: 4 metadata lookups on first load plus 4 image fetches, then the browser checks; no AI providers called.
