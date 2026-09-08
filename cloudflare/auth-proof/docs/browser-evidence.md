# Local Browser Evidence

Verified on 2026-09-08. This evidence applies only to the isolated local proof.
It does not authorize deployment or a production authentication change.

## Runtime

The browser opens `https://localhost:8790`.
The Node HTTPS server listens only on `127.0.0.1:8790`.
It forwards bounded requests to `Miniflare.dispatchFetch`.
The worker receives `AUTH_BASE_URL=https://localhost:8790`, including the port.

The runtime uses these installed versions:

| Component | Version |
| --- | --- |
| Node | 22.22.1 |
| Miniflare | 5.20260907.0-alpha |
| workerd | 1.20260907.1 |
| Wrangler | 4.129.1 |
| Playwright | 1.63.0 |
| Chromium | 153.0.8010.12, build 1243 |

**Native Miniflare assets engine: yes. No static-map adapter is used.**
The worker config supplies `assets.directory`, `hasUserWorker`, and `runWorkerFirst`.
The `ASSETS` environment entry has type `assets`.
Miniflare builds the native assets manifest from `dist/public`.
Wrangler generates `ASSETS: Fetcher` in `worker-configuration.d.ts`.
The worker calls `env.ASSETS.fetch` after its local-origin gate.
Authentication, application requests, and SQL use real workerd and D1.

The generated frontend contains `index.html`, `assets/app.js`, and `assets/app.css`.
`scripts/build.mjs` calls the independently maintained frontend build when that script exists.
Frontend build failures remain fatal.

## Commands

Run these commands from `cloudflare/auth-proof`:

```bash
npm run check
node scripts/browser-check.mjs
node scripts/browser-check.mjs --fresh
```

The fresh command removes only generated `dist` output.
It then runs `scripts/check.mjs`, the exact entry point used by `npm run check`.
It starts the browser suite only after that check passes.
This verifies type generation before assets exist, followed by real frontend and worker builds.
No empty assets directory or substitute binding makes this test pass.

For the optional manual server:

```bash
node scripts/local-server.mjs
```

The CLI prints only the local origin.
It exposes no mailbox, token, fixture-control, or bypass endpoint.
Manual signup cannot retrieve a verification token through HTTP.
Only trusted Node tests read the private D1 outbox.

Chromium uses `node_modules/.cache/playwright`.
The existing installed cache was moved there from `.local/browser-cache`.
`clean:local` preserves this dependency cache.
A dependency reinstall can remove it; install Chromium again in this same package-local path when needed.
The harness never reads an external browser directory.

## Results

The final parent check also passed Worker and frontend TypeScript, shared source lint, all 26 runtime tests, and host isolation.
The parent then reran the browser suite successfully in 35.6 seconds.
That run recorded 53 instrumented helper calls and 251 browser-observed API responses, with zero page errors or external requests.
The isolated package's production dependency audit reported zero vulnerabilities after the frontend dependencies were added.
Request counts vary with reactive session refreshes; they are not separate test-case counts.

The fresh-output run passed the clean-environment test and all 26 standard tests.
The standard runtime proof handled 266 instrumented requests in 47.8 seconds.
The following browser run also passed.
The final `npm run check` rerun passed all 26 tests in 47.4 seconds of measured runtime work.
`npm run typecheck:web` also passed when run separately.
After `npm run clean:local`, the installed Chromium cache remained available in `node_modules/.cache/playwright`.

The final standalone browser run, including the strict signed-in reset heading regression, completed in 37.5 seconds:

| Measurement | Result |
| --- | --- |
| Initial native API checkpoint | 41 requests, 9.3 seconds |
| Instrumented API helper calls, including UI assertions | 53 |
| Browser-observed API responses, including reactive session reads | 250 |
| Longest instrumented helper request | 273 ms |
| Page JavaScript exceptions across test tabs | 0 |
| Attempted external browser requests | 0 |
| Representative screenshots | 19 across nine states |

These counts describe requests, not separate test cases.
Node reports one end-to-end browser test with multiple checked stages.
Wall time does not measure CPU time.
Reactive session requests can change the browser response count between runs.

## Checked Behavior

- Public catalog fields, parsed multilingual JSON, nullable fields, pagination, and strict query validation.
- Hidden catalog rows stay private, and unknown mailbox or fixture routes return 404.
- Real browser signup, private-outbox verification, invalid password, sign-in, and explicit account creation.
- Real Secure, HttpOnly, SameSite=Lax cookies remain unavailable through `document.cookie`.
- Matching application session headers permit writes; absent headers still pass the existing standard tests.
- Stale headers cannot provision accounts, claim identities, create notes, or save spots.
- Mismatched headers return `409 session_changed` without application rows or events.
- Real save, page refresh, and remove operations work at 390px and 1440px.
- Guest selection survives sign-in and does not save automatically.
- Selection clears on explicit logout and when the account changes from A to B.
- An old, delayed native saved-list response cannot restore A's private collection after B signs in.
- A UI save starts with A's real body and expected-session header before logout.
- Delayed delivery with B's current real cookie returns `409 session_changed`, with no additional saved rows or events.
- Real D1 quota fixtures produce the quota error, and hidden saved spots produce removable tombstones.
- A failed saved refresh displays an error, not a false empty collection.
- Loading, empty catalog, failed catalog, and failed sign-out states remain visible and accurate.
- Failed sign-out hides private data without falsely reporting successful logout.
- Password reset uses a real private-outbox token and the actual reset form.
- The native API reset test rejects the previously active cookie and the old password after reset.

## Explicit Test Conditions

Success responses for authentication and saves are never fabricated.
The tests use the following controlled conditions:

- Trusted Node changes D1 visibility and quota rows for synthetic fixtures.
- A saved-list response comes from the real worker, then waits before delivery.
- A mutation waits at the test transport boundary while logout and B's native login complete.
- That mutation keeps A's original body and expected-session header but uses B's current cookie from the real browser context.
- The worker produces the rejection; the test does not fabricate its status or error body.
- HTTP 503 responses simulate catalog, saved-refresh, and sign-out failures.
- A delayed catalog failure exposes its real frontend loading state before the injected error.

The mutation delay deliberately tests the guard with changed cookies.
It is not a claim that Playwright's intercepted request automatically changes its original cookie snapshot.
The test retains the separate delayed-response regression.

## Image Review

The original 11 representative images were opened and reviewed during the earlier validation.
All eight added authentication images were also opened and reviewed after the extended suite passed.
Paths below are relative to the Localley root, not the proof package:

| State | Images |
| --- | --- |
| Signed-in empty collection and pending confirmation | `test-results/cloudflare-frontend/empty-390.png`, `empty-1440.png` |
| Signed-in Korean saved place | `test-results/cloudflare-frontend/saved-390.png`, `saved-1440.png` |
| Signed-in failed refresh, injected HTTP 503 | `test-results/cloudflare-frontend/error-390.png`, `error-1440.png` |
| Signed-in catalog with long Korean name | `test-results/cloudflare-frontend/long-name-390.png`, `long-name-1440.png` |
| Signed-out public catalog | `test-results/cloudflare-frontend/public-390.png`, `public-900.png`, `public-1440.png` |
| Signup form, populated synthetic fields and masked password | `test-results/cloudflare-frontend/signup-390.png`, `signup-1440.png` |
| Password reset request form | `test-results/cloudflare-frontend/reset-request-390.png`, `reset-request-1440.png` |
| Signed-out reset form with actual private-outbox token | `test-results/cloudflare-frontend/reset-390.png`, `reset-1440.png` |
| Signed-in reset form with another actual private-outbox token | `test-results/cloudflare-frontend/reset-signed-in-390.png`, `reset-signed-in-1440.png` |

Every filename in the second column uses the same `test-results/cloudflare-frontend/` directory.
Screenshots contain synthetic names and email addresses, but no credentials or callback tokens.
Passwords remain in normal password inputs and appear only as masking dots.
Before each capture, the harness rejects visible token text or plaintext password text.
Page screenshots exclude the browser address bar, and the harness never logs callback URLs.

The initial captures placed sticky elements at the prior keyboard-scroll offset.
The harness now scrolls to the top and waits for rendering before each full-page capture.
The final images show the banner at the top without hiding account text.
Long Korean headings wrap inside their cards at mobile and desktop widths.
The saved and empty states show distinct content.
The error state shows a clear retry action instead of an empty result.
Keyboard outlines remain visible in the final images.
No horizontal overflow appeared in these views.
Signup and reset controls stay inside their panels at both widths.
The desktop reset-request heading wraps onto two lines without clipping.

### Resolved Heading Defect

The signed-in reset form previously displayed **Account** instead of **Reset password** at both widths.
The parent fixed the frontend heading to give reset mode priority over the current account identity.
The harness now strictly asserts **Reset password** at both 390px and 1440px before capturing the signed-in form.
A recurrence fails the browser suite; the test no longer accepts or merely reports the old heading.
The final run passed, and both corrected `reset-signed-in` images were opened and reviewed again.
They show **Reset password** above the real authenticated identity and reset form without clipping.
The test preserves reset submission, old-password rejection, cookie checks, and every prior functional case.
No unresolved UI defects remain in the selected, reviewed scope.
The access and browser coverage limits below still apply.
No frontend source was changed for this harness update.

## Measured Access Checks

The harness checks all displayed interactive controls in each captured state.
It checks 212 repeated control instances across the 19 images.
Every measured target has width and height of at least 44 CSS pixels.
Thus, those targets also exceed the 24px minimum.
Real Tab navigation reaches every enabled control in each measured state.
The measured keyboard outline is 3px and uses the accent token.

The harness measures nine semantic contrast pairs from computed CSS tokens:

| Pair | Ratio | Required |
| --- | --- | --- |
| Text / background | 17.72:1 | 4.5:1 |
| Muted text / background | 7.73:1 | 4.5:1 |
| Text / surface | 16.12:1 | 4.5:1 |
| Muted text / surface | 7.03:1 | 4.5:1 |
| Action text / accent | 7.10:1 | 4.5:1 |
| Selected action / accent surface | 6.48:1 | 4.5:1 |
| Error text / error surface | 7.60:1 | 4.5:1 |
| Control boundary / background | 4.83:1 | 3:1 |
| Focus indicator / background | 7.10:1 | 3:1 |

The browser uses reduced motion.
Computed styles show no active animation or nonzero transition duration in the measured states.
The harness waits for `document.fonts.ready` before captures.

## Isolation And Limits

The launcher starts child processes with an explicit clean environment.
It does not inherit provider credentials, proxy overrides, or global TLS exceptions.
Only the local browser context ignores the short-lived self-signed certificate.
OpenSSL creates a one-day certificate inside a private package-local directory.
The key and certificate use mode 0600.
The HTTPS bridge preserves separate Set-Cookie headers and bounds request bodies.
Miniflare's outbound hook rejects worker network calls.
Browser routes reject origins other than the local origin; WebSockets are blocked.
No HAR, trace, cookie dump, token log, or query-string log is retained.
Teardown closes Chromium, the server, and Miniflare, then removes run-specific database and TLS files.

This is not a complete WCAG conformance report.
It does not cover screen-reader speech, every transient control state, browser zoom, or other browser engines.
Token measurements do not establish contrast for every possible inherited, hover, or disabled style.
The long Korean fixture tests layout and font loading, not linguistic quality.
The fresh-output test does not reinstall all dependencies.
This is native local assets evidence, not evidence from a deployed Cloudflare environment.

The parent added `npm run typecheck:web` to this package's canonical `check:inner` script.
The canonical lint command now checks both `src` and `web`.
Those integration changes belong to the parent; this extension reran the browser suite only.
Browser checks should remain opt-in unless CI explicitly provisions Chromium and local TLS support.
No root package or frontend-owned script was changed for this harness work.
