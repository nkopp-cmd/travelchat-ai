# Localley design notes

## Existing identity and trip denial view — 2026-10-18

Audience: travelers opening saved or shared trip links on a phone or desktop.
Task: recover from an unavailable trip without revealing whether another person owns it.
Tone: calm and useful. Traits: dark surfaces, clear hierarchy, violet actions.

Two directions considered: a compact recovery panel within existing navigation; an oversized illustrated404 screen.
Choose the compact panel: it keeps familiar navigation, makes the next action clear and needs no new assets or dependencies.

Sources inspected: existing `components/ui/button.tsx` (shadcn/Radix Slot foundation),
`components/layout/main-content-shell.tsx` and `app/globals.css`. Reuse their actual code and tokens.
Next’s route-level [not-found convention](https://nextjs.org/docs/app/api-reference/file-conventions/not-found)
keeps existing `notFound()` checks and automatic noindex behavior; this is API guidance, not copied visual code.
The Localley composition is original. No third-party component, photo, font or asset was added.

Use existing Geist Sans400/500/600 for body, labels and headings. Preserve root font loading.
Dark token roles: background HSL240 33% 6%; card240 27% 14%; foreground0 0% 98%;
muted foreground240 5% 65%; primary/ring262 83% 58%; border240 20% 20%.
Layout: max-width672px,16/24px outer padding,24/40px panel padding,16px radius and1px token border.
Spacing:12/16/24/32px. Body16px/28px; heading24px mobile/30px desktop.
Controls: minimum44px height, stacked mobile, inline desktop, explicit visible focus outline.
Signature: one compass icon beside a calm recovery message. Avoid decorative map pins, giant error codes and new glow effects.
Use the same neutral copy for private and missing trips; never echo IDs, titles, URL queries or exception details.

Only exact preview host plus existing environment gates and one explicit `data_candidate=d1` carry opt-in to recovery links.
Disable prefetch. While search parameters resolve, show the neutral view with disabled actions and no source links.
Normal www links keep their existing paths. Keep existing authorization, metadata denial and API contracts.

Acceptance evidence: focused tests, desktop/mobile screenshots, keyboard/focus/overflow and contrast checks,
public performance before/after, required CI, guarded Worker release, live denial/owner controls and exact owned cleanup.
The root blocker plan records final evidence and remaining limits.
