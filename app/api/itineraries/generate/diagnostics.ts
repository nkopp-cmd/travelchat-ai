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
// Push CG3: `city` is the slug of a supported city (fixed list, never the submitted text); `check` marks our own
// scripted checks; `suggestion` says whether a no_spots answer offered a smaller plan. The money probe counts
// planner errors per city from this line (funnel_events_daily cannot take a new step without a table rebuild).
export type GenerateOutcome = {
  tier: GenerateTierClass; provider?: 'glm' | 'openai'; reason?: GenerateReason; cache?: 'hit' | 'miss';
  city?: string; check?: boolean; suggestion?: boolean;
};

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
    ...(outcome.cache && { cache: outcome.cache }),
    ...(outcome.city && { city: outcome.city }),
    ...(outcome.check && { check: true }),
    ...(outcome.suggestion !== undefined && { suggestion: outcome.suggestion }),
  });
}
