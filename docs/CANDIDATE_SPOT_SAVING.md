# Candidate spot save control

## Scope

The existing D1 saved-spot API now has a control on the candidate spot detail page.
The page requires the exact preview host, explicit `data_candidate=d1`, outbox mail and Source read-only mode.
Only verified reserved `@preview.localley.test` fresh identities receive this control.
Historical owner mappings and foreign fresh mappings do not receive it.
The admission read does not create an owner. The existing save API can create the deterministic fresh owner.

Normal preview and www keep the existing spot interactions and Source routes.
The existing candidate API's broader saved/history contract is preserved.
This increment does not certify production data parity or activate notification, engagement, XP or external delivery.

## Action safety

- Every control request carries explicit D1 opt-in and the admitted actor ID.
- The server refuses a changed actor before candidate access.
- Requests carrying an actor header cannot fall back to Source when candidate routing is lost or disabled.
- The client requires the candidate response marker and a boolean state before displaying success.
- Initial unavailable reads disable writes. Lost opt-in, changed sessions and pending actions cannot issue another mutation.
- An uncertain mutation response disables further actions and asks the user to reload for readback.
- Response generations discard results after the actor or spot changes.
- The control makes no XP claim. Normal save behavior remains unchanged.

## Verification

Focused suites cover the client action sequence, reload state, lost opt-in, changed sessions,
response markers, unavailable reads, duplicate clicks and uncertain responses.
Existing API and D1 writer suites retain idempotency, limits and normal routing checks.
The D1 verification workflow runs the added suites and lint.

Delivery requires exact CI, preview desktop/mobile action and reload proof, owner separation,
inspected screenshots, unchanged Source/admin/production evidence and exact fixture cleanup.
This document does not claim those release gates before their receipts exist.

## Delivered to preview — 2026-10-14

PR419 source `981115c349df479ed32d484e96c00da3be17bcff` merged as `1b9fb57165a4ef4fe06becece0fb9c052e9e922b`.
Required self-hosted CI38543108593 passed in11m46s. All39 focused tests, lint, TypeScript and pinned build passed.
Bounded review found no confirmed P0/P1. Artifact `da8998d1c225fca8e4d5f4a2472a09c7d887179e839f7ce7c31d9552510eb988` had no unexpected private values.

The resumed guarded preview run passed53 checks. All four desktop/mobile screenshots were inspected.
Real clicks and taps proved save, readback, reload, remove and second-owner isolation.
Lost opt-in, changed actor, anonymous and unverified cases passed.
All55APP counts, owned Auth/outbox/verification and foreign keys restored exactly.
Canary7b5483ba restored the prior version under deployment8cfd6330 before promotion.
The earlier assertion and network failures remain in canonical Attempts540–541.
One bounded retry applies only to a free read on known transport errors; the successful run needed none.
No mutation or paid request was retried.

The same immutable uploaded version now serves default preview:

- Worker: `localley-next-preview`.
- Version: `dc5b3560-68ee-4a31-88a9-13cf49cfdae3` at100%.
- Deployment: `8040001b-0d3d-45d9-8602-13e57d22fc90`.
- Rollback: `b010d40b-5023-4fdb-b4ea-a626715dd3be`.
- Persistent candidate data: preview `APP_DATA_PREVIEW_DB`; sessions use preview `AUTH_DB`.
- Five default-preview health reads passed. Generation remains disabled.

The production Worker and Supabase remain unchanged by this preview release.
Normal conversations/subscription requests still lack candidate markers; this is not complete page parity.
Full current-data, media, executed rollback, historical ownership and production-switch gates remain open.
