# Localley UI/UX Loop

Use this loop when changing any user-facing flow. The goal is a simple front end that collects intent quickly and lets backend routes do the heavy work.

## Goal

Ship a modern, simple, accessible Localley experience where users can build or inspect a travel plan with minimal interaction. Strong passes should score at least 4/5 on simplicity, usability, responsiveness, accessibility, performance, and brand consistency.

## Loop

1. Inspect the exact route and adjacent components.
2. Define the one user job for the screen.
3. Remove competing calls to action or duplicate input.
4. Implement with existing shadcn/Tailwind primitives and backend APIs.
5. Validate on mobile, tablet, and desktop.
6. Fix the highest-friction failure and repeat until no score is below 4/5.

## Scorecard

| Dimension | Pass signal |
| --- | --- |
| Simplicity | One primary action is obvious within five seconds. |
| Usability | Inputs preserve intent across handoffs and errors explain the next step. |
| Responsiveness | 390px, 768px, and 1440px layouts have no clipped text or overlapping controls. |
| Accessibility | Keyboard focus is visible, icon buttons have names, selected controls expose state, and zoom is allowed. |
| Performance | Hero media is purposeful, routes build cleanly, and interactions do not rely on unnecessary client work. |
| Backend efficiency | UI sends structured intent to existing APIs instead of reimplementing logic in the browser. |

## Commands

```bash
cd "/Users/alleycore/Documents/CoreMachine/01 - Projects/Code/Localley"
nvm use
npm ci
npm run lint
npm run test:run
npx tsc --noEmit
npm run build
npm run dev -- -p 3000
```

## Manual Viewports

Check `/`, `/spots`, `/itineraries/new`, `/chat`, `/pricing`, and `/dashboard` at:

- 390x844
- 430x932
- 768x1024
- 1024x768
- 1440x900

For each route, verify tab order, visible focus, readable contrast, touch targets, mobile keyboard behavior, reduced-motion comfort, no hover-only required action, and no body/main scroll clipping.
