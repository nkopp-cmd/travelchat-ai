# D1 chat candidate

## Scope

PR409 connects `/api/chat` to the existing counted D1 spot context and atomic daily chat usage. It requires the exact preview host, `data_candidate=d1`, outbox/read-only isolation, a verified reserved fresh owner and `PREVIEW_CHAT_GENERATION=true`. Default configuration is false. The production application-data backend remains Supabase.

The body reader caps actual stream bytes at64KiB. Unknown fields, missing user messages and invalid cities fail before quota or model submission. Context import/visibility checks precede quota. Historical/conflicting owners are refused. The quota update repeats the fresh-owner constraint atomically. One admitted request makes one model submission, with SDK retries disabled. Failed or lost replies retain quota; this route does not resubmit or refund them.

Normal www and unflagged preview routing retain their existing paths. History uses the existing conversation endpoints separately. This gate proves the backend; it does not claim candidate desktop/mobile chat UI acceptance.

## Verified code

- Source `fe388507cf3d7352b434ce4fa5afed2c9f0098cb`; merge `4b4e305c65821ee78ec3714bc891e1e97f1a9983`.
- Required CI38342593336 passed17m47s on the exact source head.
- 45 focused tests in five suites, focused lint, pinned dependencies, type checks and OpenNext build pass.
- Two bounded read-only reviews found no confirmedP0/P1. Provider/caller inspection confirms no internal retry or Source/Redis fallback.
- Artifact audit:2327files,76755831bytes,92private values,zero unexpected matches. The five documented public Kakao aliases retain their prior scope.
- Artifact SHA256 `8511a1a62b3421a5235079f30eca42f063cd0fe5352093c03643740a695f85e2`.

## Hosted acceptance

Candidate0f81bd62-ea8a-49bc-a059-b27436dd0c6f ran in an isolated1% preview split. The inactive upload's CLI output parser failed after the secret version succeeded. Exact API identity/binding readback recovered the version; no upload or secret write was repeated.

Eight recovery self-tests and36hosted checks passed. A real verified reserved owner received one primary reply, with counted Seoul context available. Receipt67824a9d2719 reservesUSD0.05; the raw reply is retained privately. The reply and user message were saved separately through actual conversation APIs. Two reloads returned both exact values. A second owner received404 for that history.

Eleven concurrent no-cost counter requests for the second owner produced ten admissions and one429. The actual chat route then returned429 without another model call. Its counter did not change the first owner's count. Unverified and conflicting historical identities received503. Invalid input/city and anonymous callers were denied. Normal preview invalid-body routing had no D1 source header.

Exact owned conversations/messages/counters/owner maps and Auth users/accounts/sessions/outbox entries were removed. All55APP table counts returned to their baselines, with zero FK violations. No production customer or source record was changed.

The external watchdog was armed before the split. Deployment87e42a76-ebb8-427b-b96b-0996f3df1129 restored prior previewb9086f9a-768a-487a-8e93-bba8fca88220 at100%, deploymentc4380814-2ec6-4a23-a48e-55fc7a2acff0. The recovery timer was stopped after readback.

## Preview release

Default preview9cf5bafd-0b75-4990-a2ff-4554fbd6a51c, deploymentec239595-a40a-4ba0-9c68-252ca2ef422b, released2026-10-13 04:11:41UTC. Generation remains false. Rollback isb9086f9a-768a-487a-8e93-bba8fca88220.

Final disabled-generation acceptance passed12checks at04:23:07UTC on9cf5bafd. An actual verified owner received503 without a counter or owner write; exact Auth cleanup, all55application counts and foreign keys passed. No paid request occurred. The release readback at04:12:52UTC confirms productionb4d426e2/0385cd50 unchanged, source counts8/5/33/85/3295, both admin IDs and four public200 responses. Full current-data parity, executed data rollback and the production data switch remain open.
