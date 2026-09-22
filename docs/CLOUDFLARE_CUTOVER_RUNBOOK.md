# Cloudflare data import and cutover runbook

Status 2026-09-22: import tooling is built and rehearsed locally on the real private snapshot. Nothing in this runbook has run against production.
Every step marked **APPROVAL** needs a separate, explicit approval from Nils (CLAUDE.md: production data, production secrets, DNS, retirement, spend).

## 1. What the import moves

Tool: `cloudflare/auth-proof/scripts/legacy-import.mjs` (SQL build + node:sqlite rehearsal) and `scripts/legacy-import-d1.mjs` (workerd D1 rehearsal through the built Worker).
Schema: `migrations/0013_legacy_import.sql` (additive tables only). Tests: `test/legacy-import.test.mjs` (synthetic data, in CI).

| Source (Supabase) | D1 target | Rule |
| --- | --- | --- |
| Clerk owner strings (7: 5 profiles, 2 billing-only) | `owners` (`source='legacy-fixture'`, the claimable legacy category), `legacy_owners` | Owner string kept as owner ID. No email linking. |
| `users` (5) | `profiles` (same UUIDs), `legacy_profile_stats` | xp/level/title kept for later gamification port |
| — | `owner_limits` | Default 10 saves. No paid tier is inferred. |
| `spots` (3,295) | `spots`, `legacy_spot_source` (raw row), `spot_listing_places` | Live `public-quality` rule sets `visible`. Google proxy photos are not copied; listing photos resolve at request time. |
| `itineraries` (85) | `itineraries`, `legacy_itinerary_media` | Uses the R2 story projection: `r2://localley-legacy-media/...` keys, largest row 11.8 KB |
| `conversations` (115), `messages` (173) | `conversations`, `messages` | Exact text, line breaks kept |
| `subscriptions` (3), `usage_tracking` (31) | `legacy_subscriptions`, `legacy_usage` | Records only. They grant nothing until the billing port reads Stripe. |
| 41 other tables (1,795 rows) | not imported | Stay in the verified R2 archive until their feature is ported. The tool refuses any unclassified table. |

Safety properties (tested): manifest page hashes are checked before use; projection must match itinerary identity fields; every statement is one line and under D1's 100 KB limit;
no deep SQL expressions (D1 rejects expression depth > 100 — found and fixed during rehearsal); `INSERT OR IGNORE` makes a repeat run change zero rows.

## 2. Rehearsal evidence — 2026-09-22 (local only, real snapshot)

Private files: `cloudflare/auth-proof/.preview-private/import-rehearsal-20260922/` (`import.sql`, `report.json`, `report-d1.json`). Never commit them.

- Source: snapshot `source-snapshot-20260921` (manifest verified), projection `story-projection-20260921`.
- Batch `44614e23dac96506680bc316970e44fe407721d0e99af49ae479abc28d43b9d9`; SQL SHA-256 `dd77bf348c2d431632a60e0e55ae605634ed668700e2cb172e292bcf5db00fbd`; 10,321 statements, longest 11,029 bytes.
- node:sqlite with all 13 migrations: every expected row matches column by column (0 mismatches), repeat run 0 changes, 0 FK violations, integrity `ok`.
- workerd D1 with all 13 migrations: 10,321 rows inserted, repeat 0 changes, 0 FK violations. The built Worker served exactly the 3,024 visible spots over 31 catalog pages. An imported itinerary without a session returned 401.

Findings to resolve before the real import:

1. Visibility parity: the rule marks 3,024 of 3,295 spots public (Seoul 428). The 2026-09-21 audit counted 390 public Seoul spots on the live site. Compare with the live list query before cutover.
2. 316 visible spots get no `city` from `inferCityFromAddress`. The native catalog has no city filter yet, but a city view will need it.
3. `owners.source` cannot gain a `'legacy'` value by migration: rebuilding `owners` would fire `ON DELETE CASCADE` on `email_preferences`. Imported owners use the existing claimable `'legacy-fixture'` category.
4. Imported owners need a real legacy-claim issuer (proof of the old Clerk account) before they can reach their data. The claim redemption exists; the issuer does not.

## 3. Production import — steps (none done)

```sh
cd cloudflare/auth-proof
# a. APPROVAL (spend/new resource): create the production database, EU jurisdiction.
node node_modules/wrangler/bin/wrangler.js d1 create localley-production --jurisdiction eu
# b. APPROVAL (production data): fresh export after the write freeze (section 4), then verify.
node ../../scripts/cloudflare-source-snapshot.mjs --out .preview-private/source-snapshot-FINAL
node ../../scripts/cloudflare-source-snapshot.mjs --verify .preview-private/source-snapshot-FINAL
node ../../scripts/cloudflare-story-media.mjs .preview-private/source-snapshot-FINAL .preview-private/story-media-FINAL
node ../../scripts/cloudflare-media-upload.mjs --apply .preview-private/story-media-FINAL
# c. Build and rehearse locally. Both must report 0 mismatches, 0 repeat changes, 0 FK violations.
node scripts/legacy-import.mjs --snapshot .preview-private/source-snapshot-FINAL --projection PROJECTION_DIR --out FINAL/import.sql --report FINAL/report.json
npm run build && node scripts/legacy-import-d1.mjs --snapshot .preview-private/source-snapshot-FINAL --projection PROJECTION_DIR --report FINAL/report-d1.json
# d. APPROVAL (production data): schema, then data, on the production database only.
node node_modules/wrangler/bin/wrangler.js d1 migrations apply localley-production --remote --config wrangler.production.jsonc
node node_modules/wrangler/bin/wrangler.js d1 execute localley-production --remote --config wrangler.production.jsonc --file FINAL/import.sql
# e. Verify remote counts equal report.json counts; run the import file a second time and confirm 0 rows written.
node node_modules/wrangler/bin/wrangler.js d1 export localley-production --remote --config wrangler.production.jsonc --output FINAL/after-import.sql
```

`wrangler.production.jsonc` does not exist yet. It needs a production runtime mode in the Worker (see section 5).

## 4. Write freeze and final delta

DNS for `localley.io` is on Cloudflare (Free plan), but apex `A 216.198.79.1` and `www CNAME …vercel-dns-017.com` are **DNS-only**. Cloudflare cannot block writes on them today.
No new Vercel deployment is allowed, so a maintenance flag on Vercel is not an option.

- Preferred: keep the delta window small and reconcile. Live data is small (5 users, 85 itineraries). After the DNS switch, wait at least the record TTL.
  Then take a second snapshot. The importer adds new rows. Changed existing rows are reported by comparing the two snapshots and are fixed by hand.
- Hard freeze (optional, **APPROVAL**): proxy apex/www through Cloudflare and add a WAF rule that blocks non-GET `/api/*`. The current API token cannot read or edit WAF rules.

## 5. Cutover gates still open

The runbook cannot start until these pass (details in `CLOUDFLARE_GO_LIVE.md`):

- A production runtime mode: the Worker accepts only `preview` (Access + allowlist) or `local`. Public mode needs open sign-up, Turnstile, and public email delivery.
- Stories, billing (Stripe webhooks), admin, conversation-history UI, and the other missing journeys.
- A legacy-claim issuer for the 5 historical accounts.
- Visibility parity (finding 1).

## 6. Switch and rollback — APPROVAL for every step

Record the current records first: apex `A 216.198.79.1` (id `18a24961686715e5a1c7cd27df512c8d`), `www CNAME 8597cfc582a3e8e6.vercel-dns-017.com` (id `4ee834b5f230582391427ce4fb98a089`). Keep all Clerk CNAMEs until Clerk is retired.

1. Deploy the production Worker with a custom domain on a new host (for example `next.localley.io`). Run the full acceptance journey there.
2. Lower the apex/www TTL. Replace both records with Worker custom domains `localley.io` and `www.localley.io`.
3. Re-point Stripe webhook endpoints to the Worker only after the Worker verifies signatures. Keep the old endpoints disabled, not deleted.
4. Verify health, catalog, sign-in, a legacy claim, a trip read and a Stripe test event on the public host.

Rollback to Vercel (production stays on `dpl_FA3tzDj3zDmxLGEFEjvoXv7d6rgg`, main `e96b003`):

1. Remove the Worker custom domains for apex/www. Recreate `A localley.io 216.198.79.1` and `CNAME www 8597cfc582a3e8e6.vercel-dns-017.com`, DNS-only.
2. Re-enable the old Stripe webhook endpoints.
3. Export D1 rows written after the switch (`created_at`/`importedAt` after the switch time) and replay them to Supabase by hand. Supabase stays the source of truth until retirement.
4. Retire Vercel only after the Cloudflare site has run without rollback for an agreed period (**APPROVAL**).
