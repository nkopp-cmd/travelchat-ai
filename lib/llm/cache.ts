/**
 * LLM Caching Layer
 *
 * Provides caching for LLM responses to reduce costs and latency.
 * Uses Redis when available, falls back to in-memory cache.
 *
 * Cache strategies:
 * - Location validation: Long TTL (24h) - locations don't change often
 * - Claude validation patterns: Medium TTL (2h) - for similar itineraries
 * - General responses: Short TTL (1h) - for exact same requests
 */

import type { CacheEntry, CacheOptions } from './types';
import { cacheConfig } from './config';

/**
 * In-memory cache implementation
 */
class MemoryCache {
  private cache: Map<string, CacheEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check expiration
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const entry: CacheEntry<T> = {
      value,
      expires: Date.now() + ttlSeconds * 1000,
      createdAt: Date.now(),
    };

    this.cache.set(key, entry);
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async has(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async keys(pattern?: string): Promise<string[]> {
    const allKeys = Array.from(this.cache.keys());
    if (!pattern) return allKeys;

    // Simple pattern matching (supports * wildcard)
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return allKeys.filter((key) => regex.test(key));
  }

  private cleanup(): void {
    const now = Date.now();
    const entries = Array.from(this.cache.entries());
    for (const [key, entry] of entries) {
      if (now > entry.expires) {
        this.cache.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * Redis cache implementation (optional)
 */
class RedisCache {
  private client: {
    get: (key: string) => Promise<string | null>;
    setex: (key: string, ttl: number, value: string) => Promise<void>;
    del: (key: string) => Promise<void>;
    exists: (key: string) => Promise<number>;
    keys: (pattern: string) => Promise<string[]>;
  } | null = null;

  constructor() {
    this.initializeClient();
  }

  private async initializeClient(): Promise<void> {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      console.log('[LLMCache] Redis not configured, using memory cache');
      return;
    }

    try {
      // Dynamic import to avoid build issues if @upstash/redis is not installed
      const { Redis } = await import('@upstash/redis');
      this.client = new Redis({ url, token }) as unknown as typeof this.client;
      console.log('[LLMCache] Redis client initialized');
    } catch {
      console.log('[LLMCache] Redis initialization failed, using memory cache');
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.client) return null;

    try {
      const value = await this.client.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<boolean> {
    if (!this.client) return false;

    try {
      await this.client.setex(key, ttlSeconds, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    if (!this.client) return false;

    try {
      await this.client.del(key);
      return true;
    } catch {
      return false;
    }
  }

  async has(key: string): Promise<boolean> {
    if (!this.client) return false;

    try {
      const exists = await this.client.exists(key);
      return exists > 0;
    } catch {
      return false;
    }
  }

  async keys(pattern: string): Promise<string[]> {
    if (!this.client) return [];

    try {
      return await this.client.keys(pattern);
    } catch {
      return [];
    }
  }
}

/**
 * Main LLM Cache class
 *
 * Combines Redis (when available) with memory cache fallback.
 */
export class LLMCache {
  private memory: MemoryCache;
  private redis: RedisCache;
  private prefix: string;

  constructor(prefix: string = cacheConfig.keyPrefix) {
    this.memory = new MemoryCache();
    this.redis = new RedisCache();
    this.prefix = prefix;
  }

  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    const prefixedKey = this.prefix + key;

    // Try Redis first
    if (this.redis.isAvailable()) {
      const redisValue = await this.redis.get<T>(prefixedKey);
      if (redisValue !== null) {
        return redisValue;
      }
    }

    // Fall back to memory
    return this.memory.get<T>(prefixedKey);
  }

  /**
   * Set a value in cache
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const prefixedKey = this.prefix + key;
    const ttl = ttlSeconds ?? cacheConfig.defaultTTL;

    // Always set in memory for fast access
    await this.memory.set(prefixedKey, value, ttl);

    // Also set in Redis if available
    if (this.redis.isAvailable()) {
      await this.redis.set(prefixedKey, value, ttl);
    }
  }

  /**
   * Delete a value from cache
   */
  async delete(key: string): Promise<void> {
    const prefixedKey = this.prefix + key;

    await this.memory.delete(prefixedKey);

    if (this.redis.isAvailable()) {
      await this.redis.delete(prefixedKey);
    }
  }

  /**
   * Check if a key exists in cache
   */
  async has(key: string): Promise<boolean> {
    const prefixedKey = this.prefix + key;

    // Check memory first (faster)
    if (await this.memory.has(prefixedKey)) {
      return true;
    }

    // Check Redis
    if (this.redis.isAvailable()) {
      return this.redis.has(prefixedKey);
    }

    return false;
  }

  /**
   * Get or set a value (cache-aside pattern)
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds?: number
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Generate value
    const value = await factory();

    // Store in cache
    await this.set(key, value, ttlSeconds);

    return value;
  }

  /**
   * Invalidate cache entries matching a pattern
   */
  async invalidatePattern(pattern: string): Promise<number> {
    const prefixedPattern = this.prefix + pattern;
    let count = 0;

    // Invalidate in memory
    const memoryKeys = await this.memory.keys(prefixedPattern);
    for (const key of memoryKeys) {
      await this.memory.delete(key);
      count++;
    }

    // Invalidate in Redis
    if (this.redis.isAvailable()) {
      const redisKeys = await this.redis.keys(prefixedPattern);
      for (const key of redisKeys) {
        await this.redis.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * Clear all LLM cache entries
   */
  async clear(): Promise<void> {
    await this.memory.clear();
    // Note: We don't clear Redis entirely to avoid affecting other services
    // Use invalidatePattern('*') if needed
  }

  /**
   * Get cache statistics
   */
  getStats(): { memorySize: number; redisAvailable: boolean } {
    return {
      memorySize: this.memory.size(),
      redisAvailable: this.redis.isAvailable(),
    };
  }
}

// ============================================================================
// Specialized Cache Helpers
// ============================================================================

/**
 * Cache key generators for different types of data
 */
export const cacheKeys = {
  /**
   * Key for location validation results
   */
  locationValidation(city: string): string {
    return `locations:${city.toLowerCase().replace(/\s+/g, '_')}`;
  },

  /**
   * Key for itinerary structure (based on params hash)
   */
  itineraryStructure(params: { city: string; days: number; interests?: string[] }): string {
    const hash = simpleHash(JSON.stringify(params));
    return `itinerary:${hash}`;
  },

  /**
   * Key for Claude validation patterns
   */
  validationPattern(city: string, tier: string): string {
    return `validation:${city.toLowerCase()}:${tier}`;
  },

  /**
   * Key for verified spots
   */
  verifiedSpots(city: string): string {
    return `spots:${city.toLowerCase().replace(/\s+/g, '_')}`;
  },
};

/**
 * Simple string hash function
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

// Singleton instance
let globalCache: LLMCache | null = null;

/**
 * Get the global LLM cache instance
 */
export function getLLMCache(): LLMCache {
  if (!globalCache) {
    globalCache = new LLMCache();
  }
  return globalCache;
}
