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

## Prepared verification

Twenty-nine focused tests, TypeScript and scoped ESLint pass.
Required exact-head CI, pinned build, review, preview and controlled production receipt remain delivery gates.
Production currently remains the verified generation release c166de78, with Supabase application data.
