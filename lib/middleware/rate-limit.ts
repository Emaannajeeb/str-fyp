/**
 * Rate limiting middleware
 * Supports in-memory storage (dev) and Upstash Redis (production)
 */

import { NextRequest, NextResponse } from 'next/server';

interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (request: NextRequest) => string; // Custom key generator
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
}

interface RateLimitStore {
  get: (key: string) => Promise<number | null>;
  set: (key: string, value: number, ttl: number) => Promise<void>;
  increment: (key: string, ttl: number) => Promise<number>;
}

/**
 * In-memory rate limit store (for development)
 */
class MemoryRateLimitStore implements RateLimitStore {
  private store: Map<string, { count: number; resetTime: number }> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.store.entries()) {
        if (value.resetTime < now) {
          this.store.delete(key);
        }
      }
    }, 60000);
  }

  async get(key: string): Promise<number | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    
    if (entry.resetTime < Date.now()) {
      this.store.delete(key);
      return null;
    }
    
    return entry.count;
  }

  async set(key: string, value: number, ttl: number): Promise<void> {
    this.store.set(key, {
      count: value,
      resetTime: Date.now() + ttl,
    });
  }

  async increment(key: string, ttl: number): Promise<number> {
    const entry = this.store.get(key);
    const now = Date.now();
    
    if (!entry || entry.resetTime < now) {
      // New entry or expired
      await this.set(key, 1, ttl);
      return 1;
    }
    
    const newCount = entry.count + 1;
    await this.set(key, newCount, ttl);
    return newCount;
  }
}

/**
 * Upstash Redis rate limit store (for production)
 */
class UpstashRateLimitStore implements RateLimitStore {
  private redisUrl: string;
  private redisToken: string;

  constructor() {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    
    if (!url || !token) {
      throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set for Upstash rate limiting');
    }
    
    this.redisUrl = url;
    this.redisToken = token;
  }

  private async redisRequest(command: string, args: string[]): Promise<any> {
    const response = await fetch(`${this.redisUrl}/${command}/${args.join('/')}`, {
      headers: {
        Authorization: `Bearer ${this.redisToken}`,
      },
    });
    
    if (!response.ok) {
      throw new Error(`Upstash Redis request failed: ${response.statusText}`);
    }
    
    return response.json();
  }

  async get(key: string): Promise<number | null> {
    const result = await this.redisRequest('get', [key]);
    return result.result ? parseInt(result.result, 10) : null;
  }

  async set(key: string, value: number, ttl: number): Promise<void> {
    const ttlSeconds = Math.ceil(ttl / 1000);
    await this.redisRequest('setex', [key, ttlSeconds.toString(), value.toString()]);
  }

  async increment(key: string, ttl: number): Promise<number> {
    const ttlSeconds = Math.ceil(ttl / 1000);
    const result = await this.redisRequest('eval', [
      `
      local current = redis.call('incr', KEYS[1])
      if current == 1 then
        redis.call('expire', KEYS[1], ARGV[1])
      end
      return current
      `,
      '1',
      key,
      ttlSeconds.toString(),
    ]);
    
    return parseInt(result.result, 10);
  }
}

// Create store instance
let rateLimitStore: RateLimitStore;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  rateLimitStore = new UpstashRateLimitStore();
} else {
  rateLimitStore = new MemoryRateLimitStore();
}

/**
 * Default key generator: uses IP address + user ID if available
 */
function defaultKeyGenerator(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
  
  // Try to get user ID from session if available
  const userId = request.headers.get('x-user-id') || 'anonymous';
  
  return `rate-limit:${ip}:${userId}`;
}

/**
 * Rate limit middleware factory
 */
export function rateLimit(options: RateLimitOptions) {
  const {
    windowMs,
    maxRequests,
    keyGenerator = defaultKeyGenerator,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = options;

  return async (request: NextRequest, handler: (req: NextRequest) => Promise<NextResponse>) => {
    const key = keyGenerator(request);
    const count = await rateLimitStore.increment(key, windowMs);
    
    // Check if limit exceeded
    if (count > maxRequests) {
      const resetTime = Date.now() + windowMs;
      return NextResponse.json(
        {
          error: 'Too many requests',
          message: `Rate limit exceeded. Maximum ${maxRequests} requests per ${windowMs / 1000} seconds.`,
          retryAfter: Math.ceil((resetTime - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: {
            'Retry-After': Math.ceil((resetTime - Date.now()) / 1000).toString(),
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': Math.max(0, maxRequests - count).toString(),
            'X-RateLimit-Reset': new Date(resetTime).toISOString(),
          },
        }
      );
    }

    // Execute handler
    const response = await handler(request);
    
    // Add rate limit headers
    const resetTime = Date.now() + windowMs;
    response.headers.set('X-RateLimit-Limit', maxRequests.toString());
    response.headers.set('X-RateLimit-Remaining', Math.max(0, maxRequests - count).toString());
    response.headers.set('X-RateLimit-Reset', new Date(resetTime).toISOString());
    
    return response;
  };
}

/**
 * Pre-configured rate limiters for common use cases
 */
export const rateLimiters = {
  // Strict: 5 requests per minute
  strict: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5,
  }),
  
  // Standard: 20 requests per minute
  standard: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20,
  }),
  
  // Auth: 5 requests per 15 minutes (for login attempts)
  auth: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
  }),
  
  // API: 100 requests per minute
  api: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
  }),
};


