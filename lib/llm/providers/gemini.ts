/**
 * Gemini Provider
 *
 * Handles all interactions with Google's Gemini API for:
 * - Location validation and Google Places data
 * - Image generation (via existing imagen.ts)
 * - Fallback text generation
 */

import { GoogleGenAI } from '@google/genai';
import {
  AbstractLLMProvider,
  type ItineraryGenerationProvider,
  type LocationValidationProvider,
  type ImageGenerationProvider,
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
  LocationValidationResult,
  TokenUsage,
} from '../types';
import {
  GEMINI_ITINERARY_PROMPT,
  GEMINI_LOCATION_VALIDATION_PROMPT,
} from './prompts/gemini';

// Support both environment variable names
const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
const TEXT_MODEL = 'gemini-2.0-flash';
const IMAGE_MODEL = 'gemini-2.5-flash-image';

export class GeminiProvider
  extends AbstractLLMProvider
  implements ItineraryGenerationProvider, LocationValidationProvider, ImageGenerationProvider
{
  readonly name = 'gemini' as const;
  private client: GoogleGenAI | null = null;

  constructor() {
    super();
    this.initializeClient();
  }

  private initializeClient(): void {
    if (API_KEY) {
      this.client = new GoogleGenAI({ apiKey: API_KEY });
    }
  }

  isAvailable(): boolean {
    return !!API_KEY && this.client !== null;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      // Simple health check - list models
      await this.client!.models.list();
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
      throw new ProviderNotAvailableError('gemini');
    }

    const { result, latencyMs } = await this.measureLatency(async () => {
      try {
        const response = await this.client!.models.generateContent({
          model: TEXT_MODEL,
          contents: [
            {
              role: 'user',
              parts: [
                { text: options.systemPrompt + '\n\n' + options.userPrompt },
              ],
            },
          ],
          config: {
            temperature: options.temperature ?? 0.8,
            maxOutputTokens: options.maxTokens ?? 3000,
            responseMimeType: options.responseFormat === 'json' ? 'application/json' : undefined,
          },
        });

        this.recordSuccess();
        return response;
      } catch (error: unknown) {
        this.recordError();
        if (error instanceof Error && error.message?.includes('429')) {
          throw new RateLimitError('gemini');
        }
        throw new LLMProviderError(
          'gemini',
          'Failed to generate text',
          error instanceof Error ? error : undefined
        );
      }
    });

    // Extract text from response
    const content = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Gemini doesn't always return token counts, estimate if needed
    const usage: TokenUsage = {
      inputTokens: result.usageMetadata?.promptTokenCount || 0,
      outputTokens: result.usageMetadata?.candidatesTokenCount || 0,
      totalTokens: result.usageMetadata?.totalTokenCount || 0,
    };

    return {
      content,
      usage,
      latencyMs,
      provider: 'gemini',
    };
  }

  async generateJSON<T>(options: TextGenerationOptions): Promise<T> {
    const result = await this.generateText({
      ...options,
      responseFormat: 'json',
    });

    try {
      // Clean potential markdown formatting
      let content = result.content.trim();
      if (content.startsWith('```json')) {
        content = content.slice(7);
      }
      if (content.startsWith('```')) {
        content = content.slice(3);
      }
      if (content.endsWith('```')) {
        content = content.slice(0, -3);
      }

      return JSON.parse(content.trim()) as T;
    } catch {
      throw new JSONParseError('gemini', result.content);
    }
  }

  async generateItineraryStructure(params: ItineraryParams): Promise<GeneratedItinerary> {
    if (!this.isAvailable()) {
      throw new ProviderNotAvailableError('gemini');
    }

    const userPrompt = this.buildItineraryPrompt(params);

    const itinerary = await this.generateJSON<GeneratedItinerary>({
      systemPrompt: GEMINI_ITINERARY_PROMPT,
      userPrompt,
      temperature: 0.8,
      maxTokens: 3000,
      responseFormat: 'json',
    });

    return itinerary;
  }

  async generateSingleActivity(request: SingleActivityRequest): Promise<Activity> {
    if (!this.isAvailable()) {
      throw new ProviderNotAvailableError('gemini');
    }

    const userPrompt = `
Generate a single activity for ${request.city}:
- Day theme: ${request.dayTheme}
- Time slot: ${request.timeSlot}
- Requirements: ${request.requirements}
- Category preference: ${request.category || 'any'}
- DO NOT use these names: ${request.excludeNames.join(', ')}

Return a single activity object as JSON.
`;

    return this.generateJSON<Activity>({
      systemPrompt: GEMINI_ITINERARY_PROMPT,
      userPrompt,
      temperature: 0.8,
      maxTokens: 500,
      responseFormat: 'json',
    });
  }

  async validateLocations(
    city: string,
    locations?: Array<{ name: string; address?: string; category: string }>
  ): Promise<LocationValidationResult[]> {
    if (!this.isAvailable()) {
      throw new ProviderNotAvailableError('gemini');
    }

    // If no specific locations provided, return general city data
    if (!locations || locations.length === 0) {
      return [];
    }

    const locationsText = locations
      .map((loc, i) => `${i + 1}. ${loc.name} (${loc.category})${loc.address ? ` at ${loc.address}` : ''}`)
      .join('\n');

    const userPrompt = `
Validate these locations in ${city}:

${locationsText}

For each location, determine:
1. Does this place actually exist?
2. Is the name spelled correctly?
3. Is the category accurate?
4. What is the correct or closest address?

Return a JSON array with validation results.
`;

    interface ValidationResponse {
      locations: Array<{
        name: string;
        status: 'verified' | 'invalid' | 'uncertain';
        confidence: number;
        correctedName?: string;
        correctedAddress?: string;
        reason?: string;
        possibleMatches?: string[];
      }>;
    }

    const response = await this.generateJSON<ValidationResponse>({
      systemPrompt: GEMINI_LOCATION_VALIDATION_PROMPT,
      userPrompt,
      temperature: 0.3, // Lower temperature for factual accuracy
      maxTokens: 2000,
      responseFormat: 'json',
    });

    return response.locations.map((loc) => ({
      name: loc.name,
      status: loc.status,
      confidence: loc.confidence,
      correctedName: loc.correctedName,
      correctedAddress: loc.correctedAddress,
      reason: loc.reason,
      possibleMatches: loc.possibleMatches,
    }));
  }

  async generateImage(options: {
    prompt: string;
    aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  }): Promise<{ imageBytes: string; mimeType: string }> {
    if (!this.isAvailable()) {
      throw new ProviderNotAvailableError('gemini');
    }

    try {
      const config: Record<string, unknown> = {
        responseModalities: ['IMAGE'],
      };

      if (options.aspectRatio) {
        config.imageConfig = {
          aspectRatio: options.aspectRatio,
        };
      }

      const response = await this.client!.models.generateContent({
        model: IMAGE_MODEL,
        contents: [options.prompt],
        config,
      });

      // Extract image from response
      if (response.candidates && response.candidates.length > 0) {
        for (const candidate of response.candidates) {
          if (candidate.content && candidate.content.parts) {
            for (const part of candidate.content.parts) {
              if (part.inlineData && part.inlineData.mimeType?.startsWith('image/')) {
                this.recordSuccess();
                return {
                  imageBytes: part.inlineData.data || '',
                  mimeType: part.inlineData.mimeType || 'image/png',
                };
              }
            }
          }
        }
      }

      throw new LLMProviderError('gemini', 'No image was generated', undefined, true);
    } catch (error) {
      this.recordError();
      if (error instanceof LLMProviderError) throw error;
      throw new LLMProviderError(
        'gemini',
        'Failed to generate image',
        error instanceof Error ? error : undefined
      );
    }
  }

  private buildItineraryPrompt(params: ItineraryParams): string {
    const parts = [
      `Create a ${params.days}-day itinerary for ${params.city} with these preferences:`,
      `- Interests: ${params.interests?.join(', ') || 'general exploration'}`,
      `- Budget: ${params.budget || 'moderate'}`,
      `- Localness Level: ${params.localnessLevel || 3}/5`,
      `- Pace: ${params.pace || 'moderate'}`,
      `- Group Type: ${params.groupType || 'solo'}`,
    ];

    if (params.templatePrompt) {
      parts.push(`\nFollow this template: ${params.templatePrompt}`);
    }

    return parts.join('\n');
  }
}
