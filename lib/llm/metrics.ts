/**
 * LLM Orchestration Metrics
 *
 * Tracks and reports metrics for the multi-LLM system:
 * - Latency per provider
 * - Success/failure rates
 * - Cache hit rates
 * - Fallback usage
 * - Cost estimation
 */

import type {
  LLMProviderName,
  OrchestrationMetrics,
  TokenUsage,
  UserTier,
} from './types';

// ============================================================================
// Types
// ============================================================================

export interface ProviderMetrics {
  name: LLMProviderName;
  calls: number;
  successes: number;
  failures: number;
  totalLatencyMs: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  totalTokens: TokenUsage;
  estimatedCost: number;
}

export interface OrchestratorMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  cacheHitRate: number;
  fallbackRate: number;
  fallbacksByRoute: Record<string, number>;
  providerMetrics: Record<LLMProviderName, ProviderMetrics>;
  qualityScores: {
    average: number;
    distribution: Record<string, number>;
  };
  tierUsage: Record<UserTier, number>;
  lastUpdated: Date;
}

interface MetricEntry {
  timestamp: number;
  latencyMs: number;
  success: boolean;
  providers: LLMProviderName[];
  cacheHits: number;
  fallbackRoute?: string;
  qualityScore?: number;
  tier: UserTier;
  tokenUsage?: Partial<Record<LLMProviderName, TokenUsage>>;
}

// ============================================================================
// Cost Configuration
// ============================================================================

const COST_PER_1K_TOKENS: Record<LLMProviderName, { input: number; output: number }> = {
  openai: { input: 0.0025, output: 0.01 },
  gemini: { input: 0.000075, output: 0.0003 },
  claude: { input: 0.003, output: 0.015 },
};

// ============================================================================
// Metrics Collector
// ============================================================================

export class MetricsCollector {
  private entries: MetricEntry[] = [];
  private providerLatencies: Record<LLMProviderName, number[]> = {
    openai: [],
    gemini: [],
    claude: [],
  };
  private maxEntries: number;
  private windowMs: number;

  constructor(options?: { maxEntries?: number; windowMs?: number }) {
    this.maxEntries = options?.maxEntries ?? 1000;
    this.windowMs = options?.windowMs ?? 3600000; // 1 hour default
  }

  /**
   * Record a completed orchestration request
   */
  record(
    metrics: OrchestrationMetrics,
    success: boolean,
    tier: UserTier,
    qualityScore?: number
  ): void {
    const entry: MetricEntry = {
      timestamp: Date.now(),
      latencyMs: metrics.totalLatencyMs,
      success,
      providers: metrics.providersUsed,
      cacheHits: metrics.cacheHits,
      fallbackRoute: metrics.fallbackRoute,
      qualityScore,
      tier,
      tokenUsage: metrics.tokenUsage,
    };

    this.entries.push(entry);

    // Record per-provider latencies (approximated from total)
    const perProviderLatency = metrics.totalLatencyMs / metrics.providersUsed.length;
    for (const provider of metrics.providersUsed) {
      this.providerLatencies[provider].push(perProviderLatency);
      // Keep only recent entries
      if (this.providerLatencies[provider].length > this.maxEntries) {
        this.providerLatencies[provider].shift();
      }
    }

    // Prune old entries
    this.prune();
  }

  /**
   * Record a provider-specific call
   */
  recordProviderCall(
    provider: LLMProviderName,
    latencyMs: number,
    success: boolean,
    tokens?: TokenUsage
  ): void {
    this.providerLatencies[provider].push(latencyMs);

    if (this.providerLatencies[provider].length > this.maxEntries) {
      this.providerLatencies[provider].shift();
    }
  }

  /**
   * Get aggregated metrics
   */
  getMetrics(): OrchestratorMetrics {
    this.prune();

    const recentEntries = this.entries;
    const totalRequests = recentEntries.length;
    const successfulRequests = recentEntries.filter(e => e.success).length;
    const failedRequests = totalRequests - successfulRequests;

    // Calculate latencies
    const latencies = recentEntries.map(e => e.latencyMs).sort((a, b) => a - b);
    const averageLatencyMs = latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;
    const p95LatencyMs = latencies.length > 0
      ? latencies[Math.floor(latencies.length * 0.95)] || latencies[latencies.length - 1]
      : 0;

    // Cache hit rate
    const totalCacheHits = recentEntries.reduce((sum, e) => sum + e.cacheHits, 0);
    const cacheHitRate = totalRequests > 0
      ? totalCacheHits / (totalRequests * 3) // Assume max 3 cacheable items per request
      : 0;

    // Fallback rate
    const fallbackEntries = recentEntries.filter(e => e.fallbackRoute);
    const fallbackRate = totalRequests > 0
      ? fallbackEntries.length / totalRequests
      : 0;

    // Fallbacks by route
    const fallbacksByRoute: Record<string, number> = {};
    for (const entry of fallbackEntries) {
      if (entry.fallbackRoute) {
        fallbacksByRoute[entry.fallbackRoute] = (fallbacksByRoute[entry.fallbackRoute] || 0) + 1;
      }
    }

    // Provider metrics
    const providerMetrics: Record<LLMProviderName, ProviderMetrics> = {} as Record<LLMProviderName, ProviderMetrics>;
    for (const provider of ['openai', 'gemini', 'claude'] as LLMProviderName[]) {
      providerMetrics[provider] = this.calculateProviderMetrics(provider, recentEntries);
    }

    // Quality scores
    const qualityEntries = recentEntries.filter(e => e.qualityScore !== undefined);
    const qualityScores = {
      average: qualityEntries.length > 0
        ? qualityEntries.reduce((sum, e) => sum + (e.qualityScore || 0), 0) / qualityEntries.length
        : 0,
      distribution: this.calculateQualityDistribution(qualityEntries),
    };

    // Tier usage
    const tierUsage: Record<UserTier, number> = { free: 0, pro: 0, premium: 0 };
    for (const entry of recentEntries) {
      tierUsage[entry.tier]++;
    }

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      averageLatencyMs: Math.round(averageLatencyMs),
      p95LatencyMs: Math.round(p95LatencyMs),
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      fallbackRate: Math.round(fallbackRate * 100) / 100,
      fallbacksByRoute,
      providerMetrics,
      qualityScores,
      tierUsage,
      lastUpdated: new Date(),
    };
  }

  /**
   * Calculate metrics for a specific provider
   */
  private calculateProviderMetrics(
    provider: LLMProviderName,
    entries: MetricEntry[]
  ): ProviderMetrics {
    const providerEntries = entries.filter(e => e.providers.includes(provider));
    const latencies = this.providerLatencies[provider];

    const sortedLatencies = [...latencies].sort((a, b) => a - b);
    const totalLatency = sortedLatencies.reduce((a, b) => a + b, 0);
    const averageLatency = sortedLatencies.length > 0
      ? totalLatency / sortedLatencies.length
      : 0;
    const p95Latency = sortedLatencies.length > 0
      ? sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || sortedLatencies[sortedLatencies.length - 1]
      : 0;

    // Calculate total tokens
    const totalTokens: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    for (const entry of entries) {
      if (entry.tokenUsage?.[provider]) {
        totalTokens.inputTokens += entry.tokenUsage[provider].inputTokens;
        totalTokens.outputTokens += entry.tokenUsage[provider].outputTokens;
        totalTokens.totalTokens += entry.tokenUsage[provider].totalTokens;
      }
    }

    // Estimate cost
    const costs = COST_PER_1K_TOKENS[provider];
    const estimatedCost =
      (totalTokens.inputTokens / 1000) * costs.input +
      (totalTokens.outputTokens / 1000) * costs.output;

    return {
      name: provider,
      calls: providerEntries.length,
      successes: providerEntries.filter(e => e.success).length,
      failures: providerEntries.filter(e => !e.success).length,
      totalLatencyMs: Math.round(totalLatency),
      averageLatencyMs: Math.round(averageLatency),
      p95LatencyMs: Math.round(p95Latency),
      totalTokens,
      estimatedCost: Math.round(estimatedCost * 100) / 100,
    };
  }

  /**
   * Calculate quality score distribution
   */
  private calculateQualityDistribution(entries: MetricEntry[]): Record<string, number> {
    const distribution: Record<string, number> = {
      'excellent (9-10)': 0,
      'good (7-8)': 0,
      'fair (5-6)': 0,
      'poor (1-4)': 0,
    };

    for (const entry of entries) {
      const score = entry.qualityScore || 0;
      if (score >= 9) distribution['excellent (9-10)']++;
      else if (score >= 7) distribution['good (7-8)']++;
      else if (score >= 5) distribution['fair (5-6)']++;
      else distribution['poor (1-4)']++;
    }

    return distribution;
  }

  /**
   * Remove old entries outside the time window
   */
  private prune(): void {
    const cutoff = Date.now() - this.windowMs;
    this.entries = this.entries.filter(e => e.timestamp > cutoff);

    // Also limit total entries
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.entries = [];
    this.providerLatencies = {
      openai: [],
      gemini: [],
      claude: [],
    };
  }

  /**
   * Export metrics as JSON
   */
  toJSON(): string {
    return JSON.stringify(this.getMetrics(), null, 2);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalCollector: MetricsCollector | null = null;

export function getMetricsCollector(): MetricsCollector {
  if (!globalCollector) {
    globalCollector = new MetricsCollector();
  }
  return globalCollector;
}

// ============================================================================
// Cost Estimator
// ============================================================================

export function estimateCost(
  tokens: Partial<Record<LLMProviderName, TokenUsage>>
): number {
  let total = 0;

  for (const [provider, usage] of Object.entries(tokens)) {
    if (usage) {
      const costs = COST_PER_1K_TOKENS[provider as LLMProviderName];
      if (costs) {
        total += (usage.inputTokens / 1000) * costs.input;
        total += (usage.outputTokens / 1000) * costs.output;
      }
    }
  }

  return Math.round(total * 1000) / 1000; // Round to 3 decimal places
}

/**
 * Estimate cost for a typical orchestration by tier
 */
export function estimateOrchestrationCost(tier: UserTier): number {
  // Typical token usage estimates per request
  const estimates: Record<UserTier, Partial<Record<LLMProviderName, TokenUsage>>> = {
    free: {
      openai: { inputTokens: 500, outputTokens: 2000, totalTokens: 2500 },
    },
    pro: {
      openai: { inputTokens: 500, outputTokens: 2000, totalTokens: 2500 },
      gemini: { inputTokens: 300, outputTokens: 500, totalTokens: 800 },
    },
    premium: {
      openai: { inputTokens: 500, outputTokens: 2000, totalTokens: 2500 },
      gemini: { inputTokens: 300, outputTokens: 500, totalTokens: 800 },
      claude: { inputTokens: 1500, outputTokens: 500, totalTokens: 2000 },
    },
  };

  return estimateCost(estimates[tier]);
}
