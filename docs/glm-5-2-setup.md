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
7. Check API JSON responses for `provider: "glm"` on chat responses, or server logs for GLM-first itinerary generation.

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

Add `-- --health` only when you want to spend one lightweight provider call to verify the remote GLM endpoint:

```bash
npm run llm:readiness -- --health
```

Pull the production env and verify the GLM key is non-empty without printing the secret:

```bash
cd "/Users/alleycore/Documents/CoreMachine/01 - Projects/Code/Localley"
tmp_env=$(mktemp)
vercel env pull "$tmp_env" --environment=production --scope nkopp-cmds-projects --yes >/dev/null
npm run llm:readiness -- --env-file="$tmp_env"
rm -f "$tmp_env"
```

For machine-readable checks, add `-- --json`:

```bash
npm run llm:readiness -- --json
```

If `GLM configured` is `no` or `readyForGlmPrimary` is `false`, run `vercel env rm GLM_API_KEY production --scope nkopp-cmds-projects` and then add the real key again with `vercel env add GLM_API_KEY production --scope nkopp-cmds-projects`.

## Verify the runtime provider

Admin users can verify runtime routing without exposing secrets:

- `GET /api/admin/llm-metrics` reports `chatProviderReadiness`, including whether GLM is configured as the primary chat provider and whether Anthropic fallback is configured.
- `GET /api/admin/llm-metrics?health=glm` runs a lightweight GLM health check and returns `chatProviderReadiness.glm.healthy`.

The health-check query intentionally runs only when `health=glm` is present so normal metrics reads do not spend model tokens.
