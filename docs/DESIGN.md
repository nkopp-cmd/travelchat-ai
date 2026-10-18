# Localley design brief

Status: draft preparation. The urgent mobile scroll repair must ship first.
This document does not approve a production design release.
Nils must approve the exact final preview URL before that release.

## Product and direction

Localley helps travellers choose places and build useful days across Asia.
The main task is discovery, followed by a route that the traveller can save.
Preserve Localley's name, violet identity, native sans typography and existing city coverage.
Preserve sourced local names and normal Korean, Japanese and Chinese text wrapping.

The tone is calm, direct and helpful. Three visible traits define the direction:

- Large place photographs.
- Complete, readable place names.
- Clear actions on filled surfaces.

Direction A is a neighborhood field guide. Photography leads, with concise location text and useful actions.
Direction B is a glass route dashboard. Translucent panels emphasize planning controls and route summaries.
Select A because real places and decisions need strong hierarchy and less visual noise.
Use a small violet day or category marker as the signature treatment.
Keep the shared CyberLink borderless rule, with Localley's own photography and neighborhood context.

Avoid nested frames, continuous glow, decorative dividers, fake trust scores and cut-off place names.
Show factual trust information only when the source fields support it.

## References and reuse

The root plan records the reference inspection on 2026-10-18.
These references provide inspiration; this preparation copies no external component code.

| Source | Lesson | Localley use |
|---|---|---|
| [shadcn/ui](https://ui.shadcn.com/docs/components/card) | Accessible local primitives | Retain the existing Radix behavior and local UI layer. |
| [Beautiful UI](https://www.beautifului.dev/) | Useful progress and context | Show actual preview data and real request states. |
| [beUI](https://beui.dev/) | Motion that explains interaction | Keep motion optional; no library selected. |
| [Rare UI](https://www.rareui.com/) | Distinct interaction details | Keep focus on readable content; no library selected. |
| [Transitions.dev](https://transitions.dev/) | Focused CSS feedback | Use short state transitions and respect reduced motion. |

Keep existing dialogs, sheets, tabs and focus management.
Inspect any new icon source, license and bundle cost before installation.
The final icon family must provide solid or duotone icons.
Keep the owned Localley logo separate from interface icons.

## Proposed tokens

These values are measured proposals, not shipped styles.
Implement them first on one representative screen and a component preview.
Review that result before applying the system across routes.

Draft definitions live in `styles/borderless-tokens.css`.
The local prototype uses these tokens. The draft application now opts into the same tokens through `app/layout.tsx`; hosted acceptance is pending. `styles/borderless-theme.css` maps existing shadcn roles to these values. No second UI foundation is introduced.
The preview uses three public catalog text records from a read-only page capture.
Its absent photographs are deliberate state fixtures, not live availability claims.
Its action controls do not write app data or prove product behavior.
The final application will retain the existing component foundation.

| Role | Proposed value | Use |
|---|---|---|
| Background | `#0d0f16` | Page canvas |
| Surface | `#181b26` | Independent content groups |
| Raised | `#242838` | Raised controls and selected context |
| Overlay | `#30364a` | Dialogs and sheets |
| Text | `#f4f4fa` | Main text |
| Muted text | `#afb6cc` | Supporting text |
| Brand | `#7c3aed` | Localley identity |
| Primary action | `#b9a1ff` | Filled primary controls |
| Primary action text | `#21133b` | Text on the primary fill |
| Input fill | `#8c96b2` | Visible form controls |
| Input text | `#0d0f16` | Text on the input fill |
| Focus | `#d2c3ff` | Focus-visible indicator outside the control |
| Success | `#9ce4c2` | Success text and semantic icons |
| Warning | `#f4c882` | Warning text and semantic icons |
| Error | `#ffb4bc` | Error text and semantic icons |

Measured sRGB ratios:

| Pair | Ratio |
|---|---|
| Text / surface | 15.66:1 |
| Muted text / overlay | 5.93:1 |
| Primary text / primary fill | 7.87:1 |
| Primary fill / overlay | 5.48:1 |
| Input text / input fill | 6.49:1 |
| Input fill / overlay | 4.06:1 |
| Focus / overlay | 7.41:1 |

These ratios cover the listed token pairs only.
They do not prove every rendered control, state or route meets WCAG AA.
The current product uses dark mode. Do not claim a verified light theme.

Use 4, 8, 12, 16 and 24px spacing.
Use 13px metadata, 15px body text, 17px card titles and 22px section headings.
Use 1.4 body leading and a reading width near 65 characters.
Use weights 400 for body text, 600 for titles and 700 for display text.
Use 16px card corners, 12px control corners and filled rounded chips.
Use 16px mobile page padding, 24px desktop padding and a 1280px page maximum.
Primary controls, save buttons and dialog close buttons have a minimum 44px touch target.

Separate surfaces with space, tone and soft shadows.
Keep focus-visible rings or outlines. Add forced-colors exceptions where fills and shadows disappear.
Pair error colors with visible text and appropriate ARIA state.
Do not remove functional route lines from maps or other data graphics.

Use the existing native sans stack. The old Geist variables did not select the rendered body font. Keep variable compatibility and stop unused font preloads; do not add a new font request.
Check the bundled font license before changing font assets.
Retain system fallbacks for scripts outside the supplied subset.
Review preload and font cost before adding weights or subsets.

Use short CSS transitions, approximately 120–180ms.
Remove decorative continuous animation. Respect `prefers-reduced-motion`.

## Shared components

Apply tokens to Card, Chip/Badge, Input, Tabs, Dialog, Sheet and navigation first.
Preserve their semantics, keyboard behavior and focus handling.
Then remove decorative border, ring, outline and divider uses from the remaining pages.
Add a CI guard with explicit accessibility and functional exceptions.

Navigation must wait for settled session state before presenting signed-out actions.
Reserve the same space while the session loads.
Update shared viewport calculations when navigation borders are removed.
Keep document scrolling on normal pages and the bounded composer on interactive chat.

## Spot card and carousel

Use one card on spot lists, city surfaces and the weekly carousel:

1. A 4:3 image, category chip and 44px save control.
2. A complete title. Wrap long names without clipping or ellipsis.
3. Concise, sourced metadata: area, city and category.
4. A plain description with an accessible More action.
5. Add to trip, plus Directions or Details.

Keep required photo attribution small and readable near the photograph.
Remove the large Google listing label from the photograph.
Do not invent photos, coordinates, areas, current opening hours or local endorsements.
Keep a deliberate photo-unavailable state.
Do not derive a verified badge from a score or place identifier alone.

The weekly section is the carousel itself.
Use native horizontal scrolling, scroll snap, an approximately 85% card width and a visible next-card peek.
Show the actual position and total, plus See all.
Support keyboard navigation without trapping vertical scrolling.
Preserve the bottom navigation height and safe-area padding.

## Plan first, pay later

The landing action opens a guest planner for city, dates, vibe and group.
Show a real catalog-backed outline and sample places before asking for payment.
The proposed preview uses deterministic code and spends no generation credits.
Show progress only while actual work occurs.

Before full generation, require verified paid entitlement through the server.
Preserve approved lifetime and other existing entitlement rules explicitly.
Keep legacy pending itinerary recovery working during the transition.
Treat a checkout success query as navigation state, not proof of payment.
Show bounded payment confirmation when the webhook has not arrived.

Validate draft state, bound its size and lifetime, and preserve it through authentication and checkout.
Use opaque identifiers and trusted same-origin returns.
Resolve storage and cross-browser handoff against the actual auth implementation before release.
Prevent duplicate checkout and generation requests.
Never send preferences, email addresses, auth tokens or payment identifiers to product analytics.

Record CTA, planner start, preview, checkout and generated-trip events.
Spot events cover views, saves, trip additions, detail opens and directions.
Preserve candidate routing and all current private ownership checks.

## Screens and states

Capture every implemented route at 390px and 1440px.
Dynamic routes require real owned fixtures.
Record isolated visual fixtures separately. They do not prove actual route acceptance.
Do not count a sign-in redirect as an authenticated screen review.

| Routes | Main task | States to cover |
|---|---|---|
| `/`, proposed `/plan` | Start and preview a day | Guest, loading, valid preview, missing draft, auth return, payment confirmation |
| `/spots`, `/spots/[id]`, `/explore`, `/templates` | Discover and choose | Real content, empty, error, photo available/unavailable, long text |
| `/challenges`, `/leaderboard` | See real progress | Real data, empty, loading, error |
| `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password` | Enter the account | Loading, validation, failure, success, expired link |
| `/pricing` | Choose or manage a plan | Free, paid, trial, monthly/yearly choice, failure, denied |
| `/dashboard`, `/profile`, `/settings` | Manage the account | Owned, empty, loading, failure, session pending |
| `/itineraries`, `/itineraries/new` | Build and find trips | Owned, empty, loading, invalid draft, entitlement refusal |
| `/itineraries/[id]`, `/itineraries/[id]/edit`, `/itineraries/[id]/stories` | Use a saved trip | Owned, private denial, missing, long day, map, media failure |
| `/chat` | Get a useful route | Empty, streaming, final output, map, failure, quota refusal |
| `/guide/apply`, `/guide/dashboard` | Manage guide status | Empty, pending, validation, failure, denied |
| `/spots/submit`, `/spots/submissions` | Submit and follow a place | Empty, validation, media failure, pending, denied |
| `/users/[username]`, `/shared/[shareCode]` | Open permitted public content | Public, missing, private refusal |
| `/admin/analytics`, `/admin/spots/discovery`, `/admin/spots/social-submissions`, `/admin/spots/quality` | Review permitted admin data | Authorized real data, denied, empty, failure |

Preserve both admin identities. Do not grant an extra identity access for screenshots.
Keep external delivery, partner actions, payouts and real charges inactive during verification.

## Integration and release

Keep Next.js, OpenNext, the current auth adapter and the local Radix UI foundation.
Do not change the story media pipeline during this design work.
Use Cloudflare assets/R2 and versioned responsive photographs.
Preserve safe media attribution and suppression rules.

The urgent repair remains in PR486.
This draft branch starts from its tested source. Token integration and shared component adaptation are in progress; none is released.
Keep design PRs draft until they may merge.
Rebase onto the released urgent fix before preparing the full hosted design preview.

## Verification status

- Token contrast: the seven proposal pairs above are calculated, not visually accepted.
- Local prototype R2: four viewport cases pass at 360/390/430/1440. Controls measure at least 44px; titles, metadata and actions have no overflow or ellipsis. More and keyboard carousel work.
- R2 screenshot review: desktop action rows align. Fixed navigation obscured parts of full-document/element captures. R3 uses viewport captures; all four visible-action bounds and hit tests pass. Opened R3 360px card, 390px overview and 1440px card screenshots: full names, aligned actions and readable surfaces. This is not app route acceptance.
- Shared Card, Badge, Button, Input, Textarea, Tabs, Dialog and Sheet: tokens integrated. TypeScript, changed-file ESLint and 23 focused tests pass. The eight-file class guard reports zero decorations.
- Actual shared-control browser harness: four cases pass at 360/390/430/1440. It checks 44px controls, zero decorative borders, field background/ink, opaque overlays, tab keys, modal focus trapping/return, Escape, forced-color focus and zero external requests/browser errors.
- Opened corrected 390/1440 overview and 390 dialog/sheet images. The first harness used the stable checkout’s Tailwind config and produced transparent overlays; that result is rejected. Corrected working directory and exact token assertions pass in borderless-foundation-r2-browser-20261018.json. This is local component acceptance, not app route acceptance.
- CI now runs the guard for these eight components. Expand to all app/components files after the remaining codemod; the all-route guard is not complete.
- Shared component integration and representative screen acceptance: pending.
- Route screenshots at 390/1440 and cards at 360/390/430: pending.
- Keyboard, focus, forced colors, reduced motion, zoom and contrast: pending.
- Functional and privacy gates for the planner: pending.
- Lighthouse mobile 90 and the shared performance budgets: open.
- Credential-free final preview and Nils approval: pending.
- Broad production release and live verification: pending.

Record exact test results, screenshot paths and defects as implementation proceeds.
Do not close these items from this design document alone.

## Icon source selection (2026-10-18)

Select Phosphor Icons 2.1.10, MIT, for consistent solid/duotone controls.
Reviewed the [official source](https://github.com/phosphor-icons/react), [package exports](https://github.com/phosphor-icons/react/blob/master/package.json), SSR Heart source and MIT license.
Use individual SSR modules to avoid React Context and a 9,000-module development barrel.
The React peer range accepts the existing React version. Runtime bundle impact remains unmeasured.
Keep the packaged license. No glyph source is copied in this step.
Pinned installation passes. Five per-icon SSR exports resolve. Dialog and Sheet close icons use this family; replacing remaining icons and measuring route bundles are pending.

The internal React harness is `docs/ui-foundation-preview.html` with `docs/ui-foundation-preview.tsx`. It uses the existing Vite toolchain from the locked test dependencies. It does not add a product route or change the app framework. System fonts in this harness are not production font-loading acceptance. The 80% field placeholder ink measures 4.85:1 on its exact filled background.

## Navigation and page shell pass (2026-10-18)

Draft application navigation now uses the same 56/64px header token and 64px mobile clearance plus safe area. Chat subtracts those tokens; the desktop dashboard also keeps its parent padding. Bottom links have equal weight and filled selection; Explore opens the public spot catalog. The account area reserves space until the session settles. The drawer has an accessible title and description. Decorative background grids are removed from the shared wrapper.

TypeScript, changed-file ESLint, 39 focused tests and the five-file navigation class guard pass. Eight new tests cover unresolved/settled accounts, the planner/catalog links, drawer dismissal, active paths and absent planner navigation. The jsdom link test reports unsupported document navigation; it proves drawer dismissal only. Actual hosted route screenshots, native gestures, navigation performance and signed-in data remain pending. CI now guards the thirteen adapted files; it does not yet cover all decorative classes.

Dialog headers reserve room for their 44px close action. Sheets cap their scroll surface at the dynamic viewport height. These later refinements need a refreshed browser image review with the navigation pass.

## Saved bulk pass and card implementation (2026-10-18)

Commit eb8ae227 saves the bulk surface/icon conversion on draft PR487. The initial conversion passed TypeScript, 33 focused tests, the 518-file guard and API no-diff verification. Eight changed-file ESLint errors were reproduced against the previous source; they were not introduced by the conversion. Their repairs are now in progress.

The actual SpotCard now uses a 4:3 image, filled category chip, save control, full title, source-backed geography, expandable original description, an explained verification label and Add to trip/Details actions. List and map reuse it. The weekly section uses the same component, native mandatory scroll snap, a next-card peek, real item count and keyboard/44px navigation controls. The server query limits the real weekly list to ten; it does not invent missing entries.

A read-only anonymous Source request accepted both explicit geography joins with HTTP200. No current Source spot has a destination association. Address display therefore uses only named registry cities and areas actually present in the source address; country-only and ambiguous addresses stay unlabeled. The final screen must not invent a neighborhood to fill a design slot.

Current TypeScript, 64 focused tests, changed-source ESLint, the 522-file border guard and deterministic icon generation passed. The actual shared-card harness passed at 360/390/430/1440 px, including native touch, range indicators, keyboard controls, full titles, 44px controls and the last Details action above navigation. Four screenshots were opened. The harness uses local text/auth/photo fixtures; it does not prove real app routes or photographs. These are not final route screenshots. Add to trip carries a spot ID into the planner URL; server-validated anchor persistence and the complete paid funnel remain unfinished.

The three-icon module benchmark measured 2,751 gzip bytes for all-weight Phosphor against 1,199 for the old outline icons. The generated icon source now keeps only the requested duotone/fill geometry from pinned MIT Phosphor2.1.10. Keep the public license and deterministic generator. Three geometry tests pass against the pinned package. The corrected compiled three-icon benchmark measures 1,289 gzip bytes against 1,199 for the old icons. An earlier 22,986-byte generated bundle was rejected; pure argument annotations now permit tree shaking. Actual route bundle budgets remain open.

Nested main elements and unbounded inner scroll containers are removed from the draft dashboard/trip layouts. City selection uses filled tiles with separate readable text instead of overlapping labels on cropped photos. Route-preview reads now reject stale responses. Places inputs use one bounded script subscription with manual entry available after failures. Their focused tests, current TypeScript and changed-source ESLint pass. Hosted app behavior remains unverified.

## Bounded planner input recovery (2026-10-18)

The wizard saves validated inputs before a generation request. An explicit `/itineraries/new?resume=1` return restores them for review. Ordinary planner visits start fresh. Input storage has a strict version and schema, a 16 KiB UTF-8 ceiling and a 24-hour validity window. It contains preferences only; it grants no entitlement or account authority. Storage refusal stops the request with a readable error.

Sign-up uses the existing auth form’s `redirect_url` contract. Legacy `pendingItinerary` recovery remains separate. This increment covers same-browser recovery only. Cross-device recovery, dates, a cheap real-catalog preview, server-enforced paid generation, payment return and funnel events remain open. The draft must not be released as the complete plan-first flow.

## Calendar dates and planner entry (2026-10-18)

The landing Start planning action opens the anonymous planner. Trip details accept an optional start date and show the inclusive end date from the selected duration. Calendar arithmetic uses UTC to avoid timezone and daylight-saving shifts. The existing input-recovery envelope retains the start date and rejects invalid or overflowing calendar ranges. No date library or provider request is added.

This is input collection and recovery. The current generation API still uses duration; date-aware output belongs to the unfinished complete planner flow. Full catalog preview, the server payment gate, checkout return, mobile browser acceptance and final preview approval remain open.
