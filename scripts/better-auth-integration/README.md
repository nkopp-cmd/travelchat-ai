# Root Better Auth Native Integration

## Collection Extension

The collection journey follows all 23 existing checkpoints.
It imports the actual `NativeItineraryCollection` and shared collection components.
The fixture accepts only local itinerary links and opens the actual native editor.
The delete callback clears the selected editor only when its ID matches.

Acceptance checks for this extension:

- [x] Preserve the existing 23 checkpoints.
- [x] Seed 27 additional Alice trips only after verified owner mappings exist.
- [x] Load 25 summaries, then the remaining three through the real API.
- [x] Check loaded-only search, duration filters, grid, list, and unsupported action absence.
- [x] Check real card navigation, modal keyboard trap, cancellation, and successful deletion.
- [x] Restore useful keyboard focus after normal and last-row deletion. Parent fix verified with exact section assertions.
- [x] Check empty DELETE bodies, current session headers, repeat safety, and owner isolation.
- [x] Check native D1 aborts, lost committed responses, and post-delete read faults.
- [x] Check held GET and DELETE replies across account changes.
- [x] Check real GET and DELETE deadlines without automatic retry.
- [x] Check last-row empty state, touch sizes, and unchanged application events.
- [x] Exercise real 1 MiB pages, the 4 MiB aggregate limit, and the 1,000-row limit.
- [x] Capture and review collection states at 390, 900, and 1440 pixels.

Private titles and annotations exist only in trusted Node fixtures and real API responses.
The browser bundle contains no private fixture payloads.
Fault tests use temporary D1 changes or hold actual Worker responses.
A second browser tab uses the official SDK during pending modal tests.
The test records focus failures as product issues and fails after writing the complete evidence.
This preserves later safety checks without reporting a false pass.

Attempt 1: All 23 existing checkpoints passed. The new fixture query used `id` instead of the outbox's `eventKey`.
The harness query now uses the actual schema. No product change was needed.
Attempt 2: Passed the original 23 and eight collection checkpoints. The modal hid the fixture refresh button from role lookup.
The second-tab helper now locates that existing control with `includeHidden`, then calls its real click handler.
Collection screenshots now capture the viewport at the collection instead of shrinking 28 cards into one tall image.
Attempt 3: Passed the original 23 and nine collection checkpoints. Found a product focus failure after successful deletion.
The final DELETE reached `200`, but Chromium could not retrieve its body through CDP.
The harness now validates each actual transport response before delivery, using the existing real-response holder.
The lost-response case also waits for the full 20-second DELETE deadline before a manual repeat.
Attempt 4: Completed 33 checkpoints. The aggregate gate failed only for the two recorded focus failures.
Attempt 5: Added actual metadata and row-boundary journeys. Completed 35 checkpoints with the same focus failures.
Attempt 6: Verified forward and backward keyboard wrap, then repeated all 35 checkpoints and both boundaries.
That run failed at the explicit product-issue gate. No assertion was weakened to make it green.
Attempt 7: Verified the parent's focus fix after waiting for the release runner to stop.
The updated `run-heavy.sh` acquired its serialized lock and passed the 4 GiB disk gate.
All 35 checkpoints passed, including stricter assertions for the exact settled focus destination.

### Current Result

Latest complete local run: 2026-09-11, about 301 seconds for the native integration test process.
The isolated TypeScript check, Worker build, and root component bundle build passed.
All 23 earlier checkpoints and all 12 collection checkpoints passed.
The single integration test passes. `collectionEvidence.productIssues` is empty.

| Counter | Latest Run |
| --- | ---: |
| Named checkpoints passed | 35 |
| Native API dispatches | 389 |
| Browser API responses | 374 |
| Collection DELETE attempts | 10 |
| Total screenshots | 90 |
| Collection screenshots | 42 |
| Page errors | 0 |
| Browser external attempts | 0 |
| Worker outbound attempts | 0 |

The initial collection has 28 Alice rows and one Bob row, including the prior editor fixtures.
The boundary fixtures add six large summaries and 1,001 small rows in separate temporary phases.
Those extra rows are removed through trusted Node D1 access before the final comparison.
The 4 MiB test retains five real pages and rejects page six without discarding the retained rows.
An oversized first summary returns native `413`. The row test stops at 1,000 and states that more trips exist.
All untouched itinerary rows and application events match their baseline values.
The foreign DELETE returns exactly `200 {success:true}` without changing Bob's row.
PATCH after deletion returns `404`, and the row stays absent.

### Focus Fix Verified

The earlier product defect left `document.activeElement` on `BODY` after normal and last-row deletion.
The parent fixed this in product code. The complete HTTPS rerun now verifies:

- Cancel returns focus to the exact itinerary action button.
- Normal deletion focuses `SECTION` with `aria-label="Your itineraries"`, `tabindex="-1"`, and `aria-busy="false"`.
- Last-row deletion focuses that same settled section after the honest empty state appears.
- Forward and backward Tab presses remain inside the actual Radix confirmation dialog.

Relevant parent changes are the persistent native section and post-reload focus effect in `native-itinerary-collection.tsx`.
The shared collection also falls back to its container when the old action trigger is disconnected.

This verification changed only the harness assertions, added post-delete captures, and updated this report.
No product/backend code, credentials, remote records, commits, or deployments changed in this task.

### Screenshot Review

All 14 collection states from the successful run were opened at all three widths: 42 images reviewed.
The states are loaded, search, duration filter, list, confirmation, pending, D1 error, lost response,
post-delete read error, GET timeout, both account switches, empty, and successful deletion with a reloaded list.
Files use `collection-<state>-{390,900,1440}.png` under `test-results/better-auth-integration/`.
The post-delete captures show the focused section's outline at mobile, tablet, and desktop widths.

No document-level horizontal overflow occurred. Dialog text and buttons fit all three widths.
The pending state disables both actions. Error text distinguishes uncertainty from a confirmed deletion with a failed read.
The collection has no images, create links, duplicate actions, or share actions.
At 390 pixels, measured controls were 38x32, 36x36, 36x36, and 28x28 pixels.
They meet the 24-pixel size check, but fall below the preferred 44-pixel touch size.
Mobile list thumbnails leave little width for long titles. The featured single-day caption also says `1 days`.
These visual observations do not establish full WCAG compliance or production layout quality.

Current machine evidence: `evidence.json`, `collection-evidence.json`, and `build-evidence.json` in that output directory.
The successful runner removed the earlier `failure.json`.
The older evidence sections below describe the prior editor-only run and remain historical context.

## Run

Run from the Localley root:

```sh
/home/dev/projects/CyberLink/shared/scripts/run-heavy.sh node scripts/better-auth-integration/run.mjs
```

Use `--browser /absolute/path/to/chrome-headless-shell` to select another installed Chromium executable.
The default uses the existing private Chromium installation. The launcher does not download browsers.

The launcher creates a clean environment before loading build tools or application code.
It retains only local executable paths, fresh home/cache/tmp directories, and explicit test settings.
It does not load environment files or inherit host credentials.
The native server creates fresh dummy secrets and a temporary TLS certificate.
The server listens at `https://localhost:8790` through `127.0.0.1` only.
The browser accepts this self-signed test certificate.
The server removes its temporary D1 database and TLS files after the test.

## Composition

`app.tsx` imports the actual root provider, bookmark controls, `NativeItineraryEditor`, and `Toaster`.
The native wrapper imports the actual shared `ItineraryEditor` core.
The fixture selector supplies opaque trip IDs only, with uppercase IDs to exercise canonicalization.
`public-fixture.mjs` contains only public spot data and trip IDs.
`editor-journey.mjs` creates private titles and annotations in Node after verified account creation.
The test checks that these private values do not occur in the browser bundle.
The fixture forms use the official Better Auth SDK and call the actual context's `refresh` method.
The fixture does not replace the provider or supply authentication or mapping responses.
The build checks the esbuild dependency list for the required root files and Better Auth `1.7.3`.
It rejects Clerk, Next runtime imports, and `providers/index.tsx` from that list.
PostCSS uses the root Tailwind configuration and `app/globals.css`.
`fixture.css` only supplies the surrounding test layout.

The test uses the existing native `dist/worker.mjs` build through `startLocalServer`.
The server applies migrations `0001` through `0005` and seeds explicitly named spot columns.
Node sets the public spot's city, address, and coordinates to match the staging fixture.
The harness build defines the unused Google Maps key as empty. It never loads a paid autocomplete service.
All accounts and venues are synthetic. No customer imports occur.
`assetsDirectory` is a trusted Node option, not an HTTP control.
Its original default remains `dist/public`.
The server returns read-only request counters to trusted Node code.

## Verified Journey

- [x] Signed-out root save preserves `/spots/<id>` as the return path without sending a save request.
- [x] SDK signup succeeds; sign-in before verification returns `403` and creates no session.
- [x] Node reads verification links from temporary D1 and opens the intended browser callback.
- [x] The root provider reports `unlinked`; both bookmark controls stay disabled.
- [x] Native unlinked saves return `409 conflict` without saved rows.
- [x] Explicit account creation produces `ready`, with separate owner and profile records.
- [x] Root `SaveSpotButton` saves to native D1; reload retains both controls' saved state.
- [x] Root `SpotInteractions` removes the native saved row.
- [x] Both mutation methods reject missing and empty session headers with `428`.
- [x] Both mutation methods reject mismatched session headers with `409`.
- [x] Rejected mutations leave saved rows and application events unchanged.
- [x] A second SDK account receives a separate owner/profile and isolated saved state.
- [x] Both accounts receive a `Secure`, `HttpOnly`, `SameSite=Lax` session cookie.
- [x] The browser returns only a boolean when checking that JavaScript cannot see the session token.
- [x] Renaming the temporary D1 mapping table causes a real `500` and blocks the actual provider.
- [x] Restoring the D1 table restores the provider's access.
- [x] A delayed real mapping response cannot restore an identity after sign-out.
- [x] A delayed real saved-state response cannot restore another account's saved state after switching.
- [x] Native D1 session revocation returns `401` and clears all four provider identity fields.
- [x] SDK password reset uses a Node-captured outbox link and revokes the old cookie.
- [x] Legacy subscription, Connect, gamification, and itinerary generation paths return `404` with a verified cookie.
- [x] Browser and Worker outbound guards record zero external attempts.

The delayed-response tests use `route.fetch()` and `route.fulfill({ response })`.
They retain actual response bodies and cookies. They do not construct substitute DTOs.
Verification and reset links come only from trusted Node D1 access.
No public test endpoint exists. Unknown API paths remain native `404` responses.

## Editor Checkpoints

The existing 11 bookmark checkpoints remain. The harness adds these 12 editor checkpoints:

1. Seed two private trips through Node after both users verify and create their accounts.
2. Check owner-filtered summaries without activities, pagination validation, and foreign GET/PATCH `404` responses.
3. Load only Alice's trip and stage the public spot at day 1, position 0.
4. Trigger the official SDK visibility observer and preserve the unsaved draft across a real background session request.
5. Save through the actual button, check the raw snapshot and session header, then reload stored data.
6. Cancel an activity edit, undo a title change, and test both navigation confirmation outcomes without Next.
7. Change D1 externally, receive snapshot `409`, retain the draft, and observe no retry for 31 seconds.
8. Hold a real GET response, switch accounts, hide private data before Bob loads, and discard Alice's late response.
9. Hold a real PATCH response and repeat the account switch without an old success or failure toast.
10. Replace real cookies without notifying the SDK; nested PATCH `session_changed` must refresh the actual provider.
11. Repeat the nested `session_changed` check through GET.
12. Reject missing, empty, and stale owner-session headers; revoke the live session and reject the actual Save with `401`.

The focus checkpoint does not call `AppSession.refresh`. It checks one actual `/api/auth/get-session` response.
It also checks that the same title input survives and that the wrapper does not reload the trip.
The account-switch controls intentionally use the real SDK and explicit provider refresh.
Cookie-switch tests use real, previously issued HttpOnly cookies from Node. They do not replace the SDK observer.

The held PATCH already committed under Alice's valid session before the account switch.
The test verifies that its late response cannot change Bob's editor or show an old toast.
This does not claim that a browser can undo an already committed request.

Node checks the inserted activity's ID, city fixture, coordinates, address, category, and position.
It checks private annotations, original coordinates, unknown day fields, and unknown activity fields after saving.
The five expected fields are `title`, `city`, `activities`, `highlights`, and `estimated_cost`.
The initial highlights and cost are null. The expected snapshot preserves those null values.
Node compares `subtitle`, `local_score`, `created_at`, `status`, `is_favorite`, IDs, owner, and day count without normalization.
Bob's entire database row remains unchanged throughout the journey.

## Evidence

Final verified run: 2026-09-11.
The launcher passed the isolated TypeScript check, Worker build, root component build, and one native integration test.
The integration test passed 23 named checkpoints.
The latest parent run dispatched 252 native API requests and observed 243 browser API responses.
Aborted requests and held replies can change these counts between runs.
The native counter measures dispatches, not only completed browser responses.
The run recorded zero page errors, browser external requests, or Worker outbound requests.

| Browser Operation | Status Counts |
| --- | --- |
| Itinerary collection GET | `200`: 3; `400`: 1 |
| Alice detail GET | `200`: 6; `404`: 4; `409`: 1 |
| Bob detail GET | `200`: 2; `404`: 2 |
| Alice update PATCH | `200`: 1; `409`: 3; `428`: 2; `401`: 1 |
| Bob update PATCH | `404`: 1 |

The recorder separately captures four held real responses: three GET `200` responses and one PATCH `200` response.
Two held Bob GET responses also appear in the browser counts. Do not add these tables as independent totals.
The held Alice PATCH committed successfully but its aborted browser request does not appear in the browser response counts.

Artifacts are under `test-results/better-auth-integration/`:

- `evidence.json`: checkpoints, sanitized browser calls, grouped methods/statuses, native count, and isolation results.
- `build-evidence.json`: actual bundle inputs and the root SDK version.
- `assets/`: generated fixture HTML, JavaScript, and CSS.
- `signedout-{390,900,1440}.png`: actual root controls and sign-in toast.
- `unlinked-{390,900,1440}.png`: disabled root bookmarks before account mapping.
- `ready-saved-{390,900,1440}.png`: both actual controls retain native saved state after reload.
- `mapping-error-{390,900,1440}.png`: actual provider blocks access after a native D1 fault.
- `editor-{loaded,staged,saved,reloaded,conflict,private-denial}-{390,900,1440}.png`: actual editor states.
- `editor-switch-{get,patch}-{loading,bob}-{390,900,1440}.png`: private data disappears before Bob's trip loads.
- `editor-{session-changed,revoked}-{390,900,1440}.png`: identity failures remove the editor.

The harness captures 48 screenshots across 16 states at mobile, tablet, and desktop widths.
All 16 states were opened at all three widths across the verification runs.
Review found an unreadable fixture selector. Its local style now uses the existing foreground and background tokens.
Capture now resets scrolling and waits two frames after each resize to avoid incomplete intermediate images.
Labels wrap within the layout. Root controls remain visible and do not cause horizontal overflow.
The screenshots show the actual focus ring, disabled states, and filled saved icons.
The signed-out toast temporarily covers part of the fixture session controls on mobile.
This review does not establish full product accessibility or production page quality.

Native calls include the following paths:

| Paths | Observed Results |
| --- | --- |
| `/api/auth/sign-up/email` | `200` |
| `/api/auth/sign-in/email` | `200`, `401`, `403` |
| `/api/auth/get-session` | `200` |
| `/api/auth/verify-email` | `302` |
| `/api/auth/sign-out` | `200` |
| `/api/auth/request-password-reset`, `/api/auth/reset-password` | `200`; reset callback `302` |
| `/api/session` | `200`, `401`, native fault `500` |
| `/api/account/new` | `201` |
| `/api/spots/save` | `200`, `401`, `409`, `428` |
| `/api/subscription/status`, `/api/subscription/checkout` | `404` |
| `/api/connect/status`, `/api/connect/onboard` | `404` |
| `/api/gamification/award` | `404` |
| `GET /api/itineraries` | `200`, invalid limit `400`; summaries omit activities |
| `GET /api/itineraries/:id` | `200`, foreign `404`, stale session `409` |
| `PATCH /api/itineraries/:id/update` | `200`, `401`, `404`, `409`, `428` |
| `POST /api/itineraries/generate` | `404` |
| `/api/outbox`, `/api/test-control` | `404` |

## Failures And Limits

The first run expected `403` for an unlinked save. The existing Worker correctly returned `409 conflict`.
The test now checks that exact contract. No product fix was needed.
Review found reset tokens inside callback path segments in an earlier local evidence file.
The recorder now redacts these segments and omits every query string.
The successful run replaced that file and checked all outbox tokens against the generated evidence.
The test never records response bodies, credentials, raw browser errors, traces, or callback screenshots.

The first editor run failed while opening an unlinked activity for editing.
The standalone bundle had left the Google Maps environment variable unresolved.
A diagnostic rerun located the failure. Defining that unused key as empty fixed the harness without product changes.
Subsequent complete runs passed all 23 checkpoints.

The first review found a false draft-retention toast after `session_changed` or revocation closed the editor.
The parent fixed this with explicit access-failure handling and removed the misleading toast.
The repeated run asserts that this text is absent in both cases. `editorEvidence.productIssues` is now empty.
The held-response account switches separately verify that no old success or failure toast appears.

This is direct root-component composition, not the full Next application or root `Providers` tree.
The fixture sign-in callback records the return path with browser history; it does not test the production sign-in route.
The editor test checks revocation through a failed Save and the wrapper's actual provider refresh.
It does not measure automatic cross-tab logout timing.
It checks saved-state persistence across reload, not live synchronization between two independent hook instances.
This run does not verify the full Next application. Its server pages still use Clerk.
The native collection contract defaults to 25 summaries, accepts at most 25, and limits responses to 1 MiB.
PATCH accepts at most 512 KiB. The editor requires a compatible decoded DTO with positive days and string activity names.
The two-trip journey checks pagination parameters but does not exercise full-page or byte-budget boundaries.
The parent verified 77 native proof tests, including the separate body and collection budget cases.
The standalone browser suite now passes both tests after exact DTO assertions and a stale-session ordering fix.
The complete root suite passed 1,974 tests with four optional checks skipped, and the optimized Next build passed.
No hosted migration, production release, or accessibility certification forms part of this evidence.
No production configuration, deployment, real email, real account, or live secret changed.
Root editor changes are documented in `docs/releases/native-itinerary-editor.md`.
No commit was created.

Parent delivery update: PR 123 was merged and deployed to the restricted Cloudflare preview.
The authoritative runtime, commit, rollback, and remaining production gates are in `docs/releases/seoul-discovery.md`.
After verification, the parent removed only the generated `assets/index.html` and `assets/assets/app.js`/`app.css` bundles.
The launcher rebuilds them. All unique screenshots and evidence reports remain intact.
