# Current signed-in response proof — 2026-10-17

## Scope and result

A fresh verified, non-admin account loaded five production pages on desktop and mobile.
The bounded run passed76 checks at16:58:35–16:59:47UTC.
This closes the previously unexecuted current-response check. It does not close U3 or explain historical errors.

The source under test was production commit `a38fe6495a20711086dce6a56a96545aa057c639`.
Documentation and candidate work had advanced stable main to `9d5daf0b81aba0b2a248319ee9c0da8c28cee313`.
No Worker upload, promotion, configuration change or code release occurred during this verification.

## Exact checks

The retained operator ran through `shared/scripts/run-heavy.sh`, with a850second timeout.
It created one reserved `@preview.localley.test` owner directly in production Auth D1 and signed in through Better Auth.
The account had no Source profile, paid plan or administrator permission.
An exact-ID cleanup lease and a12minute systemd cleanup timer existed before fixture creation.

Chromium used1365×900 and390×844 viewports.
Each viewport loaded these real paths through `https://www.localley.io`:

| Path | Document result | RSC result | RSC body bytes per viewport |
| --- | --- | --- | --- |
| `/dashboard` |200, completed |200, completed `text/x-component` |21701 |
| `/itineraries` |200, completed |200, completed `text/x-component` |23877 |
| `/profile` |200, completed |200, completed `text/x-component` |47669 |
| `/settings` |200, completed |200, completed `text/x-component` |46764 |
| `/chat` |200, completed |200, completed `text/x-component` |16116 |

Checks required the intended path after navigation, complete document bodies, nonempty bounded RSC bodies and no horizontal page overflow.
One same-origin307 redirect retaining the path and `_rsc` was permitted; repeated or other redirects were refused.
All ten screenshots were inspected.
There were zero client page exceptions and zero allowed-origin transport failures.

## Network boundary and limitations

The browser forwarded only same-origin GET requests through a controlled gate.
The API allowlist covered session, subscription status, conversations, tier, notifications/preferences, email preferences, saved itineraries and cities.
Other API requests, mutations, external origins, WebSockets and service workers were blocked.
No attempted request reached those blocked paths during this run.
No chat generation, checkout, charge, email, story generation or user action occurred.

This proves completed current origin responses under the controlled gate.
It does not reproduce unrestricted browser cancellation behavior, prove every streamed React segment succeeded, or test paid-owner journeys.
It does not establish the cause of fourteen older RSC network events.
The desktop/mobile empty-account screenshots are acceptance evidence for loading, not approval of every visual detail.

## Screenshot findings to fix separately

- The mobile chat header is obscured beneath the fixed top navigation.
- The mobile chat shortcut row clips its last action.
- Settings keeps its action bar visible even before a change; on mobile it interrupts subscription content.

These findings remain open. They must not be reported as a fully accepted mobile design.

## Preservation and cleanup

The exact fixture user, credential account and sessions were removed.
Owned notification preferences, inbox and push rows remained absent.
All eight Auth business-table counts and both complete administrator rows matched their baseline.
All48 Source application-table counts and full-row hashes matched their baseline.
The cleanup lease is closed; its timer is stopped. Shared rate-limit counters were not reset.

Production remained Worker `3132337f-a1bc-4ff5-a780-bdbe7a65e557` at100%, deployment `6a17bf4b-e2c1-435b-999e-25614fadbaec`.
Compatible production rollback remains `83366b0c-6a7f-4173-b569-3e4ad6f24780`.
Preview remained Worker `a397be3d-8798-4c72-9abd-4975f4e6d855` at100%, deployment `3268b368-4be2-43d6-a22d-fd4b976a46cf`.
Its tested rollback remains `ad9afeaf-15cc-4a1e-9766-9d4f72911d2c`, restoring `66e84452-82e7-4702-9c5c-95cf87e6fdde`.
No production-data import or routing switch occurred. Supabase still serves application data.

## Retained evidence and delivery

Private mode600 receipts under `/home/dev/.local/state/localley`:

- `u3-rsc-resumed-browser-20261017.json`:76 checks, ten document completions, ten RSC completions and cleanup result.
- `u3-rsc-resumed-lease-20261017.json`: closed exact-owner lease and before-state guards.
- `u3-rsc-resumed-run-20261017.log`: actual guarded invocation result.
- `u3-rsc-resumed-screens-20261017/`: ten inspected PNGs.

The earlier failed reviews remain retained. They were capacity failures, not missing owner approval.
This evidence-only change needs no new Worker release or runtime build.
The sole workflow path filter excludes this document and `docs/ROOT_METHOD_BOUNDARY.md`.
Verify the final PR path list and pending checks before merge. Record the exact PR and merge in the root plan.
U1 remains verified. U2 retains its original acceptance and conditional test-checkout skip. U3 remains open.
