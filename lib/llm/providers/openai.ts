/**
 * OpenAI (ChatGPT) Provider
 *
 * Handles all interactions with OpenAI's API for itinerary generation.
 * This is the primary provider for creative content generation.
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

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-2024-08-06';

export class OpenAIProvider
  extends AbstractLLMProvider
  implements ItineraryGenerationProvider
{
  readonly name = 'openai' as const;
  private client: OpenAI | null = null;

  constructor() {
    super();
    this.initializeClient();
  }

  private initializeClient(): void {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
    }
  }

  isAvailable(): boolean {
    return !!process.env.OPENAI_API_KEY && this.client !== null;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      // Use a minimal API call to verify connectivity
      await this.client!.models.list();
      this.lastHealthCheck = new Date();
      this.isHealthy = true;
      return true;
    } catch (error) {
      this.lastHealthCheck = new Date();
      this.isHealthy = false;
      return false;
    }
  }

  async generateText(options: TextGenerationOptions): Promise<TextGenerationResult> {
    if (!this.isAvailable()) {
      throw new ProviderNotAvailableError('openai');
    }

    const { result, latencyMs } = await this.measureLatency(async () => {
      try {
        const completion = await this.client!.chat.completions.create({
          model: OPENAI_MODEL,
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
        if (error instanceof Error && error.message?.includes('rate limit')) {
          throw new RateLimitError('openai');
        }
        throw new LLMProviderError(
          'openai',
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
      provider: 'openai',
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
      throw new JSONParseError('openai', result.content);
    }
  }

  async generateItineraryStructure(params: ItineraryParams): Promise<GeneratedItinerary> {
    if (!this.isAvailable()) {
      throw new ProviderNotAvailableError('openai');
    }

    const userPrompt = this.buildItineraryPrompt(params);

    const itinerary = await this.generateJSON<GeneratedItinerary>({
      systemPrompt: OPENAI_ITINERARY_PROMPT,
      userPrompt,
      temperature: 0.8,
      maxTokens: 3000,
      responseFormat: 'json',
    });

    // Validate the response structure
    this.validateItineraryStructure(itinerary);

    return itinerary;
  }

  async generateSingleActivity(request: SingleActivityRequest): Promise<Activity> {
    if (!this.isAvailable()) {
      throw new ProviderNotAvailableError('openai');
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

    const activity = await this.generateJSON<Activity>({
      systemPrompt: OPENAI_SINGLE_ACTIVITY_PROMPT,
      userPrompt,
      temperature: 0.8,
      maxTokens: 500,
      responseFormat: 'json',
    });

    return activity;
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

    parts.push('\nMake it exciting, authentic, and full of hidden gems!');

    return parts.join('\n');
  }

  private validateItineraryStructure(itinerary: GeneratedItinerary): void {
    if (!itinerary.title || !itinerary.dailyPlans || !Array.isArray(itinerary.dailyPlans)) {
      throw new LLMProviderError(
        'openai',
        'Invalid itinerary structure: missing title or dailyPlans',
        undefined,
        true
      );
    }

    for (const day of itinerary.dailyPlans) {
      if (!day.activities || !Array.isArray(day.activities) || day.activities.length === 0) {
        throw new LLMProviderError(
          'openai',
          `Day ${day.day} has no activities`,
          undefined,
          true
        );
      }

      for (const activity of day.activities) {
        const invalidNames = ['Location', 'Breakfast', 'Lunch', 'Dinner', 'What to Order'];
        if (!activity.name || invalidNames.includes(activity.name)) {
          throw new LLMProviderError(
            'openai',
            `Invalid activity name: "${activity.name}"`,
            undefined,
            true
          );
        }
      }
    }
  }
}
