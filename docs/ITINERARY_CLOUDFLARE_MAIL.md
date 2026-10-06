# Owned itinerary mail through Cloudflare

## Scope

The explicit itinerary-copy action keeps its source ownership query and full React Email template.
Production sends through the existing AUTH_EMAIL binding, with HTML and plain text.
The sender is Localley <hello@localley.io>; links use HTTPS on localley.io.
Atomic AUTH_DB reservations permit five copies per user per UTC hour and twenty per UTC day.
A separate shared cap permits ten per UTC hour and forty per UTC day across all accounts.
Failed or ambiguous sends consume their reservation. Missing bindings/schema fail closed.
Apply the additive0003 auth migration before activation; rollback code ignores the empty new table.
Suppressed recipients produce a sanitized failure without retry or XP.
Normal preview queues a private link and reports sent:false without XP or delivery.
The explicit D1 candidate path retains its reserved owner-only outbox policy.
Subscription and story-ready transport remain separate pending increments.
Dormant notification producers remain inactive. No production data migration is included.

## Verification

33 focused tests pass across itinerary sender, auth mail, itinerary route and story route.
ESLint and git diff --check pass. The new tests run in required candidate CI.
Pinned public-only OpenNext build and hosted release checks passed for PR386.
No received-mail claim follows from HTTP200 alone.

## Release gates

Deploy preview first, verify its candidate/outbox and denial behavior, and retain rollback.
Review the complete production source delta since ccf23a78 before production release.
Verify a controlled real owned message, sender, subject, content and link using a received email.
Restore exact owned fixtures and retain Worker, source, admin and rollback receipts.
The production application-data switch remains gated on full parity, rollback and canary.

## 2026-10-06 verified release

PR386 merged as `0ad0b53074a96dddce640417d53a624206d6bed9` with an identical tested tree.
Required verify CI37494333854 passed on exact head9c41b409 in11m13s.
Thirty-three focused tests, ESLint, pinned public-only OpenNext build and scoped release review passed.
Artifact audit scanned2316files/76578655bytes against22private values and found0matches.
Both AUTH databases applied only additive0003; application data remains on Supabase.
Preview versionb9086f9a-768a-487a-8e93-bba8fca88220 is100%, deployment69cb9786-49a5-4fe1-bfcb-6859e823f401.
Its owned candidate/outbox replay passed; foreign404/anonymous401, unflagged preview and www remain source-routed.
All55candidate APP table counts were restored with no FK errors; fresh auth fixtures were removed.
Remote quota proof admitted exactly5of20concurrent owner reservations and10shared reservations; next shared request refused.
Production version043e1752-23d6-4378-be1b-96a48f86f995 is100%, deploymentec5dd29c-3657-4033-8560-0546d158fa9f.
Rollback is prior live versionb42e8926-6b15-4875-85ec-44d39513832d; additive counters remain compatible with old code.
A controlled inbox received the login link, complete itinerary and reset messages from hello@localley.io.
The received link created a verified session; owned detail returned200, anonymous copy401 and missing copy404.
The new-version copy returned sent:true/messageId and consumed one owner and one shared reservation.
No inference about Gmail placement, alignment headers or separately observed MIME follows from this receiver.
Real-template binding tests prove HTML plus text. Suppression tests prove generic failure and no retry.
Exact source/auth fixtures and reserved counters were removed; both historical admin IDs remain present.
Selected four source and five auth table hashes match the baseline:8users/5subscriptions/33usage/85itineraries.
This is selected-table restoration, not full current-data parity or a historical signed-in cutover canary.

### Verification corrections

Cloudflare version overrides require a quoted UUID structured-string value.
The first production copy reached the old version, with HTTP200/no sent field and zero new counters.
Its known accepted email arrived. It was recorded separately; no ambiguous resend occurred.
Correct routing reused the same owned trip for one new-version explicit copy.
Earlier preview1% reads were not exact-version proof; replay on merged preview100% replaced that claim.
Receiver check_email yields incremental arrivals; get_email_list proved retained delivery after polling.
One itinerary snapshot hit500/57014. Ordered25-row SDK reads restored the same canonical hashes.

Private receipts are retained at ~/.local/state/localley/itinerary-cloudflare-mail-20261006/.
Mail reservation totalUSD0.04 covers four sends; receipt00b00e9180a4 is complete.
Subscription and story-ready Resend callers remain pending. Full production data cutover remains gated.
