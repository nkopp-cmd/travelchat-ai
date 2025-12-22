/**
 * Base LLM Provider Interface
 *
 * All LLM providers (OpenAI, Gemini, Claude) implement this interface
 * to ensure consistent behavior across the orchestration system.
 */

import type {
  LLMProviderName,
  LLMProviderStatus,
  TextGenerationOptions,
  TextGenerationResult,
  ItineraryParams,
  GeneratedItinerary,
  SingleActivityRequest,
  Activity,
  LocationValidationResult,
  SupervisionOptions,
  SupervisionResult,
} from '../types';

/**
 * Base interface that all LLM providers must implement
 */
export interface BaseLLMProvider {
  /** Provider name identifier */
  readonly name: LLMProviderName;

  /**
   * Check if the provider is configured and available
   * (API key present, etc.)
   */
  isAvailable(): boolean;

  /**
   * Perform a health check on the provider
   * Makes a lightweight API call to verify connectivity
   */
  healthCheck(): Promise<boolean>;

  /**
   * Get the current status of the provider
   */
  getStatus(): LLMProviderStatus;
}

/**
 * Provider capable of generating text content
 */
export interface TextGenerationProvider extends BaseLLMProvider {
  /**
   * Generate text based on prompts
   */
  generateText(options: TextGenerationOptions): Promise<TextGenerationResult>;

  /**
   * Generate JSON-structured output
   */
  generateJSON<T>(options: TextGenerationOptions): Promise<T>;
}

/**
 * Provider capable of generating travel itineraries
 */
export interface ItineraryGenerationProvider extends TextGenerationProvider {
  /**
   * Generate a complete itinerary structure
   */
  generateItineraryStructure(params: ItineraryParams): Promise<GeneratedItinerary>;

  /**
   * Generate a single activity for targeted revision
   */
  generateSingleActivity(request: SingleActivityRequest): Promise<Activity>;
}

/**
 * Provider capable of validating locations
 */
export interface LocationValidationProvider extends BaseLLMProvider {
  /**
   * Validate locations in a city
   */
  validateLocations(
    city: string,
    locations?: Array<{ name: string; address?: string; category: string }>
  ): Promise<LocationValidationResult[]>;
}

/**
 * Provider capable of generating images
 */
export interface ImageGenerationProvider extends BaseLLMProvider {
  /**
   * Generate an image based on a prompt
   */
  generateImage(options: {
    prompt: string;
    aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  }): Promise<{ imageBytes: string; mimeType: string }>;
}

/**
 * Provider capable of supervising and validating itineraries
 */
export interface SupervisorProvider extends TextGenerationProvider {
  /**
   * Supervise and validate an itinerary
   */
  supervise(options: SupervisionOptions): Promise<SupervisionResult>;

  /**
   * Perform fact-checking on locations
   */
  factCheck(
    city: string,
    locations: Array<{ name: string; address?: string; category: string }>
  ): Promise<{
    verified: LocationValidationResult[];
    invalid: LocationValidationResult[];
    uncertain: LocationValidationResult[];
  }>;
}

/**
 * Abstract base class with common functionality for all providers
 */
export abstract class AbstractLLMProvider implements BaseLLMProvider {
  abstract readonly name: LLMProviderName;

  protected errorCount: number = 0;
  protected lastHealthCheck?: Date;
  protected isHealthy: boolean = true;

  abstract isAvailable(): boolean;
  abstract healthCheck(): Promise<boolean>;

  getStatus(): LLMProviderStatus {
    return {
      name: this.name,
      available: this.isAvailable(),
      healthy: this.isHealthy,
      lastHealthCheck: this.lastHealthCheck,
      errorCount: this.errorCount,
    };
  }

  /**
   * Record a successful operation
   */
  protected recordSuccess(): void {
    this.errorCount = 0;
    this.isHealthy = true;
  }

  /**
   * Record a failed operation
   */
  protected recordError(): void {
    this.errorCount++;
    if (this.errorCount >= 5) {
      this.isHealthy = false;
    }
  }

  /**
   * Measure operation latency
   */
  protected async measureLatency<T>(
    operation: () => Promise<T>
  ): Promise<{ result: T; latencyMs: number }> {
    const start = Date.now();
    const result = await operation();
    return {
      result,
      latencyMs: Date.now() - start,
    };
  }
}

/**
 * Error thrown when a provider operation fails
 */
export class LLMProviderError extends Error {
  constructor(
    public readonly provider: LLMProviderName,
    message: string,
    public readonly cause?: Error,
    public readonly retryable: boolean = true
  ) {
    super(`[${provider}] ${message}`);
    this.name = 'LLMProviderError';
  }
}

/**
 * Error thrown when a provider is not available
 */
export class ProviderNotAvailableError extends LLMProviderError {
  constructor(provider: LLMProviderName) {
    super(provider, 'Provider is not available or not configured', undefined, false);
    this.name = 'ProviderNotAvailableError';
  }
}

/**
 * Error thrown when rate limited
 */
export class RateLimitError extends LLMProviderError {
  constructor(
    provider: LLMProviderName,
    public readonly retryAfterMs?: number
  ) {
    super(provider, 'Rate limit exceeded', undefined, true);
    this.name = 'RateLimitError';
  }
}

/**
 * Error thrown when JSON parsing fails
 */
export class JSONParseError extends LLMProviderError {
  constructor(
    provider: LLMProviderName,
    public readonly rawContent: string
  ) {
    super(provider, 'Failed to parse JSON response', undefined, true);
    this.name = 'JSONParseError';
  }
}
