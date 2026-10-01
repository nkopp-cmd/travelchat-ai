# Notification storage repair

Nils authorized this Supabase repair on 2026-10-01. Application-data D1 work remains paused.

Migration `supabase/migrations/20261001095033_users_first_notifications.sql` creates three currently absent tables, indexes, explicit grants and RLS in one bounded transaction. It does not rewrite existing users or backfill preferences. Server-created notices are private to the owner; authenticated clients cannot insert notices. Preferences use lazy first-read creation that preserves a concurrent winner. Push subscription conflicts use owner+endpoint so one account cannot replace another account's stored subscription. Push sending is not activated by this work; endpoint cleanup on account switch must precede future push activation.

Better Auth IDs are text, including both retained admin IDs. The app signs short-lived Supabase tokens with the existing HMAC secret (`lib/supabase-server.ts`); owner policies use `auth.jwt()->>'sub'`, never UUID conversion or user metadata. Current notification API routes also scope service-role operations by the verified auth owner.

## Apply gate

SQL execution is blocked by missing credentials. The existing service-role REST key supports row operations, not schema creation. No Supabase MCP, CLI login/PAT, or direct database credential is available. The access request is in root NEEDS.md; no further approval request is needed. Do not claim production storage exists until the following checks pass.

1. Verify the SQL connection targets exactly project `llehrhqeolfprutcaopi` and the three tables are absent. Verify `public.users.clerk_id` is unique text and both admin mappings exist. Refuse partial or unexpected existing tables.
2. Run the checked migration as one transaction. Its lock timeout is 5 seconds; statement timeout is 30 seconds. Do not retry an unknown result; inspect table definitions and constraints first.
3. Verify column types, grants, RLS and owner allow/deny against signed Supabase test tokens. Anonymous access must fail.
4. Normal release gates apply before deploying the library changes. Test fresh-owner defaults, concurrent first reads, UI toggle persistence after reload, owner isolation, inbox read/unread/delete and push owner separation with reserved test fixtures only. Clean exact fixtures afterward.

## Local rehearsal and rollback

`node scripts/notifications/test-storage.mjs` starts an isolated PostgreSQL 18 cluster on a private Unix socket, with Supabase-compatible roles; it removes its cluster in finally. It verifies SQL execution, defaults, RLS/grants, own reads/updates, cross-owner deny, reassignment refusal, and same-endpoint owner separation. This is local schema proof; it is not hosted SQL evidence.

Rollback the Worker to the prior recorded production version if application checks fail. Keep the new tables and any legitimate data; do not drop tables or reset preferences to roll back code. If the migration fails, its transaction rolls back all DDL. A successful migration is additive; no existing-row backup restore is needed. Confirm hosted schemas and owner access before another release.
