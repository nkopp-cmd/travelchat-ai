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
