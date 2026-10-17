# Atomic usage reservations

## Observed production defect

The October 17 read-only catalog and service-role OpenAPI show the weighted quota RPC. The unit quota RPC is absent. Production source `3f7b5dee` calls that absent unit RPC and falls back to a separate read/check/increment. Concurrent requests can bypass the limit. A failed fallback read can also become a zero count.

## Delivered correction

Reserve a unit through `check_and_increment_usage_weighted` with `p_amount=1`. Retain existing periods, prices, limits and model credit amounts. Refuse missing/failed RPCs and invalid results. Weighted reservations must also fail closed instead of charging one credit when their RPC is missing. Validate positive integer amounts and nonnegative integer limits within PostgreSQL INTEGER range. Every current tier limit is finite; the only external weighted caller uses the existing three-credit value.

The database uses UTC and `usage_tracking.period_start` is a date. Focused tests cover daily, Monday-start weekly and monthly boundaries. Keep all provider, rendering and image format rules unchanged.

## Evidence

The exact installed function definition has hash `a6a764c1cc36e9a8917512e24e9bce23` and contains the transaction advisory lock. Only the service role can execute it; anon/authenticated roles cannot. Usage RLS exposes only the existing user read policy. No grant or schema change is needed for this fix.

Direct live REST calls with a fresh owned identifier, zero limit and amounts one and three both returned denied/count zero. Metadata checks prove no owned row before or after and the same function hash. This tests the hosted database RPC contract; it does not prove the new Worker code is deployed. The Management API read-only function probe did not complete and is not claimed as a pass.

The exact captured SQL now has a required PostgreSQL proof inside the existing guarded CI batch. It uses a cached image pinned by digest, no network or ports, bounded CPU/memory and temporary database storage. It checks concurrent oversubscription and the 50th/51st boundary for unit and weighted credits. A job-specific always-cleanup step protects cancellation. No second heavy slot or live database key is needed.

## Production delivery — 2026-10-17

PR432 tested source `dbd09ad27037545314ce397b1da641f47656a3fe` passed required self-hosted CI `38987106920` in16m34s. Merge `6d5b6c0f1c548479f365ce58166f506d390d6fe7` has the same tree. The suite passes37focused tests plus existing regressions, lint and TypeScript. The pinned OpenNext build passed. Artifact audit scans94private values with0hits; five preexisting server-side aliases of the public Kakao key remain documented exceptions.

The actual local PostgreSQL proof passes20checks. Fifty concurrent unit requests at cap10 allow10 and persist10. Fifty three-credit requests at cap10 allow3 and persist9. Unit cap50 and weighted cap150 each admit50reservations and deny the51st. Period keys and zero caps pass. The job-owned container is removed. The captured function MD5 is `a6a764c1cc36e9a8917512e24e9bce23`; normalized body SHA256 is `b2ddb8bdbfa6ece24db519b22160507914a4e419e0afecdcb71c39aeba7858e4`. The required job retains the report for seven days.

Read-only code and helper reviews find no unresolved P0/P1. The first helper review lacked file access; another reached its120second limit without a verdict. The bounded helper-only240second review then approved the actual scripts. Both rollout self-tests pass nine guards. The live function hash was recaptured before activation and remains unchanged. All55production bindings match the prior version, including the secret admin allowlist and Source binding; no candidate application database is attached.

Worker `19b90012-a85c-426c-a40e-9323ffaa5370` now runs100% in deployment `be8a200a-16dc-42a7-9435-f5195356475d`. Prior version `ca4dfaf3-1d5d-4798-9957-257738fb7c01` remains the rollback. Actual 1% canary `f7e7ed8b-cfb3-40b0-b61b-83a4561df32d` passed25checks. Tested restoration `35e8ffd7-c0fa-4569-814e-f939bb7b84eb` returned the prior version to100% before promotion. Default verification passes25checks. Both recovery timers are stopped.

Each live check creates one reserved, verified, non-admin credential fixture without sending email. Existing weighted SQL seeds only its current daily chat counter to the free cap10. Actual signed-in POST `/api/chat` returns429 `limit_exceeded` with current10/limit10 before the provider branch. Its counter remains unchanged. Public `/`, `/explore` and `/api/cities` return200. Exact fixture Source rows, D1 sessions/account/user are removed. Complete counted Source snapshots and both admin hashes match before/after. No provider call, payment, grant or schema change occurs.

Private receipts: `atomic-usage-ci-sql-proof-38987106920.json`, `atomic-usage-artifact-20261017.json`, `atomic-usage-bindings-preserved-20261017.json`, `atomic-usage-hosted-canary-20261017.json`, `atomic-usage-hosted-default-20261017.json`, `atomic-usage-window-state-20261017.json`, and `atomic-usage-promotion-state-20261017.json` under the host's private Localley state directory. Authentication cookies and fixture details stay private.

## Scope and limits

Old99% traffic during the canary still ran the prior unsafe path. The race proof establishes the new helper and installed SQL behavior, not a global cap across mixed old writers. At100%, all tracked active quota callers use the corrected helpers; external or old-deployment writers remain a migration audit item. The unused legacy increment exports remain for compatibility.

The denial proof verifies the deployed limit path without a paid model call. It does not claim a new paid generation acceptance. An RPC outage still returns the existing quota error with count0; a distinct503 can improve that message later. Whole-table hashes deliberately fail closed if concurrent real traffic changes data; exact REST counts prevent partial snapshot claims.

This correction does not activate D1 application data or complete the Supabase cutover. Full current-data parity, media disposition, signed-in canary and rollback/freeze gates remain open. Keep Supabase intact.
