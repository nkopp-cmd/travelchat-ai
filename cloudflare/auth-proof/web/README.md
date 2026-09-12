# Local Frontend

## Hosted Preview Handoff, 2026-09-11

Changes remain inside `web/` and `scripts/build-web.mjs`.
The local layout and auth flows remain in place.
The preview uses the existing violet and neutral colors.
Its account row opens a native account panel without hiding discovery.
The hero uses one credited pilot photo. Its card links back rather than duplicating that image.
The map appears above the two-column list. Mobile uses one column.

`GET /api/app-config` must return this exact supported combination:

```json
{"mode":"preview","catalogSource":"seoul-pilot","registration":"restricted-preview","emailDelivery":"cloudflare"}
```

Preview runs at `https://preview.localley.io` or an explicit loopback test origin.
Local mode requires loopback and the `local/synthetic/local-test/captured` combination.
Only a loopback 404 permits the known local fallback.
Errors, invalid combinations, and other origins block mounting the auth client and application.
The server still owns Access checks and invitation enforcement.
No issuer, claim controls, import promise, or paid-access transfer appears in preview.
Preview email notices direct eligible users to email. They never claim capture or successful delivery.

Photo rendering requires a UUID JPEG URL under the current origin's `/pilot/` path.
The URL must match an entry in `photoCredits` with an author, license, and safe source links.
Synthetic mode never renders photos, even when unexpected photo fields exist.
Failed images show an unavailable message without replacement media.
Source links accept HTTP and HTTPS without URL credentials. React escapes visible source text.
Saved rows use matching public catalog metadata when available. Null saved rows remain unavailable.

Leaflet 1.9.4 supplies the imperative map and its CSS.
Reference and source review: https://leafletjs.com/reference.html, retrieved 2026-09-11.
Reviewed installed `src/layer/vector/SVG.js` and the BSD-2-Clause license.
`catalog.tsx` contains original integration code, not a copied UI component.
Canvas circle markers avoid missing default icon files and global SVG sizing conflicts.
Popups use DOM `textContent` and native buttons, never catalog HTML.
Valid coordinates fit the map bounds. Missing coordinates produce no pin.
The map labels positions as catalog locations, not verified entrances.
Only visible OSM tiles generate external requests. Tile failures remain visible.
No route estimates, 3D controls, geolocation, prefetch, or paid map provider was added.
Tile requests send only the origin as referrer, not account or reset URL parameters.

### Asset Contract

The build reads only UUID JPEG files from the trusted local `pilot/images/` folder.
It copies them to `dist/public/pilot/` and copies `pilot/licenses.md` as `pilot/licenses.txt`.
The build rejects symlink sources, non-JPEG bytes, and invalid checksum manifests.
It removes old generated pilot files before copying. It never copies catalog exports or credentials.
Missing pilot images do not block the build. Existing images require public license notes.
The optional checksum file is `pilot/manifest.json`:

```json
{"files":[{"file":"cb33c68c-e87c-4c0d-af2b-a15d3a40cc90.jpg","sha256":"<64 hexadecimal characters>"}]}
```

When present, the manifest must cover every copied JPEG without duplicate or missing entries.
The build preserves the existing font checksum checks and OFL copy.
It also copies the Leaflet license. Esbuild handles Leaflet's CSS PNG references.

### Current Checks

`npm run typecheck:web`, `npx eslint web`, and `npm run build:web` passed during this task.
Package lint reported a backend triple-slash reference error in `src/runtime.ts` during concurrent work.
No backend file was changed to fix it.

`web/preview-check.mjs --pilot` is an explicit component check, not hosted release evidence.
It serves built assets with public pilot fixtures and signed-out auth stubs.
It never imports a database, sends email, or contacts the hosted preview.
Set `PREVIEW_SCREENSHOTS` to an approved evidence directory before running it.
It deliberately blocks OSM tiles to check failure copy without substituting imagery.
Use the installed browser directory through `PLAYWRIGHT_BROWSERS_PATH` when needed.

The component check passed at 1440, 900, and 390 pixels with no page errors or horizontal overflow.
It checked selection, duplicate-image prevention, photo failure, unsafe URLs, missing coordinates, and configuration failure.
It confirmed that a local 404 preserves the local layout without photos or maps.
Screenshots were opened from `/home/dev/projects/CyberLink/codex-work/tmp/opencode/localley-preview-ui/`.
The first review found that a landscape crop hid the stream photo's context.
Images now use `object-fit: contain` to preserve the full source frame.
These screenshots show deliberately missing tiles. They do not prove the successful hosted map state.

The parent must check real preview responses and open hosted screenshots at 1440, 900, and 390 pixels.
Check OSM tiles, map pan and zoom, marker selection, keyboard focus, touch controls, contrast, and zoom.
Check broken photos, missing credits, unsafe URLs, null coordinates, empty results, and public source parity.
Check config 404 and failure on the hosted origin. Neither may mount account controls.
Check invitation-only signup, native email verification, reset, profile creation, and failed sign-out.
Rerun local auth tests, session preconditions, pending-save confirmation, and cross-tab privacy races.
Verify Access separately for Nils and GET-only CI. This frontend does not establish Access policy.
No hosted review, production deployment, or Git command occurred in this task.

The remaining sections record the earlier local-only implementation and its historical evidence.

This frontend preserves Localley's existing identity. It does not redesign the parent app.
It uses React and React DOM 19.2.8, Better Auth 1.7.3, and Lucide React 1.42.0.
No widget library, Vite, Next.js, Tailwind runtime, or root dependency changes are required.

## Build

Run from `cloudflare/auth-proof`:

```sh
npm run typecheck:web
npm run build:web
```

The independent esbuild script writes `dist/public/index.html`, `assets/app.js`, and `assets/app.css`.
It does not delete Worker output or start a server.
The backend owner controls Worker builds, local HTTPS, and the browser harness.

The build copies the existing Noto Sans KR font and OFL license into output only.
Both source hashes must match `../../lib/fonts/README.md`.
There is no duplicate binary source and no remote font request.
Arial supplies Latin text. The local Noto font supplies Korean text.

## API Contract

All requests use the current origin. App requests disable HTTP caching.
The frontend does not fetch photos, analytics, external media, or outbox messages.

| Request | Expected response or body |
| --- | --- |
| `GET /api/session` | `{state, authUserId, sessionId, ownerId?, userRecordId?}` |
| `GET /api/spots?limit=24&offset=0` | `{spots: Spot[], nextOffset: number or null}` |
| `GET /api/spots/save` | `{spots: [{id, spot_id, spots: Spot or null}]}` |
| `POST /api/spots/save` | `{spotId}` |
| `DELETE /api/spots/save` | `{spotId}` |
| `POST /api/account/new` | Empty body |

App mutations send `x-localley-session-id` from the validated app context.
Account mutations require it server-side. Mapping reads also send the observed SDK session ID.
The SDK and application requests use the existing bounded fetch adapter with no automatic retries.
Headers and body consumption share a twenty-second deadline. Account replacement aborts the old mapping request.
They never send client owner fields. Auth SDK endpoints never receive this header.
There is no claim form. The UI explains that legacy migration is unavailable.

Structured errors use `{error: {code, message, details}}`.
Quota errors remain visible. Failed reads never become empty success states.
Unavailable saved rows retain a removal action.
Every successful save or removal reloads the authoritative saved list.
No reward or XP claim follows a save.

Better Auth calls use its official React client:

- `createAuthClient({basePath: "/api/auth"})`
- `useSession()` for reactive identity changes.
- `getSession({query: {disableCookieCache: true}})` before matching app identity.
- `signUp.email({name, email, password, callbackURL: "/"})`
- `signIn.email({email, password})`
- `requestPasswordReset({email, redirectTo: "/?view=reset"})`
- `resetPassword({newPassword, token})`
- `signOut()`

References: https://www.better-auth.com/docs/authentication/email-password and https://www.better-auth.com/docs/basic-usage.
Methods were checked against current documentation and installed package types on 2026-09-08.
Email notices describe private local capture, not delivery.
The private backend harness must open verification and reset links.
Reset tokens stay in memory and the URL. Successful reset removes the URL token.

## Private State

One in-memory saved list belongs to `authUserId + ownerId + sessionId`.
Session refresh clears that list and aborts old app requests before reading identity.
An epoch rejects responses from earlier contexts.
Reactive Better Auth identity changes and focus checks trigger this refresh.
Hidden documents clear private content before focus returns.
Rendering also checks the reactive Better Auth identity against the app session.
Sign-out clears private state immediately. Failure leaves a visible, blocked retry state.
A `session_changed` response clears context and refreshes identity without retrying the mutation.

Only the public `pendingSpotId` enters sessionStorage or the sign-in URL.
Sign-in never saves it automatically. The user must choose the explicit continuation action.
An in-memory per-place lock prevents concurrent duplicate mutations across both views.

## Design Selection

Sources were reviewed on 2026-09-08. No external component code was copied.
Local patterns come from `app/globals.css` and `docs/DESIGN.md`.
The selected composition uses a compact account panel and a restrained discovery grid.
It keeps violet accents, neutral surfaces, small radii, and clear place headings.
Synthetic icon-only cards replace photography because these places are test records.

| Source | Candidate and decision |
| --- | --- |
| https://www.beautifului.dev/ | Loading and task rows were reviewed. AI status patterns do not fit this auth proof. |
| https://ui.shadcn.com/docs/components/button | Outline buttons, named icons, and native button semantics guide the local styles. No registry code was copied. |
| https://beui.dev/ | Stateful buttons and animated tabs were reviewed. Motion and Tailwind dependencies are unnecessary here. |
| https://www.rareui.com/ | OTP and decorative components were reviewed. Neither fits email/password authentication and place saving. |
| https://transitions.dev/ | State swaps and error feedback were reviewed. Stable text notices avoid distracting motion and extra dependencies. |

All frontend styles live in `styles.css`.
Text uses `#18181b`; muted text uses `#52525b`; white surfaces use `#ffffff`.
Violet actions use `#6d28d9`; control borders use `#71717a`.
Controls have a minimum height of 44px and visible keyboard focus.
Disabled controls retain readable text. Reduced motion disables animation and transitions.
Native labeled forms and pressed view buttons avoid custom tab keyboard behavior.
Errors use alerts. Loading and captured-email notices use live status regions.

## Verification Handoff

The handoff is complete for the selected local scope. See `../docs/browser-evidence.md` for the final 19-image review.
The canonical package check now includes frontend TypeScript and ESLint, not only the Worker source.
Its separate browser check covers actual signup, save/remove, recovery, and cross-account request races.
Older entries below record intermediate runs, not outstanding implementation blockers.

The frontend TypeScript check and esbuild build passed on 2026-09-08.
The build verified both font source hashes. `git diff --check` also passed.
The backend-owned harness must use actual local API responses, not frontend mocks.
Review screenshots at 390px, intermediate widths, and 1440px before calling the visible UI complete.
Check zoom, Korean text, long place names, keyboard focus, contrast, and control sizes.

Required cases include signup, verification, sign-in, reset request, reset completion, and failed sign-out.
Also cover unlinked and incomplete mappings, empty saves, tombstones, quota errors, and failed GET retries.
Delay an Alice response across Bob sign-in and across tab changes.
Confirm that no old private row appears and no mutation retries under Bob.
Test shared per-place locking and authoritative reload failures.
Confirm pending saves need explicit confirmation after sign-in.
Inspect all network calls for same-origin HTTPS and absence of external media requests.

### Browser Evidence, 2026-09-08

`node scripts/browser-check.mjs` passed through actual HTTPS assets, workerd, and local D1.
The final run completed in 23 seconds, with zero page errors and zero blocked external requests.
The frontend type check also passed.
Backend test files and assertions were not changed for these frontend fixes.

The build now explicitly uses automatic JSX and `tsconfig.web.json`.
This fixes the missing React binding produced by the earlier classic JSX transform.
Focus checks now also refresh Better Auth's reactive session through `useSession().refetch()`.
Imperative `getSession()` alone did not update the React identity after the other tab changed accounts.

The harness passed real signup, private-outbox verification, invalid-password feedback, and sign-in.
It passed account creation, saving, authoritative refresh, removal, quota errors, and unavailable-place removal.
It delayed a real Alice response while another tab signed in as Bob.
The frontend then displayed Bob without Alice's private rows or email.
It also passed failed-read retries, failed logout, reset requests, reset completion, and revoked-cookie checks.
Error and delay routes are explicit test conditions, not successful auth or saved-data mocks.

Opened and reviewed these screenshots after the final passing run:

- `test-results/cloudflare-frontend/public-390.png`
- `test-results/cloudflare-frontend/public-900.png`
- `test-results/cloudflare-frontend/public-1440.png`

Paths are relative to the parent app.
Forms and place titles fit without horizontal overflow at all three widths.
The mobile layout stacks the account panel above the catalog.
The desktop layout retains two place columns and aligned save actions.
The first review found that the focused skip link covered the mobile test banner.
The focused link now enters normal flow below the banner. The final screenshots confirm the correction.

Functional auth tests run at the initial mobile viewport. Public screenshots cover all three widths.
This evidence does not establish full auth-flow coverage at every width or a complete WCAG audit.
Zoom, measured contrast, Korean fixtures, incomplete mappings, and pending-save continuation still need dedicated browser checks.
