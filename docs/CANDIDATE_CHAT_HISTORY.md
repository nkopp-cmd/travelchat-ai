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

## Delivered preview — 2026-10-13

- Runtime PR414, source `79673b9bc1b68e1fdd90233a0df1c664b1e6bc52`,
  required self-hosted CI38361033900 SUCCESS14m07s; merge
  `c8a08ef4419e151e8e7532472fc8de4239f843ad`. Runtime files compare equal.
- 43 focused tests and scoped lint pass. TypeScript and pinned OpenNext build
  pass. Artifact SHA256 `3ce8989fd3ef8185b2c6a682422a81ee322aa44dbc785bf9eaf2ed5b67ca3a03`;
  2,328 files, 76,783,267 bytes, 93 private values checked, zero unexpected hits.
  Five existing server occurrences are the already-public Kakao key alias.
- Read-only advisor review finds no confirmed P0/P1. Accepted limits are the
  existing 60-second session cache and aggregate 100-conversation/1,000-message
  refusal. The next production code release adds dynamic page rendering but
  retains the byte-identical normal Source chat component.
- Preview Worker `ae129c85-c6b0-431d-a87a-02c788604bcd` at100%, deployment
  `1a1a1a82-76f5-49f3-9c15-ddafba16d0f4`, released07:27:26UTC. Rollback
  `9cf5bafd-0b75-4990-a2ff-4554fbd6a51c`. API version readback proves outbox
  and Source read-only true. Chat/story generation, beta and bypass are explicitly false.
- First hosted proof passes49 checks. Strengthened proof passes51 checks with
  two actual verified reserved users, saved fixture messages, conversation
  selection and reload, foreign API404, foreign/missing/malformed page refusal,
  unverified owner refusal and anonymous307. Same-browser account switching
  refuses the first owner's content. Hostile messages render escaped text.
- Actual desktop1440x900 and touch mobile390x844 navigation and reload pass.
  Four top/scrolled screenshots were inspected. Both replies remain readable;
  mobile scrolling exposes the complete answer above the bottom navigation.
  There is no horizontal overflow, browser page error or paid chat request.
  These are saved fixture messages; actual model reply proof remains the separate
  backend acceptance in PR409. No browser-generated reply is claimed here.
- Exact cleanup restores all55 APP table counts, zero foreign-key errors and
  the verification count. Both owned users, accounts, sessions and outbox rows
  are zero. Page reads do not create owners for empty accounts.
- Production Worker `b4d426e2-1952-4f7b-9989-67142b47053f`, deployment
  `0385cd50-8091-4ab4-aec7-f208d15cb496` and both admin IDs remain unchanged.
  Source counts remain8 users/5 subscriptions/33 usage/85 trips/3,295 spots;
  four public routes return200 at07:30UTC. Production still uses Supabase.

Private receipts remain under `/home/dev/.local/state/localley/`:
`chat-history-hosted-20261013.json`, `chat-history-hosted-20261013-visual.json`,
`chat-history-release-readback-20261013.json`, `chat-history-after-20261013.json`
and `chat-history-{desktop,mobile}-20261013-visual{,-scrolled}.png`.
Evidence-only edits do not deploy a new Worker.

## Candidate sending preparation — 2026-10-13

The admitted history page can render a composer only when
`PREVIEW_CHAT_GENERATION=true`. The default preview keeps that flag false.
Normal Source chat remains unchanged. Composer requests carry the admitted
page actor; candidate handlers reject a different session actor before usage,
provider or history writes. Existing header-free candidate callers remain compatible.

Each explicit submission locks immediately. The context contains at most20
saved messages within40KiB, plus a question of at most4,000 characters. The
existing backend64KiB admission and atomic daily quota remain authoritative.
The model request comes before any conversation/message write. A generation
refusal therefore cannot create saved history. The caller makes no automatic retry.

After a reply arrives, the caller confirms the conversation and both saved
messages by ID, role and content before refreshing the owned flagged page.
An uncertain save leaves the received reply visible with an honest warning,
and keeps submission locked until reload. Account changes hide local reply/input.
The page remounts the composer when owned selection or saved message count changes.
Hosted sending acceptance and release remain pending; saved fixture-history proof
above does not certify this new flow.

## Delivered sending preview — 2026-10-14

- PR416 source `89c427ccb0713aaff1663a8edb62f4ccfa6b75c5` passed
  required self-hosted CI38418856780 in11m13s. Merge
  `af6deadf0aab0b71d11cc8c637b779dbd02bc896` has the same tree.
  All68 focused tests and scoped lint pass. The bounded read-only review found
  no confirmed P0/P1. Its save-state finding was fixed and tested before merge.
- A clean pinned install, TypeScript and OpenNext build pass. Artifact SHA256
  `728b5527d29d610061664a876cd8084fc7b23656c6180ad0d1ed841905b69cec`
  covers2,328 files/76,802,538 bytes. The scan checked93 private values with
  zero unexpected hits and the five existing server-only public Kakao aliases.
- Inactive version `386b740c-744f-4877-b929-ccf6296112eb` retained the approved
  provider binding. No secret was changed. Eight rollback-guard tests pass.
  First hosted attempt stopped on an invalid denial fixture before any paid call;
  its cleanup and rollback passed. The corrected second attempt passed49 checks.
- Guarded1% deployment `5ecf7d87-e421-4a24-9848-8fd98b68d357` proved the actual
  form at desktop1440x900 and touch mobile390x844. Each explicit action made
  one model request, confirmed two owned messages, refreshed and reloaded the
  same saved content. Duplicate submit events did not repeat the paid request.
  Owner mismatch, anonymous, malformed and foreign-owner denials pass.
- Receipts `187600454aa5` and `d882147cc6cf` each record estimatedUSD0.05.
  Raw replies were retained before assertions. No fallback or paid retry occurred.
  Each owner had exactly one daily usage increment. Four top/scrolled screenshots
  were inspected; text wraps and the scrolled mobile reply is fully visible.
  No model name appears in the interface. There were no browser page errors.
- All55 application table counts, foreign keys, owned Auth/session/account/outbox
  rows and verification count returned to baseline. Recovery restored
  `ae129c85-c6b0-431d-a87a-02c788604bcd` at100%, deployment
  `c56edfac-9941-464d-845f-e5917b354688`; the recovery timer is inactive.
- Released default preview `b010d40b-5023-4fdb-b4ea-a626715dd3be` at100%,
  deployment `2e305896-852b-423f-bc21-777e0d606711`,03:08:06UTC.
  Rollback is `ae129c85-c6b0-431d-a87a-02c788604bcd`. API readback confirms
  outbox/read-only true, and chat/story generation, beta and bypass false.
  Final default-disabled proof passes13 checks: actual503, no owner/counter
  writes, no rendered composer, exact Auth cleanup,55 restored counts and FK0.
  Its first invocation had a duplicate local declaration and made no requests.
- Production remains `b4d426e2-1952-4f7b-9989-67142b47053f`, deployment
  `0385cd50-8091-4ab4-aec7-f208d15cb496`. Both admins, Source counts
  users8/subscriptions5/usage33/itineraries85/spots3295 and four public200 remain.
  Evidence: private `chat-composer-hosted-20261014-v2.json`, raw replies,
  four PNGs, window-state, release-readback, default acceptance and final probe.

This scoped flow does not certify recommendation accuracy or every shell API.
Shared navigation still uses its existing subscription path. The candidate
renders escaped plain text, including literal Markdown markers. Production
application data stays in Supabase; the full cutover gates remain open.
