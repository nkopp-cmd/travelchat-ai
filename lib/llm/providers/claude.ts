/**
 * Claude (Anthropic) Provider
 *
 * Claude serves as the Team Leader/Supervisor in the multi-LLM system:
 * - Reviews and validates itineraries from ChatGPT
 * - Performs fact-checking on locations
 * - Provides quality assurance and final approval
 * - Gives feedback for improvements
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  AbstractLLMProvider,
  type SupervisorProvider,
  LLMProviderError,
  ProviderNotAvailableError,
  JSONParseError,
  RateLimitError,
} from './base';
import type {
  TextGenerationOptions,
  TextGenerationResult,
  SupervisionOptions,
  SupervisionResult,
  LocationValidationResult,
  TokenUsage,
  GeneratedItinerary,
  ValidationIssue,
  RevisionSuggestion,
} from '../types';
import {
  CLAUDE_SUPERVISOR_PROMPT,
  CLAUDE_FACT_CHECK_PROMPT,
  CLAUDE_QUICK_VALIDATION_PROMPT,
} from './prompts/claude';

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

export class ClaudeProvider
  extends AbstractLLMProvider
  implements SupervisorProvider
{
  readonly name = 'claude' as const;
  private client: Anthropic | null = null;

  constructor() {
    super();
    this.initializeClient();
  }

  private initializeClient(): void {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }
  }

  isAvailable(): boolean {
    return !!process.env.ANTHROPIC_API_KEY && this.client !== null;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      // Simple health check - small message
      await this.client!.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'ping' }],
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
      throw new ProviderNotAvailableError('claude');
    }

    const { result, latencyMs } = await this.measureLatency(async () => {
      try {
        const response = await this.client!.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: options.maxTokens ?? 4000,
          system: options.systemPrompt,
          messages: [{ role: 'user', content: options.userPrompt }],
        });

        this.recordSuccess();
        return response;
      } catch (error: unknown) {
        this.recordError();
        if (error instanceof Error && error.message?.includes('rate_limit')) {
          throw new RateLimitError('claude');
        }
        throw new LLMProviderError(
          'claude',
          'Failed to generate text',
          error instanceof Error ? error : undefined
        );
      }
    });

    // Extract text from response
    const content =
      result.content[0].type === 'text' ? result.content[0].text : '';

    const usage: TokenUsage = {
      inputTokens: result.usage.input_tokens,
      outputTokens: result.usage.output_tokens,
      totalTokens: result.usage.input_tokens + result.usage.output_tokens,
    };

    return {
      content,
      usage,
      latencyMs,
      provider: 'claude',
    };
  }

  async generateJSON<T>(options: TextGenerationOptions): Promise<T> {
    // Add JSON instruction to system prompt
    const jsonSystemPrompt = `${options.systemPrompt}

IMPORTANT: You MUST respond with ONLY valid JSON. No markdown code blocks, no explanations before or after the JSON. Just the raw JSON object.`;

    const result = await this.generateText({
      ...options,
      systemPrompt: jsonSystemPrompt,
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
      throw new JSONParseError('claude', result.content);
    }
  }

  /**
   * Main supervision method - reviews and validates an itinerary
   */
  async supervise(options: SupervisionOptions): Promise<SupervisionResult> {
    if (!this.isAvailable()) {
      throw new ProviderNotAvailableError('claude');
    }

    const prompt = options.level === 'quick'
      ? CLAUDE_QUICK_VALIDATION_PROMPT
      : CLAUDE_SUPERVISOR_PROMPT;

    const userPrompt = this.buildSupervisionPrompt(options);

    const response = await this.generateJSON<SupervisionResponse>({
      systemPrompt: prompt,
      userPrompt,
      temperature: 0.3, // Lower temperature for consistent validation
      maxTokens: 3000,
    });

    // Apply auto-corrections if any
    let finalItinerary: GeneratedItinerary | undefined;
    if (response.corrections && Object.keys(response.corrections).length > 0) {
      finalItinerary = this.applyCorrections(options.itinerary, response.corrections);
    }

    return {
      approved: response.approved,
      qualityScore: response.qualityScore,
      issues: response.issues || [],
      suggestions: response.suggestions || [],
      finalItinerary,
      corrections: response.corrections,
    };
  }

  /**
   * Fact-check specific locations
   */
  async factCheck(
    city: string,
    locations: Array<{ name: string; address?: string; category: string }>
  ): Promise<{
    verified: LocationValidationResult[];
    invalid: LocationValidationResult[];
    uncertain: LocationValidationResult[];
  }> {
    if (!this.isAvailable()) {
      throw new ProviderNotAvailableError('claude');
    }

    const locationsText = locations
      .map((loc, i) => `${i + 1}. ${loc.name} (${loc.category})${loc.address ? ` at ${loc.address}` : ''}`)
      .join('\n');

    const userPrompt = CLAUDE_FACT_CHECK_PROMPT.replace('{city}', city).replace(
      '{locations}',
      locationsText
    );

    const response = await this.generateJSON<FactCheckResponse>({
      systemPrompt:
        'You are a fact-checking expert verifying the existence of travel locations.',
      userPrompt,
      temperature: 0.2,
      maxTokens: 2000,
    });

    return {
      verified: response.verified || [],
      invalid: response.invalid || [],
      uncertain: response.uncertain || [],
    };
  }

  private buildSupervisionPrompt(options: SupervisionOptions): string {
    const { itinerary, locationData, verifiedSpots, tier } = options;

    const sections = [
      '## Itinerary to Review',
      '```json',
      JSON.stringify(itinerary, null, 2),
      '```',
      '',
    ];

    if (locationData.length > 0) {
      sections.push('## Location Validation Data (from Gemini)');
      sections.push('```json');
      sections.push(JSON.stringify(locationData, null, 2));
      sections.push('```');
      sections.push('');
    }

    if (verifiedSpots.length > 0) {
      sections.push('## Verified Spots from Database');
      const spotsSummary = verifiedSpots.map((spot) => {
        const name = typeof spot.name === 'object' ? spot.name.en : spot.name;
        return `- ${name} (Score: ${spot.localley_score}/6)`;
      });
      sections.push(spotsSummary.join('\n'));
      sections.push('');
    }

    sections.push(`## Tier Level: ${tier.toUpperCase()}`);
    if (tier === 'premium') {
      sections.push(
        'Perform FULL quality assurance with detailed feedback and suggestions.'
      );
    } else {
      sections.push(
        'Perform BASIC validation focusing on critical issues only.'
      );
    }

    return sections.join('\n');
  }

  private applyCorrections(
    itinerary: GeneratedItinerary,
    corrections: Record<string, unknown>
  ): GeneratedItinerary {
    // Deep clone to avoid mutations
    const corrected = JSON.parse(JSON.stringify(itinerary)) as GeneratedItinerary;

    // Apply corrections if they specify day/activity indices
    if (corrections.activities && Array.isArray(corrections.activities)) {
      for (const correction of corrections.activities) {
        const { dayIndex, activityIndex, ...updates } = correction as {
          dayIndex: number;
          activityIndex: number;
          [key: string]: unknown;
        };

        if (
          corrected.dailyPlans[dayIndex] &&
          corrected.dailyPlans[dayIndex].activities[activityIndex]
        ) {
          Object.assign(
            corrected.dailyPlans[dayIndex].activities[activityIndex],
            updates
          );
        }
      }
    }

    return corrected;
  }
}

// Response type interfaces for JSON parsing
interface SupervisionResponse {
  approved: boolean;
  qualityScore: number;
  issues?: ValidationIssue[];
  suggestions?: RevisionSuggestion[];
  corrections?: Record<string, unknown>;
}

interface FactCheckResponse {
  verified?: LocationValidationResult[];
  invalid?: LocationValidationResult[];
  uncertain?: LocationValidationResult[];
}
