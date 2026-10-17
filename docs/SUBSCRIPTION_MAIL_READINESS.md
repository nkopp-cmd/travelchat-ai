# Subscription mail readiness — 2026-10-17

## Verified current state

The remaining runtime Resend caller is `app/api/subscription/webhook/route.ts`.
It handles upgrade, cancellation and payment-failure mail through `sendSubscriptionEmail`.
Story-ready and explicit itinerary copies already use the Cloudflare mail layer.
The Resend package and `lib/resend.ts` remain because the subscription caller still imports them.
No transport, credential, preference, webhook or runtime was changed during this audit.

The exact production source is `a38fe6495a20711086dce6a56a96545aa057c639`.
The audited stable app source is `4117cd62bc552fc9d465d6754c9c3bd09c3ac4a1`.
The helper has the same source in both commits.

## Read-only catalog and aggregate evidence

Project-pinned Management SQL and production Auth D1 queries returned these facts:

| Item | Observed result |
| --- | --- |
| Source `users` |8rows,8distinct ownership IDs,3nonempty email fields |
| Source `users.name` |Absent |
| Source `users.email_preferences` |Absent |
| Source `notification_preferences` |Absent |
| Auth `user` |6rows, all6verified; email/name/emailVerified columns present |
| Auth notification preferences |Existing emailEnabled/weeklyDigest and notification categories; no product_updates field |

Only column metadata and aggregate counts were exported for this audit.
No recipient address, customer message or subscription payload was exported.
The private receipt is `subscription-recipient-audit-20261017.json` under `/home/dev/.local/state/localley`.

The query used `information_schema.columns` for Source users, subscriptions and notification_preferences.
It separately counted users, nonempty email fields and distinct clerk_id values.
Auth queries used `PRAGMA table_info` and aggregate user/verification counts.
The existing current-source inventory proves the three historical notification tables are physically absent.
Unknown deleted archives and external writers remain unknown; absence is not historical consent evidence.

## Current code defect and boundary

The subscription helper requests `email,name` from Source users.
Because `name` does not exist, that query cannot supply a valid recipient record.
The helper ignores its database error and returns after reporting no email.
A later query also requests the absent email_preferences field and defaults to allowing mail when no preference row exists.
The normal email-preferences API likewise reads that absent Source column and falls back to enabled defaults.
These are code/catalog findings. This audit did not send a mail or claim an observed failed customer delivery.

The existing Auth emailEnabled flag controls notification mail.
It is not automatically equivalent to product_updates, marketing or subscription-event consent.
Do not convert its absence or false value into permission, and do not invent historical preferences.
Do not source a recipient from webhook metadata, client input or an arbitrary Source email match.

## Next implementation boundary

1. Define which subscription events are transactional and which require a separately stored choice.
2. Resolve the event's canonical existing owner to one verified Auth user by exact ID.
3. Preserve historical ownership mappings without an email-based auto-claim.
4. Reuse the existing Localley sender, HTTPS first-party links, HTML/text and sanitized suppression handling.
5. Separate event acceptance from durable bounded mail dispatch; reconcile duplicate and ambiguous outcomes without an automatic resend.
6. Prove no mail for unknown, ambiguous, unverified or foreign owners and missing policy state.
7. Verify the owned preview outbox, required CI, reviewed production release, compatible rollback and controlled received message.
8. Remove Resend only after the last caller and required delivery gates pass. Retain credentials until legacy deployments are audited.

The prior notification SQL credential NEED is closed: read-only access and physical-table evidence already exist.
The remaining recipient/policy design is builder work. Do not request the same credentials again.
No new approval is needed to research, implement and test the isolated transport boundary.
Production activation still follows the existing mail, webhook and external-recipient safety gates.

## Independent Clerk audit

No Clerk SDK dependency or runtime Clerk API call was found in the checked app, component and library directories.
`scripts/auth/clerk-to-better-auth.mjs` deliberately retains an export command using CLERK_SECRET_KEY.
Ownership fields named clerk_id and clerk_user_id remain necessary migration identities.
A source scan alone cannot certify legacy Vercel deployments or external tooling.
Preserve that export evidence and credentials until the legacy deployment audit passes.
This audit does not authorize deleting users, migration data, Supabase or the Vercel fallback.
