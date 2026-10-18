# Localley design brief

Status: draft preparation. The urgent mobile scroll repair must ship first.
This document does not approve a production design release.
Nils must approve the exact final preview URL before that release.

## Product and direction

Localley helps travellers choose places and build useful days across Asia.
The main task is discovery, followed by a route that the traveller can save.
Preserve Localley's name, violet identity, Geist typography and existing city coverage.
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
Use 16px card corners and filled rounded chips.
Primary controls, save buttons and dialog close buttons have a minimum 44px touch target.

Separate surfaces with space, tone and soft shadows.
Keep focus-visible rings or outlines. Add forced-colors exceptions where fills and shadows disappear.
Pair error colors with visible text and appropriate ARIA state.
Do not remove functional route lines from maps or other data graphics.

Retain Geist through the existing font setup.
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
This draft branch starts from its tested source and contains design preparation only.
Keep design PRs draft until they may merge.
Rebase onto the released urgent fix before preparing the full hosted design preview.

## Verification status

- Token contrast: the seven proposal pairs above are calculated, not visually accepted.
- Design implementation, representative screen and component preview: pending.
- Route screenshots at 390/1440 and cards at 360/390/430: pending.
- Keyboard, focus, forced colors, reduced motion, zoom and contrast: pending.
- Functional and privacy gates for the planner: pending.
- Lighthouse mobile 90 and the shared performance budgets: open.
- Credential-free final preview and Nils approval: pending.
- Broad production release and live verification: pending.

Record exact test results, screenshot paths and defects as implementation proceeds.
Do not close these items from this design document alone.
