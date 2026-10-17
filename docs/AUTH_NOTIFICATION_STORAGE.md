# Notification storage on Auth D1

## Scope

This is an independent, additive feature store. It does not import existing Source data or complete the application migration.
The current Source project has no `notifications`, `notification_preferences`, or `push_subscriptions` tables.
The read-only inventory proves current physical absence; it does not prove that no deleted archive or external history exists.

The three new tables use canonical Better Auth `user.id` values and `ON DELETE CASCADE`.
Neither an email address nor an ID prefix grants ownership. Migrated and opaque IDs follow the same rule.
Every SQL operation checks the physical user's verified status. No Source owner mapping or profile sync is required.
Every preference defaults to false. Reading defaults does not create a row or infer consent.

The store exposes no notification producer or sender. Push storage cannot send messages.
Existing dormant triggers, external push delivery, and email delivery remain inactive.
Existing preview candidate storage and all other Source features retain their behavior.

## Foundation and activation are separate gates

The foundation adds a migration and an unused store. It has no runtime callers, binding changes, or activation flag.
Merging the foundation does not apply the migration, activate normal production storage, or deploy a new Worker.
It is safe to keep the existing Worker while the following delivery gate is prepared.

Before production activation:

1. Complete exact CI and independent code and release review.
2. Export and encrypt the complete production Auth database; test a real restore and compare data and schema.
3. Verify the existing database identity, both administrator IDs, and additive-only schema changes.
4. Route only verified sessions into the new store, after the existing preview candidate branch.
5. Bound every request body and page, reject owner claims, and fail closed on selected-store errors.
6. Clear client state and reject stale responses on account changes.
7. Deploy a compatible read-only version before enabling writes. Rollback must retain new rows and their readability.
8. Verify an explicit version-override canary with normal non-reserved desktop and mobile users.
9. Prove owned reads, partial preference writes, reload, inbox actions, device caps, foreign denials, and exact cleanup.
10. Activate normal production storage only after these feature gates pass.

Do not drop the new tables to roll back. Do not use a Source fallback after selecting the new store.
All common full-data rehearsal, freeze, canary, rollback, and retention gates remain in force.

## Local verification

`__tests__/lib/auth-notification-store.test.ts` uses the existing real SQLite adapter and all Auth migrations.
It covers additive schema preservation, false defaults, owner isolation, partial patches, quiet-hour clears,
verified-user races, bounded inbox reads, idempotent actions, unsafe link removal, push caps and ownership,
overlapping registrations, canonical key and point validation, and account-delete cascade.
Overlapping JavaScript calls share one real SQLite connection; this is not a remote D1 concurrency claim.
Hosted concurrency and backup/restore proof remain activation gates.
