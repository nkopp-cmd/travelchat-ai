# Authentic Discovery

This is a primary product goal, alongside the full Cloudflare migration.
The user requested a major improvement in authenticity, visual usefulness, spot information, maps, and trip building.
The target is better travel decisions, not more decoration or more generated content.

## Product Direction

Audience: visitors who want to understand a place quickly and build a practical trip around it.
Core journey: discover a place, judge it, inspect the area, add it to a trip, and navigate confidently.

Direction A: a neighborhood field guide with genuine imagery, compact facts, a useful map, and direct planning actions.
Direction B: a cinematic atlas led by immersive 3D and generated previews.
Choose Direction A first. It serves real decisions and makes uncertainty visible.
Use Direction B later as an optional presentation mode, not a replacement for dependable discovery.

Keep Localley's existing typography roles, neutral surfaces, violet accents, and accessible interaction foundation.
Change information order and task connections before introducing another visual theme.
Use one representative Seoul spot page and linked map before extending patterns across the application.

## Confirmed Baseline

The audit inspected live source at `e96b003` and queried public Seoul spot fields read-only.

| Measure | All Seoul records | Publicly visible records |
| --- | ---: | ---: |
| Records | 479 | 390 |
| Stored photo entries | 1,385 | 1,160 |
| No stored photos | 13 | 0 |
| Three stored photo entries | 458 | 384 |
| Within-spot duplicate stored identities | 0 | 0 |
| Cross-spot repeated stored identities | 0 | 0 |

All visible entries use Google photo proxies. These counts do not prove successful delivery or distinct image pixels.
The code can replace different expired references with the same new photo.
The detail gallery also supplies one shared stock fallback to all its image slots.
That fallback can return HTTP 200 while the page continues to imply a real place photo.
The proxy can cache those fallback bytes for 30 days.

Three static fallback images were opened during review.
The configured fallback for Seodaemun Independence Park showed Singapore's Merlion and Marina Bay Sands.
Other reviewed assignments showed generic food or retail images without verified venue association.
These are proven fallback assignments, not measured counts of their appearance in production sessions.

Other confirmed gaps:

- Missing timing information becomes "Anytime", which does not establish opening hours.
- Some displayed local percentages originate from a score-to-percentage mapping, not observed visitor counts.
- The detail map is decorative, while the discovery map shows only its current 24-result page.
- Valid coordinates and a specific-looking address do not establish a verified entrance.
- Saving a spot creates a bookmark, not an itinerary stop.
- The trip wizard has no required-anchor spot contract.

## Milestone 1: Trustworthy Images

Remove generic stock substitution from venue evidence images.
Do not place AI images in a real venue gallery to hide missing photos.
Show an honest unavailable state when a genuine photo cannot be obtained.
If one useful photo exists, show one photo. Do not fill three slots with duplicates.

Resolve a gallery as one coordinated set of distinct images, not independent fallbacks per slot.
Validate returned images and compare actual content where the source terms permit it.
Use source identity checks first, then bounded duplicate-pixel detection and editorial review as appropriate.
Different URL strings alone do not establish different photographs.

Track provider, canonical place association, attribution, rights, review state, and relevant dates.
Distinguish provider-listing association from an editor-confirmed photograph of the place.
Prefer exterior, useful interior, and relevant activity or food images when genuine options exist.
Do not infer those categories solely from a filename.

Google photo names expire and must not be cached under the retrieved API documentation.
Replace the persisted-name approach with a compliant retrieval contract.
Keep required author attribution wherever the image is displayed.
Check regional terms and map-display restrictions before combining provider data with a non-Google map.
Do not copy provider photos into R2 merely to avoid their usage restrictions.
Use R2 for images whose license or ownership permits that storage.

Invalidate old fallback cache entries or use a new verified response namespace during rollout.
Never cache missing, unrelated, or placeholder imagery as verified venue content.
Add a simple way to report an incorrect, duplicate, outdated, or sensitive image.

The first implementation should prove the delivery path on a reviewed 20-30-place Seoul collection.
Expand only after the source, rights, error handling, and distinct-image tests pass.

## Milestone 2: Useful Spot Pages

Put the practical decision summary before repeated generic confidence panels.

| Section | Required purpose |
| --- | --- |
| Photo and identity | Show the real place, category, and neighborhood |
| Why visit | One place-specific, sourced explanation |
| Practical facts | Hours, cost basis and currency, useful visit duration, and booking need |
| Localley score | Scale, evidence, reviewer, and uncertainty |
| Map and access | Venue position, location confidence, entrance or transit information where verified |
| Local story | Short guide-style background with sources and review date |
| Actions | Add to itinerary, start a trip here, save, and directions |

Show "Hours unknown" when hours are unknown.
Keep editorial best-time advice separate from actual opening schedules.
Do not label a place open now without a current schedule, timezone, and relevant exceptions.
Distinguish entry prices from optional tour prices and estimates from bookable quotes.
Do not generate historical claims, personal observations, or visitor percentages merely to fill a section.

Every important fact needs an explicit source and freshness state, or an honest unknown state.
Retain bilingual names and preserve long Korean text without hiding essential information.
Avoid repeated panels that restate the same address, photograph status, or generic category advice.

## Milestone 3: Spots Become Trips

Keep Save as a bookmark action. Add two separate planning actions:

1. Add to itinerary: choose an owned trip, day, and position.
2. Start a trip here: open planning with the spot as a required anchor.

Use the canonical spot ID, not copied client text, to resolve the place server-side.
Preserve existing itinerary notes, ordering, and user edits.
Use an expected revision and idempotency key to prevent lost edits or duplicate insertion.
Detect existing visits and offer an explicit choice before adding another occurrence.
Require ownership checks and preserve the selected place through authentication.

An anchor-based generated plan must retain the canonical anchor or return an explicit planning failure.
Do not silently replace an uncertain or closed anchor with another place.
Adding a known spot to an existing trip should not require an LLM call.
Start with external directions links until route calculations are genuinely available.
Do not label straight-line distances as walking routes or calculate invented travel times from them.

## Milestone 4: A Useful Interactive Map

Replace the decorative detail grid with the real shared map.
Keep map, list, selected spot, and trip stops synchronized.
Preserve filters, selected places, and map bounds when users move between views.
Fix landing search so entering text does not discard the selected city.

Add an explicit "Search this area" action with bounded geographic queries.
Make result limits, loading, stale requests, and empty areas visible.
Use clustering where needed instead of unreadable overlapping pins.
Represent a selected trip as ordered stops, with clear distinctions between connections and calculated routes.

Classify locations as valid coordinates, matched venue, area estimate, or confirmed entrance.
Use shape, labels, and accessible text to distinguish approximate locations.
Retain an accessible list when the map or WebGL is unavailable.
Do not require device location permission for ordinary area browsing.

Filters should serve real decisions: category, dates, budget, and verified opening status where supported.
Events and everyday experiences remain separate modes with shared place identity.
Expired or cancelled events must not appear as current suggestions.

## Milestone 5: Optional 3D And Video

Blender creates assets and rendered scenes. It is not the interactive map engine.
Evaluate MapLibre for pitched maps, building extrusions, terrain, and selected model overlays.
Retain a fast 2D and list alternative.

Verify Seoul coverage, licensing, attribution, and device performance before selecting a 3D data source.
Investigate Korean public spatial services where appropriate; their suitability and commercial terms are not verified yet.
Do not call simple extruded buildings photorealistic.
Use Blender only for selected, accurately placed landmark models or controlled camera sequences.
Do not hand-model an entire city as the first solution.

MiniMax may turn approved visual material into presentation videos later.
Generated video is not evidence of current streets, building details, crowds, entrances, or conditions.
Keep map renders, model renders, genuine photos, and AI visualizations as distinct media types.
Include the AI disclosure in exported frames when imagery is generated, even if a paid user removes brand watermarks.
Keep captions and route facts separate from generated pixels, using the existing overlay safety constraints.

## Measurement And Release Gates

These are targets, not achieved results or a claim of a measured tenfold improvement.

- Zero stock or generated images represented as venue evidence in the reviewed pilot.
- Zero duplicate displayed photos within a reviewed gallery.
- Visible source attribution wherever required, with no hidden unknown-image substitution.
- All essential unknown facts labeled clearly rather than filled with generic assertions.
- A signed-in user can add a place to a compatible trip in at most three clear actions.
- A visitor can identify purpose, location, cost state, and timing state within 30 seconds in usability testing.
- Map selection and result lists remain consistent after filtering, navigation, and failed requests.
- Owner checks, revision conflicts, and duplicate-submission tests pass for trip insertion.
- Mobile and desktop screenshots are opened and reviewed with real pilot content before rollout.
- Normal text contrast meets 4.5:1; required non-text contrast meets 3:1; primary touch controls target 44 pixels.
- Keyboard, screen-reader names, reduced motion, long text, and non-WebGL fallback are verified.
- Photo success, wrong-photo reports, time to a usable trip, and return usage are measured against a recorded baseline.

Do not claim the product is ten times better merely because it has more features or animation.

## Costs And Delivery

The final infrastructure remains Cloudflare-only, with Better Auth replacing Clerk.
Build the new discovery services and interfaces for that target.
First prove how existing photo URLs and pages reach a replacement service before routing live requests to it.
Do not change production routing or trigger another Vercel build from the migration branch without release checks.

Trustworthy photos, factual labels, and useful planning are product deliverables, not optional work after infrastructure.
Do not make them wait for cinematic video or a city-wide 3D project.
Use one product milestone and one bounded infrastructure task at a time.

Keep basic discovery and truthful facts useful without a paid plan.
Monetize better planning and approved media generation, not access to accurate opening hours or honest photo labels.
Affiliate offers must be disclosed and must not affect scores or organic ranking.
Do not present mock inventory, random prices, or unmatched offers as price comparisons.
Prefer permissioned local imagery, on-demand loading, and reusable reviewed text over repeated paid generation.
Set request budgets before bulk photo verification or new tile and routing services.
The existing $20 media test ceiling is not permission for an unrestricted catalog refresh.

## References And Audit Pointers

Reviewed on 2026-09-08. These references are inspiration or API guidance, not copied product assets.

- https://wanderlog.com/ : keep itinerary and map connected; do not copy its branding or testimonials.
- https://english.visitseoul.net/ : separate events, practical travel information, areas, and editorial local stories.
- https://maplibre.org/maplibre-gl-js/docs/examples/display-buildings-in-3d/ : pitched building extrusion is possible without a custom city model.
- https://developers.google.com/maps/documentation/places/web-service/place-photos : photo-name expiry, attribution, and source restrictions.

Live-code evidence at `e96b003`:

- `app/api/places/photo/route.ts:52-123,176-205`: repeated recovery selection, stock substitution, and cache duration.
- `app/spots/[id]/page.tsx:252-280`: shared gallery fallback; `1591-1609`: decorative detail map.
- `lib/spots/spot-fallback-images.ts:1-51,133-141`: category pools without geographic restriction.
- `lib/place-images.ts:341-375`: URL-shape checks do not verify delivered pixels.
- `lib/spots/detail-normalization.ts:132-133`: unknown timing becomes "Anytime".
- `scripts/import-curated-spots.ts:449-459`: score-to-percentage mapping.
- `components/spots/spots-map.tsx:20-90`: current-page map scope.
- `app/api/itineraries/[id]/update/route.ts:23-70`: existing whole-plan update contract.

This checkpoint adds the audited goal and release order. It does not deploy gallery, map, or itinerary changes.
