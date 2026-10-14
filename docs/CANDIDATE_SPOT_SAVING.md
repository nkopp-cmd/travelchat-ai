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
