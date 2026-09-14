# Native Trips Entry Evidence

Verified locally on 2026-09-11. No deployment or production data changed.

## Boundary

The production web entry imports the actual root `NativeItineraryCollection` and `NativeItineraryEditor`.
`TripsPane` explicitly composes the root `BetterAuthSessionProvider`.
It compares auth, session, owner, and profile identities before mounting either native component.
An observed mismatch refreshes the existing shell context. Loading does not refresh it.
Failed verification hides trips and requires an explicit retry without a remount loop.
Tabs retain the editor draft; account changes still unmount private content.
Native editor cancellation returns to the collection. Saving retains the native editor's existing behavior.
Create uses `POST /api/itineraries`. Share and duplicate stay unavailable.

The build aliases React and React DOM to the installed proof copies.
It writes `dist/web-dependencies.json` and asserts both native components are present.
It rejects Clerk, Next, Supabase, server-only, root Providers, and test/server entry dependencies.
It also asserts exactly one React entry. No package dependencies were added.
The Google Maps key is the empty string in this web build only.
Pilot image validation, copying, and license copying remain unchanged.
The native Worker build script and backend source were not changed.

## Local Test Model

Run from `cloudflare/auth-proof` through the shared heavy-command gate:

```sh
/home/dev/projects/CyberLink/shared/scripts/run-heavy.sh node scripts/browser-check.mjs --browser-executable=/home/dev/projects/CyberLink/.runtime/opencode-xdg/cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell
```

The launcher rebuilds the actual web assets and Worker, then runs both browser tests.
The existing Node HTTPS server now explicitly sets `APP_MODE=local`.
It uses disposable local D1, real Better Auth signup/login, and the captured local outbox.
Only `/api/app-config` presentation is substituted to exercise the preview layout at localhost.
This is not hosted `APP_MODE=preview` verification and does not bypass human Cloudflare Access.
Trip seeds and profile changes exist only in Node test code. They do not enter public assets.
No new test controls or fixtures are served by the application.

## Passed Checks

- Web typecheck and targeted ESLint for `web/app.tsx` and `web/trips.tsx`.
- Build, including dependency assertions and the existing pilot asset checks.
- Both browser tests: 2 passed, 0 failed, approximately 58 seconds total.
- Actual entry: Trips collection, UUID editor selection, title edit, and persisted save.
- Linked-place identity/address stay read-only; custom addresses use the actual manual autocomplete input.
- Unsaved edits survive Catalog to Trips tab changes.
- Profile mismatch closes the old shell context before any trip read.
- Root loading does not cause shell refresh; persistent provider failure retries only when requested.
- Delete confirmation cancellation preserves the D1 row; confirmation removes only the owned trip.
- A second owner's trip stays absent from the collection, returns 404, and survives the owned deletion.
- Delete dialog traps keyboard focus and returns focus to its action trigger after cancellation.
- Logout removes the native private subtree.
- Zero browser page errors and zero external browser or Worker requests in the native Trips journey.
- Existing catalog/auth browser assertions remain intact and pass.

## Visual Review

Opened all nine final screenshots under `test-results/cloudflare-trips/`:
`collection`, `editor`, and `delete-confirmation`, each at 390, 900, and 1440 pixels.
No horizontal overflow occurred at those widths.
Root components, tokens, cards, gradients, and Radix behavior are reused, not recreated.
Scoped Tailwind output prevents native styles from changing catalog or account controls.
Mobile navigation now wraps between buttons rather than splitting the word Catalog.
The native confirmation dialog keeps a 16-pixel mobile edge gap.

The first browser run exposed cached PostCSS serialization emitting unscoped styles.
The build now serializes the modified CSS root; existing contrast and keyboard checks pass again.
Review also caught draft loss on tab unmount and repeated recovery after provider failure.
Both cases now have passing regression checks.

This is not a full accessibility audit of the shared root editor.
Several existing basic-information labels lack input associations, and status colors need a separate contrast review.
Root product changes are outside this task's ownership.

## Parent Handoff

The parent retains remote database backup/migration, preview deployment, and Access policy verification.
No Git writes, private configuration changes, hosted test-mode switches, or production changes were performed.
The deployed target must remain the restricted `preview.localley.io`, not the full production service.
