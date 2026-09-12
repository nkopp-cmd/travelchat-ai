# EditForm Browser Verification

## Verified Goals

- [x] Render the extracted ItineraryEditor on the server, then hydrate it in Chromium.
- [x] Use actual staging, day, activity, and UI components.
- [x] Keep all requests local, with no credentials or live services.
- [x] Prove opening and selection do not change the draft or save it.
- [x] Choose day 2 and insert before its second activity.
- [x] Prove Add to draft makes no request and prevents repeated staging.
- [x] Check canonical spotId, coordinates, order, and the original expected snapshot in PATCH requests.
- [x] Return submitted values as the successful save snapshot.
- [x] Prove HTTP 409 retains the draft and stops automatic saving.
- [x] Capture and open screenshots at widths 390, 900, and 1440.

## Run

Run from the Localley root:

```sh
/home/dev/projects/CyberLink/shared/scripts/run-heavy.sh node --import tsx scripts/edit-form-browser/run.ts
```

The runner builds isolated bundles with esbuild and compiles the existing Tailwind stylesheet.
It starts a temporary loopback server on an available port.
It closes the browser and server after the checks.
It does not start Next, load environment files, or add a public route.

The fixture imports the shared editor directly, without the Next or authentication wrapper.
It supplies a local PATCH request and a navigation callback that does nothing.
The Maps key becomes an empty string during bundling.
The browser allows three local assets and the exact fixture PATCH endpoint.
All other requests fail the run. Service workers stay disabled.

The runner uses the root Playwright driver and assertions.
Set `PLAYWRIGHT_EXECUTABLE_PATH` when using an existing compatible Chromium executable outside its default cache.
The verified run used cached Chromium revision 1243, version `153.0.8010.12`.
The runner no longer depends on the auth-proof package or its private paths.
No browser download was required for this run.

## Results

Attempt 1 passed on 2026-09-11: six scenarios, twelve screenshots.
Each width ran separate success and conflict cases.
Opening stayed unchanged after 31 simulated seconds.
Conflict cases sent no further saves during 61 simulated seconds.
Each case submitted one PATCH request.

The submitted activity contained:

```json
{
  "spotId": "11111111-2222-4333-8444-555555555555",
  "lat": 37.5763,
  "lng": 126.9837
}
```

The actual request field is `spotId`, not `canonicalSpotId`.
The value matches the canonical fixture ID.

Full assertions, request bodies, console errors, and screenshot paths are in:
`test-results/edit-form-browser/report.json`.

There were no uncaught page errors, hydration errors, or unexpected console errors.
There were no external requests or blocked request attempts.
Each conflict produced these two expected console errors:

```text
Failed to load resource: the server responded with a status of 409 (Conflict)
Save error: Error: This itinerary changed or its save snapshot is missing. Preserve your draft before reloading.
```

The report includes the exact stack locations.

## Screenshot Review

All paths below are relative to `test-results/edit-form-browser/`.
All twelve screenshots were opened and reviewed.

| Width | Opening | Unsaved Draft | Saved | Conflict |
| --- | --- | --- | --- | --- |
| 390 | `390-success-opening.png` | `390-success-draft.png` | `390-success-result.png` | `390-conflict-result.png` |
| 900 | `900-success-opening.png` | `900-success-draft.png` | `900-success-result.png` | `900-conflict-result.png` |
| 1440 | `1440-success-opening.png` | `1440-success-draft.png` | `1440-success-result.png` | `1440-conflict-result.png` |

The staging controls stack at 390 and align side by side at wider sizes.
The draft and conflict messages remain visible.
The added venue appears between Anguk lunch and Bukchon walk.
No screenshot state caused horizontal document overflow.

The first review found activity controls outside mobile cards and a crowded status header.
The integration now stacks mobile activity controls and wraps the status below the title.
Controls have accessible names and 44px targets.
The repeated harness checks also assert that these controls fit within their draggable rows.
Reviewed updated mobile draft, conflict, desktop success, and intermediate opening screenshots.
Long names wrap without clipping.
The automatic-save notice disappears after a conflict stops saving.

## Limits

This verifies component behavior, not the real API, database persistence, or authentication.
The successful fixture returns submitted values, rather than a fixed canned snapshot.
Duplicate prevention covers the staging flow, not the separate activity Copy button.
The harness uses Arial and a plain wrapper, not the full application shell or production fonts.
The toast hook runs, but the application toast viewport is absent.
The chooser, navigation, drag interactions, other browsers, and full accessibility compliance remain outside this run.
The check uses simulated timer advances, not wall-clock waits.
This harness does not run a production build or deploy anything.
Separate targeted tests, TypeScript, and lint results appear in `docs/releases/integrated-discovery.md`.

## Wrapper Integration

`components/itineraries/itinerary-editor.tsx` owns the existing UI and draft state.
It exports `ItineraryEditor`, `ItineraryEditorProps`, `EditorItinerary`, `ItinerarySavePayload`, `DayPlan`, and `Activity`.
Its required dependencies are `onNavigate(path): void` and `saveRequest(payload, signal?): Promise<Response>`.
Hosts must unmount or change the editor key when the trip or account changes.

`EditForm` remains the Next wrapper. It requires a ready Clerk session and a matching `itinerary.clerk_user_id`.
`NativeItineraryEditor({ id, planningSpot?, onNavigate? })` is the direct native entry point.
It has no Next imports. It requires a ready Better Auth account and an owned GET result.
It does not use `canBookmark` as permission to edit.

Native GET `/api/itineraries/:id` must return the decoded row directly:

```ts
{
  id: string;
  ownerId: string;
  title: string;
  city: string;
  days: number; // Positive safe integer, not the editable day array.
  activities: DayPlan[] | { dailyPlans: DayPlan[]; insights?: ItineraryInsight[] };
  highlights: string[] | null;
  estimated_cost: string | null;
}
```

The requested ID and current owner must match. Invalid fields produce an explicit error, not an empty editor.
The raw five-field snapshot stays separate from normalized display data.
PATCH uses `/api/itineraries/:id/update`, same-origin cookies, and `x-localley-session-id`.
Its existing body contains `title`, `city`, `days` (array), `insights`, `highlights`, `estimated_cost`, and `expected`.
A successful PATCH must return `{ itinerary: ItinerarySnapshot }` with all five snapshot fields.
The wrapper returns the original Response to the shared editor.
HTTP 401 and 403 refresh the session. HTTP 409 refreshes only for `code: "session_changed"`.
Snapshot conflicts keep the mounted draft and stop automatic saving. No fault causes automatic mutation replay.

This integrates the wrapper only. It does not migrate the production Next page to Better Auth.
The default Clerk providers, root server routes, and native backend remain outside this change.

## Extraction Verification

The 2026-09-11 extraction rerun passed all six browser scenarios and captured twelve screenshots.
The default browser binary was absent. The rerun used cached Chromium `140.0.7339.16` through `PLAYWRIGHT_EXECUTABLE_PATH`.
No browser download or package change was needed.
The review opened the mobile conflict, intermediate opening, and desktop success screenshots.
The conflict message remained visible. Activity controls stayed within their cards, and staging retained its existing layout.
The report showed no page errors or unexpected requests. Conflict console errors were expected.

The scoped unit run passed 45 tests across the wrapper, staging, activity, and server-page suites.
The optional layout test stayed skipped; the separate browser runner covered the shared editor at three widths.
The new wrapper suite contains 35 tests for ownership, DTO validation, session changes, aborts, and snapshot conflicts.
Root TypeScript checking and scoped ESLint passed without errors or lint warnings.
Native backend persistence and real session cookies still require the parent's integration run.
