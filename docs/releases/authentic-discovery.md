# Authentic Discovery Repair

## Deployment Cancelled

The user confirmed that all future deployments must target Cloudflare, including urgent UI repairs.
The unpromoted Vercel candidate `dpl_7wU4YH4qfAG4Esdxum9MijaWJSot` was deleted.
The Vercel project's Git connection was disconnected. No live domain was promoted to that candidate.
The tested photo and map changes are preserved for the Cloudflare implementation.
The earlier Vercel release plan below is historical and must not be resumed.

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
