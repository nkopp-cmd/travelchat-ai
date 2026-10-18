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

- The mobile chat header was obscured beneath the fixed top navigation. Fixed by PR478; see the October18 delivery below.
- The mobile chat shortcut row clipped its last action. Fixed by PR478; see the October18 delivery below.
- Settings keeps its action bar visible even before a change; on mobile it interrupts subscription content.

The settings finding remains open. The original screenshots do not prove acceptance of the later chat repair.

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

## Chat layout delivery — 2026-10-18

PR [478](https://github.com/nkopp-cmd/travelchat-ai/pull/478) repairs the two chat findings above.
It also restores the desktop message pane to the available parent height.
Source `5e139c8e62b9049dd75117cf67d539cfc318ee51` passed required CI [39089818212](https://github.com/nkopp-cmd/travelchat-ai/actions/runs/39089818212).
Merge `534d001229f0191b6c7c8a2c8fecf53c6b0f8fe7` has the exact tested source tree.

The change sizes the chat shell from its parent, scrolls only the message pane, and wraps the shortcut row.
It changes no API, provider, authentication, persistence or candidate routing contract.
The ten focused tests cover persistence failures, reply ordering, retry behavior and the actual scroll receiver.
Focused ESLint and the pinned public-only production OpenNext build passed.
The final artifact scan checked71 private values and found zero matches.
An earlier rejected scan found43 matches only in one old local development-cache file.
The operator removed owned build outputs and rebuilt from clean files before upload.
The rejected output was never uploaded. Its failed receipt remains retained.
The advisor consultation reached the subscription limit; it produced no new verdict and used no fallback.

### Actual hosted acceptance

The inactive upload passed17 guards before the1percent canary.
The canary passed26 release checks and53 signed-in browser checks.
An actual rollback passed10 checks before the default promotion.
The default release passed26 release checks and another53 signed-in browser checks.
Both phases used real verified fresh non-admin owners and the real production login endpoint.
Each phase checked initial render and reload at1365×900 and390×844.
All four hosted screenshots were inspected.

| Measurement, initial and reload | Desktop | Mobile |
| --- | --- | --- |
| Heading top / navigation bottom |77 /65 px |69 /57 px |
| Parent scroll / window scroll |0 /0 px |0 /0 px |
| Message pane height |634 px |523 px |
| Composer bottom / visible boundary |892 /900 px |772 /779 px |
| Shortcuts fully visible |3 of3 |3 of3 |
| Bottom navigation visible |No |Yes |

The corrected verifier uses the viewport boundary when desktop bottom navigation is hidden.
Both phases completed document and RSC bodies, with zero page exceptions or allowed-origin transport failures.
Browser forwarding retained the GET-only network boundary described above.
No paid chat request, checkout, external mail or provider call occurred.
The local before/after run used stubbed APIs and synthetic sessions; it is separate from this live proof.
It reproduced the mobile parent scroll57px and clipped shortcut before the repair.

### Current runtime, preservation and rollback

Production Worker `localley-next` now serves version `d0f508f5-770a-4dc2-87f6-579a18a43185` at100percent.
Its deployment is `6003f606-9242-4c0e-870d-039a20160922` in the existing nilskopp account.
Rollback version `38d2d7e6-40ea-48df-9783-24a0a121ad10` was actually restored at deployment `787aadaf-793e-4ce4-acb2-c4988a034249`.
Preview remains version `03879c9f-26e4-4bb8-a955-a3798da12885`, deployment `9b83b961-5475-4682-9a4b-ca2a9da00585`.

The final23 guards passed.
They preserve all48 Source application-table counts and full-row hashes, eight Auth business-table counts and both complete administrator rows.
All57 binding definitions, four production schedules and zero preview schedules remain unchanged.
Both exact fixture leases are closed. The release timer and both cleanup timers and services are inactive.
Shared rate-limit counters were allowed to advance and were not reset.
U1 and U2 accepted plan lines remain byte-identical, including the conditional test-checkout skip.
Supabase still serves application data. This release does not complete the D1 migration or close U3.

### Performance evidence and remaining limits

The shared five-run timing check returned the following medians, in milliseconds:

| Public path | Before | After |
| --- | --- | --- |
| `/` |208 |220 |
| `/spots` |283 |107 |
| `/pricing` |162 |214 |

Home and pricing exceed the shared200ms budget after release; the50ms cache target remains open.
A bounded interleaved comparison of the old and new versions measured home202/192ms and pricing195/196ms.
Each comparison used five samples per version and alternated request order. All responses returned200.
The two versions serve18 public home scripts with identical fully decoded body hashes.
This supports timing variation rather than a public JavaScript change; it does not establish field p75.

Matched Lighthouse13.5 runs used the same existing Chromium1228, throttling and provider blocks.
Mobile LCP changed8753→8450ms and TBT1386→2287ms; desktop LCP1821→1901ms and TBT76→137ms.
Both runs retained CLS0 and zero failed requests.
TBT increased in this sample. Do not report a performance improvement or close the existing budgets.
These synthetic results do not measure field INP or establish the cause of timing differences.

### Retained evidence

Mode600 receipts remain under `/home/dev/.local/state/localley`:

- `u3-chat-scroll-resume-local-{before,after,cleanup}-20261018.json`, the local checks log and four PNGs.
- `u3-chat-scroll-production-resume{2,3}-service-build-20261018.json`: rejected and accepted artifact scans.
- `u3-chat-scroll-prod-upload-20261018.json` and `u3-chat-scroll-prod-live-resume2-{canary,rollback,promote}-20261018.json`.
- `u3-chat-scroll-owned-{canary,default}-20261018.json`, closed leases and two screenshot directories.
- `u3-chat-scroll-final-20261018.json`:23 final preservation and cleanup checks.
- `u3-chat-scroll-perf-{before,after}-20261018.log`, paired timing, public script parity and both Lighthouse summaries.

This evidence-only update changes no runtime artifact. Its sole document is outside the workflow path filter.
