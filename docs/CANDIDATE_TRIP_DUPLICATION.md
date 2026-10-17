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

The pinned public-only build, exact-head CI, merged preview release, hosted acceptance and cleanup remain pending until recorded below.
Production application data remains on Source. This increment does not authorize a full data switch or Source deletion.
