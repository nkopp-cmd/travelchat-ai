/**
 * Multi-LLM Orchestration System - Core Types
 *
 * This module defines all shared types and interfaces for the multi-LLM
 * orchestration system that coordinates ChatGPT, Gemini, and Claude.
 */

// ============================================================================
// Provider Types
// ============================================================================

export type LLMProviderName = 'openai' | 'gemini' | 'claude';

export interface LLMProviderStatus {
  name: LLMProviderName;
  available: boolean;
  healthy: boolean;
  lastHealthCheck?: Date;
  errorCount: number;
}

// ============================================================================
// Generation Types
// ============================================================================

export interface TextGenerationOptions {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
}

export interface TextGenerationResult {
  content: string;
  usage: TokenUsage;
  latencyMs: number;
  provider: LLMProviderName;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface JSONGenerationOptions<T = unknown> extends TextGenerationOptions {
  schema?: T;
  responseFormat: 'json';
}

// ============================================================================
// Itinerary Types
// ============================================================================

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

export interface Activity {
  time: string;
  type: 'morning' | 'afternoon' | 'evening';
  name: string;
  address: string;
  description: string;
  category: string;
  localleyScore: number;
  duration: string;
  cost: string;
  thumbnail?: string;
}

export interface DailyPlan {
  day: number;
  theme: string;
  activities: Activity[];
  localTip: string;
  transportTips: string;
}

export interface GeneratedItinerary {
  title: string;
  subtitle: string;
  city: string;
  days: number;
  localScore: number;
  estimatedCost: string;
  highlights: string[];
  dailyPlans: DailyPlan[];
}

// ============================================================================
// Orchestration Types
// ============================================================================

export type UserTier = 'free' | 'pro' | 'premium';

export interface OrchestrationRequest {
  type: 'itinerary' | 'chat' | 'revision';
  params: ItineraryParams;
  tier: UserTier;
  userId: string;
  requestId: string;
}

export interface OrchestrationResult {
  success: boolean;
  data?: GeneratedItinerary;
  qualityScore?: number | null;
  validationReport?: ValidationReport | null;
  fallbackUsed?: string;
  metrics: OrchestrationMetrics;
  error?: string;
}

export interface OrchestrationMetrics {
  totalLatencyMs: number;
  phase1LatencyMs?: number;
  phase2LatencyMs?: number;
  providersUsed: LLMProviderName[];
  cacheHits: number;
  retryCount: number;
  fallbackRoute?: string;
  tokenUsage?: {
    openai?: TokenUsage;
    gemini?: TokenUsage;
    claude?: TokenUsage;
  };
}

// ============================================================================
// Task Types
// ============================================================================

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'retrying';
export type TaskPriority = 'critical' | 'normal' | 'low';

export interface Task<TInput = unknown, TOutput = unknown> {
  id: string;
  type: string;
  provider: LLMProviderName;
  status: TaskStatus;
  priority: TaskPriority;
  input: TInput;
  result?: TOutput;
  error?: Error;
  startedAt?: Date;
  completedAt?: Date;
  retryCount: number;
  maxRetries: number;
}

export interface TaskResult<T = unknown> {
  type: string;
  success: boolean;
  result?: T;
  error?: Error;
  latencyMs: number;
  provider: LLMProviderName;
}

// ============================================================================
// Validation Types
// ============================================================================

export type ValidationIssueType = 'location' | 'time' | 'budget' | 'structure' | 'quality';
export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  type: ValidationIssueType;
  severity: ValidationSeverity;
  dayIndex?: number;
  activityIndex?: number;
  message: string;
  autoFixed: boolean;
  fix?: Partial<Activity>;
}

export interface ValidationReport {
  issues: ValidationIssue[];
  revisionCycles: number;
  approvedAt?: Date;
}

export interface RevisionSuggestion {
  dayIndex: number;
  activityIndex: number;
  currentName: string;
  suggestedAction: 'replace' | 'modify' | 'remove';
  reason: string;
  replacement?: Partial<Activity>;
}

// ============================================================================
// Supervision Types
// ============================================================================

export interface SupervisionOptions {
  itinerary: GeneratedItinerary;
  locationData: LocationValidationResult[];
  verifiedSpots: VerifiedSpot[];
  tier: 'pro' | 'premium';
  level?: 'basic' | 'full' | 'quick';
}

export interface SupervisionResult {
  approved: boolean;
  qualityScore: number;
  issues: ValidationIssue[];
  suggestions: RevisionSuggestion[];
  finalItinerary?: GeneratedItinerary;
  corrections?: Record<string, unknown>;
}

// ============================================================================
// Location Validation Types
// ============================================================================

export interface LocationToVerify {
  name: string;
  address?: string;
  category: string;
  dayIndex: number;
  activityIndex: number;
}

export interface LocationValidationResult {
  name: string;
  status: 'verified' | 'invalid' | 'uncertain';
  confidence: number;
  googlePlaceId?: string;
  correctedAddress?: string;
  correctedName?: string;
  openingHours?: string[];
  reason?: string;
  possibleMatches?: string[];
}

export interface VerifiedSpot {
  id: string;
  name: string | { en: string; [key: string]: string };
  description: string | { en: string; [key: string]: string };
  address: string | { en: string; [key: string]: string };
  localley_score: number;
  category?: string;
  verified?: boolean;
}

// ============================================================================
// Fallback Types
// ============================================================================

export type FallbackRoute =
  | 'primary'
  | 'gemini_fallback'
  | 'claude_fallback'
  | 'chatgpt_fallback'
  | 'emergency';

export interface FallbackConfig {
  route: FallbackRoute;
  providers: LLMProviderName[];
  skipValidation: boolean;
  reducedQuality: boolean;
  userNotification: string;
}

// ============================================================================
// Cache Types
// ============================================================================

export interface CacheEntry<T = unknown> {
  value: T;
  expires: number;
  createdAt: number;
}

export interface CacheOptions {
  ttlSeconds: number;
  prefix?: string;
}

// ============================================================================
// Circuit Breaker Types
// ============================================================================

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  threshold: number;
  resetTimeMs: number;
  halfOpenRequests: number;
}

export interface CircuitBreakerStatus {
  name: string;
  state: CircuitState;
  failures: number;
  lastFailure?: Date;
  lastSuccess?: Date;
}

// ============================================================================
// Retry Types
// ============================================================================

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  exponentialBase?: number;
  shouldRetry?: (error: Error) => boolean;
  onRetry?: (attempt: number, error: Error) => void;
}

// ============================================================================
// Phase 1 Results (Parallel Execution)
// ============================================================================

export interface Phase1Results {
  itinerary: GeneratedItinerary | null;
  locationData: LocationValidationResult[];
  verifiedSpots: VerifiedSpot[];
  images?: Map<string, string>;
}

// ============================================================================
// Single Activity Generation (for targeted revisions)
// ============================================================================

export interface SingleActivityRequest {
  city: string;
  dayTheme: string;
  timeSlot: 'morning' | 'afternoon' | 'evening';
  requirements: string;
  excludeNames: string[];
  category?: string;
}
