# Native Email Preferences

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
