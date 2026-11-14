# Localley UX checklist — gap list at 390 px (sprint-2 L6, 2026-11-14)

Source: Nils's travel-app UI checklist (2026-11-14). It is a checklist, not a look: brand and borderless rules win
(rounded corners, no borders/strokes/dividers, no dark washes, glass, gradients or emoji).
Method: live app at 390 px (Playwright), a touch-target script (a/button/input < 44 px), Lighthouse a11y (mobile).
Status: **have** = live today, **gap** = missing or below the bar, **no-fit** = does not fit Localley now.

| # | Checklist line | Status | Evidence / next step |
|---|----------------|--------|----------------------|
| 1 | Touch targets >= 44 px | gap | /spots: logo 36, chips 32 tall, clear 36 wide, filter 36, pagination 36, badge X 16. L7 PR 1 |
| 2 | Contrast AA, names match labels | gap | Lighthouse /spots 0.92: city-chip count contrast, aria-label mismatch, role=list without listitems. L7 PR 2 |
| 3 | Itinerary: jump between days | gap | /itineraries/[id] stacks DayRouteSections, no day chips. L7 PR 3 (anchor chips, 0 JS) |
| 4 | Walking time between stops | gap | DayRouteActivity has no coordinates; needs stored lat/lng first. Later |
| 5 | Offline badge / saved trips offline | gap | public/sw.js is push-only, no cache. Later (service-worker cache plan) |
| 6 | Skeletons, not spinners | have | app/spots/loading.tsx, app/itineraries/[id]/loading.tsx |
| 7 | Live result count, filters apply at once | have | "N spots" in spots-explorer, role=status in city quick filters |
| 8 | Map/list toggle with bottom sheet | have | spots-map SheetSnap list/half/map |
| 9 | Primary actions in the thumb zone | have | bottom nav + floating Map button |
| 10 | Tabular numbers for prices/times | have | tabular-nums on counts and times (partial) |
| 11 | Booking / payment inside the app | no-fit | Localley is a guide; no booking inventory |
| 12 | Dark glass overlays, gradient heroes | no-fit | forbidden by the design rules (Nils 2026-11-14) |
