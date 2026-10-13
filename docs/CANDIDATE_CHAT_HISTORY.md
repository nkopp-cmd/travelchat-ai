# Candidate chat history

## Scope

`/chat?data_candidate=d1` uses D1 history only on the exact
`localley-next-preview.nkopp.workers.dev` host. Both `AUTH_MAIL_MODE=outbox`
and `SUPABASE_READ_ONLY=true` must be explicit. Other hosts and ordinary
preview requests retain the existing Source chat component without changes.

The server admits verified reserved `@preview.localley.test` accounts with
fresh owner mappings only. Historical, conflicting and unverified actors
cannot view candidate history. Page reads never create owners or write rows.

The existing owner-scoped repository bounds conversations to 100 and total
messages to 1,000. The page sends conversation summaries and only the selected
conversation's messages to the renderer. Unknown selections and malformed
records produce one generic unavailable state, without a Source fallback.
Saved text renders as escaped React text. Selection and reload retain explicit
opt-in. Reads do not make paid calls, send email or consume chat quota.

## Interface

Reuse Localley's existing ambient background, glass cards, purple selection,
Lucide icons and UI badges. Conversation navigation stacks above messages on
mobile and sits beside messages on desktop. Links have at least 44px targets.
Long names and message text wrap. User and Alley messages keep distinct labels.
This is a saved-history view. New messages are unavailable in this increment.
The backend generation flag stays disabled by default.

## Acceptance and release

Focused tests cover routing, actor admission order, owned/empty/foreign history,
missing storage, malformed fields, escaped hostile text and retained links.
Required CI also runs these tests and lint, alongside existing candidate checks.
Hosted desktop/mobile proof, exact fixture cleanup and preview release identity
must be recorded before this increment is complete. Production data remains
Supabase; this page does not complete the broader migration.
