# GLM 5.2 Provider Setup

Localley uses GLM 5.2 as the primary low-cost chat and itinerary model. The existing OpenAI/Anthropic paths stay in place as fallback providers.

## Required Vercel variables

Set this in Vercel for Production. Also add it to Preview and Development if those environments should use GLM:

```env
GLM_API_KEY=your_zai_api_key
```

These are optional because the app has production defaults, but adding them makes the runtime configuration explicit in Vercel:

```env
GLM_MODEL=glm-5.2
GLM_BASE_URL=https://api.z.ai/api/paas/v4/
OPENAI_API_KEY=your_openai_fallback_key
ANTHROPIC_API_KEY=your_anthropic_fallback_key
```

`ZAI_API_KEY` and `ZAI_BASE_URL` are also supported aliases, but prefer the `GLM_*` names in Vercel so the Localley provider configuration is easy to scan.

Localley trims these values before use. A variable that exists but contains only spaces is treated as missing, so the app falls back instead of trying a broken provider request.

## Where GLM is used

- `/api/chat` tries `GLMProvider` first and falls back to Anthropic if GLM is unavailable or fails.
- `/api/itineraries/generate` tries `GLMProvider` first and falls back to OpenAI if GLM is unavailable, errors, or returns invalid JSON.
- `/api/itineraries/generate-v2` uses the LLM orchestrator, where GLM is the primary structure generator and OpenAI is the direct fallback when simple single-model generation is active.
- The orchestrated Pro/Premium path still uses GLM for structure generation first, with OpenAI/Gemini/Claude available only as validation or fallback routes depending on the tier and configured API keys.

## Manual rollout steps

1. In Vercel, open the `travelchat-ai` project settings.
2. Add or update `GLM_API_KEY` in Production.
3. Optionally add `GLM_MODEL=glm-5.2` and `GLM_BASE_URL=https://api.z.ai/api/paas/v4/`.
4. Repeat for Preview and Development if those environments should use GLM.
5. Redeploy the latest `main` deployment.
6. Test `/chat` and create one itinerary.
7. Check API JSON responses for `provider: "glm"`, `model: "glm-5.2"`, and `fallbackUsed: false` on chat responses, and `meta.provider: "glm"` plus `meta.fallbackUsed: false` on itinerary responses.

Use the standard Z.AI OpenAI-compatible endpoint for Localley chat/completions. Do not use the coding-plan endpoint for the app runtime unless the provider implementation is changed deliberately.

Important: Vercel can contain a variable name with a blank value, for example `GLM_API_KEY=""`. That is not configured. In that state Localley treats GLM as unavailable and falls back to Anthropic/OpenAI.

## Vercel CLI setup

From the project root, add the GLM variables like this:

```bash
cd "/Users/alleycore/Documents/CoreMachine/01 - Projects/Code/Localley"
printf "%s" "your_zai_api_key" | vercel env add GLM_API_KEY production --scope nkopp-cmds-projects
printf "%s" "glm-5.2" | vercel env add GLM_MODEL production --scope nkopp-cmds-projects
printf "%s" "https://api.z.ai/api/paas/v4/" | vercel env add GLM_BASE_URL production --scope nkopp-cmds-projects
```

Only the first command is required. Repeat the same commands for `preview` and `development` if those environments should use GLM too. After changing Vercel env vars, redeploy because running deployments do not automatically reload new secrets.

## Verify the deployed env

Verify the current local env without printing the secret:

```bash
cd "/Users/alleycore/Documents/CoreMachine/01 - Projects/Code/Localley"
npm run llm:readiness
```

This should report:

- `Primary chat provider: glm`
- `GLM configured: yes`
- `GLM key source: GLM_API_KEY`
- `Ready for GLM primary: yes`
- `Ready for production chat: yes`
- `Ready for production itineraries: yes`
- `Ready for production AI: yes`
- `Issues: none`

Use strict mode for deployment checks. It exits non-zero when GLM primary, chat fallback, or itinerary fallback readiness is incomplete:

```bash
npm run llm:readiness -- --strict
```

Add `-- --health` only when you want to spend one lightweight provider call to verify the remote GLM endpoint:

```bash
npm run llm:readiness -- --health
```

Pull the production env and verify the GLM key is non-empty without printing the secret:

```bash
cd "/Users/alleycore/Documents/CoreMachine/01 - Projects/Code/Localley"
tmp_env=$(mktemp)
vercel env pull "$tmp_env" --environment=production --scope nkopp-cmds-projects --yes >/dev/null
npm run llm:readiness -- --env-file="$tmp_env" --strict
rm -f "$tmp_env"
```

For machine-readable checks, add `-- --json`:

```bash
npm run llm:readiness -- --json
```

Strict mode can be combined with JSON output for machine checks:

```bash
npm run llm:readiness -- --json --strict
```

If `GLM configured` is `no`, `readyForGlmPrimary` is `false`, or `issues` includes `glm_api_key_missing`, run `vercel env rm GLM_API_KEY production --scope nkopp-cmds-projects` and then add the real key again with `vercel env add GLM_API_KEY production --scope nkopp-cmds-projects`.

If `issues` includes `anthropic_fallback_missing`, add `ANTHROPIC_API_KEY` before launch so the existing chat fallback remains available when GLM fails or is temporarily unavailable.

If `issues` includes `openai_itinerary_fallback_missing`, add `OPENAI_API_KEY` before launch so itinerary generation can fall back when GLM fails or returns invalid JSON.

If `issues` includes `glm_health_failed`, the key is present but the provider call failed. Confirm the Z.AI account, model access, and `GLM_BASE_URL`, then rerun `npm run llm:readiness -- --health`.

## Verify the runtime provider

Admin users can verify runtime routing without exposing secrets:

- `GET /api/admin/llm-metrics` reports `chatProviderReadiness`, including `readyForGlmPrimary`, `readyForProductionChat`, `readyForProductionItinerary`, `readyForProductionAI`, `issues`, whether GLM is configured as the primary provider, whether Anthropic chat fallback is configured, and whether OpenAI itinerary fallback is configured.
- `GET /api/admin/llm-metrics?health=glm` runs a lightweight GLM health check and returns `chatProviderReadiness.glm.healthy`.
- `POST /api/chat` returns `provider`, `model`, `fallbackUsed`, `fallbackReason`, `primaryProvider`, `primaryModel`, and `primaryConfigured`. A healthy GLM-primary response should return `provider: "glm"`, `model: "glm-5.2"`, `primaryProvider: "glm"`, `primaryModel: "glm-5.2"`, `primaryConfigured: true`, `fallbackReason: null`, and `fallbackUsed: false`.
- If chat returns `provider: "anthropic"` with `fallbackReason: "glm_unavailable"` and `primaryConfigured: false`, the GLM key is missing or blank in the running environment. If it returns `fallbackReason: "glm_error"` or `fallbackReason: "glm_empty_response"` with `primaryConfigured: true`, GLM was configured and attempted, but Anthropic handled the message.
- `POST /api/itineraries/generate` returns `meta.provider` and `meta.fallbackUsed`. A healthy GLM-primary response should return `meta.provider: "glm"` and `meta.fallbackUsed: false`; `meta.provider: "openai"` with `meta.fallbackUsed: true` means GLM was attempted but failed or returned invalid JSON, and OpenAI handled the itinerary.

The health-check query intentionally runs only when `health=glm` is present so normal metrics reads do not spend model tokens.
