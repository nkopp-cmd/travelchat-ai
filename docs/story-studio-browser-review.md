# Story Studio Browser Review

Review date: 2026-09-07.
Repeat review: 2026-09-07, after the UI owner's four fixes.

## Resolved Findings

All four previous findings are resolved in the reviewed Story Studio states.
The repeat review changes only test assertions and this document. It changes no production UI, backend, or font files.

| Status | Verified fix | Source | Evidence |
| --- | --- | --- | --- |
| Resolved | Success feedback stays inside the carousel. No global toast covers the title or close control. | `components/itineraries/story-dialog.tsx:152-155,826` | `carousel-synthetic.png`; `inline-status-header.json` |
| Resolved | The Story Studio close control measures 44x44 pixels at each normal viewport size. | `components/itineraries/story-dialog.tsx:798-804` | `ready-keyboard-metrics.json` |
| Resolved | The opaque white placeholder label has gradient endpoint contrast of 5.70:1 and 7.90:1. | `components/itineraries/story-dialog.tsx:830-834` | `carousel.png`; `placeholder-contrast.json` |
| Resolved | Enabled, unchecked radio borders have 4.83:1 contrast against white. | `components/itineraries/story-video-panel.tsx:44` | `ready-keyboard.png`; `font-contrast.json` |

The close and radio fixes are local overrides. They do not establish fixes for every shared control elsewhere.
Each captured dialog asserts targets of at least 24x24 pixels and a close target of at least 44x44 pixels.
Radio measurements use the associated clickable label. Touch selection verifies that the larger target works.
At 390px, the labels measure 298x44 pixels. Tabs measure 146x37 pixels, and Create video measures 138x36 pixels.
The mobile carousel needs vertical scrolling to expose its complete download control.
No horizontal overflow appeared in the tested dialog states.
No new production defect was identified in this repeat review.

The preview banner stays above every component. It can cover the upper dialog border.
This banner is test-only. Do not classify its overlap as a production defect.
Header hit testing and a trial close click pass after synthetic slide creation at every tested width.

## Preview

URL: http://127.0.0.1:4174/

Ready pilot: http://127.0.0.1:4174/?scenario=ready

The loopback Vite process remains available after this review.
Select a simulated state before opening either Stories button.
Both buttons mount the real `StoryDialog`. Its Video tab mounts the real `StoryVideoPanel`.
The ready fixture advances through running, provider-ready, processing, and delivered states.
Each poll uses the real client's ten-second interval.
No fixture contacts a provider or incurs charges.

The banner reads: `Component preview: simulated data. No generation or charges.`

Fixtures use owner `test-preview-owner` and itinerary `11111111-2222-4333-8444-555555555555`.
The title includes Korean text and a long English suffix.
The preview uses one itinerary day. It mounts two dialog instances with the same owner and itinerary.

## Isolation

- The harness lives under `e2e/story-studio-preview/`, outside production routes.
- Vite 7.2.6 was already installed through the test toolchain. No package was installed.
- Vite uses automatic React JSX transformation and the existing PostCSS configuration.
- The harness imports the real `app/globals.css` and existing Tailwind tokens.
- Only Next Link, Next Image, and Clerk `useUser` receive test adapters.
- Real video state, polling, request identity, background helpers, and Radix components remain unmocked.
- The harness retains the real `Toaster`. Story Studio now uses inline feedback instead of global toasts.
- The fixture middleware terminates all `/api/` requests locally. Unknown endpoints return HTTP 403.
- The server has no upstream proxy, provider SDK, database connection, or credential adapter.
- CSP restricts connections, images, fonts, and media to local sources, with explicit blob/data exceptions.
- Playwright also aborts every request outside `http://127.0.0.1:4174` and blocks service workers.
- Vite disables environment-file loading and public-directory serving. Its file rules deny environment files, keys, and Git contents.
- Carousel images contain synthetic labels and a solid background. They contain no artwork or travel footage.
- The download fixture uses the exact application download path and returns `synthetic-preview.txt`.
- That text file proves browser download behavior. It is deliberately not a playable MP4.

No production server, Clerk login, Supabase connection, provider request, or live payment was used.
The isolated preview does not verify those integrations.

## Browser Evidence

Final result: **7 Playwright tests passed**, using the installed Chromium browser.
The repeat run took 2.7 minutes. It replaced the screenshot and measurement artifacts from the previous review.
Focused ESLint checks passed without warnings.

Evidence root: `test-results/story-studio-browser/`.
Server log: `test-results/story-studio-vite.log`.
The server log includes an existing Browserslist database-age warning.

| Test | Coverage |
| --- | --- |
| Three viewport matrices | 390x844, 900x1000, and 1440x1000 |
| Touch and accessibility | Mobile Chromium emulation, touch labels, focus containment, Escape restoration, reduced motion, font identity, text contrast |
| Shared unknown request | Two real dialogs preserve the same POST body and idempotency key |
| Sequential job | One mock submission reaches running, provider-ready, processing, and delivered through real polling |
| Isolation and scaling | Unknown API rejection, external-fetch rejection, keyboard submission, 200% CSS zoom |

Each viewport includes these states:

- Default image carousel and synthetic slides with persistent inline status.
- Unavailable, budget limit, loading, error, and zero eligible durations.
- Premium required, unsupported text, processing unavailable, unauthorized response, and missing itinerary response.
- Ready pilot with keyboard duration selection.
- Reserved, submitting, queued, running, provider-ready, and processing.
- Delivered, delivered without a download URL, processing failed, generation failed, and cancelled.
- Unknown submission with its existing-request action.

The tests check disabled duration controls when readiness denies submission.
They check locked controls during active jobs and unlocked controls after terminal jobs.
Touch selection sends `{ "duration": 6 }` through the real client.
Keyboard arrows select the five-second option.
Tabs respond to arrow keys. Escape returns focus to the opening Stories button.
Twelve consecutive Tab presses keep focus within the mobile dialog.
The measured focused radio has a visible three-pixel ring.
The tests assert that non-delivered states expose no MP4 download link.
The tests now assert a 44px close target and a 24px minimum for other measured targets.
Placeholder checks read actual gradient colors and require every ancestor opacity to equal one.
Both gradient endpoint ratios must meet 4.5:1.
Enabled radio border measurements must meet 3:1.
The success-status test requires an inline status and no mounted toast close control.
It also checks the title's hit target and the close button's ability to receive a click.
No progress bar or invented timeline appears in the reviewed video states.
The viewport tests report no uncaught browser exceptions.
Expected fixture HTTP 503 responses remain intentional network errors.

The first keyboard run used an effectively instant key press.
Radix deferred focus until after key release, so selection did not follow focus.
The test now holds the arrow key for 100 milliseconds. No production keyboard code changed.

## Opened Images

I opened new full-size representative images and all three regenerated contact sheets after the repeat run.
The sheets contain every viewport state. Full-size files remain available beside their JSON measurements.

Directory prefix: `test-results/story-studio-browser/story-studio-`.

| Directory suffix | Full-size images opened |
| --- | --- |
| `390-real-components-and-all-video-states/` | `carousel.png`, `carousel-synthetic.png`, `carousel-settled.png`, `ready-keyboard.png` |
| `900-real-components-and-all-video-states/` | `carousel-synthetic.png` |
| `1440-real-components-and-all-video-states/` | `ready-keyboard.png` |
| `preview-denie-4153c-ent-CSS-zoom-remains-usable/` | `css-zoom-200.png` |

Other states were reviewed in the new contact sheets.
The retained `carousel-settled.png` filename no longer means that a toast expired. Its inline status remains visible.
The Korean title shows distinct glyphs, without missing-glyph boxes.
The wider close target does not collide with the title. Header padding allows the long description to wrap.
The white placeholder label is visibly clearer on the darker gradient.
Unchecked radio circles now remain distinct against the white surface.
Success feedback appears below the tabs and does not cover the title.
Video status text wraps without clipping at all three widths.
The delivered mobile actions stack vertically and remain readable.
Desktop and intermediate layouts preserve clear tabs, duration rows, status text, and actions.
The unknown-request message remains readable in the taller mobile dialog.
The CSS zoom screenshot clips the upper header after scrolling to the action.
CSS zoom is a scaling probe, not proof of native browser zoom or complete reflow compliance.

## Font Evidence

The harness serves `lib/fonts/NotoSansKR-Regular.otf` through one fixed, read-only local URL.
It neither copies nor changes the font asset.
The preview applies this family to all component text. Production font loading remains unchanged.

- Font: Noto Sans KR Regular 2.004, weight 400, static OpenType CFF.
- License: SIL OFL 1.1, retained at `lib/fonts/OFL.txt`.
- Source record: `lib/fonts/README.md`.
- Upstream: https://github.com/notofonts/noto-cjk/tree/f8d157532fbfaeda587e826d4cd5b21a49186f7c
- Asset SHA-256: `69975a0ac8472717870aefeab0a4d52739308d90856b9955313b2ad5e0148d68`.
- License SHA-256: `6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2`.

Both local hashes matched their provenance record.
Chromium reported `Noto Sans KR`, `NotoSansKR-Regular`, and `isCustomFont: true` for the mixed title.
It reported 78 rendered glyphs from that custom font.
The browser loads the complete existing regional font asset, not a Latin-only subset.
This review does not separately render every supported Hangul code point.
The single font weight lets the browser synthesize heavier text in this test-only preview.

## Contrast Measurements

Measurements use browser-computed colors and WCAG relative luminance in sRGB.
The ready video surface is opaque white. Transparent descendants inherit the nearest opaque surface.
Evidence: `touch-focus-t-3602f-contrast-and-reduced-motion/font-contrast.json`.

| Surface | Foreground | Background | Ratio |
| --- | --- | --- | --- |
| Title description, model description, privacy text | `#71717a` | `#ffffff` | 4.83:1 |
| Video heading and active tab | `#09090b` | `#ffffff` | 19.90:1 |
| Inactive tab | `#09090b` | `#f4f4f5` | 18.10:1 |
| Create video button | `#fafafa` | `#18181b` | 16.97:1 |
| Enabled unchecked radio border | `#71717a` | `#ffffff` | 4.83:1 |
| Focused radio border | `#18181b` | `#ffffff` | 17.72:1 |
| Placeholder label, violet endpoint | `#ffffff` | `#7c3aed` | 5.70:1 |
| Placeholder label, indigo endpoint | `#ffffff` | `#4338ca` | 7.90:1 |

The first four pairs meet the 4.5:1 normal-text threshold.
The enabled radio borders meet the 3:1 non-text threshold.
Disabled controls require separate treatment and were not counted as text-contrast failures.

The carousel's `Story Format` label now uses opaque white over `#7c3aed` to `#4338ca`.
Browser-computed colors give endpoint ratios of 5.70:1 and 7.90:1.
Both endpoints pass 4.5:1 for this 12px normal text.
All ancestor opacity values equal one, so no alpha correction is needed.
Evidence: `390-real-components-and-all-video-states/placeholder-contrast.json`, with matching files at the other widths.
These calculations concern the existing placeholder, not synthetic slide artwork.

This is a limited manual review with measured checks, not a complete WCAG audit.
Dark mode, all gradient samples, every focus boundary, and every toast variant remain outside the contrast measurement set.

## Source Selection

All five official sites were retrieved on 2026-09-07. None timed out.
The selection preserves Localley's existing dialog and token system. It introduces no new visual identity.

| Source | Reviewed candidate and source access | Decision |
| --- | --- | --- |
| https://www.beautifului.dev/ | Loading State and Task Rows; official demos and MIT license link | Existing text statuses fit this pilot. No traces, confidence values, or artificial percentages were added. |
| https://ui.shadcn.com/docs/components/radix/tabs | Radix Tabs documentation and usage; actual local Tabs and Button source | Reuse the existing controls, keyboard behavior, and semantic tokens. |
| https://beui.dev/components/motion/tabs | Complete TSX source; `motion/react`, reduced-motion handling, and custom tab context | Reject replacement tabs. Extra motion and another interaction implementation do not help this review. |
| https://www.rareui.com/components/durationpicker | Duration Picker documentation, usage, dependencies, and license terms | Reject hours/minutes editing. The pilot permits only three durations in seconds. |
| https://transitions.dev/ | Text states swap and modal examples; official installation and accessibility documentation | Preserve existing transitions. No animated counters or decorative status sequence was added. |

The Rare UI page hides full source behind its code-view control in the fetched representation.
Beautiful UI did not expose a selected component implementation in the fetched page.
The Transitions detail fetch returned its generic Card Resize documentation rather than the requested state-swap source.
These implementation sources were unavailable through the read-only page fetch. No code was copied from them.
The rejected sources need no installation, paid access, or new dependency.

Actual reused implementation files:

- `components/ui/tabs.tsx`: Radix Tabs 1.1.13, MIT.
- `components/ui/dialog.tsx`: Radix Dialog 1.1.15, MIT.
- `components/ui/radio-group.tsx`: Radix Radio Group 1.3.8, MIT.
- `components/ui/button.tsx`: Radix Slot 1.2.4, MIT; class-variance-authority 0.7.1, Apache-2.0.

Versions and licenses came from installed package manifests.
These components remain in their existing production files. The harness imports them without modification.
No external component source was copied, adapted, or presented as newly sourced code.

## Reproduction

Start the standalone server from the repository root:

```sh
node node_modules/vite/bin/vite.js --config e2e/story-studio-preview/vite.config.ts
```

The existing process already occupies port 4174. The configuration requires that exact port.

Run the isolated browser suite:

```sh
PLAYWRIGHT_BROWSERS_PATH=/home/dev/projects/CyberLink/codex-work/tmp/opencode/localley-browsers node node_modules/@playwright/test/cli.js test --config e2e/story-studio-preview/playwright.config.ts
node e2e/story-studio-preview/contact-sheets.mjs
node node_modules/eslint/bin/eslint.js e2e/story-studio.spec.ts e2e/story-studio-preview
```

Playwright recreates its own evidence directory on each run.
The contact-sheet script derives images only from screenshots in that directory.

## Limits

- This review covers real components, not the complete authenticated Next application.
- It does not verify live Clerk login, production font loading, billing, provider availability, or generated video playback.
- The synthetic download verifies a local application path, not MP4 encoding or storage permissions.
- Premium and authorization states come from fixtures, not a real user account.
- Chromium emulation does not establish physical iOS, Safari, Android, or assistive-technology behavior.
- CSS zoom does not replace native zoom and reflow testing.
- The carousel review covers default and synthetic output states, not every AI model, stock fallback, or cloud-sharing branch.
- The review does not establish a complete WCAG audit or production release readiness.
- The full unit suite, TypeScript project check, and production build were not run for this test-only task.
- The four original Story Studio findings are resolved. Shared controls elsewhere were not reviewed or changed.
- Mobile carousel actions still require vertical scrolling. This is not a horizontal overflow failure.
- Native zoom, dark-mode contrast, live authentication, and real media delivery remain verification gaps.
