/**
 * Session management with JWT
 * Uses HttpOnly cookies for secure session storage
 */

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { db } from '../db';
import { env } from '@/lib/env';
import type { Session } from '@/lib/auth';

const SESSION_COOKIE_NAME = 'session_token';
const SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours in seconds
const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

// Get JWT secret key
function getJWTSecret(): Uint8Array {
  const secret = env.JWT_SECRET;
  return new TextEncoder().encode(secret);
}

/**
 * Create a session for a user
 * @param userId - User ID
 * @param organizationId - Organization ID
 * @returns Session token and refresh token
 */
export async function createSession(
  userId: string,
  organizationId: string
): Promise<{ sessionToken: string; refreshToken: string }> {
  // Get user details for session
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Verify user has access to organization
  const userRole = await db.userRole.findFirst({
    where: {
      userId,
      organizationId,
    },
  });

  if (!userRole) {
    throw new Error('User does not have access to this organization');
  }

  const secret = getJWTSecret();
  const now = Math.floor(Date.now() / 1000);

  // Create session token (short-lived)
  const sessionToken = await new SignJWT({
    userId,
    organizationId,
    email: user.email,
    name: user.name,
    type: 'session',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_MAX_AGE)
    .setSubject(userId)
    .sign(secret);

  // Create refresh token (long-lived)
  const refreshToken = await new SignJWT({
    userId,
    organizationId,
    type: 'refresh',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + REFRESH_MAX_AGE)
    .setSubject(userId)
    .sign(secret);

  // Set cookies
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });

  cookieStore.set(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: REFRESH_MAX_AGE,
    path: '/',
  });

  return { sessionToken, refreshToken };
}

/**
 * Get session from cookies
 * @returns Session object or null if not authenticated
 */
export async function getSession(): Promise<Session | null> {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionToken) {
      return null;
    }

    const secret = getJWTSecret();
    const { payload } = await jwtVerify(sessionToken, secret);

    if (payload.type !== 'session') {
      return null;
    }

    return {
      userId: payload.userId as string,
      organizationId: payload.organizationId as string,
      email: payload.email as string | undefined,
      name: payload.name as string | undefined,
    };
  } catch (error) {
    // Token invalid or expired
    return null;
  }
}

/**
 * Refresh session using refresh token
 * @returns New session token or null if refresh failed
 */
export async function refreshSession(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get(REFRESH_COOKIE_NAME)?.value;

    if (!refreshToken) {
      return null;
    }

    const secret = getJWTSecret();
    const { payload } = await jwtVerify(refreshToken, secret);

    if (payload.type !== 'refresh') {
      return null;
    }

    const userId = payload.userId as string;
    const organizationId = payload.organizationId as string;

    // Get user details
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    if (!user) {
      return null;
    }

    // Create new session token
    const now = Math.floor(Date.now() / 1000);
    const sessionToken = await new SignJWT({
      userId,
      organizationId,
      email: user.email,
      name: user.name,
      type: 'session',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + SESSION_MAX_AGE)
      .setSubject(userId)
      .sign(secret);

    // Update session cookie
    cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE,
      path: '/',
    });

    return sessionToken;
  } catch (error) {
    return null;
  }
}

/**
 * Destroy session (logout)
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  cookieStore.delete(REFRESH_COOKIE_NAME);
}

