// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GLMProvider } from '@/lib/llm/providers/glm';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function intercept(model = 'glm-5.2') {
  vi.stubEnv('GLM_API_KEY', 'test-only-key');
  vi.stubEnv('GLM_MODEL', model);
  vi.stubEnv('GLM_BASE_URL', 'https://unit.invalid/v4/');
  const requests: Record<string, unknown>[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    expect(url).toBe('https://unit.invalid/v4/chat/completions');
    const body = input instanceof Request ? await input.text() : String(init?.body);
    requests.push(JSON.parse(body));
    return new Response(JSON.stringify({ id: 'test', object: 'chat.completion', created: 0, model,
      choices: [{ index: 0, message: { role: 'assistant', content: '{"title":"Synthetic","dailyPlans":[]}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetch);
  return { provider: new GLMProvider(), requests, fetch };
}
const input = { systemPrompt: 'Return JSON only', userPrompt: 'Synthetic request', responseFormat: 'json' as const,
  disableThinking: true, maxTokens: 1200, temperature: 0.3 };

describe('GLM JSON request body through the real SDK with intercepted HTTP', () => {
  it('dispatches a bounded opted-out JSON request once on an upstream 500', async () => {
    const { provider } = intercept();
    const failure = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'synthetic upstream failure' } }),
      { status: 500, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', failure);
    await expect(provider.generateText(input)).rejects.toThrow('Failed to generate text');
    expect(failure).toHaveBeenCalledTimes(1);
  });

  it('serializes the supported opt-out while preserving model, prompt and token ceiling', async () => {
    const { provider, requests, fetch } = intercept();
    const result = await provider.generateText(input);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(requests).toEqual([{ model: 'glm-5.2', messages: [{ role: 'system', content: input.systemPrompt }, { role: 'user', content: input.userPrompt }],
      max_tokens: 1200, temperature: 0.3, response_format: { type: 'json_object' }, thinking: { type: 'disabled' } }]);
    expect(result.content).toBe('{"title":"Synthetic","dailyPlans":[]}');
    expect(result.usage).toEqual({ inputTokens: 2, outputTokens: 3, totalTokens: 5 });
  });
  it.each(['glm-5.3', 'glm-5.3-flash', 'glm-4.7', 'unknown-model'])('omits the opt-out for %s', async model => {
    const { provider, requests } = intercept(model);
    await provider.generateText(input);
    expect(requests[0]).not.toHaveProperty('thinking');
    expect(requests[0].max_tokens).toBe(1200);
    expect(requests[0].model).toBe(model);
  });
  it('leaves normal text chat unchanged even if a caller passes the flag', async () => {
    const { provider, requests } = intercept();
    await provider.generateText({ ...input, responseFormat: 'text' });
    expect(requests[0]).not.toHaveProperty('thinking');
    expect(requests[0]).not.toHaveProperty('response_format');
  });
  it.each([undefined, false])('requires an explicit caller opt-out (%s)', async disableThinking => {
    const { provider, requests } = intercept();
    await provider.generateText({ ...input, disableThinking });
    expect(requests[0]).not.toHaveProperty('thinking');
  });
});
