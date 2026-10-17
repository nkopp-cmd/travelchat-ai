# Atomic usage reservations

## Observed production defect

The October 17 read-only catalog and service-role OpenAPI show the weighted quota RPC. The unit quota RPC is absent. Production source `3f7b5dee` calls that absent unit RPC and falls back to a separate read/check/increment. Concurrent requests can bypass the limit. A failed fallback read can also become a zero count.

## Prepared correction

Reserve a unit through `check_and_increment_usage_weighted` with `p_amount=1`. Retain existing periods, prices, limits and model credit amounts. Refuse missing/failed RPCs and invalid results. Weighted reservations must also fail closed instead of charging one credit when their RPC is missing. Validate positive integer amounts and nonnegative integer limits within PostgreSQL INTEGER range. Every current tier limit is finite; the only external weighted caller uses the existing three-credit value.

The database uses UTC and `usage_tracking.period_start` is a date. Focused tests cover daily, Monday-start weekly and monthly boundaries. Keep all provider, rendering and image format rules unchanged.

## Evidence and remaining release gates

The exact installed function definition has hash `a6a764c1cc36e9a8917512e24e9bce23` and contains the transaction advisory lock. Only the service role can execute it; anon/authenticated roles cannot. Usage RLS exposes only the existing user read policy. No grant or schema change is needed for this fix.

Direct live REST calls with a fresh owned identifier, zero limit and amounts one and three both returned denied/count zero. Metadata checks prove no owned row before or after and the same function hash. This tests the hosted database RPC contract; it does not prove the new Worker code is deployed. The Management API read-only function probe did not complete and is not claimed as a pass.

The exact captured SQL now has a required PostgreSQL proof inside the existing guarded CI batch. It uses a cached image pinned by digest, no network or ports, bounded CPU/memory and temporary database storage. It checks concurrent oversubscription and the 50th/51st boundary for unit and weighted credits. A job-specific always-cleanup step protects cancellation. No second heavy slot or live database key is needed.

The final focused suite, exact-function PostgreSQL proof, review findings, required exact-head CI, pinned OpenNext build, artifact audit, guarded release and live Worker checks must pass before delivery. Do not enable a fallback or invoke a paid provider merely to obtain proof. This correction does not activate D1 application data or complete the Supabase cutover.
