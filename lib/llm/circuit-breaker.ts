/**
 * Circuit Breaker Pattern Implementation
 *
 * Prevents cascading failures by temporarily stopping requests to
 * failing services. Automatically recovers when the service stabilizes.
 *
 * States:
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Service is failing, requests are blocked
 * - HALF-OPEN: Testing if service has recovered
 */

import type { CircuitState, CircuitBreakerConfig, CircuitBreakerStatus, LLMProviderName } from './types';
import { circuitBreakerConfig } from './config';

/**
 * Circuit Breaker for a single LLM provider
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures: number = 0;
  private successes: number = 0;
  private lastFailure?: Date;
  private lastSuccess?: Date;
  private halfOpenRequests: number = 0;

  constructor(
    private readonly name: LLMProviderName,
    private readonly config: CircuitBreakerConfig = circuitBreakerConfig
  ) {}

  /**
   * Check if the circuit allows requests
   */
  isAvailable(): boolean {
    switch (this.state) {
      case 'closed':
        return true;

      case 'open':
        // Check if reset time has passed
        if (this.shouldAttemptReset()) {
          this.transitionTo('half-open');
          return true;
        }
        return false;

      case 'half-open':
        // Allow limited requests in half-open state
        return this.halfOpenRequests < this.config.halfOpenRequests;

      default:
        return false;
    }
  }

  /**
   * Record a successful operation
   */
  recordSuccess(): void {
    this.lastSuccess = new Date();
    this.successes++;

    switch (this.state) {
      case 'half-open':
        // Success in half-open means recovery
        this.reset();
        console.log(`[CircuitBreaker:${this.name}] Recovered - transitioning to CLOSED`);
        break;

      case 'closed':
        // Reset failure count on success
        this.failures = 0;
        break;
    }
  }

  /**
   * Record a failed operation
   */
  recordFailure(): void {
    this.lastFailure = new Date();
    this.failures++;

    switch (this.state) {
      case 'closed':
        if (this.failures >= this.config.threshold) {
          this.transitionTo('open');
          console.warn(
            `[CircuitBreaker:${this.name}] OPEN - Too many failures (${this.failures})`
          );
        }
        break;

      case 'half-open':
        // Failure in half-open means still broken
        this.transitionTo('open');
        console.warn(
          `[CircuitBreaker:${this.name}] Recovery failed - back to OPEN`
        );
        break;
    }
  }

  /**
   * Get current status
   */
  getStatus(): CircuitBreakerStatus {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
    };
  }

  /**
   * Get the current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Force the circuit to open (for testing or manual intervention)
   */
  forceOpen(): void {
    this.transitionTo('open');
  }

  /**
   * Force the circuit to close (for testing or manual intervention)
   */
  forceClose(): void {
    this.reset();
  }

  /**
   * Check if we should attempt to reset (transition from open to half-open)
   */
  private shouldAttemptReset(): boolean {
    if (!this.lastFailure) {
      return true;
    }

    const timeSinceFailure = Date.now() - this.lastFailure.getTime();
    return timeSinceFailure >= this.config.resetTimeMs;
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === 'half-open') {
      this.halfOpenRequests = 0;
    }

    if (oldState !== newState) {
      console.log(
        `[CircuitBreaker:${this.name}] State transition: ${oldState} -> ${newState}`
      );
    }
  }

  /**
   * Reset the circuit to initial state
   */
  private reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.halfOpenRequests = 0;
  }
}

/**
 * Circuit Breaker Manager
 *
 * Manages circuit breakers for all LLM providers
 */
export class CircuitBreakerManager {
  private breakers: Map<LLMProviderName, CircuitBreaker> = new Map();

  constructor(config: CircuitBreakerConfig = circuitBreakerConfig) {
    // Initialize breakers for all providers
    const providers: LLMProviderName[] = ['openai', 'gemini', 'claude'];
    for (const provider of providers) {
      this.breakers.set(provider, new CircuitBreaker(provider, config));
    }
  }

  /**
   * Get the circuit breaker for a provider
   */
  get(provider: LLMProviderName): CircuitBreaker {
    const breaker = this.breakers.get(provider);
    if (!breaker) {
      throw new Error(`No circuit breaker for provider: ${provider}`);
    }
    return breaker;
  }

  /**
   * Check if a provider is available
   */
  isAvailable(provider: LLMProviderName): boolean {
    return this.get(provider).isAvailable();
  }

  /**
   * Record success for a provider
   */
  recordSuccess(provider: LLMProviderName): void {
    this.get(provider).recordSuccess();
  }

  /**
   * Record failure for a provider
   */
  recordFailure(provider: LLMProviderName): void {
    this.get(provider).recordFailure();
  }

  /**
   * Get status of all circuit breakers
   */
  getAllStatus(): CircuitBreakerStatus[] {
    return Array.from(this.breakers.values()).map((b) => b.getStatus());
  }

  /**
   * Get list of available providers
   */
  getAvailableProviders(): LLMProviderName[] {
    return Array.from(this.breakers.entries())
      .filter(([, breaker]) => breaker.isAvailable())
      .map(([name]) => name);
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    const breakers = Array.from(this.breakers.values());
    for (const breaker of breakers) {
      breaker.forceClose();
    }
  }
}

/**
 * Execute a function with circuit breaker protection
 */
export async function withCircuitBreaker<T>(
  breaker: CircuitBreaker,
  fn: () => Promise<T>
): Promise<T> {
  if (!breaker.isAvailable()) {
    throw new Error(`Circuit breaker is open for ${breaker.getStatus().name}`);
  }

  try {
    const result = await fn();
    breaker.recordSuccess();
    return result;
  } catch (error) {
    breaker.recordFailure();
    throw error;
  }
}

// Singleton instance for global use
let globalManager: CircuitBreakerManager | null = null;

/**
 * Get the global circuit breaker manager
 */
export function getCircuitBreakerManager(): CircuitBreakerManager {
  if (!globalManager) {
    globalManager = new CircuitBreakerManager();
  }
  return globalManager;
}
