/**
 * Multi-LLM Orchestrator
 *
 * The main coordinator that manages the multi-LLM pipeline:
 * 1. Phase 1 (Parallel): ChatGPT generates, Gemini validates, DB fetches spots
 * 2. Phase 2 (Sequential): Claude supervises and approves
 *
 * Handles tier-based routing, fallbacks, retries, and caching.
 */

import { OpenAIProvider, GeminiProvider, ClaudeProvider } from './providers';
import { CircuitBreakerManager, getCircuitBreakerManager } from './circuit-breaker';
import { LLMCache, getLLMCache, cacheKeys } from './cache';
import { retryWithBackoff } from './retry';
import { getMetricsCollector } from './metrics';
import {
  featureFlags,
  tierLLMConfigs,
  fallbackRoutes,
  retryConfig,
} from './config';
import type {
  OrchestrationRequest,
  OrchestrationResult,
  OrchestrationMetrics,
  ItineraryParams,
  GeneratedItinerary,
  Phase1Results,
  FallbackRoute,
  UserTier,
  LLMProviderName,
  LocationValidationResult,
  VerifiedSpot,
  ValidationReport,
} from './types';
import { createSupabaseAdmin } from '../supabase';

/**
 * Main LLM Orchestrator Class
 */
export class LLMOrchestrator {
  private openai: OpenAIProvider;
  private gemini: GeminiProvider;
  private claude: ClaudeProvider;
  private circuitBreakers: CircuitBreakerManager;
  private cache: LLMCache;

  constructor() {
    this.openai = new OpenAIProvider();
    this.gemini = new GeminiProvider();
    this.claude = new ClaudeProvider();
    this.circuitBreakers = getCircuitBreakerManager();
    this.cache = getLLMCache();
  }

  /**
   * Main entry point for itinerary generation
   */
  async generateItinerary(request: OrchestrationRequest): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const metrics: OrchestrationMetrics = {
      totalLatencyMs: 0,
      providersUsed: [],
      cacheHits: 0,
      retryCount: 0,
    };

    try {
      // Check if multi-LLM is enabled for this tier
      if (!featureFlags.isEnabledForTier(request.tier)) {
        // Fall back to single-LLM (current behavior)
        return this.executeSingleLLM(request, metrics, startTime);
      }

      // Determine the best route based on provider availability
      const route = this.determineRoute(request.tier);
      metrics.fallbackRoute = route !== 'primary' ? route : undefined;

      // Execute the orchestration
      const result = await this.executeRoute(route, request, metrics);

      metrics.totalLatencyMs = Date.now() - startTime;

      // Record metrics
      const metricsCollector = getMetricsCollector();
      metricsCollector.record(metrics, true, request.tier, result.qualityScore ?? undefined);

      return {
        success: true,
        data: result.itinerary,
        qualityScore: result.qualityScore,
        validationReport: result.validationReport,
        fallbackUsed: metrics.fallbackRoute,
        metrics,
      };
    } catch (error) {
      console.error('[Orchestrator] All routes failed:', error);

      // Try emergency fallback
      const result = await this.executeEmergencyFallback(request, error, metrics, startTime);

      // Record metrics (success or failure based on fallback result)
      const metricsCollector = getMetricsCollector();
      metricsCollector.record(result.metrics, result.success, request.tier);

      return result;
    }
  }

  /**
   * Determine the best route based on provider availability and tier
   */
  private determineRoute(tier: UserTier): FallbackRoute {
    const tierConfig = tierLLMConfigs[tier];

    // Check which providers are available
    const openaiAvailable =
      tierConfig.providers.includes('openai') &&
      this.openai.isAvailable() &&
      this.circuitBreakers.isAvailable('openai');

    const geminiAvailable =
      tierConfig.providers.includes('gemini') &&
      this.gemini.isAvailable() &&
      this.circuitBreakers.isAvailable('gemini');

    const claudeAvailable =
      tierConfig.providers.includes('claude') &&
      this.claude.isAvailable() &&
      this.circuitBreakers.isAvailable('claude');

    // Determine best route
    if (openaiAvailable && geminiAvailable && claudeAvailable) {
      return 'primary';
    }

    // Try fallback routes in order of preference
    for (const route of tierConfig.fallbackRoutes) {
      const config = fallbackRoutes[route];
      const allAvailable = config.providers.every((provider) => {
        switch (provider) {
          case 'openai':
            return openaiAvailable;
          case 'gemini':
            return geminiAvailable;
          case 'claude':
            return claudeAvailable;
          default:
            return false;
        }
      });

      if (allAvailable) {
        return route;
      }
    }

    return 'emergency';
  }

  /**
   * Execute the orchestration for a specific route
   */
  private async executeRoute(
    route: FallbackRoute,
    request: OrchestrationRequest,
    metrics: OrchestrationMetrics
  ): Promise<{
    itinerary: GeneratedItinerary;
    qualityScore: number | null;
    validationReport: ValidationReport | null;
  }> {
    const config = fallbackRoutes[route];
    const params = request.params;
    const tierConfig = tierLLMConfigs[request.tier];

    // PHASE 1: Parallel execution
    const phase1Start = Date.now();
    const phase1Results = await this.executePhase1(params, config.providers, metrics);
    metrics.phase1LatencyMs = Date.now() - phase1Start;

    // If no supervision needed, return early
    if (config.skipValidation || tierConfig.claudeSupervision === 'none') {
      return {
        itinerary: phase1Results.itinerary!,
        qualityScore: null,
        validationReport: null,
      };
    }

    // PHASE 2: Claude supervision
    const phase2Start = Date.now();
    const supervisionResult = await this.executePhase2(
      phase1Results,
      params,
      request.tier,
      metrics
    );
    metrics.phase2LatencyMs = Date.now() - phase2Start;

    return supervisionResult;
  }

  /**
   * Phase 1: Parallel execution of ChatGPT, Gemini, and DB
   */
  private async executePhase1(
    params: ItineraryParams,
    providers: LLMProviderName[],
    metrics: OrchestrationMetrics
  ): Promise<Phase1Results> {
    const tasks: Promise<{ type: string; result: unknown }>[] = [];
    const retryOpts = retryConfig.forTier('pro'); // Use pro retry config for phase 1

    // Task 1: Generate itinerary structure
    if (providers.includes('openai') && this.openai.isAvailable()) {
      tasks.push(
        retryWithBackoff(
          () => this.openai.generateItineraryStructure(params),
          {
            ...retryOpts,
            onRetry: () => {
              metrics.retryCount++;
            },
          }
        )
          .then((result) => {
            metrics.providersUsed.push('openai');
            this.circuitBreakers.recordSuccess('openai');
            return { type: 'structure', result };
          })
          .catch((error) => {
            this.circuitBreakers.recordFailure('openai');
            throw error;
          })
      );
    } else if (providers.includes('gemini') && this.gemini.isAvailable()) {
      // Fallback: Use Gemini for structure
      tasks.push(
        retryWithBackoff(
          () => this.gemini.generateItineraryStructure(params),
          {
            ...retryOpts,
            onRetry: () => {
              metrics.retryCount++;
            },
          }
        )
          .then((result) => {
            metrics.providersUsed.push('gemini');
            this.circuitBreakers.recordSuccess('gemini');
            return { type: 'structure', result };
          })
          .catch((error) => {
            this.circuitBreakers.recordFailure('gemini');
            throw error;
          })
      );
    }

    // Task 2: Location validation (if Gemini available)
    if (providers.includes('gemini') && this.gemini.isAvailable()) {
      const cacheKey = cacheKeys.locationValidation(params.city);

      tasks.push(
        this.cache.get<LocationValidationResult[]>(cacheKey).then(async (cached) => {
          if (cached) {
            metrics.cacheHits++;
            return { type: 'locations', result: cached };
          }

          const result = await retryWithBackoff(
            () => this.gemini.validateLocations(params.city),
            { maxRetries: 1 }
          );

          // Cache for 24 hours
          await this.cache.set(cacheKey, result, 86400);
          return { type: 'locations', result };
        })
      );
    }

    // Task 3: Fetch verified spots from database
    tasks.push(this.fetchVerifiedSpots(params.city, params.localnessLevel, metrics));

    // Execute all tasks in parallel
    const results = await Promise.allSettled(tasks);

    // Process results
    const phase1Results: Phase1Results = {
      itinerary: null,
      locationData: [],
      verifiedSpots: [],
    };

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { type, result: data } = result.value;
        switch (type) {
          case 'structure':
            phase1Results.itinerary = data as GeneratedItinerary;
            break;
          case 'locations':
            phase1Results.locationData = data as LocationValidationResult[];
            break;
          case 'spots':
            phase1Results.verifiedSpots = data as VerifiedSpot[];
            break;
        }
      } else {
        console.error('[Orchestrator] Phase 1 task failed:', result.reason);
      }
    }

    // Structure is required
    if (!phase1Results.itinerary) {
      throw new Error('Failed to generate itinerary structure in Phase 1');
    }

    return phase1Results;
  }

  /**
   * Phase 2: Claude supervision and validation
   */
  private async executePhase2(
    phase1Results: Phase1Results,
    params: ItineraryParams,
    tier: UserTier,
    metrics: OrchestrationMetrics
  ): Promise<{
    itinerary: GeneratedItinerary;
    qualityScore: number | null;
    validationReport: ValidationReport | null;
  }> {
    const tierConfig = tierLLMConfigs[tier];
    const supervisionLevel = tierConfig.claudeSupervision === 'full' ? 'full' : 'basic';

    // Check if Claude is available
    if (!this.claude.isAvailable() || !this.circuitBreakers.isAvailable('claude')) {
      // Skip supervision, return Phase 1 result
      console.warn('[Orchestrator] Claude unavailable, skipping supervision');
      return {
        itinerary: phase1Results.itinerary!,
        qualityScore: null,
        validationReport: null,
      };
    }

    try {
      const supervisionResult = await retryWithBackoff(
        () =>
          this.claude.supervise({
            itinerary: phase1Results.itinerary!,
            locationData: phase1Results.locationData,
            verifiedSpots: phase1Results.verifiedSpots,
            tier: tier as 'pro' | 'premium',
            level: supervisionLevel,
          }),
        {
          ...retryConfig.forTier(tier),
          onRetry: () => {
            metrics.retryCount++;
          },
        }
      );

      metrics.providersUsed.push('claude');
      this.circuitBreakers.recordSuccess('claude');

      // Handle revision requests for premium tier
      if (
        !supervisionResult.approved &&
        supervisionResult.suggestions.length > 0 &&
        tier === 'premium'
      ) {
        return this.handleRevisionCycle(
          phase1Results,
          supervisionResult,
          params,
          metrics
        );
      }

      return {
        itinerary: supervisionResult.finalItinerary || phase1Results.itinerary!,
        qualityScore: supervisionResult.qualityScore,
        validationReport: {
          issues: supervisionResult.issues,
          revisionCycles: 0,
          approvedAt: supervisionResult.approved ? new Date() : undefined,
        },
      };
    } catch (error) {
      this.circuitBreakers.recordFailure('claude');
      console.error('[Orchestrator] Claude supervision failed:', error);

      // Return Phase 1 result without supervision
      return {
        itinerary: phase1Results.itinerary!,
        qualityScore: null,
        validationReport: null,
      };
    }
  }

  /**
   * Handle revision cycle when Claude requests changes
   */
  private async handleRevisionCycle(
    phase1Results: Phase1Results,
    supervisionResult: Awaited<ReturnType<ClaudeProvider['supervise']>>,
    params: ItineraryParams,
    metrics: OrchestrationMetrics
  ): Promise<{
    itinerary: GeneratedItinerary;
    qualityScore: number | null;
    validationReport: ValidationReport | null;
  }> {
    let revisedItinerary = phase1Results.itinerary!;

    // Apply targeted revisions
    for (const suggestion of supervisionResult.suggestions) {
      if (suggestion.suggestedAction === 'replace') {
        try {
          const newActivity = await this.openai.generateSingleActivity({
            city: params.city,
            dayTheme: revisedItinerary.dailyPlans[suggestion.dayIndex].theme,
            timeSlot: revisedItinerary.dailyPlans[suggestion.dayIndex]
              .activities[suggestion.activityIndex].type,
            requirements: suggestion.reason,
            excludeNames: [suggestion.currentName],
          });

          revisedItinerary.dailyPlans[suggestion.dayIndex].activities[
            suggestion.activityIndex
          ] = newActivity;
          metrics.retryCount++;
        } catch (error) {
          console.error('[Orchestrator] Activity revision failed:', error);
        }
      }
    }

    // Quick revalidation
    try {
      const revalidation = await this.claude.supervise({
        itinerary: revisedItinerary,
        locationData: phase1Results.locationData,
        verifiedSpots: phase1Results.verifiedSpots,
        tier: 'premium',
        level: 'quick',
      });

      return {
        itinerary: revalidation.finalItinerary || revisedItinerary,
        qualityScore: revalidation.qualityScore,
        validationReport: {
          issues: revalidation.issues,
          revisionCycles: 1,
          approvedAt: revalidation.approved ? new Date() : undefined,
        },
      };
    } catch {
      return {
        itinerary: revisedItinerary,
        qualityScore: supervisionResult.qualityScore,
        validationReport: {
          issues: supervisionResult.issues,
          revisionCycles: 1,
        },
      };
    }
  }

  /**
   * Fetch verified spots from database
   */
  private async fetchVerifiedSpots(
    city: string,
    localnessLevel: number | undefined,
    metrics: OrchestrationMetrics
  ): Promise<{ type: string; result: VerifiedSpot[] }> {
    const cacheKey = cacheKeys.verifiedSpots(city);

    // Check cache
    const cached = await this.cache.get<VerifiedSpot[]>(cacheKey);
    if (cached) {
      metrics.cacheHits++;
      return { type: 'spots', result: cached };
    }

    try {
      const supabase = createSupabaseAdmin();
      const { data } = await supabase
        .from('spots')
        .select('*')
        .ilike('address->>en', `%${city}%`)
        .gte('localley_score', localnessLevel || 3)
        .limit(15);

      const spots = (data || []) as VerifiedSpot[];

      // Cache for 1 hour
      await this.cache.set(cacheKey, spots, 3600);

      return { type: 'spots', result: spots };
    } catch (error) {
      console.error('[Orchestrator] Failed to fetch spots:', error);
      return { type: 'spots', result: [] };
    }
  }

  /**
   * Execute single-LLM mode (current behavior, for backward compatibility)
   */
  private async executeSingleLLM(
    request: OrchestrationRequest,
    metrics: OrchestrationMetrics,
    startTime: number
  ): Promise<OrchestrationResult> {
    try {
      const itinerary = await this.openai.generateItineraryStructure(request.params);
      metrics.providersUsed.push('openai');
      metrics.totalLatencyMs = Date.now() - startTime;

      return {
        success: true,
        data: itinerary,
        qualityScore: null,
        validationReport: null,
        metrics,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        metrics: {
          ...metrics,
          totalLatencyMs: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Emergency fallback when all else fails
   */
  private async executeEmergencyFallback(
    request: OrchestrationRequest,
    originalError: unknown,
    metrics: OrchestrationMetrics,
    startTime: number
  ): Promise<OrchestrationResult> {
    console.warn('[Orchestrator] Executing emergency fallback');
    metrics.fallbackRoute = 'emergency';

    // Try each provider in order
    const providers = [
      { name: 'openai' as const, provider: this.openai },
      { name: 'gemini' as const, provider: this.gemini },
    ];

    for (const { name, provider } of providers) {
      if (provider.isAvailable() && this.circuitBreakers.isAvailable(name)) {
        try {
          const itinerary = await provider.generateItineraryStructure(request.params);
          metrics.providersUsed.push(name);
          metrics.totalLatencyMs = Date.now() - startTime;

          return {
            success: true,
            data: itinerary,
            qualityScore: null,
            validationReport: null,
            fallbackUsed: 'emergency',
            metrics,
          };
        } catch {
          continue;
        }
      }
    }

    // Complete failure
    return {
      success: false,
      error:
        originalError instanceof Error
          ? originalError.message
          : 'All providers failed',
      fallbackUsed: 'emergency',
      metrics: {
        ...metrics,
        totalLatencyMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Get orchestrator health status
   */
  getHealthStatus(): {
    providers: Record<string, boolean>;
    circuitBreakers: Record<string, string>;
    cacheStats: { memorySize: number; redisAvailable: boolean };
  } {
    return {
      providers: {
        openai: this.openai.isAvailable(),
        gemini: this.gemini.isAvailable(),
        claude: this.claude.isAvailable(),
      },
      circuitBreakers: Object.fromEntries(
        this.circuitBreakers.getAllStatus().map((s) => [s.name, s.state])
      ),
      cacheStats: this.cache.getStats(),
    };
  }
}

// Singleton instance
let globalOrchestrator: LLMOrchestrator | null = null;

/**
 * Get the global orchestrator instance
 */
export function getOrchestrator(): LLMOrchestrator {
  if (!globalOrchestrator) {
    globalOrchestrator = new LLMOrchestrator();
  }
  return globalOrchestrator;
}
