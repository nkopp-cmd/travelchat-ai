# Owned itinerary mail through Cloudflare

## Scope

The explicit itinerary-copy action keeps its source ownership query and full React Email template.
Production sends through the existing AUTH_EMAIL binding, with HTML and plain text.
The sender is Localley <hello@localley.io>; links use HTTPS on localley.io.
An atomic AUTH_DB reservation permits five copies per UTC hour and twenty per UTC day.
Failed or ambiguous sends consume their reservation. Missing bindings/schema fail closed.
Apply the additive0003 auth migration before activation; rollback code ignores the empty new table.
Suppressed recipients produce a sanitized failure without retry or XP.
Normal preview queues a private link and reports sent:false without XP or delivery.
The explicit D1 candidate path retains its reserved owner-only outbox policy.
Subscription and story-ready transport remain separate pending increments.
Dormant notification producers remain inactive. No production data migration is included.

## Verification

32 focused tests pass across itinerary sender, auth mail, itinerary route and story route.
ESLint and git diff --check pass. The new tests run in required candidate CI.
Pinned public-only OpenNext build and hosted release checks remain required before readiness.
No received-mail claim follows from HTTP200 alone.

## Release gates

Deploy preview first, verify its candidate/outbox and denial behavior, and retain rollback.
Review the complete production source delta since ccf23a78 before production release.
Verify a controlled real owned message, sender, subject, content and link using a received email.
Restore exact owned fixtures and retain Worker, source, admin and rollback receipts.
The production application-data switch remains gated on full parity, rollback and canary.
