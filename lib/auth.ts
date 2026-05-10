/**
 * Authentication utilities
 * Uses JWT-based session management with HttpOnly cookies
 */

import { NextRequest } from 'next/server';
import { getSession as getSessionFromCookies, refreshSession } from '@/server/auth/session';

/**
 * Session data structure
 */
export interface Session {
  userId: string;
  organizationId: string;
  email?: string;
  name?: string;
}

/**
 * Get user session from request cookies
 * Attempts to refresh session if expired
 *
 * @param request - Next.js request object
 * @returns Session object or null if not authenticated
 */
export async function getSession(_request?: NextRequest): Promise<Session | null> {
  let session = await getSessionFromCookies();

  // If session expired, try to refresh
  if (!session) {
    const newToken = await refreshSession();
    if (newToken) {
      session = await getSessionFromCookies();
    }
  }

  return session;
}

/**
 * Require authentication - throws if user is not authenticated
 *
 * @param request - Next.js request object (optional, for compatibility)
 * @returns Session object
 * @throws Error if not authenticated
 */
export async function requireAuth(request?: NextRequest): Promise<Session> {
  const session = await getSession(request);

  if (!session) {
    throw new Error('Unauthorized: Authentication required');
  }

  return session;
}

