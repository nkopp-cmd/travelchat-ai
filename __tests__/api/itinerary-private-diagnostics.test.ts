import { describe, expect, it, vi } from 'vitest';
import { logItineraryFormatFailure, parsePrivateItineraryJSON, logItineraryRequestFailure } from '@/app/api/itineraries/generate/diagnostics';

describe('private itinerary diagnostics', () => {
  it('never logs raw model text, URLs, credentials or syntax error fragments', () => {
    const logger = { error: vi.fn() };
    const content = 'private@example.com https://secret.example/?token=secret private travel dates';
    logItineraryFormatFailure('glm', content, logger);
    logItineraryFormatFailure('openai', content, logger);
    expect(logger.error.mock.calls).toEqual([
      ['Failed to parse GLM response; retrying with OpenAI:', { contentCharacters: content.length }],
      ['Failed to parse OpenAI response:', { contentCharacters: content.length }],
    ]);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('secret');
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('private');
  });
  it('bounds output lengths and retains empty-response evidence', () => {
    const logger = { error: vi.fn() };
    logItineraryFormatFailure('glm', 'x'.repeat(1_000_001), logger);
    logItineraryFormatFailure('glm', '', logger);
    expect(logger.error.mock.calls.map(call => call[1])).toEqual([{ contentCharacters: 1_000_000 }, { contentCharacters: 0 }]);
  });
  it('turns JSON parse failures into fixed errors without preserving the raw error as cause', () => {
    for (const content of ['{"title":"private trip', 'private@example.com', '']) {
      try {
        parsePrivateItineraryJSON(content);
        expect.fail('Expected a parse refusal');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('AI generated invalid response format. Please try again.');
        expect((error as Error).cause).toBeUndefined();
        expect((error as Error).stack).not.toContain('private@example.com');
      }
    }
  });
  it('logs final generation failure with one fixed event and no exception object', () => {
    const logger = { error: vi.fn() };
    logItineraryRequestFailure(logger);
    expect(logger.error.mock.calls).toEqual([['Error generating itinerary:', { reason: 'generation_request_failed' }]]);
  });
  it('preserves valid JSON exactly without rewriting provider output', () => {
    const itinerary = { title: 'Seoul', dailyPlans: [{ day: 1, activities: [{ name: 'Market' }] }] };
    expect(parsePrivateItineraryJSON(JSON.stringify(itinerary))).toEqual(itinerary);
  });
});
