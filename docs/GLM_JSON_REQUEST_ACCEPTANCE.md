# Prepared GLM JSON request correction

This candidate remains a draft. It changes no current production request until its acceptance and release gates pass. Nils restarted candidate D1/R2 work on2026-10-03; production data stays on Supabase until all cutover gates pass.

## Decision and bounds

The existing trip formatter requests JSON with a3000-token default ceiling. It does not opt out of GLM5.2 thinking. Z.ai documents thinking enabled by default, with a supported disabled option for GLM5.2; GLM5.3 forces thinking. Official source: https://docs.z.ai/guides/overview/concept-param . This may contribute to bounded-output failures, but the old logs cannot prove that cause. Two bounded inspections found only512characters without a complete response or finish reason; no third log-shape attempt is planned.

The trip helper passes an explicit optional `disableThinking` flag. The GLM adapter serializes `thinking: {type: disabled}` only for an explicitly opted-out JSON request using exact model `glm-5.2`. Other models (including GLM5.3), ordinary text chat and callers without the flag retain their behavior. The model, prompts, token ceiling, temperature, quota, itinerary structure/grounding checks, provider fallback and privacy logs stay unchanged. No generated content is repaired, guessed or accepted with relaxed validation.

## Acceptance gates

Real-SDK HTTP interception must prove the serialized request body without network access. Synthetic fixtures contain no user data. Tests cover current model, forced-thinking models, unknown models, text chat and opt-in default behavior. Existing primary/fallback/privacy/sanitizer checks, TypeScript, lint and required self-hosted CI must pass before acceptance.

Paid real-provider acceptance is blocked by the shared weekUSD30.85/25. Existing NEED527 records the shared limit and2026-10-05 reset. Keep the PR draft; an SDK mock is not real-provider or production journey proof. When budget permits, reserve a bounded receipt before one owned real trip, retain the response before assertions, verify generation/save/reload and exact cleanup, and never retry an ambiguous reply. Complete focused release review, required checks, normal merged OpenNext build/deployment, current Worker/rollback readback and real production acceptance before recording delivery. Current production remains Worker a548f24e / deploymentd39a5358 / rollback93f34779; this file does not claim a release.

Local verification: eight real-SDK HTTP interception cases plus26 existing fallback/privacy/sanitizer cases passed (34total). The first run used jsdom and all eight SDK constructors correctly refused the browser environment; the harness now uses Node. No SDK browser safety flag changed. The second run passed34/34. TypeScript, focused ESLint and diff checks passed. Required CI remains separate; none of these checks proves a real model response or production journey.

## October5 continuation

Reconciled with current main0f10150, preserving every current workflow check. The reset spend guard passes at weekUSD4.28/monthUSD17.57; rerun it before paid dispatch. A broad advisor request exhausted its eight-turn limit. A focused supplied-diff review found the existing SDK automatic-retry risk. Only explicitly opted-out exact GLM5.2 JSON requests now pass maxRetries0 to chat.completions.create. Normal chat and other models retain their retry behavior. A real-SDK upstream500 test requires exactly one dispatch. Real acceptance and release remain pending.

## Real primary acceptance — October5

Exact head c0e41bf passed required self-hosted CI37298279310 in9m10s,35focused tests (9SDK/26fallback-privacy-sanitizer), TypeScript/lint and diff check. Exact-worktree advisor review resolved the SDK retry P1 and found no further P0/P1 in the reviewed provider/test files; production transition review remains separate.

Current source preflight found7verified grounded candidates,10597input-byte bound and3000output tokens. Fresh spend guard passed and receipt25e6a547d0f0 reservedUSD0.10 before one dispatch. The complete reply was retained before assertions. Actual primary GLM5.2 returned HTTP200/finish stop in15070ms with2433prompt/1085completion tokens and0reasoning tokens; no fallback or duplicate dispatch occurred. The unchanged parser/grounding produced1day/3activities. This observation does not prove thinking caused every earlier failure. Current official pricing estimate isUSD0.008181 rounded up; theUSD0.10 reservation remains counted pending invoice. Sources: https://docs.z.ai/guides/overview/pricing and https://docs.z.ai/guides/overview/concept-param .

A disposable owned inbox received hello@localley.io magic mail; its received HTTPS link created a real verified nonadmin session without reading D1 tokens. The generated trip saved through the existing production API200, matched exact-owner durable readback, and preserved activity names/addresses/spotIds/coordinates. Desktop1440/mobile390 saved views and reloads passed with no page errors or root overflow. Two screenshots were inspected; they show title/map layout, with all images and provider endpoints blocked. Activity presence was checked in the rendered DOM, not claimed from those header screenshots. No new photo/map-provider acceptance applies.

Exact cleanup37checks returned0for owned auth session/account/user and source profile/subscription/usage/itinerary rows, removed the received email and forgot the receiver. Full user/subscription/usage hashes, compact itinerary ID-owner fingerprint, both production admin mappings and Worker deployment returned to baseline. The first snapshot attempted huge itinerary select-all and failed500 before any email/account/paid work; a later bounded diagnostic returned122640503bytes, so the corrected baseline uses compact ID-owner fields. It does not claim a full itinerary-content hash. Raw unrelated diagnostic content was discarded.

Private mode600 evidence: glm-primary-preflight/wire/received/acceptance/generated-trip-20261005.json; glm-owned-proof/save-response-20261005.json, two inspected PNGs and matching logs. Initial broad review max-turn failure, new-test stub-order failure and initial snapshot failure remain recorded; each corrected check passed. The PR stays draft until production transition review, pinned build and updated exact-head checks pass. No Worker release or production D1 data switch is claimed here.
