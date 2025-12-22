/**
 * Retry Logic with Exponential Backoff
 *
 * Provides robust retry functionality for LLM API calls with:
 * - Exponential backoff with jitter
 * - Configurable retry conditions
 * - Callback hooks for monitoring
 */

import type { RetryOptions } from './types';
import { RateLimitError, LLMProviderError } from './providers/base';

/**
 * Default retry options
 */
const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'onRetry' | 'shouldRetry'>> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  exponentialBase: 2,
};

/**
 * Default function to determine if an error is retryable
 */
function defaultShouldRetry(error: Error): boolean {
  // Always retry rate limit errors
  if (error instanceof RateLimitError) {
    return true;
  }

  // Retry LLMProviderErrors that are marked as retryable
  if (error instanceof LLMProviderError) {
    return error.retryable;
  }

  // Retry network errors
  if (error.message?.includes('ECONNRESET') ||
      error.message?.includes('ETIMEDOUT') ||
      error.message?.includes('ENOTFOUND') ||
      error.message?.includes('socket hang up')) {
    return true;
  }

  // Retry server errors (5xx)
  if (error.message?.includes('500') ||
      error.message?.includes('502') ||
      error.message?.includes('503') ||
      error.message?.includes('504')) {
    return true;
  }

  // Don't retry by default
  return false;
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  exponentialBase: number
): number {
  // Exponential delay
  const exponentialDelay = baseDelayMs * Math.pow(exponentialBase, attempt);

  // Cap at maximum
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  // Add jitter (±30%)
  const jitter = cappedDelay * 0.3 * (Math.random() * 2 - 1);

  return Math.max(0, cappedDelay + jitter);
}

/**
 * Retry a function with exponential backoff
 *
 * @param fn - The async function to retry
 * @param options - Retry configuration options
 * @returns The result of the function
 * @throws The last error if all retries fail
 *
 * @example
 * ```typescript
 * const result = await retryWithBackoff(
 *   () => openai.generateText(prompt),
 *   { maxRetries: 3, onRetry: (attempt) => console.log(`Retry ${attempt}`) }
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = DEFAULT_RETRY_OPTIONS.maxRetries,
    baseDelayMs = DEFAULT_RETRY_OPTIONS.baseDelayMs,
    maxDelayMs = DEFAULT_RETRY_OPTIONS.maxDelayMs,
    exponentialBase = DEFAULT_RETRY_OPTIONS.exponentialBase,
    shouldRetry = defaultShouldRetry,
    onRetry,
  } = options;

  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if we should retry
      if (attempt >= maxRetries || !shouldRetry(lastError)) {
        throw lastError;
      }

      // Calculate delay
      let delay = calculateDelay(attempt, baseDelayMs, maxDelayMs, exponentialBase);

      // If it's a rate limit error with retry-after, use that
      if (lastError instanceof RateLimitError && lastError.retryAfterMs) {
        delay = Math.max(delay, lastError.retryAfterMs);
      }

      // Notify about retry
      onRetry?.(attempt + 1, lastError);

      // Wait before retrying
      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError!;
}

/**
 * Retry with a simple fixed delay (no exponential backoff)
 */
export async function retryWithFixedDelay<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  delayMs: number,
  onRetry?: (attempt: number, error: Error) => void
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt >= maxRetries) {
        throw lastError;
      }

      onRetry?.(attempt + 1, lastError);
      await sleep(delayMs);
    }
  }

  throw lastError!;
}

/**
 * Retry only once after a delay
 */
export async function retryOnce<T>(
  fn: () => Promise<T>,
  delayMs: number = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (firstError) {
    await sleep(delayMs);
    return await fn();
  }
}

/**
 * Execute with timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  timeoutError?: Error
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(timeoutError || new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

/**
 * Retry with timeout per attempt
 */
export async function retryWithTimeout<T>(
  fn: () => Promise<T>,
  options: RetryOptions & { timeoutMs: number }
): Promise<T> {
  const { timeoutMs, ...retryOptions } = options;

  return retryWithBackoff(
    () => withTimeout(fn, timeoutMs),
    retryOptions
  );
}
