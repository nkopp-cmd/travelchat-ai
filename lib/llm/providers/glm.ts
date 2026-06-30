/**
 * Z.AI GLM provider.
 *
 * Uses Z.AI's OpenAI-compatible chat completions API so the app can make
 * GLM the low-cost primary generator while keeping OpenAI as a fallback.
 */

import { OpenAI } from 'openai';
import {
  AbstractLLMProvider,
  type ItineraryGenerationProvider,
  LLMProviderError,
  ProviderNotAvailableError,
  JSONParseError,
  RateLimitError,
} from './base';
import type {
  TextGenerationOptions,
  TextGenerationResult,
  ItineraryParams,
  GeneratedItinerary,
  SingleActivityRequest,
  Activity,
  TokenUsage,
} from '../types';
import { OPENAI_ITINERARY_PROMPT, OPENAI_SINGLE_ACTIVITY_PROMPT } from './prompts/openai';

const GLM_MODEL = process.env.GLM_MODEL || 'glm-5.2';
const ZAI_BASE_URL = process.env.ZAI_BASE_URL || 'https://api.z.ai/api/paas/v4';

export class GLMProvider
  extends AbstractLLMProvider
  implements ItineraryGenerationProvider
{
  readonly name = 'glm' as const;
  private client: OpenAI | null = null;

  constructor() {
    super();
    this.initializeClient();
  }

  private initializeClient(): void {
    const apiKey = process.env.ZAI_API_KEY;
    if (apiKey) {
      this.client = new OpenAI({
        apiKey,
        baseURL: ZAI_BASE_URL,
      });
    }
  }

  isAvailable(): boolean {
    return !!process.env.ZAI_API_KEY && this.client !== null;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      await this.generateText({
        systemPrompt: 'You are a health check. Reply with ok.',
        userPrompt: 'ok',
        maxTokens: 8,
        temperature: 0,
      });
      this.lastHealthCheck = new Date();
      this.isHealthy = true;
      return true;
    } catch {
      this.lastHealthCheck = new Date();
      this.isHealthy = false;
      return false;
    }
  }

  async generateText(options: TextGenerationOptions): Promise<TextGenerationResult> {
    if (!this.isAvailable()) {
      throw new ProviderNotAvailableError('glm');
    }

    const { result, latencyMs } = await this.measureLatency(async () => {
      try {
        const completion = await this.client!.chat.completions.create({
          model: GLM_MODEL,
          messages: [
            { role: 'system', content: options.systemPrompt },
            { role: 'user', content: options.userPrompt },
          ],
          temperature: options.temperature ?? 0.8,
          max_tokens: options.maxTokens ?? 3000,
          response_format:
            options.responseFormat === 'json' ? { type: 'json_object' } : undefined,
        });

        this.recordSuccess();
        return completion;
      } catch (error: unknown) {
        this.recordError();
        if (error instanceof Error && error.message?.toLowerCase().includes('rate limit')) {
          throw new RateLimitError('glm');
        }
        throw new LLMProviderError(
          'glm',
          'Failed to generate text',
          error instanceof Error ? error : undefined
        );
      }
    });

    const content = result.choices[0]?.message?.content || '';
    const usage: TokenUsage = {
      inputTokens: result.usage?.prompt_tokens || 0,
      outputTokens: result.usage?.completion_tokens || 0,
      totalTokens: result.usage?.total_tokens || 0,
    };

    return {
      content,
      usage,
      latencyMs,
      provider: 'glm',
    };
  }

  async generateJSON<T>(options: TextGenerationOptions): Promise<T> {
    const result = await this.generateText({
      ...options,
      responseFormat: 'json',
    });

    try {
      return JSON.parse(result.content) as T;
    } catch {
      throw new JSONParseError('glm', result.content);
    }
  }

  async generateItineraryStructure(params: ItineraryParams): Promise<GeneratedItinerary> {
    if (!this.isAvailable()) {
      throw new ProviderNotAvailableError('glm');
    }

    const itinerary = await this.generateJSON<GeneratedItinerary>({
      systemPrompt: OPENAI_ITINERARY_PROMPT,
      userPrompt: this.buildItineraryPrompt(params),
      temperature: 0.7,
      maxTokens: 3000,
      responseFormat: 'json',
    });

    this.validateItineraryStructure(itinerary);
    return itinerary;
  }

  async generateSingleActivity(request: SingleActivityRequest): Promise<Activity> {
    if (!this.isAvailable()) {
      throw new ProviderNotAvailableError('glm');
    }

    const userPrompt = `
Generate a single activity for ${request.city}:
- Day theme: ${request.dayTheme}
- Time slot: ${request.timeSlot}
- Requirements: ${request.requirements}
- Category preference: ${request.category || 'any'}
- DO NOT use these names: ${request.excludeNames.join(', ')}

Return a single activity object matching the activity structure.
`;

    return this.generateJSON<Activity>({
      systemPrompt: OPENAI_SINGLE_ACTIVITY_PROMPT,
      userPrompt,
      temperature: 0.7,
      maxTokens: 500,
      responseFormat: 'json',
    });
  }

  private buildItineraryPrompt(params: ItineraryParams): string {
    const parts = [
      `Create a ${params.days}-day itinerary for ${params.city} with these preferences:`,
      `- Interests: ${params.interests?.join(', ') || 'general exploration'}`,
      `- Budget: ${params.budget || 'moderate'}`,
      `- Localness Level: ${params.localnessLevel || 3}/5 (5 = maximum local authenticity)`,
      `- Pace: ${params.pace || 'moderate'}`,
      `- Group Type: ${params.groupType || 'solo'}`,
    ];

    if (params.templatePrompt) {
      parts.push(`\nIMPORTANT: Follow this template style:\n${params.templatePrompt}`);
    }

    parts.push('\nMake it authentic, specific, and full of real local-first places.');

    return parts.join('\n');
  }

  private validateItineraryStructure(itinerary: GeneratedItinerary): void {
    if (!itinerary.title || !itinerary.dailyPlans || !Array.isArray(itinerary.dailyPlans)) {
      throw new LLMProviderError(
        'glm',
        'Invalid itinerary structure: missing title or dailyPlans',
        undefined,
        true
      );
    }

    for (const day of itinerary.dailyPlans) {
      if (!day.activities || !Array.isArray(day.activities) || day.activities.length === 0) {
        throw new LLMProviderError(
          'glm',
          `Day ${day.day} has no activities`,
          undefined,
          true
        );
      }

      for (const activity of day.activities) {
        const invalidNames = ['Location', 'Breakfast', 'Lunch', 'Dinner', 'What to Order'];
        if (!activity.name || invalidNames.includes(activity.name)) {
          throw new LLMProviderError(
            'glm',
            `Invalid activity name: "${activity.name}"`,
            undefined,
            true
          );
        }
      }
    }
  }
}
