/**
 * CSRF protection middleware using double-submit cookie pattern
 * 
 * This implementation uses the double-submit cookie pattern:
 * 1. Server sets a CSRF token in a cookie (HttpOnly is NOT set, so JS can read it)
 * 2. Client reads the token from the cookie and sends it in a header (X-CSRF-Token)
 * 3. Server compares the cookie token with the header token
 * 
 * This is simpler than synchronizer token pattern and works well for SPAs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateSecureToken } from '@/lib/crypto';

const CSRF_COOKIE_NAME = 'csrf-token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_TOKEN_LENGTH = 32;

/**
 * Generate and set CSRF token cookie
 */
export function setCsrfToken(response: NextResponse): NextResponse {
  const token = generateSecureToken(CSRF_TOKEN_LENGTH);
  
  response.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // Must be readable by JavaScript for double-submit pattern
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24, // 24 hours
  });
  
  return response;
}

/**
 * Verify CSRF token from request
 */
export function verifyCsrfToken(request: NextRequest): boolean {
  // Skip CSRF check for GET, HEAD, OPTIONS requests
  const method = request.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return true;
  }

  // Get token from cookie
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  
  // Get token from header
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  
  // Both must be present and match
  if (!cookieToken || !headerToken) {
    return false;
  }
  
  return cookieToken === headerToken;
}

/**
 * CSRF protection middleware
 * Wraps a route handler to add CSRF protection
 */
export function withCsrfProtection<T extends (...args: any[]) => Promise<NextResponse>>(
  handler: T
): T {
  return (async (...args: Parameters<T>) => {
    const request = args[0] as NextRequest;
    
    // Verify CSRF token
    if (!verifyCsrfToken(request)) {
      return NextResponse.json(
        {
          error: 'CSRF token validation failed',
          message: 'Invalid or missing CSRF token. Please refresh the page and try again.',
        },
        { status: 403 }
      );
    }
    
    // Execute handler
    const response = await handler(...args);
    
    // Ensure CSRF token is set in response (for new sessions)
    if (!request.cookies.get(CSRF_COOKIE_NAME)) {
      return setCsrfToken(response);
    }
    
    return response;
  }) as T;
}

/**
 * Get CSRF token for client-side use
 * This endpoint returns the CSRF token from the cookie
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  
  if (!token) {
    // Generate new token
    const newToken = generateSecureToken(CSRF_TOKEN_LENGTH);
    const response = NextResponse.json({ token: newToken });
    return setCsrfToken(response);
  }
  
  return NextResponse.json({ token });
}


