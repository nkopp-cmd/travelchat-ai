# Owned story-ready mail through Cloudflare

## Scope and gates

The explicit story-ready action uses the existing AUTH_EMAIL binding, with HTML and plain text.
The named sender is Localley <hello@localley.io>; the fixed subject and direct link exclude client content.
A verified session, exact RLS itinerary ownership and persisted slide metadata are required before dispatch.
Both existing flat and nested slide metadata formats are accepted; no physical-object parity claim follows.
The city-only body is bounded to512bytes and cannot select a recipient, sender or link.
Existing atomic reservations allow five owner sends/hour and twenty/day, plus ten shared/hour and forty/day.
Story-ready and itinerary-copy mail share those caps; failed or ambiguous sends consume their reservation.
No automatic retry follows suppression or an unknown send result. Logs omit recipient and provider message bodies.
Normal preview queues mail without external delivery or a live-send reservation.
The exact D1 candidate retains its existing owner-only readiness and outbox path.
Subscription mail remains separate. Dormant notification producers remain inactive.
No production application-data migration, new provider, secret rotation or mail schema change is included.

## Delivered verification — 2026-10-12

PR404 source0bc01b161437764d1470815111db496e5926d87d merged as206476e.
Required CI38281236657 passed10m23s;29 focused tests, TypeScript, scoped ESLint and pinned OpenNext build passed.
Scoped read-only review found no concrete P0/P1. Build audit found no unexpected private key values.
Preview candidate8d8d5ac4 passed29 checks under a guarded1% override.
Three actual PNG uploads, owner-only ready outbox, foreign/anonymous/override denial and normal routing passed.
Exact three R2 deletes, owned media404,55 application table counts, foreign keys and both auth fixtures passed.
Preview returned to b9086f9a100%, deploymentb470e6c4; its recovery timer stopped.

Production Worker5814fa95-8fd2-45b9-8d85-243fc8de49b2 serves100%.
Deployment6abdf686-fe5e-4a58-9af5-ce8251ea32cf; rollbackc166de78-32b6-46f9-a3c5-afae8e6ebd42.
Thirty-seven controlled production checks passed with one fresh verified nonadmin owner.
Actual gradient cover/day/summary renders persisted; one explicit story-ready email arrived in the controlled inbox.
Observed sender: hello@localley.io. Subject: Your Localley story slides are ready.
The received direct link redirected from apex to www and opened the owned story view.
Anonymous/missing/recipient-override/not-ready denial, one quota reservation and refused sixth attempt passed.
Only one email was sent; the cap test changed only the test owner's counter.
Receipt171719a7559a records estimatedUSD0.01. No automatic resend occurred.
Exact three Source storage objects were deleted and returned unavailable.
Owned Source rows, auth account/session/user and counter fixtures were removed.
The shared counter restored by exact comparison; concurrent user reservations would be preserved.
Both admins, source counts8/5/33/85/3295 and four public200 remain unchanged.
This controlled receipt does not certify Gmail spam placement, full media parity or subscription mail.
Production application data remains Supabase.
Private receipts remain under /home/dev/.local/state/localley/story-mail-*20261012*.

