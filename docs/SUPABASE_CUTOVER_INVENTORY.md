# Supabase cutover inventory

## Purpose

The website and authentication run on Cloudflare. Application data still uses Supabase.
This tool maps checked-in access sites and possible callers before the remaining migration.
It does not change a database, serve D1 traffic, or certify readiness.

Run from stable main after installing the pinned lockfile:

```sh
node scripts/d1-migration/runtime-inventory.mjs --out /absolute/private/path/new-report.json
node --test scripts/d1-migration/runtime-inventory.test.mjs
```

The output uses exclusive creation and mode 0600. Existing evidence is never overwritten.
The scanner reads only source paths in the Git index. Ignored legacy copies are excluded. It does not read `.env`, database exports or credentials.
No network call or paid model is needed.

## Evidence fields

- `modules`: exact source paths, SHA-256 hashes, static imports, access sites and source-client evidence.
- `resources`: table, RPC and storage bucket names with file/line references and operation names.
- `entrypoints`: route/page/layout/Worker and operational-script callers through the local import graph.
- `candidateImports`: possible reachability of `lib/app-data` modules. This is **not candidate acceptance**.
- `unresolvedImports`, `dynamicImports`, `unresolvedReceivers` and `dynamicResources`: manual review remains necessary.
- `sourceDigest`: a reproducible hash of every scanned source path and file hash.
- `cutoverReady`: always false. No static inventory can authorize the production switch.

The operational-script role does not mean a script currently runs or has a scheduler.
The generated OpenNext Worker import stays unresolved until its matching release artifact is inspected.
Computed member names, reflection and untracked aliases can need more manual review.
Installed SQL, external writers, physical tables, grants, triggers and media-object parity require separate evidence.

## 2026-10-11 baseline

The corrected Git-index scan covers 552 source files, 460 possible access sites and 111 modules with direct access.
It finds 43 table names across application source and operational scripts, 18 RPC names and one storage bucket.
There are 107 application entrypoints with possible source access and 21 operational scripts.
Among application entrypoints, 62 reach candidate modules and 45 do not.
Neither count measures completed migration: imported candidates can cover only part of a handler.
There are 31 unresolved receivers, zero dynamic resources and two unresolved local imports (including generated Worker code).
These are source findings, not current physical table counts or confirmed execution.

### Remaining feature groups

| Group | Examples to finish or prove | Release condition |
| --- | --- | --- |
| Account/profile hooks | `lib/auth/user-sync.ts`, signup/profile repair, default subscription creation | Preserve exact auth IDs, existing profiles and paid entitlements |
| Trips and discovery UI | generation/revision/duplicate/export, dashboard, explore, spot list/detail, edit pages | Signed-in parity, owner isolation, source-free candidate actions |
| Story and media | alternate image/save routes, activity/spot uploads, complete archive and cleanup | Correct bytes, R2 serving, ownership, complete object parity |
| Chat, quotas and billing | paid chat, immutable history/current usage, Connect webhook, affiliate tracking | Atomic limits, replay/order guards, real isolated billing proof |
| Guide/admin/community | remaining analytics/quality/import tools, friends, challenges, gamification | Admin allowlist, authorized writes, matching existing behavior |
| Research and scheduled work | Apify collection, social media jobs/submissions, trend refresh and rankings | Source-free storage, bounded retries and audited actual schedulers |
| Historical data and notifications | physical SQL/history/consent, archived tables and exact owner reconciliation | Explain every table/owner; unknown is never treated as zero |

Existing candidate adapters and acceptance records remain valid within their documented scope.
Use the report to choose bounded missing handlers, then verify each on the exact isolated preview.
Normal `www` must remain on its current source until all cutover gates pass.

## Final gates

1. Rehearse a fresh complete export with zero value/count/FK/identity mismatches.
2. Execute rollback, including writes made after the switch and media ownership.
3. Pass the signed-in 1% version-override canary across the required feature groups.
4. Run the approved freeze, final import and production switch; record release/rollback IDs.
5. Retain Supabase intact for at least seven problem-free days. Retirement needs separate approval.

The notification SQL/history report remains requested in the shared NEEDS list.
This inventory provides no substitute for that report and does not require enabling dormant notifications.

## Stable-host scope correction

The first stable checkout run included ignored legacy Worker files. Its report is superseded.
`git ls-files -z` now defines the source scope. A real Git fixture proves untracked legacy access is excluded.
Fourteen focused tests pass. Source files on other branches are preserved and are not current-main findings.

PR393 merged as `2f5c6dedd2debb348130b7a06797f65a4665ca98`; required CI38171565684 passed.
The inventory is an offline host tool. It requires no Worker deployment or database mutation.
The candidate export preparation in PR394 merged as `bab461bf2ef2b5c3da67ec0bb4f462e79053b431`.
Its required CI38170933866 and seventeen focused tests passed. Hosted acceptance remains incomplete.
