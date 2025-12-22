/**
 * Multi-LLM Orchestration System
 *
 * Main entry point for the multi-LLM architecture that coordinates
 * ChatGPT, Gemini, and Claude for itinerary generation.
 *
 * Usage:
 * ```typescript
 * import { getOrchestrator } from '@/lib/llm';
 *
 * const orchestrator = getOrchestrator();
 * const result = await orchestrator.generateItinerary({
 *   type: 'itinerary',
 *   params: { city: 'Tokyo', days: 5 },
 *   tier: 'premium',
 *   userId: 'user123',
 *   requestId: 'req456',
 * });
 * ```
 */

// Main orchestrator
export { LLMOrchestrator, getOrchestrator } from './orchestrator';

// Providers
export {
  OpenAIProvider,
  GeminiProvider,
  ClaudeProvider,
  LLMProviderError,
  ProviderNotAvailableError,
  RateLimitError,
  JSONParseError,
} from './providers';

// Configuration
export {
  featureFlags,
  providerConfig,
  tierLLMConfigs,
  fallbackRoutes,
  retryConfig,
  circuitBreakerConfig,
  cacheConfig,
  getConfigForTier,
  getFallbackConfig,
  shouldUseProvider,
} from './config';

// Utilities
export { retryWithBackoff, retryWithFixedDelay, retryOnce, withTimeout } from './retry';
export {
  CircuitBreaker,
  CircuitBreakerManager,
  getCircuitBreakerManager,
  withCircuitBreaker,
} from './circuit-breaker';
export { LLMCache, getLLMCache, cacheKeys } from './cache';

// Metrics
export {
  MetricsCollector,
  getMetricsCollector,
  estimateCost,
  estimateOrchestrationCost,
} from './metrics';
export type { ProviderMetrics, OrchestratorMetrics } from './metrics';

// Types
export type {
  // Core types
  LLMProviderName,
  LLMProviderStatus,
  TextGenerationOptions,
  TextGenerationResult,
  TokenUsage,
  JSONGenerationOptions,

  // Itinerary types
  ItineraryParams,
  Activity,
  DailyPlan,
  GeneratedItinerary,

  // Orchestration types
  UserTier,
  OrchestrationRequest,
  OrchestrationResult,
  OrchestrationMetrics,

  // Task types
  TaskStatus,
  TaskPriority,
  Task,
  TaskResult,

  // Validation types
  ValidationIssueType,
  ValidationSeverity,
  ValidationIssue,
  ValidationReport,
  RevisionSuggestion,

  // Supervision types
  SupervisionOptions,
  SupervisionResult,

  // Location types
  LocationToVerify,
  LocationValidationResult,
  VerifiedSpot,

  // Fallback types
  FallbackRoute,
  FallbackConfig,

  // Cache types
  CacheEntry,
  CacheOptions,

  // Circuit breaker types
  CircuitState,
  CircuitBreakerConfig,
  CircuitBreakerStatus,

  // Retry types
  RetryOptions,

  // Phase types
  Phase1Results,
  SingleActivityRequest,
} from './types';
