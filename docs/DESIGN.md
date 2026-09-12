# Localley Design

## Scope

The park photo improvement reuses the existing image, attribution, and map components without changing the layout.
The selected 2018 photograph shows the actual park landscape. It must remain uncropped and explicitly historical in the card description.
It replaces only the existing park's missing-image state, not any unresolved business image.
Source and copyright evidence are recorded in `releases/park-photo.md` and the pilot license notice.
The source JPEG was opened before approval. Local and hosted card/map screenshots remain required before this increment is delivered.
The local real-catalog rehearsal passed across 390/900/1440 pixels. The park becomes the hero under the existing first-photo rule.
The wide park landscape and mobile map were opened in `test-results/native-catalog/run-O5QwXL/`; no unrelated venue image is substituted.

The native account timeout state reuses the existing error surface and explicit retry control; no new layout or component was added.
The current identity stays hidden after a failed mapping check. Public catalog browsing remains available without assuming private access.
Local mobile and desktop timeout screenshots were opened in `test-results/cloudflare-frontend/run-kHpMFL/`.
The real browser checks retain visible focus, reduced motion, measured contrast, and no overflow in the affected state.
Browser evidence now uses unique run directories rather than overwriting prior release screenshots.
Hosted review found that a generic 403 was incorrectly shown as unverified email. The corrected consumer distinguishes those states.
Final read-only account screenshots were opened at 390/900/1440 pixels under `.preview-private/account-release-RRVkBe/browser/`.
Private identity stays hidden, and the panel makes no unsupported verification claim. Hosted human recovery remains unverified.

The native email preference panel reuses the existing settings component, Radix Switch, buttons, labels, icons, and root tokens.
It follows the existing restrained settings layout, rather than introducing a separate account dashboard.
New native accounts start off; legacy consent requires import. Unknown state never appears as a checked switch.
The four toggles use 44px targets and explicit focus. Save confirmation reflects the actual server response.
The first screenshot review found centered off-state thumbs and crowded checked thumbs. Explicit alignment corrected both.
The pending-place prompt stays hidden in this panel without clearing the pending choice.
Local browser evidence covers off, persisted, and error states at mobile, tablet, and desktop widths.
All nine final screenshots were opened. Preference text measured at least 4.83:1 contrast; targets measured at least 44px.
Keyboard operation, visible focus, reduced motion, switch alignment, and no overflow passed at 390/900/1440 pixels.
See `releases/native-email-preferences.md` for the verification record and hosted acceptance limits.
No new component library, copied source, font, or paid asset was added.
The panel is now deployed to the protected preview. Hosted signed-out preference and catalog screens were opened at three widths.
Private controls remained hidden. Seven image hashes, exact credits, eight places, and fifteen map selections passed live checks.
Early captures preceded image decoding; separate settled captures confirmed the real photos and retained both evidence sets.
Hosted authenticated preference and recovery acceptance remain open; the available service identity stays read-only.

The native-source expansion reuses the existing preview cards, photo credits, and map for four additional reviewed venues.
Archive and historical photographs remain explicitly dated or marked date-unavailable. No market image stands in for an unverified stall.
Map popup placement now uses non-animated public Leaflet methods and measured padding to avoid the mobile zoom controls.
Fixture review covered eight places and fifteen native map selections at 390, 900, and 1440 pixels.
Public license notices and source-policy links are part of the acceptance checks, not optional decoration.
The expansion is now live in protected preview: eight cards and map pins, seven reviewed images, and explicit historical/photo-rights context.
All fifteen native map selections passed at three widths with real tiles and no overlapping popup controls.
The six unsupported image/branch cases remain unpublished rather than receiving substitute city or market imagery.

Discovery remains an addition to the existing Localley application, not a separate replacement site.
The integrated flow connects a spot page to owned trip selection and the existing editor.
It uses current buttons, cards, typography, and city data without a new UI library.
Native labeled selects handle day and position selection; no new interaction primitive needs sourcing.
See `releases/integrated-discovery.md` for local evidence and remaining release checks.
The next review covered the built app's landing page, real spot page, and selected-place wizard at three widths.
It found clipped tablet progress labels; compact steps now fit and retain accessible names with 44px targets.
Canonical place identity stays read-only while visit notes remain editable.
Clerk rejected the private HTTP test origin, so authenticated review still requires supported HTTPS.
The actual bookmark controls now also pass a separate native Better Auth journey over local HTTPS.
That journey uses temporary accounts and the existing controls, not a new production design.
See `releases/better-auth-integration.md` for reviewed states and the explicit live-provider boundary.
The same editor UI now serves the native D1 adapter, with no replacement design or new UI library.
Native review covered loaded, staged, saved, conflicted, revoked, and cross-account states at three widths.
The review found a false draft-retention message after access loss; the corrected editor now closes without that claim.
Stable activity identities also preserve pending edits when insertion changes array positions.
See `releases/native-itinerary-editor.md` for evidence and remaining migration limits.
Native collection deletion now restores focus to its persistent collection region after reloading or entering the empty state.
Confirmation names the selected itinerary. Hyphenated route titles remain distinguishable instead of losing their first city.
The same collection and editor also run in the actual protected-preview entry, with unsupported actions hidden.
Save-state text has explicit light and dark colors. Verification and limits are recorded in `releases/native-collection-delivery.md`.
Live preview review on 2026-09-12 confirmed the new Trips navigation at mobile, tablet, and desktop widths.
The public catalog, credited photos, and real map tiles remain intact. Unauthenticated Trips access stays explicitly blocked.
Private collection/editor visual checks remain local authenticated evidence, not hosted human acceptance.

The restricted Cloudflare preview is hosted at `https://preview.localley.io` as of 2026-09-11.
Hosted review covered 390, 900, and 1440 pixels with real photos and map tiles.
See `../cloudflare/auth-proof/docs/hosted-preview.md` for evidence and remaining checks.
This three-place pilot does not replace the live service or establish complete accessibility compliance.

Primary product direction now includes `AUTHENTIC_DISCOVERY.md`.
The user requested an order-of-magnitude improvement in genuine imagery, useful spot information, maps, and itinerary integration.
Choose the neighborhood field-guide direction before an optional cinematic atlas.
Preserve the existing identity while changing information hierarchy and task completion.
Do not use stock substitution or AI artwork as evidence of a real venue.
Do not count authentication fixtures or synthetic preview content as a reviewed travel product.
Build and review one real Seoul spot page with its linked map before extending the new composition.
The detailed audit, measurable gates, media rules, and phased implementation order are in the new brief.

Latest migration frontend: `cloudflare/auth-proof/web` connects real local Workers assets, Better Auth, and D1.
It preserves Localley's neutral surfaces, violet accents, named controls, and existing font asset.
This is an isolated migration UI, not a replacement of the live website yet.
The source and design selection record is `cloudflare/auth-proof/web/README.md`.
The final browser evidence is `cloudflare/auth-proof/docs/browser-evidence.md`.

Reviewed 19 screenshots across public, authenticated, recovery, empty, error, and long-content states.
All 212 measured control instances met the 44x44 pixel target.
Measured text contrast was 6.48:1 or greater; control boundaries measured 4.83:1.
Keyboard focus, reduced motion, Korean wrapping, and overflow checks passed.
The signed-in reset heading and the focused skip-link placement were corrected during review.
Zoom, screen-reader speech, other browser engines, and a complete WCAG audit remain outstanding.
Screenshots live under `test-results/cloudflare-frontend/` and contain synthetic data only.

Latest story addition preserves the existing identity and Radix interaction foundation.
Image carousel and Video now share the existing story dialog, with actual availability and job states.
The full browser report is `story-studio-browser-review.md`, including five-source selection and measured accessibility checks.
No alternate dialog, toast library, or decorative AI activity component was added.
Story notices now stay inside the dialog rather than covering its heading.

The export renderer adds local Noto Sans KR Regular, weight 400, under OFL 1.1.
Its source revision, asset checksum, supported glyphs, and redistribution duties are recorded in `lib/fonts/README.md`.
Production page typography was not globally replaced; the browser harness loads that font for its Korean fixtures.
The test-only harness is reachable at `http://127.0.0.1:4174/?scenario=ready`.
It uses simulated API data and explicitly states that it cannot create generation charges.

All seven browser tests passed at 390, 900, and 1440 pixels after fixing four observed defects.
Measured targets and contrast pass the stated checks; this is not a complete WCAG audit.
The final production build and 1,560 normal tests passed. One opt-in encoder integration remains skipped in that normal run.

This records the existing discovery identity and the map addition dated 2026-09-07.
It does not establish a new app-wide visual direction.
Audience: visitors who want useful local places, clear facts, and simple planning.
Primary task: filter places, inspect the map, then open one place.
Traits: real place imagery, compact filters, and restrained violet accents.

Reuse the existing tokens in `app/globals.css` and existing typography from the application layout.
New map surfaces use `border-border`, `text-muted-foreground`, and existing button variants.
Keep the existing grid and list composition. Add the map as a third view, not another dashboard.
Numbered pins correspond to named buttons. This keeps map content accessible without precise pointer use.
The detail card retains the established score and photo design.
No new fonts, packages, custom dialogs, motion effects, or copied external components were added.

## Existing Sources

| Source | Use in this slice |
| --- | --- |
| Local `components/ui/button.tsx` | Existing accessible button variants; no new implementation |
| Local `components/ui/map.tsx` | Existing lazy provider selection and map rendering |
| Leaflet 1.9.4, https://leafletjs.com/ | Existing dependency; interactive numbered markers |
| Local `components/spots/spot-card.tsx` | Existing real content and detail navigation |
| Local `docs/ui-ux-loop.md` | Existing responsive and accessibility review process |

These are reused components, not newly sourced or copied code.
The new composition does not require specialist AI or animation components.
OSM tile attribution stays visible through the existing Leaflet layer.
An attempted fetch of the current OSM tile policy timed out. Terms verification remains a release gate.

## Evidence

TypeScript check passed with `npx tsc --noEmit --incremental false`.
Focused unit tests cover coordinate rejection, selection, scope, URL preservation, and loading boundaries.
The final focused run passed 61 tests across eight files.
ESLint passed for all changed TypeScript files. `git diff --check` also passed.
The full unit suite and production build were not run.
Browser tests use `/spots?city=seoul&view=map` with real configured content.
The tested response contained 390 Seoul spots and 24 pins on its first page.
This count is test evidence, not a marketing claim or editorial quality assessment.

Playwright passed at 390x844, 900x1000, and 1440x1000.
Checks cover ordinary marker clicks, keyboard list selection, view changes, filter retention, and document overflow.
Screenshots were captured and opened for review.

Evidence directory: `test-results/spots-map-safe-selection/`.
Each viewport contains `selected-pin.png`, `keyboard-selection.png`, and `filtered-map.png`.
The directory is a local test artifact, not a required production asset.

## Remaining Limits

### Maintenance Verification

Latest video proof uses the actual isolated encoder through the processing service.
The service integration uses synthetic media and mocked provider/storage boundaries, not a live generated scene.
Reviewed `test-results/story-video-delivery/frame.png`; the local video is `test-results/story-video-delivery/sample.mp4`.
Output is four seconds of portrait H.264 with captions included in the frames.
Normal overlay output no longer contains proof-only labels; tests must request those explicitly.
Long titles wrap and abridge visibly. Long captions preserve the AI disclosure.
Korean font support remains blocked; the submission API rejects unsupported text before charging.
This backend integration adds no new video screen. Browser review of the full creator remains pending.

Story export proof: a separate transparent text overlay was composited into a four-second portrait H.264 MP4.
The reviewed extracted frame is `test-results/story-video-overlay/frame.png`.
It clearly labels the visual as synthetic test input, not real travel footage.
The frame preserves the 180px top and 320px bottom safe zones.
Pixel and encoding checks are recorded in `test-results/story-video-overlay/evidence.json`.
This is a technical export proof, not a finished video design or a reviewed Korean-language template.
Pending-image polling and explicit retry behavior have component coverage; browser visual review remains outstanding.

Latest destination follow-up: fixed badge overlap and compact name clipping in `step-destination.tsx`.
Noncompact badges and labels use separate normal-flow rows with minimum card heights.
Compact cards retain their density but grow for wrapped names, with selection inside the Ready tag.
The existing image, gradient, font, and color system remains unchanged.

`e2e/destination-cards.spec.ts` passed at 390, 900, and 1440 pixels.
Checks cover Popular and Beta badges, keyboard selection, card containment, and long compact names.
Captured and opened screenshots under `test-results/destination-cards/`.
The selected `Ho Chi Minh City` name fits without footer or Ready-tag overlap at all three widths.
Paid photo and generation requests were blocked. No trip was generated during these checks.
The earlier destination-overlap follow-up is resolved; full accessibility measurement remains open.

The latest production build and all 733 tests passed after worker and destination fixes.

After maintenance, strict map checks passed at 390, 900, and 1440 pixels on Next `16.3.4`.
The flag `PLAYWRIGHT_REQUIRE_SEOUL_PINS=1` requires actual pins instead of allowing an annotated empty result.
New evidence is under `test-results/map-next16.3.4/`.
The real review API returned HTTP 200 and the reviewed place genuinely had no reviews.
Screenshot: `test-results/reviews-next16.3.4-real.png`.
Error and retry screenshots used clearly identified response fixtures at all three widths.
Actual database failure recovery was not fabricated or claimed.
Paid photo proxies remained blocked in browser tests.

The final regular production build and 725 unit tests passed.
Authenticated chat and route-preview browser checks were blocked at sign-in.
Their lifecycle changes have focused unit coverage, not completed end-to-end coverage.
A destination-screen badge overlap was observed and remains a follow-up defect.
Existing map pin overlap and full accessibility review remain open.

### Earlier Limits

- Pins overlap at mobile overview zoom. Users can zoom or select the named list.
- The first mobile test targeted an obscured pin. Later tests verify visible pins and keyboard selection separately.
- Photo proxies were blocked in the final browser tests. Photo appearance remains unverified.
- Full WCAG contrast measurement, 200% zoom, reduced motion, and provider-outage browser tests remain incomplete.
- Existing scores retain existing semantics. This slice does not establish score provenance.
- The complete event, guide-story, and comparison screens have not been built or visually reviewed.

Do not call this a finished visual redesign or a production-ready Seoul guide.
