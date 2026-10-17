# Candidate trip duplication

## Scope

The duplicate API gains an isolated D1 branch. Normal production and normal preview requests retain their Source behavior.
Admission requires the exact preview hostname, `data_candidate=d1`, `AUTH_MAIL_MODE=outbox` and `SUPABASE_READ_ONLY=true`.
The caller must be a verified reserved preview user with exactly their fresh owner mapping and no legacy mapping.
An optional preview actor header must match the authenticated user.

Only the caller's owned trip can be copied. Foreign trips remain forbidden even when shared or public.
Imported-owner and public/shared cross-owner copies need separate acceptance before activation.
This increment changes the API only; it does not activate a browser copy control.

## Write semantics

One `INSERT ... SELECT` checks ownership and absence of legacy mappings again inside the write.
It creates one fresh UUID and timestamp, preserves subtitle, city, day plans, activity fields,
score, highlights and estimated cost, and adds ` (Copy)` to the title.
The copy is an unfavorited private draft. Sharing codes, media, likes and counters are not copied.
No R2, quota, provider, email, payment or Source writes occur on this branch.

A successful response includes the saved D1 readback and `Cache-Control: no-store`.
Missing trips return404; denied owners return403; database failures return a fixed503 without Source fallback.
The endpoint has the existing duplicate action's non-idempotent semantics: one explicit POST creates one copy.
An uncertain network result must be reconciled with owned rows before any retry.

## Verification

The first focused run passes52tests across new route/real-SQLite suites, Source-owner regression tests and existing editor ownership tests.
These cover content preservation, private defaults, missing/foreign/shared/public refusal, verified reserved identity,
legacy mapping conflicts, an ownership race inside the insert, fixed errors and unchanged normal routing.
Focused ESLint, TypeScript and diff checks pass. The focused independent review finds no P0/P1 risk.
The required workflow includes the new route and SQLite tests explicitly.

## Release attempt — 2026-10-17

PR452 source `b93a8508891b81684b20bd8d4cdad771731059be` passed required self-hosted CI39032234018 in17m14s.
Merge `ce4f3c61fdc69b6d10895d6a4dc6a12e51b5c654` has the same tested tree.
The fresh pinned public-only OpenNext build scanned71private values with zero hits.
All six direct cleanup safety cases pass, including unknown-version, legacy-owner and foreign-row refusal.
The earlier two optional operator reviews timed out without verdicts. The existing focused code review passed.
Root rules require consultation before production release; this bounded release targets isolated preview only.
No third identical advisor call was made.

Uploaded candidate `15bdeaa5-a8cb-4d48-9ff2-1b071ac1f196` passed13inactive-upload guards.
All33complete preview bindings match the prior preview version, including its absent notification-storage flag.
The upload used a temporary config with the exact existing plain variables; it changed no secrets or schedules.

The first canary API request returned400 before traffic or fixture creation.
Its extra `workers/triggered_by=api` annotation differed from pinned Wrangler's payload; the response detail was not retained.
The second request used Wrangler's message-only annotation and admitted the1% candidate.
Both reserved test users completed preview signup, outbox verification and verified session checks.
The owned duplicate POST then returned500 with no `X-Localley-Data-Source` header.
Fourteen hosted checks passed before that failure. Copy persistence and denial acceptance did not run.
The error's exact cause remains unproved; local tests do not establish hosted acceptance.

The operator stopped after two failed release attempts. It restored preview version
`e08db2c5-5788-4fbb-94d8-3bd373f33420` at100% and removed both owned fixtures.
Both cleanup receipts prove all55candidate tables and8preview Auth business tables match their prior row hashes/counts.
Foreign-key checks return0errors. Shared auth rate counters and the mailbox AUTOINCREMENT sequence advance normally and are never reset.
Both fixture leases are closed; both cleanup timers are inactive.

Production Worker `3132337f-a1bc-4ff5-a780-bdbe7a65e557` remains on deployment
`6a17bf4b-e2c1-435b-999e-25614fadbaec` at100%.
All48Source table hashes and production Auth counts/both administrator rows remain unchanged.
No default preview promotion, production upload, payment, provider generation or external email occurred.
Private `d1-duplicate-resume-upload`, `hosted`, `hosted-attempt2`, both fixture-cleanup receipts,
and `final` retain the exact native results. The inactive candidate remains available for diagnosis.

The following repair completes this API acceptance. Browser copy controls and the full production data cutover remain open.
Production application data remains on Source. This increment does not authorize a full data switch or Source deletion.


## Hosted repair accepted — 2026-10-17

PR454 source `82d7ce186e572bf032d52fd22549428ff3e58141` removes the redundant incoming-request constructor.
Merge `10181b8b73640be4586663506309b63465311fbf` has the same tested tree.
Required self-hosted CI39037202818 passes17m41s. The focused repair review reports PASS with no P0/P1 risk.
The review uses the supplied exact repair and verification facts; it performs no separate file inspection.

The exact private test command runs these four suites with `--maxWorkers=1`:

- `__tests__/api/itinerary-duplicate-candidate.test.ts`
- `__tests__/lib/app-data-preview-itinerary-duplicate.test.ts`
- `__tests__/api/source-owner-readers.test.ts`
- `__tests__/lib/app-data-preview-itinerary-editor.test.ts`

All52tests, focused ESLint, `tsc --noEmit` and `git diff --check` pass.
The route regression simulates Workerd rejecting reconstructed incoming requests.
A native pinned Workerd probe confirms the underlying behavior: reconstruction of a proxied Request throws TypeError/Invalid URL.
Direct access to that wrapped request's URL succeeds. The first probe used outdated Miniflare options;
the corrected probe uses its installed `convertV4MiniflareOptions` adapter and passes.
The fresh public-only pinned `npm run cf:build` passes; its71private-value scan finds0hits.
All six direct cleanup safety cases pass.

### Actual preview result

- Worker version: `9354e5af-9824-419e-bed4-0e4e18a0af37`.
- Initial1% candidate deployment: `3c735355-0f5f-4b3f-b357-c0cf5acf82d0`.
- Executed rollback deployment: `cf7f201c-35b5-43fe-90bd-f632e1315fc3`, restoring `e08db2c5-5788-4fbb-94d8-3bd373f33420` at100%.
- Verified default preview deployment: `f08a4f4a-3ad6-4aec-bff4-048c3e20839a`, serving the new version at100%.

The first repaired canary passes33checks, including actual copy/reload, private defaults and denied cases.
Its immediate default request returns404 without the D1 header. A narrow native ABR1 log confirms that
old versione08db2c5 served the request three seconds after promotion. This is deployment propagation,
not another observed failure of the repaired candidate. The operator restores preview and cleans the fixtures.
It never retries the uncertain write automatically.

The second attempt first verifies prior cleanup, Source preservation, administrators and the known restored preview.
It uses fresh reserved fixtures and waits60seconds after default promotion before one new controlled copy.
All47hosted checks pass. Canary and default POSTs each create exactly one owned private draft.
GET reloads match the saved response. Subtitle, day plans, nested activity fields, score, highlights and cost survive.
The original remains unchanged; story metadata, sharing codes, likes and counters do not transfer.
Foreign public trips, actor mismatch, signed-out calls and missing IDs receive their actual403/401/404contracts.
Every denied request preserves all candidate rows and exposes no private subtitle.
Unverified/imported-owner refusal and normal preview/www routing remain covered by the focused local tests.
No new browser copy control is activated by this API increment.

Both attempts restore all55candidate and8preview Auth business-table hashes/counts; foreign-key checks return0errors.
Both fixture leases close and both watchdog timers stop. Shared auth rate counters and mailbox sequences remain monotonic.
All33preview binding definitions,48Source table hashes, production Auth counts and both full administrator rows remain unchanged.
Production3132337f/6a17bf4b remains at100%; preview has0cron schedules.
Final root, sign-in and city API checks return200 with complete bodies.
No production data switch, Source deletion, external email, paid generation or payment occurs.

Private `d1-copy-fix-final`, `hosted-attempt2`, both fixture-cleanup receipts, `review`, `ci`,
`build` and `default-version-audit` retain exact tests, source, deployment, cleanup and failure evidence.
This closes only the isolated owned-trip duplicate API gate. Remaining routes, browser actions,
full current-data/media parity, executed production rollback and the final switch remain separate gates.
