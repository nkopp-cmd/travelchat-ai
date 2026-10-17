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
Among application entrypoints, 63 reach candidate modules and 44 do not.
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

The current physical notification audit is complete: the three legacy Source tables are absent.
Deleted history, external producers and historical consent remain unknown. Do not enable dormant producers.
Normal notification storage now uses Auth D1; this does not migrate the remaining application data.

## Stable-host scope correction

The first stable checkout run included ignored legacy Worker files. Its report is superseded.
`git ls-files -z` now defines the source scope. A real Git fixture proves untracked legacy access is excluded.
Fourteen focused tests pass. Source files on other branches are preserved and are not current-main findings.

PR393 merged as `2f5c6dedd2debb348130b7a06797f65a4665ca98`; required CI38171565684 passed.
The inventory is an offline host tool. It requires no Worker deployment or database mutation.
The candidate export preparation in PR394 merged as `bab461bf2ef2b5c3da67ec0bb4f462e79053b431`.
Its required CI38170933866 and seventeen focused tests passed. Hosted acceptance remains incomplete.


## Current production inventory — 2026-10-17

This supersedes the October11 static baseline and October16 disposition counts.
Live Worker3132337f-a1bc-4ff5-a780-bdbe7a65e557 serves100percent, deployment6a17bf4b-e2c1-435b-999e-25614fadbaec.
Its accepted source is a38fe6495a20711086dce6a56a96545aa057c639, PR445.
The audit scans that exact Git commit, rather than assuming current main is the deployed source.
All current application/library/Worker source bytes match it; later changes concern host checks and documentation.
Previewe08db2c5/7cdc7953 and the application rollback83366b0c remain unchanged.

The exact-source scan covers582modules,463access sites,108possible application entrypoints and21operational entrypoints.
It identifies43literal table names,17RPC names and one storage bucket.
Candidate imports at66possible entrypoints prove neither routing nor completed migration.
The signed-in Source client still signs a short-lived Source RLS JWT from the Better Auth ID.
It does not call Supabase Auth or migrate application data merely because login uses D1.

Read-only SQL uses a bypass-RLS actor and transaction_read_only=on.
Two full table count/hash snapshots match across this audit:48application tables and6181rows.
The catalog contains35custom functions and8public triggers; no function definition showed the audited network-call markers.
Function/table name mentions remain conservative text evidence, not a complete dynamic SQL or external-writer proof.
No Source mutation, RPC execution, cron invocation, paid lookup, email or Worker release occurred.

### Disposition rules

- **Serving** means retain and port within the cutover scope. It does not claim current requests to every table.
- **Archived** requires proved archive-only treatment. None qualifies for that exclusion in this audit.
- **Obsolete** identifies a retired application contract. It does not authorize dropping the table or its raw snapshot.
- **Excluded** applies to provider implementation relations, not to the product data or media they hold.

There are47retained serving tables and one obsolete table. All48remain in the raw snapshot/schema retention scope.
Six tables without recognized current literal callers stay serving by conservative default: story_image_jobs and the five trip-model tables.
Their zero rows do not prove no external or indirect writers. No table receives archive-only or deletion approval here.
The old early-adopter table is obsolete because the program is explicitly retired and current accessors return disabled/false.
Its zero rows and schema still remain preserved.

| Application table | Rows | Disposition | Current evidence and retention reason |
| --- | ---: | --- | --- |
| `affiliate_clicks` | 17 | serving | Application SDK/RPC scope; `app/api/admin/analytics/route.ts`, `app/api/affiliates/track/route.ts`. |
| `affiliate_earnings` | 0 | serving | Application SDK/RPC scope; `app/api/admin/analytics/route.ts`. |
| `apify_spot_candidates` | 86 | serving | Application SDK/RPC scope; `app/api/admin/spots/apify-discovery/route.ts`, `lib/apify-spot-discovery.ts`. |
| `apify_spot_discovery_runs` | 11 | serving | Application SDK/RPC scope; `lib/apify-spot-discovery.ts`. |
| `challenges` | 10 | serving | Application SDK/RPC scope; `app/api/challenges/route.ts`. |
| `content_engagement` | 0 | serving | Application SDK/RPC scope; `lib/engagement-tracking.ts`. |
| `contribution_token_ledger` | 4 | serving | Application SDK/RPC scope; `app/api/spots/social-submissions/route.ts`. |
| `conversations` | 115 | serving | Application SDK/RPC scope; `app/api/conversations/messages/route.ts`, `app/api/conversations/route.ts`. |
| `early_adopters` | 0 | obsolete | Retired program; lib/early-adopters.ts disables enrollment. Preserve raw schema/history. |
| `follows` | 0 | serving | Application SDK/RPC scope; `app/api/challenges/route.ts`, `app/api/friends/route.ts`. |
| `geo_aliases` | 276 | serving | Operational seed/import scope: `scripts/seed-geography.ts`. |
| `geo_countries` | 12 | serving | Operational seed/import scope: `scripts/seed-geography.ts`. |
| `geo_destinations` | 30 | serving | Application SDK/RPC scope; `lib/geography/city-shadow.ts`. |
| `geo_local_area_vibe_scores` | 857 | serving | Operational seed/import scope: `scripts/seed-geography.ts`. |
| `geo_local_areas` | 212 | serving | Operational seed/import scope: `scripts/seed-geography.ts`. |
| `geo_vibe_taxonomy` | 15 | serving | Operational seed/import scope: `scripts/seed-geography.ts`. |
| `guide_earnings` | 0 | serving | Application SDK/RPC scope; `app/api/admin/payouts/approve/route.ts`, `app/api/admin/payouts/calculate/route.ts`. |
| `guide_profiles` | 0 | serving | Application SDK/RPC scope; `app/api/admin/guides/route.ts`, `app/api/connect/dashboard/route.ts`. |
| `itineraries` | 85 | serving | Application SDK/RPC scope; `app/api/challenges/route.ts`, `app/api/cron/cleanup-stories/route.ts`. |
| `messages` | 173 | serving | Application SDK/RPC scope; `app/api/conversations/messages/route.ts`. |
| `review_helpful_votes` | 0 | serving | Application SDK/RPC scope; `app/api/spots/[id]/reviews/[reviewId]/helpful/route.ts`, `app/api/spots/[id]/reviews/route.ts`. |
| `saved_itineraries` | 0 | serving | Application SDK/RPC scope; `app/api/itineraries/[id]/like/route.ts`, `app/api/user/saved-itineraries/route.ts`. |
| `saved_spots` | 0 | serving | Application SDK/RPC scope; `app/api/challenges/route.ts`, `app/api/spots/save/route.ts`. |
| `social_spot_submission_aliases` | 6 | serving | Application SDK/RPC scope; `app/api/spots/social-submissions/route.ts`. |
| `social_spot_submission_candidates` | 7 | serving | Application SDK/RPC scope; `lib/spots/queries.ts`. |
| `social_spot_submission_media` | 10 | serving | Retained SQL/RPC dependency: `claim_social_spot_media_finalization_v1`, `claim_social_spot_media_jobs_v1`. |
| `social_spot_submission_media_jobs` | 11 | serving | Application SDK/RPC scope; `lib/social-spot-media-jobs.ts`. |
| `social_spot_submissions` | 4 | serving | Application SDK/RPC scope; `app/api/admin/spots/social-submissions/backfill/route.ts`, `app/api/cron/process-social-submissions/route.ts`. |
| `spot_contributors` | 4 | serving | Application SDK/RPC scope; `app/api/spots/social-submissions/route.ts`. |
| `spot_reviews` | 0 | serving | Application SDK/RPC scope; `app/api/spots/[id]/reviews/[reviewId]/helpful/route.ts`, `app/api/spots/[id]/reviews/[reviewId]/route.ts`. |
| `spots` | 3295 | serving | Application SDK/RPC scope; `app/api/admin/seed-spots/route.ts`, `app/api/admin/spots/apify-discovery/route.ts`. |
| `story_image_jobs` | 0 | serving | Retained SQL/RPC dependency: `reconcile_story_image_job`, `reserve_story_image_job`. |
| `subscriptions` | 5 | serving | Application SDK/RPC scope; `app/api/admin/analytics/route.ts`, `app/api/subscription/checkout/route.ts`. |
| `transfer_edges` | 24 | serving | Operational seed/import scope: `scripts/seed-transport-edges.ts`. |
| `trip_activities` | 0 | serving | No recognized literal caller; retain by default. Empty is not proof of retirement. |
| `trip_days` | 0 | serving | No recognized literal caller; retain by default. Empty is not proof of retirement. |
| `trip_stops` | 0 | serving | No recognized literal caller; retain by default. Empty is not proof of retirement. |
| `trip_transfer_legs` | 0 | serving | No recognized literal caller; retain by default. Empty is not proof of retirement. |
| `trips` | 0 | serving | Retained SQL/RPC dependency: `update_trips_updated_at`. |
| `usage_tracking` | 33 | serving | Application SDK/RPC scope; `app/api/admin/analytics/route.ts`, `app/api/subscription/status/route.ts`. |
| `user_challenges` | 6 | serving | Application SDK/RPC scope; `app/api/challenges/route.ts`, `app/profile/page.tsx`. |
| `user_progress` | 0 | serving | Application SDK/RPC scope; `app/api/challenges/route.ts`, `app/api/gamification/award/route.ts`. |
| `users` | 8 | serving | Application SDK/RPC scope; `app/api/admin/guides/route.ts`, `app/api/challenges/route.ts`. |
| `weekly_city_spot_rankings` | 4 | serving | Application SDK/RPC scope; `lib/spots/weekly-trending.ts`, `lib/weekly-social-trends.ts`. |
| `weekly_social_content` | 587 | serving | Application SDK/RPC scope; `lib/weekly-social-trends.ts`. |
| `weekly_social_spot_leads` | 52 | serving | Application SDK/RPC scope; `lib/apify-spot-discovery.ts`, `lib/weekly-social-trends.ts`. |
| `weekly_social_trend_city_builds` | 180 | serving | Application SDK/RPC scope; `lib/weekly-social-trends.ts`. |
| `weekly_social_trend_runs` | 42 | serving | Application SDK/RPC scope; `lib/weekly-social-trends.ts`. |

### Serving scope is not imported serving coverage

The base core importer projects seven Source tables into15D1 tables. It retains41other tables in the private snapshot.
Its ARCHIVED_ONLY constant describes that staging behavior, not approved product archive-only treatment.
The47serving dispositions above describe work that must be preserved or ported; they do not claim47live D1 repositories.
Later feature adapters have their own candidate acceptance records and cannot be counted from imports alone.

### Platform relations and media

The three public PostGIS relations are excluded from product-row import: geography_columns, geometry_columns and spatial_ref_sys.
PostGIS queries and spatial semantics still need replacement proof; excluding extension internals does not finish maps.
Storage buckets/objects remain serving dependencies: private generated-images has175objects.
Preserve object bytes, ownership, access policy, URL references and cleanup behavior before retiring Source storage.
A bucket/object count is not R2 content parity. Multipart and other provider metadata are not blindly copied into D1.

The non-public catalog contains the following provider relations.
Except storage.buckets/objects, they are excluded from direct application-table serving imports.
This is a platform-replacement boundary, not permission to delete histories, provider metadata or credentials.
Retain Source backups and the separate Auth/D1 identity proofs; unknown histories stay unknown.

| Schema | Relations | Treatment |
| --- | --- | --- |
| auth | `audit_log_entries`, `custom_oauth_providers`, `flow_state`, `identities`, `instances`, `mfa_amr_claims`, `mfa_challenges`, `mfa_factors`, `mfa_recovery_code_sets`, `mfa_recovery_codes`, `oauth_authorizations`, `oauth_client_states`, `oauth_clients`, `oauth_consents`, `one_time_tokens`, `refresh_tokens`, `saml_providers`, `saml_relay_states`, `schema_migrations`, `scim_tokens`, `scim_users`, `sessions`, `sso_domains`, `sso_providers`, `users`, `webauthn_challenges`, `webauthn_credentials` | Excluded provider implementation; retain histories/backups, no deletion approval |
| extensions | `pg_stat_statements`, `pg_stat_statements_info` | Excluded provider implementation; retain histories/backups, no deletion approval |
| realtime | `messages`, `schema_migrations`, `subscription` | Excluded provider implementation; retain histories/backups, no deletion approval |
| storage | `buckets`, `buckets_analytics`, `buckets_vectors`, `migrations`, `objects`, `s3_multipart_uploads`, `s3_multipart_uploads_parts`, `vector_indexes` | buckets/objects serving; remaining provider metadata excluded from direct app imports |
| supabase_migrations | `schema_migrations` | Excluded provider implementation; retain histories/backups, no deletion approval |
| vault | `decrypted_secrets`, `secrets` | Excluded provider implementation; retain histories/backups, no deletion approval |

### Repository and write-path map

| Family | Current Source or external effects | Boundary required for exit |
| --- | --- | --- |
| Auth/profile | lib/auth/user-sync.ts upserts users and free subscriptions on creation/repair, then updates email. Duplicate handling preserves IDs and paid tiers. Generation shared.ts separately selects/inserts users. | Move both hook and generation repair paths; preserve ID/entitlement behavior and logged non-blocking hook failures. |
| Trips/discovery | Generate/corridor/revise/save/duplicate/share/like, saved spots, discovery and profile/dashboard readers use the Source tables above. | Port each normal repository and its write callers; candidate imports alone do not switch normal www. |
| Chat | Conversation/message routes persist Source history; provider chat and model calls are separate effects. | Preserve ownership, linked itineraries, bounded writes and usage before switching storage. |
| Quotas | usage_tracking uses check_and_increment_usage_weighted, including unit checks at amount1 after PR432. increment_usage remains for successful-usage recording helpers. | Port every caller and both SQL semantics; retain immutable historical baselines, periods, tiers and concurrency limits. |
| Subscription billing | Checkout/customer ownership and webhook paths read/write users/subscriptions and usage. Stripe sessions/customers and replay/order handling are external effects. Subscription webhook still imports lib/resend and sends event emails. | Port normal state/readers and all webhook/customer/email side effects. Do not mistake migrated auth/story mail for subscription-email migration. |
| Connect/admin/affiliates | Guide profiles/earnings, content engagement RPCs and admin payout routes remain Source-backed; payout execution can create Stripe transfers. Affiliate POST/pixel handlers write clicks; admin analytics reads earnings/clicks. | Preserve admin IDs, replay/order rules, private analytics, idempotent transfer bookkeeping and authorized write paths. |
| Story/media | generated-images list/download/upload/remove/public/signed URL sites exist in story background/generate/render/save/persist, activity-images, debug pipeline and cleanup-stories. Stories and itineraries also persist metadata. | Preserve byte detection, WebP refusal, prefetch, lazy response consumption, ownership, cache, R2 objects and quota charges. |
| Transactional mail | Auth, itinerary-copy and story-ready use Cloudflare binding or isolated preview outbox. Subscription webhook retains Resend. | Verify every caller and suppression/outbox behavior; no external message was sent by this audit. |
| Community/research | Challenges, progress, reviews, follows, social submission/media jobs, contribution tokens and weekly trend/ranking paths use tables/RPCs above. | Preserve queued work, retries, claims, publication boundaries and external-provider budgets. Dormant notification producers remain inactive. |
| Normal notifications | AUTH_NOTIFICATION_STORAGE=active routes normal inbox/preferences/device storage to Auth D1. Three legacy Source notification tables are physically absent. Static helper references remain. | Preserve active store and compatible rollback; do not enable dormant producers or invent deleted/external history. |

The machine report preserves every access site, operation and possible importing entrypoint with file hashes and lines.
The family map does not claim that every possible route has executed or every export is called.

### Scheduled and operational paths

| Schedule/owner | Actual configured path | Effects to preserve |
| --- | --- | --- |
| Cloudflare daily03:00UTC | cleanup-stories, plus discover-spots-with-apify?mode=collect through self binding | Source media deletion and collection/result persistence; collect cannot start a new paid actor. |
| Cloudflare daily04:00UTC | process-social-submissions | Source jobs/claims/retries/media and finalization; external analysis/provider effects remain separate. |
| Cloudflare daily05:00UTC | refresh-weekly-social-trends | Source social content/leads/trends and ranking RPC writes; provider budgets/publication boundaries remain. |
| Cloudflare monthly first02:23UTC | discover-spots-with-apify | May start the separately gated discovery provider flow and persist run/candidate records. Audit did not run it. |
| Host every10minutes | CyberLink shared/scripts/localley-monitor.sh | Read-only public probes and CF analytics; host state/log files and optional state-change notifications. No application repair or Source write. |
| Host daily07:15UTC plus jitter | localley-user-health.timer/service, stable main checker | Read-only page/catalog/logging/Source billing checks; private report. Timer enabled/active. |
| Retired host import | localley-native-sync.timer | Disabled/inactive; obsolete worktree path does not constitute an active live import. Keep retired. |
| Manual operational scripts |21possible Source entrypoints, including geography/transport seeds and guarded imports/reconciliation | Presence does not prove scheduling. Geography writes require explicit branch-only apply flags. |

Production has exactly four configured Worker schedules; preview has zero. Source cron.job is absent.
Earlier bounded telemetry proved three daily schedules and four route successes; this audit adds current configuration, not fresh execution.
Monthly execution, remote hosts, third-party schedulers and external writers remain unproved. They are not assumed absent.

### Installed RPC and trigger side effects

Every one of the17literal RPC names has an installed custom function in this read-only catalog.
The table mentions below are conservative SQL text matches; they can include reads and indirect/trigger effects.
They do not identify all writes or prove which functions executed.

| RPC | Referenced table names | Caller evidence |
| --- | --- | --- |
| `award_social_submission_tokens_v1` | `contribution_token_ledger`, `social_spot_submissions`, `spot_contributors` | `app/api/spots/social-submissions/route.ts` |
| `calculate_monthly_earnings` | `content_engagement`, `guide_earnings`, `guide_profiles` | `app/api/admin/payouts/calculate/route.ts` |
| `check_and_increment_usage_weighted` | `usage_tracking` | `lib/usage-tracking.ts` |
| `claim_social_spot_media_coverage_v1` | `social_spot_submissions` | `lib/social-spot-media-jobs.ts` |
| `claim_social_spot_media_finalization_v2` | `social_spot_submissions` | `lib/social-spot-media-jobs.ts` |
| `claim_social_spot_media_jobs_v1` | `social_spot_submission_media`, `social_spot_submission_media_jobs`, `social_spot_submissions` | `lib/social-spot-media-jobs.ts` |
| `complete_social_spot_media_job_v1` | `social_spot_submission_media`, `social_spot_submission_media_jobs`, `social_spot_submissions` | `lib/social-spot-media-jobs.ts` |
| `defer_social_spot_media_coverage_v1` | `social_spot_submission_media`, `social_spot_submission_media_jobs`, `social_spot_submissions` | `lib/social-spot-media-jobs.ts` |
| `fail_social_spot_media_job_v1` | `social_spot_submission_media`, `social_spot_submission_media_jobs`, `social_spot_submissions` | `lib/social-spot-media-jobs.ts` |
| `increment_usage` | `usage_tracking` | `lib/usage-tracking.ts` |
| `list_ready_social_spot_media_work_v1` | `social_spot_submission_media`, `social_spot_submission_media_jobs`, `social_spot_submissions` | `lib/social-spot-media-jobs.ts` |
| `replace_weekly_city_spot_rankings` | `weekly_city_spot_rankings` | `lib/weekly-social-trends.ts` |
| `schedule_legacy_social_spot_media_backfill_v1` | `social_spot_submission_media`, `social_spot_submission_media_jobs`, `social_spot_submissions` | `lib/social-spot-media-jobs.ts` |
| `settle_social_spot_media_finalization_v2` | `social_spot_submissions` | `lib/social-spot-media-jobs.ts` |
| `sync_social_spot_media_v1` | `social_spot_submission_media`, `social_spot_submission_media_jobs`, `social_spot_submissions` | `lib/social-spot-media-jobs.ts` |
| `sync_social_submission_candidates_v1` | `social_spot_submission_candidates` | `app/api/spots/social-submissions/route.ts` |
| `track_content_engagement` | `content_engagement` | `lib/engagement-tracking.ts` |

All35custom definitions, overload arguments and definition hashes remain in the private catalog receipt.
The eight installed triggers are listed explicitly. These effects must survive any repository switch.

| Source table | Trigger | Function | Enabled |
| --- | --- | --- | --- |
| `guide_earnings` | `guide_earnings_updated_at` | `update_guide_updated_at` | `O` |
| `guide_profiles` | `guide_profiles_updated_at` | `update_guide_updated_at` | `O` |
| `messages` | `update_conversation_on_message` | `update_conversation_timestamp` | `O` |
| `social_spot_submissions` | `reset_social_spot_media_finalization_attempts` | `reset_social_spot_media_finalization_attempts_v1` | `O` |
| `social_spot_submissions` | `social_spot_submissions_updated_at` | `update_social_submission_updated_at` | `O` |
| `spot_contributors` | `spot_contributors_updated_at` | `update_social_submission_updated_at` | `O` |
| `subscriptions` | `subscriptions_updated_at` | `update_updated_at` | `O` |
| `usage_tracking` | `usage_tracking_updated_at` | `update_updated_at` | `O` |

### Static ambiguity review

The31unresolved-receiver markers belong to the following checked code.
- `app/api/itineraries/[id]/story/route.tsx`: 2sites. Typed/passed Source client or client-bearing argument; retained as Source scope.
- `app/api/itineraries/generate/shared.ts`: 2sites. Typed/passed Source client or client-bearing argument; retained as Source scope.
- `lib/admin/spot-quality.ts`: 1sites. Typed/passed Source client or client-bearing argument; retained as Source scope.
- `lib/social-spot-media-jobs.ts`: 17sites. Typed/passed Source client or client-bearing argument; retained as Source scope.
- `scripts/seed-geography.ts`: 9sites. Typed/passed Source client or client-bearing argument; retained as Source scope.

The core-import dynamic import bundles the two named public-quality/city-rule exports into an in-memory data module.
The two unresolved imports are generated .open-next/worker.js and the operational auth rehearsal test helper.
The generated Worker boundary is tied to the prior accepted build/version proof; the scanner does not inspect its runtime internals.
No recognized dynamic table resource or active Supabase Auth/functions/realtime SDK access was found.
Unrecognized reflection, future computed SQL and external writers remain limits; this is not a proof of their absence.

### Evidence and remaining gates

Private source-production-inventory-20261017.json retains fresh catalog, full counts/hashes, functions/triggers/FKs, schemas, bucket counts and Worker identities.
Private runtime-inventory-production-source-20261017.json retains every exact-source access/entrypoint and sourceDigest.
Private source-inventory-host-jobs-20261017.json records current units and the additional ten-minute monitor.
The first audit stopped before report creation because the logging endpoint lacks bindings.
The corrected second audit uses immutable version resources.bindings:56definitions, active Auth notification storage.

This completes the bounded current repository/disposition inventory. It does not complete candidate ports or prove current-data/media value parity.
Full rehearsal, post-switch write/media rollback, signed-in canary, approved freeze/switch and seven-day retention still apply.
No excluded or obsolete classification authorizes Source deletion or subscription cancellation.

Exact-source digest: `612eb06589ae102584b28db6b8eef75680210084e52fea263b8dda644693fe84`. Audit UTC: `2026-10-17T11:37:09.875Z`.
