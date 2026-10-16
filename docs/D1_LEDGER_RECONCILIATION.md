# Candidate D1 migration ledger

## Scope

This procedure registers migrations whose complete schema already exists.
It does not apply migrations, rebuild tables, import Source data or enable delivery.
It accepts only candidate database `6f5b1df7-2eb5-479f-8803-8095e72c7053`.
Production application data remains on Supabase.

The canonical directory contains the original thirteen migrations and all later increments.
`expectedSchema()` checks the original thirteen file hashes against pinned commit
`25a48dfcdae92f9a02893a731d4f248626ad4b31`, then executes the complete chain once locally.
CI fetches that exact commit for shallow checkouts. Modified or missing base files cause refusal.

The former tool executed the base twice and failed before producing registration SQL.
PR429 fixes this defect without changing the registration guard or application runtime.

## Required operation

1. Pin the account, candidate binding and `migrations/app-preview` directory.
2. Read every schema object, ledger entry and foreign-key violation.
3. Compare the complete expected schema. Reject unknown objects or ledger names.
4. Generate one guarded metadata INSERT with `scripts/d1-migration/reconcile-ledger.mjs`.
5. Run remote EXPLAIN on the complete generated statement. Never shorten its predicates.
6. Export the candidate privately and test restoration on a local copy.
7. Preserve the real `sqlite_sequence` values during that rehearsal.
8. Record the protected engine-table limitation; never invent its data or bypass its access rules.
9. Compare live application, ledger and sequence hashes with the restored copy.
10. Obtain review and exact green CI before merging the tool change.
11. Capture fresh schema, row hashes, counts, ledger entries, sequences and runtime baselines.
12. Capture a fresh Time Travel bookmark immediately before the guarded INSERT.
13. Require exactly the reviewed missing entries. Require zero changes on repetition.
14. Preserve every old ledger entry, application row, schema object and foreign key.
15. Permit only the intended ledger sequence advance; preserve other sequences.
16. Run `wrangler d1 migrations list APP_DATA_PREVIEW_DB --remote --config wrangler.jsonc`.
17. Require no filenames and the message `No migrations to apply!`.

Run the existing account guard before remote operations. Do not run blanket migration application.
If any postcondition fails, stop and inspect the receipt and original pending list.
Never repeat an uncertain write or restore over unrelated subsequent writes automatically.

## Rollback

Time Travel can restore the exact candidate bookmark. It also discards later candidate writes.
Quieten candidate writers and inspect current state before any remote restore.
The exported-copy rehearsal tests registration, repetition and transaction rollback locally.
Its rollback must restore every local application row and the original sequence values.
This rehearsal does not claim a production rollback test or a full Source-to-D1 rehearsal.

## Delivered 2026-10-16

PR429 tested head `5cd35b6f577d2cbedcc89a6c47325db591f68a5c` passed required CI38972957408.
Merge `3aca92f7ae1010eb1ea6ea861ded03ce80177aac` has the exact tested tree `3c7f6a254401a5f8b92d2c6f554bb9a3acb81255`.
Eight Node/SQLite tests and scoped lint pass. Reviews cover supplied code and the amended operation plan.

All87 schema objects matched. The complete32286byte statement passed remote EXPLAIN with849 rows.
SQL SHA256: `f24f6aa81407c6d962d5b0744037efd34638501177f430d83c21ff6a20db30d6`.
The retained11853219byte export restored locally. Ten rehearsal checks passed.
D1 excludes `_cf_KV` from the export. Its exact schema was a local guard placeholder only.
Its protected rows were not imported, compared or changed.
Actual sequence values were restored before the local registration and rollback tests.
Live hashes matched all57 application/ledger/sequence tables in the restored copy.

The actual operation passed17 checks. It registered only0001–0013 and0031.
The ledger changed from18 to32 entries. Its sequence advanced from18 to32 as intended.
All55 application tables retained exact row hashes and counts. All old ledger entries remained unchanged.
All87 schema objects and foreign keys remained intact. Repetition changed zero rows.
Wrangler confirmed fourteen pending filenames before registration and none afterward.

Immediate rollback bookmark: `000000de-00000000-00005106-3bf100b1ff5aaa1112770457ed483a6a`.
Both workers, both production admin records and Source users/subscription hashes remained unchanged.
Preview remains6d621d4b at100%; production remainsca4dfaf3 at100%.
No application runtime deployment, Source write, migration application or external delivery occurred.

Private receipts remain under `~/.local/state/localley/`:

- `d1-ledger-preflight-20261016.json`
- `d1-ledger-backup-rehearsal2-20261016.json`
- `d1-ledger-live-capture-20261016.json`
- `d1-ledger-apply-20261016.json`
- `d1-ledger-wrangler-before-20261016.json`
- `d1-ledger-wrangler-after-20261016.json`

This closes candidate ledger reconciliation. Full production data cutover remains gated.
