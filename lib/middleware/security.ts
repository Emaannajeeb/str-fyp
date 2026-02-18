/**
 * Security middleware utilities
 * Combines rate limiting, CSRF protection, and validation
 */

import { NextRequest, NextResponse } from 'next/server';
import { rateLimiters, rateLimit } from './rate-limit';
import { withCsrfProtection } from './csrf';
import type { Session } from '@/lib/auth';

type RouteHandler = (
  request: NextRequest,
  session?: Session
) => Promise<NextResponse>;

interface SecurityOptions {
  rateLimit?: 'strict' | 'standard' | 'auth' | 'api' | RateLimitOptions;
  csrf?: boolean;
  requireAuth?: boolean;
}

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

/**
 * Apply security middleware to a route handler
 */
export function withSecurity(
  handler: RouteHandler,
  options: SecurityOptions = {}
): RouteHandler {
  const { rateLimit: rateLimitOption = 'standard', csrf = true, requireAuth = false } = options;

  let securedHandler: RouteHandler = handler;

  // Apply rate limiting
  if (rateLimitOption) {
    if (typeof rateLimitOption === 'string') {
      const limiter = rateLimiters[rateLimitOption];
      securedHandler = (request: NextRequest, session?: Session) =>
        limiter(request, () => securedHandler(request, session));
    } else {
      const limiter = rateLimit(rateLimitOption);
      securedHandler = (request: NextRequest, session?: Session) =>
        limiter(request, () => securedHandler(request, session));
    }
  }

  // Apply CSRF protection for POST/PUT/PATCH/DELETE
  if (csrf) {
    securedHandler = withCsrfProtection(securedHandler);
  }

  return securedHandler;
}


