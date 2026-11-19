/** Fixed labels and bounded counts only; never persist model output or error text. */
export function logItineraryFormatFailure(
  provider: 'glm' | 'openai',
  rawContent: string,
  logger: Pick<Console, 'error'> = console,
) {
  const prefix = provider === 'glm'
    ? 'Failed to parse GLM response; retrying with OpenAI:'
    : 'Failed to parse OpenAI response:';
  logger.error(prefix, { contentCharacters: Math.min(rawContent.length, 1_000_000) });
}

/** Modern JSON SyntaxError messages can echo a private response fragment. */
export function parsePrivateItineraryJSON(rawContent: string) {
  try {
    return JSON.parse(rawContent);
  } catch {
    throw new Error('AI generated invalid response format. Please try again.');
  }
}

/** The route must not pass an SDK error, cause or model-derived message here. */
export function logItineraryRequestFailure(logger: Pick<Console, 'error'> = console) {
  logger.error('Error generating itinerary:', { reason: 'generation_request_failed' });
}

export type GenerateTierClass = 'anon' | 'free' | 'paid' | 'unknown';
export type GenerateReason = 'rate_limited' | 'anon_limit' | 'monthly_limit' | 'invalid_input' | 'no_spots' | 'corridor' | 'error';
export type GenerateOutcome = { tier: GenerateTierClass; provider?: 'glm' | 'openai'; reason?: GenerateReason };

/** One line per POST: fixed labels and numbers only, never input values, user ids or model text. */
export function logGenerateOutcome(
  status: number,
  outcome: GenerateOutcome,
  durationMs: number,
  logger: Pick<Console, 'info'> = console,
) {
  logger.info('[generate] outcome', {
    status,
    tier: outcome.tier,
    ms: Math.max(0, Math.round(durationMs)),
    provider: outcome.provider ?? 'none',
    reason: outcome.reason ?? (status < 400 ? 'ok' : 'other'),
  });
}
