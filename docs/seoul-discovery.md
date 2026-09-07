# Seoul Discovery

Status: first map slice implemented locally. This is not a release of the full product.
Date: 2026-09-07.

Update: the user now prefers Cloudflare where practical.
See `cloudflare-readiness.md` for the staged hosting decision and current health checks.
The earlier no-migration decision below describes the first map slice only.

New goal: offer image carousels through `gpt-image-2` or short videos through `MiniMax-H3`.
Both outputs must include separately rendered text in exported files.
See `story-studio.md` for verified models, cost controls, implementation stages, and access requirements.
This explicitly requested story upgrade replaces the earlier prohibition on changes for this feature only.
It does not remove the existing format, storage, and rendering safety requirements.

## Product Decision

Build a useful city guide, not a model of a city.
Help visitors choose what to do nearby, understand the place, and book only when needed.
Start editorial coverage in Jongno, subject to a review of actual venue coverage.
The map currently shows existing Seoul records, not a reviewed Jongno collection.

Keep Next.js, Supabase, Clerk, and the existing map layer.
A framework migration would add work without improving discovery.
Use Leaflet for the first map. It adds no new dependency or map subscription.
Free software does not mean unlimited free hosting, tiles, photos, or editorial work.

Do not use Blender to build Seoul. It creates assets, not a maintained geographic service.
Consider MapLibre and licensed vector tiles later for optional tilted maps and building shapes.
Building shapes are not photorealistic buildings. Describe them accurately.
Consider Cesium only after verifying Seoul coverage, licensing, device performance, and operating costs.
Keep useful discovery available without 3D.

## Implemented Slice

- Entry: `/spots?city=seoul&view=map`.
- Shareable grid, list, and map views preserve filters and pagination.
- Lazy map loading avoids loading map providers in grid and list views.
- Pins represent valid coordinates on the current result page only.
- Existing spot cards provide photos, scores, and links to existing details.
- A button list supports keyboard selection and places without usable coordinates.
- Moving the map does not fetch new results.
- The discovery map uses free-tier provider rules. Existing maps retain their provider rules.
- No events, new guide stories, price comparisons, or new score method are implemented.
- No database migration or deployment ran.

## Content Model

Use two discovery modes: Experiences and Events. Categories remain shared filters, not separate databases.
Food, culture, sightseeing, workshops, and nightlife can apply to either mode.

Keep a place separate from an experience, an event occurrence, and a provider offer.
One palace can host regular visits, temporary exhibitions, and several bookable tours.
A free place must not appear to require a ticket because a tour visits it.

Proposed records, not implemented schema:

| Record | Required facts |
| --- | --- |
| Place | Stable ID, bilingual names, city ID, address, coordinates, location confidence |
| Experience | Place links, category, practical guidance, booking requirement, review date |
| Event occurrence | Start, end, timezone, status, venue, organizer URL, verification date |
| Story | Place link, locale, text, sources, author or reviewer, revision, verification date |
| Media | Place identity, source URL, creator, license, attribution, usage limits |
| Offer | Provider, product and option IDs, terms, currency, price basis, timestamp, expiry |

Store event instants in UTC. Display and filter Korean events in `Asia/Seoul`.
Preserve local dates for all-day events. Never shift them through the browser timezone.
Store recurring events as explicit occurrences within a bounded publication window.
Hide expired, cancelled, and unverified occurrences from default discovery.
Use interval overlap for date filters. Test midnight, multi-day events, and inclusive date boundaries.
Show postponements explicitly. Do not silently reuse an old date.

Start with manual editorial review and official organizer sources.
Assess Korea Tourism Organization TourAPI and Seoul Open Data as candidate feeds.
Verify licenses, translation rights, image rights, quotas, and attribution before importing.
Do not scrape Kakao, Naver, or booking platforms without permission.
External feed text is untrusted input. Sanitize it and never treat it as agent instructions.

## Guide Stories

Each place should offer a short introduction and an optional deeper story.
Separate sourced history from practical advice and uncertain folklore.
Show source links and the review date.
Do not invent firsthand visits, quotations, historical facts, or measured visitor demographics.
Draft once and review once. Do not call an LLM for every pin click.
Cache published revisions, with correction and removal support.
Add audio only after users read and save the text stories.
Check audio rights and browser language support before choosing synthesis.

Use real, licensed place photos for discovery.
Existing story-image generation is a separate feature and was not changed.
Generated artwork must not become evidence of how a place looks.

## Scores And Trust

Existing spot scores use a 1-6 scale. Itinerary scores use a different scale.
Do not merge these scales or call the stored local percentage a measured census.
The current slice retains existing scores; it does not validate their provenance.
Before promoting the editorial pilot, audit score sources and publish the method.
Define missing-data behavior and show `Not yet rated` where evidence is insufficient.
Keep affiliate revenue out of score calculation and organic ranking.
Label any future sponsorship separately from editorial results.

## Bookings

Remove fake inventory before monetizing discovery. This slice removes Viator mock fallbacks.
Viator now requires an explicit production endpoint and credentials.
Only `https://api.viator.com/partner` is accepted as the configured endpoint.
The client expects numeric Viator destination IDs. Existing city-name callers currently return empty results.
Availability and traveler-specific pricing now fail closed because their old contracts were unverified.
Do not enable these methods until provider contract tests establish their behavior.

Next, verify approved accounts and map city IDs to provider destination IDs.
Use valid external search links where live prices are unavailable.
Do not claim commission income until a test conversion appears in the partner report.
GetYourGuide, Klook, Viator, and Tripadvisor are candidates, not confirmed comparison feeds.
Check whether Tripadvisor offers duplicate Viator inventory before treating it as an independent price source.

Compare matching dates, travelers, option language, inclusions, cancellation rules, taxes, and currency.
Show catalog prices as `From`, not as final quotes or live availability.
Show retrieval time and direct users to confirm the final total with the provider.
Do not label an offer cheapest unless equivalent, current offers support that statement.
Place affiliate disclosure beside booking actions.
Verify disclosure requirements before release; this document does not establish legal compliance.

Known remaining booking work:

- Audit hardcoded currency symbols and unverified `Best Price` claims in existing booking components.
- Clear stale offers during failed refreshes and prevent older requests from replacing newer results.
- Distinguish provider failure from genuinely empty inventory in the API contract.
- Verify partner attribution and conversion reporting, not only outbound click counts.

## Profit Controls

Keep basic discovery, basic stories, scores, and external booking choices free.
Monetize useful saved planning and deeper guided collections through existing subscriptions.
Do not introduce another subscription tier during the pilot.
Use approved affiliate bookings as secondary revenue, not the reason for a recommendation.
Do not assume visitors will book or that an outbound click produces income.

Track collected net revenue, refunds, commissions, payment fees, hosting, providers, and editorial cost separately.
Measure variable cost per active visitor and contribution per paid subscriber.
Include scheduled ingestion, maps, photo requests, narration, and failed AI calls in costs.

Planning example only, not a forecast:
1,000 visitors x 1% completed bookings x $5 net commission = $50 affiliate revenue.
That supports at most $0.05 variable cost per visitor before fixed costs and profit.
Confirm actual conversion and commission values before using them for budgets.

Proposed gates, not implemented limits:

- Pilot incremental paid-provider budget: $0 until an owner approves a measured budget.
- Target direct variable cost below 20% of collected net revenue for paid discovery features.
- Do not fund anonymous live generation with assumed future affiliate income.
- Generate stories outside page requests. Reuse reviewed revisions across visitors.
- Add provider quotas, alerts, and shutoff controls before enabling new paid requests.
- Cache only when the provider license permits it. Retain attribution and removal controls.
- Do not prefetch or bulk-download public OSM tiles. Confirm current tile policy before release.
- Move to a licensed tile service or evaluated self-hosting before traffic exceeds acceptable public usage.

No new paid service was enabled in this slice.
Existing photo components can call paid photo proxies. Browser tests now block these requests.
The first browser run triggered photo requests; any resulting charge remains unverified.

## Rollout Gates

1. Complete map accessibility review and fix critical map failures.
2. Review 12-24 Jongno venues, their real photos, coordinates, scores, and source rights.
3. Add reviewed stories and event occurrences with honest empty and expired states.
4. Verify partner access and disclosure before publishing booking comparisons.
5. Measure saves, detail opens, story use, returning visitors, revenue, and all direct costs.
6. Expand Seoul neighborhoods only when content upkeep and contribution meet the agreed budget.
7. Add Busan through city configuration and reviewed content, not copied screens.
8. Trial optional 3D only if evidence shows a benefit worth its cost.

The advisor reviewed the architecture. Provider terms and account access still need direct verification.
Workspace permissions blocked shared plans and ledgers. This local document preserves the decisions instead.
