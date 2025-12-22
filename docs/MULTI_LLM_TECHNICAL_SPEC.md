# Multi-LLM Technical Specification

## Core Interfaces

### Provider Interface

```typescript
// lib/llm/providers/base.ts

export interface LLMProvider {
  name: 'openai' | 'gemini' | 'claude';
  isAvailable(): boolean;
  healthCheck(): Promise<boolean>;
}

export interface TextGenerationProvider extends LLMProvider {
  generateText(options: TextGenerationOptions): Promise<TextGenerationResult>;
  generateJSON<T>(options: JSONGenerationOptions): Promise<T>;
}

export interface ImageGenerationProvider extends LLMProvider {
  generateImage(options: ImageGenerationOptions): Promise<GeneratedImage>;
}

export interface SupervisorProvider extends LLMProvider {
  supervise(options: SupervisionOptions): Promise<SupervisionResult>;
  factCheck(options: FactCheckOptions): Promise<FactCheckResult>;
}

export interface TextGenerationOptions {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
}

export interface TextGenerationResult {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  latencyMs: number;
}

export interface JSONGenerationOptions extends TextGenerationOptions {
  schema?: object;  // For structured output validation
}
```

### Orchestrator Types

```typescript
// lib/llm/types.ts

export interface OrchestrationRequest {
  type: 'itinerary' | 'chat' | 'revision';
  params: ItineraryParams | ChatParams | RevisionParams;
  tier: 'free' | 'pro' | 'premium';
  userId: string;
  requestId: string;
}

export interface OrchestrationResult {
  success: boolean;
  data?: GeneratedItinerary;
  qualityScore?: number;
  validationReport?: ValidationReport;
  fallbackUsed?: string;
  metrics: OrchestrationMetrics;
}

export interface OrchestrationMetrics {
  totalLatencyMs: number;
  phase1LatencyMs: number;  // Parallel tasks
  phase2LatencyMs: number;  // Claude supervision
  providersUsed: string[];
  cacheHits: number;
  retryCount: number;
  fallbackRoute?: string;
}

export interface ItineraryParams {
  city: string;
  days: number;
  interests?: string[];
  budget?: string;
  localnessLevel?: number;
  pace?: string;
  groupType?: string;
  templatePrompt?: string;
}

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'retrying';

export interface Task<T = unknown> {
  id: string;
  type: string;
  provider: string;
  status: TaskStatus;
  priority: 'critical' | 'normal' | 'low';
  input: unknown;
  result?: T;
  error?: Error;
  startedAt?: Date;
  completedAt?: Date;
  retryCount: number;
  maxRetries: number;
}
```

### Supervisor Types

```typescript
// lib/llm/supervisor/types.ts

export interface SupervisionOptions {
  itinerary: GeneratedItinerary;
  locationData: LocationValidationResult[];
  verifiedSpots: Spot[];
  tier: 'pro' | 'premium';
}

export interface SupervisionResult {
  approved: boolean;
  qualityScore: number;  // 1-10
  issues: ValidationIssue[];
  suggestions: RevisionSuggestion[];
  finalItinerary?: GeneratedItinerary;  // Modified if corrections made
}

export interface ValidationIssue {
  type: 'location' | 'time' | 'budget' | 'structure' | 'quality';
  severity: 'error' | 'warning' | 'info';
  dayIndex?: number;
  activityIndex?: number;
  message: string;
  autoFixed: boolean;
}

export interface RevisionSuggestion {
  dayIndex: number;
  activityIndex: number;
  currentName: string;
  suggestedAction: 'replace' | 'modify' | 'remove';
  reason: string;
  replacement?: Partial<Activity>;
}

export interface FactCheckOptions {
  locations: LocationToVerify[];
  city: string;
}

export interface FactCheckResult {
  verified: VerifiedLocation[];
  invalid: InvalidLocation[];
  uncertain: UncertainLocation[];
}

export interface LocationToVerify {
  name: string;
  address?: string;
  category: string;
  dayIndex: number;
  activityIndex: number;
}

export interface VerifiedLocation extends LocationToVerify {
  confidence: number;  // 0-1
  googlePlaceId?: string;
  correctedAddress?: string;
  openingHours?: string[];
}

export interface InvalidLocation extends LocationToVerify {
  reason: string;
  suggestion?: string;
}

export interface UncertainLocation extends LocationToVerify {
  confidence: number;
  possibleMatches: string[];
}
```

### Fallback Types

```typescript
// lib/llm/fallback.ts

export type FallbackRoute =
  | 'primary'           // Full orchestration
  | 'gemini_fallback'   // ChatGPT → Claude (skip Gemini)
  | 'claude_fallback'   // ChatGPT → Gemini → Rules
  | 'chatgpt_fallback'  // Gemini → Claude
  | 'emergency';        // Single LLM + DB spots

export interface FallbackConfig {
  route: FallbackRoute;
  providers: string[];
  skipValidation: boolean;
  reducedQuality: boolean;
  userNotification: string;
}

export const FALLBACK_ROUTES: Record<FallbackRoute, FallbackConfig> = {
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
    providers: ['openai'],  // or whichever is available
    skipValidation: true,
    reducedQuality: true,
    userNotification: 'Some features temporarily unavailable',
  },
};
```

---

## Core Implementation

### Orchestrator

```typescript
// lib/llm/orchestrator.ts

import { OpenAIProvider } from './providers/openai';
import { GeminiProvider } from './providers/gemini';
import { ClaudeProvider } from './providers/claude';
import { TaskExecutor } from './tasks/executor';
import { ClaudeSupervisor } from './supervisor';
import { LLMCache } from './cache';
import { CircuitBreaker } from './circuit-breaker';
import { retryWithBackoff } from './retry';
import { FALLBACK_ROUTES, type FallbackRoute } from './fallback';

export class LLMOrchestrator {
  private openai: OpenAIProvider;
  private gemini: GeminiProvider;
  private claude: ClaudeProvider;
  private executor: TaskExecutor;
  private supervisor: ClaudeSupervisor;
  private cache: LLMCache;
  private circuitBreakers: Map<string, CircuitBreaker>;

  constructor() {
    this.openai = new OpenAIProvider();
    this.gemini = new GeminiProvider();
    this.claude = new ClaudeProvider();
    this.executor = new TaskExecutor();
    this.supervisor = new ClaudeSupervisor(this.claude);
    this.cache = new LLMCache();
    this.circuitBreakers = new Map([
      ['openai', new CircuitBreaker('openai')],
      ['gemini', new CircuitBreaker('gemini')],
      ['claude', new CircuitBreaker('claude')],
    ]);
  }

  async generateItinerary(
    request: OrchestrationRequest
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const metrics: Partial<OrchestrationMetrics> = {
      providersUsed: [],
      cacheHits: 0,
      retryCount: 0,
    };

    try {
      // Determine route based on tier and provider availability
      const route = await this.determineRoute(request.tier);
      metrics.fallbackRoute = route !== 'primary' ? route : undefined;

      // Execute based on route
      const result = await this.executeRoute(route, request, metrics);

      return {
        success: true,
        data: result.itinerary,
        qualityScore: result.qualityScore,
        validationReport: result.validationReport,
        fallbackUsed: metrics.fallbackRoute,
        metrics: {
          ...metrics,
          totalLatencyMs: Date.now() - startTime,
        } as OrchestrationMetrics,
      };
    } catch (error) {
      // All retries exhausted, try emergency fallback
      return this.executeEmergencyFallback(request, error, metrics, startTime);
    }
  }

  private async determineRoute(tier: string): Promise<FallbackRoute> {
    // Check circuit breakers
    const openaiAvailable = this.circuitBreakers.get('openai')!.isAvailable();
    const geminiAvailable = this.circuitBreakers.get('gemini')!.isAvailable();
    const claudeAvailable = this.circuitBreakers.get('claude')!.isAvailable();

    // Tier-based routing
    if (tier === 'free') {
      return openaiAvailable ? 'primary' : 'emergency';
    }

    // Determine best available route
    if (openaiAvailable && geminiAvailable && claudeAvailable) {
      return 'primary';
    } else if (openaiAvailable && claudeAvailable) {
      return 'gemini_fallback';
    } else if (openaiAvailable && geminiAvailable) {
      return 'claude_fallback';
    } else if (geminiAvailable && claudeAvailable) {
      return 'chatgpt_fallback';
    } else {
      return 'emergency';
    }
  }

  private async executeRoute(
    route: FallbackRoute,
    request: OrchestrationRequest,
    metrics: Partial<OrchestrationMetrics>
  ) {
    const config = FALLBACK_ROUTES[route];
    const params = request.params as ItineraryParams;

    // PHASE 1: Parallel execution
    const phase1Start = Date.now();
    const phase1Results = await this.executePhase1(params, config, metrics);
    metrics.phase1LatencyMs = Date.now() - phase1Start;

    // For free tier, skip Phase 2
    if (request.tier === 'free' || config.skipValidation) {
      return {
        itinerary: phase1Results.itinerary,
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

  private async executePhase1(
    params: ItineraryParams,
    config: FallbackConfig,
    metrics: Partial<OrchestrationMetrics>
  ) {
    const tasks = [];

    // Always try ChatGPT for structure (or fallback)
    if (config.providers.includes('openai')) {
      tasks.push(
        retryWithBackoff(
          () => this.openai.generateItineraryStructure(params),
          { maxRetries: 2, onRetry: () => metrics.retryCount!++ }
        ).then(result => {
          metrics.providersUsed!.push('openai');
          return { type: 'structure', result };
        })
      );
    } else if (config.providers.includes('gemini')) {
      // Fallback: Use Gemini for structure
      tasks.push(
        retryWithBackoff(
          () => this.gemini.generateItineraryStructure(params),
          { maxRetries: 2, onRetry: () => metrics.retryCount!++ }
        ).then(result => {
          metrics.providersUsed!.push('gemini');
          return { type: 'structure', result };
        })
      );
    }

    // Location validation (if available)
    if (config.providers.includes('gemini')) {
      // Check cache first
      const cacheKey = `locations:${params.city}`;
      const cached = await this.cache.get(cacheKey);

      if (cached) {
        metrics.cacheHits!++;
        tasks.push(Promise.resolve({ type: 'locations', result: cached }));
      } else {
        tasks.push(
          retryWithBackoff(
            () => this.gemini.validateLocations(params.city),
            { maxRetries: 2, onRetry: () => metrics.retryCount!++ }
          ).then(async result => {
            await this.cache.set(cacheKey, result, 86400); // Cache for 24h
            metrics.providersUsed!.push('gemini');
            return { type: 'locations', result };
          })
        );
      }
    }

    // Fetch verified spots from database
    tasks.push(
      this.fetchVerifiedSpots(params.city, params.localnessLevel)
        .then(result => ({ type: 'spots', result }))
    );

    // Execute all in parallel with settled promise
    const results = await Promise.allSettled(tasks);

    // Process results
    const phase1Results = {
      itinerary: null as GeneratedItinerary | null,
      locationData: [] as LocationValidationResult[],
      verifiedSpots: [] as Spot[],
    };

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { type, result: data } = result.value;
        switch (type) {
          case 'structure':
            phase1Results.itinerary = data;
            break;
          case 'locations':
            phase1Results.locationData = data;
            break;
          case 'spots':
            phase1Results.verifiedSpots = data;
            break;
        }
      }
    }

    // Structure is required
    if (!phase1Results.itinerary) {
      throw new Error('Failed to generate itinerary structure');
    }

    return phase1Results;
  }

  private async executePhase2(
    phase1Results: Phase1Results,
    params: ItineraryParams,
    tier: string,
    metrics: Partial<OrchestrationMetrics>
  ) {
    const supervisionLevel = tier === 'premium' ? 'full' : 'basic';

    const result = await retryWithBackoff(
      () => this.supervisor.supervise({
        itinerary: phase1Results.itinerary!,
        locationData: phase1Results.locationData,
        verifiedSpots: phase1Results.verifiedSpots,
        tier: tier as 'pro' | 'premium',
        level: supervisionLevel,
      }),
      { maxRetries: tier === 'premium' ? 3 : 2 }
    );

    metrics.providersUsed!.push('claude');

    // Handle revision requests
    if (!result.approved && result.suggestions.length > 0 && tier === 'premium') {
      // Request targeted regeneration
      const revisedItinerary = await this.handleRevisionRequest(
        phase1Results.itinerary!,
        result.suggestions,
        params,
        metrics
      );

      // Re-validate
      const revalidation = await this.supervisor.supervise({
        itinerary: revisedItinerary,
        locationData: phase1Results.locationData,
        verifiedSpots: phase1Results.verifiedSpots,
        tier: 'premium',
        level: 'quick',  // Just verify fixes
      });

      return {
        itinerary: revalidation.finalItinerary || revisedItinerary,
        qualityScore: revalidation.qualityScore,
        validationReport: {
          issues: revalidation.issues,
          revisionCycles: 1,
        },
      };
    }

    return {
      itinerary: result.finalItinerary || phase1Results.itinerary!,
      qualityScore: result.qualityScore,
      validationReport: {
        issues: result.issues,
        revisionCycles: 0,
      },
    };
  }

  private async handleRevisionRequest(
    itinerary: GeneratedItinerary,
    suggestions: RevisionSuggestion[],
    params: ItineraryParams,
    metrics: Partial<OrchestrationMetrics>
  ): Promise<GeneratedItinerary> {
    // Only revise specific activities, not the whole itinerary
    const revisedItinerary = { ...itinerary };

    for (const suggestion of suggestions) {
      if (suggestion.suggestedAction === 'replace') {
        const newActivity = await this.openai.generateSingleActivity({
          city: params.city,
          dayTheme: itinerary.dailyPlans[suggestion.dayIndex].theme,
          timeSlot: itinerary.dailyPlans[suggestion.dayIndex]
            .activities[suggestion.activityIndex].type,
          requirements: suggestion.reason,
          excludeNames: [suggestion.currentName],
        });

        revisedItinerary.dailyPlans[suggestion.dayIndex]
          .activities[suggestion.activityIndex] = newActivity;
      }
    }

    metrics.retryCount!++;
    return revisedItinerary;
  }

  private async executeEmergencyFallback(
    request: OrchestrationRequest,
    originalError: unknown,
    metrics: Partial<OrchestrationMetrics>,
    startTime: number
  ): Promise<OrchestrationResult> {
    console.error('Executing emergency fallback:', originalError);

    const params = request.params as ItineraryParams;

    // Try any available provider
    const providers = [this.openai, this.gemini];

    for (const provider of providers) {
      try {
        if (provider.isAvailable()) {
          const itinerary = await provider.generateItineraryStructure(params);

          return {
            success: true,
            data: itinerary,
            qualityScore: null,
            validationReport: null,
            fallbackUsed: 'emergency',
            metrics: {
              ...metrics,
              totalLatencyMs: Date.now() - startTime,
              fallbackRoute: 'emergency',
            } as OrchestrationMetrics,
          };
        }
      } catch (e) {
        continue;
      }
    }

    // Complete failure
    return {
      success: false,
      metrics: {
        ...metrics,
        totalLatencyMs: Date.now() - startTime,
        fallbackRoute: 'emergency',
      } as OrchestrationMetrics,
    };
  }

  private async fetchVerifiedSpots(
    city: string,
    localnessLevel?: number
  ): Promise<Spot[]> {
    // Implementation using Supabase
    const supabase = createSupabaseAdmin();
    const { data } = await supabase
      .from('spots')
      .select('*')
      .ilike('address->>en', `%${city}%`)
      .gte('localley_score', localnessLevel || 3)
      .limit(15);

    return data || [];
  }
}
```

---

## Claude Supervisor Prompts

```typescript
// lib/llm/supervisor/prompts.ts

export const SUPERVISOR_SYSTEM_PROMPT = `
You are a senior travel expert and quality assurance specialist. Your role is to review AI-generated travel itineraries and ensure they meet high quality standards.

You will receive:
1. A generated itinerary from another AI
2. Location validation data from Google
3. A list of verified local spots in the database

Your tasks:
1. VERIFY all locations actually exist and are real businesses/places
2. CHECK that timing is realistic (travel time between locations, opening hours)
3. VALIDATE budget estimates are accurate for the area
4. ENSURE no generic or placeholder names (like "Location", "Breakfast spot")
5. CONFIRM activities match the requested preferences
6. IDENTIFY any logical issues (e.g., visiting a night market at 9 AM)

For each issue found, categorize it as:
- ERROR: Must be fixed (fake location, impossible timing)
- WARNING: Should be fixed (slightly inaccurate, suboptimal)
- INFO: Minor suggestion (could be better)

Return your assessment in this JSON format:
{
  "approved": boolean,
  "qualityScore": number (1-10),
  "issues": [
    {
      "type": "location|time|budget|structure|quality",
      "severity": "error|warning|info",
      "dayIndex": number,
      "activityIndex": number,
      "message": "description of issue",
      "autoFixed": boolean,
      "fix": { optional fix details }
    }
  ],
  "suggestions": [
    {
      "dayIndex": number,
      "activityIndex": number,
      "currentName": "current activity name",
      "suggestedAction": "replace|modify|remove",
      "reason": "why this should change",
      "replacement": { optional replacement activity }
    }
  ],
  "corrections": {
    // Any auto-corrections you made to the itinerary
  }
}

Quality Score Guidelines:
- 10: Perfect, no issues
- 8-9: Excellent, minor suggestions only
- 6-7: Good, some warnings but usable
- 4-5: Fair, has errors that should be fixed
- 1-3: Poor, major issues, should be regenerated
`;

export const FACT_CHECK_PROMPT = `
You are verifying whether these locations exist in {city}. For each location, determine:
1. Does this place actually exist?
2. Is the name spelled correctly?
3. Is the category accurate?
4. Is the address correct or close?

If you're uncertain, say so. Only mark as "invalid" if you're confident the place doesn't exist.

Locations to verify:
{locations}

Return JSON:
{
  "verified": [...],
  "invalid": [...],
  "uncertain": [...]
}
`;
```

---

## Retry Logic

```typescript
// lib/llm/retry.ts

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  exponentialBase?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const {
    maxRetries,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    exponentialBase = 2,
    onRetry,
  } = options;

  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries) {
        const delay = Math.min(
          baseDelayMs * Math.pow(exponentialBase, attempt),
          maxDelayMs
        );

        // Add jitter to prevent thundering herd
        const jitter = Math.random() * 0.3 * delay;

        onRetry?.(attempt + 1, lastError);
        await sleep(delay + jitter);
      }
    }
  }

  throw lastError!;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

## Circuit Breaker

```typescript
// lib/llm/circuit-breaker.ts

export class CircuitBreaker {
  private failures: number = 0;
  private lastFailure: Date | null = null;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private name: string,
    private threshold: number = 5,
    private resetTimeMs: number = 60000
  ) {}

  isAvailable(): boolean {
    if (this.state === 'closed') return true;

    if (this.state === 'open') {
      // Check if reset time has passed
      if (this.lastFailure &&
          Date.now() - this.lastFailure.getTime() > this.resetTimeMs) {
        this.state = 'half-open';
        return true;
      }
      return false;
    }

    // half-open: allow one request through
    return true;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailure = new Date();

    if (this.failures >= this.threshold) {
      this.state = 'open';
      console.warn(`Circuit breaker OPEN for ${this.name}`);
    }
  }

  getState(): string {
    return this.state;
  }
}
```

---

## Caching Layer

```typescript
// lib/llm/cache.ts

import { Redis } from '@upstash/redis';

export class LLMCache {
  private redis: Redis | null;
  private memoryCache: Map<string, { value: unknown; expires: number }>;

  constructor() {
    // Try Redis, fallback to memory
    try {
      if (process.env.UPSTASH_REDIS_REST_URL) {
        this.redis = new Redis({
          url: process.env.UPSTASH_REDIS_REST_URL,
          token: process.env.UPSTASH_REDIS_REST_TOKEN!,
        });
      }
    } catch {
      this.redis = null;
    }

    this.memoryCache = new Map();
  }

  async get<T>(key: string): Promise<T | null> {
    const prefixedKey = `llm:${key}`;

    if (this.redis) {
      try {
        return await this.redis.get(prefixedKey);
      } catch {
        // Fallback to memory
      }
    }

    const cached = this.memoryCache.get(prefixedKey);
    if (cached && cached.expires > Date.now()) {
      return cached.value as T;
    }

    return null;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const prefixedKey = `llm:${key}`;

    if (this.redis) {
      try {
        await this.redis.setex(prefixedKey, ttlSeconds, value);
        return;
      } catch {
        // Fallback to memory
      }
    }

    this.memoryCache.set(prefixedKey, {
      value,
      expires: Date.now() + ttlSeconds * 1000,
    });
  }

  async invalidate(pattern: string): Promise<void> {
    // Memory cache cleanup
    for (const key of this.memoryCache.keys()) {
      if (key.includes(pattern)) {
        this.memoryCache.delete(key);
      }
    }

    // Redis cleanup would require SCAN, implement if needed
  }
}
```

---

## API Endpoint (V2)

```typescript
// app/api/itineraries/generate-v2/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from '@clerk/nextjs/server';
import { LLMOrchestrator } from '@/lib/llm/orchestrator';
import { generateItinerarySchema, validateBody } from '@/lib/validations';
import { checkAndTrackUsage, trackSuccessfulUsage } from '@/lib/usage-tracking';
import { getUserTier } from '@/lib/subscription';

const orchestrator = new LLMOrchestrator();

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

    // Check feature flag
    if (process.env.ENABLE_MULTI_LLM !== 'true') {
      // Redirect to v1 endpoint
      return NextResponse.redirect(new URL('/api/itineraries/generate', req.url));
    }

    // Get user tier
    const tier = await getUserTier(userId);

    // Check tier-specific feature flag
    const tierFlag = `MULTI_LLM_${tier.toUpperCase()}_TIER`;
    if (process.env[tierFlag] !== 'true') {
      // Use v1 for this tier
      return NextResponse.redirect(new URL('/api/itineraries/generate', req.url));
    }

    // Check usage limits
    const { allowed, usage, tier: userTier } = await checkAndTrackUsage(
      userId,
      "itineraries_created"
    );

    if (!allowed) {
      return NextResponse.json({
        error: "limit_exceeded",
        message: `You've reached your limit of ${usage.limit} itineraries this month.`,
        usage,
      }, { status: 429 });
    }

    // Validate request body
    const validation = await validateBody(req, generateItinerarySchema);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Execute orchestrated generation
    const result = await orchestrator.generateItinerary({
      type: 'itinerary',
      params: validation.data,
      tier: userTier,
      userId,
      requestId: crypto.randomUUID(),
    });

    if (!result.success || !result.data) {
      return NextResponse.json({
        error: 'Failed to generate itinerary. Please try again.',
        fallbackUsed: result.fallbackUsed,
      }, { status: 500 });
    }

    // Save to database (same as v1)
    const savedItinerary = await saveItinerary(userId, result.data, validation.data);

    // Track successful usage
    await trackSuccessfulUsage(userId, "itineraries_created");

    return NextResponse.json({
      success: true,
      itinerary: {
        id: savedItinerary?.id,
        ...result.data,
      },
      meta: {
        qualityScore: result.qualityScore,
        validationReport: result.validationReport,
        fallbackUsed: result.fallbackUsed,
        metrics: result.metrics,
      },
    });
  } catch (error) {
    console.error("Error generating itinerary (v2):", error);
    return NextResponse.json(
      { error: "Failed to generate itinerary. Please try again." },
      { status: 500 }
    );
  }
}
```

---

*Technical Specification Version: 1.0*
