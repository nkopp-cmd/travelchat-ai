# Native Email Preferences

## Delivered Preview - 2026-09-12

- Repository: `nkopp-cmd/travelchat-ai`; release branch: `cloudflare/full-migration`.
- Implementation: `ee13667191aa23f00b90653b99bca115609f5d61`, [PR129](https://github.com/nkopp-cmd/travelchat-ai/pull/129), merged as `61a6fd006499ef158df17f3b087913092158e9e3`.
- Pre-installation correction: `159d4a22da2c8b73d78008e691921a55abe7e21e`, [PR130](https://github.com/nkopp-cmd/travelchat-ai/pull/130).
- Deployed merge: `b2cabd6c75a7e1b055c7537a3553ab2a4c95fc26`; its tree matches the checked correction commit.
- GitHub checks passed: PR129 run `34697431704`, PR130 run `34698222042`, and final merge run `34698529510`.
- Worker: `localley-discovery-preview`, at `https://preview.localley.io`, protected by unchanged Cloudflare Access policies.
- Active version: `5bf95956-8bba-4158-9c8a-c2e8a81f6b51`, tagged with the deployed merge, at 100%.
- Deployment ID: `f521bb8d-553b-4c31-9429-86bb08fe9b04`; verified at `2026-09-12T14:17:41.437Z`.
- Persistent data: EU D1 `localley-migration-preview`, ID `e943548b-01ae-485d-9219-e2a46cb0da8e`.
- Migration `0007_email_preferences.sql` was applied only to that preview. The table had zero rows after installation.
- Backup: `cloudflare/auth-proof/.preview-private/preferences-release-QWzkYC/before.sql`, mode `0600`.
- Backup SHA-256: `6e6e062185607a86fecf52b312c4fc41783eadeb0623acfac8961fd043a3b825`; restoration and migration rehearsal passed.
- Rollback version: `7e9c2a7c-2c5b-406b-8160-9ae705d7271c`. Retain the additive table and all newer data.

The first preflight remains separately retained in `.preview-private/preferences-release-MK5uK3/`.
No earlier receipts or operator counters were replaced. No ingestion command or timer configuration was changed.
The existing user-manager interface confirmed `localley-native-sync.timer` remains active.
All eight public rows and the checked account, identity, save, itinerary, and mail rows matched their pre-installation snapshots.
Foreign-key checks passed. Worker secret names and Access policies stayed unchanged.

Live JavaScript SHA-256: `7ab9f520b1c95cffb233fd151853465b3419c2f1eb393162bf4f17954ebd5b73`.
Live CSS SHA-256: `2e6ee6fee62a96d3829d7e4defc696a9ebf261b6384c978f9b1e102c0e654de8`.
All seven reviewed JPEG hashes and license notices matched. The eight-place catalog and fifteen map selections passed.
The live preference route returned 401 without a Better Auth session; service-token PUT returned 403.
Anonymous requests still redirected to Access. No protection exception was added.
Hosted preference and catalog screenshots were opened at 390/900/1440 pixels.
Early preference captures preceded image decoding. Corrected captures in `preferences-settled/` wait for the catalog, image, and font.
Both sets remain retained; this was a capture timing issue, not a second deployment.
Private deployment and live reports are `release.json` and `live.json` inside the final backup directory.

Gravity accepted coding evidence for the exact deployed merge through `verify-commit Localley preserved-app-work`.
The documented `verify-release Localley verified-delivery` command rejected the exact PR130/merge/deployment tuple with `independent_evidence_rejected`.
Its last status still listed app-specific release-contract, check-catalog, and protected-merge gates. No registry or engine was changed.
This is verified preview delivery, not independent full-production acceptance or proof of operator-receipt reconciliation.

## Scope

This increment ports `/api/user/email-preferences` and the existing settings controls to Better Auth and D1.
The protected preview adds an Email preferences entry. It does not replace production settings or send email.
The current Clerk production adapter remains unchanged. The shared client uses the explicit application session boundary.

GET returns `{ preferences }`; PUT accepts `{ preferences: { supported_boolean_fields } }` and returns `{ success: true, preferences }`.
Supported fields remain `marketing`, `weekly_digest`, `product_updates`, and `itinerary_shared`.
Unknown fields, caller-supplied owner IDs, invalid booleans, empty changes, and query selectors fail closed.
The existing 16 KiB body cap, five-second whole-body deadline, same-origin check, and no-store responses remain active.

PUT requires a matching session header. GET rejects a supplied stale header before returning private state.
The D1 statement rechecks current verification, session expiry, auth user, application owner, and profile identity.
One guarded UPSERT changes only supplied fields. Concurrent independent toggles do not overwrite each other.
New native accounts start with optional preferences off. GET does not create a preference row.
Legacy owners require explicitly imported preferences; missing import data returns 409 instead of inventing consent.
Existing imported false values stay false. This increment does not implement the production account import.

The actual controls clear private state when account identity changes and suppress late responses and success messages.
Failed reads do not show assumed preferences. Unconfirmed writes require a read before another change; there is no automatic replay.
The bounded client request includes headers and body consumption. Buttons show persisted state, not optimistic success.

## Verification

Local release checks passed: 2,173 root tests with five existing optional skips; TypeScript; lint with zero errors and 62 warnings.
The native package passed 212 tests without skips, environment isolation, Worker/frontend types, lint, and its production bundle build.
Both native HTTPS browser suites passed. The final run reported zero browser errors and zero external requests.
All nine preference screenshots were opened across 390, 900, and 1440 pixels.
Measured preference text contrast was at least 4.83:1; targets were at least 44px, with visible keyboard focus and no overflow.
The browser checked reduced motion, correct switch-thumb positions, and persisted state after reload.
These measurements do not establish complete WCAG conformance, screen-reader speech, or hosted human acceptance.

Native D1 tests cover defaults, preservation, concurrent first writes, retries, strict input, session guards, legacy preferences, and database failure.
Restricted-preview tests retain human Access identity checks and reject service-token writes, including with a valid Better Auth cookie.
Twelve component tests cover failed reads, double submissions, stale-account responses, uncertain writes, malformed responses, and blocked accounts.
The real local HTTPS journey verifies keyboard changes, D1 persistence, reload, error recovery, and both existing trip journeys.
Synthetic accounts and private local outbox messages only; no external email or provider request belongs to these tests.

Attempt 1: native D1 `exec` split a multiline migration. The migration now follows the package's single-statement-per-line convention.
Attempt 2: component tests used unavailable Jest DOM matchers. Native DOM assertions now pass without another dependency.
The browser runner initially refused low disk. Only the inactive authentic-discovery worktree's rebuildable `.next` output was removed.
Its source, Git state, screenshots, and receipts were preserved. The active root development build was not removed.
Frontend TypeScript caught optional identity fields. The new panel now uses the existing explicit identity-presence guard.
Final pre-installation review added explicit `NOT NULL` to the owner primary key, with native D1 constraint regressions.
SQLite text primary keys otherwise permit nulls. The migration had not been installed, so no stored data needed correction.
Advisor review could not start: the installed wrapper could not find `codex`. No paid fallback or new builder was started.

## Release Gates

Deploy only after current checks, normal PR merge, and a private D1 backup plus restoration rehearsal.
Apply only additive migration `0007_email_preferences.sql` to `localley-migration-preview`.
Preserve all eight public preview records, native candidates, existing receipts, identity links, and the hourly transfer.
Record the exact merge tag, active Worker version, deployment ID, live asset hashes, and denial checks before acceptance.
Rollback uses the preceding Worker while retaining the additive table and all subsequent preference choices.
Never restore an old database over newer account, preference, or ingestion activity.

Hosted human sign-in and recovery remain a separate acceptance gate. Read-only service checks cannot establish that journey.
No production Supabase, Vercel, Clerk, paid schedule, or social publication change is authorized by this preview release.
