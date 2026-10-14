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

## Resume on current main — 2026-10-14

Rebased the existing draft on main32acea6 without dropping current runtime or CI changes.
All74 focused photo/card/query/review tests and scoped lint pass.
The preview b010d40b has the approved Google binding and no Source service-role binding.
The normal preview reader change uses only public rows under exact host/outbox/read-only checks.
Production b4d426e2 retains its existing admin reader and provider binding.
No secret change is needed. Generation stays disabled in preview.

New real-photo checks require a fresh spending guard and per-request receipts.
Never replay an uncertain request. Old photo references are not reused as current evidence.
Test visible mobile controls; inspect source hero geometry only through the guarded production version override.
The previous two-attempt stop remains historical. Current build/review/CI and live gates must pass before promotion.
Keep required photographer links below each photo. Official reference:
https://developers.google.com/maps/documentation/places/web-service/place-photos

## Current release stop — 2026-10-14

Runtime source `cdeeca9a6d67eb026d13e3c3474557295e112f98` passed74 focused tests,
scoped lint, TypeScript, pinned build and requiredCI38530295359.
Artifact SHA256 `0d0a3c795552bd795eb387c3b6c4beef83c5a9ef85e8492ba0b3385fb1604620`
has2,328files/76,799,689bytes,93 private values and zero unexpected hits.
Five existing server occurrences are the already-public Kakao alias.
The first review timed out without a verdict. The narrower review found no confirmed P0/P1.
Eight recovery tests pass. No provider secret was changed.

Fresh read-only Source audit retained3,295 rows,97 empty stored photo arrays and zero Source writes.
The offline public-eligibility projection changes3,014 to2,964 display rows.
Its50 collapses require the same inferred trusted listing, normalized name and rounded pin.
These projection counts are not complete live-catalog or current-photo verification.
All Source rows, saved IDs and branch distinctions remain intact.

Preview version `88c7e769-79c7-43b3-9892-4cb49c8ef1c5` passed29 functional checkpoints.
Actual desktop/mobile photos, captions below images, visible44px save controls, signed-out redirects and duplicate results passed.
Four normal-photo screenshots were inspected. Two error-state screenshots caught an intermediate transition.
Free isolated checks measured a settled322x201.25px placeholder with the title below it.
The subsequent harness checks settled bounds and disables screenshot animations.
The layout diagnostic used a synthetic test pixel only; it is not real venue-photo evidence.

Production version `53ad5ced-57a1-4a89-a76f-6f603e940a53` remains unpromoted.
The first canary timed out finding the filtered card despite four returned photo responses.
A free controlled page load found the expected card; the original timeout cause remains unresolved.
The second attempt pinned the browser-context version but used incorrect sampled venue IDs.
It blocked the expected photo request and timed out waiting for the image. No paid call ran in that attempt.
Correct Source IDs are067bacc4-825e-4e60-bab8-2720785c15bf and48d93835-ca17-49d3-8308-0f59871e4618.
The prepared next harness derives sample IDs from the retained Source snapshot and validates ambiguity.
It has not run. Stop after these two failed production attempts; do not promote PR388.

All12 metered requests have retained responses and receipts, totaling estimatedUSD0.60, with no unknown result or retry.
Both Workers restored their prior versions at100%: productionb4d426e2 and previewb010d40b.
Production restore deployment is `cc14dc7a-0f99-4a0c-8f63-65a97499c384`.
Preview restore deployment is `ae2d8acf-9f23-49cf-8c37-5fc33405d3ec`.
The retained production rollback remains8b4db9c2; preview rollback remainsae129c85.
No Source mutation, D1 switch, ready/merge or production UI release is claimed.
Final runtime/admin/public/count proof is `spot-cards-final-20261014.json` under private Localley state.
Source records and retired native-sync timer remain unchanged. PR388 stays draft.
