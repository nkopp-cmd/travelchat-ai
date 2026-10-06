# Spot card quality — 2026-10-06

## Design scope

Travelers compare real places, read their names and save useful stops.
Keep Localley’s existing dark violet identity, sans-serif fonts and local UI components.
Two directions considered: a denser horizontal list, or a photo-first discovery grid.
Choose the photo-first grid; a narrow mobile thumbnail cannot accommodate the photo and required credits.
The compact list remains horizontal. Mobile grid cards use16:10 imagery,12px spacing, two-line titles and44px save targets.
Use existing #100b1c surface, violet text, rounded borders and one lucide icon set.
No new components, dependencies, decorative stock photos or generated venue imagery.
Source credits sit in a secondary caption beneath the photo, with author links visible and keyboard accessible.
Google Maps attribution uses readable12px text; author credit remains linked where safe.

References inspected2026-10-06: Google Places attribution policy (https://developers.google.com/maps/documentation/places/web-service/policies), shadcn existing Card foundation (https://ui.shadcn.com/docs/components/card), WCAG target sizing (https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
These guide composition and credit placement. No external component code was copied.

## Data audit and boundaries

Read-only full source inventory:3295spots,92without stored photos, no repeated stored google_place_id.
Photo references expose332repeated listing groups/732rows; many contain different named places, so they cannot be merged wholesale.
Two normalized name/address pairs are Daigo-ji Temple and Funaoka Onsen, with matching photo listing identity and identical pins.
Discovery deduplication additionally requires the same trusted listing, normalized name and rounded pin.
Keep all source rows, saved references, distinct listing identities and distinct pins.
No production source rows were deleted or rewritten. Missing imagery stays explicit; no unrelated replacement.
A successful bounded first-page sample is not proof that every photo in the catalog works.
Further listing conflicts and missing photos require individual evidence before source repair.

## Verification

21focused component/list tests pass, including source reset, unsafe author links, empty/error imagery and duplicate/branch guards.
Before screenshots: six loaded first-page photos per viewport, no page errors or horizontal overflow.
Release, visible card screenshots, build, exact CI and scoped review remain pending.

Review found a hero-caption overlap before activation. The hero now owns its overlay inside a separate image frame; credits flow below that frame. A multi-author/error-state regression test preserves the title and controls. The first uploaded draft version was not activated.
The reviewed interaction-remount concern is fixed: only the image resets on source changes. A retained open interaction test covers metadata loading.
