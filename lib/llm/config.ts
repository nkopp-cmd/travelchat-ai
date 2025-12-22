/**
 * Multi-LLM Orchestration Configuration
 *
 * Centralized configuration for the orchestration system including
 * feature flags, tier settings, and provider configurations.
 */

import type { FallbackConfig, FallbackRoute, UserTier } from './types';

// ============================================================================
// Feature Flags
// ============================================================================

export const featureFlags = {
  /**
   * Master switch for multi-LLM orchestration
   */
  get multiLLMEnabled(): boolean {
    return process.env.ENABLE_MULTI_LLM === 'true';
  },

  /**
   * Per-tier enablement
   */
  get multiLLMFreeTier(): boolean {
    return process.env.MULTI_LLM_FREE_TIER === 'true';
  },

  get multiLLMProTier(): boolean {
    return process.env.MULTI_LLM_PRO_TIER === 'true';
  },

  get multiLLMPremiumTier(): boolean {
    return process.env.MULTI_LLM_PREMIUM_TIER === 'true';
  },

  /**
   * Check if multi-LLM is enabled for a specific tier
   */
  isEnabledForTier(tier: UserTier): boolean {
    if (!this.multiLLMEnabled) return false;

    switch (tier) {
      case 'free':
        return this.multiLLMFreeTier;
      case 'pro':
        return this.multiLLMProTier;
      case 'premium':
        return this.multiLLMPremiumTier;
      default:
        return false;
    }
  },
};

// ============================================================================
// Provider Configuration
// ============================================================================

export const providerConfig = {
  openai: {
    model: process.env.OPENAI_MODEL || 'gpt-4o-2024-08-06',
    maxTokens: 3000,
    temperature: 0.8,
  },

  gemini: {
    textModel: 'gemini-2.0-flash',
    imageModel: 'gemini-2.5-flash-image',
    maxTokens: 3000,
    temperature: 0.8,
  },

  claude: {
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
    maxTokens: 4000,
    temperature: 0.3, // Lower for consistent validation
  },
};

// ============================================================================
// Tier Configuration
// ============================================================================

export interface TierLLMConfig {
  providers: ('openai' | 'gemini' | 'claude')[];
  claudeSupervision: 'none' | 'basic' | 'full';
  locationValidation: boolean;
  maxRetries: number;
  fallbackRoutes: FallbackRoute[];
  qualityScoreTarget: number | null;
}

export const tierLLMConfigs: Record<UserTier, TierLLMConfig> = {
  free: {
    providers: ['openai'],
    claudeSupervision: 'none',
    locationValidation: false,
    maxRetries: 1,
    fallbackRoutes: ['emergency'],
    qualityScoreTarget: null,
  },

  pro: {
    providers: ['openai', 'gemini'],
    claudeSupervision: 'basic',
    locationValidation: true,
    maxRetries: 2,
    fallbackRoutes: ['gemini_fallback', 'claude_fallback', 'emergency'],
    qualityScoreTarget: 7,
  },

  premium: {
    providers: ['openai', 'gemini', 'claude'],
    claudeSupervision: 'full',
    locationValidation: true,
    maxRetries: 3,
    fallbackRoutes: [
      'gemini_fallback',
      'claude_fallback',
      'chatgpt_fallback',
      'emergency',
    ],
    qualityScoreTarget: 9,
  },
};

// ============================================================================
// Fallback Route Definitions
// ============================================================================

export const fallbackRoutes: Record<FallbackRoute, FallbackConfig> = {
  primary: {
    route: 'primary',
    providers: ['openai', 'gemini', 'claude'],
    skipValidation: false,
    reducedQuality: false,
    userNotification: '',
  },

  gemini_fallback: {
    route: 'gemini_fallback',
    providers: ['openai', 'claude'],
    skipValidation: false,
    reducedQuality: false,
    userNotification: 'Using alternative validation method',
  },

  claude_fallback: {
    route: 'claude_fallback',
    providers: ['openai', 'gemini'],
    skipValidation: false,
    reducedQuality: true,
    userNotification: 'Quality checks temporarily simplified',
  },

  chatgpt_fallback: {
    route: 'chatgpt_fallback',
    providers: ['gemini', 'claude'],
    skipValidation: false,
    reducedQuality: false,
    userNotification: 'Using alternative generation method',
  },

  emergency: {
    route: 'emergency',
    providers: ['openai'], // Will use whichever is available
    skipValidation: true,
    reducedQuality: true,
    userNotification: 'Some features temporarily unavailable',
  },
};

// ============================================================================
// Retry Configuration
// ============================================================================

export const retryConfig = {
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  exponentialBase: 2,

  /**
   * Get retry config for a tier
   */
  forTier(tier: UserTier) {
    const maxRetries = tierLLMConfigs[tier].maxRetries;
    return {
      maxRetries,
      baseDelayMs: this.baseDelayMs,
      maxDelayMs: this.maxDelayMs,
      exponentialBase: this.exponentialBase,
    };
  },
};

// ============================================================================
// Circuit Breaker Configuration
// ============================================================================

export const circuitBreakerConfig = {
  threshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '5', 10),
  resetTimeMs: parseInt(process.env.CIRCUIT_BREAKER_RESET_MS || '60000', 10),
  halfOpenRequests: 1,
};

// ============================================================================
// Cache Configuration
// ============================================================================

export const cacheConfig = {
  /**
   * TTL for general LLM cache entries
   */
  defaultTTL: parseInt(process.env.LLM_CACHE_TTL || '3600', 10),

  /**
   * TTL for location validation cache (longer since locations don't change often)
   */
  locationsTTL: parseInt(process.env.LLM_CACHE_LOCATIONS_TTL || '86400', 10),

  /**
   * TTL for Claude validation patterns
   */
  validationPatternsTTL: 7200, // 2 hours

  /**
   * Prefix for all LLM cache keys
   */
  keyPrefix: 'llm:',
};

// ============================================================================
// Metrics Configuration
// ============================================================================

export const metricsConfig = {
  /**
   * Whether to track detailed metrics
   */
  enabled: process.env.NODE_ENV === 'production',

  /**
   * Latency thresholds for alerting (ms)
   */
  latencyThresholds: {
    warning: 10000, // 10 seconds
    critical: 20000, // 20 seconds
  },

  /**
   * Quality score thresholds
   */
  qualityThresholds: {
    acceptable: 6,
    good: 8,
    excellent: 9,
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the configuration for a specific tier
 */
export function getConfigForTier(tier: UserTier): TierLLMConfig {
  return tierLLMConfigs[tier];
}

/**
 * Get fallback config for a route
 */
export function getFallbackConfig(route: FallbackRoute): FallbackConfig {
  return fallbackRoutes[route];
}

/**
 * Check if a specific provider should be used for a tier
 */
export function shouldUseProvider(
  tier: UserTier,
  provider: 'openai' | 'gemini' | 'claude'
): boolean {
  return tierLLMConfigs[tier].providers.includes(provider);
}
