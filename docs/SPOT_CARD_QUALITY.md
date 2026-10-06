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
Final code6ea354ef passed21focused tests, ESLint and required self-hosted verify37502766249.
Pinned OpenNext build and85private-key artifact checks passed with zero hits. Scoped review passed after the hero correction.
Two hosted preview checks failed the real-photo gate: all sampled gallery responses returned502 on desktop and mobile.
The first failure also occurs on previous previewb9086f9a. Preview lacked the server GOOGLE_PLACES_API_KEY.
A new version with the approved existing shared key still failed. Stop after two attempts; do not promote this PR.
Both failed checks preserved44px save controls, signed-out login routing and zero page errors/horizontal overflow.
Photo credits, actual hero geometry and production duplicate rendering remain unverified on this release.
Preview routing restored to b9086f9a100%, deployment180a5e01-d68a-450d-88e1-c6cee9b2930a.
Production stays043e1752-23d6-4378-be1b-96a48f86f995100%, rollbackb42e8926 retained.
PR388 remains draft. The added preview key exists only on inactive version548e53c6.
Private receipts/screenshots: /home/dev/.local/state/localley/spot-card-quality-20261006.
Next attempt must inspect provider failure telemetry and actual version bindings before repeating browser requests.

Review found a hero-caption overlap before activation. The hero now owns its overlay inside a separate image frame; credits flow below that frame. A multi-author/error-state regression test preserves the title and controls. The first uploaded draft version was not activated.
The reviewed interaction-remount concern is fixed: only the image resets on source changes. A retained open interaction test covers metadata loading.

## Recovery verification — 2026-10-06

Source02a8ec84, required verify37507911935 passed11m06s.
Normal preview photo requests now use the anon reader only on the exact preview host with outbox/read-only flags.
The D1 branch and normal production admin path remain unchanged. Preview needs no service-role credential.
Public-only build4cb7f22 passed TypeScript;2316files76567658bytes/82private-key values/zero artifact hits.
The runtime source differs from02a8ec84 only in a corrected review test fixture and workflow.
Full Vitest invocation initially passed1646assertions and failed9stale review assertions; corrected NextRequest fixture replay passes10.
The17script suites need Node, not Vitest:95assertions pass under Node;4catalog assertions pass under tsx.
These are aggregate verified results, not a second clean all-run invocation. Scoped review found noP0/P1.
Real preview gallery returns200/available/four photos after deployment settles.
Actual390/1440 card screenshots show six loaded real photos each, captions below images, no page errors/overflow and mobile save redirects to sign-in.
Two visual harness failures keep this release blocked: normal preview detail lacks an admin reader by design, and the first mobile save button selected is the hidden desktop control.
Use the existing explicit D1 detail page for preview refusal/layout checks; verify source hero geometry through guarded production canary only after corrected visible-control checks.
No third browser attempt, ready/merge or production release is claimed. Production043e1752 remains unchanged.
All source rows and saved references remain. Individual missing-photo repairs and full migration gates remain open.
